import { AM_BRIEF_SYSTEM, callClaude, PM_BRIEF_SYSTEM } from "../_shared/ai.ts";
import { adminClient, handleOptions, json, upsertSystemState } from "../_shared/http.ts";

type BriefType = "AM" | "PM" | "THEME";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const body = await safeBody(req);
    const type = (String(body.type ?? "AM").toUpperCase() as BriefType);
    const supabase = adminClient();
    const context = await buildContext(supabase, type);
    const prompt = buildPrompt(type, context);
    const ai = Deno.env.get("CLAUDE_API_KEY")
      ? await callClaude({
        system: type === "PM" ? PM_BRIEF_SYSTEM : AM_BRIEF_SYSTEM,
        user: prompt,
        tier: "sonnet",
        maxTokens: 1024,
      })
      : await localBrief(type, context);
    const risk = extractRisk(ai.content);

    const { error } = await supabase.from("briefs").insert({
      type,
      content: ai.content,
      risk_level: risk,
      model_used: ai.model,
      input_tokens: ai.input_tokens,
      output_tokens: ai.output_tokens,
      cost_usd: ai.cost_usd,
    });
    if (error) throw error;

    await upsertSystemState("last_ai_brief", {
      at: new Date().toISOString(),
      type,
      status: "ok",
      model: ai.model,
      cost_usd: ai.cost_usd,
    });
    return json({ ok: true, type, risk, model: ai.model });
  } catch (error) {
    await safeState("last_ai_brief", { at: new Date().toISOString(), status: "error", message: String(error) });
    return json({ ok: false, error: String(error) }, 500);
  }
});

async function buildContext(supabase: ReturnType<typeof adminClient>, type: BriefType) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [market, themes, filings, alerts, news, amBrief] = await Promise.all([
    supabase.from("market_data").select("ticker, category, price, change_pct, ext_score, ext_direction, bb_position, bb_consec, ema8_dist, volume_ratio, volume_trend, float_rot, status, theme, curve_type, news").order("ext_score", { ascending: false }).limit(40),
    supabase.from("themes").select("name, stage, prev_stage, health, velocity, breadth, narrative, key_event").order("health", { ascending: false }).limit(12),
    supabase.from("filings").select("ticker, filing_type, summary, risk_level, filed_at, detected_at").gte("detected_at", since).order("detected_at", { ascending: false }).limit(15),
    supabase.from("alerts").select("ticker, theme, alert_type, severity, headline, detail, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    supabase.from("news_cache").select("ticker, headline, sentiment, category, published_at").eq("actionable", true).gte("published_at", since).order("published_at", { ascending: false }).limit(16),
    type === "PM"
      ? supabase.from("briefs").select("content, risk_level, generated_at").eq("type", "AM").order("generated_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [market, themes, filings, alerts, news, amBrief]) {
    if (result.error) throw result.error;
  }
  return {
    market: market.data ?? [],
    themes: themes.data ?? [],
    filings: filings.data ?? [],
    alerts: alerts.data ?? [],
    news: news.data ?? [],
    am_brief: amBrief.data?.[0] ?? null,
  };
}

function buildPrompt(type: BriefType, context: Record<string, unknown>) {
  const date = new Date().toLocaleDateString("en-US", { timeZone: "America/Denver" });
  if (type === "PM") {
    return `Generate the PM brief for ${date}.

CURRENT MARKET STATE (end of day):
${JSON.stringify(context.market)}

ACTIVE THEMES:
${JSON.stringify(context.themes)}

TODAY'S FILINGS:
${JSON.stringify(context.filings)}

TODAY'S ALERTS:
${JSON.stringify(context.alerts)}

TODAY'S AM BRIEF:
${JSON.stringify(context.am_brief)}

ACTIONABLE NEWS:
${JSON.stringify(context.news)}`.slice(0, 15000);
  }
  return `Generate the AM brief for ${date}.

CURRENT MARKET STATE:
${JSON.stringify(context.market)}

ACTIVE THEMES:
${JSON.stringify(context.themes)}

RECENT FILINGS (last 24h):
${JSON.stringify(context.filings)}

RECENT ALERTS (last 24h):
${JSON.stringify(context.alerts)}

ACTIONABLE NEWS:
${JSON.stringify(context.news)}

YESTERDAY'S PM BRIEF RISK LEVEL:
${JSON.stringify(context.am_brief)}`.slice(0, 15000);
}

async function localBrief(type: BriefType, context: Awaited<ReturnType<typeof buildContext>>) {
  const top = [...context.market].slice(0, 8).map((row: Record<string, unknown>) =>
    `${row.ticker} EXT ${row.ext_score} ${row.ext_direction} ${row.change_pct}%`
  ).join(", ");
  const hotThemes = [...context.themes].slice(0, 5).map((row: Record<string, unknown>) =>
    `${row.name} ${row.stage} health ${row.health}`
  ).join(", ");
  const filings = [...context.filings].slice(0, 5).map((row: Record<string, unknown>) =>
    `${row.ticker} ${row.filing_type} ${row.risk_level}`
  ).join(", ");
  const content = [
    `# ${type} Brief`,
    `Market radar: ${top || "No market rows cached yet."}`,
    `Theme pulse: ${hotThemes || "No theme rows cached yet."}`,
    `Dilution watch: ${filings || "No recent critical filings cached."}`,
    "RISK: ELEVATED",
  ].join("\n\n");
  return { content, model: "local", input_tokens: null, output_tokens: null, cost_usd: 0 };
}

function extractRisk(content: string) {
  const match = content.match(/RISK:\s*(LOW|ELEVATED|HIGH|EXTREME)/i);
  return (match?.[1] ?? "ELEVATED").toUpperCase();
}

async function safeBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function safeState(key: string, value: Record<string, unknown>) {
  try {
    await upsertSystemState(key, value);
  } catch {
    // Avoid hiding the original function error when health logging fails.
  }
}
