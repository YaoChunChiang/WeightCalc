/* 訓練紀錄 + 組間計時 + 底部切頁
   Reuses globals from app.js: $, fmt, buzz, U(), showSheet(). */

const EXERCISES = [
  ['蹲類', ['槓鈴背蹲舉', '高箱蹲', '澤奇蹲舉（前抱式蹲舉）', '過頭深蹲（OHS）', '架上背蹲舉（出槓支撐）']],
  ['硬舉／髖', ['傳統硬舉', '相撲硬舉', '架上硬舉（塊上硬舉）', '羅馬尼亞硬舉（RDL）', '早安運動']],
  ['單邊', ['保加利亞分腿蹲', '分腿蹲', '單腳羅馬尼亞硬舉', '單邊啞鈴臥推']],
  ['推', ['槓鈴臥推', '槓鈴肩推（OHP）']],
  ['拉', ['槓鈴划船', 'W 槓二頭彎舉']],
  ['其他', ['雙手農夫走路']],
];

const LOG_KEY = 'barbell-log-v1';
const NEW_DAY_GAP = 12 * 3600 * 1000;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const logDefaults = () => ({
  page: 'calc',
  date: today(),
  sets: [],                         // { ex, w, unit, reps, rest, at }
  customEx: [],
  current: { ex: '槓鈴背蹲舉', w: '', reps: '' },
  timer: { mode: 'up', seconds: 90, auto: true, startedAt: null, pendingRest: null },
});

let log = loadLog();
let alerted = false;
let clearArmed = null;

function loadLog() {
  let l = logDefaults();
  try {
    const s = JSON.parse(localStorage.getItem(LOG_KEY));
    if (s && Array.isArray(s.sets)) l = Object.assign(l, s, { timer: Object.assign(l.timer, s.timer) });
  } catch (e) {}
  // "only today": start fresh when the last set is long gone
  const last = l.sets[l.sets.length - 1];
  if (!last || Date.now() - last.at > NEW_DAY_GAP) {
    l.sets = []; l.date = today();
    l.timer.startedAt = null; l.timer.pendingRest = null;
  }
  return l;
}
function saveLog() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (e) {}
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = sec => {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 1600);
}

/* ---------- pages ---------- */
function showPage(p) {
  log.page = p;
  $('page-calc').hidden = p !== 'calc';
  $('page-log').hidden = p !== 'log';
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.page === p));
  $('page-' + p).scrollTop = 0;
  renderLog();
}
$('tabbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && b.dataset.page !== log.page) { buzz(); showPage(b.dataset.page); }
});

/* ---------- timer ---------- */
const tm = () => log.timer;
const elapsed = () => tm().startedAt ? (Date.now() - tm().startedAt) / 1000 : 0;

function startTimer() {
  tm().startedAt = Date.now();
  tm().pendingRest = null;
  alerted = false;
}
function stopTimer() {
  if (!tm().startedAt) return;
  tm().pendingRest = Math.round(elapsed());
  tm().startedAt = null;
}

// returns { text, over } for the big clock and the nav pill
function clockText() {
  const running = !!tm().startedAt, e = elapsed();
  if (tm().mode === 'up') return { text: mmss(running ? e : tm().pendingRest || 0), over: false };
  const left = tm().seconds - e;
  if (!running) return { text: mmss(tm().seconds), over: false };
  return left >= 0 ? { text: mmss(Math.ceil(left)), over: false } : { text: '+' + mmss(-left), over: true };
}

function tick() {
  const running = !!tm().startedAt;
  const c = clockText();
  if (running && tm().mode === 'down' && c.over && !alerted) {
    alerted = true;
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
  }
  const clock = $('clock');
  clock.textContent = c.text;
  clock.classList.toggle('running', running && !c.over);
  clock.classList.toggle('over', running && c.over);

  let sub = '';
  if (running) sub = tm().mode === 'down' ? `休息中 · 已過 ${mmss(elapsed())}` : '休息中';
  else if (tm().pendingRest != null) sub = `已暫停 ${mmss(tm().pendingRest)}，記到下一組`;
  $('clockSub').textContent = sub;

  const pill = $('navPill');
  pill.hidden = !running || log.page === 'log';
  pill.textContent = c.text;
  pill.classList.toggle('over', c.over);
}
setInterval(tick, 250);

