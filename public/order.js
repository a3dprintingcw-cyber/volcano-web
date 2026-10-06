// Order confirmation and live status for the customer.
import { PLACE, api, clockTime, esc, money } from '/shared.js';
import { t, translatePage } from '/i18n.js';

translatePage();

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

// ---------- phone notification when the order is ready ----------
// 'unsupported' (this browser cannot), 'off', 'on', 'blocked' (the customer said no), 'working'
const canNotify = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let notifyState = !canNotify ? 'unsupported' : Notification.permission === 'denied' ? 'blocked' : 'off';
// On an iPhone, notifications only work once the site is on the home screen.
const isIphoneTab = /iPhone|iPad|iPod/.test(navigator.userAgent) && !canNotify;

const keyBytes = (base64url) => Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function switchOnNotifications({ ask }) {
  if (!canNotify) return;
  try {
    if (Notification.permission === 'default') {
      if (!ask) return; // the browser only allows asking after a tap
      notifyState = 'working';
      if (latest) render(latest);
      if ((await Notification.requestPermission()) !== 'granted') {
        notifyState = Notification.permission === 'denied' ? 'blocked' : 'off';
        if (latest) render(latest);
        return;
      }
    }
    if (Notification.permission !== 'granted') return;
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key');
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    await api(`/api/orders/${encodeURIComponent(id)}/push`, { method: 'POST', body: { endpoint: subscription.endpoint } });
    notifyState = 'on';
  } catch {
    notifyState = 'off';
  }
  if (latest) render(latest);
}

function notifyBlock(active) {
  if (!active) return '';
  if (notifyState === 'on') return `<p class="notify is-on">${t('notify.on')}</p>`;
  if (notifyState === 'working') return `<p class="notify">${t('notify.working')}</p>`;
  if (notifyState === 'blocked') return `<p class="notify">${t('notify.blocked')}</p>`;
  if (notifyState === 'off') return `<button class="btn btn-primary" type="button" id="notify-me">${t('notify.button')}</button>`;
  return `<p class="notify">${t('notify.keep_open')}${isIphoneTab ? ` ${t('notify.iphone')}` : ''}</p>`;
}

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
  document.title = `${t('order.ready_title', { n: order.number })} | Volcano Street Food`;
}
const ticket = document.getElementById('ticket');
const STEPS = ['new', 'preparing', 'ready'];
const STEP_LABELS = { new: t('order.step_new'), preparing: t('order.step_preparing'), ready: t('order.step_ready') };
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
      title: t('pay.confirming'),
      detail: t('pay.confirming_detail'),
      retry: false,
    };
  }
  if (order.pay_state === 'failed') {
    return {
      title: t('pay.problem'),
      detail: t('pay.problem_detail'),
      retry: false,
    };
  }
  if (attempt === 'rejected') {
    return {
      title: t('pay.rejected'),
      detail: `${order.pay_message ? `${t('pay.bank_said', { message: order.pay_message })} ` : ''}${t('pay.rejected_detail')}`,
      retry: true,
      retryLabel: t('pay.retry'),
    };
  }
  if (attempt === 'cancelled' || returnedAttempt === 'cancelled') {
    return { title: t('pay.cancelled'), detail: t('pay.cancelled_detail'), retry: true, retryLabel: t('pay.retry') };
  }
  return {
    title: t('pay.waiting'),
    detail: t('pay.waiting_detail'),
    retry: true,
    retryLabel: t('pay.now'),
  };
}

