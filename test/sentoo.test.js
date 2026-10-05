// The Sentoo client: request format, reading answers, the webhook body and the lookup budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_LIMIT, createPayment, fetchPayment, lookupAllowed, sentooEnabled, sentooMode, webhookTransactionId } from '../src/sentoo.js';

const env = { SENTOO_MERCHANT_ID: 'merchant-1', SENTOO_SECRET: 'secret-1' };
const ID = 'd1582fa1-faa8-4272-bf3b-25e7130b3e1e';

function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return run(calls).finally(() => {
    globalThis.fetch = original;
  });
}

test('online payment is off until both Sentoo details are set, and defaults to the sandbox', () => {
  assert.equal(sentooEnabled({}), false);
  assert.equal(sentooEnabled({ SENTOO_MERCHANT_ID: 'x' }), false);
  assert.equal(sentooEnabled(env), true);
  assert.equal(sentooMode(env), 'sandbox');
  assert.equal(sentooMode({ ...env, SENTOO_ENV: 'production' }), 'production');
  assert.equal(sentooMode({ ...env, SENTOO_ENV: 'anything else' }), 'sandbox');
});

test('creating a payment sends what Sentoo asks for', () =>
  withFetch(
    () => ({ body: { success: { code: 200, message: ID, data: { url: `https://pay.sandbox.sentoo.io/p/${ID}` } } } }),
    async (calls) => {
      const result = await createPayment(env, {
        amountCents: 14800,
        description: 'Volcano Street Food order 101',
        returnUrl: 'https://example.test/order?id=abc&attempt=',
        customer: 'Order 101',
        expiresAt: Date.parse('2026-10-06T22:30:00Z') / 1000,
        offsetMinutes: -240,
      });
      assert.deepEqual(result, { transactionId: ID, url: `https://pay.sandbox.sentoo.io/p/${ID}` });
      const { url, init } = calls[0];
      assert.equal(url, 'https://api.sandbox.sentoo.io/v1/payment/new');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['X-SENTOO-SECRET'], 'secret-1');
      assert.equal(init.headers.accept, 'application/json');
      const form = new URLSearchParams(init.body);
      assert.equal(form.get('sentoo_merchant'), 'merchant-1');
      assert.equal(form.get('sentoo_amount'), '14800');
      assert.equal(form.get('sentoo_currency'), 'XCG');
      assert.equal(form.get('sentoo_return_url'), 'https://example.test/order?id=abc&attempt=');
      assert.equal(form.get('sentoo_expires'), '2026-10-06T18:30:00-04:00'); // Curaçao time with its offset
      assert.ok(form.get('sentoo_description').length <= 50);
    }
  ));

test('production mode talks to the production API', () =>
  withFetch(
    () => ({ body: { success: { code: 200, message: 'issued' } } }),
    async (calls) => {
      await fetchPayment({ ...env, SENTOO_ENV: 'production' }, ID);
      assert.equal(calls[0].url, `https://api.sentoo.io/v1/payment/status/merchant-1/${ID}`);
    }
  ));

test('a Sentoo error becomes an error, not a payment', async () => {
  await withFetch(
    () => ({ status: 401, body: { error: { code: 401, message: 'Unauthorized', reference: 'abc12345' } } }),
    async () => {
      await assert.rejects(() => fetchPayment(env, ID), (err) => err.status === 401 && err.reference === 'abc12345');
    }
  );
  await withFetch(
    () => ({ body: { success: { code: 200, message: 'not-a-uuid' } } }),
    async () => {
      await assert.rejects(() => createPayment(env, { amountCents: 500, description: 'x', returnUrl: 'https://x.test/', customer: 'x', expiresAt: 0, offsetMinutes: -240 }));
    }
  );
});

test('the status answer is read as transaction state plus the latest attempt', () =>
  withFetch(
    () => ({
      body: {
        success: {
          code: 200,
          message: 'success',
          data: {
            responses: [
              { processor: 'Banco di Caribe', status: 'success', date: '2024-10-16T18:45:41+00:00' },
              { processor: "Maduro & Curiel's Bank", status: 'rejected', date: '2024-10-16T18:45:17+00:00', message: 'Insufficient funds' },
            ],
          },
        },
      },
    }),
    async () => {
      assert.deepEqual(await fetchPayment(env, ID), { state: 'success', attempt: 'success', message: '' });
    }
  ));

test('a rejected attempt leaves the transaction issued and carries the bank message', () =>
  withFetch(
    () => ({
      body: { success: { code: 200, message: 'issued', data: { responses: [{ status: 'rejected', date: '2023-03-15T15:03:14+00:00', message: 'Insufficient funds' }] } } },
    }),
    async () => {
      assert.deepEqual(await fetchPayment(env, ID), { state: 'issued', attempt: 'rejected', message: 'Insufficient funds' });
    }
  ));

test('the webhook body gives a transaction id, with or without quotes', () => {
  assert.equal(webhookTransactionId(`transaction_id=${ID}`), ID);
  assert.equal(webhookTransactionId(`transaction_id=%22${ID}%22`), ID); // as in Sentoo's own example
  assert.equal(webhookTransactionId(`transaction_id=${ID.toUpperCase()}`), ID);
  assert.equal(webhookTransactionId(`refund_id=${ID}`), null);
  assert.equal(webhookTransactionId('transaction_id=1 OR 1=1'), null);
  assert.equal(webhookTransactionId(''), null);
});

test('status lookups stay under 10 per hour per transaction', () => {
  const t0 = 1_800_000_000;
  let order = { pay_checks: 0, pay_window_start: 0, pay_checked_at: 0 };
  let lookups = 0;
  // A browser that asks every second for an hour, plus a webhook every minute.
  for (let s = 0; s < 3600; s += 1) {
    const kinds = s % 60 === 0 ? ['webhook', 'poll'] : ['poll'];
    for (const kind of kinds) {
      if (!lookupAllowed(order, t0 + s, kind)) continue;
      const open = t0 + s - order.pay_window_start < 3600;
      order = { pay_checks: open ? order.pay_checks + 1 : 1, pay_window_start: open ? order.pay_window_start : t0 + s, pay_checked_at: t0 + s };
      lookups += 1;
    }
  }
  assert.ok(lookups <= CHECK_LIMIT.perHour, `made ${lookups} lookups`);
  assert.ok(lookups < 10);
});

test('polling leaves room for webhooks, and the budget returns after an hour', () => {
  const t0 = 1_800_000_000;
  const spent = { pay_checks: CHECK_LIMIT.pollBudget, pay_window_start: t0, pay_checked_at: t0 };
  assert.equal(lookupAllowed(spent, t0 + 1000, 'poll'), false);
  assert.equal(lookupAllowed(spent, t0 + 1000, 'webhook'), true);
  assert.equal(lookupAllowed({ ...spent, pay_checks: CHECK_LIMIT.perHour }, t0 + 1000, 'webhook'), false);
  assert.equal(lookupAllowed({ ...spent, pay_checks: CHECK_LIMIT.perHour }, t0 + 3601, 'webhook'), true);
  // Coming back from Sentoo gets a prompt lookup, but not twice within seconds.
  const fresh = { pay_checks: 1, pay_window_start: t0, pay_checked_at: t0 };
  assert.equal(lookupAllowed(fresh, t0 + 2, 'return'), false);
  assert.equal(lookupAllowed(fresh, t0 + 6, 'return'), true);
  assert.equal(lookupAllowed(fresh, t0 + 6, 'poll'), false);
});
