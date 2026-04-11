# Mean Reversion Dashboard Master Task List

This is the execution queue for building the dashboard from current prototype to
backend-driven trading radar. Work top-to-bottom unless a blocker forces a
parallel track.

## Phase 0: Current State

- [x] Restore live dashboard with Polygon browser fallback.
- [x] Exclude leveraged ETFs from extension lists.
- [x] Tighten extension scoring so 90+ is rare.
- [x] Improve theme mapping beyond "Solo / Unclassified".
- [x] Fit monitor layout into one portrait screen with expand controls.
- [x] Add scanner catalyst/headline context.
- [x] Add Supabase schema, seed, cron template, and Edge Function scaffold.
- [x] Wire Claude prompt structures into brief, theme, filing, and news functions.

## Phase 1: Supabase Project Hookup

- [ ] Create or link Supabase project.
- [x] Add Supabase CLI config and `npm` scripts using `npx`.
- [ ] Install Supabase CLI globally if desired, or continue using repo `npm` scripts.
- [ ] Run `supabase db push` for `202604110001_backend_schema.sql`.
- [ ] Run `supabase/seed.sql` or equivalent initial ticker seed.
- [ ] Set Edge Function secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `POLYGON_API_KEY`
  - `CLAUDE_API_KEY`
  - `CLAUDE_MODEL`
  - `CLAUDE_HAIKU_MODEL`
  - `FINNHUB_API_KEY`
  - `SEC_USER_AGENT`
- [ ] Deploy Edge Functions:
  - `poll-market-data`
  - `poll-edgar`
  - `poll-news`
  - `run-scanner`
  - `run-theme-engine`
  - `generate-brief`
- [ ] Invoke each function manually once and record result in `system_state`.
- [ ] Verify RLS: anon can `SELECT`; browser cannot write.
- [ ] Replace `PROJECT_REF` and `SERVICE_ROLE_KEY` placeholders in `supabase/cron.sql` in Supabase SQL editor or Vault-backed variant.
- [ ] Schedule cron jobs only after manual function tests pass.

## Phase 2: Backend Function Hardening

- [ ] Add `price_history` table or rolling history JSON cache if daily-bar hydration is too slow.
- [ ] Add request batching/rate guards for Polygon daily bars.
- [x] Add market-hours guard inside functions, not just cron schedule.
- [x] Add stale-data cleanup for `scanner_hits`.
- [x] Add duplicate-alert suppression for scanner alerts.
- [x] Add duplicate-alert suppression for theme stage alerts.
- [x] Add `daily_ai_spend` tracking with a hard budget cutoff.
- [x] Add function-level cost guards:
  - No news classification if daily AI spend exceeds configured cap.
  - No theme narration if stage did not change.
  - No filing triage except meaningful dilution forms.
- [ ] Add EDGAR full-text search endpoint support in addition to ticker submissions.
- [ ] Cache CIK map in `system_state` or a dedicated table.
- [ ] Extract offering math where possible:
  - shares offered
  - offer price
  - shelf capacity
  - dilution percent vs float
- [ ] Add FINRA/short-interest placeholder integration path.
- [ ] Add Quiver/FRED macro placeholders only after core radar is stable.

## Phase 3: Theme Engine

- [ ] Add `theme_registry` table for manually curated themes, aliases, and tickers.
- [ ] Add manual theme override support for tickers.
- [ ] Add auto-discovered candidate themes from clustered headlines and simultaneous movers.
- [ ] Add merge/hide/promote workflow for emerging themes.
- [ ] Add theme confidence score.
- [ ] Add theme lifecycle history table for stage transitions over time.
- [ ] Add theme breadth history:
  - extended count
  - outside-BB count
  - average change
  - health score
- [ ] Add multi-theme constituents so names like `PLTR` can live in `AI Infra` and `Defense`.
- [ ] Add theme event attribution from filings/news/alerts.
- [ ] Add 3:00pm theme intelligence update using Haiku.
- [ ] Add stage-threshold constants to docs for easy tuning.

## Phase 4: Dashboard Thin Client

- [x] Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `USE_SUPABASE` config.
- [x] Add Supabase client loader without breaking the current single-file fallback.
- [x] Add live data mappers:
  - `market_data` -> small-cap table rows
  - `market_data` -> mid/large table rows
  - `themes` -> theme table/heatmap
  - `scanner_hits` -> scanner rows
  - `alerts` -> alert panel
  - `briefs` -> Daily Brief widget
  - `news_cache` and `filings` -> detail panel
