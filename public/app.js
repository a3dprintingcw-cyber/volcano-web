// Customer ordering site: menu, item choices, cart and checkout.
import { api, esc, money, store } from '/shared.js';

const CART_KEY = 'volcano_cart_v1';
const CUSTOMER_KEY = 'volcano_customer_v1';
const LAST_ORDER_KEY = 'volcano_last_order_v1';
const LAST_CART_KEY = 'volcano_last_cart_v1';

const $ = (id) => document.getElementById(id);
const state = { menu: [], items: new Map(), info: null, availability: null, cart: store.get(CART_KEY, []), section: null };

// ---------- loading ----------

async function load() {
  try {
    const data = await api('/api/menu');
    state.menu = data.menu;
    state.info = data.info;
    state.availability = data.availability;
    state.items = new Map();
    for (const cat of data.menu) for (const item of cat.items) state.items.set(item.id, item);
    // Drop cart lines whose item or options have left the menu.
    state.cart = state.cart.filter((line) => {
      const item = state.items.get(line.item_id);
      if (!item) return false;
      const ids = new Set(item.groups.flatMap((g) => g.options.map((o) => o.id)));
      return line.option_ids.every((id) => ids.has(id));
    });
    saveCart();
    renderPage();
  } catch (err) {
    $('menu').innerHTML = `<p class="loading">${esc(err.message)} <button class="link" id="retry" type="button">Try again</button></p>`;
    $('retry').addEventListener('click', load);
  }
}

function renderPage() {
  const { availability: avail, info } = state;

  const status = $('status');
  status.textContent = avail.can_order ? avail.message : avail.open_now ? 'Online orders closed' : 'Closed now';
  status.classList.toggle('is-open', avail.can_order && avail.open_now);

  const notice = $('notice');
  notice.hidden = avail.can_order && avail.open_now;
  notice.textContent = avail.message;

  const tel = `tel:${info.phone.replace(/[^\d+]/g, '')}`;
  for (const id of ['phone-link', 'foot-phone']) {
    $(id).href = tel;
    $(id).textContent = info.phone;
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Curacao' });
  $('hours').innerHTML = info.hours
    .map((h) => `<dt class="${h.name === today ? 'is-today' : ''}">${h.name}</dt><dd class="${h.name === today ? 'is-today' : ''}">${h.text}</dd>`)
    .join('');

  const todayHours = info.hours.find((h) => h.name === today);
  $('hero-hours').textContent = todayHours && todayHours.open != null ? `Today: ${todayHours.text}` : 'Closed today';
  // The kitchen sets the wait time, so this is what customers can really expect right now.
  const wait = $('hero-wait');
  wait.hidden = !(avail.can_order && avail.open_now);
  wait.textContent = `Ready for pickup in about ${info.prep_minutes} minutes`;

  // The menu shows one section at a time. Which one is open is kept in the
  // address (#tacos), so a shared link or the back button lands on the same section.
  const wanted = state.section || location.hash.slice(1);
  state.section = (state.menu.find((c) => c.slug === wanted) || state.menu[0]).slug;
  renderSection();
  renderCartBar();
  renderTracker();
}

function renderSection() {
  const cat = state.menu.find((c) => c.slug === state.section);
  $('cats').innerHTML = state.menu
    .map(
      (c) =>
        `<button type="button" role="tab" id="tab-${c.slug}" data-section="${c.slug}" aria-selected="${c.slug === cat.slug}" aria-controls="menu">${esc(c.name)}</button>`
    )
    .join('');
  const main = $('menu');
  main.setAttribute('aria-busy', 'false');
  main.setAttribute('aria-labelledby', `tab-${cat.slug}`);
  main.innerHTML = `
    <section class="section">
      <h2>${esc(cat.name)}</h2>
      ${cat.note ? `<p class="section-note">${esc(cat.note)}</p>` : ''}
      <ul class="items">${cat.items.map(itemRow).join('')}</ul>
    </section>`;
  // Keep the open tab in view inside the tab bar, without moving the page.
  const bar = $('cats');
  const tab = $(`tab-${cat.slug}`);
  bar.scrollLeft = tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2;
}

function openSection(slug, { fromHistory = false } = {}) {
  if (!state.menu.some((c) => c.slug === slug) || slug === state.section) return;
  state.section = slug;
  renderSection();
  if (!fromHistory) history.pushState(null, '', `#${slug}`);
  // Start the new section at its top, just under the tab bar.
  // (The tab bar sticks to the top of the screen, so its resting place is measured from the menu.)
  const top = Math.max(0, Math.round($('menu').getBoundingClientRect().top + scrollY - $('cats').offsetHeight));
  if (scrollY > top) scrollTo(0, top);
}

$('cats').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-section]');
  if (tab) openSection(tab.dataset.section);
});

