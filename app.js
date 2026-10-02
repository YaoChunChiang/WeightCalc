const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 2, 1, 0.5],
  lb: [45, 35, 25, 10, 5, 2.5],
};
const BARS = { kg: [15, 20], lb: [35, 45] };
// NSCA %1RM table: N RM -> % of 1RM
const RM_PCT = { 1: 100, 2: 95, 3: 93, 4: 90, 5: 87, 6: 85, 7: 83, 8: 80, 9: 77, 10: 75, 12: 67, 15: 65 };
// color, svg height, svg thickness, light (dark text)
const STYLE = {
  kg: {
    25:   { c: '#d62828', h: 180, t: 15 },
    20:   { c: '#1f5fd6', h: 180, t: 13 },
    15:   { c: '#eab308', h: 180, t: 11, light: true },
    10:   { c: '#16a34a', h: 180, t: 9 },
    5:    { c: '#eef1f5', h: 116, t: 7, light: true },
    2.5:  { c: '#2b2f38', h: 92,  t: 6 },
    2:    { c: '#1f5fd6', h: 82,  t: 5 },
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
  tab: 'solve',
  bar: { kg: 20, lb: 45 },          // number or 'custom'
  customBar: { kg: '', lb: '' },
  side: { kg: [], lb: [] },
  inv: { kg: {}, lb: {} },          // weight -> pairs (missing = unlimited)
  target: { kg: '', lb: '' },
  pctOn: false,                     // solve tab RM mode: target = entered 1RM × RM_PCT[rm]%
  rm: 5,
  exclude: { kg: [], lb: [] },      // solve tab: plate weights the user doesn't want to use
});
let state = load();
let history = [];

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.unit) {
      const st = Object.assign(defaults(), s);
      // drop plates that are no longer offered (e.g. old 1.25 kg)
      for (const u of ['kg', 'lb']) st.side[u] = (st.side[u] || []).filter(w => PLATES[u].includes(w));
      if (!RM_PCT[st.rm]) st.rm = 5;
      delete st.pct;   // replaced by rm
      return st;
    }
  } catch (e) {}
  return defaults();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

const $ = id => document.getElementById(id);
const fmt = n => String(Math.round(n * 1000) / 1000);
const buzz = () => { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} };

// no pinch zoom: iOS Safari ignores user-scalable=no, so block its gesture events and multi-touch moves
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

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
  const Q = 4; // quarter units handle 0.5 / 2.5 (and lb 2.5)
  const T = Math.floor(perSide * Q + 1e-6);
  const items = plates().map(w => {
    const u = Math.round(w * Q);
    const off = state.exclude[U()].includes(w);
    return { w, u, max: off ? 0 : Math.min(limitOf(w), Math.floor(T / u)) };
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
  const base = parseFloat(state.target[U()]);
  if (!isFinite(base)) return { error: state.pctOn ? '輸入 1RM' : '輸入想要的總重量' };
  return solveFor(base, state.pctOn ? rmWeight(base, state.rm) : base);
}
function solveFor(base, target) {
  const bar = barWeight();
  if (target < bar) return { error: `目標比槓重 (${fmt(bar)}) 還輕` };
  const r = solve((target - bar) / 2);
  const total = bar + r.perSide * 2;
  return { ...r, base, target, total, diff: target - total };
}
const round2 = n => fmt(Math.round(n * 100) / 100);
// RM weights within ±0.9 of a multiple of 5 snap to it (69.6 → 70, 74.4 → 75),
// unless that would give the same weight as another RM — then the raw value stays.
// Anything not snapped keeps one decimal, nudged to the nearer .0 / .5 (66.4 → 66.5, 61.6 → 61.5)
const half = n => Math.round(Math.round(n * 10) / 10 * 2) / 2;
const snap5 = n => { const r = Math.round(n / 5) * 5; return Math.abs(n - r) <= 0.9 + 1e-9 ? r : half(n); };
function rmWeights(base) {
  const ns = Object.keys(RM_PCT);
  const exact = ns.map(n => base * RM_PCT[n] / 100);
  const raw = exact.map(half), snapped = exact.map(snap5);
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  const out = {};
  ns.forEach((n, i) => {
    const s = snapped[i];
    const clash = ns.some((_, j) => j !== i && (same(s, snapped[j]) || same(s, raw[j])));
    out[n] = clash ? raw[i] : s;
  });
  return out;
}
const rmWeight = (base, rm) => rmWeights(base)[rm];

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
  $('target').placeholder = state.pctOn ? '1RM' : '目標總重';
  $('pctToggle').classList.toggle('on', state.pctOn);
  // RM mode turns the input row into "1RM × N RM = weight"; the RM is picked in #pctSheet
  $('minus').hidden = $('plus').hidden = state.pctOn;
  $('pctBtn').hidden = $('pctEq').hidden = $('pctOut').hidden = !state.pctOn;
  $('pctBtn').textContent = `${state.rm}RM ▾`;
  document.querySelector('#tab-solve .target').classList.toggle('pct', state.pctOn);
  if (document.activeElement !== $('target')) $('target').value = state.target[u];
  const step = u === 'kg' ? 2.5 : 5;
  $('minus').textContent = `−${step}`;
  $('plus').textContent = `+${step}`;

  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('tab-manual').hidden = state.tab !== 'manual';
  $('tab-solve').hidden = state.tab !== 'solve';

  $('plateBtns').style.gridTemplateColumns = `repeat(${Math.ceil(plates().length / 2)}, 1fr)`;
  $('plateBtns').innerHTML = plates().map(w => {
    const lim = limitOf(w), left = lim - usedOf(w);
    return plateBtnHTML(w, lim === Infinity ? null : left, left <= 0 ? 'disabled' : '');
  }).join('');
  $('undo').disabled = !history.length;
  $('clear').disabled = !side().length;
}

