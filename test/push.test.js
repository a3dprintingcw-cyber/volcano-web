// Phone notifications: which addresses we are willing to call, the signed pass
// that push services check, and the wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationFor, validEndpoint, vapidHeader } from '../src/push.js';

const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('only real push services can be called', () => {
  const env = {};
  assert.equal(validEndpoint(env, 'https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(validEndpoint(env, 'https://web.push.apple.com/abc'), true);
  assert.equal(validEndpoint(env, 'https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(validEndpoint(env, 'https://wns2-par02p.notify.windows.com/w/?token=abc'), true);
  assert.equal(validEndpoint(env, 'https://example.com/steal'), false);
  assert.equal(validEndpoint(env, 'http://fcm.googleapis.com/fcm/send/abc'), false); // not https
  assert.equal(validEndpoint(env, 'https://fcm.googleapis.com.evil.test/x'), false);
  assert.equal(validEndpoint(env, 'http://127.0.0.1:8798/push/x'), false);
  assert.equal(validEndpoint(env, 'not a url'), false);
  assert.equal(validEndpoint(env, undefined), false);
  // The local test address works only when it is switched on for testing.
  assert.equal(validEndpoint({ PUSH_TEST_HOST: '127.0.0.1:8798' }, 'http://127.0.0.1:8798/push/x'), true);
});

test('the signed pass is a valid ES256 token for the push service', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const keys = {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  const header = await vapidHeader(keys, 'https://fcm.googleapis.com/fcm/send/abc', 'https://volcanostreetfood.com');
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(match, header);
  const [, head, claims, signature, key] = match;
  assert.equal(key, keys.publicKey);
  assert.equal(fromB64url(key).length, 65); // uncompressed P-256 public key
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromB64url(head))), { typ: 'JWT', alg: 'ES256' });
  const body = JSON.parse(new TextDecoder().decode(fromB64url(claims)));
  assert.equal(body.aud, 'https://fcm.googleapis.com');
  assert.equal(body.sub, 'https://volcanostreetfood.com');
  const hours = (body.exp - Date.now() / 1000) / 3600;
  assert.ok(hours > 11 && hours <= 12, `expires in ${hours} hours`); // push services refuse more than 24
  assert.equal(fromB64url(signature).length, 64);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64url(signature), new TextEncoder().encode(`${head}.${claims}`));
  assert.equal(valid, true);
});

test('notification wording', () => {
  assert.deepEqual(notificationFor({ status: 'ready', number: 102 }, '+599 9 565 2266'), {
    title: 'Your order is ready',
    body: 'Order 102 is ready for pickup at Volcano Street Food.',
  });
  assert.match(notificationFor({ status: 'cancelled', number: 102 }, '+599 9 565 2266').body, /\+599 9 565 2266/);
  assert.equal(notificationFor({ status: 'new', number: 102 }, 'x'), null);
});
