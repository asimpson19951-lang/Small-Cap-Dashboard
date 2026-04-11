-- Curated theme registry for manual theme overrides and alias matching.

CREATE TABLE IF NOT EXISTS public.theme_registry (
  name TEXT PRIMARY KEY,
  aliases TEXT[] DEFAULT '{}',
  tickers TEXT[] DEFAULT '{}',
  note TEXT,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_theme_registry_updated_at ON public.theme_registry;
CREATE TRIGGER trg_theme_registry_updated_at
BEFORE UPDATE ON public.theme_registry
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_theme_registry_active ON public.theme_registry(active);
CREATE INDEX IF NOT EXISTS idx_theme_registry_tickers ON public.theme_registry USING GIN(tickers);
CREATE INDEX IF NOT EXISTS idx_theme_registry_aliases ON public.theme_registry USING GIN(aliases);

ALTER TABLE public.theme_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read theme_registry" ON public.theme_registry;
CREATE POLICY "read theme_registry" ON public.theme_registry FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.theme_registry TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.theme_registry;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
