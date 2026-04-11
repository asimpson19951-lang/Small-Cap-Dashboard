import { adminClient, env, handleOptions, json, upsertSystemState } from "../_shared/http.ts";

type BriefType = "AM" | "PM" | "THEME";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const body = await safeBody(req);
    const type = (String(body.type ?? "AM").toUpperCase() as BriefType);
    const supabase = adminClient();
    const context = await buildContext(supabase);
    const prompt = buildPrompt(type, context);
    const ai = Deno.env.get("CLAUDE_API_KEY") ? await callClaude(prompt) : await localBrief(type, context);
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

async function buildContext(supabase: ReturnType<typeof adminClient>) {
  const [market, themes, filings, alerts, news] = await Promise.all([
    supabase.from("market_data").select("*").order("ext_score", { ascending: false }).limit(40),
    supabase.from("themes").select("*").order("health", { ascending: false }).limit(12),
    supabase.from("filings").select("*").order("detected_at", { ascending: false }).limit(15),
    supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("news_cache").select("*").eq("actionable", true).order("published_at", { ascending: false }).limit(20),
  ]);
  for (const result of [market, themes, filings, alerts, news]) {
    if (result.error) throw result.error;
  }
  return {
    market: market.data ?? [],
    themes: themes.data ?? [],
    filings: filings.data ?? [],
    alerts: alerts.data ?? [],
    news: news.data ?? [],
  };
}

function buildPrompt(type: BriefType, context: Record<string, unknown>) {
  return `You are writing Austin Simpson's ${type} Mean Reversion Dashboard brief.

Rules:
- This is monitoring context, not trade advice.
- Write like a senior trader: direct, concise, no preamble.
- Cover market regime, theme pulse, small-cap blowoff/dilution risk, mid/large mean-reversion watchlist, and key risk.
- Use conditional monitoring language: "watching for", "if X then Y", "cracking", "holding", "setup forming".
- End with a single line: RISK: LOW, ELEVATED, HIGH, or EXTREME.

Dashboard context JSON:
${JSON.stringify(context).slice(0, 14000)}`;
}

async function callClaude(prompt: string) {
  const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-5-20250929";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env("CLAUDE_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return {
    content: data.content?.map((part: { text?: string }) => part.text ?? "").join("\n").trim() || "",
    model,
    input_tokens: data.usage?.input_tokens ?? null,
    output_tokens: data.usage?.output_tokens ?? null,
    cost_usd: null,
  };
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
