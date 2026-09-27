const POLYMARKET_EVENT_URL = 'https://polymarket.com/event/';
const KALSHI_API_URL = 'https://external-api.kalshi.com/trade-api/v2/markets/';

export function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function probabilityValue(value) {
  const number = finiteOrNull(value);
  return number != null && number >= 0 && number <= 1 ? number : null;
}

function parseStringArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function round(value, digits = 2) {
  const number = finiteOrNull(value);
  if (number == null) return null;
  const power = 10 ** digits;
  return Math.round(number * power) / power;
}

function validIso(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function evidenceState({ provider, contractId, question, probabilityPct, closesAt, sourceUrl }) {
  if (!provider || !contractId || !question || probabilityPct == null || !closesAt || !sourceUrl) return 'PARTIAL';
  return 'MEASURED';
}

export function normalizeKalshiMarket(market, meta = {}, observedAt = new Date().toISOString()) {
  const bid = probabilityValue(market?.yes_bid_dollars);
  const ask = probabilityValue(market?.yes_ask_dollars);
  const last = probabilityValue(market?.last_price_dollars);
  const previous = probabilityValue(market?.previous_price_dollars);
  const hasBook = bid != null && ask != null && bid <= ask;
  const midpoint = hasBook ? (bid + ask) / 2 : null;
  const probability = midpoint ?? last;
  const contractId = String(market?.ticker || '');
  const question = String(meta.label || market?.title || '').trim();
  const closesAt = validIso(market?.close_time);
  const sourceUrl = contractId ? `${KALSHI_API_URL}${encodeURIComponent(contractId)}` : null;
  const spread = hasBook ? ask - bid : null;
  const notes = [];
  if (!hasBook && last != null) notes.push('Last trade used because a two-sided book was unavailable.');
  if (spread != null && spread > 0.05) notes.push('Wide bid/ask spread.');
  if (finiteOrNull(market?.liquidity_dollars) != null) notes.push('Kalshi liquidity field omitted because the provider deprecates it.');
  const probabilityPct = probability == null ? null : round(probability * 100, 1);
  return {
    topic_id: meta.topicId || 'unmapped',
    topic_label: meta.topicLabel || 'Unmapped event',
    related_themes: Array.isArray(meta.relatedThemes) ? meta.relatedThemes : [],
    provider: 'KALSHI',
    series_ticker: meta.seriesTicker || null,
    event_ticker: market?.event_ticker || null,
    contract_id: contractId || null,
    question,
    contract_label: String(meta.contractLabel || market?.yes_sub_title || market?.subtitle || '').trim() || null,
    probability_pct: probabilityPct,
    probability_method: midpoint != null ? 'YES_BID_ASK_MIDPOINT' : last != null ? 'LAST_TRADE' : null,
    yes_bid_pct: bid == null ? null : round(bid * 100, 1),
    yes_ask_pct: ask == null ? null : round(ask * 100, 1),
    spread_pp: spread == null ? null : round(spread * 100, 1),
    delta_reference_pp: last == null || previous == null ? null : round((last - previous) * 100, 1),
    delta_reference_label: last == null || previous == null ? null : 'PREV',
    delta_1h_pp: null,
    delta_24h_pp: null,
    delta_7d_pp: null,
    volume_24h_contracts: round(market?.volume_24h_fp, 0),
    volume_24h_usd: null,
    open_interest_contracts: round(market?.open_interest_fp, 0),
    liquidity_usd: null,
    closes_at: closesAt,
    observed_at: validIso(observedAt),
    source_url: sourceUrl,
    rules_text: String(market?.rules_primary || '').trim() || null,
    evidence_state: evidenceState({ provider: 'KALSHI', contractId, question, probabilityPct, closesAt, sourceUrl }),
    quality_notes: notes,
  };
}

export function normalizePolymarketMarket(event, market, meta = {}, observedAt = new Date().toISOString()) {
  const outcomes = parseStringArray(market?.outcomes);
  const prices = parseStringArray(market?.outcomePrices).map(probabilityValue);
  const yesIndex = outcomes.findIndex(outcome => outcome.toLowerCase() === 'yes');
  const yesPrice = yesIndex >= 0 ? prices[yesIndex] : null;
  const bid = probabilityValue(market?.bestBid);
  const ask = probabilityValue(market?.bestAsk);
  const spread = bid != null && ask != null && bid <= ask ? ask - bid : finiteOrNull(market?.spread);
  const contractId = String(market?.id || '');
  const slug = String(event?.slug || '');
  const sourceUrl = slug ? `${POLYMARKET_EVENT_URL}${encodeURIComponent(slug)}` : null;
  const question = String(meta.label || market?.question || event?.title || '').trim();
  const closesAt = validIso(market?.endDate || event?.endDate);
  const notes = [];
  if (yesPrice == null) notes.push('YES outcome price unavailable or malformed.');
  if (spread != null && spread > 0.05) notes.push('Wide bid/ask spread.');
  const probabilityPct = yesPrice == null ? null : round(yesPrice * 100, 1);
  return {
    topic_id: meta.topicId || 'unmapped',
    topic_label: meta.topicLabel || String(event?.title || 'Unmapped event'),
    related_themes: Array.isArray(meta.relatedThemes) ? meta.relatedThemes : [],
    provider: 'POLYMARKET',
    event_id: event?.id != null ? String(event.id) : null,
    event_slug: slug || null,
    contract_id: contractId || null,
    question,
    contract_label: String(meta.contractLabel || market?.groupItemTitle || '').trim() || null,
    probability_pct: probabilityPct,
    probability_method: yesPrice == null ? null : 'YES_OUTCOME_PRICE',
    yes_bid_pct: bid == null ? null : round(bid * 100, 1),
    yes_ask_pct: ask == null ? null : round(ask * 100, 1),
    spread_pp: spread == null ? null : round(spread * 100, 1),
    delta_reference_pp: null,
    delta_reference_label: null,
    delta_1h_pp: finiteOrNull(market?.oneHourPriceChange) == null ? null : round(Number(market.oneHourPriceChange) * 100, 1),
    delta_24h_pp: finiteOrNull(market?.oneDayPriceChange) == null ? null : round(Number(market.oneDayPriceChange) * 100, 1),
    delta_7d_pp: finiteOrNull(market?.oneWeekPriceChange) == null ? null : round(Number(market.oneWeekPriceChange) * 100, 1),
    volume_24h_contracts: null,
    volume_24h_usd: round(market?.volume24hr, 0),
    open_interest_contracts: null,
    liquidity_usd: round(market?.liquidity, 0),
    closes_at: closesAt,
    observed_at: validIso(observedAt),
    source_url: sourceUrl,
    rules_text: String(market?.resolutionSource || event?.resolutionSource || '').trim() || null,
    evidence_state: evidenceState({ provider: 'POLYMARKET', contractId, question, probabilityPct, closesAt, sourceUrl }),
    quality_notes: notes,
  };
}

export function findPolymarketMarket(event, marketId) {
  return (Array.isArray(event?.markets) ? event.markets : []).find(market => String(market?.id) === String(marketId)) || null;
}

export function groupContracts(contracts, registry) {
  return registry.map(topic => ({
    id: topic.id,
    label: topic.label,
    related_themes: topic.relatedThemes,
    contracts: contracts.filter(contract => contract.topic_id === topic.id),
  })).filter(topic => topic.contracts.length);
}
