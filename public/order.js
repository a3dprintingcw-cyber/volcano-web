// Order confirmation and live status for the customer.
import { api, clockTime, esc, money } from '/shared.js';

const params = new URLSearchParams(location.search);
const id = params.get('id') || '';
// Sentoo adds the payment attempt status when it sends a customer back here.
// The customer can edit it, so it is never used to decide whether an order is paid.
// It may only make this page more careful (hide the "pay again" button while we check).
const returnedAttempt = params.get('attempt') || '';
const loadedAt = Math.floor(Date.now() / 1000);
let firstCheck = true;
let lastStatus = null;
let confirmingCancel = false;
let cancelError = '';
let latest = null;

// Tell the customer the food is ready, even if the phone is in their pocket.
function announceReady(order) {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    /* not supported */
  }
  try {
    const audio = new AudioContext();
    [0, 0.3, 0.6].forEach((delay, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = [660, 880, 1100][i];
      gain.gain.setValueAtTime(0.25, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + 0.3);
    });
  } catch {
    /* sound may be blocked until the page is tapped */
  }
  document.title = `Ready! Order ${order.number} | Volcano Street Food`;
}
const ticket = document.getElementById('ticket');
const STEPS = ['new', 'preparing', 'ready'];
const STEP_LABELS = { new: 'Received', preparing: 'Cooking', ready: 'Ready' };
let timer = null;

// What to tell a customer whose online payment is not confirmed yet.
function paymentText(order) {
  const checkedSinceReturn = order.pay_checked_at >= loadedAt - 5;
  const attempt = order.pay_attempt;
  const maybeInProgress =
    order.pay_state === 'pending' ||
    attempt === 'pending' ||
    attempt === 'success' ||
    (!checkedSinceReturn && ['pending', 'success'].includes(returnedAttempt));
  if (maybeInProgress) {
    return {
      title: 'Confirming your payment',
      detail: 'Your bank is still processing it. This usually takes less than a minute. Keep this page open and it will update by itself.',
      retry: false,
    };
  }
  if (order.pay_state === 'failed') {
    return {
      title: 'Payment problem',
      detail: 'A technical problem stopped the payment and Sentoo has been notified. Please call us so we can sort out your order.',
      retry: false,
    };
  }
  if (attempt === 'rejected') {
    return {
      title: 'Payment was rejected',
      detail: `${order.pay_message ? `Your bank said: ${order.pay_message}. ` : ''}Nothing was charged. You can try again, with another bank or card if you like.`,
      retry: true,
      retryLabel: 'Try payment again',
    };
  }
  if (attempt === 'cancelled' || returnedAttempt === 'cancelled') {
    return { title: 'Payment was cancelled', detail: 'Nothing was charged. Your order is held until it is paid.', retry: true, retryLabel: 'Try payment again' };
  }
  return {
    title: 'Waiting for your payment',
    detail: 'Your order goes to the kitchen as soon as it is paid.',
    retry: true,
    retryLabel: 'Pay now',
  };
}

function statusText(order) {
  const time = clockTime(order.pickup_at);
  if (order.status === 'awaiting_payment') {
    const p = paymentText(order);
    return [p.title, p.detail];
  }
  if (order.status === 'cancelled' && order.payment_method === 'sentoo' && order.payment_status !== 'paid') {
    return ['Order cancelled', 'The payment was not completed in time, so this order was cancelled. Nothing was charged. You are welcome to order again.'];
  }
  switch (order.status) {
    case 'new':
      return ['We got your order', `We will start cooking soon. Pick up around ${time}.`];
    case 'preparing':
      return ['We are making your order', `Pick up around ${time}.`];
    case 'ready':
      return ['Ready for pickup', `Come and get it, ${order.customer_name}. Tell us your order number.`];
    case 'done':
      return ['Picked up', 'Enjoy your food, and thank you for ordering.'];
    default:
      return order.cancelled_by === 'customer'
        ? ['Order cancelled', 'You cancelled this order. Nothing is owed. You are welcome to order again.']
        : ['Order cancelled', 'This order was cancelled. Call us if that is a surprise.'];
  }
}

