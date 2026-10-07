// Volcano Street Food backend.
// One Cloudflare Worker serves the website files (from /public) and the API (/api/*).
// Data lives in a D1 database bound as DB.

import { availability, describeHours, localClock } from './hours.js';
import { dayReport, parseRecipients, reportEmail, reportReady, sendDueReport, sendReport } from './report.js';
import { notificationFor, notifyOrder, validEndpoint, vapidKeys } from './push.js';
import {
  PAYMENT_MINUTES,
  SentooError,
  cancelPayment,
  createPayment,
  fetchPayment,
  lookupAllowed,
  sentooEnabled,
  sentooMode,
  webhookTransactionId,
} from './sentoo.js';

const BUSY_EXTRA_MINUTES = 15;
const STATUSES = ['new', 'preparing', 'ready', 'done', 'cancelled'];
const LIMITS = {
  lines: 30,
  quantity: 20,
  name: 60,
  notes: 300,
  itemNote: 120,
  ordersPerWindow: 20, // per network address; customers on the same Wi-Fi share one
  openOrdersPerPhone: 4,
  loginFailures: 8,
  windowSeconds: 15 * 60,
};
const SESSION_DAYS = 14;

// ---------- small helpers ----------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });

const now = () => Math.floor(Date.now() / 1000);

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Send the request as JSON.');
  }
  try {
    const body = await request.json();
    if (body && typeof body === 'object') return body;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, 'The request could not be read.');
}

const cleanText = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const visitor = (request) => request.headers.get('cf-connecting-ip') || 'local';

// ---------- settings ----------

async function loadSettings(db) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of results) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  // Two switches last for one service day only, so nobody has to remember to undo them:
  // "busy" adds time to the wait, "closed today" stops orders for the day.
  const today = localClock(Date.now(), settings.timezone_offset_minutes || 0).date;
  settings.prep_base = settings.prep_minutes;
  settings.busy = settings.busy_day === today;
  if (settings.busy) settings.prep_minutes = Math.min(180, settings.prep_minutes + BUSY_EXTRA_MINUTES);
  settings.closed_today = settings.closed_day === today;
  return settings;
}

// ---------- menu ----------

// Where a dish's photo is served from. Photos shipped with the site are files;
// photos uploaded on the admin page live in the database.
const photoUrls = (image) => {
  if (!image) return null;
  if (image.startsWith('photo:')) return { small: `/api/photos/${image.slice(6)}/small`, large: `/api/photos/${image.slice(6)}/large` };
  return { small: `/img/${image}-420.webp`, large: `/img/${image}-900.webp` };
};

async function loadMenu(db, { withArchived = false } = {}) {
  const [cats, items, groups, options] = await db.batch([
    db.prepare('SELECT * FROM categories ORDER BY sort'),
    db.prepare(`SELECT * FROM items ${withArchived ? '' : 'WHERE archived = 0'} ORDER BY category_id, sort`),
    db.prepare('SELECT * FROM option_groups ORDER BY item_id, sort'),
    db.prepare('SELECT * FROM options ORDER BY group_id, sort'),
  ]);

  const optionsByGroup = new Map();
  for (const o of options.results) {
    if (!optionsByGroup.has(o.group_id)) optionsByGroup.set(o.group_id, []);
    optionsByGroup.get(o.group_id).push({
      id: o.id,
      name: o.name,
      price_cents: o.price_cents,
      alcohol: !!o.alcohol,
      available: !!o.available,
    });
  }
  const groupsByItem = new Map();
  for (const g of groups.results) {
    if (!groupsByItem.has(g.item_id)) groupsByItem.set(g.item_id, []);
    groupsByItem.get(g.item_id).push({
      id: g.id,
      name: g.name,
      min: g.min_choices,
      max: g.max_choices,
      options: optionsByGroup.get(g.id) || [],
    });
  }
  const itemsByCat = new Map();
  for (const i of items.results) {
    const itemGroups = groupsByItem.get(i.id) || [];
    // Lowest price a customer can pay: base price plus the cheapest required choices.
    let from = i.price_cents;
    for (const g of itemGroups) {
      if (g.min > 0) {
        const prices = g.options.filter((o) => o.available).map((o) => o.price_cents).sort((a, b) => a - b);
        from += prices.slice(0, g.min).reduce((a, b) => a + b, 0);
      }
    }
    if (!itemsByCat.has(i.category_id)) itemsByCat.set(i.category_id, []);
    itemsByCat.get(i.category_id).push({
      id: i.id,
      name: i.name,
      description: i.description,
      price_cents: i.price_cents,
      from_cents: from,
      has_price_range: itemGroups.some((g) => g.min > 0 && new Set(g.options.map((o) => o.price_cents)).size > 1),
      image: i.image,
      photo: photoUrls(i.image),
      alcohol: !!i.alcohol,
      available: !!i.available,
      archived: !!i.archived,
      groups: itemGroups,
    });
  }
  return cats.results.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    note: c.note,
    items: itemsByCat.get(c.id) || [],
  }));
}