// round plate button, shared by the manual picker and the solve result
function plateBtnHTML(w, badge, extra = '') {
  const s = STYLE[U()][w];
  return `<button class="pbtn ${s.light ? 'light' : ''} ${extra}" data-w="${w}" style="background:${s.c};color:${s.light ? '#1b1e25' : '#fff'}" ${extra.includes('disabled') ? 'disabled' : ''}>` +
    `<span class="lbl">${fmt(w)}</span>${badge == null ? '' : `<span class="left">${badge}</span>`}</button>`;
}

function renderResult() {
  const r = solveTarget();
  const el = $('result');
  const inexact = !r.error && Math.abs(r.diff) > 1e-9;
  // RM mode: computed weight (and what can actually be loaded) next to the RM button
  $('pctWeight').textContent = r.error ? '—' : round2(r.target);
  $('pctActual').textContent = inexact ? `實際 ${fmt(r.total)}` : '';
  renderRmList();
  if (r.error) { el.innerHTML = `<span class="${state.target[U()] === '' ? '' : 'err'}">${r.error}</span>`; $('apply').disabled = true; return; }
  const ex = state.exclude[U()];
  const used = plates().filter(w => r.plates.includes(w));
  const off = plates().filter(w => ex.includes(w));
  let html = '';
  const warn = inexact && !state.pctOn;   // in ×% mode the stepper row already shows it
  if (warn) html += `<div class="rhead"><span class="warn">最接近 ${fmt(r.total)} ${U()}（差 ${fmt(r.diff)}）</span></div>`;
  if (!used.length && !off.length) html += '<div class="empty-bar">只要空槓</div>';
  else {
    // always 5 per row, so plates keep the same (small) size however many there are
    html += '<div class="rplates">' +
    used.map(w => plateBtnHTML(w, r.plates.filter(x => x === w).length)).join('') +
    off.map(w => plateBtnHTML(w, '✕', 'off')).join('') +
    (ex.length ? '<button class="restore" id="restoreAll">全部<br>恢復</button>' : '') + '</div>';
  }
  el.innerHTML = html;
  $('apply').disabled = false;
}

// RM sheet: every RM with its % and the weight it gives for the entered 1RM
function renderRmList() {
  const base = parseFloat(state.target[U()]), ok = isFinite(base);
  $('pctSheetCalc').textContent = ok ? `1RM ${fmt(base)} ${U()}` : '先輸入 1RM';
  const ws = ok ? rmWeights(base) : {};
  $('rmList').innerHTML = Object.keys(RM_PCT).map(n => {
    const p = RM_PCT[n];
    let w = '—', actual = '';
    if (ok) {
      const t = ws[n], r = solveFor(base, t);
      w = `${round2(t)} <small class="u">${U()}</small>`;
      if (!r.error && Math.abs(r.diff) > 1e-9) actual = `<small>實際 ${fmt(r.total)}</small>`;
    }
    return `<button data-rm="${n}" class="${+n === state.rm ? 'on' : ''}"><span>${n}RM</span><span>${p}%</span><span class="w"><b>${w}</b>${actual}</span></button>`;
  }).join('');
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
  setSide([...side(), w].sort((a, b) => b - a));   // heaviest plates go on first (inside)
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
$('pctToggle').addEventListener('click', () => { state.pctOn = !state.pctOn; buzz(); render(); });
$('pctBtn').addEventListener('click', () => showSheet($('pctSheet'), true));
$('pctDone').addEventListener('click', () => showSheet(null, false));
$('rmList').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]');
  if (b) { state.rm = +b.dataset.rm; buzz(); render(); showSheet(null, false); }
});
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
// tap a plate in the result to stop using it (tap again to allow it); the solver re-plans without it
$('result').addEventListener('click', e => {
  const ex = state.exclude[U()];
  if (e.target.closest('#restoreAll')) { ex.length = 0; buzz(); render(); return; }
  const b = e.target.closest('[data-w]');
  if (!b) return;
  const w = parseFloat(b.dataset.w), i = ex.indexOf(w);
  i >= 0 ? ex.splice(i, 1) : ex.push(w);
  buzz(); render();
});
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
  // ∞ → (+) 1 / (−) 0 ;  0 … 20 ;  past 20 → ∞
  let next;
  if (v == null) next = d > 0 ? 1 : 0;
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
