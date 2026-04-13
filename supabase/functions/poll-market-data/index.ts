import { adminClient, handleOptions, insertFreshAlerts, json, polygon, skipOutsideEtWindow, upsertSystemState } from "../_shared/http.ts";
import { buildRadarRow, isBlockedTicker, type Bar, type RadarRow } from "../_shared/market.ts";
import { primaryThemeFromRegistry, type ThemeRegistryRow } from "../_shared/themes.ts";

const DISCOVERY_SC_LIMIT = 28;
const DISCOVERY_ML_LIMIT = 28;
const HYDRATE_LIMIT = 44;
const OFFERING_STATUS_DAYS = 10;
const MARKET_TAPE = [
  { ticker: "I:SPX", label: "SPX" },
  { ticker: "I:NDX", label: "NDX" },
  { ticker: "I:RUT", label: "RUT" },
  { ticker: "I:VIX", label: "VIX" },
  { ticker: "C:XAUUSD", label: "Gold" },
  { ticker: "C:XAGUSD", label: "Silver" },
] as const;

type Snapshot = {
  ticker: string;
  name?: string;
  day?: { c?: number; h?: number; l?: number; v?: number };
  prevDay?: { c?: number; v?: number };
  lastTrade?: { p?: number };
  min?: { c?: number; v?: number };
};

type FilingFact = {
  ticker: string;
  filing_type: string;
  filed_at?: string | null;
  detected_at?: string | null;
  is_active?: boolean | null;
};

type FilingFlags = {
  hasOffering: boolean;
  hasShelf: boolean;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const skip = await skipOutsideEtWindow(req, "last_polygon_poll", 9 * 60 + 25, 16 * 60 + 5, "regular market data window");
    if (skip) return skip;
    const supabase = adminClient();
    const { data: existing, error: existingError } = await supabase
      .from("market_data")
      .select("ticker, category, status, ext_score, theme");
    if (existingError) throw existingError;
    const { data: registry, error: registryError } = await supabase
      .from("theme_registry")
      .select("name, aliases, tickers, active")
      .eq("active", true);
    if (registryError) throw registryError;

    const snapshotResp = await polygon("/v2/snapshot/locale/us/markets/stocks/tickers");
    const snapshots = ((snapshotResp.tickers ?? []) as Snapshot[])
      .filter((row) => row.ticker && !isBlockedTicker(row.ticker));
    const snapshotByTicker = new Map(snapshots.map((row) => [row.ticker, row]));
    const existingByTicker = new Map((existing ?? []).map((row) => [row.ticker, row]));

    const targets = selectTargets(existing ?? [], snapshots);
    const rows: RadarRow[] = [];
    const targetBatch = targets.slice(0, HYDRATE_LIMIT);
    const { data: filings, error: filingsError } = await supabase
      .from("filings")
      .select("ticker, filing_type, filed_at, detected_at, is_active")
      .in("ticker", targetBatch.map((target) => target.ticker))
      .order("detected_at", { ascending: false })
      .limit(Math.max(120, targetBatch.length * 8));
    if (filingsError) throw filingsError;
    const filingFlags = buildFilingFlags(filings ?? []);
    for (let i = 0; i < targetBatch.length; i += 4) {
      const batch = await Promise.all(
        targetBatch.slice(i, i + 4).map(async (target) => {
          const row = await hydrateTarget(target, snapshotByTicker, registry ?? []);
          if (row) applyFilingFlags(row, filingFlags.get(target.ticker));
          return row;
        }),
      );
      rows.push(...batch.filter((row): row is RadarRow => Boolean(row)));
    }

    if (rows.length) {
      const { error } = await supabase.from("market_data").upsert(rows, { onConflict: "ticker" });
      if (error) throw error;
      await insertThresholdAlerts(supabase, rows, existingByTicker);
    }

    await upsertSystemState("market_tape", {
      at: new Date().toISOString(),
      ...(await fetchMarketTape()),
    });

    await upsertSystemState("last_polygon_poll", {
      at: new Date().toISOString(),
      status: "ok",
      tickers: rows.length,
      mode: existing?.length ? "watchlist" : "discovery",
    });
    return json({ ok: true, tickers: rows.length, mode: existing?.length ? "watchlist" : "discovery" });
  } catch (error) {
    await safeState("last_polygon_poll", { at: new Date().toISOString(), status: "error", message: String(error) });
    return json({ ok: false, error: String(error) }, 500);
  }
});

