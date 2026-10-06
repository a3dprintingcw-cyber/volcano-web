// Kitchen order board. Checks for new orders every few seconds.
import { api, clockTime, esc, money, store } from '/shared.js';
import { requireStaff, signOut } from '/staff-login.js';

const app = document.getElementById('app');
const COLUMNS = [
  { status: 'new', title: 'New', empty: 'No new orders.', next: 'preparing', action: 'Start cooking' },
  { status: 'preparing', title: 'Cooking', empty: 'Nothing on the grill.', next: 'ready', action: 'Mark ready', back: 'new' },
  { status: 'ready', title: 'Ready for pickup', empty: 'Nothing waiting for pickup.', next: 'done', action: 'Picked up', back: 'preparing' },
];
const state = { data: null, seen: null, fresh: new Set(), confirmCancel: null, offline: false, sound: store.get('volcano_sound', false), doneOpen: false };
let audio = null;

function beep() {
  if (!state.sound) return;
  try {
    audio = audio || new AudioContext();
    [0, 0.25, 0.5].forEach((delay) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + 0.18);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + 0.2);
    });
  } catch {
    /* sound is a nice-to-have */
  }
}

function pickupLabel(order, serverTime) {
  const minutes = Math.round((order.pickup_at - serverTime) / 60);
  const rel = minutes >= 0 ? `in ${minutes} min` : `${-minutes} min late`;
  return `${clockTime(order.pickup_at)}<small>${order.status === 'ready' ? 'pickup' : rel}</small>`;
}

function card(order, column, serverTime) {
  const late = order.status !== 'ready' && order.pickup_at < serverTime;
  const paid = order.payment_status === 'paid';
  const confirming = state.confirmCancel === order.id;
  return `
    <article class="card ${late ? 'is-late' : ''} ${state.fresh.has(order.id) ? 'is-fresh' : ''}" data-id="${order.id}">
      <div class="card-head">
        <span class="card-number">${order.number}</span>
        <span class="card-who">${esc(order.customer_name)}<br><a href="tel:${esc(order.phone)}">${esc(order.phone)}</a></span>
        <span class="card-time">${pickupLabel(order, serverTime)}</span>
      </div>
      <ul class="card-lines">
        ${order.items
          .map(
            (l) => `<li>${l.quantity} × ${esc(l.name)}
              ${l.options.length ? `<small>${esc(l.options.join(', '))}</small>` : ''}
              ${l.note ? `<small class="line-note">Note: ${esc(l.note)}</small>` : ''}</li>`
          )
          .join('')}
      </ul>
      ${order.notes ? `<p class="card-note">${esc(order.notes)}</p>` : ''}
      <div class="card-foot">
        <span class="card-total">${money(order.total_cents)}</span>
        ${
          order.payment_method === 'sentoo' && paid
            ? `<span class="tag is-paid">Paid online${state.data.payment_test ? ' (test)' : ''}</span>`
            : `<button class="tag ${paid ? 'is-paid' : ''}" type="button" data-paid="${paid ? '0' : '1'}" aria-pressed="${paid}">${paid ? 'Paid' : 'Not paid'}</button>`
        }
        <button class="btn btn-primary" type="button" data-status="${column.next}">${column.action}</button>
      </div>
      <div class="card-foot card-foot-links">
        <button class="link" type="button" data-print>Print</button>
        ${column.back ? `<button class="link" type="button" data-status="${column.back}">Move back</button>` : ''}
        <button class="link link-end" type="button" data-cancel>${confirming ? 'Tap again to cancel this order' : 'Cancel order'}</button>
      </div>
    </article>`;
}

