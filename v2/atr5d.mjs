// Fixed five trading sessions. Do not substitute the legacy max-window atr_days.
export const ATR5D_TITLE = 'Latest session price minus the close five trading sessions earlier, divided by that session\'s Wilder ATR(14). Uses current price during a session and the last session close on closed days. Signed ATR units; not a trade signal.';

export function atr5dValue(row) {
  const raw = row?.atr_5d;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function formatAtr5d(row) {
  const value = atr5dValue(row);
  if (value == null) return '—';
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} ATR`;
}

export function atr5dTitle(row) {
  return atr5dValue(row) == null
    ? `Fixed 5D ATR unavailable; awaiting a valid five-session measurement. ${ATR5D_TITLE}`
    : ATR5D_TITLE;
}