// Left and right arrow keys move between tabs.
$('cats').addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  const index = state.menu.findIndex((c) => c.slug === state.section);
  const next = state.menu[(index + (event.key === 'ArrowRight' ? 1 : -1) + state.menu.length) % state.menu.length];
  openSection(next.slug);
  $(`tab-${next.slug}`).focus();
  event.preventDefault();
});

window.addEventListener('popstate', () => {
  if (!state.menu.length) return;
  const slug = location.hash.slice(1);
  const known = state.menu.some((c) => c.slug === slug);
  openSection(known ? slug : state.menu[0].slug, { fromHistory: true });
});

function itemRow(item) {
  const price = `${item.has_price_range ? '<small>from</small> ' : ''}${money(item.from_cents)}`;
  const photo = item.image
    ? `<img class="item-photo" src="/img/${item.image}-420.webp" alt="" loading="lazy" width="100" height="100">`
    : '';
  return `
    <li>
      <button class="item ${item.available ? '' : 'is-out'}" type="button" data-item="${item.id}" ${item.available ? '' : 'disabled'}>
        <span class="item-body">
          <span class="item-name">${esc(item.name)}</span>
          ${item.description ? `<span class="item-desc">${esc(item.description)}</span>` : ''}
          <span class="item-price">${item.available ? price : '<span class="badge">Sold out</span>'}</span>
        </span>
        <span class="item-side">${photo}<span class="item-add" aria-hidden="true">+</span></span>
      </button>
    </li>`;
}

// ---------- item dialog ----------

const itemDialog = $('item-dialog');
let draft = null;

function openItem(id) {
  const item = state.items.get(id);
  if (!item || !item.available) return;
  draft = { item, quantity: 1, chosen: new Set() };

  const groups = item.groups
    .map((g) => {
      const single = g.max === 1 && g.min === 1;
      const rule = g.min === 0 ? 'Optional' : g.max > 1 ? `Choose ${g.max}` : 'Choose one';
      return `
        <fieldset class="group" data-group="${g.id}">
          <legend>${esc(g.name)} <span class="group-rule">${rule}</span></legend>
          ${g.options
            .map(
              (o) => `
            <label class="choice ${o.available ? '' : 'is-out'}">
              <input type="${single ? 'radio' : 'checkbox'}" name="g${g.id}" value="${o.id}" ${o.available ? '' : 'disabled'}>
              <span>${esc(o.name)}${o.available ? '' : ' (sold out)'}</span>
              ${choicePrice(item, g, o)}
            </label>`
            )
            .join('')}
        </fieldset>`;
    })
    .join('');

  const close = '<button class="sheet-close" type="button" data-close aria-label="Close">×</button>';
  itemDialog.innerHTML = `
    <div class="sheet-scroll">
      ${item.image ? `<div class="sheet-photo-wrap"><img class="sheet-photo" src="/img/${item.image}-900.webp" alt="${esc(item.name)}">${close}</div>` : ''}
      <div class="sheet-head"><h2 id="item-title">${esc(item.name)}</h2>${item.image ? '' : close}</div>
      ${item.description ? `<p class="sheet-desc">${esc(item.description)}</p>` : ''}
      ${groups}
      <div class="field">
        <label for="item-note">Anything we should know? <span class="hint">Optional</span></label>
        <input id="item-note" maxlength="120" placeholder="No onions, sauce on the side…" autocomplete="off">
      </div>
    </div>
    <div class="sheet-foot">
      <div class="qty" role="group" aria-label="Quantity">
        <button type="button" data-qty="-1" aria-label="One less">−</button>
        <output id="item-qty" aria-live="polite">1</output>
        <button type="button" data-qty="1" aria-label="One more">+</button>
      </div>
      <button class="btn btn-primary" type="button" id="item-add"></button>
    </div>`;
  updateDraft();
  itemDialog.showModal();
}