$('timerMode').addEventListener('click', e => {
  const m = e.target.closest('button')?.dataset.mode;
  if (m) { tm().mode = m; alerted = elapsed() > tm().seconds; buzz(); renderLog(); }
});
$('presets').addEventListener('click', e => {
  const s = e.target.closest('button')?.dataset.s;
  if (s) { tm().seconds = +s; alerted = elapsed() > tm().seconds; buzz(); renderLog(); }
});
$('timerToggle').addEventListener('click', () => {
  tm().startedAt ? stopTimer() : startTimer();
  buzz(); renderLog();
});
$('timerReset').addEventListener('click', () => {
  tm().startedAt = null; tm().pendingRest = null;
  buzz(); renderLog();
});
$('timerAuto').addEventListener('change', e => { tm().auto = e.target.checked; renderLog(); });

/* ---------- inputs ---------- */
const cur = () => log.current;
const MAX_REPS = 100;

$('logW').addEventListener('input', e => { cur().w = capInput(e.target); saveLog(); });
$('logReps').addEventListener('input', e => {
  if (parseFloat(e.target.value) > MAX_REPS) { e.target.value = MAX_REPS; toast(`上限 ${MAX_REPS} 下`); }
  cur().reps = e.target.value; saveLog();
});
// one step of d (±1); big moves weight to the next multiple of STEP instead
function nudge(f, d, big) {
  const v = parseFloat(cur()[f]) || 0;
  if (f === 'w') {
    const n = big ? (d > 0 ? Math.floor(v / STEP + 1e-9) + 1 : Math.ceil(v / STEP - 1e-9) - 1) * STEP : v + d;
    cur()[f] = fmt(Math.min(MAX[U()], Math.max(0, n)));
  } else {
    cur()[f] = String(Math.min(MAX_REPS, Math.max(1, Math.round(v) + d)));
  }
  buzz(); renderLog();
}

