// Order confirmation and live status for the customer.
import { api, clockTime, esc, money } from '/shared.js';

const id = new URLSearchParams(location.search).get('id') || '';
const ticket = document.getElementById('ticket');
const STEPS = ['new', 'preparing', 'ready'];
const STEP_LABELS = { new: 'Received', preparing: 'Cooking', ready: 'Ready' };
let timer = null;

function statusText(order) {
  const time = clockTime(order.pickup_at);
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
      return ['Order cancelled', 'This order was cancelled. Call us if that is a surprise.'];
  }
}

function render({ order, info }) {
  const [title, detail] = statusText(order);
  const at = STEPS.indexOf(order.status === 'done' ? 'ready' : order.status);
  const active = ['new', 'preparing', 'ready'].includes(order.status);
  const tel = `tel:${info.phone.replace(/[^\d+]/g, '')}`;
  document.getElementById('phone-link').href = tel;
  document.getElementById('phone-link').textContent = info.phone;
  document.title = `#${order.number}: ${title} | Volcano Street Food`;

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
        order.status === 'cancelled'
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
      <p class="ticket-meta">${order.payment_status === 'paid' ? 'Paid. Thank you.' : 'Pay when you pick up your order.'}${order.notes ? `<br>Your note: ${esc(order.notes)}` : ''}</p>
    </div>
    <div class="ticket-actions">
      ${active ? `<a class="btn btn-quiet" href="${tel}">Need to change something? Call ${esc(info.phone)}</a>` : ''}
      <a class="btn btn-primary" href="/">${active ? 'Back to the menu' : 'Order again'}</a>
    </div>`;
  return active;
}

async function refresh() {
  try {
    const data = await api(`/api/orders/${encodeURIComponent(id)}`);
    const active = render(data);
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
