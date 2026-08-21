const SUPABASE_URL = 'https://wexnybuijhklmvwncdin.supabase.co';
// Public browser credential. The project RLS contract limits it to read-only surfaces.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndleG55YnVpamhrbG12d25jZGluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjQ5NzEsImV4cCI6MjA5MTQ0MDk3MX0.EYsozs5hxPeskYknXYkXr4mxnSLcjr513vEVr5V9pLI';
const ROW_FOLD = 8;

const state = {
  market: [],
  themes: [],
  filings: [],
  news: [],
  indices: [],
  scExpanded: false,
  mlExpanded: false,
  selected: null,
  chartTf: null,
  chartRequest: 0,
  loadedOnce: false,
};

const els = {
  freshness: document.getElementById('freshness'),
  freshnessText: document.getElementById('freshnessText'),
  refreshButton: document.getElementById('refreshButton'),
  marketStrip: document.getElementById('marketStrip'),
  scRows: document.getElementById('scRows'),
  mlRows: document.getElementById('mlRows'),
  scCount: document.getElementById('scCount'),
  mlCount: document.getElementById('mlCount'),
  scToggle: document.getElementById('scToggle'),
  mlToggle: document.getElementById('mlToggle'),
  themeGlance: document.getElementById('themeGlance'),
  themeBoard: document.getElementById('themeBoard'),
  detailBackdrop: document.getElementById('detailBackdrop'),
  detailDrawer: document.getElementById('detailDrawer'),
  detailClose: document.getElementById('detailClose'),
  detailClass: document.getElementById('detailClass'),
  detailTicker: document.getElementById('detailTicker'),
  detailSubhead: document.getElementById('detailSubhead'),
  detailFacts: document.getElementById('detailFacts'),
  detailContext: document.getElementById('detailContext'),
  detailSupply: document.getElementById('detailSupply'),
  detailSupplySection: document.getElementById('detailSupplySection'),
  detailNews: document.getElementById('detailNews'),
  chartHost: document.getElementById('chartHost'),
  chartNote: document.getElementById('chartNote'),
  toast: document.getElementById('toast'),
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function finite(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmtNumber(value, digits = 1) {
  const n = finite(value);
  return n == null ? '—' : n.toFixed(digits);
}

function fmtSigned(value, suffix = '%', digits = 1) {
  const n = finite(value);
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}${suffix}`;
}

function fmtPrice(value) {
  const n = finite(value);
  if (n == null) return '—';
  const digits = n < 1 ? 4 : n < 10 ? 2 : 2;
  return `$${n.toFixed(digits)}`;
}

function fmtCompact(value) {
  const n = finite(value);
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function fmtDate(value, withTime = false) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return '—';
  const options = withTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }
    : { month: 'short', day: 'numeric', timeZone: 'America/New_York' };
  return new Intl.DateTimeFormat('en-US', options).format(new Date(ms));
}

function relativeTime(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(ms)) return 'time unknown';
  const delta = Math.max(0, Date.now() - ms);
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function moveClass(value) {
  const n = finite(value);
  if (n == null || n === 0) return 'neutral';
  return n > 0 ? 'positive' : 'negative';
}

function tableUrl(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url;
}

async function restGet(table, params = {}) {
  const response = await fetch(tableUrl(table, params), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`${table} unavailable (${response.status})`);
  return response.json();
}

async function loadAll({ quiet = false } = {}) {
  els.refreshButton.disabled = true;
  els.refreshButton.textContent = '…';
  if (!quiet) setFreshness('loading', 'Refreshing read-only data…');

  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const requests = {
    market: restGet('market_data', { select: '*' }),
    themes: restGet('themes', { select: '*' }),
    filings: restGet('filings', { select: '*', order: 'detected_at.desc', limit: '240' }),
    news: restGet('news_cache', { select: '*', published_at: `gte.${since}`, order: 'published_at.desc', limit: '240' }),
    indices: restGet('system_state', { select: 'value', key: 'eq.indices', limit: '1' }),
  };

  const keys = Object.keys(requests);
  const settled = await Promise.allSettled(Object.values(requests));
  const failures = [];

  settled.forEach((result, index) => {
    const key = keys[index];
    if (result.status === 'fulfilled') {
      if (key === 'indices') state.indices = Array.isArray(result.value?.[0]?.value) ? result.value[0].value : [];
      else state[key] = Array.isArray(result.value) ? result.value : [];
    } else {
      failures.push(key);
    }
  });

  if (!state.market.length) {
    renderFatalBookError('Market rows are unavailable. The prototype will not infer or reuse stale values.');
    setFreshness('failed', 'Market data unavailable');
  } else {
    renderAll();
    updateFreshness(failures);
  }

  state.loadedOnce = true;
  els.refreshButton.disabled = false;
  els.refreshButton.textContent = '↻';

  if (failures.length) showToast(`Loaded with ${failures.join(', ')} unavailable.`);
}

function watchedRows(category) {
  return state.market
    .filter(row => row && row.watch !== false && row.category === category)
    .sort((a, b) => {
      const av = finite(a.change_pct);
      const bv = finite(b.change_pct);
      const am = av == null ? -Infinity : Math.abs(av);
      const bm = bv == null ? -Infinity : Math.abs(bv);
      if (bm !== am) return bm - am;
      return String(a.ticker || '').localeCompare(String(b.ticker || ''));
    });
}

function filingsFor(ticker) {
  return state.filings
    .filter(filing => String(filing?.ticker || '').toUpperCase() === ticker)
    .sort((a, b) => Date.parse(b.detected_at || b.filed_at || 0) - Date.parse(a.detected_at || a.filed_at || 0));
}

function newsFor(ticker) {
  return state.news
    .filter(item => String(item?.ticker || '').toUpperCase() === ticker)
    .sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0));
}

function latestFilingFact(row) {
  const filings = filingsFor(row.ticker);
  const active = filings.find(isCurrentDilutionEvidence);
  if (active) return { label: 'ACTIVE CAP', risk: true };
  if (row.supply_state) return { label: `SUP ${row.supply_state}`, risk: row.supply_state === 'BROKEN' };
  return { label: '—', risk: false };
}

function isCurrentDilutionEvidence(filing, nowMs = Date.now()) {
  if (filing?.lifecycle_state === 'ACTIVE_CAPACITY') return true;
  if (filing?.lifecycle_state !== 'TAKEDOWN') return false;
  if (filing?.filing_type !== '424B5' && filing?.filing_type !== 'ATM') return false;
  const observedMs = Date.parse(filing.detected_at || filing.filed_at || '');
  const ageMs = nowMs - observedMs;
  return Number.isFinite(observedMs) && ageMs >= 0 && ageMs <= 7 * 86400_000;
}

function bbLabel(row) {
  if (row.bb_open_out === 'UBB') return 'UBB OPEN';
  if (row.bb_open_out === 'LBB') return 'LBB OPEN';
  const pos = finite(row.bb_position);
  const days = finite(row.bb_consec);
  if (pos != null && pos > 100) return days && days > 0 ? `UBB ${days}d` : 'OUT UBB';
  if (pos != null && pos < 0) return days && days > 0 ? `LBB ${days}d` : 'OUT LBB';
  if (row.bb_touch === 'UBB') return 'TCH UBB';
  if (row.bb_touch === 'LBB') return 'TCH LBB';
  if (pos == null) return '—';
  return 'IN BAND';
}

function runLabel(row) {
  const run = finite(row.run_days);
  if (run == null) return 'D—';
  return `D${Math.max(0, Math.trunc(run))}${row.run_escalating === true ? ' ⇗' : ''}`;
}

function buildLabel(row) {
  const build = finite(row.build_days);
  if (build == null) return 'BUILD —';
  return `BUILD ${Math.max(0, Math.trunc(build))}d`;
}

function rowContext(row) {
  const news = newsFor(row.ticker)[0];
  const theme = row.theme ? String(row.theme) : '';
  const why = row.category === 'SC'
    ? (row.catalyst_cat || news?.headline || '')
    : (row.reason || row.catalyst_cat || news?.headline || '');
  return { theme, why };
}

function renderRow(row) {
  const context = rowContext(row);
  const filing = latestFilingFact(row);
  const isSC = row.category === 'SC';
  const frotTrusted = row.float_source === 'MASSIVE_FREE_FLOAT' || row.float_source === 'MANUAL';
  const frot = frotTrusted ? finite(row.float_rot) : null;
  const structureSub = [fmtSigned(row.ema8_dist), runLabel(row)].join(' · ');
  const rightMain = isSC ? (frot == null ? '—' : `${frot.toFixed(1)}×`) : buildLabel(row);
  const rightSub = isSC
    ? (frot == null ? 'FROT UNMEASURED' : 'FLOAT ROT')
    : (row.frd === true ? 'FRD' : (row.shape_state || ''));
  const contextHtml = [
    context.theme ? `<span class="theme-name">${esc(context.theme)}</span>` : '',
    context.why ? esc(context.why) : '',
  ].filter(Boolean).join(' · ');

  return `
    <button class="radar-row" type="button" data-ticker="${esc(row.ticker)}">
      <span class="name-cell">
        <span class="ticker-line"><span class="ticker">${esc(row.ticker)}</span><span class="price">${fmtPrice(row.price)}</span></span>
        <span class="context-line">${contextHtml || 'Context unavailable'}</span>
      </span>
      <span class="move-cell">
        <span class="move-value ${moveClass(row.change_pct)}">${fmtSigned(row.change_pct)}</span>
        <span class="cell-sub">SESSION</span>
      </span>
      <span class="structure-cell">
        <span class="bb-badge">${esc(bbLabel(row))}</span>
        <span class="cell-sub ma-text">${esc(structureSub)}</span>
      </span>
      <span class="supply-cell">
        ${isSC ? `<span class="supply-badge ${filing.risk ? 'risk' : 'clear'}">${esc(filing.label)}</span>` : `<span class="state-badge">${esc(rightMain)}</span>`}
        <span class="cell-sub">${esc(isSC ? rightSub : (rightSub || 'STRUCTURE'))}</span>
      </span>
    </button>`;
}

function renderBook(category) {
  const rows = watchedRows(category);
  const isSC = category === 'SC';
  const expanded = isSC ? state.scExpanded : state.mlExpanded;
  const visible = expanded ? rows : rows.slice(0, ROW_FOLD);
  const host = isSC ? els.scRows : els.mlRows;
  const count = isSC ? els.scCount : els.mlCount;
  const toggle = isSC ? els.scToggle : els.mlToggle;

  count.textContent = `${rows.length} watched · ${expanded ? 'all shown' : `top ${Math.min(ROW_FOLD, rows.length)} by |move|`}`;
  toggle.hidden = rows.length <= ROW_FOLD;
  toggle.textContent = expanded ? 'SHOW TOP' : `SHOW ALL ${rows.length}`;
  host.innerHTML = visible.length
    ? visible.map(renderRow).join('')
    : '<div class="empty-state">No verified watched names in this class.</div>';
}

function themeMove(theme, field = 'mov_1d') {
  return finite(theme?.[field]);
}

function activeThemes() {
  return state.themes
    .filter(theme => theme && theme.name && theme.stage !== 'DORMANT')
    .sort((a, b) => {
      const av = themeMove(a);
      const bv = themeMove(b);
      const am = av == null ? -Infinity : Math.abs(av);
      const bm = bv == null ? -Infinity : Math.abs(bv);
      if (bm !== am) return bm - am;
      return String(a.name).localeCompare(String(b.name));
    });
}

function constituentTicker(item) {
  if (typeof item === 'string') return item;
  return item?.ticker || item?.tk || item?.symbol || '';
}

function themeNarrative(theme) {
  const candidates = [theme.key_event, theme.narrative, Array.isArray(theme.bullets) ? theme.bullets[0] : theme.bullets];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      const text = candidate.text || candidate.headline || candidate.summary;
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
  }
  return 'No current narrative published.';
}

function leadersFor(theme, limit = 6) {
  const constituents = Array.isArray(theme.constituents) ? theme.constituents : [];
  return constituents
    .map(item => ({ ticker: constituentTicker(item), sc: item && typeof item === 'object' && item.sc === true }))
    .filter(item => item.ticker)
    .slice(0, limit);
}

function stageClass(stage) {
  if (['PARABOLIC', 'CRACKING', 'ACCELERATING'].includes(stage)) return 'hot';
  if (['EMERGING', 'BUILDING'].includes(stage)) return 'building';
  return 'cool';
}

function renderThemeGlance() {
  const themes = activeThemes().slice(0, 4);
  els.themeGlance.innerHTML = themes.length ? themes.map(theme => `
    <article class="theme-glance-card">
      <div class="theme-glance-top">
        <div class="theme-name-title">${esc(theme.name)}</div>
        <div class="theme-move ${moveClass(theme.mov_1d)}">${fmtSigned(theme.mov_1d)}</div>
      </div>
      <div class="theme-glance-meta">${esc(theme.stage || '—')} · 3D ${fmtSigned(theme.mov_3d)}${theme.sc_cluster === true ? ' · SC SYMPATHY' : ''}</div>
    </article>`).join('') : '<div class="empty-state">No active theme rows available.</div>';
}

function renderThemeBoard() {
  const themes = activeThemes();
  els.themeBoard.innerHTML = themes.length ? themes.map(theme => {
    const leaders = leadersFor(theme);
    const breadth = finite(theme.breadth);
    return `
      <article class="theme-card">
        <div class="theme-card-top">
          <div>
            <div class="theme-name-title">${esc(theme.name)}</div>
            <span class="stage-badge ${stageClass(theme.stage)}">${esc(theme.stage || '—')}</span>
          </div>
          <div class="theme-move ${moveClass(theme.mov_1d)}">${fmtSigned(theme.mov_1d)}</div>
        </div>
        <div class="theme-meta">1D ${fmtSigned(theme.mov_1d)} · 3D ${fmtSigned(theme.mov_3d)} · BREADTH ${breadth == null ? '—' : `${breadth.toFixed(0)}%`}${theme.sc_cluster === true ? ' · SC SYMPATHY, NOT ML STRUCTURE' : ''}</div>
        <p class="theme-narrative">${esc(themeNarrative(theme))}</p>
        <div class="theme-leaders">${leaders.length ? leaders.map(leader => `<span class="leader-chip ${leader.sc ? 'sc' : ''}">${esc(leader.ticker)}${leader.sc ? ' · SC' : ''}</span>`).join('') : '<span class="empty-copy">Constituents unavailable.</span>'}</div>
      </article>`;
  }).join('') : '<div class="empty-state">Theme engine returned no active rows.</div>';
}

function renderMarketStrip() {
  const indices = state.indices.slice(0, 7);
  if (!indices.length) {
    els.marketStrip.innerHTML = '<div class="empty-state">Market context unavailable.</div>';
    return;
  }
  els.marketStrip.innerHTML = indices.map(item => {
    const symbol = item.symbol || item.ticker || item.label || '—';
    const value = item.price ?? item.value ?? item.quote;
    const change = item.chg ?? item.change_pct ?? item.change ?? item.pct;
    return `
      <div class="market-chip">
        <span class="market-symbol">${esc(symbol)}</span>
        <span class="market-value"><span>${fmtPrice(value)}</span><br><span class="${moveClass(change)}">${fmtSigned(change)}</span></span>
      </div>`;
  }).join('');
}

function renderAll() {
  renderMarketStrip();
  renderBook('SC');
  renderBook('ML');
  renderThemeGlance();
  renderThemeBoard();
}

function renderFatalBookError(message) {
  const html = `<div class="error-state">${esc(message)}</div>`;
  els.scRows.innerHTML = html;
  els.mlRows.innerHTML = html;
  els.scCount.textContent = 'unavailable';
  els.mlCount.textContent = 'unavailable';
}

function setFreshness(kind, label) {
  els.freshness.className = `freshness ${kind}`;
  els.freshnessText.textContent = label;
}

function updateFreshness(failures = []) {
  const rowTimes = state.market.map(row => Date.parse(row.updated_at || '')).filter(Number.isFinite);
  const latest = rowTimes.length ? Math.max(...rowTimes) : NaN;
  if (!Number.isFinite(latest)) {
    setFreshness('stale', failures.length ? 'Loaded with gaps' : 'Row time unknown');
    return;
  }
  const age = Date.now() - latest;
  const kind = failures.length ? 'stale' : age <= 15 * 60000 ? 'fresh' : 'stale';
  const suffix = failures.length ? ` · ${failures.join(', ')} unavailable` : '';
  setFreshness(kind, `Rows ${relativeTime(latest)}${suffix}`);
}

function switchView(view) {
  document.querySelectorAll('[data-view-panel]').forEach(panel => {
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  document.querySelectorAll('.view-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fact(label, value, className = '') {
  return `<div class="fact"><div class="fact-label">${esc(label)}</div><div class="fact-value ${className}">${esc(value ?? '—')}</div></div>`;
}

function openDetail(ticker) {
  const row = state.market.find(item => item.ticker === ticker);
  if (!row) return;
  state.selected = row;
  state.chartTf = row.category === 'SC' ? '2m' : 'D';

  const context = rowContext(row);
  els.detailClass.textContent = row.category === 'SC' ? 'SMALL CAP · INTRADAY CONTEXT' : 'MID / LARGE · SWING CONTEXT';
  els.detailTicker.textContent = row.ticker;
  els.detailSubhead.innerHTML = `<span class="${moveClass(row.change_pct)}">${fmtSigned(row.change_pct)}</span> · ${fmtPrice(row.price)} · ${esc(context.theme || 'No theme attached')}`;

  const sharedFacts = [
    fact('Price', fmtPrice(row.price)),
    fact('Session', fmtSigned(row.change_pct), moveClass(row.change_pct)),
    fact('8EMA', fmtSigned(row.ema8_dist), 'ma-text'),
    fact('Bollinger', bbLabel(row)),
    fact('Run', runLabel(row)),
    fact('Build clock', buildLabel(row)),
    fact('Daily ATR', finite(row.atr) == null ? '—' : `$${fmtNumber(row.atr, row.atr < 1 ? 4 : 2)}`),
    fact('ATR move', finite(row.atr_days) == null ? '—' : `${fmtSigned(row.atr_days, ' ATR')}`),
    fact('Shape', row.shape_state || '—'),
  ];
  const scFacts = [
    fact('Float', (row.float_source === 'MASSIVE_FREE_FLOAT' || row.float_source === 'MANUAL') ? fmtCompact(row.float_size) : '—'),
    fact('Float rotation', (row.float_source === 'MASSIVE_FREE_FLOAT' || row.float_source === 'MANUAL') && finite(row.float_rot) != null ? `${fmtNumber(row.float_rot)}×` : '—'),
    fact('Short interest', finite(row.si_pct) == null ? '—' : `${fmtNumber(row.si_pct, 0)}%`),
    fact('Borrow', finite(row.borrow_fee) == null ? '—' : `${fmtNumber(row.borrow_fee, 0)}% APR`),
    fact('Supply state', row.supply_state || '—'),
    fact('VWAP', fmtSigned(row.vwap_dist)),
  ];
  const mlFacts = [
    fact('200SMA', fmtSigned(row.sma200_dist_pct), 'ma-text'),
    fact('Volume', finite(row.volume_ratio) == null ? '—' : `${fmtNumber(row.volume_ratio)}×`),
    fact('FRD', row.frd === true ? 'YES' : row.frd === false ? 'NO' : '—'),
  ];
  els.detailFacts.innerHTML = [...sharedFacts, ...(row.category === 'SC' ? scFacts : mlFacts)].join('');

  const contextLines = [
    context.theme ? `<div class="context-copy"><strong>Theme:</strong> ${esc(context.theme)}</div>` : '',
    context.why ? `<div class="context-copy"><strong>Current reason:</strong> ${esc(context.why)}</div>` : '',
    row.catalyst_cat ? `<div class="context-copy"><strong>Catalyst class:</strong> ${esc(row.catalyst_cat)}</div>` : '',
  ].filter(Boolean);
  els.detailContext.innerHTML = contextLines.length ? contextLines.join('') : '<div class="empty-copy">No verified context is attached to this row.</div>';

  const filings = filingsFor(row.ticker).slice(0, 6);
  els.detailSupplySection.hidden = row.category !== 'SC';
  els.detailSupply.innerHTML = filings.length ? filings.map(filing => `
    <div class="filing-item">
      <strong>${esc(filing.filing_type || 'FILING')}</strong>${filing.lifecycle_state ? ` · ${esc(filing.lifecycle_state)}` : ''}
      ${filing.summary ? `<div>${esc(filing.summary)}</div>` : ''}
      <div class="item-meta">${fmtDate(filing.filed_at || filing.detected_at)} · ${esc(filing.risk_level || 'risk not assigned')}</div>
    </div>`).join('') : '<div class="empty-copy">No filing evidence returned for this ticker.</div>';

  const news = newsFor(row.ticker).slice(0, 5);
  els.detailNews.innerHTML = news.length ? news.map(item => `
    <div class="news-item">
      <div>${esc(item.headline || 'Untitled headline')}</div>
      <div class="item-meta">${esc(item.source || 'source unknown')} · ${relativeTime(item.published_at)}</div>
    </div>`).join('') : '<div class="empty-copy">No verified headline in the last 48 hours.</div>';

  document.body.style.overflow = 'hidden';
  els.detailBackdrop.hidden = false;
  els.detailDrawer.classList.add('open');
  els.detailDrawer.setAttribute('aria-hidden', 'false');
  updateChartTabs();
  loadChart(row.ticker, state.chartTf);
}

function closeDetail() {
  state.chartRequest += 1;
  state.selected = null;
  els.detailDrawer.classList.remove('open');
  els.detailDrawer.setAttribute('aria-hidden', 'true');
  els.detailBackdrop.hidden = true;
  document.body.style.overflow = '';
}

function updateChartTabs() {
  document.querySelectorAll('[data-chart-tf]').forEach(button => {
    button.classList.toggle('active', button.dataset.chartTf === state.chartTf);
  });
}

async function fetchChart(ticker, tf) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/chart-bars`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ticker, tf }),
  });
  let body = null;
  try { body = await response.json(); } catch { /* response body is optional on failure */ }
  if (!response.ok || body?.error) throw new Error(body?.error || `Chart unavailable (${response.status})`);
  return Array.isArray(body?.bars) ? body.bars : [];
}