function selectTargets(existing: Array<{ ticker: string; category: "SC" | "ML"; theme?: string | null }>, snapshots: Snapshot[]) {
  if (existing.length) {
    return existing.map((row) => ({ ticker: row.ticker, category: row.category, theme: row.theme, reason: "watchlist" as const }));
  }
  const normalized = snapshots.map((snap) => {
    const price = number(snap.lastTrade?.p) || number(snap.day?.c) || number(snap.min?.c) || number(snap.prevDay?.c);
    const prev = number(snap.prevDay?.c) || price;
    const chg = prev ? ((price - prev) / prev) * 100 : 0;
    const vol = number(snap.day?.v) || number(snap.min?.v);
    const range = snap.day?.h && snap.day?.l ? ((number(snap.day.h) - number(snap.day.l)) / Math.max(price, 0.01)) * 100 : Math.abs(chg);
    return { ticker: snap.ticker, price, chg, vol, range, score: Math.abs(chg) * 1.4 + range * 0.7 + Math.log10(vol + 10) * 2 };
  }).filter((row) => row.price > 0 && row.vol > 0);

  const sc = normalized
    .filter((row) => row.price < 25 && row.vol > 250000)
    .sort((a, b) => b.score - a.score)
    .slice(0, DISCOVERY_SC_LIMIT)
    .map((row) => ({ ticker: row.ticker, category: "SC" as const, reason: "discovered small-cap mover" }));
  const ml = normalized
    .filter((row) => row.price >= 20 && row.vol > 600000)
    .sort((a, b) => b.score - a.score)
    .slice(0, DISCOVERY_ML_LIMIT)
    .map((row) => ({ ticker: row.ticker, category: "ML" as const, reason: "discovered mean-reversion candidate" }));
  return [...sc, ...ml];
}

async function hydrateTarget(
  target: { ticker: string; category: "SC" | "ML"; reason: string; theme?: string | null },
  snapshotByTicker: Map<string, Snapshot>,
  registry: ThemeRegistryRow[],
): Promise<RadarRow | null> {
  const snap = snapshotByTicker.get(target.ticker);
  if (!snap) return null;
  const price = number(snap.lastTrade?.p) || number(snap.day?.c) || number(snap.min?.c) || number(snap.prevDay?.c);
  const prevClose = number(snap.prevDay?.c) || price;
  const volumeToday = number(snap.day?.v) || number(snap.min?.v);
  if (!price || !volumeToday) return null;
  const bars = await dailyBars(target.ticker);
  if (bars.length < 20) return null;
  const registryTheme = primaryThemeFromRegistry(registry, target.ticker, snap.name);
  return buildRadarRow({
    ticker: target.ticker,
    category: target.category,
    name: snap.name,
    price,
    prevClose,
    volumeToday,
    bars,
    reason: target.reason,
    themeRegistry: registry,
    themeOverride: registryTheme !== "Solo / Unclassified" ? registryTheme : target.theme ?? undefined,
  });
}

async function dailyBars(ticker: string): Promise<Bar[]> {
  const to = ymd(new Date());
  const from = ymd(new Date(Date.now() - 260 * 86400000));
  const data = await polygon(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
    adjusted: true,
    sort: "asc",
    limit: 220,
  });
  return (data.results ?? []).map((row: { c: number; v: number }) => ({ c: number(row.c), v: number(row.v) }))
    .filter((row: Bar) => row.c > 0);
}