// Best sellers of the last 30 days, for the "Popular" section.
// Shown only once there are enough real orders for it to mean something.
const POPULAR = { minOrders: 20, show: 6, days: 30 };
async function popularItems(db, settings, menu) {
  const clock = localClock(Date.now(), settings.timezone_offset_minutes);
  const since = new Date(Date.parse(`${clock.date}T00:00:00Z`) - (POPULAR.days - 1) * 86_400_000).toISOString().slice(0, 10);
  const counted = "o.status IN ('new','preparing','ready','done')";
  const [orders, top] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${counted} AND o.service_day >= ? AND o.created_at >= ?`).bind(since, settings.sales_since || 0),
    db
      .prepare(
        `SELECT oi.item_id AS id, SUM(oi.quantity) AS quantity FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE ${counted} AND o.service_day >= ? AND o.created_at >= ? AND oi.item_id IS NOT NULL GROUP BY oi.item_id ORDER BY quantity DESC LIMIT 30`
      )
      .bind(since, settings.sales_since || 0),
  ]);
  if (orders.results[0].n < POPULAR.minOrders) return [];
  // Dishes only: drinks and sides sell the most everywhere and tell nobody anything.
  const dishes = new Set(
    menu.filter((c) => !['beverages', 'sides'].includes(c.slug)).flatMap((c) => c.items.filter((i) => i.available).map((i) => i.id))
  );
  return top.results.map((r) => r.id).filter((id) => dishes.has(id)).slice(0, POPULAR.show);
}

function publicInfo(settings, env) {
  return {
    restaurant_name: settings.restaurant_name,
    phone: settings.phone,
    hours: describeHours(settings.hours),
    prep_minutes: settings.prep_minutes,
    // Online payment is offered only when the Sentoo details are filled in.
    online_payment: sentooEnabled(env),
    // In the Sentoo sandbox no real money moves, and every screen says so.
    payment_test: sentooEnabled(env) && sentooMode(env) === 'sandbox',
  };
}

// ---------- rate limiting ----------

async function countEvents(db, kind, who) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM rate_events WHERE kind = ? AND who = ? AND at > ?')
    .bind(kind, who, now() - LIMITS.windowSeconds)
    .first();
  return row.n;
}

async function recordEvent(db, kind, who) {
  await db.batch([
    db.prepare('INSERT INTO rate_events (kind, who, at) VALUES (?, ?, ?)').bind(kind, who, now()),
    db.prepare('DELETE FROM rate_events WHERE at < ?').bind(now() - 24 * 3600),
  ]);
}

// ---------- orders ----------

function priceLines(menu, requested) {
  const itemsById = new Map();
  for (const cat of menu) for (const item of cat.items) itemsById.set(item.id, item);

  if (!Array.isArray(requested) || requested.length === 0) throw new HttpError(400, 'Your cart is empty.');
  if (requested.length > LIMITS.lines) throw new HttpError(400, 'That is a lot of food. Please call us for an order this large.');

  let total = 0;
  let alcohol = false;
  const lines = requested.map((line) => {
    const item = itemsById.get(Number(line.item_id));
    if (!item) throw new HttpError(409, 'An item in your cart is no longer on the menu. Please review your cart.');
    if (!item.available) throw new HttpError(409, `${item.name} just sold out. Please remove it from your cart.`);

    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > LIMITS.quantity) {
      throw new HttpError(400, `Choose a quantity between 1 and ${LIMITS.quantity} for ${item.name}.`);
    }

    const chosenIds = new Set((Array.isArray(line.option_ids) ? line.option_ids : []).map(Number));
    const known = new Set();
    const chosenNames = [];
    let unit = item.price_cents;
    if (item.alcohol) alcohol = true;

    for (const group of item.groups) {
      const picked = group.options.filter((o) => chosenIds.has(o.id));
      for (const o of group.options) known.add(o.id);
      if (picked.length < group.min || picked.length > group.max) {
        throw new HttpError(400, `Please check the "${group.name}" choice for ${item.name}.`);
      }
      for (const o of picked) {
        if (!o.available) throw new HttpError(409, `${o.name} is not available for ${item.name} right now.`);
        unit += o.price_cents;
        chosenNames.push(o.name);
        if (o.alcohol) alcohol = true;
      }
    }
    for (const id of chosenIds) {
      if (!known.has(id)) throw new HttpError(400, `An option for ${item.name} is not valid. Please add it to your cart again.`);
    }

    total += unit * quantity;
    return {
      item_id: item.id,
      name: item.name,
      options: chosenNames,
      note: cleanText(line.note, LIMITS.itemNote),
      quantity,
      unit_price_cents: unit,
    };
  });
  return { lines, total, alcohol };
}

async function createOrder(request, env) {
  const db = env.DB;
  const body = await readJson(request);
  const who = visitor(request);

  if ((await countEvents(db, 'order', who)) >= LIMITS.ordersPerWindow) {
    throw new HttpError(429, 'You have placed several orders in a short time. Please wait a few minutes or call us.');
  }

  const name = cleanText(body.name, LIMITS.name);
  if (name.length < 2) throw new HttpError(400, 'Please enter your name so we can call it out at pickup.');
  const phone = String(body.phone ?? '').replace(/[^\d+]/g, '');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) throw new HttpError(400, 'Please enter a phone number we can reach you on.');
  const notes = cleanText(body.notes, LIMITS.notes);
  const payOnline = body.payment === 'sentoo';
  if (payOnline && !sentooEnabled(env)) {
    throw new HttpError(400, 'Online payment is not available right now. Please choose to pay at pickup.');
  }

  const [settings, menu] = await Promise.all([loadSettings(db), loadMenu(db)]);
  const avail = availability(settings, Date.now());
  if (!avail.can_order) throw new HttpError(409, avail.message);

  let pickupType;
  let pickupAt;
  if (body.pickup === 'asap') {
    if (!avail.asap) throw new HttpError(409, 'We are not open yet. Please choose a pickup time.');
    pickupType = 'asap';
    pickupAt = avail.asap.at;
  } else {
    const slot = avail.slots.find((s) => s.at === Number(body.pickup));
    if (!slot) throw new HttpError(409, 'That pickup time is no longer available. Please choose another one.');
    pickupType = 'scheduled';
    pickupAt = slot.at;
  }

  const { lines, total, alcohol } = priceLines(menu, body.items);
  if (alcohol && body.age_confirmed !== true) {
    throw new HttpError(400, 'Please confirm you are 18 or older to order alcohol.');
  }

  const openForPhone = await db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status IN ('new','preparing','ready')")
    .bind(phone)
    .first();
  if (openForPhone.n >= LIMITS.openOrdersPerPhone) {
    throw new HttpError(429, 'This phone number already has several open orders. Please call us to add more.');
  }

  const id = crypto.randomUUID();
  const created = now();
  // The order number is unique per service day. If two orders race for the
  // same number the insert fails and we try the next one.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const next = await db
      .prepare('SELECT COALESCE(MAX(number), 100) + 1 AS n FROM orders WHERE service_day = ?')
      .bind(avail.service_day)
      .first();
    try {
      await db.batch([
        db
          .prepare(
            `INSERT INTO orders (id, number, service_day, status, customer_name, phone, notes, pickup_type, pickup_at, total_cents, payment_method, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            id,
            next.n,
            avail.service_day,
            // An order paid online stays out of the kitchen until Sentoo confirms the payment.
            payOnline ? 'awaiting_payment' : 'new',
            name,
            phone,
            notes,
            pickupType,
            pickupAt,
            total,
            payOnline ? 'sentoo' : 'pickup',
            created,
            created
          ),
        ...lines.map((l) =>
          db
            .prepare(
              'INSERT INTO order_items (order_id, item_id, name, options, note, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .bind(id, l.item_id, l.name, JSON.stringify(l.options), l.note, l.quantity, l.unit_price_cents)
        ),
      ]);
      await recordEvent(db, 'order', who);
      if (!payOnline) return json({ id, number: next.n }, 201);
      return startPayment(request, env, { id, number: next.n, total, created, offsetMinutes: settings.timezone_offset_minutes });
    } catch (err) {
      if (!String(err && err.message).includes('UNIQUE')) throw err;
    }
  }
  throw new HttpError(503, 'We could not place your order just now. Please try again.');
}

