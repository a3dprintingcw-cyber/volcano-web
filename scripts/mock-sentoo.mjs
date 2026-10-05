// A stand-in for Sentoo's API, for local development and tests only.
// It follows the request and response shapes in Sentoo's merchant documentation.
//
//   node scripts/mock-sentoo.mjs          (listens on http://127.0.0.1:8799)
//
// Point the site at it in .dev.vars:
//   SENTOO_API_URL=http://127.0.0.1:8799
//   SENTOO_MERCHANT_ID=test-merchant
//   SENTOO_SECRET=test-secret
//
// Extra endpoints to play the part of the bank:
//   POST /_attempt/<transaction_id>   JSON { "status": "success|pending|rejected|cancelled", "message": "..." }
//   POST /_state/<transaction_id>     JSON { "state": "expired|cancelled|failed" }
//   GET  /_calls/<transaction_id>     how many status lookups were made
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_SENTOO_PORT || 8799);
const SECRET = process.env.MOCK_SENTOO_SECRET || 'test-secret';
const transactions = new Map();

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const fail = (res, code, message) => send(res, code, { error: { code, message, reference: 'mock0000' } });
const read = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const body = await read(req);

  if (parts[0] === '_attempt' || parts[0] === '_state' || parts[0] === '_calls') {
    const t = transactions.get(parts[1]);
    if (!t) return fail(res, 404, 'Transaction not found');
    if (parts[0] === '_calls') return send(res, 200, { lookups: t.lookups });
    const input = JSON.parse(body || '{}');
    if (parts[0] === '_state') t.state = input.state;
    else {
      t.responses.push({
        processor: 'Test Bank CW (Mockup)',
        reference: String(Math.floor(Math.random() * 1e6)),
        status: input.status,
        date: new Date(Date.now() + t.responses.length).toISOString(),
        ...(input.message ? { message: input.message } : {}),
      });
      // As documented: a rejected or cancelled attempt leaves the transaction "issued".
      t.state = input.status === 'success' ? 'success' : input.status === 'pending' ? 'pending' : 'issued';
    }
    return send(res, 200, { ok: true, state: t.state });
  }

  // The payment page is what the customer's browser opens, so it needs no secret.
  if (req.method === 'GET' && parts[0] === 'p') {
    const t = transactions.get(parts[1]);
    res.writeHead(t ? 200 : 404, { 'content-type': 'text/html' });
    return res.end(t ? `<h1>Mock Sentoo payment page</h1><pre>${JSON.stringify(t.form, null, 2)}</pre>` : 'Not found');
  }

  if (req.headers['x-sentoo-secret'] !== SECRET) return fail(res, 401, 'Unauthorized');

  if (req.method === 'POST' && url.pathname === '/v1/payment/new') {
    const form = new URLSearchParams(body);
    for (const field of ['sentoo_merchant', 'sentoo_amount', 'sentoo_description', 'sentoo_currency', 'sentoo_return_url']) {
      if (!form.get(field)) return fail(res, 400, 'The request was unacceptable, often due to missing a required parameter');
    }
    if (!(Number(form.get('sentoo_amount')) >= 100)) return fail(res, 400, 'Amount must be at least 100 cents');
    if (form.get('sentoo_description').length > 50) return fail(res, 400, 'Description exceeded max length (50)');
    const id = randomUUID();
    transactions.set(id, { state: 'issued', responses: [], lookups: 0, form: Object.fromEntries(form) });
    return send(res, 200, {
      success: { code: 200, message: id, data: { url: `http://127.0.0.1:${PORT}/p/${id}`, qr_code: `http://127.0.0.1:${PORT}/qr/${id}` } },
    });
  }

  if (req.method === 'GET' && parts[0] === 'v1' && parts[1] === 'payment' && parts[2] === 'status') {
    const t = transactions.get(parts[4]);
    if (!t) return fail(res, 404, 'Transaction not found');
    t.lookups += 1;
    // Sentoo allows 10 lookups per transaction per hour.
    if (t.lookups > 10) return fail(res, 429, 'Too many requests');
    const success = { code: 200, message: t.state };
    if (t.responses.length) success.data = { responses: t.responses };
    return send(res, 200, { success });
  }

  return fail(res, 404, 'No route found');
}).listen(PORT, '127.0.0.1', () => console.log(`Mock Sentoo listening on http://127.0.0.1:${PORT}`));
