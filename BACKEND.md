# Mean Reversion Dashboard Backend

This folder is the first Supabase backend slice. It keeps the current `index.html`
dashboard intact while moving the data collection brain server-side.

## What Exists

- `supabase/migrations/202604110001_backend_schema.sql` creates the cache tables, indexes, and read-only RLS policies for the browser.
- `supabase/functions/poll-market-data` pulls Polygon snapshots, hydrates daily bars, calculates extension/BB/EMA/volume metrics, and upserts `market_data`.
- `supabase/functions/poll-edgar` checks watchlist small caps against SEC submissions and inserts dilution filings plus filing alerts.
- `supabase/functions/poll-news` caches headlines from Finnhub when configured, otherwise Polygon news.
- `supabase/functions/run-scanner` finds all-market gap/volume scanner hits and alerts when they overlap the watchlist.
- `supabase/functions/run-theme-engine` calculates theme health, velocity, breadth, stage, and stage-transition alerts.
- `supabase/functions/run-theme-engine` also calls Haiku for theme narration when a stage transition occurs.
- `supabase/functions/generate-brief` creates AM/PM briefs from cached state using the tuned trader-voice prompt structure. It uses Claude if `CLAUDE_API_KEY` is present, otherwise writes a local fallback brief.
- `supabase/functions/poll-edgar` calls Haiku for 424B/S-3-style filing triage when Claude is configured.
- `supabase/functions/poll-news` inserts headlines and batch-classifies unclassified rows with Haiku every 15 minutes when Claude is configured.
- `supabase/seed.sql` seeds an initial watchlist. The market poller can also auto-discover movers if the table starts empty.
- `supabase/cron.sql` is the cron template to run after replacing placeholders.

## Required Secrets

Set these as Supabase Edge Function secrets:

```text
POLYGON_API_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_URL=https://PROJECT_REF.supabase.co
CLAUDE_API_KEY=xxx
CLAUDE_MODEL=claude-sonnet-4-5-20250929
CLAUDE_HAIKU_MODEL=claude-haiku-4-5-20251001
DAILY_AI_BUDGET_USD=2
FINNHUB_API_KEY=xxx
SEC_USER_AGENT=Mean Reversion Dashboard your-email@example.com
```

`FINNHUB_API_KEY` and `CLAUDE_API_KEY` are optional for the first backend pass.
Without Finnhub, news uses Polygon. Without Claude, briefs use the local fallback.

## Deploy Order

1. Create a Supabase project.
2. Link it locally: `npm run supabase:link -- --project-ref PROJECT_REF`.
3. Run the migration: `npm run supabase:db:push`.
4. Optionally seed: run `supabase/seed.sql` in the SQL editor.
5. Copy `supabase/.env.example` to an untracked env file and set Edge Function secrets.
6. Deploy functions:

```powershell
npm run supabase:functions:deploy
```

7. Manually invoke `poll-market-data` once and inspect `market_data`.
8. Run `run-theme-engine` and inspect `themes`.
9. Replace placeholders in `supabase/cron.sql`, then run it in the SQL editor.

On this Windows machine, PowerShell may block `npm.ps1`. If that happens, use
`npm.cmd run ...` for the same scripts.

## Frontend Migration Plan

The current dashboard still works as a direct Polygon browser client. The next
step is to add a feature flag:

- If `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured, read cached tables.
- Otherwise, keep the current browser Polygon fallback.

After the cached client path is stable, remove Polygon and Claude keys from the
browser settings UI.