async function insertThresholdAlerts(
  supabase: ReturnType<typeof adminClient>,
  rows: RadarRow[],
  previous: Map<string, { ticker: string; status: string | null; ext_score: number | null }>,
) {
  const alerts = rows.flatMap((row) => {
    const old = previous.get(row.ticker);
    const oldBucket = extBucket(number(old?.ext_score));
    const newBucket = extBucket(row.ext_score);
    if (newBucket <= oldBucket || newBucket < 2) return [];
    return [{
      ticker: row.ticker,
      theme: row.theme,
      alert_type: "EXTENSION",
      severity: newBucket >= 3 ? "HIGH" : "MEDIUM",
      headline: `${row.ticker} crossed into ${row.status}`,
      detail: `EXT ${row.ext_score} ${row.ext_direction}, change ${row.change_pct.toFixed(1)}%, volume ${row.volume_ratio.toFixed(1)}x avg`,
    }];
  });
  if (!alerts.length) return;
  return await insertFreshAlerts(supabase, alerts, 90);
}

function extBucket(score: number) {
  if (score >= 85) return 3;
  if (score >= 70) return 2;
  if (score >= 50) return 1;
  return 0;
}

function buildFilingFlags(rows: FilingFact[]) {
  const since = Date.now() - OFFERING_STATUS_DAYS * 86400000;
  const out = new Map<string, FilingFlags>();
  for (const row of rows) {
    const flags = out.get(row.ticker) ?? { hasOffering: false, hasShelf: false };
    const stamp = Date.parse(row.filed_at ?? row.detected_at ?? "");
    if (row.filing_type === "424B5" && (!Number.isFinite(stamp) || stamp >= since)) {
      flags.hasOffering = true;
    }
    if (/^(S-3|F-3)$/.test(row.filing_type) && row.is_active !== false) {
      flags.hasShelf = true;
    }
    out.set(row.ticker, flags);
  }
  return out;
}

function applyFilingFlags(row: RadarRow, flags?: FilingFlags) {
  if (!flags || row.category !== "SC") return row;
  if (flags.hasOffering) {
    row.status = "OFFERING";
    return row;
  }
  if (flags.hasShelf && (row.status === "MONITOR" || row.status === "RUNNING")) {
    row.status = "SHELF ACTIVE";
  }
  return row;
}

async function fetchMarketTape() {
  const data = await polygon("/v3/snapshot", {
    "ticker.any_of": MARKET_TAPE.map((item) => item.ticker).join(","),
    limit: MARKET_TAPE.length,
  });
  const results = (data.results ?? []) as Record<string, unknown>[];
  const rows = new Map(results.map((row) => [String(row.ticker ?? ""), row]));
  const items = MARKET_TAPE.map((item) => marketTapeItem(item.label, rows.get(item.ticker), item.ticker)).filter(Boolean);
  const unavailable = MARKET_TAPE.filter((item) => String(rows.get(item.ticker)?.error ?? "") === "NOT_ENTITLED")
    .map((item) => item.label);
  return {
    status: items.length ? (unavailable.length ? "partial" : "ok") : unavailable.length ? "unavailable" : "empty",
    items,
    unavailable,
  };
}

function marketTapeItem(label: string, row: Record<string, unknown> | undefined, ticker: string) {
  if (!row) return null;
  const price = marketTapePrice(row);
  const changePct = marketTapeChangePct(row);
  if (!price || !Number.isFinite(changePct)) return null;
  return {
    ticker,
    label,
    price,
    change_pct: changePct,
  };
}

function marketTapePrice(row: Record<string, unknown>) {
  const bid = number((row.last_quote as Record<string, unknown> | undefined)?.bid_price);
  const ask = number((row.last_quote as Record<string, unknown> | undefined)?.ask_price);
  if (bid && ask) return (bid + ask) / 2;
  return number(row.value) ||
    number((row.last_trade as Record<string, unknown> | undefined)?.price) ||
    number((row.session as Record<string, unknown> | undefined)?.close) ||
    number(row.fmv);
}

function marketTapeChangePct(row: Record<string, unknown>) {
  const session = row.session as Record<string, unknown> | undefined;
  const direct = number(session?.change_percent);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const change = number(session?.change);
  const prevClose = number(session?.previous_close);
  return prevClose ? (change / prevClose) * 100 : direct;
}

function number(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function safeState(key: string, value: Record<string, unknown>) {
  try {
    await upsertSystemState(key, value);
  } catch {
    // Avoid hiding the original function error when health logging fails.
  }
}
