const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5],
  lb: [45, 35, 25, 10, 5, 2.5],
};
const BARS = { kg: [15, 20], lb: [35, 45] };
// color, svg height, svg thickness, light (dark text)
const STYLE = {
  kg: {
    25:   { c: '#d62828', h: 180, t: 15 },
    20:   { c: '#1f5fd6', h: 180, t: 13 },
    15:   { c: '#eab308', h: 180, t: 11, light: true },
    10:   { c: '#16a34a', h: 180, t: 9 },
    5:    { c: '#eef1f5', h: 116, t: 7, light: true },
    2.5:  { c: '#2b2f38', h: 92,  t: 6 },
    1.25: { c: '#a3aab6', h: 74,  t: 5, light: true },
    1:    { c: '#15803d', h: 64,  t: 4 },
    0.5:  { c: '#cbd5e1', h: 56,  t: 3, light: true },
  },
  lb: {
    45:  { c: '#1f5fd6', h: 180, t: 15 },
    35:  { c: '#eab308', h: 160, t: 13, light: true },
    25:  { c: '#16a34a', h: 136, t: 11 },
    10:  { c: '#eef1f5', h: 104, t: 8, light: true },
    5:   { c: '#d62828', h: 88,  t: 6 },
    2.5: { c: '#a3aab6', h: 72,  t: 5, light: true },
  },
};

const STORE_KEY = 'barbell-calc-v1';
const defaults = () => ({
  unit: 'kg',
  tab: 'manual',
  bar: { kg: 20, lb: 45 },          // number or 'custom'
  customBar: { kg: '', lb: '' },
  side: { kg: [], lb: [] },
  inv: { kg: {}, lb: {} },          // weight -> pairs (missing = unlimited)
  target: { kg: '', lb: '' },
});
let state = load();
let history = [];

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.unit) return Object.assign(defaults(), s);
  } catch (e) {}
  return defaults();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

const $ = id => document.getElementById(id);
const fmt = n => String(Math.round(n * 1000) / 1000);
const buzz = () => { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} };

const U = () => state.unit;
const plates = () => PLATES[U()];
const side = () => state.side[U()];
const sideSum = () => side().reduce((a, b) => a + b, 0);
const limitOf = w => { const v = state.inv[U()][w]; return v == null ? Infinity : v; };
const usedOf = w => side().filter(x => x === w).length;

function barWeight() {
  const b = state.bar[U()];
  if (b === 'custom') {
    const v = parseFloat(state.customBar[U()]);
    return isFinite(v) && v >= 0 ? v : 0;
  }
  return b;
}

function setSide(next) {
  history.push(side().slice());
  if (history.length > 60) history.shift();
  state.side[U()] = next;
}

/* ---------- reverse solve ---------- */
// Finds plates for one side: exact match with fewest plates (heaviest first on ties),
// otherwise the heaviest reachable load not exceeding the target.
function solve(perSide) {
  const Q = 4; // quarter units handle 1.25 / 2.5
  const T = Math.floor(perSide * Q + 1e-6);
  const items = plates().map(w => {
    const u = Math.round(w * Q);
    return { w, u, max: Math.min(limitOf(w), Math.floor(T / u)) };
  });
  const reach = new Uint8Array(T + 1);
  reach[0] = 1;
  for (const it of items)
    for (let k = 0; k < it.max; k++)
      for (let v = T; v >= it.u; v--)
        if (reach[v - it.u]) reach[v] = 1;
  let goal = T;
  while (goal > 0 && !reach[goal]) goal--;

  let best = [], bestN = Infinity;
  const cur = [];
  (function dfs(i, rem, n) {
    if (rem === 0) { if (n < bestN) { bestN = n; best = cur.slice(); } return; }
    if (i >= items.length) return;
    const it = items[i];
    if (n + Math.ceil(rem / it.u) >= bestN) return;
    for (let c = Math.min(it.max, Math.floor(rem / it.u)); c >= 0; c--) {
      for (let j = 0; j < c; j++) cur.push(it.w);
      dfs(i + 1, rem - c * it.u, n + c);
      cur.length -= c;
    }
  })(0, goal, 0);
  return { plates: best, perSide: goal / Q };
}

function solveTarget() {
  const target = parseFloat(state.target[U()]);
  const bar = barWeight();
  if (!isFinite(target)) return { error: '輸入想要的總重量' };
  if (target < bar) return { error: `目標比槓重 (${fmt(bar)}) 還輕` };
  const r = solve((target - bar) / 2);
  const total = bar + r.perSide * 2;
  return { ...r, total, diff: target - total };
}

/* ---------- rendering ---------- */
function chipHTML(w, extra = '') {
  return `<i style="background:${STYLE[U()][w].c}"></i>${fmt(w)}${extra}`;
}

