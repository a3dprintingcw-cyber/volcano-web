// Star CloudPRNT: the kitchen's Star printer asks this server every few seconds
// whether there is something to print, and prints new website orders by itself.
//
// Protocol (CloudPRNT HTTP):
//   POST  the printer reports its status, we answer whether a job is ready.
//   GET   the printer fetches the job (here: a plain text kitchen ticket).
//   DELETE (or GET with ?delete) the printer says whether printing worked.
//
// No database change: what has been printed is kept in the settings table.

import { formatMinutes, localClock } from './hours.js';
import { receiptPng } from './receipt.js';

const WIDTH = 48; // characters per line on 80 mm paper
const PRINTABLE = "status IN ('new','preparing','ready','done')";
const KEEP_IDS = 300;

async function getSetting(db, key, fallback) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

async function putSetting(db, key, value) {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value))
    .run();
}

// The printer only starts with orders placed after it first connected,
// so switching it on does not print the whole history.
async function startTime(db) {
  let since = await getSetting(db, 'cloudprnt_since', null);
  if (!since) {
    since = Math.floor(Date.now() / 1000);
    await putSetting(db, 'cloudprnt_since', since);
  }
  return since;
}

// Every order prints twice: the kitchen ticket ("k:<id>"), then the customer receipt ("r:<id>").
// Receipts start with orders placed after this feature went live, so nothing old prints.
async function nextJob(db) {
  const since = await startTime(db);
  let receiptSince = await getSetting(db, 'cloudprnt_receipt_since', null);
  if (!receiptSince) {
    receiptSince = Math.floor(Date.now() / 1000);
    await putSetting(db, 'cloudprnt_receipt_since', receiptSince);
  }
  // "Print again" from the kitchen board goes first.
  const again = await getSetting(db, 'cloudprnt_reprint', []);
  if (again.length) return again[0];
  const printed = new Set(await getSetting(db, 'cloudprnt_printed', []));
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const { results } = await db
    .prepare(`SELECT id, created_at FROM orders WHERE ${PRINTABLE} AND created_at >= ? ORDER BY created_at, number LIMIT 50`)
    .bind(Math.max(since, dayAgo))
    .all();
  for (const o of results) {
    // Older tickets were remembered by plain order id.
    if (!printed.has(`k:${o.id}`) && !printed.has(o.id)) return `k:${o.id}`;
    if (o.created_at >= receiptSince && !printed.has(`r:${o.id}`)) return `r:${o.id}`;
  }
  return null;
}

const parseJob = (token) => {
  const m = /^([kr]):(.+)$/.exec(token || '');
  return m ? { kind: m[1], id: m[2] } : { kind: 'k', id: token };
};

// Queue a ticket ("k") or a customer receipt ("r") to print once more. At most 20 waiting.
export async function queueReprint(db, orderId, kind) {
  const again = await getSetting(db, 'cloudprnt_reprint', []);
  again.push(`${kind === 'r' ? 'r' : 'k'}:${orderId}`);
  await putSetting(db, 'cloudprnt_reprint', again.slice(-20));
}

async function markPrinted(db, token) {
  // A reprint is done once printed: take it off the queue.
  const again = await getSetting(db, 'cloudprnt_reprint', []);
  const i = again.indexOf(token);
  if (i !== -1) {
    again.splice(i, 1);
    await putSetting(db, 'cloudprnt_reprint', again);
  }
  const printed = await getSetting(db, 'cloudprnt_printed', []);
  if (printed.includes(token)) return;
  printed.push(token);
  await putSetting(db, 'cloudprnt_printed', printed.slice(-KEEP_IDS));
}

// Remember when the printer last checked in, at most once a minute.
async function noteSeen(db, status) {
  const seen = await getSetting(db, 'cloudprnt_seen', null);
  const now = Date.now();
  if (seen && now - seen.at < 60_000 && seen.status === status) return;
  await putSetting(db, 'cloudprnt_seen', { at: now, status: status || '' });
}

// ---------- the ticket ----------

const ascii = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, '');