// Required groups show the full price per choice; optional extras show what they add.
function choicePrice(item, group, option) {
  if (group.min > 0 && item.price_cents === 0 && option.price_cents > 0) {
    return `<span class="choice-price">${money(option.price_cents)}</span>`;
  }
  return option.price_cents > 0 ? `<span class="choice-price">+ ${money(option.price_cents)}</span>` : '';
}

function draftStatus() {
  const { item, chosen } = draft;
  let unit = item.price_cents;
  let missing = null;
  for (const g of item.groups) {
    const picked = g.options.filter((o) => chosen.has(o.id));
    unit += picked.reduce((sum, o) => sum + o.price_cents, 0);
    if (picked.length < g.min && !missing) {
      missing = g.max > 1 ? `Choose ${g.min - picked.length} more` : `Choose ${g.name.toLowerCase()}`;
    }
  }
  return { unit, missing };
}

function updateDraft() {
  const { unit, missing } = draftStatus();
  $('item-qty').textContent = draft.quantity;
  itemDialog.querySelector('[data-qty="-1"]').disabled = draft.quantity <= 1;
  itemDialog.querySelector('[data-qty="1"]').disabled = draft.quantity >= 20;
  const button = $('item-add');
  button.disabled = Boolean(missing);
  button.textContent = missing || `Add to order, ${money(unit * draft.quantity)}`;
  // Grey out the remaining boxes once a "choose N" group is full.
  for (const g of draft.item.groups) {
    if (g.max <= 1 && g.min === 1) continue;
    const boxes = [...itemDialog.querySelectorAll(`input[name="g${g.id}"]`)];
    const full = boxes.filter((b) => b.checked).length >= g.max;
    for (const b of boxes) {
      const option = g.options.find((o) => o.id === Number(b.value));
      b.disabled = !option.available || (g.max > 1 && full && !b.checked);
    }
  }
}

itemDialog.addEventListener('change', (event) => {
  const input = event.target.closest('input[type="radio"], input[type="checkbox"]');
  if (!input || !draft) return;
  const group = draft.item.groups.find((g) => `g${g.id}` === input.name);
  // An optional "pick at most one" group behaves like a radio you can switch off.
  if (input.type === 'checkbox' && group.max === 1 && input.checked) {
    for (const other of itemDialog.querySelectorAll(`input[name="${input.name}"]`)) {
      if (other !== input) other.checked = false;
    }
  }
  for (const o of group.options) draft.chosen.delete(o.id);
  for (const box of itemDialog.querySelectorAll(`input[name="${input.name}"]:checked`)) draft.chosen.add(Number(box.value));
  updateDraft();
});

itemDialog.addEventListener('click', (event) => {
  if (event.target === itemDialog || event.target.closest('[data-close]')) return itemDialog.close();
  const step = event.target.closest('[data-qty]');
  if (step) {
    draft.quantity = Math.min(20, Math.max(1, draft.quantity + Number(step.dataset.qty)));
    return updateDraft();
  }
  if (event.target.closest('#item-add') && !draftStatus().missing) {
    addToCart({
      item_id: draft.item.id,
      option_ids: [...draft.chosen].sort((a, b) => a - b),
      note: $('item-note').value.trim(),
      quantity: draft.quantity,
    });
    itemDialog.close();
  }
});

// ---------- cart ----------

function saveCart() {
  store.set(CART_KEY, state.cart);
}

function addToCart(line) {
  const same = state.cart.find(
    (l) => l.item_id === line.item_id && l.note === line.note && l.option_ids.join() === line.option_ids.join()
  );
  if (same) same.quantity = Math.min(20, same.quantity + line.quantity);
  else state.cart.push(line);
  saveCart();
  renderCartBar(true);
  showAdded(line);
}