function render() {
  const { data } = state;
  const finished = data.orders.filter((o) => ['done', 'cancelled'].includes(o.status)).reverse();
  const taken = finished.filter((o) => o.status === 'done');
  // The browser tab shows how many new orders are waiting.
  const fresh = data.orders.filter((o) => o.status === 'new').length;
  document.title = `${fresh ? `(${fresh}) ` : ''}Kitchen board | Volcano Street Food`;
  app.innerHTML = `
    <header class="staff-bar">
      <h1>Kitchen board</h1>
      <button class="pill ${data.ordering_paused ? 'is-warn' : ''}" type="button" data-pause="${data.ordering_paused ? '0' : '1'}" aria-pressed="${data.ordering_paused}">
        ${data.ordering_paused ? 'Online orders paused. Tap to resume' : 'Pause online orders'}
      </button>
      <span class="wait" role="group" aria-label="Wait time customers are told">
        <button class="pill" type="button" data-prep="-5" aria-label="5 minutes less" ${data.prep_minutes <= 5 ? 'disabled' : ''}>−</button>
        <span class="wait-value">Wait ${data.prep_minutes} min</span>
        <button class="pill" type="button" data-prep="5" aria-label="5 minutes more" ${data.prep_minutes >= 120 ? 'disabled' : ''}>+</button>
      </span>
      <button class="pill ${state.sound ? 'is-on' : ''}" type="button" data-sound aria-pressed="${state.sound}">Sound ${state.sound ? 'on' : 'off'}</button>
      <a href="/admin/">Menu and hours</a>
      <button class="pill" type="button" data-signout>Sign out</button>
    </header>
    ${state.offline ? '<p class="offline" role="alert">No connection. Orders on screen may be out of date. Retrying…</p>' : ''}
    <div class="board">
      ${COLUMNS.map((column) => {
        const orders = data.orders.filter((o) => o.status === column.status);
        return `<section class="col" aria-label="${column.title}">
          <h2>${column.title} <span>${orders.length}</span></h2>
          <div class="cards">${orders.length ? orders.map((o) => card(o, column, data.server_time)).join('') : `<p class="col-empty">${column.empty}</p>`}</div>
        </section>`;
      }).join('')}
    </div>
    <details class="done" ${state.doneOpen ? 'open' : ''}>
      <summary>Finished today: ${taken.length} picked up, ${money(taken.reduce((sum, o) => sum + o.total_cents, 0))}${finished.length - taken.length ? `, ${finished.length - taken.length} cancelled` : ''}</summary>
      ${
        finished.length
          ? `<table><thead><tr><th>Order</th><th>Name</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
            ${finished
              .map(
                (o) => `<tr data-id="${o.id}"><td>${o.number}</td><td>${esc(o.customer_name)}</td><td>${money(o.total_cents)}</td>
                <td>${
                  o.status === 'done'
                    ? `Picked up${o.payment_status === 'paid' ? (o.payment_method === 'sentoo' ? ', paid online' : ', paid') : ', not marked paid'}`
                    : o.payment_method === 'sentoo' && o.payment_status === 'paid'
                      ? 'Cancelled. Paid online: refund it in the Sentoo portal'
                      : o.cancelled_by === 'customer'
                        ? 'Cancelled by the customer'
                        : o.cancelled_by === 'payment'
                          ? 'Cancelled, online payment not completed'
                          : 'Cancelled'
                }</td>
                <td><button class="link" type="button" data-status="ready">Put back on the board</button></td></tr>`
              )
              .join('')}</tbody></table>`
          : '<p class="muted">Nothing finished yet.</p>'
      }
    </details>`;
}

// Prints one order as a kitchen ticket. Everything else on the page is hidden while printing.
function printTicket(card) {
  card.classList.add('is-printing');
  document.body.classList.add('printing');
  const done = () => {
    card.classList.remove('is-printing');
    document.body.classList.remove('printing');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

async function refresh() {
  try {
    const data = await api('/api/staff/orders');
    const ids = new Set(data.orders.filter((o) => o.status === 'new').map((o) => o.id));
    if (state.seen) {
      const arrived = [...ids].filter((id) => !state.seen.has(id));
      if (arrived.length) {
        arrived.forEach((id) => state.fresh.add(id));
        beep();
        setTimeout(() => arrived.forEach((id) => state.fresh.delete(id)), 4000);
      }
    }
    state.seen = new Set([...(state.seen || []), ...ids]);
    // While a ticket is printing the board must not redraw underneath it.
    if (document.body.classList.contains('printing')) return;
    state.data = data;
    state.offline = false;
  } catch (err) {
    if (err.status === 401) return location.reload();
    state.offline = true;
  }
  if (state.data) render();
}

async function act(run) {
  try {
    await run();
  } catch (err) {
    if (err.status === 401) return location.reload();
    state.offline = err.status === 0;
  }
  await refresh();
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target || !state.data) return;
  const holder = target.closest('[data-id]');
  const id = holder && holder.dataset.id;

  if ('signout' in target.dataset) return signOut();
  if ('sound' in target.dataset) {
    state.sound = !state.sound;
    store.set('volcano_sound', state.sound);
    if (state.sound) beep();
    return render();
  }
  if (target.dataset.prep) {
    const minutes = Math.min(120, Math.max(5, state.data.prep_minutes + Number(target.dataset.prep)));
    return act(() => api('/api/staff/prep', { method: 'POST', body: { minutes } }));
  }
  if ('pause' in target.dataset) {
    return act(() => api('/api/staff/pause', { method: 'POST', body: { paused: target.dataset.pause === '1' } }));
  }
  if (!id) return;
  if ('print' in target.dataset) return printTicket(holder);
  if ('cancel' in target.dataset) {
    if (state.confirmCancel !== id) {
      state.confirmCancel = id;
      setTimeout(() => {
        if (state.confirmCancel === id) {
          state.confirmCancel = null;
          render();
        }
      }, 4000);
      return render();
    }
    state.confirmCancel = null;
    return act(() => api(`/api/staff/orders/${id}`, { method: 'PATCH', body: { status: 'cancelled' } }));
  }
  if ('paid' in target.dataset) {
    return act(() => api(`/api/staff/orders/${id}`, { method: 'PATCH', body: { paid: target.dataset.paid === '1' } }));
  }
  if (target.dataset.status) {
    return act(() => api(`/api/staff/orders/${id}`, { method: 'PATCH', body: { status: target.dataset.status } }));
  }
});

app.addEventListener('toggle', (event) => {
  if (event.target.matches('.done')) state.doneOpen = event.target.open;
}, true);

await requireStaff(app, { title: 'Kitchen board' });
await refresh();
setInterval(refresh, 5000);
