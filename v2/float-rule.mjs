// RC2 fix #5: one float plausibility rule for the Now stat block and the live detail tile.
// A feed float is "not measured" (and float rotation is not printed) when it is
//   (a) larger than shares outstanding, or smaller than 1% of shares outstanding, or
//   (b) smaller than 1% of the session's share volume (rotation over 100x).
// No replacement value is invented. Pure, no DOM.
export const FLOAT_MIN_SHARE_OF_SO = 0.01;
export const FLOAT_MIN_SHARE_OF_VOLUME = 0.01;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export function floatVerdict(flt, so, vol) {
  if (!fin(flt) || flt <= 0) return { state: 'missing', why: 'the feed carries no float' };
  if (fin(so) && so > 0 && flt > so) return { state: 'implausible', why: 'larger than shares outstanding' };
  if (fin(so) && so > 0 && flt < so * FLOAT_MIN_SHARE_OF_SO) return { state: 'implausible', why: 'under 1% of shares outstanding' };
  if (fin(vol) && vol > 0 && flt < vol * FLOAT_MIN_SHARE_OF_VOLUME) return { state: 'implausible', why: "under 1% of the session's share volume" };
  return { state: 'ok', why: '' };
}

export const FLOAT_RULE_NOTE = 'Float is printed only when it is believable: a feed float larger than shares outstanding, under 1% of shares outstanding, or under 1% of the session’s share volume prints "float not measured" and float rotation is dropped. No replacement value is used.';