async function loadChart(ticker, tf) {
  const request = ++state.chartRequest;
  els.chartHost.innerHTML = '<div class="loading-card" style="width:100%;height:260px">Loading chart…</div>';
  els.chartNote.textContent = tf === '2m' ? 'Delayed 2-minute evidence — execution stays on DAS.' : 'Daily context.';
  try {
    const bars = await fetchChart(ticker, tf);
    if (request !== state.chartRequest) return;
    renderCandles(bars, tf);
  } catch (error) {
    if (request !== state.chartRequest) return;
    els.chartHost.innerHTML = `<div class="error-state">${esc(error.message || 'Chart unavailable.')}</div>`;
  }
}

function renderCandles(rawBars, tf) {
  const maxBars = tf === '2m' ? 110 : 120;
  const bars = rawBars
    .filter(bar => [bar?.o, bar?.h, bar?.l, bar?.c].every(value => finite(value) != null))
    .slice(-maxBars);
  if (!bars.length) {
    els.chartHost.innerHTML = '<div class="empty-state">No bars returned.</div>';
    return;
  }

  const width = 640;
  const height = 280;
  const top = 18;
  const right = 58;
  const bottom = 28;
  const left = 12;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const lows = bars.map(bar => Number(bar.l));
  const highs = bars.map(bar => Number(bar.h));
  let low = Math.min(...lows);
  let high = Math.max(...highs);
  if (high === low) { high += 1; low -= 1; }
  const pad = (high - low) * 0.06;
  high += pad;
  low -= pad;
  const y = value => top + ((high - value) / (high - low)) * plotH;
  const step = plotW / bars.length;
  const bodyW = Math.max(1, Math.min(6, step * 0.62));

  const grid = [0, 0.25, 0.5, 0.75, 1].map(part => {
    const gy = top + plotH * part;
    const price = high - (high - low) * part;
    return `<line x1="${left}" y1="${gy.toFixed(2)}" x2="${left + plotW}" y2="${gy.toFixed(2)}" stroke="#20252c" stroke-width="1"/><text x="${width - 5}" y="${(gy + 3).toFixed(2)}" fill="#929aa4" font-size="9" font-family="monospace" text-anchor="end">${price.toFixed(price < 10 ? 2 : 1)}</text>`;
  }).join('');

  const candles = bars.map((bar, index) => {
    const open = Number(bar.o);
    const close = Number(bar.c);
    const highY = y(Number(bar.h));
    const lowY = y(Number(bar.l));
    const openY = y(open);
    const closeY = y(close);
    const up = close >= open;
    const color = up ? '#58b77a' : '#e05a5a';
    const x = left + index * step + step / 2;
    const rectY = Math.min(openY, closeY);
    const rectH = Math.max(1, Math.abs(closeY - openY));
    return `<line x1="${x.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${x.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${color}" stroke-width="1"/><rect x="${(x - bodyW / 2).toFixed(2)}" y="${rectY.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${rectH.toFixed(2)}" fill="${color}"/>`;
  }).join('');

  const last = bars[bars.length - 1];
  const lastClose = Number(last.c);
  const lastY = y(lastClose);
  const lastColor = lastClose >= Number(last.o) ? '#58b77a' : '#e05a5a';
  const lastLine = `<line x1="${left}" y1="${lastY.toFixed(2)}" x2="${left + plotW}" y2="${lastY.toFixed(2)}" stroke="${lastColor}" stroke-width="1" stroke-dasharray="3 4" opacity="0.65"/><text x="${width - 5}" y="${(lastY - 5).toFixed(2)}" fill="${lastColor}" font-size="10" font-weight="700" font-family="monospace" text-anchor="end">${lastClose.toFixed(lastClose < 10 ? 2 : 1)}</text>`;

  els.chartHost.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(state.selected?.ticker || '')} ${esc(tf)} candlestick chart"><rect width="${width}" height="${height}" fill="#090b0d"/>${grid}${candles}${lastLine}<text x="${left}" y="${height - 8}" fill="#929aa4" font-size="9" font-family="monospace">${bars.length} bars · ${esc(tf)}${tf === '2m' ? ' · DELAYED' : ''}</text></svg>`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { els.toast.hidden = true; }, 4200);
}

