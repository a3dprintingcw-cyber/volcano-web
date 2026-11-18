// Live fire for the rooftop (Volcano Experience) header.
// Flames are made from moving noise: layers of soft random patterns scroll upwards and are
// cut off higher up, which gives licking, flickering tongues with pointed tips. Each point is
// coloured from transparent through deep red and orange to yellow-white at the hottest.
// It runs on a small grid that is scaled up smoothly, so it is cheap on phones.
// Stops when off screen or when the tab is hidden. With "reduce motion" it shows one still frame.

const COLS = 160; // grid width (scaled to the screen width)
const ROWS = 56; // grid height
const FPS = 30;

import { fbm, noise } from '/noise.js';

// ---------- colour ----------
// Heat 0..255 to colour. Cool is transparent so the black bar shows through.
function buildPalette() {
  const stops = [
    [0, [0, 0, 0, 0]],
    [30, [90, 6, 0, 0]],
    [60, [140, 14, 2, 150]],
    [100, [205, 40, 6, 235]],
    [145, [240, 95, 14, 255]],
    [190, [255, 155, 35, 255]],
    [225, [255, 210, 100, 255]],
    [255, [255, 247, 215, 255]],
  ];
  const palette = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    let k = 0;
    while (k < stops.length - 2 && i > stops[k + 1][0]) k += 1;
    const [a, ca] = stops[k];
    const [b, cb] = stops[k + 1];
    const t = (i - a) / (b - a || 1);
    for (let c = 0; c < 4; c += 1) palette[i * 4 + c] = ca[c] + (cb[c] - ca[c]) * t;
  }
  return palette;
}

export function startFire(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fire';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);

  const view = canvas.getContext('2d');
  const small = document.createElement('canvas');
  small.width = COLS;
  small.height = ROWS;
  const ctx = small.getContext('2d');
  const image = ctx.createImageData(COLS, ROWS);
  const palette = buildPalette();
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let running = false;
  let visible = true;
  let last = 0;
  let frameId = 0;
  const start = performance.now();

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(host.clientWidth * ratio);
    canvas.height = Math.round(host.clientHeight * ratio);
  }

  // Width in grid cells of one flame, kept about the same on every screen size.
  const scaleX = () => Math.max(1, host.clientWidth / 390) * 0.14;

  function draw(now) {
    const t = (now - start) / 1000;
    const sx = scaleX();
    const px = image.data;
    for (let j = 0; j < ROWS; j += 1) {
      const up = 1 - j / (ROWS - 1); // 0 at the bottom, 1 at the top
      for (let i = 0; i < COLS; i += 1) {
        const x = i * sx;
        // The flames waver: sideways push from a slow noise, stronger higher up.
        const wobble = (noise(x * 0.5 + 7.3, up * 1.2 - t * 0.8) - 0.5) * 1.8 * up;
        // Noise scrolling upwards gives the rising, licking shapes.
        const n = fbm(x + wobble, up * 1.1 - t * 1.7);
        // Taller in some places than others, changing slowly.
        const reach = 0.55 + 0.45 * noise(x * 0.35 + 50, t * 0.35);
        const base = (1 - up) ** 8 * 0.18; // the bed of embers along the bottom
        const flame = n * 1.5 - up * (0.78 / reach) - 0.3 + base;
        let h = flame <= 0 ? 0 : flame >= 0.85 ? 1 : flame / 0.85;
        h = h * h * (3 - 2 * h);
        const k = ((h * 255) | 0) * 4;
        const o = (j * COLS + i) * 4;
        px[o] = palette[k];
        px[o + 1] = palette[k + 1];
        px[o + 2] = palette[k + 2];
        px[o + 3] = palette[k + 3];
      }
    }
    ctx.putImageData(image, 0, 0);
    view.clearRect(0, 0, canvas.width, canvas.height);
    view.imageSmoothingEnabled = true;
    view.imageSmoothingQuality = 'high';
    view.drawImage(small, 0, 0, canvas.width, canvas.height);
  }

  function loop(now) {
    if (!running) return;
    frameId = requestAnimationFrame(loop);
    if (now - last < 1000 / FPS) return;
    last = now;
    draw(now);
  }

  function update() {
    const should = visible && !document.hidden && !calm;
    if (should && !running) {
      running = true;
      frameId = requestAnimationFrame(loop);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(frameId);
    }
  }

  resize();
  draw(performance.now());

  const onResize = () => {
    resize();
    draw(performance.now());
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', update);
  const watch = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    update();
  });
  watch.observe(host);
  update();

  return function stopFire() {
    running = false;
    cancelAnimationFrame(frameId);
    watch.disconnect();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', update);
    canvas.remove();
  };
}
