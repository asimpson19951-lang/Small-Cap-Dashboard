// info-chip.mjs: the one place provenance lives (BOARD_RULES R54, Austin Nov 24 2026: "There is this wasted text at the
// top of every page. Kill this."). Build / as-of / source strings and the old summary paragraph fold into a small ⓘ chip
// beside the tab title; hover or focus shows them. Pure helpers, no side effects.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Strip tags and collapse whitespace so an HTML fragment can live in a title attribute. */
export function plainText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' · ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** ⓘ chip. parts: strings or HTML fragments (falsy parts skipped), joined one per line in the tooltip. */
export function infoChip(...parts) {
  const lines = parts.flat().map(plainText).filter(Boolean);
  if (!lines.length) return '';
  const t = lines.join('\n');
  return `<span class="info-chip" tabindex="0" role="note" title="${esc(t)}" aria-label="About this data: ${esc(t)}" data-info-chip>i</span>`;
}

/** The balanced <tag …>…</tag> element that starts at index i of s (string), or null. */
function balanced(s, i, tag) {
  const re = new RegExp(`<${tag}(?=[\\s>])|</${tag}>`, 'gi');
  re.lastIndex = i;
  let depth = 0, m;
  while ((m = re.exec(s))) {
    if (m[0][1] === '/') { depth -= 1; if (depth === 0) return s.slice(i, re.lastIndex); } else depth += 1;
  }
  return null;
}

/**
 * foldHead(html, opts): R54 for modules that render their own head. In the FIRST head block of `html`, the provenance line
 * (span/div .meta, .r2-meta, .ixq-meta) and the summary paragraph right after the head (p.read) are removed and their text
 * goes into an ⓘ chip after the title. opts.demote = true turns the head's h1 into an h2 (a second module on a tab that
 * already has its title). Deterministic string work; HTML without a head is returned unchanged.
 */
export function foldHead(html, { demote = false } = {}) {
  const s = String(html ?? '');
  const hm = /<(div|header) class="(?:head|ixq-head)\b[^"]*"[^>]*>/.exec(s);
  if (!hm) return s;
  const headStr = balanced(s, hm.index, hm[1]);
  if (!headStr) return s;
  const parts = [];
  let head = headStr;
  const mm = /<(span|div) class="(?:meta|r2-meta|ixq-meta)\b[^"]*"[^>]*>/.exec(head);
  if (mm) { const m = balanced(head, mm.index, mm[1]); if (m) { parts.push(m); head = head.slice(0, mm.index) + head.slice(mm.index + m.length); } }
  let tail = s.slice(hm.index + headStr.length);
  const pm = /^(\s*)<p class="read\b[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(tail);
  if (pm) { parts.push(pm[2]); tail = pm[1] + tail.slice(pm[0].length); }
  if (demote) head = head.replace(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/, '<h2 class="sec-title"$1>$2</h2>');
  const chip = infoChip(...parts);
  head = /<\/h[12]>/.test(head) ? head.replace(/(<\/h[12]>)/, `$1${chip}`) : head.replace(/(<\/(?:div|header)>)$/, `${chip}$1`);
  return s.slice(0, hm.index) + head + tail;
}