function renderBarbell() {
  const st = STYLE[U()];
  const cy = 105, collarL = 122, collarR = 278, sleeve = 108;
  let out = '';
  // sleeves + shaft
  out += `<rect x="6" y="${cy - 8}" width="${collarL - 6}" height="16" rx="3" fill="#c7ccd6"/>`;
  out += `<rect x="${collarR}" y="${cy - 8}" width="${394 - collarR}" height="16" rx="3" fill="#c7ccd6"/>`;
  out += `<rect x="${collarL}" y="${cy - 4.5}" width="${collarR - collarL}" height="9" fill="#9aa1ad"/>`;
  for (let x = 150; x < 250; x += 4) out += `<line x1="${x}" y1="${cy - 4.5}" x2="${x + 3}" y2="${cy + 4.5}" stroke="#7d8492" stroke-width="1"/>`;
  out += `<rect x="${collarL - 6}" y="${cy - 16}" width="8" height="32" rx="2" fill="#dde1e8"/>`;
  out += `<rect x="${collarR - 2}" y="${cy - 16}" width="8" height="32" rx="2" fill="#dde1e8"/>`;

  const list = side();
  const raw = list.reduce((a, w) => a + st[w].t * 1.5 + 1, 0);
  const k = raw > sleeve ? sleeve / raw : 1; // shrink to fit the sleeve
  let offset = 0;
  list.forEach((w, i) => {
    const s = st[w], t = s.t * 1.5 * k, y = cy - s.h / 2;
    const xr = collarR + 6 + offset, xl = collarL - 6 - offset - t;
    const label = t >= 8 && s.h >= 88
      ? (x) => `<text x="${x + t / 2}" y="${cy}" transform="rotate(-90 ${x + t / 2} ${cy})" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(9, t * .75)}" font-weight="700" fill="${s.light ? '#1b1e25' : '#fff'}" opacity=".85">${fmt(w)}</text>`
      : () => '';
    for (const x of [xl, xr]) {
      out += `<g class="plate" data-i="${i}">
        <rect x="${x}" y="${y}" width="${t}" height="${s.h}" rx="${Math.min(3, t / 3)}" fill="${s.c}" stroke="${s.c === '#2b2f38' ? '#5b6270' : 'rgba(0,0,0,.45)'}" stroke-width=".8"/>
        <rect x="${x + t * .2}" y="${y + 3}" width="${t * .25}" height="${s.h - 6}" rx="1" fill="rgba(255,255,255,.18)"/>
        ${label(x)}</g>`;
    }
    offset += t + k;
  });
  if (!list.length) out += `<text x="200" y="${cy - 40}" text-anchor="middle" fill="#8b93a3" font-size="13">點下方槓片，左右會同時加上</text>`;
  $('barbell').innerHTML = out;

  $('chips').innerHTML = list.length
    ? list.map((w, i) => `<button class="chip" data-i="${i}">${chipHTML(w)}<span class="x">✕</span></button>`).join('')
    : '';
}

function renderTotal() {
  const bar = barWeight(), s = sideSum();
  $('total').textContent = fmt(bar + s * 2);
  $('totalUnit').textContent = U();
  $('totalSub').textContent = `槓 ${fmt(bar)} ＋ 單邊 ${fmt(s)} × 2`;
}

function renderControls() {
  const u = U();
  document.querySelectorAll('#unitSeg button').forEach(b => b.classList.toggle('on', b.dataset.unit === u));
  const bars = BARS[u], cur = state.bar[u];
  document.querySelectorAll('#barSeg button').forEach(b => {
    const w = bars[+b.dataset.bar];
    b.textContent = fmt(w);
    b.classList.toggle('on', cur === w);
  });
  $('customWrap').classList.toggle('on', cur === 'custom');
  if (document.activeElement !== $('customBar')) $('customBar').value = state.customBar[u];
  $('customUnit').textContent = u;
  $('targetUnit').textContent = u;
  if (document.activeElement !== $('target')) $('target').value = state.target[u];
  const step = u === 'kg' ? 2.5 : 5;
  $('minus').textContent = `−${step}`;
  $('plus').textContent = `+${step}`;

  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('tab-manual').hidden = state.tab !== 'manual';
  $('tab-solve').hidden = state.tab !== 'solve';

  $('plateBtns').style.gridTemplateColumns = `repeat(${Math.ceil(plates().length / 2)}, 1fr)`;
  $('plateBtns').innerHTML = plates().map(w => {
    const s = STYLE[u][w], lim = limitOf(w), left = lim - usedOf(w);
    const badge = lim === Infinity ? '' : `<span class="left">${left}</span>`;
    return `<button class="pbtn ${s.light ? 'light' : ''}" data-w="${w}" style="background:${s.c};color:${s.light ? '#1b1e25' : '#fff'}" ${left <= 0 ? 'disabled' : ''}><span>${fmt(w)}</span>${badge}</button>`;
  }).join('');
  $('undo').disabled = !history.length;
  $('clear').disabled = !side().length;
}