// ---------- online payment (Sentoo) ----------

async function startPayment(request, env, { id, number, total, created, offsetMinutes }) {
  const db = env.DB;
  try {
    const payment = await createPayment(env, {
      amountCents: total,
      description: `Volcano Street Food order ${number}`,
      // Sentoo adds the payment attempt status to the end of this address.
      returnUrl: `${new URL(request.url).origin}/order?id=${id}&attempt=`,
      customer: `Order ${number}`,
      expiresAt: created + PAYMENT_MINUTES * 60,
      offsetMinutes,
    });
    await db
      .prepare("UPDATE orders SET sentoo_transaction_id = ?, pay_url = ?, pay_state = 'issued' WHERE id = ?")
      .bind(payment.transactionId.toLowerCase(), payment.url, id)
      .run();
    return json({ id, number, pay_url: payment.url }, 201);
  } catch (err) {
    // No payment link means the order cannot be paid: close it so it does not linger.
    await db
      .prepare("UPDATE orders SET status = 'cancelled', cancelled_by = 'payment', payment_status = 'failed', updated_at = ? WHERE id = ? AND status = 'awaiting_payment'")
      .bind(now(), id)
      .run();
    if (err instanceof SentooError) {
      console.error('Sentoo payment could not be started', err.status, err.reference || '', err.message);
      throw new HttpError(502, 'Online payment could not be started. Please try again, or choose to pay at pickup.');
    }
    throw err;
  }
}

// Asks Sentoo for the status of an order's payment and records the answer.
// This is the only place an order can become paid. It is safe to run many times.
// kind is 'webhook', 'return' or 'poll'. Returns false when no lookup was made.
async function syncPayment(env, order, kind) {
  const db = env.DB;
  if (order.payment_method !== 'sentoo' || !order.sentoo_transaction_id || !sentooEnabled(env)) return false;
  if (['success', 'cancelled', 'expired'].includes(order.pay_state)) return false; // final, nothing more to learn
  const at = now();
  if (!lookupAllowed(order, at, kind)) return false;

  const windowOpen = at - order.pay_window_start < 3600;
  await db
    .prepare('UPDATE orders SET pay_checks = ?, pay_window_start = ?, pay_checked_at = ? WHERE id = ?')
    .bind(windowOpen ? order.pay_checks + 1 : 1, windowOpen ? order.pay_window_start : at, at, order.id)
    .run();

  const payment = await fetchPayment(env, order.sentoo_transaction_id);
  const record = db
    .prepare('UPDATE orders SET pay_state = ?, pay_attempt = ?, pay_message = ?, updated_at = ? WHERE id = ?')
    .bind(payment.state, payment.attempt, payment.message, at, order.id);

  if (payment.state === 'success') {
    const settings = await loadSettings(db);
    await db.batch([
      record,
      db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").bind(order.id),
      // Release the order to the kitchen exactly once. If paying took a while,
      // the pickup time moves so the kitchen still gets its preparation time.
      db
        .prepare("UPDATE orders SET status = 'new', pickup_at = MAX(pickup_at, ?) WHERE id = ? AND status = 'awaiting_payment'")
        .bind(at + settings.prep_minutes * 60, order.id),
    ]);
  } else if (payment.state === 'cancelled' || payment.state === 'expired') {
    await db.batch([
      record,
      db
        .prepare("UPDATE orders SET status = 'cancelled', cancelled_by = 'payment', payment_status = 'failed' WHERE id = ? AND status = 'awaiting_payment'")
        .bind(order.id),
    ]);
  } else {
    await record.run();
  }
  return true;
}

