// Draws a website order as a receipt-style picture (PNG) for the kitchen's Star printer,
// laid out like the Lightspeed receipt: number bar, logo, items, total, payment, footer.

import { formatMinutes, localClock } from './hours.js';
import { FONTS, LOGO } from './receipt-assets.js';

const WIDTH = 576; // 80 mm paper at 203 dpi
const PAD = 12;
const TAX_RATE = 9; // percent, included in the prices

// ---------- bitmaps ----------

const decoded = new Map();
function bits(b64) {
  if (!decoded.has(b64)) decoded.set(b64, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  return decoded.get(b64);
}

class Canvas {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.px = new Uint8Array(width * height); // 1 = black
    this.bottom = 0;
  }
  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = v;
    if (v && y + 1 > this.bottom) this.bottom = y + 1;
  }
  rect(x, y, w, h, v = 1) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, v);
    if (y + h > this.bottom) this.bottom = y + h;
  }
  blit(x, y, w, h, data, v = 1) {
    const rowBytes = Math.ceil(w / 8);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++)
        if (data[yy * rowBytes + (xx >> 3)] & (0x80 >> (xx & 7))) this.set(x + xx, y + yy, v);
  }
}

const clean = (text) =>
  String(text ?? '')
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, (ch) => ch.normalize('NFD').replace(/[^\x20-\x7e]/g, ''));

function glyph(font, ch) {
  return font.g[ch.charCodeAt(0)] || font.g[63];
}
function textWidth(text, fontName) {
  const font = FONTS[fontName];
  let w = 0;
  for (const ch of clean(text)) w += glyph(font, ch)[0];
  return w;
}
function drawText(c, x, y, text, fontName, v = 1) {
  const font = FONTS[fontName];
  for (const ch of clean(text)) {
    const [w, data] = glyph(font, ch);
    c.blit(x, y, w, font.h, bits(data), v);
    x += w;
  }
  return x;
}
function wrapText(text, fontName, width) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, fontName) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// ---------- layout ----------

const amount = (cents) => (cents / 100).toFixed(2).replace('.', ',');

export function drawReceipt(order, offsetMinutes) {
  const c = new Canvas(WIDTH, 4000);
  let y = 0;
  const right = WIDTH - PAD;
  const lineH = (f) => FONTS[f].h;

  const row = (left, rightText, font = 'body') => {
    const rw = rightText ? textWidth(rightText, font) : 0;
    const lines = wrapText(left, font, right - PAD - rw - 16);
    lines.forEach((l, i) => {
      drawText(c, PAD, y, l, font);
      if (i === 0 && rightText) drawText(c, right - rw, y, rightText, font);
      y += lineH(font) - 2;
    });
  };
  const indented = (text, font = 'body') => {
    for (const l of wrapText(text, font, right - PAD - 40)) {
      drawText(c, PAD + 30, y, l, font);
      y += lineH(font) - 4;
    }
  };
  const rule = (thick = 2) => {
    y += 4;
    c.rect(PAD, y, right - PAD, thick);
    y += thick + 6;
  };
  const centered = (text, font) => {
    for (const l of wrapText(text, font, right - PAD)) {
      drawText(c, Math.round((WIDTH - textWidth(l, font)) / 2), y, l, font);
      y += lineH(font);
    }
  };

  // Number bar
  const barH = FONTS.number.h + 6;
  c.rect(PAD + 30, y, WIDTH - 2 * (PAD + 30), barH);
  const num = String(order.number);
  drawText(c, Math.round((WIDTH - textWidth(num, 'number')) / 2), y + 2, num, 'number', 0);
  y += barH + 16;

  // Logo
  c.blit(Math.round((WIDTH - LOGO.w) / 2), y, LOGO.w, LOGO.h, bits(LOGO.d));
  y += LOGO.h + 14;

  // Header
  const clock = localClock(order.created_at * 1000, offsetMinutes);
  const [yy, mm, dd] = clock.date.split('-');
  const hh = String(Math.floor(clock.minutes / 60)).padStart(2, '0');
  const mi = String(clock.minutes % 60).padStart(2, '0');
  rule();
  row('WEBSITE ORDER', `${dd}/${mm}/${yy} ${hh}:${mi}`);
  const pickup = formatMinutes(localClock(order.pickup_at * 1000, offsetMinutes).minutes);
  row(order.pickup_type === 'scheduled' ? `PICKUP AT ${pickup}` : `PICKUP ASAP (${pickup})`, order.phone);
  row(order.customer_name, '', 'bold');
  rule();

  // Items
  row('# Item', 'Price');
  for (const item of order.items) {
    row(`${item.quantity} ${String(item.name).toUpperCase()}`, amount(item.unit_price_cents * item.quantity));
    for (const option of item.options || []) indented(`* ${String(option).toUpperCase()}`);
    if (item.note) indented(`* NOTE: ${item.note}`);
  }
  rule();
  row('Total', `XCG ${amount(order.total_cents)}`, 'bold');
  rule();

  // Payment
  const paid = order.payment_status === 'paid';
  const method =
    order.payment_method === 'sentoo'
      ? paid
        ? 'Paid online'
        : 'Online, not paid yet'
      : order.payment_method === 'cash'
        ? 'Cash at pickup'
        : order.payment_method === 'card'
          ? 'Card at pickup'
          : 'Pay at pickup';
  row('Payment', 'Amount');
  row(method, amount(order.total_cents));
  row(paid ? 'Total paid' : 'To pay', amount(order.total_cents), 'bold');
  rule();

  // Tax, included in the prices
  const net = Math.round((order.total_cents * 100) / (100 + TAX_RATE));
  const cols = [right - 330, right - 170, right];
  const putRight = (text, x, font = 'body') => drawText(c, x - textWidth(text, font), y, text, font);
  putRight('Net', cols[0]);
  putRight('OB', cols[1]);
  putRight('Gross', cols[2]);
  y += lineH('body') - 2;
  drawText(c, PAD, y, `${TAX_RATE},00%:`, 'body');
  putRight(amount(net), cols[0]);
  putRight(amount(order.total_cents - net), cols[1]);
  putRight(amount(order.total_cents), cols[2]);
  y += lineH('body');
  rule();

  // Kitchen note
  if (order.notes) {
    for (const l of wrapText(`NOTE: ${order.notes}`, 'bold', right - PAD)) {
      drawText(c, PAD, y, l, 'bold');
      y += lineH('bold') - 2;
    }
    rule();
  }

  // Footer
  y += 10;
  centered('Eruption of Flavors!', 'big');
  y += 10;
  for (const l of ['VOLCANO STREET FOOD', 'Rooseveltweg 271', 'Willemstad, Curaçao', '+5999 565 2266', 'CRIB : 102.673.913']) {
    drawText(c, PAD, y, l, 'body');
    y += lineH('body') - 2;
  }
  y += 30; // room before the cut

  return { width: WIDTH, height: Math.max(y, c.bottom), px: c.px };
}

// ---------- PNG ----------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function receiptPng(order, offsetMinutes) {
  const { width, height, px } = drawReceipt(order, offsetMinutes);
  // 1 bit per pixel grayscale: 0 = black, 1 = white.
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array((rowBytes + 1) * height).fill(0);
  for (let y = 0; y < height; y++) {
    const base = y * (rowBytes + 1);
    raw[base] = 0; // no filter
    for (let x = 0; x < width; x++) {
      if (!px[y * width + x]) raw[base + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // grayscale
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
