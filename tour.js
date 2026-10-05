/* 計算機首次使用導覽：畫面變暗，逐步框亮實際元件並說明。
   Reuses globals from app.js / log.js: $, buzz, state, render(), log, showPage(). */

const TOUR_KEY = 'barbell-tour-v1';
// mode: the calculator mode a step needs ('rm' / 'normal'); left out = keep whatever is on
const STEPS = [
  { sel: '#page-calc .total', text: '這裡是總重：槓 ＋ 兩邊槓片' },
  { sel: '#page-calc .row', text: '選槓的重量：15／20，或輸入自訂重量' },
  { sel: '#page-calc .target', mode: 'normal', text: '輸入目標總重，自動算出要掛哪些槓片。<br>不想打字：在數字上左右滑動，慢滑 ±1、快滑 ±5' },
  { sel: '#pctToggle', mode: 'normal', text: '按 RM 切換到 RM 模式，用 1RM 算訓練重量' },
  { sel: '#page-calc .target .field', mode: 'rm', text: '先輸入你的 1RM（最多能做一下的重量）' },
  { sel: '#pctBtn', mode: 'rm', text: '選要做幾下（1～15RM）' },
  { sel: '#pctOut', mode: 'rm', text: '算出的重量會調成掛得出來的數字。每個 RM 的重量都不同' },
  { sel: '#pctDir', mode: 'rm', text: '點箭頭切換方向：<br>→ 用 1RM 算重量<br>← 輸入重量回推 1RM（換 RM 時重量不變）' },
  { sel: '#page-calc .target', mode: 'rm', text: '箭頭指向的那格是算出來的；另一格可以輸入，也能左右滑動調整' },
  { sel: '#plateBtns', mode: 'normal', text: '沒有設定目標重量時：點槓片加上槓鈴。<br>有目標重量時：點一下可封鎖槓片，長按鎖定' },
  { sel: '#page-calc .actions', mode: 'normal', text: '隨時可以復原，或全部清空' },
];
const PAD = 6, GAP = 12, EDGE = 16;

let tour = null;   // { root, hole, tip, i }

function startTour() {
  if (tour) return;
  if (log.page !== 'calc') showPage('calc');
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-hole"></div><div class="tour-tip" role="dialog" aria-live="polite">' +
    '<p class="tour-text"></p><div class="tour-foot"><span class="tour-n"></span>' +
    '<button class="btn small" data-act="skip">跳過</button><button class="btn small primary" data-act="next"></button></div></div>';
  document.querySelector('.shell').appendChild(root);
  // pctOn: the mode to go back to when the tour ends
  tour = { root, hole: root.querySelector('.tour-hole'), tip: root.querySelector('.tour-tip'), i: 0, pctOn: state.pctOn };
  root.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'skip') endTour();
    else if (act === 'next') { buzz(); tour.i + 1 < STEPS.length ? showStep(tour.i + 1) : endTour(); }
  });
  showStep(0);
}

function showStep(i) {
  tour.i = i;
  const s = STEPS[i];
  tour.tip.querySelector('.tour-text').innerHTML = s.text;
  tour.tip.querySelector('.tour-n').textContent = `${i + 1} / ${STEPS.length}`;
  tour.tip.querySelector('[data-act="next"]').textContent = i + 1 < STEPS.length ? '下一步' : '開始使用';
  if (s.mode) setRm(s.mode === 'rm');
  document.querySelector(s.sel).scrollIntoView({ block: 'nearest' });
  placeStep();
}

// hole hugs the element; the tip goes below it if it fits, otherwise above, clamped to the screen
function placeStep() {
  if (!tour) return;
  const shell = document.querySelector('.shell').getBoundingClientRect();
  const r = document.querySelector(STEPS[tour.i].sel).getBoundingClientRect();
  const top = r.top - shell.top - PAD, left = r.left - shell.left - PAD;
  const h = r.height + PAD * 2, w = r.width + PAD * 2;
  Object.assign(tour.hole.style, { top: `${top}px`, left: `${left}px`, width: `${w}px`, height: `${h}px` });

  const tip = tour.tip, tw = Math.min(320, shell.width - EDGE * 2);
  tip.style.width = `${tw}px`;
  const th = tip.offsetHeight;
  const below = top + h + GAP;
  const y = below + th <= shell.height - EDGE ? below : Math.max(EDGE, top - GAP - th);
  const x = Math.min(Math.max(EDGE, left + w / 2 - tw / 2), shell.width - EDGE - tw);
  tip.style.top = `${y}px`;
  tip.style.left = `${x}px`;
}

// render() lays the row out synchronously, so the RM controls can be measured right after
function setRm(on) {
  if (state.pctOn !== on) { state.pctOn = on; render(); }
}

function endTour() {
  if (!tour) return;
  setRm(tour.pctOn);
  tour.root.remove();
  tour = null;
  try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {}
}

$('tourBtn').addEventListener('click', () => { buzz(); startTour(); });
window.addEventListener('resize', placeStep);
document.addEventListener('keydown', e => { if (e.key === 'Escape') endTour(); });

let seen = false;
try { seen = !!localStorage.getItem(TOUR_KEY); } catch (e) {}
if (!seen) setTimeout(startTour, 300);
