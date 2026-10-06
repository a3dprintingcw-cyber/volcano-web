// Phone notifications (Web Push), so a customer hears that their food is ready
// even when the website is closed.
//
// How it works:
//   1. On the order page the customer taps "Notify me". Their browser gives us an
//      address (the "endpoint") at Google, Apple, Mozilla or Microsoft.
//   2. When the kitchen marks the order ready, we call that address. The call is
//      signed with our key so the push service knows it is really us.
//   3. The phone wakes our small service worker (public/sw.js), which asks this
//      server what to say and shows the notification.
// The call in step 2 carries no order details, so nothing about the order passes
// through the push service.

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (value) => new TextEncoder().encode(value);

// Only real push services may be called, so this can never be pointed at another server.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/, /\.mozaws\.net$/];

export function validEndpoint(env, endpoint) {
  let url;
  try {
    url = new URL(String(endpoint));
  } catch {
    return false;
  }
  if (env.PUSH_TEST_HOST && url.host === env.PUSH_TEST_HOST) return true; // local testing only
  return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname)) && String(endpoint).length < 1000;
}

// Our signing key pair. Made once, by the server itself, and kept in the database.
export async function vapidKeys(db) {
  const read = async () => {
    const row = await db.prepare("SELECT value FROM secrets WHERE key = 'vapid'").first();
    return row ? JSON.parse(row.value) : null;
  };
  let keys = await read();
  if (keys) return keys;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const fresh = {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  // If two requests get here together, the first one wins and both use its key.
  await db.prepare("INSERT OR IGNORE INTO secrets (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(fresh)).run();
  return read();
}

// The signed pass a push service asks for ("VAPID"): who is calling, and until when.
export async function vapidHeader(keys, endpoint, contact) {
  const audience = new URL(endpoint).origin;
  const header = b64url(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(text(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact })));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

// Tells every phone that asked about this order to wake up. Dead addresses are forgotten.
export async function notifyOrder(env, orderId) {
  const db = env.DB;
  const { results } = await db.prepare('SELECT id, endpoint FROM push_subscriptions WHERE order_id = ?').bind(orderId).all();
  if (results.length === 0) return 0;
  const keys = await vapidKeys(db);
  let sent = 0;
  for (const sub of results) {
    if (!validEndpoint(env, sub.endpoint)) continue;
    try {
      const response = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          TTL: '900', // keep trying for 15 minutes if the phone is offline
          Urgency: 'high',
          Authorization: await vapidHeader(keys, sub.endpoint, 'https://volcanostreetfood.com'),
          'Content-Length': '0',
        },
      });
      if (response.status === 404 || response.status === 410) {
        await db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
      } else if (response.ok) {
        sent += 1;
      } else {
        console.error('Push service answered', response.status, new URL(sub.endpoint).hostname);
      }
    } catch (err) {
      console.error('Push could not be sent', err.message);
    }
  }
  return sent;
}

// What the notification should say for an order, by its status.
export function notificationFor(order, phone) {
  if (order.status === 'ready') {
    return { title: 'Your order is ready', body: `Order ${order.number} is ready for pickup at Volcano Street Food.` };
  }
  if (order.status === 'cancelled') {
    return { title: `Order ${order.number} was cancelled`, body: `Please call us on ${phone} if you have questions.` };
  }
  if (order.status === 'preparing') {
    return { title: 'We are making your order', body: `Order ${order.number} is on its way to being ready.` };
  }
  return null;
}
