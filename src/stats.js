// Figures for the manager dashboard: visitors, sales, orders and customers.
//
// Visitors are counted without cookies. Each page view sends a small beacon (/api/visit).
// The server turns the network address and browser into a code that changes every day,
// so a phone counts once per day and nobody can be followed across days.
// Staff who are signed in, and robots, are not counted.

import { localClock } from './hours.js';

const COUNTED = "status IN ('new','preparing','ready','done')";
const KINDS = new Set(['view', 'dish', 'cart', 'pick']); // 'pick': "Erupt for a meal" was used
const KEEP_DAYS = 400;

// ---------- small helpers (exported for tests) ----------

export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Where a visitor came from: a ?src= tag on the link first (for example ?src=insta in the
// Instagram bio, or ?src=qr on table cards), then the page they came from.
export function classifySource(referrer, src, selfHost = 'volcanostreetfood.com') {
  const tag = String(src || '').toLowerCase().trim();
  if (tag) {
    if (/^(ig|insta|instagram)/.test(tag)) return 'Instagram';
    if (/^(fb|facebook)/.test(tag)) return 'Facebook';
    if (/^(tt|tiktok)/.test(tag)) return 'TikTok';
    if (/^(wa|whatsapp)/.test(tag)) return 'WhatsApp';
    if (/^qr/.test(tag)) return 'QR code';
    if (/^(app|android|twa)/.test(tag)) return 'App';
    if (/^google/.test(tag)) return 'Google';
    return tag.slice(0, 20).replace(/^./, (c) => c.toUpperCase());
  }
  const ref = String(referrer || '');
  if (!ref) return 'Direct';
  if (ref.startsWith('android-app://')) return 'App';
  let host = '';
  try {
    host = new URL(ref).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'Other';
  }
  if (!host || host === selfHost || host.endsWith(`.${selfHost}`) || host.endsWith('.workers.dev')) return 'Direct';
  if (host.includes('instagram')) return 'Instagram';
  if (host.includes('facebook') || host === 'fb.com' || host === 'fb.me' || host === 'm.me') return 'Facebook';
  if (host.includes('google')) return 'Google';
  if (host.includes('tiktok')) return 'TikTok';
  if (host.includes('whatsapp') || host === 'wa.me') return 'WhatsApp';
  if (host.includes('bing') || host.includes('duckduckgo') || host.includes('yahoo')) return 'Other search';
  return host.slice(0, 40);
}

export function deviceOf(userAgent) {
  const ua = String(userAgent || '');
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'Tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return 'Phone';
  return 'Computer';
}

export const isRobot = (userAgent) =>
  !userAgent || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch/i.test(userAgent);

// ---------- recording a visit ----------

export async function recordVisit(db, { body, request, settings, secret, hmac }) {
  const ua = request.headers.get('user-agent') || '';
  if (isRobot(ua)) return false;
  const kind = KINDS.has(body.kind) ? body.kind : 'view';
  const at = Math.floor(Date.now() / 1000);
  const day = localClock(at * 1000, settings.timezone_offset_minutes || 0).date;
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const vid = (await hmac(secret, `visit:${day}:${ip}:${ua}`)).slice(0, 20);
  // A page that reports far too much is ignored for the rest of the day.
  const seen = await db.prepare('SELECT COUNT(*) AS n FROM visits WHERE day = ? AND vid = ?').bind(day, vid).first();
  if (seen && seen.n >= 150) return false;
  // Opening the same dish again, or the order sheet again, within the visit counts once.
  if (kind !== 'view') {
    const again = await db
      .prepare('SELECT 1 FROM visits WHERE day = ? AND vid = ? AND kind = ? AND page = ? LIMIT 1')
      .bind(day, vid, kind, String(body.page || '').slice(0, 60))
      .first();
    if (again) return false;
  }
  const app = body.app === true || String(body.referrer || '').startsWith('android-app://');
  const source = app ? 'App' : classifySource(body.referrer, body.src, new URL(request.url).hostname.replace(/^www\./, ''));
  await db
    .prepare('INSERT INTO visits (day, at, vid, kind, page, source, device, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(day, at, vid, kind, String(body.page || '').slice(0, 60), source, deviceOf(ua), body.lang === 'pap' ? 'Papiamentu' : 'English')
    .run();
  return true;
}

export async function forgetOldVisits(db) {
  await db.prepare('DELETE FROM visits WHERE at < ?').bind(Math.floor(Date.now() / 1000) - KEEP_DAYS * 86400).run();
}

// ---------- the range a dashboard asks for ----------

export function readRange(url, settings) {
  const today = localClock(Date.now(), settings.timezone_offset_minutes || 0).date;
  let from = url.searchParams.get('from');
  let to = url.searchParams.get('to');
  if (!isDate(to) || to > today) to = today;
  if (!isDate(from) || from > to) from = addDays(to, -6);
  if (daysBetween(from, to) > 731) from = addDays(to, -730);
  const length = daysBetween(from, to);
  return { from, to, today, length, prevFrom: addDays(from, -length), prevTo: addDays(from, -1) };
}

// ---------- the dashboard figures ----------

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

async function periodTotals(db, from, to, since) {
  const [orders, visits] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS sales_cents
         FROM orders WHERE ${COUNTED} AND service_day BETWEEN ? AND ? AND created_at >= ?`
      )
      .bind(from, to, since),
    db.prepare("SELECT COUNT(DISTINCT day || vid) AS visitors, SUM(kind = 'view') AS views FROM visits WHERE day BETWEEN ? AND ?").bind(from, to),
  ]);
  const o = orders.results[0];
  const v = visits.results[0];
  return {
    sales_cents: o.sales_cents,
    orders: o.orders,
    average_cents: o.orders ? Math.round(o.sales_cents / o.orders) : 0,
    visitors: v.visitors || 0,
    views: v.views || 0,
    conversion: pct(o.orders, v.visitors || 0),
  };
}

export async function dashboardStats(db, settings, range) {
  const since = settings.sales_since || 0;
  const offsetSec = (settings.timezone_offset_minutes || 0) * 60;
  const { from, to } = range;
  const between = 'service_day BETWEEN ? AND ? AND created_at >= ?';

  const [byDay, byHour, byWeekday, money, kinds, items, categories, optionRows, visitDays, sources, devices, langs, funnel, cancelled, customers, live] =
    await db.batch([
      db
        .prepare(`SELECT service_day AS day, COUNT(*) AS orders, SUM(total_cents) AS sales_cents FROM orders WHERE ${COUNTED} AND ${between} GROUP BY service_day`)
        .bind(from, to, since),
      db
        .prepare(
          `SELECT CAST(strftime('%H', created_at + ?, 'unixepoch') AS INTEGER) AS hour, COUNT(*) AS orders, SUM(total_cents) AS sales_cents
           FROM orders WHERE ${COUNTED} AND ${between} GROUP BY hour`
        )
        .bind(offsetSec, from, to, since),
      db
        .prepare(
          `SELECT CAST(strftime('%w', service_day) AS INTEGER) AS weekday, COUNT(*) AS orders, SUM(total_cents) AS sales_cents
           FROM orders WHERE ${COUNTED} AND ${between} GROUP BY weekday`
        )
        .bind(from, to, since),
      db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_cents END), 0) AS cash_cents,
                  COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_cents END), 0) AS card_cents,
                  COALESCE(SUM(CASE WHEN payment_method = 'sentoo' AND payment_status = 'paid' THEN total_cents END), 0) AS online_cents,
                  COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card','sentoo') THEN total_cents END), 0) AS unrecorded_cents,
                  COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_cents END), 0) AS paid_cents
           FROM orders WHERE ${COUNTED} AND ${between}`
        )
        .bind(from, to, since),
      db
        .prepare(
          `SELECT SUM(pickup_type = 'asap') AS asap, SUM(pickup_type = 'scheduled') AS scheduled,
                  COALESCE(AVG(CASE WHEN status = 'done' THEN (updated_at - created_at) END), 0) AS avg_done_seconds
           FROM orders WHERE ${COUNTED} AND ${between}`
        )
        .bind(from, to, since),
      db
        .prepare(
          `SELECT oi.name AS name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price_cents) AS sales_cents
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.${COUNTED} AND o.service_day BETWEEN ? AND ? AND o.created_at >= ?
           GROUP BY oi.name ORDER BY quantity DESC, sales_cents DESC LIMIT 60`
        )
        .bind(from, to, since),
      db
        .prepare(
          `SELECT COALESCE(c.name, 'Other') AS name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price_cents) AS sales_cents
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           LEFT JOIN items i ON i.id = oi.item_id LEFT JOIN categories c ON c.id = i.category_id
           WHERE o.${COUNTED} AND o.service_day BETWEEN ? AND ? AND o.created_at >= ?
           GROUP BY c.name ORDER BY sales_cents DESC`
        )
        .bind(from, to, since),
      db
        .prepare(
          `SELECT oi.options AS options, oi.quantity AS quantity FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.${COUNTED} AND o.service_day BETWEEN ? AND ? AND o.created_at >= ? AND oi.options != '[]' LIMIT 5000`
        )
        .bind(from, to, since),
      db
        .prepare("SELECT day, COUNT(DISTINCT vid) AS visitors, SUM(kind = 'view') AS views FROM visits WHERE day BETWEEN ? AND ? GROUP BY day")
        .bind(from, to),
      db
        .prepare(
          `SELECT source AS name, COUNT(DISTINCT day || vid) AS visitors FROM visits
           WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY source ORDER BY visitors DESC LIMIT 12`
        )
        .bind(from, to),
      db
        .prepare("SELECT device AS name, COUNT(DISTINCT day || vid) AS visitors FROM visits WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY device ORDER BY visitors DESC")
        .bind(from, to),
      db
        .prepare("SELECT lang AS name, COUNT(DISTINCT day || vid) AS visitors FROM visits WHERE kind = 'view' AND day BETWEEN ? AND ? GROUP BY lang ORDER BY visitors DESC")
        .bind(from, to),
      db
        .prepare(
          `SELECT COUNT(DISTINCT day || vid) AS visitors,
                  COUNT(DISTINCT CASE WHEN kind = 'dish' THEN day || vid END) AS opened_dish,
                  COUNT(DISTINCT CASE WHEN kind = 'cart' THEN day || vid END) AS opened_order
           FROM visits WHERE day BETWEEN ? AND ?`
        )
        .bind(from, to),
      db
        .prepare(
          `SELECT COUNT(*) AS n, SUM(cancelled_by = 'customer') AS by_customer, COALESCE(SUM(total_cents), 0) AS cents
           FROM orders WHERE status = 'cancelled' AND cancelled_by != 'payment' AND ${between}`
        )
        .bind(from, to, since),
      db
        .prepare(
          `WITH firsts AS (SELECT phone, MIN(service_day) AS first_day FROM orders WHERE ${COUNTED} AND created_at >= ? GROUP BY phone)
           SELECT COUNT(DISTINCT o.phone) AS customers,
                  COUNT(DISTINCT CASE WHEN f.first_day >= ? THEN o.phone END) AS new_customers
           FROM orders o JOIN firsts f ON f.phone = o.phone
           WHERE o.${COUNTED} AND o.service_day BETWEEN ? AND ? AND o.created_at >= ?`
        )
        .bind(since, from, from, to, since),
      db
        .prepare('SELECT COUNT(DISTINCT vid) AS n FROM visits WHERE at >= ?')
        .bind(Math.floor(Date.now() / 1000) - 15 * 60),
    ]);

  // Every day in the range, with zeros where nothing happened. Long ranges are shown per month.
  const salesByDay = new Map(byDay.results.map((r) => [r.day, r]));
  const visitsByDay = new Map(visitDays.results.map((r) => [r.day, r]));
  let series = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const s = salesByDay.get(d) || {};
    const v = visitsByDay.get(d) || {};
    series.push({ day: d, orders: s.orders || 0, sales_cents: s.sales_cents || 0, visitors: v.visitors || 0, views: v.views || 0 });
  }
  let bucket = 'day';
  if (series.length > 93) {
    bucket = 'month';
    const months = new Map();
    for (const p of series) {
      const key = p.day.slice(0, 7);
      const m = months.get(key) || { day: `${key}-01`, orders: 0, sales_cents: 0, visitors: 0, views: 0 };
      m.orders += p.orders;
      m.sales_cents += p.sales_cents;
      m.visitors += p.visitors;
      m.views += p.views;
      months.set(key, m);
    }
    series = [...months.values()];
  }

  const hours = Array.from({ length: 24 }, (_, hour) => {
    const r = byHour.results.find((x) => x.hour === hour) || {};
    return { hour, orders: r.orders || 0, sales_cents: r.sales_cents || 0 };
  });
  const weekdays = Array.from({ length: 7 }, (_, weekday) => {
    const r = byWeekday.results.find((x) => x.weekday === weekday) || {};
    return { weekday, orders: r.orders || 0, sales_cents: r.sales_cents || 0 };
  });

  // Most chosen extras and changes ("No onions", "Cajun fries", "Cola Zero").
  const optionCount = new Map();
  for (const row of optionRows.results) {
    let list = [];
    try {
      list = JSON.parse(row.options);
    } catch {
      /* skip */
    }
    for (const name of list) optionCount.set(name, (optionCount.get(name) || 0) + row.quantity);
  }
  const options = [...optionCount.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 12);

  const [current, previous] = await Promise.all([periodTotals(db, from, to, since), periodTotals(db, range.prevFrom, range.prevTo, since)]);
  const k = kinds.results[0];
  const f = funnel.results[0];
  const c = cancelled.results[0];
  const cu = customers.results[0];
  const itemsSold = items.results.reduce((n, i) => n + i.quantity, 0);

  return {
    range: { from, to, length: range.length, prev_from: range.prevFrom, prev_to: range.prevTo, bucket },
    totals: {
      ...current,
      ...money.results[0],
      cancelled: c.n || 0,
      cancelled_by_customer: c.by_customer || 0,
      cancelled_cents: c.cents || 0,
      cancel_rate: pct(c.n || 0, (c.n || 0) + current.orders),
      asap: k.asap || 0,
      scheduled: k.scheduled || 0,
      avg_done_minutes: Math.round((k.avg_done_seconds || 0) / 60),
      items_sold: itemsSold,
      customers: cu.customers || 0,
      new_customers: cu.new_customers || 0,
      returning_customers: (cu.customers || 0) - (cu.new_customers || 0),
    },
    previous,
    series,
    hours,
    weekdays,
    top_items: items.results,
    categories: categories.results,
    options,
    visitors: {
      sources: sources.results,
      devices: devices.results,
      languages: langs.results,
      funnel: {
        visitors: f.visitors || 0,
        opened_dish: f.opened_dish || 0,
        opened_order: f.opened_order || 0,
        ordered: current.orders,
      },
      live: live.results[0].n || 0,
    },
  };
}