// Says out loud what just happened, so nobody wonders whether the tap worked.
let toastTimer = null;
function showAdded(line) {
  const toast = $('toast');
  toast.textContent = `Added: ${line.quantity} × ${state.items.get(line.item_id).name}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function lineDetails(line) {
  const item = state.items.get(line.item_id);
  const options = item.groups.flatMap((g) => g.options).filter((o) => line.option_ids.includes(o.id));
  const unit = item.price_cents + options.reduce((sum, o) => sum + o.price_cents, 0);
  return { item, options, unit, alcohol: item.alcohol || options.some((o) => o.alcohol) };
}

function cartSummary() {
  let count = 0;
  let total = 0;
  let alcohol = false;
  for (const line of state.cart) {
    const d = lineDetails(line);
    count += line.quantity;
    total += d.unit * line.quantity;
    alcohol = alcohol || d.alcohol;
  }
  return { count, total, alcohol };
}

function renderCartBar(bump = false) {
  if (state.items.size) renderAgain();
  const { count, total } = cartSummary();
  const bar = $('cartbar');
  bar.hidden = count === 0;
  $('cartbar-count').textContent = count;
  $('cartbar-total').textContent = money(total);
  bar.setAttribute('aria-label', `View your order: ${count} ${count === 1 ? 'item' : 'items'}, ${money(total)}`);
  if (bump) {
    bar.classList.remove('bump');
    void bar.offsetWidth;
    bar.classList.add('bump');
  }
}

const cartDialog = $('cart-dialog');
const form = { error: '', sending: false };

function renderCart() {
  const { count, total, alcohol } = cartSummary();
  const avail = state.availability;
  const customer = store.get(CUSTOMER_KEY, {});
  const head = `<div class="sheet-head"><h2 id="cart-title">Your order</h2><button class="sheet-close" type="button" data-close aria-label="Close">×</button></div>`;

  if (count === 0) {
    cartDialog.innerHTML = `${head}<p class="empty">Your order is empty. Pick something from the menu to get started.</p>`;
    return;
  }

  const lines = state.cart
    .map((line, index) => {
      const d = lineDetails(line);
      const details = [...d.options.map((o) => o.name), line.note && `Note: ${line.note}`].filter(Boolean).join(', ');
      return `
        <li class="line">
          <span class="line-name">${esc(d.item.name)}</span>
          <span class="line-price">${money(d.unit * line.quantity)}</span>
          ${details ? `<span class="line-opts">${esc(details)}</span>` : ''}
          <span class="line-actions">
            <span class="qty small" role="group" aria-label="Quantity of ${esc(d.item.name)}">
              <button type="button" data-line="${index}" data-step="-1" aria-label="One less">−</button>
              <output>${line.quantity}</output>
              <button type="button" data-line="${index}" data-step="1" aria-label="One more" ${line.quantity >= 20 ? 'disabled' : ''}>+</button>
            </span>
            <button class="link" type="button" data-line="${index}" data-remove>Remove</button>
          </span>
        </li>`;
    })
    .join('');

  let checkout;
  if (!avail.can_order) {
    checkout = `<p class="error">${esc(avail.message)}</p><p class="empty">Your order is saved on this device for when we are open.</p>`;
  } else {
    const times = [
      avail.asap ? `<option value="asap">As soon as possible, about ${avail.asap.minutes} minutes</option>` : '',
      ...avail.slots.map((s) => `<option value="${s.at}">${s.label}</option>`),
    ].join('');
    checkout = `
      <form class="checkout" id="checkout" novalidate>
        <h3>Pickup details</h3>
        <div class="field">
          <label for="c-time">Pickup time</label>
          <select id="c-time" name="pickup" required>${times}</select>
        </div>
        <div class="field">
          <label for="c-name">Your name</label>
          <input id="c-name" name="name" required maxlength="60" autocomplete="name" value="${esc(customer.name || '')}">
        </div>
        <div class="field">
          <label for="c-phone">Phone number <span class="hint">So we can reach you about your order</span></label>
          <input id="c-phone" name="phone" type="tel" required maxlength="20" autocomplete="tel" inputmode="tel" value="${esc(customer.phone || '')}">
        </div>
        <div class="field">
          <label for="c-notes">Note for the kitchen <span class="hint">Optional</span></label>
          <textarea id="c-notes" name="notes" maxlength="300"></textarea>
        </div>
        ${alcohol ? `<label class="check"><input type="checkbox" name="age" required> I am 18 or older. I will show ID at pickup if asked.</label>` : ''}
        ${
          state.info.online_payment
            ? `<fieldset class="group pay-choice">
                <legend>Payment</legend>
                <label class="choice"><input type="radio" name="payment" value="sentoo" checked> <span>Pay now online<br><small>With your bank or card, through Sentoo</small></span></label>
                <label class="choice"><input type="radio" name="payment" value="pickup"> <span>Pay at pickup</span></label>
              </fieldset>
              ${state.info.payment_test ? '<p class="pay-note">Test mode: online payments are practice payments. No real money is charged.</p>' : ''}`
            : '<p class="pay-note">Pay when you pick up your order.</p>'
        }
        ${form.error ? `<p class="error" role="alert">${esc(form.error)}</p>` : ''}
      </form>`;
  }

  cartDialog.innerHTML = `
    <div class="sheet-scroll">
      ${head}
      <ul class="lines">${lines}</ul>
      <div class="total"><span>Total</span><span>${money(total)}</span></div>
      ${checkout}
    </div>
    ${
      avail.can_order
        ? `<div class="sheet-foot"><button class="btn btn-primary" type="submit" form="checkout" ${form.sending ? 'disabled' : ''}>${form.sending ? 'Placing your order…' : submitLabel(total)}</button></div>`
        : ''
    }`;
}

// The button says what will happen next: straight to the kitchen, or on to payment first.
function submitLabel(total) {
  const chosen = cartDialog.querySelector('input[name="payment"]:checked');
  const online = state.info.online_payment && (!chosen || chosen.value === 'sentoo');
  return online ? `Continue to payment, ${money(total)}` : `Place order, ${money(total)}`;
}

function keepFormValues(render) {
  const old = cartDialog.querySelector('#checkout');
  const values = old ? Object.fromEntries(new FormData(old)) : null;
  render();
  const fresh = cartDialog.querySelector('#checkout');
  if (!values || !fresh) return;
  const relabel = () => {
    const button = cartDialog.querySelector('.sheet-foot .btn');
    if (button && !form.sending) button.textContent = submitLabel(cartSummary().total);
  };
  for (const [name, value] of Object.entries(values)) {
    const field = fresh.elements[name];
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = true;
    else if (name === 'payment') field.value = value;
    else if (field.tagName !== 'SELECT' || [...field.options].some((o) => o.value === value)) field.value = value;
  }
  relabel();
}

cartDialog.addEventListener('change', (event) => {
  if (event.target.name !== 'payment' || form.sending) return;
  const button = cartDialog.querySelector('.sheet-foot .btn');
  if (button) button.textContent = submitLabel(cartSummary().total);
});

$('cartbar').addEventListener('click', () => {
  form.error = '';
  renderCart();
  cartDialog.showModal();
});

cartDialog.addEventListener('click', (event) => {
  if (event.target === cartDialog || event.target.closest('[data-close]')) return cartDialog.close();
  const button = event.target.closest('[data-line]');
  if (!button) return;
  const index = Number(button.dataset.line);
  if ('remove' in button.dataset) state.cart.splice(index, 1);
  else {
    state.cart[index].quantity += Number(button.dataset.step);
    if (state.cart[index].quantity <= 0) state.cart.splice(index, 1);
  }
  saveCart();
  renderCartBar();
  keepFormValues(renderCart);
});

// Once the customer starts fixing the form, the old error no longer applies.
cartDialog.addEventListener('input', () => {
  if (!form.error) return;
  form.error = '';
  cartDialog.querySelector('.checkout .error')?.remove();
});

cartDialog.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (form.sending) return;
  const data = new FormData(event.target);
  const name = String(data.get('name') || '').trim();
  const phone = String(data.get('phone') || '').trim();
  const { alcohol } = cartSummary();

  const fail = (message, field) => {
    form.error = message;
    keepFormValues(renderCart);
    const el = field && cartDialog.querySelector(`[name="${field}"]`);
    if (el) el.focus();
    else cartDialog.querySelector('.error')?.scrollIntoView({ block: 'center' });
  };
  if (name.length < 2) return fail('Please enter your name so we can call it out at pickup.', 'name');
  if (phone.replace(/\D/g, '').length < 7) return fail('Please enter a phone number we can reach you on.', 'phone');
  if (alcohol && !data.get('age')) return fail('Please confirm you are 18 or older to order alcohol.', 'age');

  store.set(CUSTOMER_KEY, { name, phone });
  form.sending = true;
  form.error = '';
  keepFormValues(renderCart);
  try {
    const pickup = data.get('pickup');
    const order = await api('/api/orders', {
      method: 'POST',
      body: {
        name,
        phone,
        notes: String(data.get('notes') || ''),
        pickup: pickup === 'asap' ? 'asap' : Number(pickup),
        age_confirmed: Boolean(data.get('age')),
        payment: data.get('payment') === 'sentoo' ? 'sentoo' : 'pickup',
        items: state.cart,
      },
    });
    store.set(LAST_ORDER_KEY, { id: order.id, number: order.number, at: Date.now() });
    store.set(LAST_CART_KEY, state.cart);
    state.cart = [];
    saveCart();
    // Paying online: on to Sentoo's payment page. Sentoo sends the customer back to the order page.
    location.href = order.pay_url || `/order?id=${order.id}`;
  } catch (err) {
    form.sending = false;
    // The menu or opening times may have changed under us: refresh and show why.
    if (err.status === 409) {
      try {
        const data2 = await api('/api/menu');
        state.menu = data2.menu;
        state.availability = data2.availability;
        state.items = new Map(data2.menu.flatMap((c) => c.items).map((i) => [i.id, i]));
        state.cart = state.cart.filter((l) => state.items.has(l.item_id));
        saveCart();
        renderPage();
      } catch {
        /* keep what we have */
      }
    }
    fail(err.message);
  }
});

// ---------- last order link ----------

// Lines from the previous order that are still on the menu today.
function lastOrderLines() {
  return store.get(LAST_CART_KEY, []).filter((line) => {
    const item = state.items.get(line.item_id);
    if (!item || !item.available || !Array.isArray(line.option_ids)) return false;
    const options = new Map(item.groups.flatMap((g) => g.options).map((o) => [o.id, o]));
    return line.option_ids.every((id) => options.has(id) && options.get(id).available);
  });
}

function renderAgain() {
  const lines = lastOrderLines();
  const button = $('again');
  button.hidden = lines.length === 0 || state.cart.length > 0;
  if (button.hidden) return;
  const names = lines.map((l) => `${l.quantity} × ${state.items.get(l.item_id).name}`);
  button.textContent = `Order the same again: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
}

