-- Optional first watchlist seed.
-- The collector can auto-discover movers if this table is empty, but seeded tickers
-- keep the radar focused on Austin's core strategies from the first run.

INSERT INTO public.market_data (ticker, category, theme, status)
VALUES
  ('QBTS', 'SC', 'Quantum', 'MONITOR'),
  ('IONQ', 'SC', 'Quantum', 'MONITOR'),
  ('RGTI', 'SC', 'Quantum', 'MONITOR'),
  ('QUBT', 'SC', 'Quantum', 'MONITOR'),
  ('AIXI', 'SC', 'Quantum', 'MONITOR'),
  ('SEZL', 'SC', 'Fintech', 'MONITOR'),
  ('MBOT', 'SC', 'Biotech', 'MONITOR'),
  ('DRUG', 'SC', 'Biotech', 'MONITOR'),
  ('LUNR', 'SC', 'Space', 'MONITOR'),
  ('RKLB', 'SC', 'Space', 'MONITOR'),
  ('NVDA', 'ML', 'AI Infra', 'MONITOR'),
  ('PLTR', 'ML', 'AI Infra + Defense', 'MONITOR'),
  ('AVGO', 'ML', 'AI Infra', 'MONITOR'),
  ('AMD', 'ML', 'AI Infra', 'MONITOR'),
  ('LLY', 'ML', 'GLP-1', 'MONITOR'),
  ('NVO', 'ML', 'GLP-1', 'MONITOR'),
  ('META', 'ML', 'AI Infra', 'MONITOR'),
  ('TSLA', 'ML', 'EV + AI Infra', 'MONITOR'),
  ('CCJ', 'ML', 'Nuclear', 'MONITOR'),
  ('CEG', 'ML', 'Nuclear', 'MONITOR'),
  ('XOM', 'ML', 'Oil Shock', 'MONITOR'),
  ('CVX', 'ML', 'Oil Shock', 'MONITOR')
ON CONFLICT (ticker) DO UPDATE SET
  category = EXCLUDED.category,
  theme = EXCLUDED.theme;
