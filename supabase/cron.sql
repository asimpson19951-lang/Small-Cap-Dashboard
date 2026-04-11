-- Cron schedule template for Supabase SQL editor.
-- Replace PROJECT_REF and SERVICE_ROLE_KEY before running.
-- Consider storing the service role key in Supabase Vault before production use.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Market data polling every 2 min, weekdays, broad market-hours UTC window.
SELECT cron.schedule(
  'poll-market-data',
  '*/2 13-20 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/poll-market-data',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- EDGAR polling every 2 min, weekdays, extended-hours UTC window.
SELECT cron.schedule(
  'poll-edgar',
  '*/2 12-22 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/poll-edgar',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- News every 5 min.
SELECT cron.schedule(
  'poll-news',
  '*/5 13-20 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/poll-news',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- Scanner every 5 min.
SELECT cron.schedule(
  'run-scanner',
  '*/5 13-20 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/run-scanner',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- Theme engine every 10 min.
SELECT cron.schedule(
  'run-theme-engine',
  '*/10 13-20 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/run-theme-engine',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- AM brief, 6:45am Mountain during daylight time.
SELECT cron.schedule(
  'am-brief',
  '45 12 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/generate-brief',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body := '{"type":"AM"}'::jsonb
  )$$
);

-- PM brief, 3:00pm Mountain during daylight time.
SELECT cron.schedule(
  'pm-brief',
  '0 21 * * 1-5',
  $$SELECT net.http_post(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/generate-brief',
    headers := '{"Authorization":"Bearer SERVICE_ROLE_KEY","Content-Type":"application/json"}'::jsonb,
    body := '{"type":"PM"}'::jsonb
  )$$
);