// Sentoo calls this when a transaction changes. The call carries only a transaction id,
// never a status. We answer "success" unless we need Sentoo to try again later.
async function sentooWebhook(request, env) {
  const ok = () => json({ success: true });
  const transactionId = webhookTransactionId(await request.text());
  if (!transactionId) return ok(); // refund notices and anything else we do not use
  const order = await env.DB.prepare('SELECT * FROM orders WHERE sentoo_transaction_id = ?').bind(transactionId).first();
  if (!order) return ok();
  if (['success', 'cancelled', 'expired'].includes(order.pay_state)) return ok();
  try {
    const looked = await syncPayment(env, order, 'webhook');
    // Out of lookups for this hour: ask Sentoo to call again later.
    if (!looked) return json({ success: false }, 503);
    return ok();
  } catch (err) {
    console.error('Sentoo webhook could not confirm the status', err.message);
    return json({ success: false }, 503);
  }
}

// A customer cancels their own order. Allowed only before the kitchen starts on it.
async function customerCancel(env, id) {
  const db = env.DB;
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!order) throw new HttpError(404, 'We could not find that order.');
  const at = now();

  if (order.status === 'awaiting_payment') {
    if (order.pay_state === 'pending') {
      throw new HttpError(409, 'Your bank is still processing the payment, so this order cannot be cancelled right now.');
    }
    // Close the payment link first, so the order cannot be paid after it is cancelled.
    if (order.sentoo_transaction_id && sentooEnabled(env) && !(await cancelPayment(env, order.sentoo_transaction_id))) {
      // Sentoo refuses when the payment went through in the meantime: find out which.
      try {
        await syncPayment(env, order, 'webhook');
      } catch {
        /* handled below */
      }
      const fresh = await db.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first();
      if (fresh.status !== 'awaiting_payment') return;
      throw new HttpError(502, 'We could not cancel the payment just now. Please try again in a moment.');
    }
    await db
      .prepare("UPDATE orders SET status = 'cancelled', cancelled_by = 'customer', payment_status = 'failed', pay_state = 'cancelled', updated_at = ? WHERE id = ? AND status = 'awaiting_payment'")
      .bind(at, id)
      .run();
    return;
  }

  if (order.status === 'cancelled') return;
  if (order.status !== 'new') {
    throw new HttpError(409, 'The kitchen has already started on your order. Please call us if something needs to change.');
  }
  if (order.payment_method === 'sentoo' && order.payment_status === 'paid') {
    throw new HttpError(409, 'This order is already paid. Please call us and we will cancel it and arrange your refund.');
  }
  const result = await db
    .prepare("UPDATE orders SET status = 'cancelled', cancelled_by = 'customer', updated_at = ? WHERE id = ? AND status = 'new'")
    .bind(at, id)
    .run();
  if (!result.meta.changes) {
    throw new HttpError(409, 'The kitchen has just started on your order. Please call us if something needs to change.');
  }
}

// Runs every few minutes (see "triggers" in wrangler.jsonc). Closes online payments
// that were started and then abandoned, so they do not sit open forever.
async function closeAbandonedPayments(env) {
  const db = env.DB;
  const at = now();
  const { results } = await db
    .prepare("SELECT * FROM orders WHERE status = 'awaiting_payment' AND created_at < ? ORDER BY created_at LIMIT 20")
    .bind(at - (PAYMENT_MINUTES + 5) * 60)
    .all();
  for (const order of results) {
    try {
      // One last look: the payment may have gone through without us hearing about it.
      await syncPayment(env, order, 'webhook');
      const fresh = await db.prepare('SELECT status, pay_state FROM orders WHERE id = ?').bind(order.id).first();
      if (fresh.status !== 'awaiting_payment' || fresh.pay_state === 'pending') continue;
      if (order.sentoo_transaction_id && sentooEnabled(env) && !(await cancelPayment(env, order.sentoo_transaction_id))) continue;
      await db
        .prepare("UPDATE orders SET status = 'cancelled', cancelled_by = 'payment', payment_status = 'failed', updated_at = ? WHERE id = ? AND status = 'awaiting_payment'")
        .bind(at, order.id)
        .run();
    } catch (err) {
      console.error('Could not close abandoned payment', order.id, err.message);
    }
  }
  await db.prepare('DELETE FROM rate_events WHERE at < ?').bind(at - 24 * 3600).run();
}

