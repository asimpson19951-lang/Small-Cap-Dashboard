-- Mean Reversion Dashboard backend cache.
-- Apply with: supabase db push

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.market_data (
  ticker TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('SC', 'ML')),
  price NUMERIC,
  change_pct NUMERIC,
  ext_score NUMERIC,
  ext_direction TEXT CHECK (ext_direction IN ('UP', 'DOWN')),
  bb_position NUMERIC,
  bb_consec INTEGER,
  ema8_dist NUMERIC,
  volume_today BIGINT,
  volume_avg BIGINT,
  volume_ratio NUMERIC,
  volume_trend TEXT CHECK (volume_trend IN ('LOW', 'STEADY', 'RISING', 'EXPONENTIAL')),

  -- Small-cap mechanics.
  float_size BIGINT,
  float_rot NUMERIC,
  si_pct NUMERIC,
  days_to_cover NUMERIC,
  catalyst_cat TEXT,
  fraud_score INTEGER,
  fraud_detail TEXT,
  hq_flag TEXT,

  -- Mid/large mean-reversion mechanics.
  ma_8ema NUMERIC,
  ma_20sma NUMERIC,
  ma_50sma NUMERIC,
  ma_100sma NUMERIC,
  ma_150sma NUMERIC,
  ma_200sma NUMERIC,
  curve_type TEXT CHECK (curve_type IN ('LINEAR', 'ACCEL', 'PARABOLIC')),
  next_earnings DATE,
  reason TEXT,

  -- Common display/cache fields.
  status TEXT,
  theme TEXT,
  theme_peers TEXT[],
  news TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_market_data_updated_at ON public.market_data;
CREATE TRIGGER trg_market_data_updated_at
BEFORE UPDATE ON public.market_data
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_market_data_category_ext ON public.market_data(category, ext_score DESC);
CREATE INDEX IF NOT EXISTS idx_market_data_theme ON public.market_data(theme);
CREATE INDEX IF NOT EXISTS idx_market_data_status ON public.market_data(status);
CREATE INDEX IF NOT EXISTS idx_market_data_updated ON public.market_data(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.filings (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  filed_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  summary TEXT,
  risk_level TEXT,
  shares_offered BIGINT,
  offer_price NUMERIC,
  shelf_capacity NUMERIC,
  edgar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  raw_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_filings_ticker ON public.filings(ticker);
CREATE INDEX IF NOT EXISTS idx_filings_type ON public.filings(filing_type);
CREATE INDEX IF NOT EXISTS idx_filings_detected ON public.filings(detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_filings_unique_url
ON public.filings(edgar_url)
WHERE edgar_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.themes (
  name TEXT PRIMARY KEY,
  stage TEXT NOT NULL,
  prev_stage TEXT,
  health INTEGER CHECK (health BETWEEN 0 AND 100),
  velocity NUMERIC,
  breadth TEXT,
  constituents JSONB,
  narrative TEXT,
  key_event TEXT,
  mov_1d NUMERIC,
  mov_3d NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_themes_updated_at ON public.themes;
CREATE TRIGGER trg_themes_updated_at
BEFORE UPDATE ON public.themes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_themes_health ON public.themes(health DESC);
CREATE INDEX IF NOT EXISTS idx_themes_stage ON public.themes(stage);
CREATE INDEX IF NOT EXISTS idx_themes_updated ON public.themes(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.briefs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('AM', 'PM', 'THEME', 'LOCAL')),
  content TEXT NOT NULL,
  risk_level TEXT CHECK (risk_level IN ('LOW', 'ELEVATED', 'HIGH', 'EXTREME')),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_briefs_generated ON public.briefs(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_type_generated ON public.briefs(type, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.alerts (
  id SERIAL PRIMARY KEY,
  ticker TEXT,
  theme TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  headline TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  seen BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON public.alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_seen_created ON public.alerts(seen, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_ticker ON public.alerts(ticker);
CREATE INDEX IF NOT EXISTS idx_alerts_theme ON public.alerts(theme);

CREATE TABLE IF NOT EXISTS public.scanner_hits (
  ticker TEXT PRIMARY KEY,
  scan_type TEXT,
  price NUMERIC,
  change_pct NUMERIC,
  volume_ratio NUMERIC,
  market_cap TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scanner_detected ON public.scanner_hits(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanner_type ON public.scanner_hits(scan_type);

CREATE TABLE IF NOT EXISTS public.news_cache (
  id SERIAL PRIMARY KEY,
  ticker TEXT,
  headline TEXT NOT NULL,
  source TEXT,
  published_at TIMESTAMPTZ,
  sentiment TEXT,
  actionable BOOLEAN DEFAULT FALSE,
  category TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_ticker ON public.news_cache(ticker);
CREATE INDEX IF NOT EXISTS idx_news_published ON public.news_cache(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_actionable ON public.news_cache(actionable, published_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_unique_headline
ON public.news_cache(COALESCE(ticker, ''), md5(headline));

CREATE TABLE IF NOT EXISTS public.system_state (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_system_state_updated_at ON public.system_state;
CREATE TRIGGER trg_system_state_updated_at
BEFORE UPDATE ON public.system_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanner_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read market_data" ON public.market_data;
CREATE POLICY "read market_data" ON public.market_data FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read filings" ON public.filings;
CREATE POLICY "read filings" ON public.filings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read themes" ON public.themes;
CREATE POLICY "read themes" ON public.themes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read briefs" ON public.briefs;
CREATE POLICY "read briefs" ON public.briefs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read alerts" ON public.alerts;
CREATE POLICY "read alerts" ON public.alerts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read scanner_hits" ON public.scanner_hits;
CREATE POLICY "read scanner_hits" ON public.scanner_hits FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read news_cache" ON public.news_cache;
CREATE POLICY "read news_cache" ON public.news_cache FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read system_state" ON public.system_state;
CREATE POLICY "read system_state" ON public.system_state FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.market_data, public.filings, public.themes, public.briefs,
  public.alerts, public.scanner_hits, public.news_cache, public.system_state
TO anon, authenticated;
