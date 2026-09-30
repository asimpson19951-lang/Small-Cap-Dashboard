import { compareValues } from './list-sort.mjs?v=V2.16.2';

export const TI_DEFAULT_SORT = Object.freeze({ key: 'time', direction: 'desc' });

export function tiTimestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function compareTiValues(a, b, sort = TI_DEFAULT_SORT) {
  return compareValues(a, b, sort || TI_DEFAULT_SORT);
}
