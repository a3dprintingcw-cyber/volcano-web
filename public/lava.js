// Live lava for the Street Food header: the red bar melts into thick lava that slowly
// stretches into drips, lets a drop fall, and pulls back up. Glowing veins flow through it.
//
// How it is drawn: the lava is a shape built from a wavy sheet along the top, a tapered
// drip under it at several places, and falling drops, all melted together. Every point
// inside is coloured from dark crust to bright orange by moving noise. It runs on a small
// grid that is scaled up smoothly, so it is cheap on phones.
// Stops when off screen or when the tab is hidden. With "reduce motion" it shows one still frame.

import { fbm, noise } from '/noise.js';

const CELL = 2.5; // CSS pixels per grid cell
const FPS = 30;
const BAR = [164, 59, 37]; // the top bar's red (#a43b25), so the lava starts seamlessly from it

// Melt two shapes together (smooth minimum of distances).
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Distance to a drip: a line from the sheet down to its tip, thin at the neck, round at the end.
function dripDistance(px, py, x, top, length, radius) {
  const tip = top + length;
  const y = Math.max(top, Math.min(tip, py));
  const along = length > 0 ? (y - top) / length : 1;
  // Thin neck, heavy bulb: lava gathers at the bottom before it lets go.
  const r = radius * (0.55 + 0.6 * along * along);
  return Math.hypot(px - x, py - y) - r;
}

export function startLava(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'lava';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);

  const view = canvas.getContext('2d');
  const small = document.createElement('canvas');
  const ctx = small.getContext('2d');
  let image = null;
  let cols = 0;
  let rows = 0;
  let width = 0;
  let height = 0;
  let drips = [];
  let drops = [];
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let running = false;
  let visible = true;
  let last = 0;
  let frameId = 0;
  let clock = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const sheetEdge = (x, t) => 14 + 7 * noise(x * 0.014, t * 0.12) + 3 * noise(x * 0.05 + 9, t * 0.25);

  function makeDrips() {
    const count = Math.max(3, Math.round(width / 72));
    const gap = width / count;
    drips = Array.from({ length: count }, (_, i) => {
      const max = rand(height * 0.5, height * 0.88);
      return {
        x: gap * (i + 0.5) + rand(-gap * 0.25, gap * 0.25),
        radius: rand(8, 12),
        max,
        length: rand(4, max), // start at different stages so they do not move together
        speed: rand(3.5, 8), // CSS pixels per second: slow and heavy
      };
    });
  }

  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    cols = Math.max(1, Math.ceil(width / CELL));
    rows = Math.max(1, Math.ceil(height / CELL));
    small.width = cols;
    small.height = rows;
    image = ctx.createImageData(cols, rows);
    makeDrips();
    drops = [];
  }

  function step(dt) {
    clock += dt;
    for (const d of drips) {
      d.length += d.speed * dt * (0.6 + 0.8 * (d.length / d.max)); // speeds up as it gets heavy
      if (d.length >= d.max) {
        // A drop breaks off and falls; the drip pulls back up.
        drops.push({ x: d.x, y: sheetEdge(d.x, clock) + d.length, r: d.radius * 0.95, vy: 10 });
        d.length = d.max * rand(0.25, 0.45);
        d.max = rand(height * 0.5, height * 0.88);
        d.speed = rand(3.5, 8);
      }
    }
    for (const p of drops) {
      p.vy += 260 * dt;
      p.y += p.vy * dt;
      p.r *= 1 - 0.25 * dt;
    }
    drops = drops.filter((p) => p.y - p.r < height + 4);
  }

  function draw() {
    const t = clock;
    const px = image.data;
    for (let j = 0; j < rows; j += 1) {
      const y = (j + 0.5) * CELL;
      for (let i = 0; i < cols; i += 1) {
        const x = (i + 0.5) * CELL;
        const top = sheetEdge(x, t);
        let d = y - top;
        for (const drip of drips) {
          if (Math.abs(x - drip.x) > drip.radius * 3) continue;
          d = smin(d, dripDistance(x, y, drip.x, sheetEdge(drip.x, t) - 4, drip.length, drip.radius), 7);
        }
        for (const p of drops) {
          if (Math.abs(x - p.x) > p.r * 3 || Math.abs(y - p.y) > p.r * 4) continue;
          // A falling drop is a little stretched while it falls.
          d = smin(d, Math.hypot(x - p.x, (y - p.y) * 0.8) - p.r, 5);
        }
        const o = (j * cols + i) * 4;
        if (d > 1.2) {
          px[o + 3] = 0;
          continue;
        }
        // Lava colour: noise flowing downwards; its ridges are the bright, hot veins.
        const n = noise(x * 0.022, y * 0.03 - t * 0.28) * 0.7 + noise(x * 0.05, y * 0.07 - t * 0.45) * 0.3;
        const vein = Math.pow(1 - Math.abs(n * 2 - 1), 2.5);
        const flicker = 0.9 + 0.1 * noise(x * 0.04, t * 0.8);
        const depth = Math.min(1, -d / 7); // darker crust at the edge, hotter inside
        let r = 110 + 60 * depth;
        let g = 22 + 14 * depth;
        let b = 8;
        const hot = vein * flicker * (0.35 + 0.65 * depth) * 0.95;
        r += (255 - r) * hot;
        g += (150 - g) * hot + 90 * hot * hot;
        b += 30 * hot * hot;
        // A soft shine on the left of each drip, so it looks round and wet.
        const shine = Math.max(0, 1 - Math.abs(d + 3) / 2.2) * 0.14;
        r += (255 - r) * shine;
        g += (210 - g) * shine;
        b += (170 - b) * shine;
        // Near the top it becomes the bar's own red, so there is no seam.
        const blend = Math.max(0, Math.min(1, (y - 2) / 10));
        px[o] = BAR[0] + (r - BAR[0]) * blend;
        px[o + 1] = BAR[1] + (g - BAR[1]) * blend;
        px[o + 2] = BAR[2] + (b - BAR[2]) * blend;
        px[o + 3] = 255 * Math.max(0, Math.min(1, (1.2 - d) / 1.6));
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
    const dt = Math.min(0.1, (now - last) / 1000 || 0.033);
    last = now;
    step(dt);
    draw();
  }

  function update() {
    const should = visible && !document.hidden && !calm;
    if (should && !running) {
      running = true;
      last = performance.now();
      frameId = requestAnimationFrame(loop);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(frameId);
    }
  }

  resize();
  draw();

  const onResize = () => {
    if (host.clientWidth === width && host.clientHeight === height) return;
    resize();
    draw();
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', update);
  const watch = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    update();
  });
  watch.observe(host);
  update();

  return function stopLava() {
    running = false;
    cancelAnimationFrame(frameId);
    watch.disconnect();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', update);
    canvas.remove();
  };
}
