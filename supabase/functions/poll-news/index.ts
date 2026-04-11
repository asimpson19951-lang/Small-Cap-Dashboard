import { callClaude, NEWS_CLASSIFICATION_SYSTEM } from "../_shared/ai.ts";
import { adminClient, handleOptions, json, polygon, upsertSystemState } from "../_shared/http.ts";

type NewsItem = {
  ticker: string;
  headline: string;
  source: string | null;
  published_at: string | null;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  actionable: boolean;
  category: string | null;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = adminClient();
    const { data: tickers, error } = await supabase
      .from("market_data")
      .select("ticker")
      .order("ext_score", { ascending: false })
      .limit(40);
    if (error) throw error;

    const rows: NewsItem[] = [];
    for (const row of tickers ?? []) {
      rows.push(...await fetchTickerNews(row.ticker));
    }

    let inserted = 0;
    const useAi = Boolean(Deno.env.get("CLAUDE_API_KEY"));
    for (const row of dedupe(rows)) {
      const insertRow = useAi ? { ...row, sentiment: null, actionable: false, category: null } : row;
      const { error: insertError } = await supabase.from("news_cache").insert(insertRow);
      if (insertError && insertError.code !== "23505") throw insertError;
      if (!insertError) inserted++;
    }
    const classified = useAi ? await classifyUnclassified(supabase) : 0;

    await upsertSystemState("last_news_poll", {
      at: new Date().toISOString(),
      status: "ok",
      headlines_found: rows.length,
      inserted,
      classified,
    });
    return json({ ok: true, headlines_found: rows.length, inserted, classified });
  } catch (error) {
    await safeState("last_news_poll", { at: new Date().toISOString(), status: "error", message: String(error) });
    return json({ ok: false, error: String(error) }, 500);
  }
});

async function fetchTickerNews(ticker: string): Promise<NewsItem[]> {
  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  if (finnhubKey) {
    const to = ymd(new Date());
    const from = ymd(new Date(Date.now() - 2 * 86400000));
    const url = new URL("https://finnhub.io/api/v1/company-news");
    url.searchParams.set("symbol", ticker);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("token", finnhubKey);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Finnhub ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return (Array.isArray(data) ? data : []).slice(0, 3).map((item) => normalize(ticker, item.headline, item.source, item.datetime ? new Date(item.datetime * 1000).toISOString() : null));
  }

  const data = await polygon("/v2/reference/news", { ticker, limit: 3, order: "desc", sort: "published_utc" });
  return (data.results ?? []).map((item: { title?: string; published_utc?: string; publisher?: { name?: string } }) =>
    normalize(ticker, item.title ?? "", item.publisher?.name ?? null, item.published_utc ?? null)
  );
}

async function classifyUnclassified(supabase: ReturnType<typeof adminClient>) {
  const { data: lastState } = await supabase.from("system_state").select("value").eq("key", "last_news_classify").maybeSingle();
  const lastAt = Date.parse(String(lastState?.value?.at ?? ""));
  if (Number.isFinite(lastAt) && Date.now() - lastAt < 15 * 60 * 1000) return 0;

  const { data: headlines, error } = await supabase
    .from("news_cache")
    .select("id, ticker, headline, source")
    .is("sentiment", null)
    .order("fetched_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  if (!headlines?.length) return 0;

  const result = await callClaude({
    system: NEWS_CLASSIFICATION_SYSTEM,
    user: `Classify these headlines for trading relevance.

HEADLINES:
${JSON.stringify(headlines)}`,
    tier: "haiku",
    maxTokens: 700,
  });
  const classifications = parseJsonArray(result.content);
  let updated = 0;
  for (const item of classifications) {
    const id = Number(item.id);
    if (!Number.isFinite(id)) continue;
    const { error: updateError } = await supabase.from("news_cache").update({
      sentiment: validSentiment(item.sentiment),
      actionable: Boolean(item.actionable),
      category: validCategory(item.category),
    }).eq("id", id);
    if (updateError) throw updateError;
    updated++;
  }
  await upsertSystemState("last_news_classify", {
    at: new Date().toISOString(),
    status: "ok",
    updated,
    model: result.model,
    cost_usd: result.cost_usd,
  });
  return updated;
}

function parseJsonArray(text: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  }
}

function validSentiment(value: unknown) {
  const text = String(value ?? "").toUpperCase();
  return ["BULLISH", "BEARISH", "NEUTRAL"].includes(text) ? text : "NEUTRAL";
}

function validCategory(value: unknown) {
  const text = String(value ?? "").toUpperCase();
  return ["FILING", "EARNINGS", "ANALYST", "MACRO", "SOCIAL", "CORPORATE", "SECTOR"].includes(text) ? text : "CORPORATE";
}

function normalize(ticker: string, headline: string, source: string | null, published_at: string | null): NewsItem {
  const category = categoryFor(headline);
  return {
    ticker,
    headline,
    source,
    published_at,
    sentiment: sentimentFor(headline),
    actionable: category !== "NOISE",
    category,
  };
}

function categoryFor(headline = "") {
  if (/424B5|S-3|offering|shelf|ATM|registered direct/i.test(headline)) return "FILING";
  if (/earnings|revenue|guidance|eps|quarter/i.test(headline)) return "EARNINGS";
  if (/upgrade|downgrade|price target|initiates/i.test(headline)) return "ANALYST";
  if (/fda|patent|approval|trial|contract|order|partnership/i.test(headline)) return "CATALYST";
  if (/fed|cpi|jobs|treasury|rate|oil|vix/i.test(headline)) return "MACRO";
  return "NOISE";
}

function sentimentFor(headline = ""): NewsItem["sentiment"] {
  if (/offering|downgrade|miss|investigation|delist|bankrupt|halt|recall/i.test(headline)) return "BEARISH";
  if (/approval|award|beat|upgrade|contract|partnership|patent/i.test(headline)) return "BULLISH";
  return "NEUTRAL";
}

function dedupe(rows: NewsItem[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.ticker}:${row.headline.toLowerCase()}`;
    if (seen.has(key) || !row.headline) return false;
    seen.add(key);
    return true;
  });
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function safeState(key: string, value: Record<string, unknown>) {
  try {
    await upsertSystemState(key, value);
  } catch {
    // Avoid hiding the original function error when health logging fails.
  }
}
