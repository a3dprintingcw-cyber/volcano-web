// End of day report for the owners, sent by email after closing.
//
// How it fits together:
//   - The manager fills in who receives it on the admin page (setting "report_email").
//   - The job that runs every 10 minutes calls sendDueReport. Once the day's service has
//     ended it sends that day's report, one time.
//   - Sending uses Cloudflare Email Service through the EMAIL binding. Until that binding
//     exists (it needs the domain to be active on Cloudflare) nothing is sent, and the
//     admin page says so.
import { formatMinutes, localClock } from './hours.js';

const COUNTED = "status IN ('new','preparing','ready','done')";
const money = (cents) => `XCG ${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const reportReady = (env) => Boolean(env.EMAIL && typeof env.EMAIL.send === 'function');

// "a@b.com, c@d.com" becomes a clean list of at most three addresses. Throws on a bad one.
export function parseRecipients(value) {
  const list = String(value ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length > 3) throw new Error('Enter at most three email addresses.');
  for (const address of list) {
    if (address.length > 100 || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(address)) throw new Error(`"${address}" is not an email address.`);
  }
  return [...new Set(list)];
}

const previousDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const longDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// The service day whose report is due now: today once tonight's service has ended,
// otherwise yesterday. Null when that day was a closed day.
export function dueDay(settings, nowMs) {
  const clock = localClock(nowMs, settings.timezone_offset_minutes);
  const today = settings.hours[clock.weekday];
  if (today && clock.minutes >= today.close) return clock.date;
  const yesterday = previousDay(clock.date);
  return settings.hours[weekdayOf(yesterday)] ? yesterday : null;
}

// The figures for one service day. Cancelled orders and unpaid online orders are not counted.
export async function dayReport(db, day, since = 0) {
  const [totals, items, cancelled] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS total_cents,
                COALESCE(SUM(CASE WHEN payment_method = 'sentoo' AND payment_status = 'paid' THEN total_cents ELSE 0 END), 0) AS online_cents
         FROM orders WHERE ${COUNTED} AND service_day = ? AND created_at >= ?`
      )
      .bind(day, since),
    db
      .prepare(
        `SELECT oi.name AS name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price_cents) AS total_cents
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.${COUNTED} AND o.service_day = ? AND o.created_at >= ? GROUP BY oi.name ORDER BY quantity DESC, total_cents DESC LIMIT 8`
      )
      .bind(day, since),
    db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled' AND cancelled_by != 'payment' AND service_day = ? AND created_at >= ?").bind(day, since),
  ]);
  const t = totals.results[0];
  return {
    day,
    orders: t.orders,
    total_cents: t.total_cents,
    online_cents: t.online_cents,
    pickup_cents: t.total_cents - t.online_cents,
    average_cents: t.orders ? Math.round(t.total_cents / t.orders) : 0,
    cancelled: cancelled.results[0].n,
    items: items.results,
  };
}

// The email itself, as plain text and as a simple page.
export function reportEmail(report, settings, siteUrl) {
  const name = settings.restaurant_name || 'Volcano Street Food';
  const date = longDate(report.day);
  const hours = settings.hours[weekdayOf(report.day)];
  const subject = `${name}: ${money(report.total_cents)} from ${report.orders} ${report.orders === 1 ? 'order' : 'orders'} on ${date}`;
  const rows = [
    ['Sales', money(report.total_cents)],
    ['Orders', String(report.orders)],
    ['Average order', money(report.average_cents)],
    ['Paid online', money(report.online_cents)],
    ['To pay at pickup', money(report.pickup_cents)],
    ['Cancelled orders', String(report.cancelled)],
  ];
  const intro = report.orders
    ? `Online orders for ${date}${hours ? `, ${formatMinutes(hours.open)} to ${formatMinutes(hours.close)}` : ''}.`
    : `There were no online orders on ${date}.`;
  const footer = `Cancelled orders and unpaid online orders are not counted. More figures: ${siteUrl}/admin/`;

  const text = [
    intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(report.items.length ? ['', 'Best sellers', ...report.items.map((i) => `${i.quantity} x ${i.name} (${money(i.total_cents)})`)] : []),
    '',
    footer,
  ].join('\n');

  const cell = 'padding:8px 0;border-bottom:1px solid #ead9bb;';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1c1612;">
<h1 style="font-size:20px;color:#a43b25;margin:0 0 6px;">${esc(name)}</h1>
<p style="margin:0 0 16px;">${esc(intro)}</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;">
${rows.map(([label, value], i) => `<tr><td style="${cell}">${esc(label)}</td><td style="${cell}text-align:right;font-weight:bold;${i === 0 ? 'font-size:18px;' : ''}">${esc(value)}</td></tr>`).join('\n')}
</table>
${
  report.items.length
    ? `<h2 style="font-size:16px;margin:22px 0 4px;">Best sellers</h2>
<table style="width:100%;border-collapse:collapse;font-size:15px;">
${report.items.map((i) => `<tr><td style="${cell}">${i.quantity} &times; ${esc(i.name)}</td><td style="${cell}text-align:right;">${esc(money(i.total_cents))}</td></tr>`).join('\n')}
</table>`
    : ''
}
<p style="font-size:13px;color:#6b5a4a;margin-top:20px;">Cancelled orders and unpaid online orders are not counted. <a href="${esc(siteUrl)}/admin/" style="color:#a43b25;">More figures on the manager page</a>.</p>
</div>`;
  return { subject, text, html };
}

export async function sendReport(env, settings, report, siteUrl) {
  const to = parseRecipients(settings.report_email);
  if (to.length === 0) throw new Error('No email address is filled in for the report.');
  if (!reportReady(env)) throw new Error('Email sending is not connected yet.');
  const email = reportEmail(report, settings, siteUrl);
  const from = env.REPORT_FROM || 'reports@volcanostreetfood.com';
  for (const address of to) {
    await env.EMAIL.send({ to: address, from, subject: email.subject, html: email.html, text: email.text });
  }
  return to;
}

// Called every 10 minutes. Sends the report for the service day that has just ended, once.
export async function sendDueReport(env, nowMs = Date.now()) {
  const db = env.DB;
  const { results } = await db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of results) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  if (!settings.report_email || !reportReady(env)) return null;
  const day = dueDay(settings, nowMs);
  if (!day) return null;
  // Claim the day first, so two runs at the same moment cannot both send it.
  const last = await db.prepare("SELECT value FROM secrets WHERE key = 'report_sent_day'").first();
  if (last && last.value >= day) return null;
  await db.prepare("INSERT INTO secrets (key, value) VALUES ('report_sent_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(day).run();
  try {
    await sendReport(env, settings, await dayReport(db, day, settings.sales_since || 0), env.SITE_URL || 'https://volcanostreetfood.com');
    return day;
  } catch (err) {
    console.error('Day report could not be sent', day, err && err.message);
    // Give the day back so the next run tries again.
    await db.prepare("UPDATE secrets SET value = ? WHERE key = 'report_sent_day' AND value = ?").bind(last ? last.value : '', day).run();
    return null;
  }
}
