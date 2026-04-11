import { adminClient, handleOptions, insertFreshAlerts, json, polygon, skipOutsideEtWindow, upsertSystemState } from "../_shared/http.ts";
import { isBlockedTicker } from "../_shared/market.ts";

type Snapshot = {
  ticker: string;
  day?: { c?: number; v?: number };
  prevDay?: { c?: number; v?: number };
  lastTrade?: { p?: number };
  min?: { c?: number; v?: number };
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const skip = await skipOutsideEtWindow(req, "last_scanner_run", 9 * 60 + 25, 16 * 60 + 5, "scanner window");
    if (skip) return skip;
    const supabase = adminClient();
    const { data: watchlist, error: watchError } = await supabase.from("market_data").select("ticker, theme");
    if (watchError) throw watchError;
    const watch = new Map((watchlist ?? []).map((row) => [row.ticker, row.theme]));

    const data = await polygon("/v2/snapshot/locale/us/markets/stocks/tickers");
    const hits = ((data.tickers ?? []) as Snapshot[])
      .filter((row) => row.ticker && !isBlockedTicker(row.ticker))
      .map(normalize)
      .filter((row) => row.price > 0 && row.volume_ratio > 0 && (Math.abs(row.change_pct) >= 10 || row.volume_ratio >= 3))
      .sort((a, b) => Math.abs(b.change_pct) + b.volume_ratio - (Math.abs(a.change_pct) + a.volume_ratio))
      .slice(0, 80);

    if (hits.length) {
      const { error } = await supabase.from("scanner_hits").upsert(hits, { onConflict: "ticker" });
      if (error) throw error;
    }
    const staleCutoff = new Date(Date.now() - 30 * 60000).toISOString();
    const { error: cleanupError } = await supabase.from("scanner_hits").delete().lt("detected_at", staleCutoff);
    if (cleanupError) throw cleanupError;

    const alerts = hits
      .filter((hit) => watch.has(hit.ticker))
      .slice(0, 20)
      .map((hit) => ({
        ticker: hit.ticker,
        theme: watch.get(hit.ticker),
        alert_type: "SQUEEZE",
        severity: Math.abs(hit.change_pct) > 20 || hit.volume_ratio > 8 ? "HIGH" : "MEDIUM",
        headline: `${hit.ticker} scanner hit: ${hit.scan_type}`,
        detail: `${hit.change_pct.toFixed(1)}%, volume ${hit.volume_ratio.toFixed(1)}x, cap bucket ${hit.market_cap}`,
      }));
    const alertsInserted = await insertFreshAlerts(supabase, alerts, 45);

    await upsertSystemState("last_scanner_run", {
      at: new Date().toISOString(),
      status: "ok",
      hits: hits.length,
      alerts: alertsInserted,
    });
    return json({ ok: true, hits: hits.length, alerts: alertsInserted });
  } catch (error) {
    await safeState("last_scanner_run", { at: new Date().toISOString(), status: "error", message: String(error) });
    return json({ ok: false, error: String(error) }, 500);
  }
});

function normalize(row: Snapshot) {
  const price = number(row.lastTrade?.p) || number(row.day?.c) || number(row.min?.c) || number(row.prevDay?.c);
  const prevClose = number(row.prevDay?.c) || price;
  const change_pct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  const volumeToday = number(row.day?.v) || number(row.min?.v);
  const prevVol = number(row.prevDay?.v);
  const volume_ratio = prevVol ? volumeToday / prevVol : 0;
  return {
    ticker: row.ticker,
    scan_type: classify(change_pct, volume_ratio),
    price,
    change_pct,
    volume_ratio,
    market_cap: price >= 75 ? "LARGE" : price >= 25 ? "MID" : price >= 5 ? "SMALL" : "MICRO",
    detected_at: new Date().toISOString(),
  };
}

function classify(changePct: number, volumeRatio: number) {
  if (changePct >= 10 && volumeRatio >= 3) return "GAP_UP_VOLUME_SPIKE";
  if (changePct >= 10) return "GAP_UP";
  if (changePct <= -10 && volumeRatio >= 3) return "GAP_DOWN_VOLUME_SPIKE";
  if (changePct <= -10) return "GAP_DOWN";
  return "VOLUME_SPIKE";
}

function number(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function safeState(key: string, value: Record<string, unknown>) {
  try {
    await upsertSystemState(key, value);
  } catch {
    // Avoid hiding the original function error when health logging fails.
  }
}
