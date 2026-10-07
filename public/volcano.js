// The volcano on the order page. It smokes when the order comes in, the lava rises
// while the kitchen cooks, and it erupts when the food is ready.
//
// The drawing is plain SVG, moved by the styles in order.css (the "v-" classes).
// The full-screen eruption is drawn on a canvas for a few seconds and then removed.

const SMOKE = [0, 1, 2].map((i) => `<circle class="v-smoke v-smoke-${i}" cx="${152 + i * 8}" cy="52" r="9"/>`).join('');
const SPARKS = Array.from({ length: 12 }, (_, i) => `<circle class="v-spark v-spark-${i}" cx="160" cy="60" r="${i % 3 === 0 ? 5 : 3.5}"/>`).join('');
const STARS = [
  [28, 26], [64, 52], [96, 18], [232, 24], [268, 58], [296, 20], [206, 44], [44, 84],
].map(([x, y], i) => `<circle class="v-star v-star-${i % 3}" cx="${x}" cy="${y}" r="1.4"/>`).join('');

// stage: 'new' | 'preparing' | 'ready' | 'done'
export function volcanoScene(stage, label) {
  return `<div class="volcano v-${stage}" role="img" aria-label="${label}">
    <svg viewBox="0 0 320 190" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="v-lava" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd35a"/><stop offset="0.45" stop-color="#ff8a1f"/><stop offset="1" stop-color="#c8351c"/>
        </linearGradient>
        <clipPath id="v-inside"><path d="M132 190 L151 68 Q160 64 169 68 L188 190 Z"/></clipPath>
      </defs>
      ${STARS}
      <circle class="v-glow" cx="160" cy="62" r="46"/>
      <g class="v-smokes">${SMOKE}</g>
      <g class="v-mountain">
        <path class="v-rock" d="M14 190 L124 64 Q160 50 196 64 L306 190 Z"/>
        <path class="v-rock-light" d="M124 64 Q160 50 196 64 L214 86 Q190 78 176 96 Q160 82 146 98 Q130 80 106 86 Z"/>
        <path class="v-chamber" d="M132 190 L151 68 Q160 64 169 68 L188 190 Z"/>
        <g clip-path="url(#v-inside)"><rect class="v-level" x="110" y="64" width="100" height="130" fill="url(#v-lava)"/></g>
        <ellipse class="v-crater" cx="160" cy="63" rx="34" ry="8"/>
        <ellipse class="v-pool" cx="160" cy="64" rx="27" ry="5.5"/>
        <path class="v-stream v-stream-0" d="M140 66 Q126 100 116 132 T92 190"/>
        <path class="v-stream v-stream-1" d="M181 66 Q194 98 208 130 T232 190"/>
        <path class="v-stream v-stream-2" d="M166 68 Q170 104 160 140 T168 190"/>
      </g>
      <g class="v-sparks">${SPARKS}</g>
    </svg>
  </div>`;
}

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The big moment: lava bursts over the whole screen with the order number in the middle.
export function erupt({ number, title }) {
  if (calm() || document.querySelector('.eruption')) return;
  const layer = document.createElement('div');
  layer.className = 'eruption';
  layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  const words = document.createElement('div');
  words.className = 'eruption-words';
  const small = document.createElement('span');
  small.textContent = title;
  const big = document.createElement('strong');
  big.textContent = `#${number}`;
  words.append(big, small);
  layer.append(canvas, words);
  document.body.append(layer);

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);

  // Lava starts at the crater when the volcano is on screen, otherwise at the bottom middle.
  const crater = document.querySelector('.volcano svg');
  const box = crater && crater.getBoundingClientRect();
  const onScreen = box && box.bottom > 0 && box.top < height;
  const origin = onScreen ? { x: box.left + box.width / 2, y: box.top + box.height * 0.34 } : { x: width / 2, y: height + 10 };

  const COLORS = ['#ffd35a', '#ffb224', '#ff8a1f', '#f0541e', '#c8351c', '#fff1c2'];
  const DURATION = 3600;
  const particles = [];
  const burst = (count, power) => {
    for (let i = 0; i < count; i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const speed = power * (0.45 + Math.random() * 0.75);
      particles.push({
        x: origin.x + (Math.random() - 0.5) * 18,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2.5 + Math.random() * 6.5,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1,
        fade: 0.004 + Math.random() * 0.007,
      });
    }
  };
  const reach = Math.max(11, Math.sqrt(Math.max(origin.y, 200)) * 0.85);
  burst(110, reach);

  const start = performance.now();
  let last = start;
  let nextBurst = 260;
  const frame = (nowTime) => {
    const elapsed = nowTime - start;
    const step = Math.min(2.2, (nowTime - last) / 16.7);
    last = nowTime;
    if (elapsed > nextBurst && elapsed < 1900) {
      burst(45, reach * (0.7 + Math.random() * 0.35));
      nextBurst += 300;
    }
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.vy += 0.34 * step;
      p.vx *= 0.995;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.life -= p.fade * step;
      if (p.life <= 0 || p.y > height + 30) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      // A short tail, so each blob reads as flying lava.
      ctx.globalAlpha *= 0.35;
      ctx.beginPath();
      ctx.arc(p.x - p.vx * 1.6, p.y - p.vy * 1.6, p.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (elapsed < DURATION) requestAnimationFrame(frame);
    else layer.remove();
  };
  requestAnimationFrame(frame);
  // Safety net: never leave the layer behind (a hidden tab pauses the animation).
  setTimeout(() => layer.remove(), DURATION + 1500);
}