function renderResult() {
  const r = solveTarget();
  const el = $('result');
  if (r.error) { el.innerHTML = `<span class="${state.target[U()] === '' ? '' : 'err'}">${r.error}</span>`; $('apply').disabled = true; return; }
  const list = r.plates.length
    ? `<div class="list">${r.plates.map(w => `<span class="chip">${chipHTML(w)}</span>`).join('')}</div>`
    : '';
  const head = Math.abs(r.diff) < 1e-9
    ? `<span class="ok">✓ 單邊放 ${fmt(r.perSide)} ${U()}</span>${r.plates.length ? '' : '（只要空槓）'}`
    : `<span class="warn">湊不到剛好，最接近 ${fmt(r.total)} ${U()}（差 ${fmt(r.diff)}）</span><br>單邊放 ${fmt(r.perSide)} ${U()}`;
  el.innerHTML = head + list;
  $('apply').disabled = false;
}

function renderInv() {
  const u = U();
  $('invRows').innerHTML = plates().map(w => {
    const v = state.inv[u][w];
    return `<div class="inv-row">
      <span class="dot" style="background:${STYLE[u][w].c}"></span>
      <span class="name">${fmt(w)} ${u}</span>
      <div class="stepper">
        <button data-w="${w}" data-d="-1" aria-label="減少">−</button>
        <output class="${v == null ? 'inf' : ''}">${v == null ? '∞' : v}</output>
        <button data-w="${w}" data-d="1" aria-label="增加">+</button>
      </div></div>`;
  }).join('');
}

function render() {
  renderBarbell();
  renderTotal();
  renderControls();
  renderResult();
  if ($('sheet').classList.contains('open')) renderInv();
  save();
}

/* ---------- events ---------- */
$('unitSeg').addEventListener('click', e => {
  const u = e.target.closest('button')?.dataset.unit;
  if (!u || u === U()) return;
  state.unit = u; history = [];
  buzz(); render();
});

$('barSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { state.bar[U()] = BARS[U()][+b.dataset.bar]; buzz(); render(); }
});
$('customBar').addEventListener('focus', () => { state.bar[U()] = 'custom'; render(); });
$('customBar').addEventListener('input', e => { state.customBar[U()] = e.target.value; state.bar[U()] = 'custom'; render(); });

$('tabs').addEventListener('click', e => {
  const t = e.target.closest('button')?.dataset.tab;
  if (t) { state.tab = t; render(); }
});

$('plateBtns').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const w = parseFloat(b.dataset.w);
  if (usedOf(w) >= limitOf(w)) return;
  setSide([...side(), w]);
  buzz(); render();
});

function removeAt(i) {
  const next = side().slice(); next.splice(i, 1);
  setSide(next); buzz(); render();
}
$('barbell').addEventListener('click', e => {
  const g = e.target.closest('.plate');
  if (g) removeAt(+g.dataset.i);
});
$('chips').addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (c) removeAt(+c.dataset.i);
});

$('undo').addEventListener('click', () => {
  if (!history.length) return;
  state.side[U()] = history.pop(); buzz(); render();
});
$('clear').addEventListener('click', () => { setSide([]); buzz(); render(); });

$('target').addEventListener('input', e => { state.target[U()] = e.target.value; render(); });
$('target').addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); $('apply').click(); } });
function nudge(d) {
  const step = U() === 'kg' ? 2.5 : 5;
  const cur = parseFloat(state.target[U()]);
  const base = isFinite(cur) ? cur : barWeight();
  state.target[U()] = fmt(Math.max(0, base + d * step));
  buzz(); render();
}
$('minus').addEventListener('click', () => nudge(-1));
$('plus').addEventListener('click', () => nudge(1));
$('apply').addEventListener('click', () => {
  const r = solveTarget();
  if (r.error) return;
  setSide(r.plates); buzz(); render();
});

// bottom sheets (shared with log.js)
function showSheet(el, open) {
  document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open'));
  if (open) el.classList.add('open');
  $('scrim').classList.toggle('open', open);
}

// inventory sheet
function openSheet(open) {
  showSheet($('sheet'), open);
  if (open) renderInv();
}
$('openInv').addEventListener('click', () => openSheet(true));
$('closeInv').addEventListener('click', () => openSheet(false));
$('scrim').addEventListener('click', () => showSheet(null, false));
$('invRows').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const w = parseFloat(b.dataset.w), d = +b.dataset.d, inv = state.inv[U()];
  const v = inv[w];
  // ∞ → 1 ;  0 … 20 ;  past 20 → ∞
  let next;
  if (v == null) next = 1;
  else next = v + d > 20 ? null : Math.max(0, v + d);
  if (next == null) delete inv[w]; else inv[w] = next;
  // drop outermost plates that exceed the new limit
  if (next != null && usedOf(w) > next) {
    const list = side().slice();
    for (let i = list.length - 1; i >= 0 && list.filter(x => x === w).length > next; i--)
      if (list[i] === w) list.splice(i, 1);
    setSide(list);
  }
  buzz(); render();
});
$('invReset').addEventListener('click', () => { state.inv[U()] = {}; render(); });

render();
