// Smooth value noise, shared by the header effects (fire.js).
// Same input, same output: the patterns are fixed, only time makes them move.

const PERM = new Uint8Array(512);
{
  const p = [...Array(256).keys()];
  let seed = 1337;
  for (let i = 255; i > 0; i -= 1) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i += 1) PERM[i] = p[i & 255];
}
const RAND = new Float32Array(256).map((_, i) => PERM[i] / 255);
const fade = (t) => t * t * (3 - 2 * t);
export function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const X = xi & 255;
  const Y = yi & 255;
  const a = RAND[PERM[X + PERM[Y]]];
  const b = RAND[PERM[X + 1 + PERM[Y]]];
  const c = RAND[PERM[X + PERM[Y + 1]]];
  const d = RAND[PERM[X + 1 + PERM[Y + 1]]];
  const u = fade(xf);
  const v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y) {
  return noise(x, y) * 0.5 + noise(x * 2.03, y * 2.03) * 0.25 + noise(x * 4.1, y * 4.1) * 0.15 + noise(x * 8.3, y * 8.3) * 0.1;
}