function statusText(order) {
  const time = clockTime(order.pickup_at);
  if (order.status === 'awaiting_payment') {
    const p = paymentText(order);
    return [p.title, p.detail];
  }
  if (order.status === 'cancelled' && order.payment_method === 'sentoo' && order.payment_status !== 'paid') {
    return [t('order.cancelled'), t('order.cancelled_payment')];
  }
  switch (order.status) {
    case 'new':
      return [t('order.new'), t('order.new_detail', { time })];
    case 'preparing':
      return [t('order.preparing'), t('order.preparing_detail', { time })];
    case 'ready':
      return [t('order.ready'), t('order.ready_detail', { name: order.customer_name })];
    case 'done':
      return [t('order.done'), t('order.done_detail')];
    default:
      return order.cancelled_by === 'customer'
        ? [t('order.cancelled'), t('order.cancelled_you')]
        : [t('order.cancelled'), t('order.cancelled_other')];
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
      ? `${order.payment_method === 'sentoo' ? t('order.paid_online') : t('order.paid')}${info.payment_test && order.payment_method === 'sentoo' ? ` ${t('order.paid_test')}` : ''}`
      : awaiting
        ? t('order.not_paid')
        : t('cart.pay_note');
  const tel = `tel:${info.phone.replace(/[^\d+]/g, '')}`;
  document.getElementById('phone-link').href = tel;
  document.getElementById('phone-link').textContent = info.phone;
  document.title = order.status === 'ready' ? `${t('order.ready_title', { n: order.number })} | Volcano Street Food` : `#${order.number}: ${title} | Volcano Street Food`;

  ticket.innerHTML = `
    <div class="ticket-card ${order.status === 'cancelled' ? 'ticket-cancelled' : ''}">
      <div class="ticket-head">
        <p>${t('order.number')}</p>
        <p class="ticket-number">${order.number}</p>
        <p>${esc(t('order.for', { name: order.customer_name }))}</p>
      </div>
      <h1 class="ticket-status">${esc(title)}</h1>
      <p class="ticket-detail">${esc(detail)}</p>
      ${awaiting ? '' : `<div class="ticket-notify">${notifyBlock(active && order.status !== 'ready')}</div>`}
      ${active ? `<p class="ticket-where">${t('order.pickup_at')} <a href="${esc(PLACE.mapUrl)}" rel="noopener">${esc(PLACE.address)}</a></p>` : ''}
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
            const details = [...l.options, l.note && t('cart.note', { note: l.note })].filter(Boolean).join(', ');
            return `<li class="line">
              <span class="line-name">${l.quantity} × ${esc(l.name)}</span>
              <span class="line-price">${money(l.unit_price_cents * l.quantity)}</span>
              ${details ? `<span class="line-opts">${esc(details)}</span>` : ''}
            </li>`;
          })
          .join('')}
      </ul>
      <div class="total"><span>${t('cart.total')}</span><span>${money(order.total_cents)}</span></div>
      <p class="ticket-meta">${esc(paidNote)}${order.notes ? `<br>${esc(t('order.your_note', { note: order.notes }))}` : ''}</p>
    </div>
    <div class="ticket-actions">
      ${payment && payment.retry && order.pay_url ? `<a class="btn btn-primary" href="${esc(order.pay_url)}">${payment.retryLabel}</a>` : ''}
      ${active ? `<a class="btn btn-quiet" href="${tel}">${esc(t('order.call', { phone: info.phone }))}</a>` : ''}
      ${cancelError ? `<p class="error" role="alert">${esc(cancelError)}</p>` : ''}
      ${order.can_cancel ? `<button class="btn btn-quiet btn-cancel" type="button" id="cancel-order">${confirmingCancel ? t('order.cancel_confirm') : t('order.cancel')}</button>` : ''}
      <a class="btn ${payment && payment.retry ? 'btn-quiet' : 'btn-primary'}" href="/">${active ? t('order.back') : t('order.again')}</a>
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
      ticket.innerHTML = `<div class="ticket-card"><h1 class="ticket-status">${err.status === 404 ? t('order.not_found') : t('order.load_failed')}</h1>
        <p class="ticket-detail">${esc(err.status === 404 ? t('order.not_found_detail') : err.message)}</p></div>
        <div class="ticket-actions"><a class="btn btn-primary" href="/">${t('order.back')}</a></div>`;
      if (err.status === 404 && timer) clearInterval(timer);
    }
  }
}

// Cancelling takes two taps, so a slip of the thumb does not cancel dinner.
ticket.addEventListener('click', async (event) => {
  if (event.target.closest('#notify-me')) return switchOnNotifications({ ask: true });
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
  // A customer who allowed notifications before does not need to tap again.
  refresh().then(() => switchOnNotifications({ ask: false }));
  timer = setInterval(refresh, 10_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
} else {
  ticket.innerHTML = `<div class="ticket-card"><h1 class="ticket-status">${t('order.not_found')}</h1><p class="ticket-detail">${t('order.no_code')}</p></div>
    <div class="ticket-actions"><a class="btn btn-primary" href="/">${t('order.back')}</a></div>`;
}
