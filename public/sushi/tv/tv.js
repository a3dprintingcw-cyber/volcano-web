// Sushi menu board for TVs. See the comment in index.html for the options.
(function () {
  const params = new URLSearchParams(location.search);
  const portrait = params.get('screen') === 'portrait';
  const rotate = params.get('rotate');
  const seconds = Math.max(5, Number(params.get('seconds')) || (portrait ? 12 : 20));

  const page = (name) => (name === 'full-menu' ? '/sushi/img/full-menu.webp' : `/sushi/img/${name}-1350.webp`);
  const pages = ['appetizer-1', 'appetizer-2', 'famous-rolls', 'signature-rolls', 'tempura-fried-rolls'];
  // Landscape: three pages fill a 16:9 screen, so show two sets of three.
  // Vertical TV: the whole menu on one picture. Add &cycle=1 to show the pages one by one instead.
  const slides = portrait
    ? (params.get('cycle') ? pages.map((p) => [p]) : [['full-menu']])
    : [['appetizer-1', 'appetizer-2', 'famous-rolls'], ['famous-rolls', 'signature-rolls', 'tempura-fried-rolls']];

  const board = document.getElementById('board');
  if (rotate === '90' || rotate === '270') board.classList.add(`rot${rotate}`);

  const els = slides.map((set) => {
    const slide = document.createElement('div');
    slide.className = 'slide';
    slide.style.setProperty('--count', set.length);
    for (const name of set) {
      const img = document.createElement('img');
      img.src = page(name);
      img.alt = '';
      slide.appendChild(img);
    }
    board.appendChild(slide);
    return slide;
  });

  let i = 0;
  els[0].classList.add('on');
  if (els.length > 1) {
    setInterval(() => {
      els[i].classList.remove('on');
      i = (i + 1) % els.length;
      els[i].classList.add('on');
    }, seconds * 1000);
  }

  // Keep the screen awake where the browser allows it.
  async function stayAwake() {
    try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch (e) { /* not supported */ }
  }
  stayAwake();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) stayAwake(); });

  // Pick up new menu images once an hour, in case prices change.
  setTimeout(() => location.reload(), 60 * 60 * 1000);

  // Tap or click anywhere to go full screen.
  document.addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  });
})();
