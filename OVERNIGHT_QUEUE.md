# Overnight Queue

This is the next large worklist for unattended progress while Austin sleeps.
It is intentionally stricter than a normal backlog: anything fuzzy, proxy-based,
or low-confidence should be fixed or left out.

## Non-Negotiables

- No proxy data for core market context if the label implies the real thing.
- No simplified watchlist rows just to make code cleaner.
- No AI-generated trade signals.
- Small-cap and mid/large logic stay separate.
- If a panel cannot be made accurate, leave it blank or omit the field.

## Immediate Queue

### 1. Preserve dilution state in `market_data`

- Keep `OFFERING` on small caps after `424B5` detection for a bounded window.
- Keep `SHELF ACTIVE` visible when an active `S-3/F-3` exists and the name is not already in a higher-priority status.
- Acceptance:
  - market polling does not overwrite fresh dilution context
  - frontend can derive the same status from `market_data` alone

### 2. Exact-only top bar

- Replace watchlist movers in the top strip with a real market tape.
- Allowed:
  - `I:SPX`
  - `I:NDX`
  - `I:RUT`
  - `I:VIX`
  - `C:XAUUSD`
  - `C:XAGUSD`
- Not allowed:
  - `SPY`, `QQQ`, `IWM`, `GLD`, `SLV`, `USO`
- Oil stays off until a real source is confirmed.
- Acceptance:
  - every displayed symbol maps to the real underlying market series
  - no ETF/fund proxies labeled as spot/index values

### 3. EDGAR link visibility

- Add EDGAR links to alert rows where filing context exists.
- Keep links visible in detail panel without cluttering the table.
- Acceptance:
  - click from alert/detail into filing in one step
  - no broken `#` links in live view

### 4. Scanner quality pass

- Use stronger scanner labels than raw `VOLUME_SPIKE`.
- Add categories:
  - `EXTENSION`
  - `GAP UP`
  - `GAP DOWN`
  - `OFFERING`
  - `R/S FADE`
  - `HALT`
- Acceptance:
  - scanner rows read like trader shorthand, not raw DB codes
  - each item has a useful second line

## High-Value Backend Work

### 5. `424B5` fast path

- Make filing alerts the fastest route to screen.
- If a meaningful offering filing arrives, it should appear in alerts and detail with minimal delay.
- Acceptance:
  - filing insert triggers visible UI update via Realtime
  - no second pass required for basic alert visibility

### 6. Active shelf intelligence

- Improve `S-3/F-3` handling beyond simple presence.
- Track:
  - active shelf capacity
  - recent shelf date
  - whether the shelf is outsized relative to company scale
- Acceptance:
  - detail panel can say more than “shelf active”

### 7. Serial dilutor history

- Add a compact historical dilution record for small-cap suspects.
- Minimum useful shape:
  - last 3 meaningful dilution filings
  - recurring-filer flag
- Acceptance:
  - detail panel can surface “serial dilutor” without guesswork

## Frontend Density Work

### 8. Detail panel completion

- Small-cap detail still needs richer default context:
  - market cap
  - fraud specifics
  - active shelf sizing
  - serial dilution context
- Mid/large detail still needs:
  - stronger MA stack labels
  - earnings prominence
  - reason/catalyst prominence
- Acceptance:
  - a clicked ticker gives enough context to matter immediately

### 9. Alerts/feed refinement

- Make rows read more like the v7.2 reference:
  - cleaner source label
  - stronger headline hierarchy
  - better second-line details
- Acceptance:
  - right column is readable at a glance on portrait monitor

### 10. Theme drilldown

- Add:
  - key event attribution
  - better constituent sorting
  - clearer breadth line
- Acceptance:
  - a theme click explains “why this theme matters today”

## Theme Engine Work

### 11. Multi-theme membership

- Support names belonging to multiple themes without flattening to one.
- Acceptance:
  - names like `PLTR` can live in multiple narratives cleanly

### 12. Emerging theme detection

- Cluster simultaneous movers/news into candidate narratives.
- Keep this deterministic-first.
- Acceptance:
  - candidate themes are surfaced separately from curated themes

### 13. Theme history

- Track stage shifts over time.
- Acceptance:
  - theme panel can eventually show whether a stage shift is new or stale

## Brief / Intelligence Work

### 14. Brief fallback quality

- If model call fails, show the best cached brief or a richer deterministic fallback.
- Acceptance:
  - no “thin” brief during outages

### 15. AM brief context sources

- Add real macro/calendar context:
  - economic releases
  - Fed speakers
  - watchlist earnings
- Acceptance:
  - AM brief reads like a senior trader note, not a list of movers

## Validation / Ops

### 16. Fixture coverage for known filings

- Add a known `424B5` sample fixture for parser validation.
- Acceptance:
  - offering math extraction can be regression-checked

### 17. Backend health visibility

- Surface:
  - last market poll
  - last EDGAR poll
  - last scanner run
  - last theme engine run
  - daily AI spend
- Acceptance:
  - one glance tells whether backend is healthy or stale

### 18. Clean config path

- Keep browser fallback available, but treat Supabase mode as primary.
- Acceptance:
  - no confusion about which mode is active

## Work Order

1. Preserve dilution state.
2. Ship exact-only top bar.
3. Improve alert/feed wording and EDGAR links.
4. Harden scanner categories.
5. Complete detail panel richness.
6. Deepen theme engine.
7. Improve briefs.