// Sales figures for the owner: today, the last 7 service days, and best sellers.
async function salesSummary(db, settings) {
  const clock = localClock(Date.now(), settings.timezone_offset_minutes);
  const daysAgo = (n) => new Date(Date.parse(`${clock.date}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const counted = "status IN ('new','preparing','ready','done')";
  // Orders from before this moment (demos, tests) are not counted.
  const since = settings.sales_since || 0;
  const [days, top, cancelled] = await db.batch([
    db
      .prepare(
        `SELECT service_day AS day, COUNT(*) AS orders, SUM(total_cents) AS total_cents,
                SUM(CASE WHEN payment_method = 'sentoo' AND payment_status = 'paid' THEN total_cents ELSE 0 END) AS online_cents
         FROM orders WHERE ${counted} AND service_day >= ? AND created_at >= ? GROUP BY service_day ORDER BY service_day DESC`
      )
      .bind(daysAgo(6), since),
    db
      .prepare(
        `SELECT oi.name AS name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price_cents) AS total_cents
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.${counted} AND o.service_day >= ? AND o.created_at >= ? GROUP BY oi.name ORDER BY quantity DESC, total_cents DESC LIMIT 10`
      )
      .bind(daysAgo(29), since),
    db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled' AND cancelled_by != 'payment' AND service_day = ? AND created_at >= ?").bind(clock.date, since),
  ]);
  const today = days.results.find((d) => d.day === clock.date) || { day: clock.date, orders: 0, total_cents: 0, online_cents: 0 };
  return {
    today: { ...today, cancelled: cancelled.results[0].n, average_cents: today.orders ? Math.round(today.total_cents / today.orders) : 0 },
    days: days.results,
    top_items: top.results,
  };
}

async function loadOrders(db, where, binds) {
  const { results: orders } = await db
    .prepare(`SELECT * FROM orders WHERE ${where} ORDER BY pickup_at, created_at`)
    .bind(...binds)
    .all();
  if (orders.length === 0) return [];
  const { results: items } = await db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${orders.map(() => '?').join(',')}) ORDER BY id`)
    .bind(...orders.map((o) => o.id))
    .all();
  const byOrder = new Map();
  for (const item of items) {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id).push({
      name: item.name,
      options: JSON.parse(item.options || '[]'),
      note: item.note,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
    });
  }
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
}

// What a customer may see about their own order.
const customerView = (o) => ({
  id: o.id,
  number: o.number,
  status: o.status,
  customer_name: o.customer_name,
  notes: o.notes,
  pickup_type: o.pickup_type,
  pickup_at: o.pickup_at,
  total_cents: o.total_cents,
  payment_method: o.payment_method,
  payment_status: o.payment_status,
  // Payment progress as Sentoo reports it, for orders paid online.
  pay_state: o.pay_state,
  pay_attempt: o.pay_attempt,
  pay_message: o.pay_message,
  pay_checked_at: o.pay_checked_at,
  // The same Sentoo link can be reused until the payment is final.
  pay_url: o.status === 'awaiting_payment' && ['issued', ''].includes(o.pay_state) ? o.pay_url : null,
  cancelled_by: o.cancelled_by,
  // The customer may cancel until the kitchen starts, unless it is already paid online.
  can_cancel:
    (o.status === 'new' && !(o.payment_method === 'sentoo' && o.payment_status === 'paid')) ||
    (o.status === 'awaiting_payment' && o.pay_state !== 'pending'),
  created_at: o.created_at,
  items: o.items,
});

// ---------- staff sessions ----------

const encoder = new TextEncoder();
const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

