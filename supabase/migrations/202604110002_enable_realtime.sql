-- Enable Supabase Realtime for dashboard cache tables.
-- Safe to re-run: duplicate publication entries are ignored.

DO $$
DECLARE
  rel regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH rel IN ARRAY ARRAY[
      'public.market_data'::regclass,
      'public.filings'::regclass,
      'public.themes'::regclass,
      'public.briefs'::regclass,
      'public.alerts'::regclass,
      'public.scanner_hits'::regclass,
      'public.news_cache'::regclass,
      'public.system_state'::regclass
    ]
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', rel);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END LOOP;
  END IF;
END $$;
