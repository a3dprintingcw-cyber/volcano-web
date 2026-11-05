import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, classifySource, daysBetween, deviceOf, isRobot } from '../src/stats.js';

test('a ?src= tag on the link wins over the referrer', () => {
  assert.equal(classifySource('https://www.google.com/', 'insta'), 'Instagram');
  assert.equal(classifySource('', 'qr-table'), 'QR code');
  assert.equal(classifySource('', 'fb'), 'Facebook');
});

test('the referring site is named', () => {
  assert.equal(classifySource('https://l.instagram.com/?u=x'), 'Instagram');
  assert.equal(classifySource('https://m.facebook.com/'), 'Facebook');
  assert.equal(classifySource('https://www.google.com/'), 'Google');
  assert.equal(classifySource('android-app://com.volcanostreetfood.app/'), 'App');
  assert.equal(classifySource(''), 'Direct');
  assert.equal(classifySource('https://volcanostreetfood.com/order?id=1'), 'Direct');
  assert.equal(classifySource('https://curacao.com/food'), 'curacao.com');
});

test('devices and robots', () => {
  assert.equal(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'Phone');
  assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari'), 'Phone');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'Tablet');
  assert.equal(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Computer');
  assert.equal(isRobot('Googlebot/2.1'), true);
  assert.equal(isRobot(''), true);
  assert.equal(isRobot('Mozilla/5.0 (iPhone)'), false);
});

test('date helpers', () => {
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(daysBetween('2026-11-01', '2026-11-07'), 7);
});
