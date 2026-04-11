import { adminClient, handleOptions, json, upsertSystemState } from "../_shared/http.ts";
import { avg } from "../_shared/market.ts";

type MarketRow = {
  ticker: string;
  theme: string | null;
  price: number | null;
  change_pct: number | null;
  ext_score: number | null;
  ext_direction: string | null;
  bb_position: number | null;
  status: string | null;
  updated_at: string | null;
};

const STAGE_THRESHOLDS = {
  dormantHealth: 20,
  emergingHealth: 40,
  buildingHealth: 60,
  acceleratingHealth: 80,
  parabolicHealth: 90,
  crackingDrop: 15,
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = adminClient();
    const { data: rows, error } = await supabase
      .from("market_data")
      .select("ticker, theme, price, change_pct, ext_score, ext_direction, bb_position, status, updated_at")
      .not("theme", "is", null);
    if (error) throw error;

    const { data: oldThemes, error: themeError } = await supabase
      .from("themes")
      .select("name, stage, health");
    if (themeError) throw themeError;

    const oldByName = new Map((oldThemes ?? []).map((theme) => [theme.name, theme]));
    const grouped = groupByTheme((rows ?? []) as MarketRow[]);
    const upserts = [];
    const alerts = [];

    for (const [name, members] of grouped) {
      if (name === "Solo / Unclassified" && members.length < 3) continue;
      const health = calcHealth(members);
      const velocity = avg(members.map((row) => number(row.change_pct)));
      const extended = members.filter((row) => number(row.ext_score) >= 70).length;
      const stage = classifyStage({
        health,
        velocity,
        breadthRatio: members.length ? extended / members.length : 0,
        previousHealth: number(oldByName.get(name)?.health),
      });
      const previous = oldByName.get(name);
      const constituents = members
        .sort((a, b) => number(b.ext_score) - number(a.ext_score))
        .map((row) => ({
          ticker: row.ticker,
          chg_pct: number(row.change_pct),
          ext: number(row.ext_score),
          dir: row.ext_direction,
          bb: bbLabel(number(row.bb_position)),
          status: row.status,
        }));
      upserts.push({
        name,
        stage,
        prev_stage: previous?.stage ?? null,
        health,
        velocity,
        breadth: `${extended}/${members.length}`,
        constituents,
        key_event: keyEvent(members),
        mov_1d: velocity,
        mov_3d: null,
      });
      if (previous?.stage && previous.stage !== stage) {
        alerts.push({
          theme: name,
          alert_type: "THEME_STAGE",
          severity: stage === "PARABOLIC" || stage === "CRACKING" ? "HIGH" : "MEDIUM",
          headline: `${name} theme moved ${previous.stage} -> ${stage}`,
          detail: `${extended}/${members.length} constituents extended, health ${health}, 1D ${velocity.toFixed(1)}%`,
        });
      }
    }

    if (upserts.length) {
      const { error: upsertError } = await supabase.from("themes").upsert(upserts, { onConflict: "name" });
      if (upsertError) throw upsertError;
    }
    if (alerts.length) {
      const { error: alertError } = await supabase.from("alerts").insert(alerts);
      if (alertError) throw alertError;
    }

    await upsertSystemState("last_theme_engine", {
      at: new Date().toISOString(),
      status: "ok",
      themes: upserts.length,
      alerts: alerts.length,
    });
    return json({ ok: true, themes: upserts.length, alerts: alerts.length });
  } catch (error) {
    await safeState("last_theme_engine", { at: new Date().toISOString(), status: "error", message: String(error) });
    return json({ ok: false, error: String(error) }, 500);
  }
});

function groupByTheme(rows: MarketRow[]): Map<string, MarketRow[]> {
  const grouped = new Map<string, MarketRow[]>();
  for (const row of rows) {
    const themes = String(row.theme || "Solo / Unclassified").split("+").map((theme) => theme.trim()).filter(Boolean);
    for (const theme of themes) {
      const list = grouped.get(theme) ?? [];
      list.push(row);
      grouped.set(theme, list);
    }
  }
  return grouped;
}

function calcHealth(members: MarketRow[]): number {
  const breadth = members.filter((row) => number(row.ext_score) >= 70).length / Math.max(1, members.length);
  const avgExt = avg(members.map((row) => number(row.ext_score)));
  const velocity = Math.abs(avg(members.map((row) => number(row.change_pct))));
  const outside = members.filter((row) => Math.abs(number(row.bb_position)) > 100).length / Math.max(1, members.length);
  return Math.max(0, Math.min(100, Math.round(breadth * 35 + avgExt * 0.45 + Math.min(20, velocity * 2) + outside * 15)));
}

function classifyStage(input: { health: number; velocity: number; breadthRatio: number; previousHealth: number }) {
  const velocityAbs = Math.abs(input.velocity);
  if (input.previousHealth && input.previousHealth - input.health > STAGE_THRESHOLDS.crackingDrop) return "CRACKING";
  if (input.health < STAGE_THRESHOLDS.dormantHealth) return "DORMANT";
  if (input.health < STAGE_THRESHOLDS.emergingHealth && input.velocity > 0) return "EMERGING";
  if (input.health < STAGE_THRESHOLDS.buildingHealth) return "BUILDING";
  if (input.health < STAGE_THRESHOLDS.acceleratingHealth && velocityAbs > 2) return "ACCELERATING";
  if (input.health >= STAGE_THRESHOLDS.parabolicHealth && input.breadthRatio > 0.6 && input.velocity > 4) return "PARABOLIC";
  if (input.health >= STAGE_THRESHOLDS.acceleratingHealth && input.velocity < 0) return "MATURE";
  return input.velocity < -1 ? "REVERTING" : "MATURE";
}

function keyEvent(members: MarketRow[]) {
  const leader = [...members].sort((a, b) => Math.abs(number(b.change_pct)) - Math.abs(number(a.change_pct)))[0];
  return leader ? `${leader.ticker} ${number(leader.change_pct).toFixed(1)}%, EXT ${number(leader.ext_score)}` : null;
}

function bbLabel(position: number) {
  if (position > 100) return "OUT UP";
  if (position < -100) return "OUT DN";
  if (position > 80) return "TCH UP";
  if (position < -80) return "TCH DN";
  return "MID";
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