// ---------- orders list ----------

export async function orderList(db, settings, range, { q = '', status = '', offset = 0, limit = 50 } = {}) {
  const where = ['service_day BETWEEN ? AND ?', "status != 'awaiting_payment'"];
  const binds = [range.from, range.to];
  if (['new', 'preparing', 'ready', 'done', 'cancelled'].includes(status)) {
    where.push('status = ?');
    binds.push(status);
  } else if (status === 'open') {
    where.push("status IN ('new','preparing','ready')");
  }
  const query = String(q || '').trim().slice(0, 40);
  if (query) {
    const digits = query.replace(/\D/g, '');
    const parts = ['customer_name LIKE ?'];
    binds.push(`%${query}%`);
    if (digits) {
      parts.push('phone LIKE ?', 'CAST(number AS TEXT) = ?');
      binds.push(`%${digits}%`, digits);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const clause = where.join(' AND ');
  const take = Math.min(Math.max(Number(limit) || 50, 1), 2000);
  const skip = Math.max(Number(offset) || 0, 0);
  const [rows, count] = await db.batch([
    db.prepare(`SELECT * FROM orders WHERE ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...binds, take, skip),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN ${COUNTED} THEN total_cents END), 0) AS cents FROM orders WHERE ${clause}`).bind(...binds),
  ]);
  const orders = rows.results;
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const { results: lines } = await db
      .prepare(`SELECT order_id, name, options, note, quantity, unit_price_cents FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all();
    const byOrder = new Map();
    for (const l of lines) {
      if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, []);
      let options = [];
      try {
        options = JSON.parse(l.options || '[]');
      } catch {
        /* skip */
      }
      byOrder.get(l.order_id).push({ name: l.name, options, note: l.note, quantity: l.quantity, unit_price_cents: l.unit_price_cents });
    }
    for (const o of orders) o.items = byOrder.get(o.id) || [];
  }
  return {
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      service_day: o.service_day,
      status: o.status,
      cancelled_by: o.cancelled_by,
      customer_name: o.customer_name,
      phone: o.phone,
      notes: o.notes,
      pickup_type: o.pickup_type,
      pickup_at: o.pickup_at,
      total_cents: o.total_cents,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      created_at: o.created_at,
      updated_at: o.updated_at,
      items: o.items || [],
    })),
    total: count.results[0].n,
    total_cents: count.results[0].cents,
    offset: skip,
    limit: take,
  };
}

// ---------- customers ----------

export async function customerList(db, settings, range) {
  const since = settings.sales_since || 0;
  const { results } = await db
    .prepare(
      `WITH firsts AS (SELECT phone, MIN(created_at) AS first_at, COUNT(*) AS lifetime_orders, SUM(total_cents) AS lifetime_cents
                       FROM orders WHERE ${COUNTED} AND created_at >= ? GROUP BY phone)
       SELECT o.phone AS phone,
              (SELECT customer_name FROM orders x WHERE x.phone = o.phone ORDER BY created_at DESC LIMIT 1) AS name,
              COUNT(*) AS orders, SUM(o.total_cents) AS sales_cents, MAX(o.created_at) AS last_at,
              f.first_at AS first_at, f.lifetime_orders AS lifetime_orders, f.lifetime_cents AS lifetime_cents
       FROM orders o JOIN firsts f ON f.phone = o.phone
       WHERE o.${COUNTED} AND o.service_day BETWEEN ? AND ? AND o.created_at >= ?
       GROUP BY o.phone ORDER BY sales_cents DESC LIMIT 200`
    )
    .bind(since, range.from, range.to, since)
    .all();
  return { customers: results };
}
