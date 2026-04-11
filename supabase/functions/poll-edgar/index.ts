import { callClaude, FILING_TRIAGE_SYSTEM } from "../_shared/ai.ts";
import { adminClient, env, handleOptions, insertFreshAlerts, json, skipOutsideEtWindow, upsertSystemState } from "../_shared/http.ts";

const FILING_SCORES: Record<string, number> = {
  "424B5": 5,
  "424B2": 4,
  "S-3": 3,
  "F-3": 3,
  "S-1": 2,
  "F-1": 2,
  "FWP": 2,
  "D": 2,
};

type RecentFilings = {
  form?: string[];
  filingDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
};

type FilingRow = {
  ticker: string;
  filing_type: string;
  filed_at: string | null;
  summary: string;
  risk_level: string;
  shares_offered: number | null;
  offer_price: number | null;
  shelf_capacity: number | null;
  edgar_url: string | null;
  is_active: boolean;
  raw_text: string | null;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const skip = await skipOutsideEtWindow(req, "last_edgar_poll", 8 * 60, 18 * 60, "EDGAR polling window");
    if (skip) return skip;
    const supabase = adminClient();
    const { data: watchlist, error } = await supabase
      .from("market_data")
      .select("ticker, theme, price, ext_score, status, float_size")
      .eq("category", "SC")
      .order("ext_score", { ascending: false })
      .limit(60);
    if (error) throw error;

    const cikByTicker = await cikMap();
    const filings = [];

    for (const row of watchlist ?? []) {
      const cik = cikByTicker.get(row.ticker);
      if (!cik) continue;
      const recent = await recentFilings(cik);
      const forms = recent.form ?? [];
      const dates = recent.filingDate ?? [];
      const accs = recent.accessionNumber ?? [];
      const docs = recent.primaryDocument ?? [];
      for (let i = 0; i < Math.min(forms.length, 12); i++) {
        const score = FILING_SCORES[forms[i]] ?? (/424B/.test(forms[i]) ? 4 : 0);
        if (!score) continue;
        const url = filingUrl(cik, accs[i], docs[i]);
        let filing: FilingRow = {
          ticker: row.ticker,
          filing_type: forms[i],
          filed_at: dates[i] ? `${dates[i]}T00:00:00Z` : null,
          summary: summaryFor(forms[i], row.ticker),
          risk_level: riskFor(forms[i]),
          shares_offered: null as number | null,
          offer_price: null as number | null,
          shelf_capacity: null as number | null,
          edgar_url: url,
          is_active: /^(S-3|F-3)$/.test(forms[i]),
          raw_text: null,
        };
        if (score >= 3 && url && Deno.env.get("CLAUDE_API_KEY")) {
          filing = { ...filing, ...await triageFiling(row, filing) };
        }
        filings.push(filing);
      }
    }

    let inserted = 0;
    const alerts = [];
    for (const filing of filings) {
      const { error: insertError } = await supabase.from("filings").insert(filing);
      if (insertError && insertError.code !== "23505") throw insertError;
      if (!insertError) {
        inserted++;
        if (filing.risk_level === "CRITICAL" || filing.risk_level === "HIGH") {
          const theme = watchlist?.find((row) => row.ticker === filing.ticker)?.theme;
          alerts.push({
            ticker: filing.ticker,
            theme,
            alert_type: "FILING",
            severity: filing.risk_level,
            headline: `${filing.ticker} ${filing.filing_type} detected`,
            detail: `${filing.summary} ${filing.edgar_url ?? ""}`,
          });
        }
      }
    }
    const alertsInserted = await insertFreshAlerts(supabase, alerts, 240);

    await upsertSystemState("last_edgar_poll", {
      at: new Date().toISOString(),
      status: "ok",
      filings_found: filings.length,
      inserted,
      alerts: alertsInserted,
    });
    return json({ ok: true, filings_found: filings.length, inserted, alerts: alertsInserted });
  } catch (error) {
    await safeState("last_edgar_poll", { at: new Date().toISOString(), status: "error", message: String(error) });
    return json({ ok: false, error: String(error) }, 500);
  }
});

async function secJson(url: string) {
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": env("SEC_USER_AGENT"),
    },
  });
  if (!resp.ok) throw new Error(`SEC ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function triageFiling(
  state: { ticker: string; price?: number | null; ext_score?: number | null; status?: string | null; float_size?: number | null },
  filing: { filing_type: string; edgar_url: string | null; raw_text: string | null },
) {
  const raw = filing.edgar_url ? await filingText(filing.edgar_url) : "";
  const result = await callClaude({
    system: FILING_TRIAGE_SYSTEM,
    user: `Triage this SEC filing.

TICKER: ${state.ticker}
CURRENT STATE: price=${state.price ?? "unknown"}, ext_score=${state.ext_score ?? "unknown"}, status=${state.status ?? "unknown"}, float=${state.float_size ?? "unknown"}
FILING TYPE: ${filing.filing_type}
FILING TEXT (first 2000 chars):
${raw.slice(0, 2000)}`,
    tier: "haiku",
    maxTokens: 300,
  });
  const parsed = parseJson(result.content);
  return {
    filing_type: normalizeFilingType(parsed.filing_type, filing.filing_type),
    risk_level: String(parsed.risk_level ?? riskFor(filing.filing_type)),
    summary: String(parsed.summary ?? summaryFor(filing.filing_type, state.ticker)),
    shares_offered: nullableNumber(parsed.shares_offered),
    offer_price: nullableNumber(parsed.offer_price),
    shelf_capacity: nullableNumber(parsed.shelf_capacity),
    raw_text: raw.slice(0, 2000),
  };
}

async function filingText(url: string) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": env("SEC_USER_AGENT"),
    },
  });
  if (!resp.ok) return "";
  return (await resp.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function normalizeFilingType(value: unknown, fallback: string) {
  const text = String(value ?? fallback);
  return text === "FORM_D" ? "D" : text;
}

function nullableNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function cikMap() {
  const data = await secJson("https://www.sec.gov/files/company_tickers.json");
  const map = new Map<string, string>();
  for (const item of Object.values(data) as Array<{ ticker: string; cik_str: number }>) {
    map.set(item.ticker.toUpperCase(), String(item.cik_str).padStart(10, "0"));
  }
  return map;
}

async function recentFilings(cik: string): Promise<RecentFilings> {
  const data = await secJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  return data.filings?.recent ?? {};
}

function filingUrl(cik: string, accession?: string, doc?: string) {
  if (!accession) return null;
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${doc ?? ""}`;
}

function riskFor(form: string) {
  if (form === "424B5") return "CRITICAL";
  if (/^(S-3|F-3|424B)/.test(form)) return "HIGH";
  return "MEDIUM";
}

function summaryFor(form: string, ticker: string) {
  if (form === "424B5") return `${ticker} filed 424B5 prospectus supplement; offering risk during a run.`;
  if (/^(S-3|F-3)$/.test(form)) return `${ticker} has shelf registration capacity active.`;
  if (/424B/.test(form)) return `${ticker} filed prospectus supplement; dilution watch.`;
  if (/^(S-1|F-1)$/.test(form)) return `${ticker} filed registration statement; future supply watch.`;
  if (form === "D") return `${ticker} filed Form D private placement notice.`;
  return `${ticker} filed ${form}; review EDGAR.`;
}

async function safeState(key: string, value: Record<string, unknown>) {
  try {
    await upsertSystemState(key, value);
  } catch {
    // Avoid hiding the original function error when health logging fails.
  }
}
