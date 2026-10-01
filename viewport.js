/* Real usable height -> --app-h.
   iOS home-screen apps (standalone) often report 100vh / 100dvh / fixed-bottom against a viewport
   that is shorter than the screen, leaving an empty strip under the tab bar. Loaded in <head>. */

(function () {
  const root = document.documentElement;
  const standalone = navigator.standalone === true ||
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (standalone) root.classList.add('standalone');

  function measure() {
    let h = window.innerHeight;
    if (standalone && window.screen) {
      // A standalone app always fills the screen; trust screen size when the gap looks like the bug
      // (not e.g. iPad split view, where the window is genuinely smaller).
      const portrait = window.innerHeight >= window.innerWidth;
      const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      if (full > h && full - h < 150) h = full;
    }
    root.style.setProperty('--app-h', h + 'px');
    return h;
  }

  measure();
  ['resize', 'orientationchange', 'pageshow'].forEach(ev => window.addEventListener(ev, () => {
    measure();
    setTimeout(measure, 300); // iOS settles the size after rotating
  }));
  if (window.visualViewport) visualViewport.addEventListener('resize', measure);

  // Hidden diagnostics: tap the first page title 5 times quickly.
  let taps = 0, timer = null;
  document.addEventListener('click', e => {
    if (!e.target.closest('#page-calc header h1')) return;
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 1500);
    if (taps < 5) return;
    taps = 0;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;' +
      'padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const info = {
      standalone,
      'innerWidth×innerHeight': `${innerWidth}×${innerHeight}`,
      'screen': `${screen.width}×${screen.height}`,
      'visualViewport.height': window.visualViewport ? Math.round(visualViewport.height) : '-',
      '--app-h': root.style.getPropertyValue('--app-h'),
      'safe-area top/bottom': `${cs.paddingTop} / ${cs.paddingBottom}`,
      'shell height': Math.round(document.querySelector('.shell').getBoundingClientRect().height) + 'px',
      'devicePixelRatio': window.devicePixelRatio,
    };
    probe.remove();
    let box = document.getElementById('diag');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'diag';
      box.addEventListener('click', () => box.remove());
      document.body.appendChild(box);
    }
    box.textContent = Object.entries(info).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n（點此關閉）';
  });
})();