- [x] Preserve current visual layout and density.
- [x] Keep browser Polygon fallback until Supabase mode is proven.
- [x] Add Realtime subscriptions:
  - new `alerts`
  - new `filings`
  - critical `424B5`
- [x] Add polling fallback every 30 seconds for `market_data`.
- [x] Add visible backend health indicator from `system_state`.
- [ ] Remove browser Polygon/Claude key UI only after Supabase mode is stable.

## Phase 5: Brief System

- [ ] Verify AM brief structure:
  - `OVERNIGHT`
  - `REGIME`
  - `CALENDAR`
  - `THEMES`
  - `WATCHLIST`
  - `RISK`
- [ ] Verify PM brief structure:
  - `SESSION RECAP`
  - `MOVERS`
  - `FILINGS & CATALYSTS`
  - `THEMES UPDATE`
  - `TOMORROW SETUP`
  - `RISK INTO TOMORROW`
- [ ] Add macro/calendar data source for AM brief.
- [ ] Add earnings calendar for watchlist and theme constituents.
- [ ] Add previous PM risk into AM context.
- [ ] Add AM brief into PM context.
- [ ] Add brief markdown rendering in dashboard.
- [ ] Add brief cache display when model call fails.
- [ ] Add daily AI spend display in backend health.

## Phase 6: Filing/Dilution Edge

- [ ] Make `424B5` alert path fastest path in the system.
- [ ] Add active shelf detection from S-3/F-3.
- [ ] Add serial dilutor flag/history.
- [ ] Add offering math display in detail panel.
- [ ] Add EDGAR link in alert row and detail panel.
- [ ] Add `OFFERING` status preservation so market polling does not overwrite it.
- [ ] Add `SHELF ACTIVE` status/flag when appropriate.
- [ ] Add filing recency badge.
- [ ] Add raw filing triage fallback if Claude unavailable.
- [ ] Add test fixture for a known 424B5 filing.

## Phase 7: Scanner/Radar Improvements

- [ ] Use Polygon gainers/losers endpoints directly in `run-scanner`.
- [ ] Add halt detection source.
- [ ] Add R/S fade detection.
- [ ] Add offering fade scanner filter.
- [ ] Add gap-up/gap-down categories.
- [ ] Add relative-volume buckets.
- [ ] Add catalyst category from news/filing classification.
- [ ] Add scanner stale-hit expiry.
- [ ] Add top scanner hits into AM brief watchlist spotlight.

## Phase 8: Detail Panel

- [ ] Load detail panel from Supabase when `USE_SUPABASE = true`.
- [ ] Add small-cap mechanics:
  - float
  - float rotation
  - short interest
  - days to cover
  - fraud flags
  - dilution filings
  - active shelf
  - latest headline/catalyst
- [ ] Add mid/large mechanics:
  - MA stack
  - 8 EMA distance
  - BB position
  - curve type
  - volume trend
  - next earnings
  - reason for extension
- [ ] Add theme peer context in detail panel.
- [ ] Add EDGAR/news links without cluttering the main table.

## Phase 9: Deployment/Operations

- [ ] Decide final hosting:
  - GitHub Pages for static frontend, or
  - Vercel for frontend plus environment config
- [ ] Add production vs local config docs.
- [ ] Add deploy checklist for Supabase functions and cron.
- [ ] Add rollback instructions.
- [ ] Add monitoring checklist:
  - last market poll
  - last EDGAR poll
  - last news poll
  - last scanner run
  - last theme engine run
  - last brief
  - daily AI spend
- [ ] Add a "backend offline" UI state that falls back cleanly.

## Phase 10: Scheduled Codex Work

- [ ] Create daily Codex automation for repo/backend health review.
- [ ] Create daily theme-registry review task.
- [ ] Create premarket deep-thinking brief task if live data access is available.
- [ ] Create weekly cleanup/refactor task for accumulated dashboard issues.
- [ ] Keep scheduled Codex as maintenance/intelligence, not the real-time app brain.

## Build Rules

- Preserve density. The density is the feature.
- Do not unify small-cap and mid/large logic for code elegance.
- Do not add trade recommendations or execution signals.
- Keep API keys server-side once Supabase mode works.
- Prefer deterministic detection first, AI narration/classification second.
- Cost target: keep AI under `$2/day`, ideally under `$0.50/day`.
- Keep browser fallback until backend is proven stable.
