-- Optional first watchlist seed.
-- The collector can auto-discover movers if this table is empty, but seeded tickers
-- keep the radar focused on Austin's core strategies from the first run.

INSERT INTO public.theme_registry (name, aliases, tickers, note)
VALUES
  ('Quantum', ARRAY['quantum', 'qubit', 'rigetti', 'ionq', 'd-wave'], ARRAY['QBTS','IONQ','RGTI','QUBT','QMCO','ARQQ','AIXI'], 'Hype-prone small-cap and mid-cap quantum basket.'),
  ('AI Infra', ARRAY['ai', 'artificial intelligence', 'gpu', 'data center', 'server', 'semiconductor'], ARRAY['NVDA','AMD','AVGO','ARM','SMCI','DELL','META','TSM','MU','VRT','ANET','MRVL','PLTR','BBAI','MSTR','TSLA'], 'AI infrastructure, chips, servers, power-adjacent beneficiaries.'),
  ('Defense', ARRAY['defense', 'aerospace', 'missile', 'drone', 'security'], ARRAY['PLTR','LMT','RTX','NOC','GD','KTOS','BBAI','ACHR','MP'], 'Defense and dual-use software/hardware theme.'),
  ('GLP-1', ARRAY['glp', 'obesity', 'weight loss', 'mounjaro', 'wegovy'], ARRAY['LLY','NVO','VKTX','ALT','HIMS','AMGN'], 'Weight-loss drug narrative basket.'),
  ('Nuclear', ARRAY['nuclear', 'uranium', 'reactor', 'smr', 'enrichment'], ARRAY['CCJ','UEC','DNN','NXE','LEU','OKLO','SMR','NNE','CEG','UUUU'], 'Uranium, nuclear power, SMR, and enrichment basket.'),
  ('Oil Shock', ARRAY['oil', 'gas', 'drilling', 'petroleum', 'lng'], ARRAY['XOM','CVX','OXY','SLB','HAL','BTU'], 'Energy shock and oil services bucket.'),
  ('Precious Metals', ARRAY['gold', 'silver', 'miner', 'mining'], ARRAY['NEM','GOLD','HL','AG'], 'Gold/silver miner and metals beta basket.'),
  ('Rare Earths', ARRAY['rare earth', 'critical mineral', 'lithium'], ARRAY['MP','UUUU'], 'Critical minerals and rare-earth supply-chain theme.'),
  ('Biotech', ARRAY['biotech', 'pharma', 'therapeutic', 'fda', 'trial'], ARRAY['MBOT','DRUG','TMDX','RXRX','DNA','SAVA','MRNA','BNTX','PFE','XBI'], 'Biotech catalyst and FDA-sensitive names.'),
  ('China ADR', ARRAY['china', 'hong kong', 'beijing', 'shanghai'], ARRAY['BABA','BIDU','JD','NIO','XPEV','LI'], 'China ADR risk-on/risk-off bucket.'),
  ('Crypto', ARRAY['crypto', 'bitcoin', 'blockchain', 'mining'], ARRAY['MARA','RIOT','COIN','CLSK','MSTR','HOOD','WULF','IREN','CIFR','BTDR'], 'Crypto equity beta basket.'),
  ('Fintech', ARRAY['fintech', 'payments', 'lending'], ARRAY['SEZL','AFRM','UPST','SOFI','PYPL','SQ','MELI','HOOD'], 'High-beta fintech and lending theme.'),
  ('Space', ARRAY['space', 'satellite', 'launch', 'lunar'], ARRAY['LUNR','RKLB','ASTS','IRDM'], 'Space and satellite momentum basket.'),
  ('EV', ARRAY['ev', 'electric vehicle', 'battery', 'charging'], ARRAY['TSLA','RIVN','LCID','GM','F'], 'EV and battery narrative bucket.'),
  ('Aviation', ARRAY['evtol', 'air taxi', 'aviation', 'aircraft'], ARRAY['ACHR','JOBY'], 'Air taxi and aviation speculation basket.')
ON CONFLICT (name) DO UPDATE SET
  aliases = EXCLUDED.aliases,
  tickers = EXCLUDED.tickers,
  note = EXCLUDED.note,
  active = TRUE;

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
