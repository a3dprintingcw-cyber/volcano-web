import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticketText } from '../src/cloudprnt.js';

const order = {
  number: 107, customer_name: 'Jürgen Ñoño', phone: '+5999 123 4567', pickup_type: 'asap',
  pickup_at: 1793750400, created_at: 1793749200, total_cents: 6400, payment_method: 'cash', payment_status: 'unpaid',
  notes: 'Extra napkins please',
  items: [
    { name: 'Double Stacker', quantity: 2, unit_price_cents: 3000, options: ['No onion', 'Cajun fries'], note: 'well done' },
    { name: 'Cola', quantity: 1, unit_price_cents: 400, options: [], note: '' },
  ],
};

test('kitchen ticket fits 48 columns and is plain ASCII', () => {
  const text = ticketText(order, -240);
  for (const line of text.split('\n')) {
    assert.ok(line.length <= 48, `too long: ${line}`);
    assert.ok(/^[\x20-\x7e]*$/.test(line), `not ascii: ${line}`);
  }
  assert.match(text, /ORDER #107/);
  assert.match(text, /Jurgen Nono/);
  assert.match(text, /2 x DOUBLE STACKER +XCG 60\.00/);
  assert.match(text, /\+ No onion/);
  assert.match(text, /NOTE: well done/);
  assert.match(text, /TOTAL +XCG 64\.00/);
  assert.match(text, /PAY CASH AT PICKUP/);
  assert.match(text, /Kitchen note: Extra napkins please/);
});
