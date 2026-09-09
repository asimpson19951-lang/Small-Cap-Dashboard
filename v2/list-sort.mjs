// Session-only presentation ordering. Fresh page loads always start at Change % descending.
const choices = new Map();

export function nextSort(current, key) {
  if (current?.key !== key) return { key, direction: 'desc' };
  return current.direction === 'desc' ? { key, direction: 'asc' } : null;
}

export function numeric(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// BB has a categorical display: upper outside, upper touch, lower touch, lower outside.
// Signed completed days order rows within the outside groups. A dash stays unknown.
export function bandSortValue(row, { touches = true, position = false } = {}) {
  const days = numeric(row?.bb_completed_consec);
  if (days >= 1 && row?.bb_completed_side === 'UPPER') return [2, Math.trunc(days)];
  if (days >= 1 && row?.bb_completed_side === 'LOWER') return [-2, -Math.trunc(days)];
  if (touches && String(row?.bb_touch).toUpperCase() === 'UBB') return [1, 0];
  if (touches && String(row?.bb_touch).toUpperCase() === 'LBB') return [-1, 0];
  if (position && numeric(row?.bb_position) != null) return [0, numeric(row.bb_position)];
  return null;
}

function compareValue(a, b, direction) {
  const missingA = a == null, missingB = b == null;
  if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
  const sign = direction === 'asc' ? 1 : -1;
  if (Array.isArray(a) && Array.isArray(b)) return sign * ((a[0] - b[0]) || (a[1] - b[1]));
  return sign * (typeof a === 'number' && typeof b === 'number'
    ? a - b : String(a).localeCompare(String(b), 'en', { numeric: true }));
}

export function compareValues(a, b, sort = null) {
  const { key = 'change', direction = 'desc' } = sort || {};
  return compareValue(a[key], b[key], direction)
    || (key === 'change' ? 0 : compareValue(a.change, b.change, 'desc'))
    || String(a.name || '').localeCompare(String(b.name || ''), 'en');
}

export function defaultChangeOrder(a, b) {
  return compareValues({ name: a.ticker, change: numeric(a.change_pct) },
    { name: b.ticker, change: numeric(b.change_pct) });
}

// Enhance only explicitly identified stock lists. Move existing nodes so selection,
// listeners, detail links and keyboard traversal keep following the visible order.
export function wireStockList(root, { id, header, rows, columns }) {
  if (!root) return;
  const guide = root.querySelector(header);
  if (!guide) return;
  const controls = columns.map((column, index) => {
    const cell = guide.children[index];
    if (!cell) return null;
    let button = cell.matches('button') ? cell : cell.querySelector('.list-sort-button');
    if (!button) {
      button = root.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'list-sort-button';
      // Keep lane labels, counts, badges and other controls outside the sort button.
      if (cell.classList.contains('book-guide-first')) {
        button.innerHTML = cell.firstElementChild.innerHTML;
        cell.firstElementChild.replaceWith(button);
      } else {
        button.innerHTML = cell.innerHTML;
        cell.replaceChildren(button);
      }
      const arrow = root.ownerDocument.createElement('span');
      arrow.className = 'list-sort-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      button.append(arrow);
    }
    return { column, cell, button };
  }).filter(Boolean);

  function apply() {
    const selected = choices.get(id) || null;
    const effective = selected || { key: 'change', direction: 'desc' };
    const rowNodes = [...root.querySelectorAll(rows)];
    const values = new Map(rowNodes.map(node => [node, JSON.parse(node.dataset.sortValues)]));
    rowNodes.sort((a, b) => compareValues(values.get(a), values.get(b), selected));
    for (const node of rowNodes) node.parentElement.append(node);
    for (const { column, cell, button } of controls) {
      const active = column.key === effective.key;
      button.dataset.sortDirection = active ? effective.direction : 'none';
      button.querySelector('.list-sort-arrow').textContent = active
        ? effective.direction === 'desc' ? '▼' : '▲' : '↕';
      const next = nextSort(selected, column.key);
      const action = next ? `${column.label}: sort ${next.direction === 'desc' ? 'high to low' : 'low to high'}`
        : `${column.label}: restore default highest Change %`;
      button.setAttribute('aria-label', `${action}${active ? `; currently ${effective.direction === 'desc' ? 'descending' : 'ascending'}${selected ? '' : ' (default)'}` : ''}`);
      button.title = `${column.label}. Click: high to low, low to high, default highest Change %. Unknown values last.${column.key === 'bb' ? ' BB high to low: upper outside, upper touch, displayed band positions, lower touch, lower outside; completed days break ties.' : ''}`;
      if (cell.tagName === 'TH' || cell.getAttribute('role') === 'columnheader') cell.setAttribute('aria-sort', active ? effective.direction === 'desc' ? 'descending' : 'ascending' : 'none');
    }
  }
  for (const { column, button } of controls) {
    button.onclick = event => {
      event.stopPropagation();
      const next = nextSort(choices.get(id), column.key);
      if (next) choices.set(id, next); else choices.delete(id);
      apply();
    };
  }
  apply();
}
