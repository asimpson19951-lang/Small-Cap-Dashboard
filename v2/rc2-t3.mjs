// RC2 C3c entry: mounts the Smart money top block (Themes retired V2.22.0) the first time each tab is shown (History is mounted by
// history-tab.mjs itself, opt-in rc2). Static feeds only, so a Supabase 500 / 503 never blanks these blocks.
const TABS = {
  smartmoney: { host: 'r3Smart', before: 'sm2Root', panel: 'view-smartmoney', mod: './rc2-t3-smart.mjs?v=V2.23.1', fn: 'mountRc2Smart' },
};
const done = new Set();
function mount(key) {
  if (done.has(key)) return; const T = TABS[key];
  const anchor = document.getElementById(T.before); if (!anchor) return;
  done.add(key);
  const host = document.createElement('div'); host.id = T.host; host.className = 'r3-host';
  anchor.parentElement.insertBefore(host, anchor);
  document.getElementById(T.panel)?.classList.add('r3-on');
  import(T.mod).then((m) => m[T.fn](host)).catch((e) => { done.delete(key); host.textContent = `RC2 block could not load: ${e.message}`; });
}
document.addEventListener('click', (e) => { const t = e.target.closest?.('.view-tab[data-view]'); if (t && TABS[t.dataset.view]) setTimeout(() => mount(t.dataset.view), 0); });
const boot = () => { for (const k of Object.keys(TABS)) { const p = document.getElementById(TABS[k].panel); if (p && !p.hidden) mount(k); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
setTimeout(boot, 1500);
