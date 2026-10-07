import test from 'node:test';
import assert from 'node:assert/strict';
import { dueDay, longDate, parseRecipients, reportEmail } from '../src/report.js';

const hours = { 0: { open: 1080, close: 1440 }, 1: null, 2: { open: 1080, close: 1440 }, 3: { open: 1080, close: 1380 }, 4: { open: 1080, close: 1440 }, 5: { open: 1080, close: 1440 }, 6: { open: 1080, close: 1440 } };
const settings = { timezone_offset_minutes: -240, hours, restaurant_name: 'Volcano Street Food' };
// Curaçao time is UTC-4, so local 2026-10-06 (a Tuesday) 23:50 is 03:50 UTC the next day.
const at = (iso) => Date.parse(iso);

test('recipients are cleaned, limited and checked', () => {
  assert.deepEqual(parseRecipients(' A@b.com, c@d.org ;a@b.com'), ['a@b.com', 'c@d.org']);
  assert.deepEqual(parseRecipients(''), []);
  assert.throws(() => parseRecipients('not-an-address'));
  assert.throws(() => parseRecipients('a@b.com,c@d.com,e@f.com,g@h.com'));
});

test('a day that closes at midnight is reported just after midnight', () => {
  assert.equal(dueDay(settings, at('2026-10-07T03:50:00Z')), null, 'Tuesday 23:50, still open, and Monday was a closed day');
  assert.equal(dueDay(settings, at('2026-10-07T04:05:00Z')), '2026-10-06', 'Wednesday 00:05: Tuesday is due');
});

test('a day that closes before midnight is reported the same evening', () => {
  assert.equal(dueDay(settings, at('2026-10-08T03:10:00Z')), '2026-10-07', 'Wednesday 23:10, closed at 23:00');
});

test('nothing is due for a closed day', () => {
  // Tuesday 12:00: yesterday was Monday, closed.
  assert.equal(dueDay({ ...settings }, at('2026-10-06T16:00:00Z')), null);
});

test('the email states the figures', () => {
  const report = { day: '2026-10-06', orders: 3, total_cents: 9600, online_cents: 3000, pickup_cents: 6600, average_cents: 3200, cancelled: 1, items: [{ name: 'Double Stacker', quantity: 2, total_cents: 6000 }] };
  const email = reportEmail(report, settings, 'https://volcanostreetfood.com');
  assert.equal(email.subject, 'Volcano Street Food: XCG 96 from 3 orders on Tuesday 6 October');
  assert.match(email.text, /Sales: XCG 96\n/);
  assert.match(email.text, /To pay at pickup: XCG 66/);
  assert.match(email.text, /2 x Double Stacker \(XCG 60\)/);
  assert.match(email.html, /Double Stacker/);
  assert.equal(longDate('2026-10-06'), 'Tuesday 6 October');
  assert.ok(!/[—–]/.test(email.text + email.subject), 'no dashes in the copy');
});

// A tiny stand-in for the database: just enough for sendDueReport.
function fakeEnv({ reportEmail: to = 'owner@example.com', failSend = false } = {}) {
  const secrets = new Map();
  const sent = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: Object.entries({ ...settings, report_email: to }).map(([key, value]) => ({ key, value: JSON.stringify(value) })) }),
    first: async () => (secrets.has('report_sent_day') ? { value: secrets.get('report_sent_day') } : null),
    run: async () => {
      if (sql.startsWith('INSERT INTO secrets')) secrets.set('report_sent_day', args[0]);
      else if (sql.startsWith('UPDATE secrets') && secrets.get('report_sent_day') === args[1]) secrets.set('report_sent_day', args[0]);
    },
    sql,
  });
  const DB = {
    prepare: (sql) => stmt(sql),
    batch: async () => [{ results: [{ orders: 2, total_cents: 5800, online_cents: 0 }] }, { results: [] }, { results: [{ n: 0 }] }],
  };
  const EMAIL = { send: async (message) => { if (failSend) throw new Error('down'); sent.push(message); } };
  return { env: { DB, EMAIL }, sent, secrets };
}

test('the report is sent once per day, and retried after a failure', async () => {
  const { sendDueReport } = await import('../src/report.js');
  const wednesdayJustAfterMidnight = at('2026-10-07T04:05:00Z');
  const a = fakeEnv();
  assert.equal(await sendDueReport(a.env, wednesdayJustAfterMidnight), '2026-10-06');
  assert.equal(a.sent.length, 1);
  assert.equal(a.sent[0].to, 'owner@example.com');
  assert.match(a.sent[0].subject, /XCG 58 from 2 orders on Tuesday 6 October/);
  assert.equal(await sendDueReport(a.env, wednesdayJustAfterMidnight + 600_000), null, 'not sent twice');
  assert.equal(a.sent.length, 1);

  const b = fakeEnv({ failSend: true });
  const origError = console.error; console.error = () => {};
  assert.equal(await sendDueReport(b.env, wednesdayJustAfterMidnight), null);
  console.error = origError;
  assert.notEqual(b.secrets.get('report_sent_day'), '2026-10-06', 'a failed send is tried again');

  const c = fakeEnv({ reportEmail: '' });
  assert.equal(await sendDueReport(c.env, wednesdayJustAfterMidnight), null, 'no address, no email');
});
