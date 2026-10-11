// Verified earnings-date overlay for the old Catalyst calendar panel (V2.18.0).
// The Finnhub feed carries wrong dates / sessions and stamps 12:00 ET on events with no time. This overlay
// applies calendar-mr.json (built from ER_DATES_VERIFIED.md): CONFIRMED rows take the company date + session,
// ESTIMATED rows are tagged "ESTIMATED", anything unchecked is tagged "UNVERIFIED (Finnhub)". An unknown time
// reads "time TBA", never a made-up clock time. Times are MT.
let erData = null;
export const setErData = (d) => { erData = d && Array.isArray(d.rows) ? d : null; };
export const getErData = () => erData;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const dayLabel = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MON[m - 1].toUpperCase()} ${d}`; };
const etYmd = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export const isPlaceholder = (iso) => /T12:00:00/.test(iso || '');

// -> { day: 'MON, OCT 19' | null (use default), time, session, status, source }
export function overlayEarnings(event, data = erData) {
  if (!event || event.kind !== 'EARNINGS') return null;
  const row = data?.rows?.find((r) => r.ticker === event.ticker);
  const v = row?.verified;
  if (row && row.date_status === 'CONFIRMED' && v?.date) {
    const time = v.release_mt ? `${v.release_mt} MT` : v.call_mt ? `call ${v.call_next_day ? 'next day ' : ''}${v.call_mt} MT` : 'time TBA';
    return { day: dayLabel(v.date), time, session: v.session, status: 'CONFIRMED', source: v.source?.url || null, note: v.finnhub_wrong ? 'Finnhub feed had it wrong' : null };
  }
  if (row && row.date_status === 'ESTIMATED') {
    return { day: v?.est_date ? dayLabel(v.est_date) : null, time: 'time TBA', session: null, status: 'ESTIMATED', source: v?.source?.url || null, note: 'no company date announced' };
  }
  return { day: null, time: isPlaceholder(event.starts_at) || !event.session ? 'time TBA' : null, session: event.session || null, status: 'UNVERIFIED', source: null, note: 'Finnhub date, not checked' };
}
