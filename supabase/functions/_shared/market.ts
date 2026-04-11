import { primaryTheme } from "./themes.ts";

export type Bar = { c: number; v: number };

export type RadarRow = {
  ticker: string;
  category: "SC" | "ML";
  price: number;
  change_pct: number;
  ext_score: number;
  ext_direction: "UP" | "DOWN";
  bb_position: number;
  bb_consec: number;
  ema8_dist: number;
  volume_today: number;
  volume_avg: number;
  volume_ratio: number;
  volume_trend: "LOW" | "STEADY" | "RISING" | "EXPONENTIAL";
  ma_8ema?: number;
  ma_20sma?: number;
  ma_50sma?: number;
  ma_100sma?: number;
  ma_150sma?: number;
  ma_200sma?: number;
  curve_type: "LINEAR" | "ACCEL" | "PARABOLIC";
  status: string;
  theme: string;
  reason?: string;
  news?: string;
};

export const BLOCKED_TICKERS = new Set(
  "SPY QQQ IWM DIA TQQQ SQQQ UPRO SPXU SOXL SOXS LABU LABD TNA TZA FAS FAZ SPXL SPXS TECL TECS WEBL WEBS BULZ BERZ NAIL DRN DRV ERX ERY BOIL KOLD UVXY SVXY VXX UVIX BITX BITI TSLL TSLS NVDL NVDQ AAPU AAPD AMZU AMZD GOOX GGLS MSFU MSFD CONL CONI MSTU MSTZ YINN YANG".split(
    " ",
  ),
);

export function isBlockedTicker(ticker: string): boolean {
  return BLOCKED_TICKERS.has(ticker) || /(\.WS|W$|WS$|U$|R$)/.test(ticker);
}

export function avg(values: number[]): number {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

export function sma(values: number[], lookback: number): number {
  return avg(values.slice(-lookback));
}

export function stdev(values: number[], lookback: number): number {
  const sample = values.slice(-lookback);
  const mean = avg(sample);
  return Math.sqrt(avg(sample.map((value) => (value - mean) ** 2))) || 0;
}

export function ema(values: number[], lookback: number): number {
  if (!values.length) return 0;
  const k = 2 / (lookback + 1);
  return values.slice(1).reduce((prev, value) => value * k + prev * (1 - k), values[0]);
}

export function pctDiff(value: number, base: number): number {
  return base ? ((value - base) / base) * 100 : 0;
}

export function classifyVolume(ratio: number): RadarRow["volume_trend"] {
  if (ratio > 4) return "EXPONENTIAL";
  if (ratio > 2) return "RISING";
  if (ratio > 0.8) return "STEADY";
  return "LOW";
}

export function classifyCurve(ema8Dist: number): RadarRow["curve_type"] {
  const dist = Math.abs(ema8Dist);
  if (dist > 12) return "PARABOLIC";
  if (dist > 5) return "ACCEL";
  return "LINEAR";
}

export function extensionScore(zScore: number, ema8Dist: number, outsideBand: boolean): number {
  const score = 50 + Math.min(42, Math.abs(zScore) * 10.5) + Math.min(8, Math.abs(ema8Dist) * 0.35) +
    (outsideBand ? 3 : 0);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function bbLabel(price: number, mean: number, sd: number): { label: string; position: number; outside: boolean } {
  if (!sd) return { label: "MID", position: 0, outside: false };
  const upper = mean + 2 * sd;
  const lower = mean - 2 * sd;
  const position = ((price - mean) / (2 * sd)) * 100;
  if (price > upper) return { label: "OUT UP", position, outside: true };
  if (price < lower) return { label: "OUT DN", position, outside: true };
  if (price > upper - 0.25 * sd) return { label: "TCH UP", position, outside: false };
  if (price < lower + 0.25 * sd) return { label: "TCH DN", position, outside: false };
  return { label: "MID", position, outside: false };
}

export function consecutiveOutsideBars(closes: number[], direction: "UP" | "DOWN"): number {
  let count = 0;
  for (let i = closes.length - 1; i >= 19; i--) {
    const window = closes.slice(0, i + 1);
    const mean = sma(window, 20);
    const sd = stdev(window, 20);
    const price = closes[i];
    if (!sd) break;
    const outside = direction === "UP" ? price > mean + 2 * sd : price < mean - 2 * sd;
    if (!outside) break;
    count++;
  }
  return count;
}

export function statusFor(row: Pick<RadarRow, "category" | "ext_score" | "ext_direction" | "change_pct">): string {
  const arrow = row.ext_direction === "DOWN" ? " DN" : " UP";
  if (row.ext_score >= 90) return `EXTREME${arrow}`;
  if (row.ext_score >= 76) return `EXTENDED${arrow}`;
  if (row.category === "SC" && row.change_pct > 10 && row.ext_score >= 66) return "RUNNING";
  if (row.ext_score <= 58 && row.change_pct < 0) return "FADING";
  return "MONITOR";
}

export function buildRadarRow(input: {
  ticker: string;
  category: "SC" | "ML";
  name?: string;
  price: number;
  prevClose: number;
  volumeToday: number;
  bars: Bar[];
  reason?: string;
  news?: string;
}): RadarRow {
  const closes = input.bars.map((bar) => bar.c).filter(Number.isFinite);
  const vols = input.bars.map((bar) => bar.v).filter(Number.isFinite);
  if (closes.length) closes[closes.length - 1] = input.price;
  const mean20 = sma(closes, 20) || input.prevClose || input.price;
  const sd20 = stdev(closes, 20);
  const bb = bbLabel(input.price, mean20, sd20);
  const zScore = sd20 ? (input.price - mean20) / sd20 : 0;
  const ma8 = ema(closes, 8);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma100 = sma(closes, 100);
  const ma150 = sma(closes, 150);
  const ma200 = sma(closes, 200);
  const ema8Dist = pctDiff(input.price, ma8);
  const changePct = pctDiff(input.price, input.prevClose || input.price);
  const volumeAvg = Math.round(avg(vols.slice(-20)));
  const volumeRatio = volumeAvg ? input.volumeToday / volumeAvg : 0;
  const direction = zScore < 0 ? "DOWN" : "UP";
  const row: RadarRow = {
    ticker: input.ticker,
    category: input.category,
    price: input.price,
    change_pct: changePct,
    ext_score: extensionScore(zScore, ema8Dist, bb.outside),
    ext_direction: direction,
    bb_position: bb.position,
    bb_consec: consecutiveOutsideBars(closes, direction),
    ema8_dist: ema8Dist,
    volume_today: input.volumeToday,
    volume_avg: volumeAvg,
    volume_ratio: volumeRatio,
    volume_trend: classifyVolume(volumeRatio),
    ma_8ema: ma8 || undefined,
    ma_20sma: ma20 || undefined,
    ma_50sma: ma50 || undefined,
    ma_100sma: ma100 || undefined,
    ma_150sma: ma150 || undefined,
    ma_200sma: ma200 || undefined,
    curve_type: classifyCurve(ema8Dist),
    status: "MONITOR",
    theme: primaryTheme(input.ticker, input.name, input.news),
    reason: input.reason,
    news: input.news,
  };
  row.status = statusFor(row);
  return row;
}
