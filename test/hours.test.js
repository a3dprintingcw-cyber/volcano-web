// Opening hours and pickup slots, on the Curaçao clock (UTC-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { settings as base } from '../menu/menu.mjs';
import { availability, formatMinutes } from '../src/hours.js';

// A moment given as Curaçao local time.
const at = (iso) => Date.parse(`${iso}-04:00`);

test('formats times', () => {
  assert.equal(formatMinutes(18 * 60), '6 PM');
  assert.equal(formatMinutes(18 * 60 + 15), '6:15 PM');
  assert.equal(formatMinutes(1440), '12 AM');
});

test('Monday is closed and points to Tuesday', () => {
  const a = availability(base, at('2026-10-05T19:00:00'));
  assert.equal(a.can_order, false);
  assert.match(a.message, /Closed today/);
  assert.match(a.message, /tomorrow at 6 PM/);
});

test('Tuesday afternoon: pre-orders for tonight, no ASAP', () => {
  const a = availability(base, at('2026-10-06T14:00:00'));
  assert.equal(a.can_order, true);
  assert.equal(a.open_now, false);
  assert.equal(a.asap, null);
  assert.equal(a.slots[0].label, '6:30 PM'); // opening plus 20 minutes, rounded up
  assert.equal(a.slots.at(-1).label, '12 AM');
  assert.equal(a.slots[0].at, at('2026-10-06T18:30:00') / 1000);
});

test('Tuesday evening: open, ASAP in 20 minutes', () => {
  const now = at('2026-10-06T20:07:00');
  const a = availability(base, now);
  assert.equal(a.open_now, true);
  assert.equal(a.asap.at, now / 1000 + 20 * 60);
  assert.equal(a.slots[0].label, '8:30 PM');
  assert.match(a.message, /Open until 12 AM/);
});

test('orders stop 15 minutes before closing', () => {
  assert.equal(availability(base, at('2026-10-06T23:45:00')).can_order, true);
  const late = availability(base, at('2026-10-06T23:46:00'));
  assert.equal(late.can_order, false);
  assert.match(late.message, /stopped taking online orders/);
});

test('just after midnight Tuesday night is Wednesday, before opening', () => {
  const a = availability(base, at('2026-10-07T00:05:00'));
  assert.equal(a.service_day, '2026-10-07');
  assert.equal(a.open_now, false);
  assert.equal(a.can_order, true); // pre-order for Wednesday evening
});

test('Sunday night after close points to Tuesday', () => {
  const closedMonday = availability({ ...base }, at('2026-10-04T23:50:00'));
  assert.equal(closedMonday.can_order, false);
  assert.match(closedMonday.message, /Tuesday at 6 PM/);
});

test('paused ordering overrides everything', () => {
  const a = availability({ ...base, ordering_paused: true, paused_message: 'Back in 30 minutes.' }, at('2026-10-06T20:00:00'));
  assert.equal(a.can_order, false);
  assert.equal(a.message, 'Back in 30 minutes.');
});
