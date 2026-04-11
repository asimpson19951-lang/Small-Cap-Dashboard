import { adminClient, env, handleOptions, json, upsertSystemState } from "../_shared/http.ts";

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

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = adminClient();
    const { data: watchlist, error } = await supabase
      .from("market_data")
      .select("ticker, theme")
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
        filings.push({
          ticker: row.ticker,
          filing_type: forms[i],
          filed_at: dates[i] ? `${dates[i]}T00:00:00Z` : null,
          summary: summaryFor(forms[i], row.ticker),
          risk_level: riskFor(forms[i]),
          edgar_url: url,
          is_active: /^(S-3|F-3)$/.test(forms[i]),
          raw_text: null,
        });
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
    if (alerts.length) {
      const { error: alertError } = await supabase.from("alerts").insert(alerts);
      if (alertError) throw alertError;
    }

    await upsertSystemState("last_edgar_poll", {
      at: new Date().toISOString(),
      status: "ok",
      filings_found: filings.length,
      inserted,
      alerts: alerts.length,
    });
    return json({ ok: true, filings_found: filings.length, inserted, alerts: alerts.length });
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