function wrap(text, width = WIDTH, indent = '') {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width - indent.length && line) {
      lines.push(indent + line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(indent + line);
  return lines.length ? lines : [indent];
}

const center = (text) => {
  const t = ascii(text).slice(0, WIDTH);
  return ' '.repeat(Math.floor((WIDTH - t.length) / 2)) + t;
};
const leftRight = (left, right) => {
  const r = ascii(right);
  const l = ascii(left).slice(0, WIDTH - r.length - 1);
  return l + ' '.repeat(WIDTH - l.length - r.length) + r;
};
const money = (cents) => `XCG ${(cents / 100).toFixed(2)}`;
const rule = (ch = '-') => ch.repeat(WIDTH);

function payLine(o) {
  if (o.payment_method === 'sentoo') return o.payment_status === 'paid' ? 'PAID ONLINE' : 'ONLINE, NOT PAID YET';
  if (o.payment_method === 'cash') return 'PAY CASH AT PICKUP';
  if (o.payment_method === 'card') return 'PAY CARD AT PICKUP';
  return 'PAY AT PICKUP';
}

export function ticketText(order, offsetMinutes) {
  const time = (sec) => formatMinutes(localClock(sec * 1000, offsetMinutes).minutes);
  const out = [];
  out.push(rule('='));
  out.push(center('VOLCANO STREET FOOD'));
  out.push(center('WEBSITE ORDER'));
  out.push('');
  out.push(center(`ORDER #${order.number}`));
  out.push(rule('='));
  out.push(...wrap(`Name: ${order.customer_name}`));
  out.push(`Phone: ${ascii(order.phone)}`);
  out.push(order.pickup_type === 'scheduled' ? `PICKUP AT ${time(order.pickup_at)}` : `PICKUP ASAP (about ${time(order.pickup_at)})`);
  out.push(`Placed ${time(order.created_at)}`);
  out.push(rule());
  for (const item of order.items) {
    const name = `${item.quantity} x ${ascii(item.name).toUpperCase()}`;
    const price = money(item.unit_price_cents * item.quantity);
    if (name.length + price.length + 1 <= WIDTH) out.push(leftRight(name, price));
    else {
      out.push(...wrap(name));
      out.push(leftRight('', price));
    }
    for (const option of item.options || []) out.push(...wrap(`+ ${option}`, WIDTH, '    '));
    if (item.note) out.push(...wrap(`NOTE: ${item.note}`, WIDTH, '    '));
  }
  out.push(rule());
  out.push(leftRight('TOTAL', money(order.total_cents)));
  out.push(payLine(order));
  if (order.notes) {
    out.push(rule());
    out.push(...wrap(`Kitchen note: ${order.notes}`));
  }
  out.push(rule('='));
  out.push('', '');
  return out.join('\n');
}

// The customer receipt as plain text, laid out like the Lightspeed receipt,
// for printers that do not take pictures.
export function receiptText(order, offsetMinutes) {
  const clock = localClock(order.created_at * 1000, offsetMinutes);
  const [yy, mm, dd] = clock.date.split('-');
  const hhmm = `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`;
  const amt = (cents) => (cents / 100).toFixed(2).replace('.', ',');
  const out = [];
  out.push(rule('='));
  out.push(center(`#${order.number}`));
  out.push(center('VOLCANO STREET FOOD'));
  out.push(rule('='));
  out.push(leftRight('WEBSITE ORDER', `${dd}/${mm}/${yy} ${hhmm}`));
  out.push(leftRight(order.customer_name, order.phone || ''));
  out.push(rule());
  out.push(leftRight('# Item', 'Price'));
  for (const item of order.items) {
    out.push(leftRight(`${item.quantity} ${ascii(item.name).toUpperCase()}`, amt(item.unit_price_cents * item.quantity)));
    for (const option of item.options || []) out.push(...wrap(`* ${String(option).toUpperCase()}`, WIDTH, '   '));
  }
  out.push(rule());
  out.push(leftRight('Total', `XCG ${amt(order.total_cents)}`));
  out.push(rule());
  const paid = order.payment_status === 'paid';
  const method =
    order.payment_method === 'sentoo' ? (paid ? 'Paid online' : 'Online, not paid yet')
      : order.payment_method === 'cash' ? 'Cash at pickup'
        : order.payment_method === 'card' ? 'Card at pickup' : 'Pay at pickup';
  out.push(leftRight('Payment', 'Amount'));
  out.push(leftRight(method, amt(order.total_cents)));
  out.push(leftRight(paid ? 'Total paid' : 'To pay', amt(order.total_cents)));
  out.push(rule());
  const net = Math.round((order.total_cents * 100) / 109);
  const cols = (a, b, c, d) => a.padEnd(12) + b.padStart(12) + c.padStart(12) + d.padStart(12);
  out.push(cols('', 'Net', 'OB', 'Gross'));
  out.push(cols('9,00%:', amt(net), amt(order.total_cents - net), amt(order.total_cents)));
  out.push(rule());
  out.push('');
  out.push(center('Eruption of Flavors!'));
  out.push('');
  out.push('VOLCANO STREET FOOD', 'Rooseveltweg 271', 'Willemstad, Curacao', '+5999 565 2266', 'CRIB : 102.673.913');
  out.push('', '');
  return out.join('\n');
}

// ---------- the endpoint ----------

const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function handleCloudPrnt(request, url, db, loadOrders, settings) {
  const method = request.method;
  const params = url.searchParams;

  // The printer reports in and asks for work.
  if (method === 'POST') {
    let status = '';
    try {
      const body = await request.json();
      status = String(body.statusCode || '').slice(0, 80);
    } catch {
      // A malformed status report still gets an answer.
    }
    await noteSeen(db, status);
    const token = await nextJob(db);
    if (!token) return json({ jobReady: false });
    // Kitchen ticket: plain text. Customer receipt: a picture if the printer takes one, otherwise text.
    const mediaTypes = parseJob(token).kind === 'r' ? ['image/png', 'text/plain'] : ['text/plain'];
    return json({ jobReady: true, mediaTypes, jobToken: token, deleteMethod: 'DELETE' });
  }

  // The printer says how printing went.
  const isDelete = method === 'DELETE' || (method === 'GET' && params.has('delete'));
  if (isDelete) {
    const code = decodeURIComponent(params.get('code') || '');
    const token = params.get('token') || (await nextJob(db));
    if (token && code.startsWith('2')) await markPrinted(db, token.includes(':') ? token : `k:${token}`);
    return new Response(null, { status: 200 });
  }

  // The printer fetches the ticket.
  if (method === 'GET') {
    const token = params.get('token') || (await nextJob(db));
    if (!token) return new Response('', { status: 404 });
    const job = parseJob(token);
    const [order] = await loadOrders(db, 'id = ?', [job.id]);
    if (!order) {
      // Never let a missing order block the printer.
      await markPrinted(db, `${job.kind}:${job.id}`);
      return new Response('', { status: 404 });
    }
    const offset = settings.timezone_offset_minutes || 0;
    const type = params.get('type') || 'text/plain';
    await putSetting(db, 'cloudprnt_last_get', { at: Date.now(), kind: job.kind, type });
    if (job.kind === 'r' && !type.includes('png')) {
      return new Response(receiptText(order, offset), {
        headers: { 'content-type': 'text/plain', 'X-Star-Cut': 'full; feed=true', 'cache-control': 'no-store' },
      });
    }
    if (job.kind === 'r') {
      return new Response(await receiptPng(order, offset), {
        headers: { 'content-type': 'image/png', 'X-Star-Cut': 'full; feed=true', 'cache-control': 'no-store' },
      });
    }
    return new Response(ticketText(order, offset), {
      headers: { 'content-type': 'text/plain', 'X-Star-Cut': 'full; feed=true', 'cache-control': 'no-store' },
    });
  }

  return new Response(null, { status: 405 });
}

export async function printerStatus(db) {
  const [seen, printed, since, lastGet] = await Promise.all([
    getSetting(db, 'cloudprnt_seen', null),
    getSetting(db, 'cloudprnt_printed', []),
    getSetting(db, 'cloudprnt_since', null),
    getSetting(db, 'cloudprnt_last_get', null),
  ]);
  return {
    last_seen: seen ? seen.at : null,
    last_status: seen ? seen.status : '',
    printed: printed.length,
    connected_since: since,
    last_job: lastGet,
  };
}
