import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

export async function polygon(path: string, params: Record<string, string | number | boolean> = {}) {
  const url = new URL(`https://api.polygon.io${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set("apiKey", env("POLYGON_API_KEY"));
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Polygon ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function upsertSystemState(key: string, value: Record<string, unknown>) {
  const supabase = adminClient();
  const { error } = await supabase.from("system_state").upsert({ key, value });
  if (error) throw error;
}

export async function skipOutsideEtWindow(
  req: Request,
  stateKey: string,
  startMinutes: number,
  endMinutes: number,
  label: string,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.searchParams.get("force") === "1") return null;
  if (isEtWindow(startMinutes, endMinutes)) return null;
  const value = { at: new Date().toISOString(), status: "skipped", reason: `outside ${label}` };
  await upsertSystemState(stateKey, value);
  return json({ ok: true, skipped: true, reason: value.reason });
}

export function isEtWindow(startMinutes: number, endMinutes: number, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = pick("weekday");
  let hour = Number(pick("hour"));
  const minute = Number(pick("minute"));
  if (hour === 24) hour = 0;
  if (weekday === "Sat" || weekday === "Sun" || !Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const current = hour * 60 + minute;
  return current >= startMinutes && current <= endMinutes;
}

export async function insertFreshAlerts(
  supabase: ReturnType<typeof adminClient>,
  alerts: Array<Record<string, unknown>>,
  lookbackMinutes = 60,
) {
  if (!alerts.length) return 0;
  const since = new Date(Date.now() - lookbackMinutes * 60000).toISOString();
  const { data, error } = await supabase
    .from("alerts")
    .select("ticker, theme, alert_type, headline")
    .gte("created_at", since);
  if (error) throw error;
  const seen = new Set((data ?? []).map(alertKey));
  const fresh = alerts.filter((alert) => !seen.has(alertKey(alert)));
  if (!fresh.length) return 0;
  const { error: insertError } = await supabase.from("alerts").insert(fresh);
  if (insertError) throw insertError;
  return fresh.length;
}

function alertKey(row: Record<string, unknown>) {
  return `${row.alert_type ?? ""}:${row.ticker ?? ""}:${row.theme ?? ""}:${row.headline ?? ""}`.toLowerCase();
}
