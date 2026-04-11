import { adminClient, handleOptions, json, polygon, upsertSystemState } from "../_shared/http.ts";
import { buildRadarRow, isBlockedTicker, type Bar, type RadarRow } from "../_shared/market.ts";

const DISCOVERY_SC_LIMIT = 28;
const DISCOVERY_ML_LIMIT = 28;
const HYDRATE_LIMIT = 44;

type Snapshot = {
  ticker: string;
  name?: string;
  day?: { c?: number; h?: number; l?: number; v?: number };
  prevDay?: { c?: number; v?: number };
  lastTrade?: { p?: number };
  min?: { c?: number; v?: number };
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = adminClient();
    const { data: existing, error: existingError } = await supabase
      .from("market_data")
      .select("ticker, category, status, ext_score");
    if (existingError) throw existingError;

    const snapshotResp = await polygon("/v2/snapshot/locale/us/markets/stocks/tickers");
    const snapshots = ((snapshotResp.tickers ?? []) as Snapshot[])
      .filter((row) => row.ticker && !isBlockedTicker(row.ticker));
    const snapshotByTicker = new Map(snapshots.map((row) => [row.ticker, row]));
    const existingByTicker = new Map((existing ?? []).map((row) => [row.ticker, row]));

    const targets = selectTargets(existing ?? [], snapshots);
    const rows: RadarRow[] = [];
    const targetBatch = targets.slice(0, HYDRATE_LIMIT);
    for (let i = 0; i < targetBatch.length; i += 4) {
      const batch = await Promise.all(targetBatch.slice(i, i + 4).map((target) => hydrateTarget(target, snapshotByTicker)));
      rows.push(...batch.filter((row): row is RadarRow => Boolean(row)));
    }

    if (rows.length) {
      const { error } = await supabase.from("market_data").upsert(rows, { onConflict: "ticker" });
      if (error) throw error;
      await insertThresholdAlerts(supabase, rows, existingByTicker);
    }

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

function selectTargets(existing: Array<{ ticker: string; category: "SC" | "ML" }>, snapshots: Snapshot[]) {
  if (existing.length) {
    return existing.map((row) => ({ ticker: row.ticker, category: row.category, reason: "watchlist" as const }));
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
  target: { ticker: string; category: "SC" | "ML"; reason: string },
  snapshotByTicker: Map<string, Snapshot>,
): Promise<RadarRow | null> {
  const snap = snapshotByTicker.get(target.ticker);
  if (!snap) return null;
  const price = number(snap.lastTrade?.p) || number(snap.day?.c) || number(snap.min?.c) || number(snap.prevDay?.c);
  const prevClose = number(snap.prevDay?.c) || price;
  const volumeToday = number(snap.day?.v) || number(snap.min?.v);
  if (!price || !volumeToday) return null;
  const bars = await dailyBars(target.ticker);
  if (bars.length < 20) return null;
  return buildRadarRow({
    ticker: target.ticker,
    category: target.category,
    name: snap.name,
    price,
    prevClose,
    volumeToday,
    bars,
    reason: target.reason,
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
  const { error } = await supabase.from("alerts").insert(alerts);
  if (error) throw error;
}

function extBucket(score: number) {
  if (score >= 85) return 3;
  if (score >= 70) return 2;
  if (score >= 50) return 1;
  return 0;
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
