// Volcano Street Food backend.
// One Cloudflare Worker serves the website files (from /public) and the API (/api/*).
// Data lives in a D1 database bound as DB.

import { availability, describeHours, localClock } from './hours.js';

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
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
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
  return settings;
}

// ---------- menu ----------

async function loadMenu(db) {
  const [cats, items, groups, options] = await db.batch([
    db.prepare('SELECT * FROM categories ORDER BY sort'),
    db.prepare('SELECT * FROM items ORDER BY category_id, sort'),
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
      alcohol: !!i.alcohol,
      available: !!i.available,
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

function publicInfo(settings) {
  return {
    restaurant_name: settings.restaurant_name,
    phone: settings.phone,
    hours: describeHours(settings.hours),
    prep_minutes: settings.prep_minutes,
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
            `INSERT INTO orders (id, number, service_day, status, customer_name, phone, notes, pickup_type, pickup_at, total_cents, created_at, updated_at)
             VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(id, next.n, avail.service_day, name, phone, notes, pickupType, pickupAt, total, created, created),
        ...lines.map((l) =>
          db
            .prepare(
              'INSERT INTO order_items (order_id, item_id, name, options, note, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .bind(id, l.item_id, l.name, JSON.stringify(l.options), l.note, l.quantity, l.unit_price_cents)
        ),
      ]);
      await recordEvent(db, 'order', who);
      return json({ id, number: next.n }, 201);
    } catch (err) {
      if (!String(err && err.message).includes('UNIQUE')) throw err;
    }
  }
  throw new HttpError(503, 'We could not place your order just now. Please try again.');
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
  payment_status: o.payment_status,
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

async function handleApi(request, env, url) {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;
  let match;

  // Public
  if (path === '/api/menu' && method === 'GET') {
    const [settings, menu] = await Promise.all([loadSettings(db), loadMenu(db)]);
    return json({ info: publicInfo(settings), availability: availability(settings, Date.now()), menu });
  }
  if (path === '/api/orders' && method === 'POST') return createOrder(request, env);
  if ((match = path.match(/^\/api\/orders\/([0-9a-f-]{36})$/)) && method === 'GET') {
    const [order] = await loadOrders(db, 'id = ?', [match[1]]);
    if (!order) throw new HttpError(404, 'We could not find that order.');
    const settings = await loadSettings(db);
    return json({ order: customerView(order), info: publicInfo(settings) });
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
    const orders = await loadOrders(db, "service_day = ? OR status IN ('new','preparing','ready')", [clock.date]);
    return json({
      orders,
      service_day: clock.date,
      ordering_paused: Boolean(settings.ordering_paused),
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
    }
    if ('paid' in body) changes.payment_status = body.paid ? 'paid' : 'unpaid';
    await updateRow(db, 'orders', match[1], changes);
    return json({ ok: true });
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
    const [settings, menu] = await Promise.all([loadSettings(db), loadMenu(db)]);
    return json({ role, menu, settings });
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
    await updateRow(db, 'items', Number(match[1]), changes);
    return json({ ok: true });
  }
  if ((match = path.match(/^\/api\/admin\/options\/(\d+)$/)) && method === 'PATCH') {
    await requireRole(request, env, 'admin');
    const body = await readJson(request);
    const changes = {};
    if ('price_cents' in body) changes.price_cents = priceField(body.price_cents);
    await updateRow(db, 'options', Number(match[1]), changes);
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
    }
  },
};

export { priceLines };