function render({ order, info }) {
  latest = { order, info };
  if (lastStatus && lastStatus !== 'ready' && order.status === 'ready') announceReady(order);
  lastStatus = order.status;
  const [title, detail] = statusText(order);
  const at = STEPS.indexOf(order.status === 'done' ? 'ready' : order.status);
  const awaiting = order.status === 'awaiting_payment';
  const payment = awaiting ? paymentText(order) : null;
  const active = awaiting || ['new', 'preparing', 'ready'].includes(order.status);
  const paidNote =
    order.payment_status === 'paid'
      ? `${order.payment_method === 'sentoo' ? 'Paid online' : 'Paid'}. Thank you.${info.payment_test && order.payment_method === 'sentoo' ? ' This was a test payment, no real money was charged.' : ''}`
      : awaiting
        ? 'Not paid yet.'
        : 'Pay when you pick up your order.';
  const tel = `tel:${info.phone.replace(/[^\d+]/g, '')}`;
  document.getElementById('phone-link').href = tel;
  document.getElementById('phone-link').textContent = info.phone;
  document.title = order.status === 'ready' ? `Ready! Order ${order.number} | Volcano Street Food` : `#${order.number}: ${title} | Volcano Street Food`;

  ticket.innerHTML = `
    <div class="ticket-card ${order.status === 'cancelled' ? 'ticket-cancelled' : ''}">
      <div class="ticket-head">
        <p>Order number</p>
        <p class="ticket-number">${order.number}</p>
        <p>for ${esc(order.customer_name)}</p>
      </div>
      <h1 class="ticket-status">${title}</h1>
      <p class="ticket-detail">${esc(detail)}</p>
      ${
        order.status === 'cancelled' || awaiting
          ? ''
          : `<ol class="steps">${STEPS.map(
              (s, i) =>
                `<li class="${i < at || order.status === 'done' || (i === at && s === 'ready') ? 'is-done' : i === at ? 'is-now' : ''}">${STEP_LABELS[s]}</li>`
            ).join('')}</ol>`
      }
      <ul class="lines">
        ${order.items
          .map((l) => {
            const details = [...l.options, l.note && `Note: ${l.note}`].filter(Boolean).join(', ');
            return `<li class="line">
              <span class="line-name">${l.quantity} × ${esc(l.name)}</span>
              <span class="line-price">${money(l.unit_price_cents * l.quantity)}</span>
              ${details ? `<span class="line-opts">${esc(details)}</span>` : ''}
            </li>`;
          })
          .join('')}
      </ul>
      <div class="total"><span>Total</span><span>${money(order.total_cents)}</span></div>
      <p class="ticket-meta">${esc(paidNote)}${order.notes ? `<br>Your note: ${esc(order.notes)}` : ''}</p>
    </div>
    <div class="ticket-actions">
      ${payment && payment.retry && order.pay_url ? `<a class="btn btn-primary" href="${esc(order.pay_url)}">${payment.retryLabel}</a>` : ''}
      ${active ? `<a class="btn btn-quiet" href="${tel}">Need to change something? Call ${esc(info.phone)}</a>` : ''}
      ${cancelError ? `<p class="error" role="alert">${esc(cancelError)}</p>` : ''}
      ${order.can_cancel ? `<button class="btn btn-quiet btn-cancel" type="button" id="cancel-order">${confirmingCancel ? 'Tap again to cancel this order' : 'Cancel this order'}</button>` : ''}
      <a class="btn ${payment && payment.retry ? 'btn-quiet' : 'btn-primary'}" href="/">${active ? 'Back to the menu' : 'Order again'}</a>
    </div>`;
  return { active, awaiting };
}

let awaitingPayment = false;

async function refresh() {
  try {
    // While an online payment is open we ask the server to confirm it with Sentoo.
    // The server decides how often it really asks, so this is safe to call freely.
    const check = awaitingPayment || (firstCheck && returnedAttempt);
    const data = check
      ? await api(`/api/orders/${encodeURIComponent(id)}/payment/check${firstCheck && returnedAttempt ? '?returned=1' : ''}`, { method: 'POST', body: {} })
      : await api(`/api/orders/${encodeURIComponent(id)}`);
    firstCheck = false;
    const { active, awaiting } = render(data);
    // The first plain load may reveal an unpaid order: confirm it straight away.
    if (awaiting && !awaitingPayment) {
      awaitingPayment = true;
      return refresh();
    }
    awaitingPayment = awaiting;
    if (!active && timer) clearInterval(timer);
  } catch (err) {
    if (err.status === 404 || !ticket.querySelector('.ticket-card')) {
      ticket.innerHTML = `<div class="ticket-card"><h1 class="ticket-status">${err.status === 404 ? 'Order not found' : 'Could not load your order'}</h1>
        <p class="ticket-detail">${esc(err.status === 404 ? 'Check the link, or call us and we will look it up.' : err.message)}</p></div>
        <div class="ticket-actions"><a class="btn btn-primary" href="/">Back to the menu</a></div>`;
      if (err.status === 404 && timer) clearInterval(timer);
    }
  }
}

// Cancelling takes two taps, so a slip of the thumb does not cancel dinner.
ticket.addEventListener('click', async (event) => {
  if (!event.target.closest('#cancel-order') || !latest) return;
  if (!confirmingCancel) {
    confirmingCancel = true;
    cancelError = '';
    render(latest);
    setTimeout(() => {
      if (!confirmingCancel) return;
      confirmingCancel = false;
      if (latest) render(latest);
    }, 5000);
    return;
  }
  confirmingCancel = false;
  try {
    const result = await api(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
    cancelError = '';
    render(result);
  } catch (err) {
    cancelError = err.message;
    await refresh();
  }
});

if (/^[0-9a-f-]{36}$/.test(id)) {
  refresh();
  timer = setInterval(refresh, 10_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
} else {
  ticket.innerHTML = `<div class="ticket-card"><h1 class="ticket-status">Order not found</h1><p class="ticket-detail">This link is missing its order code.</p></div>
    <div class="ticket-actions"><a class="btn btn-primary" href="/">Back to the menu</a></div>`;
}
