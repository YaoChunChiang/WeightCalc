const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 2, 1.5, 1, 0.5],
  lb: [45, 35, 25, 10, 5, 2.5],
};
const BARS = { kg: [15, 20], lb: [35, 45] };
const STEP = 5;   // ± buttons next to the target, same for kg and lb
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
    // small plates reuse the big plates' color code in a lighter shade (2.5 red, 2 blue, 1.5 yellow, 1 green, 0.5 white)
    2.5:  { c: '#f93f3f', h: 92,  t: 6 },
    2:    { c: '#307bff', h: 82,  t: 5 },
    1.5:  { c: '#ffd84c', h: 72,  t: 4.5, light: true },
    1:    { c: '#32f57c', h: 64,  t: 4, light: true },
    0.5:  { c: '#ffffff', h: 56,  t: 3, light: true },
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
  bar: { kg: 20, lb: 45 },          // number or 'custom'
  customBar: { kg: '', lb: '' },
  side: { kg: [], lb: [] },
  target: { kg: '', lb: '' },
  pctOn: false,                     // RM mode: target = entered 1RM × RM_PCT[rm]%
  rm: 5,
  // with a target set, the bar is re-planned on every render: locked plates stay on at exactly
  // their count ({w, n}, in lock order), excluded (blocked) weights are never used, the solver fills the rest
  lock: { kg: [], lb: [] },
  exclude: { kg: [], lb: [] },
});
let state = load();
let history = [];

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.unit) {
      const st = Object.assign(defaults(), s);
      // drop plates that are no longer offered (e.g. old 1.25 kg)
      for (const u of ['kg', 'lb']) {
        st.side[u] = (st.side[u] || []).filter(w => PLATES[u].includes(w));
        st.lock[u] = (st.lock[u] || []).filter(l => PLATES[u].includes(l.w) && l.n > 0);
      }
      if (!RM_PCT[st.rm]) st.rm = 5;
      delete st.pct;   // replaced by rm
      delete st.tab;   // manual / solve tabs were merged
      delete st.inv;   // plate inventory was removed
      delete st.pin;   // replaced by lock
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

function barWeight() {
  const b = state.bar[U()];
  if (b === 'custom') {
    const v = parseFloat(state.customBar[U()]);
    return isFinite(v) && v >= 0 ? v : 0;
  }
  return b;
}

const locks = () => state.lock[U()];
const lockOf = w => locks().find(l => l.w === w);
const lockedPlates = () => locks().flatMap(l => Array(l.n).fill(l.w));
const lockSum = () => locks().reduce((a, l) => a + l.w * l.n, 0);
const excluded = () => state.exclude[U()];
const count = (list, w) => list.filter(x => x === w).length;
const byWeight = list => list.slice().sort((a, b) => b - a);   // heaviest plates go on first (inside)
const EPS = 1e-9;

// undo covers every plate action: the bar, locks, exclusions and the target they were planned for
function snapshot() {
  const u = U();
  history.push({ u, side: side().slice(), lock: locks().map(l => ({ ...l })), exclude: excluded().slice(), target: state.target[u] });
  if (history.length > 60) history.shift();
}
function restore(s) {
  state.side[s.u] = s.side; state.lock[s.u] = s.lock; state.exclude[s.u] = s.exclude; state.target[s.u] = s.target;
}

/* ---------- reverse solve ---------- */
// Finds plates for one side: exact match with fewest plates (heaviest first on ties),
// otherwise the heaviest reachable load not exceeding the target. Blocked and locked weights are skipped
// (a locked plate is used exactly at its locked count, which the caller adds).
function solve(perSide) {
  const Q = 4; // quarter units handle 0.5 / 2.5 (and lb 2.5)
  const T = Math.max(0, Math.floor(perSide * Q + 1e-6));
  const items = plates().map(w => {
    const u = Math.round(w * Q);
    const off = excluded().includes(w) || !!lockOf(w);
    return { w, u, max: off ? 0 : Math.floor(T / u) };
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
// locked plates always stay on; the solver only fills what is left of each side
function solveFor(base, target, fixed = lockedPlates()) {
  const bar = barWeight();
  if (target < bar) return { error: `目標比槓重 (${fmt(bar)}) 還輕` };
  const perSide = (target - bar) / 2;
  const fixedSum = fixed.reduce((a, b) => a + b, 0);
  const r = solve(perSide - fixedSum);
  const total = bar + (fixedSum + r.perSide) * 2;
  return { plates: byWeight([...fixed, ...r.plates]), perSide, base, target, total, diff: target - total };
}
const hasTarget = () => !solveTarget().error;

// target mode: rebuild the bar from the target. If the locks no longer fit (target lowered),
// earlier locks keep as many plates as fit, so trimming hits the most recent ones first;
// a lock that ends at 0 is released.
function syncSide() {
  let r = solveTarget();
  if (r.error) return;
  if (lockSum() > r.perSide + EPS) {
    let room = r.perSide;
    for (const l of locks()) {
      l.n = Math.min(l.n, Math.floor((room + EPS) / l.w));
      room -= l.w * l.n;
    }
    state.lock[U()] = locks().filter(l => l.n > 0);
    if (typeof toast === 'function') toast('已調整鎖定');   // toast() lives in log.js, not loaded on first render
    r = solveTarget();
  }
  state.side[U()] = r.plates;
}
const round2 = n => fmt(Math.round(n * 100) / 100);
// RM weight from 1RM: within ±0.9 of a multiple of 5 → that multiple (69.6 → 70, 74.4 → 75),
// otherwise a whole number (plates can't load decimals: 66.4 → 66). A snap that would give
// the same weight as another RM is skipped, so every RM keeps its own weight.
function rmWeights(base) {
  const ns = Object.keys(RM_PCT);
  const exact = ns.map(n => base * RM_PCT[n] / 100);
  const whole = exact.map(Math.round);
  const snap = exact.map((x, i) => { const r = Math.round(x / 5) * 5; return Math.abs(x - r) <= 0.9 + 1e-9 ? r : whole[i]; });
  const out = {};
  ns.forEach((n, i) => {
    const clash = ns.some((_, j) => j !== i && (snap[i] === snap[j] || snap[i] === whole[j]));
    out[n] = clash ? whole[i] : snap[i];
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
  if (!list.length) out += `<text x="200" y="${cy - 40}" text-anchor="middle" fill="#8b93a3" font-size="13">輸入目標重量，或點下方槓片</text>`;
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
  document.querySelector('.panel .target').classList.toggle('pct', state.pctOn);
  if (document.activeElement !== $('target')) $('target').value = state.target[u];
  $('minus').textContent = `−${STEP}`;
  $('plus').textContent = `+${STEP}`;

  // plate picker: badge = plates of that weight per side on the bar. With a target, locked plates get a
  // ring and a 🔒n badge, blocked ones a ✕, and ones too heavy to lock are dimmed (tapping still blocks)
  const r = solveTarget(), target = !r.error;
  $('plateBtns').style.gridTemplateColumns = `repeat(${Math.ceil(plates().length / 2)}, 1fr)`;
  $('plateBtns').innerHTML = plates().map(w => {
    const on = count(side(), w) || null;
    if (!target) return plateBtnHTML(w, on);
    if (excluded().includes(w)) return plateBtnHTML(w, '✕', 'off');
    const l = lockOf(w);
    if (l) return plateBtnHTML(w, `🔒${l.n}`, 'locked', 'lock');
    return plateBtnHTML(w, on, lockSum() + w > r.perSide + EPS ? 'dim' : '');
  }).join('');
  $('plateHint').textContent = target
    ? '點一下：封鎖／解除　長按：鎖定，鎖定後點一下改數量'
    : '點槓片加上槓鈴；輸入目標重量可自動配重';
  $('undo').disabled = !history.length;
  $('clear').disabled = !side().length && state.target[u] === '' && !excluded().length && !locks().length;
}

// round plate button for the plate picker
function plateBtnHTML(w, badge, extra = '', badgeCls = '') {
  const s = STYLE[U()][w];
  return `<button class="pbtn ${s.light ? 'light' : ''} ${extra}" data-w="${w}" style="background:${s.c};color:${s.light ? '#1b1e25' : '#fff'}">` +
    `<span class="lbl">${fmt(w)}</span>${badge == null ? '' : `<span class="left ${badgeCls}">${badge}</span>`}</button>`;
}

function renderResult() {
  const r = solveTarget();
  const el = $('result');
  const inexact = !r.error && Math.abs(r.diff) > 1e-9;
  // RM mode: computed weight (and what can actually be loaded) next to the RM button
  $('pctWeight').textContent = r.error ? '—' : round2(r.target);
  $('pctActual').textContent = inexact ? `實際 ${fmt(r.total)}` : '';
  renderRmList();
  // status line: only errors (once something is typed) and inexact matches; RM mode shows 實際 in the row
  if (r.error) el.innerHTML = state.target[U()] === '' ? '' : `<span class="err">${r.error}</span>`;
  else el.innerHTML = inexact && !state.pctOn ? `<span class="warn">最接近 ${fmt(r.total)} ${U()}（差 ${fmt(r.diff)}）</span>` : '';
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
      const t = ws[n], r = solveFor(base, t, []);
      w = `${round2(t)} <small class="u">${U()}</small>`;
      if (!r.error && Math.abs(r.diff) > 1e-9) actual = `<small>實際 ${fmt(r.total)}</small>`;
    }
    return `<button data-rm="${n}" class="${+n === state.rm ? 'on' : ''}"><span>${n}RM</span><span>${p}%</span><span class="w"><b>${w}</b>${actual}</span></button>`;
  }).join('');
}

function render() {
  syncSide();
  renderBarbell();
  renderTotal();
  renderControls();
  renderResult();
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

/* plate picker gestures
   no target:   tap = add one plate (manual loading)
   with target: tap = block / unblock that weight; on a locked plate, tap = next count (wraps to 1)
                long-press = lock (starting at the count already on the bar) / unlock */
const unlock = w => { state.lock[U()] = locks().filter(l => l.w !== w); };
const unblock = w => { const ex = excluded(), i = ex.indexOf(w); if (i >= 0) ex.splice(i, 1); };

function onPlateTap(w) {
  const r = solveTarget();
  snapshot();
  if (r.error) state.side[U()] = byWeight([...side(), w]);
  else if (lockOf(w)) {
    const l = lockOf(w);
    l.n = lockSum() + w > r.perSide + EPS ? 1 : l.n + 1;
  } else if (excluded().includes(w)) unblock(w);
  else excluded().push(w);
  buzz(); render();
}

function onPlateLongPress(w) {
  const r = solveTarget();
  if (r.error) { toast('先輸入目標重量才能鎖定'); return; }
  if (lockOf(w)) { snapshot(); unlock(w); buzz(); render(); return; }
  let n = Math.max(1, count(side(), w));
  while (n > 0 && lockSum() + w * n > r.perSide + EPS) n--;
  if (!n) { toast('超過目標重量'); return; }
  snapshot();
  unblock(w);
  locks().push({ w, n });
  buzz(); render();
}

// long-press: 450 ms hold without moving; the click that follows it is swallowed
let pressTimer = null, pressStart = null, suppressClick = false;
const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
$('plateBtns').addEventListener('pointerdown', e => {
  const b = e.target.closest('.pbtn');
  if (!b) return;
  cancelPress();
  suppressClick = false;   // a long-press whose click never came must not eat this tap
  pressStart = { x: e.clientX, y: e.clientY };
  pressTimer = setTimeout(() => {
    pressTimer = null; suppressClick = true;
    onPlateLongPress(parseFloat(b.dataset.w));
  }, 450);
});
$('plateBtns').addEventListener('pointermove', e => {
  if (pressTimer && Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 10) cancelPress();
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('plateBtns').addEventListener(ev, cancelPress));
$('plateBtns').addEventListener('contextmenu', e => e.preventDefault());
$('plateBtns').addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; return; }
  const b = e.target.closest('.pbtn');
  if (b) onPlateTap(parseFloat(b.dataset.w));
});

// tap a plate on the bar: with a target, block that weight (unlocking it) and re-plan; otherwise just take it off
function removeAt(i) {
  const w = side()[i];
  snapshot();
  if (hasTarget()) {
    unlock(w);
    if (!excluded().includes(w)) excluded().push(w);
  } else {
    const next = side().slice(); next.splice(i, 1);
    state.side[U()] = next;
  }
  buzz(); render();
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
  restore(history.pop()); buzz(); render();
});
$('clear').addEventListener('click', () => {
  snapshot();
  const u = U();
  state.side[u] = []; state.lock[u] = []; state.exclude[u] = []; state.target[u] = '';
  buzz(); render();
});

$('target').addEventListener('input', e => { state.target[U()] = e.target.value; render(); });
$('pctToggle').addEventListener('click', () => { state.pctOn = !state.pctOn; buzz(); render(); });
$('pctBtn').addEventListener('click', () => showSheet($('pctSheet'), true));
$('pctDone').addEventListener('click', () => showSheet(null, false));
$('rmList').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]');
  if (b) { state.rm = +b.dataset.rm; buzz(); render(); showSheet(null, false); }
});
$('target').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
function nudge(d) {
  const cur = parseFloat(state.target[U()]);
  const base = isFinite(cur) ? cur : barWeight();
  state.target[U()] = fmt(Math.max(0, base + d * STEP));
  buzz(); render();
}
$('minus').addEventListener('click', () => nudge(-1));
$('plus').addEventListener('click', () => nudge(1));

// bottom sheets (shared with log.js)
function showSheet(el, open) {
  document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open'));
  if (open) el.classList.add('open');
  $('scrim').classList.toggle('open', open);
}

$('scrim').addEventListener('click', () => showSheet(null, false));

render();
