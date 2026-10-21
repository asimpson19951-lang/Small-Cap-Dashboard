// NYSE cash-equity sessions, verified 2026-09-06 against:
// https://www.nyse.com/trade/hours-calendars
// Public browser mirror: v2/market-calendar.mjs (must remain byte-identical).
// Unknown years fail closed. Renew before 2029; add verified emergency closures.
const CLOSED = new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31',
  '2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
  '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19',
  '2028-07-04','2028-09-04','2028-11-23','2028-12-25',
]);
const EARLY = new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
const DAY = 86400000;
export function validSessionDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === value;
}
export function isTradingSession(date) {
  if (!validSessionDate(date) || date < '2026-01-01' || date > '2028-12-31') return null;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !CLOSED.has(date);
}
export function sessionCloseMinute(date) {
  return isTradingSession(date) === true ? (EARLY.has(date) ? 13 : 16) * 60 : null;
}
export function previousTradingSession(date, inclusive = false) {
  if (isTradingSession(date) == null) return null;
  let ms = Date.parse(`${date}T00:00:00Z`) - (inclusive ? 0 : DAY);
  for (let n = 0; n < 12; n++, ms -= DAY) {
    const key = new Date(ms).toISOString().slice(0,10), open = isTradingSession(key);
    if (open == null) return null;
    if (open) return key;
  }
  return null;
}
export function tradingSessionDates(asOf, count = 6) {
  if (!Number.isInteger(count) || count < 1 || count > 366) return null;
  const dates = [];
  let date = previousTradingSession(asOf, true);
  while (dates.length < count) {
    if (!date) return null;
    dates.unshift(date);
    if (dates.length < count) date = previousTradingSession(date);
  }
  return dates;
}
export function tradingSessionGap(from, through) {
  if (isTradingSession(from) == null || isTradingSession(through) == null || through < from) return null;
  let count = 0;
  for (let ms = Date.parse(`${from}T00:00:00Z`) + DAY; ms <= Date.parse(`${through}T00:00:00Z`); ms += DAY) {
    if (isTradingSession(new Date(ms).toISOString().slice(0,10))) count++;
  }
  return count;
}
export function marketSessionClock(nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date(nowMs)).map(v=>[v.type,v.value]));
  const date = `${p.year}-${p.month}-${p.day}`, open = isTradingSession(date);
  const sessionDate = previousTradingSession(date, true);
  if (open == null || !sessionDate) return null;
  const minute = Number(p.hour)*60+Number(p.minute);
  const completed = !open || minute >= sessionCloseMinute(date)+15;
  return {date,minute,sessionDate,closedDay:!open,completed,closeMinute:sessionCloseMinute(sessionDate)};
}