document.addEventListener('click', event => {
  const tickerButton = event.target.closest('[data-ticker]');
  if (tickerButton) { openDetail(tickerButton.dataset.ticker); return; }

  const viewButton = event.target.closest('[data-view], [data-switch-view]');
  if (viewButton) { switchView(viewButton.dataset.view || viewButton.dataset.switchView); return; }

  const chartButton = event.target.closest('[data-chart-tf]');
  if (chartButton && state.selected) {
    state.chartTf = chartButton.dataset.chartTf;
    updateChartTabs();
    loadChart(state.selected.ticker, state.chartTf);
  }
});

els.scToggle.addEventListener('click', () => { state.scExpanded = !state.scExpanded; renderBook('SC'); });
els.mlToggle.addEventListener('click', () => { state.mlExpanded = !state.mlExpanded; renderBook('ML'); });
els.refreshButton.addEventListener('click', () => loadAll());
els.detailClose.addEventListener('click', closeDetail);
els.detailBackdrop.addEventListener('click', closeDetail);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.selected) closeDetail();
  if ((event.key === '1' || event.key === '2') && !state.selected && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    switchView(event.key === '1' ? 'now' : 'themes');
  }
});

loadAll();
setInterval(() => {
  if (document.visibilityState === 'visible') loadAll({ quiet: true });
}, 120000);