/* swipe a number left/right to change it: slow = ±1, fast = ±STEP (weight only); a tap types */
const SCRUB_START = 8, SCRUB_PX = 14, FAST = 0.8;   // px, px per step, px/ms
document.querySelectorAll('.num-field').forEach(box => {
  const f = box.dataset.field, input = box.querySelector('input');
  let g = null;
  box.addEventListener('pointerdown', e => {
    if (e.button) return;
    g = { x0: e.clientX, x: e.clientX, t: e.timeStamp, acc: 0, speed: 0, on: false, arrow: e.target.closest('.scrub-arrow') };
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', e => {
    if (!g) return;
    const dx = e.clientX - g.x, dt = Math.max(1, e.timeStamp - g.t);
    g.x = e.clientX; g.t = e.timeStamp;
    if (!g.on) {
      if (Math.abs(e.clientX - g.x0) < SCRUB_START) return;
      g.on = true;
      input.blur();
      box.classList.add('scrubbing');
    }
    g.speed = g.speed * 0.6 + Math.abs(dx) / dt * 0.4;
    g.acc += dx;
    while (Math.abs(g.acc) >= SCRUB_PX) {
      const d = Math.sign(g.acc);
      g.acc -= d * SCRUB_PX;
      nudge(f, d, f === 'w' && g.speed > FAST);
    }
  });
  const end = e => {
    if (!g) return;
    const tap = !g.on && e.type === 'pointerup', arrow = g.arrow;
    g = null;
    box.classList.remove('scrubbing');
    if (!tap) return;
    if (arrow) nudge(f, +arrow.dataset.d, false);
    else input.focus();
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
});

$('logSet').addEventListener('click', () => {
  const w = parseFloat(cur().w), reps = parseInt(cur().reps, 10);
  if (!isFinite(w) || w < 0 || !(reps > 0)) { toast('請輸入重量和次數'); return; }
  let rest = tm().startedAt ? Math.round(elapsed()) : tm().pendingRest;
  if (!log.sets.length || rest < 3) rest = null;   // no rest before the first set / accidental double tap
  log.sets.push({ ex: cur().ex, w, unit: U(), reps, rest, at: Date.now() });
  if (!log.date || log.sets.length === 1) log.date = today();
  tm().startedAt = null; tm().pendingRest = null;
  if (tm().auto) startTimer();
  try { navigator.vibrate && navigator.vibrate(20); } catch (e) {}
  toast(`已記錄：${fmt(w)}${U()} × ${reps}下`);
  renderLog();
  const row = [...document.querySelectorAll('#logList .set-row')].find(r => r.dataset.key === `${cur().ex}|${w}|${U()}|${reps}`);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

/* ---------- exercise sheet ---------- */
function renderExList() {
  const opt = (name, removable) =>
    `<button class="ex-opt ${name === cur().ex ? 'on' : ''}" data-ex="${esc(name)}">${esc(name)}${removable ? `<span class="rm" data-rm="${esc(name)}">✕</span>` : ''}</button>`;
  let html = EXERCISES.map(([cat, list]) =>
    `<div class="ex-cat">${cat}</div><div class="ex-opts">${list.map(n => opt(n, false)).join('')}</div>`).join('');
  if (log.customEx.length)
    html += `<div class="ex-cat">自訂</div><div class="ex-opts">${log.customEx.map(n => opt(n, true)).join('')}</div>`;
  $('exList').innerHTML = html;
}
function pickExercise(name) {
  cur().ex = name;
  const last = [...log.sets].reverse().find(s => s.ex === name);
  if (last) { cur().w = fmt(last.w); cur().reps = String(last.reps); }
  showSheet(null, false);
  buzz(); renderLog();
}
$('exPick').addEventListener('click', () => { renderExList(); showSheet($('exSheet'), true); });
$('exList').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) {
    log.customEx = log.customEx.filter(n => n !== rm.dataset.rm);
    saveLog(); renderExList(); return;
  }
  const b = e.target.closest('[data-ex]');
  if (b) pickExercise(b.dataset.ex);
});
function addExercise() {
  const name = $('exNew').value.trim();
  if (!name) return;
  const all = EXERCISES.flatMap(([, l]) => l).concat(log.customEx);
  if (!all.includes(name)) log.customEx.push(name);
  $('exNew').value = '';
  pickExercise(name);
}
$('exAdd').addEventListener('click', addExercise);
$('exNew').addEventListener('keydown', e => { if (e.key === 'Enter') addExercise(); });

/* ---------- today's list ---------- */
// exercise (first-seen order) -> rows of identical weight/unit/reps (first-seen order)
function grouped() {
  const exs = new Map();
  log.sets.forEach((s, i) => {
    if (!exs.has(s.ex)) exs.set(s.ex, new Map());
    const rows = exs.get(s.ex), key = `${s.w}|${s.unit}|${s.reps}`;
    if (!rows.has(key)) rows.set(key, { key: `${s.ex}|${key}`, w: s.w, unit: s.unit, reps: s.reps, idx: [] });
    rows.get(key).idx.push(i);
  });
  return [...exs].map(([ex, rows]) => ({ ex, rows: [...rows.values()] }));
}
function restOf(row) {
  const r = row.idx.map(i => log.sets[i].rest).filter(v => v != null);
  if (!r.length) return '';
  const avg = r.reduce((a, b) => a + b, 0) / r.length;
  return (r.length > 1 ? '平均休息 ' : '休息 ') + mmss(avg);
}