// Compares two secrets without leaking how many characters matched.
async function sameSecret(secret, a, b) {
  const [ha, hb] = await Promise.all([hmac(secret, `pin:${a}`), hmac(secret, `pin:${b}`)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

function staffConfigured(env) {
  return Boolean(env.SESSION_SECRET && env.STAFF_PIN && env.ADMIN_PIN);
}

async function sessionRole(request, env) {
  if (!staffConfigured(env)) return null;
  const cookie = (request.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith('volcano_staff='));
  if (!cookie) return null;
  const [role, expires, signature] = cookie.slice('volcano_staff='.length).split('.');
  if (!['staff', 'admin'].includes(role) || !(Number(expires) > now()) || !signature) return null;
  const expected = await hmac(env.SESSION_SECRET, `session:${role}.${expires}`);
  let diff = signature.length ^ expected.length;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  return diff === 0 ? role : null;
}

async function requireRole(request, env, needed) {
  if (!staffConfigured(env)) throw new HttpError(503, 'Staff access has not been set up yet. See the README.');
  const role = await sessionRole(request, env);
  if (!role) throw new HttpError(401, 'Please sign in.');
  if (needed === 'admin' && role !== 'admin') throw new HttpError(403, 'This needs the manager PIN.');
  return role;
}

function sessionCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `volcano_staff=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function login(request, env) {
  if (!staffConfigured(env)) throw new HttpError(503, 'Staff access has not been set up yet. See the README.');
  const who = visitor(request);
  if ((await countEvents(env.DB, 'login_fail', who)) >= LIMITS.loginFailures) {
    throw new HttpError(429, 'Too many wrong PINs. Please wait 15 minutes and try again.');
  }
  const body = await readJson(request);
  const pin = String(body.pin ?? '');
  let role = null;
  if (await sameSecret(env.SESSION_SECRET, pin, env.ADMIN_PIN)) role = 'admin';
  else if (await sameSecret(env.SESSION_SECRET, pin, env.STAFF_PIN)) role = 'staff';
  if (!role) {
    await recordEvent(env.DB, 'login_fail', who);
    throw new HttpError(401, 'That PIN is not right.');
  }
  const expires = now() + SESSION_DAYS * 24 * 3600;
  const signature = await hmac(env.SESSION_SECRET, `session:${role}.${expires}`);
  return json({ role }, 200, { 'set-cookie': sessionCookie(request, `${role}.${expires}.${signature}`, SESSION_DAYS * 24 * 3600) });
}

// ---------- admin edits ----------

async function updateRow(db, table, id, changes) {
  const keys = Object.keys(changes);
  if (keys.length === 0) throw new HttpError(400, 'Nothing to change.');
  const result = await db
    .prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
    .bind(...keys.map((k) => changes[k]), id)
    .run();
  if (!result.meta.changes) throw new HttpError(404, 'Not found.');
}

function priceField(value) {
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0 || cents > 100_000) throw new HttpError(400, 'Enter a price between 0 and 1000.');
  return cents;
}

function validateSettings(input, current) {
  const next = {};
  if ('ordering_paused' in input) next.ordering_paused = Boolean(input.ordering_paused);
  if ('paused_message' in input) next.paused_message = cleanText(input.paused_message, 160);
  if ('phone' in input) next.phone = cleanText(input.phone, 30);
  if ('report_email' in input) {
    try {
      next.report_email = parseRecipients(input.report_email).join(', ');
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  }
  if ('prep_minutes' in input) {
    const n = Number(input.prep_minutes);
    if (!Number.isInteger(n) || n < 5 || n > 120) throw new HttpError(400, 'Preparation time must be between 5 and 120 minutes.');
    next.prep_minutes = n;
  }
  if ('last_order_minutes_before_close' in input) {
    const n = Number(input.last_order_minutes_before_close);
    if (!Number.isInteger(n) || n < 0 || n > 120) throw new HttpError(400, 'Last order time must be between 0 and 120 minutes before closing.');
    next.last_order_minutes_before_close = n;
  }
  if ('hours' in input) {
    const hours = {};
    for (let day = 0; day < 7; day += 1) {
      const h = input.hours ? input.hours[day] : null;
      if (!h) {
        hours[day] = null;
        continue;
      }
      const open = Number(h.open);
      const close = Number(h.close);
      if (!Number.isInteger(open) || !Number.isInteger(close) || open < 0 || close > 1440 || open >= close) {
        throw new HttpError(400, 'Opening time must be before closing time, and closing can be midnight at the latest.');
      }
      hours[day] = { open, close };
    }
    next.hours = hours;
  }
  return { ...current, ...next, _changed: next };
}

// ---------- routing ----------

async function handleApi(request, env, url, ctx) {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  let match;

  // Public
  if (path === '/api/menu' && method === 'GET') {
    const [settings, menu] = await Promise.all([loadSettings(db), loadMenu(db)]);
    return json({
      info: publicInfo(settings, env),
      availability: availability(settings, Date.now()),
      menu,
      popular: await popularItems(db, settings, menu),
    });
  }
  if ((match = path.match(/^\/api\/photos\/([0-9a-f-]{36})\/(small|large)$/)) && method === 'GET') {
    const row = await db.prepare(`SELECT ${match[2]} AS data FROM photos WHERE id = ?`).bind(match[1]).first();
    if (!row) throw new HttpError(404, 'Photo not found.');
    return new Response(new Uint8Array(row.data), {
      headers: {
        'content-type': 'image/jpeg',
        // A photo never changes under the same id, so it can be kept for a long time.
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  }
  if (path === '/api/orders' && method === 'POST') return createOrder(request, env);
  if ((match = path.match(/^\/api\/orders\/([0-9a-f-]{36})$/)) && method === 'GET') {
    const [order] = await loadOrders(db, 'id = ?', [match[1]]);
    if (!order) throw new HttpError(404, 'We could not find that order.');
    const settings = await loadSettings(db);
    return json({ order: customerView(order), info: publicInfo(settings, env) });
  }
  // The order page asks us to confirm the payment with Sentoo. How often we really
  // ask Sentoo is limited inside syncPayment, whatever the browser does.
  if ((match = path.match(/^\/api\/orders\/([0-9a-f-]{36})\/payment\/check$/)) && method === 'POST') {
    let [order] = await loadOrders(db, 'id = ?', [match[1]]);
    if (!order) throw new HttpError(404, 'We could not find that order.');
    try {
      // "returned" means the customer has just come back from Sentoo's payment page.
      const kind = url.searchParams.get('returned') === '1' ? 'return' : 'poll';
      if (await syncPayment(env, order, kind)) [order] = await loadOrders(db, 'id = ?', [match[1]]);
    } catch (err) {
      console.error('Sentoo status check failed', err.message);
    }
    const settings = await loadSettings(db);
    return json({ order: customerView(order), info: publicInfo(settings, env) });
  }
  if (path === '/api/sentoo/webhook' && method === 'POST') return sentooWebhook(request, env);

  // Phone notifications. See src/push.js for how the pieces fit.
  if (path === '/api/push/key' && method === 'GET') {
    return json({ key: (await vapidKeys(db)).publicKey });
  }
  if ((match = path.match(/^\/api\/orders\/([0-9a-f-]{36})\/push$/)) && method === 'POST') {
    const body = await readJson(request);
    if (!validEndpoint(env, body.endpoint)) throw new HttpError(400, 'Notifications could not be switched on for this browser.');
    const order = await db.prepare('SELECT id, status FROM orders WHERE id = ?').bind(match[1]).first();
    if (!order) throw new HttpError(404, 'We could not find that order.');
    const count = await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE order_id = ?').bind(order.id).first();
    if (count.n < 5) {
      await db
        .prepare('INSERT OR IGNORE INTO push_subscriptions (order_id, endpoint, created_at) VALUES (?, ?, ?)')
        .bind(order.id, String(body.endpoint), now())
        .run();
    }
    return json({ ok: true });
  }
  // The phone asks what to show. It identifies itself by its own push address.
  if (path === '/api/push/message' && method === 'POST') {
    const body = await readJson(request);
    const order = await db
      .prepare(
        `SELECT o.id, o.number, o.status FROM push_subscriptions p JOIN orders o ON o.id = p.order_id
         WHERE p.endpoint = ? AND o.status IN ('ready', 'cancelled') ORDER BY o.updated_at DESC LIMIT 1`
      )
      .bind(String(body.endpoint || ''))
      .first();
    if (!order) return json({ title: 'Volcano Street Food', body: 'There is news about your order.', url: '/' });
    const settings = await loadSettings(db);
    return json({ ...notificationFor(order, settings.phone), url: `/order?id=${order.id}`, tag: `order-${order.id}` });
  }
  if ((match = path.match(/^\/api\/orders\/([0-9a-f-]{36})\/cancel$/)) && method === 'POST') {
    await customerCancel(env, match[1]);
    const [order] = await loadOrders(db, 'id = ?', [match[1]]);
    const settings = await loadSettings(db);
    return json({ order: customerView(order), info: publicInfo(settings, env) });
  }

  // Staff sign in
  if (path === '/api/staff/login' && method === 'POST') return login(request, env);
  if (path === '/api/staff/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', 0) });
  }
  if (path === '/api/staff/session' && method === 'GET') {
    return json({ role: await sessionRole(request, env), configured: staffConfigured(env) });
  }

  // Kitchen board
  if (path === '/api/staff/orders' && method === 'GET') {
    await requireRole(request, env, 'staff');
    const settings = await loadSettings(db);
    const clock = localClock(Date.now(), settings.timezone_offset_minutes);
    // Everything from today's service, plus anything still open from before.
    // Orders still waiting for an online payment are not the kitchen's business yet.
    const orders = await loadOrders(
      db,
      "(service_day = ? OR status IN ('new','preparing','ready')) AND status != 'awaiting_payment'",
      [clock.date]
    );
    return json({
      orders,
      service_day: clock.date,
      ordering_paused: Boolean(settings.ordering_paused),
      payment_test: sentooEnabled(env) && sentooMode(env) === 'sandbox',
      prep_minutes: settings.prep_minutes,
      prep_base: settings.prep_base,
      busy: settings.busy,
      busy_extra: BUSY_EXTRA_MINUTES,
      availability: availability(settings, Date.now()),
      server_time: now(),
    });
  }
  if ((match = path.match(/^\/api\/staff\/orders\/([0-9a-f-]{36})$/)) && method === 'PATCH') {
    await requireRole(request, env, 'staff');
    const body = await readJson(request);
    const changes = { updated_at: now() };
    if ('status' in body) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Unknown status.');
      changes.status = body.status;
      changes.cancelled_by = body.status === 'cancelled' ? 'staff' : '';
    }
    if ('paid' in body) changes.payment_status = body.paid ? 'paid' : 'unpaid';
    await updateRow(db, 'orders', match[1], changes);
    // Tell the customer's phone. This runs after the kitchen's tap has been answered.
    if (changes.status === 'ready' || changes.status === 'cancelled') ctx.waitUntil(notifyOrder(env, match[1]));
    return json({ ok: true });
  }
  // The kitchen sets how long orders take right now, so customers get an honest pickup time.
  if (path === '/api/staff/prep' && method === 'POST') {
    await requireRole(request, env, 'staff');
    const minutes = Number((await readJson(request)).minutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw new HttpError(400, 'Choose a wait time between 5 and 120 minutes.');
    await db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind('prep_minutes', JSON.stringify(minutes))
      .run();
    return json({ ok: true, prep_minutes: minutes });
  }
  // One-day switches: "busy" (longer wait) and "closed today". Both end by themselves at midnight.
  if ((match = path.match(/^\/api\/staff\/(busy|closed)$/)) && method === 'POST') {
    await requireRole(request, env, 'staff');
    const on = Boolean((await readJson(request)).on);
    const settings = await loadSettings(db);
    const today = localClock(Date.now(), settings.timezone_offset_minutes).date;
    await db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(match[1] === 'busy' ? 'busy_day' : 'closed_day', JSON.stringify(on ? today : ''))
      .run();
    return json({ ok: true, on });
  }
  if (path === '/api/staff/pause' && method === 'POST') {
    await requireRole(request, env, 'staff');
    const body = await readJson(request);
    await db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind('ordering_paused', JSON.stringify(Boolean(body.paused)))
      .run();
    return json({ ok: true, ordering_paused: Boolean(body.paused) });
  }
  // Marking something sold out is a kitchen job, so the staff PIN is enough.
  if ((match = path.match(/^\/api\/staff\/(items|options)\/(\d+)\/available$/)) && method === 'POST') {
    await requireRole(request, env, 'staff');
    const body = await readJson(request);
    await updateRow(db, match[1], Number(match[2]), { available: body.available ? 1 : 0 });
    return json({ ok: true });
  }
  if (path === '/api/staff/menu' && method === 'GET') {
    const role = await requireRole(request, env, 'staff');
    const [settings, menu] = await Promise.all([loadSettings(db), loadMenu(db, { withArchived: true })]);
    // Who receives the sales report is the manager's business only.
    return json({ role, menu, settings: role === 'admin' ? settings : { ...settings, report_email: undefined }, report_ready: reportReady(env) });
  }

  // Manager only
  if ((match = path.match(/^\/api\/admin\/items\/(\d+)$/)) && method === 'PATCH') {
    await requireRole(request, env, 'admin');
    const body = await readJson(request);
    const changes = {};
    if ('price_cents' in body) changes.price_cents = priceField(body.price_cents);
    if ('name' in body) {
      changes.name = cleanText(body.name, 60);
      if (!changes.name) throw new HttpError(400, 'The name cannot be empty.');
    }
    if ('description' in body) changes.description = cleanText(body.description, 200);
    if ('archived' in body) changes.archived = body.archived ? 1 : 0;
    if (body.image === '') changes.image = '';
    await updateRow(db, 'items', Number(match[1]), changes);
    return json({ ok: true });
  }
  if (path === '/api/admin/items' && method === 'POST') {
    await requireRole(request, env, 'admin');
    const body = await readJson(request);
    const name = cleanText(body.name, 60);
    if (!name) throw new HttpError(400, 'Give the dish a name.');
    const category = await db.prepare('SELECT id FROM categories WHERE id = ?').bind(Number(body.category_id)).first();
    if (!category) throw new HttpError(400, 'Choose a menu section for the dish.');
    const price = priceField(body.price_cents);
    if (price < 100) throw new HttpError(400, 'Enter a price of at least 1 guilder.');
    const last = await db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM items WHERE category_id = ?').bind(category.id).first();
    const result = await db
      .prepare('INSERT INTO items (category_id, name, description, price_cents, image, alcohol, available, sort) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
      .bind(category.id, name, cleanText(body.description, 200), price, '', body.alcohol ? 1 : 0, last.n)
      .run();
    return json({ ok: true, id: result.meta.last_row_id }, 201);
  }
  // A photo arrives already resized by the admin page, as two JPEGs in base64.
  if ((match = path.match(/^\/api\/admin\/items\/(\d+)\/photo$/)) && method === 'POST') {
    await requireRole(request, env, 'admin');
    const item = await db.prepare('SELECT id, image FROM items WHERE id = ?').bind(Number(match[1])).first();
    if (!item) throw new HttpError(404, 'Not found.');
    const body = await readJson(request);
    const decode = (value, maxBytes) => {
      let bytes;
      try {
        bytes = Uint8Array.from(atob(String(value || '')), (c) => c.charCodeAt(0));
      } catch {
        throw new HttpError(400, 'The photo could not be read. Please try another one.');
      }
      const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!isJpeg) throw new HttpError(400, 'The photo could not be read. Please try another one.');
      if (bytes.length > maxBytes) throw new HttpError(400, 'That photo is too large. Please try another one.');
      return bytes;
    };
    const small = decode(body.small, 200_000);
    const large = decode(body.large, 700_000);
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare('INSERT INTO photos (id, small, large, created_at) VALUES (?, ?, ?, ?)').bind(id, small, large, now()),
      db.prepare('UPDATE items SET image = ? WHERE id = ?').bind(`photo:${id}`, item.id),
      // The photo this one replaces is no longer shown anywhere.
      db.prepare('DELETE FROM photos WHERE id = ?').bind(item.image.startsWith('photo:') ? item.image.slice(6) : ''),
    ]);
    return json({ ok: true, photo: photoUrls(`photo:${id}`) });
  }
  if ((match = path.match(/^\/api\/admin\/options\/(\d+)$/)) && method === 'PATCH') {
    await requireRole(request, env, 'admin');
    const body = await readJson(request);
    const changes = {};
    if ('price_cents' in body) changes.price_cents = priceField(body.price_cents);
    await updateRow(db, 'options', Number(match[1]), changes);
    return json({ ok: true });
  }
  if (path === '/api/admin/sales' && method === 'GET') {
    await requireRole(request, env, 'admin');
    return json(await salesSummary(db, await loadSettings(db)));
  }
  // The day report: GET shows what tonight's email will say, POST sends today's figures now.
  if (path === '/api/admin/report' && (method === 'GET' || method === 'POST')) {
    await requireRole(request, env, 'admin');
    const settings = await loadSettings(db);
    const day = localClock(Date.now(), settings.timezone_offset_minutes).date;
    const report = await dayReport(db, day, settings.sales_since || 0);
    const origin = new URL(request.url).origin;
    if (method === 'POST') {
      try {
        return json({ ok: true, sent_to: await sendReport(env, settings, report, origin) });
      } catch (err) {
        throw new HttpError(400, err.message);
      }
    }
    const email = reportEmail(report, settings, origin);
    return json({ day, ready: reportReady(env), subject: email.subject, text: email.text });
  }
  // Start counting sales from now: used once after testing, before the real opening.
  if (path === '/api/admin/sales/reset' && method === 'POST') {
    await requireRole(request, env, 'admin');
    await db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind('sales_since', JSON.stringify(now()))
      .run();
    return json({ ok: true });
  }
  if (path === '/api/admin/settings' && method === 'PUT') {
    await requireRole(request, env, 'admin');
    const current = await loadSettings(db);
    const { _changed: changed } = validateSettings(await readJson(request), current);
    const entries = Object.entries(changed);
    if (entries.length === 0) throw new HttpError(400, 'Nothing to change.');
    await db.batch(
      entries.map(([key, value]) =>
        db
          .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .bind(key, JSON.stringify(value))
      )
    );
    return json({ ok: true, settings: await loadSettings(db) });
  }

  throw new HttpError(404, 'Not found.');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(closeAbandonedPayments(env));
    ctx.waitUntil(sendDueReport(env));
  },
};

export { priceLines, closeAbandonedPayments };
