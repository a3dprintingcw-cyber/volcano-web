// Sentoo payments (https://developer.sentoo.io).
//
// How it fits together:
//   1. We create a transaction with Sentoo and send the customer to Sentoo's payment page.
//   2. Sentoo sends the customer back to our order page, and separately calls our webhook.
//   3. Neither of those is trusted for the result. We always ask Sentoo's API for the
//      transaction status, and only that answer can mark an order as paid.
//
// Settings (Cloudflare variables and secrets):
//   SENTOO_MERCHANT_ID   the merchant id from the Sentoo portal
//   SENTOO_SECRET        the merchant secret from the Sentoo portal (store as a Secret)
//   SENTOO_ENV           "sandbox" (default) or "production"
//   SENTOO_API_URL       optional override, used only for local testing

const API = { sandbox: 'https://api.sandbox.sentoo.io', production: 'https://api.sentoo.io' };

// Sentoo allows 10 status lookups per transaction per hour. We stay under that
// and keep a few in reserve for webhooks, which matter most.
export const CHECK_LIMIT = { perHour: 9, pollBudget: 6, firstGapSeconds: 20, maxGapSeconds: 300 };
export const PAYMENT_MINUTES = 30; // how long a customer has to finish paying
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sentooEnabled = (env) => Boolean(env.SENTOO_MERCHANT_ID && env.SENTOO_SECRET);
export const sentooMode = (env) => (env.SENTOO_ENV === 'production' ? 'production' : 'sandbox');
const apiBase = (env) => env.SENTOO_API_URL || API[sentooMode(env)];

export class SentooError extends Error {
  constructor(message, status, reference) {
    super(message);
    this.status = status;
    this.reference = reference;
  }
}

async function call(env, path, init = {}) {
  let response;
  try {
    response = await fetch(apiBase(env) + path, {
      ...init,
      headers: { accept: 'application/json', 'X-SENTOO-SECRET': env.SENTOO_SECRET, ...(init.headers || {}) },
    });
  } catch (err) {
    throw new SentooError(`Sentoo could not be reached: ${err.message}`, 0);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* not JSON */
  }
  if (!response.ok || !body || !body.success) {
    const error = (body && body.error) || {};
    throw new SentooError(error.message || `Sentoo answered with HTTP ${response.status}`, response.status, error.reference);
  }
  return body.success;
}

// ISO 8601 with the Curaçao offset, as Sentoo asks for expiry dates.
function expiryStamp(unixSeconds, offsetMinutes) {
  const d = new Date((unixSeconds + offsetMinutes * 60) * 1000);
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  const sign = offsetMinutes < 0 ? '-' : '+';
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`
  );
}

// Creates the transaction. Returns { transactionId, url }.
export async function createPayment(env, { amountCents, description, returnUrl, customer, expiresAt, offsetMinutes }) {
  const form = new URLSearchParams({
    sentoo_merchant: env.SENTOO_MERCHANT_ID,
    sentoo_amount: String(amountCents),
    sentoo_currency: 'XCG',
    sentoo_description: description.slice(0, 50),
    sentoo_return_url: returnUrl,
    sentoo_customer: String(customer).slice(0, 50),
    sentoo_expires: expiryStamp(expiresAt, offsetMinutes),
  });
  const result = await call(env, '/v1/payment/new', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const transactionId = String(result.message || '');
  const url = result.data && result.data.url;
  if (!UUID.test(transactionId) || !url) throw new SentooError('Sentoo did not return a payment link', 502);
  return { transactionId, url };
}

// Asks Sentoo for the truth about a transaction.
// state: issued | pending | failed | cancelled | expired | success
// attempt / message: the most recent payment attempt, if there was one.
export async function fetchPayment(env, transactionId) {
  const result = await call(env, `/v1/payment/status/${encodeURIComponent(env.SENTOO_MERCHANT_ID)}/${encodeURIComponent(transactionId)}`);
  const responses = (result.data && Array.isArray(result.data.responses) ? result.data.responses : [])
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const last = responses[responses.length - 1] || null;
  return {
    state: String(result.message || ''),
    attempt: last ? String(last.status || '') : '',
    message: last && last.message ? String(last.message).slice(0, 200) : '',
  };
}

// Tells Sentoo to close a transaction we no longer want paid. Failures are not fatal.
export async function cancelPayment(env, transactionId) {
  try {
    await call(env, `/v1/payment/cancel/${encodeURIComponent(env.SENTOO_MERCHANT_ID)}/${encodeURIComponent(transactionId)}`);
    return true;
  } catch {
    return false;
  }
}

// The webhook body is form-encoded: transaction_id=<uuid>. Sentoo's own example
// wraps the value in quotes, so those are stripped.
export function webhookTransactionId(bodyText) {
  const params = new URLSearchParams(bodyText);
  const raw = (params.get('transaction_id') || '').replace(/^["']|["']$/g, '').trim();
  return UUID.test(raw) ? raw.toLowerCase() : null;
}

// Decides whether a status lookup is allowed right now, without going over Sentoo's limit.
// kind: 'webhook' (always worth a lookup while budget remains), 'return' (the customer
// has just come back from Sentoo, so a prompt answer matters) or 'poll' (spaced out).
export function lookupAllowed(order, nowSeconds, kind) {
  const windowOpen = nowSeconds - order.pay_window_start < 3600;
  const used = windowOpen ? order.pay_checks : 0;
  if (used >= CHECK_LIMIT.perHour) return false;
  if (kind === 'webhook') return true;
  if (kind === 'return') return used < CHECK_LIMIT.perHour - 2 && nowSeconds - order.pay_checked_at >= 5;
  if (used >= CHECK_LIMIT.pollBudget) return false;
  const gap = Math.min(CHECK_LIMIT.firstGapSeconds * 2 ** used, CHECK_LIMIT.maxGapSeconds);
  return used === 0 || nowSeconds - order.pay_checked_at >= gap;
}