function renderList() {
  $('logDate').textContent = log.date;
  const groups = grouped();
  if (!groups.length) {
    $('logList').innerHTML = '<div class="empty">還沒有紀錄，做完一組按「記錄一組」</div>';
  } else {
    $('logList').innerHTML = groups.map(g => {
      const n = g.rows.reduce((a, r) => a + r.idx.length, 0);
      return `<div class="ex-group"><h3>${esc(g.ex)}<small>共 ${n} 組</small></h3>${g.rows.map(r => {
        const open = expanded.has(r.key);
        const details = open ? `<div class="set-details">${r.idx.map((i, k) => {
          const s = log.sets[i];
          return `<div class="set-item">
            <span class="no">第 ${k + 1} 組</span>
            <span class="at">${clock24(s.at)}</span>
            <span class="rest">${s.rest != null ? '休息 ' + mmss(s.rest) : ''}</span>
            <button class="del" data-i="${i}">刪除</button>
          </div>`;
        }).join('')}</div>` : '';
        return `<div class="set-group ${open ? 'open' : ''}">
          <button class="set-row" data-key="${esc(r.key)}">
            <span class="main">${fmt(r.w)} ${r.unit} × ${r.reps} 下<b>${r.idx.length} 組</b></span>
            <span class="rest">${restOf(r)}</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>${details}
        </div>`;
      }).join('')}</div>`;
    }).join('');
  }
  $('logCopy').disabled = !groups.length;
  $('logClear').disabled = !groups.length;
}
const expanded = new Set();
const clock24 = t => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
$('logList').addEventListener('click', e => {
  const del = e.target.closest('.del');
  if (del) {
    log.sets.splice(+del.dataset.i, 1);
    buzz(); renderLog(); return;
  }
  const row = e.target.closest('.set-row');
  if (row) {
    const k = row.dataset.key, opening = !expanded.has(k);
    opening ? expanded.add(k) : expanded.delete(k);
    renderList();
    if (opening) {
      const r = [...document.querySelectorAll('#logList .set-row')].find(r => r.dataset.key === k);
      if (r) revealBottom(r.closest('.set-group'));
    }
  }
});
// scroll the list just enough to show the bottom of an expanded group
function revealBottom(el) {
  const list = $('logList');
  const over = el.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom;
  if (over > 0) list.scrollBy({ top: over + 6, behavior: 'smooth' });   // 6 = .set-group margin-bottom
}

$('logClear').addEventListener('click', () => {
  const b = $('logClear');
  if (!clearArmed) {
    b.textContent = '確認清空？';
    clearArmed = setTimeout(() => { clearArmed = null; b.textContent = '清空'; }, 3000);
    return;
  }
  clearTimeout(clearArmed); clearArmed = null;
  b.textContent = '清空';
  log.sets = []; log.date = today();
  tm().startedAt = null; tm().pendingRest = null;
  buzz(); renderLog();
});

function logText() {
  const lines = [`${log.date} 訓練紀錄`];
  for (const g of grouped()) {
    lines.push('', g.ex);
    for (const r of g.rows) {
      const rest = restOf(r);
      lines.push(`${fmt(r.w)}${r.unit} × ${r.reps}下 × ${r.idx.length}組${rest ? `（${rest}）` : ''}`);
    }
  }
  return lines.join('\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  return ok;
}
$('logCopy').addEventListener('click', async () => {
  toast(await copyText(logText()) ? '已複製到剪貼簿' : '複製失敗');
});

/* ---------- render ---------- */
function renderLog() {
  $('exName').textContent = cur().ex;
  $('logUnit').textContent = U();
  if (document.activeElement !== $('logW')) $('logW').value = cur().w;
  if (document.activeElement !== $('logReps')) $('logReps').value = cur().reps;

  const down = tm().mode === 'down';
  document.querySelectorAll('#timerMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === tm().mode));
  $('presets').hidden = !down;
  document.querySelectorAll('#presets button').forEach(b => b.classList.toggle('on', +b.dataset.s === tm().seconds));
  $('timerToggle').textContent = tm().startedAt ? '■ 停止' : '▶ 開始';
  $('timerAuto').checked = tm().auto;

  renderList();
  tick();
  saveLog();
}

alerted = !!tm().startedAt && elapsed() > tm().seconds;
showPage(log.page);
