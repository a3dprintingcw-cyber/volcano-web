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

async function nextOrder(db) {
  const since = await startTime(db);
  const printed = new Set(await getSetting(db, 'cloudprnt_printed', []));
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const { results } = await db
    .prepare(`SELECT id FROM orders WHERE ${PRINTABLE} AND created_at >= ? ORDER BY created_at, number LIMIT 50`)
    .bind(Math.max(since, dayAgo))
    .all();
  const next = results.find((o) => !printed.has(o.id));
  return next ? next.id : null;
}

async function markPrinted(db, id) {
  const printed = await getSetting(db, 'cloudprnt_printed', []);
  if (printed.includes(id)) return;
  printed.push(id);
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
    const id = await nextOrder(db);
    return json(id ? { jobReady: true, mediaTypes: ['image/png', 'text/plain'], jobToken: id, deleteMethod: 'DELETE' } : { jobReady: false });
  }

  // The printer says how printing went.
  const isDelete = method === 'DELETE' || (method === 'GET' && params.has('delete'));
  if (isDelete) {
    const code = decodeURIComponent(params.get('code') || '');
    const id = params.get('token') || (await nextOrder(db));
    if (id && code.startsWith('2')) await markPrinted(db, id);
    return new Response(null, { status: 200 });
  }

  // The printer fetches the ticket.
  if (method === 'GET') {
    const id = params.get('token') || (await nextOrder(db));
    if (!id) return new Response('', { status: 404 });
    const [order] = await loadOrders(db, 'id = ?', [id]);
    if (!order) return new Response('', { status: 404 });
    const offset = settings.timezone_offset_minutes || 0;
    // The printer asks for one of the types we offered: a receipt picture, or plain text as a fallback.
    if ((params.get('type') || 'image/png').includes('png')) {
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
  const [seen, printed, since] = await Promise.all([
    getSetting(db, 'cloudprnt_seen', null),
    getSetting(db, 'cloudprnt_printed', []),
    getSetting(db, 'cloudprnt_since', null),
  ]);
  return { last_seen: seen ? seen.at : null, last_status: seen ? seen.status : '', printed: printed.length, connected_since: since };
}