$('again').addEventListener('click', () => {
  state.cart = lastOrderLines().map((l) => ({ item_id: l.item_id, option_ids: l.option_ids, note: l.note || '', quantity: l.quantity }));
  saveCart();
  renderCartBar(true);
  form.error = '';
  renderCart();
  cartDialog.showModal();
});

function renderTracker() {
  renderAgain();
  const last = store.get(LAST_ORDER_KEY, null);
  const link = $('tracker');
  if (!last || Date.now() - last.at > 6 * 3600 * 1000) {
    link.hidden = true;
    return;
  }
  link.hidden = false;
  link.href = `/order?id=${last.id}`;
  link.textContent = `Follow your order #${last.number}`;
}

$('menu').addEventListener('click', (event) => {
  const row = event.target.closest('[data-item]');
  if (row) openItem(Number(row.dataset.item));
});

// Coming back with the back button after ordering: show the emptied cart.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    state.cart = store.get(CART_KEY, []);
    renderCartBar();
    renderTracker();
  }
});

load();
// Opening status changes through the evening, so refresh it quietly.
setInterval(async () => {
  if (itemDialog.open || cartDialog.open) return;
  try {
    const data = await api('/api/menu');
    const changed = JSON.stringify(data.menu) !== JSON.stringify(state.menu) || data.availability.message !== state.availability.message;
    state.availability = data.availability;
    if (changed) {
      state.menu = data.menu;
      state.items = new Map(data.menu.flatMap((c) => c.items).map((i) => [i.id, i]));
      renderPage();
    }
  } catch {
    /* try again next time */
  }
}, 60_000);
