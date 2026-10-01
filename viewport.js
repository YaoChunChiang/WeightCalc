/* Real usable height -> --app-h, plus --vp-gap.
   iOS home-screen apps (standalone, black-translucent status bar) get a viewport that is shorter
   than the screen by the status-bar height (iPhone 15 Pro: innerHeight 793 vs screen 852).
   Content can't be drawn in that bottom strip, but the strip already covers the home indicator,
   so the tab bar's safe-area padding is reduced by --vp-gap. Loaded in <head>. */

(function () {
  const root = document.documentElement;
  const standalone = navigator.standalone === true ||
    (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (standalone) root.classList.add('standalone');

  function measure() {
    const h = window.innerHeight;
    let gap = 0;
    if (standalone && window.screen) {
      const portrait = h >= window.innerWidth;
      const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      // only the bug-sized gap (not e.g. iPad split view, where the window is genuinely smaller)
      if (full > h && full - h < 150) gap = full - h;
    }
    root.style.setProperty('--app-h', h + 'px');
    root.style.setProperty('--vp-gap', gap + 'px');
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
      '--vp-gap': root.style.getPropertyValue('--vp-gap'),
      'tab bar padding-bottom': getComputedStyle(document.getElementById('tabbar')).paddingBottom,
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
