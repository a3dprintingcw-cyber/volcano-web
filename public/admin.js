// Menu, prices, sold-out switches and opening hours.
// Staff PIN: sold-out switches and pausing orders. Manager PIN: everything.
import { api, esc, money } from '/shared.js';
import { requireStaff, signOut } from '/staff-login.js';

const app = document.getElementById('app');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let role = 'staff';
let data = null;
let sales = null;
let toastTimer = null;

const toTime = (minutes) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const fromTime = (value, isClose) => {
  const [h, m] = value.split(':').map(Number);
  const minutes = h * 60 + m;
  return isClose && minutes === 0 ? 1440 : minutes; // 00:00 as a closing time means midnight
};

function toast(message, isError = false) {
  document.querySelector('.saved')?.remove();
  const el = document.createElement('p');
  el.className = `saved ${isError ? 'is-error' : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), isError ? 5000 : 1800);
}

const priceInput = (kind, id, cents) =>
  `<input type="number" min="0" max="1000" step="0.5" inputmode="decimal" value="${cents / 100}" data-price="${kind}" data-id="${id}" aria-label="Price in guilders" ${role === 'admin' ? '' : 'disabled'}>`;

const availableSwitch = (kind, id, on) =>
  `<label class="switch"><input type="checkbox" data-available="${kind}" data-id="${id}" ${on ? 'checked' : ''}> Available</label>`;

function render() {
  const s = data.settings;
  const admin = role === 'admin';
  app.innerHTML = `
    <header class="staff-bar">
      <h1>Menu and hours</h1>
      <a href="/kitchen/">Kitchen board</a>
      <a href="/">Website</a>
      <button class="pill" type="button" data-signout>Sign out</button>
    </header>
    <div class="admin">
      ${salesPanel()}
      <section class="panel">
        <h2>Online ordering</h2>
        <div class="set">
          <label class="switch"><input type="checkbox" id="paused" ${s.ordering_paused ? 'checked' : ''}> Pause online orders</label>
          ${
            admin
              ? `<label>Message customers see while paused
                  <input type="text" id="paused_message" maxlength="160" value="${esc(s.paused_message || '')}" placeholder="Online ordering is paused right now. Please check back soon."></label>
                <label>Minutes to prepare an order <input type="number" id="prep_minutes" min="5" max="120" value="${s.prep_minutes}"></label>
                <label>Stop taking orders this many minutes before closing <input type="number" id="last_order" min="0" max="120" value="${s.last_order_minutes_before_close}"></label>
                <label>Phone number shown on the website <input type="text" id="phone" maxlength="30" value="${esc(s.phone || '')}"></label>`
              : ''
          }
        </div>
      </section>

      ${
        admin
          ? `<section class="panel">
        <h2>Opening hours</h2>
        <p>Times are Curaçao time. Closing can be midnight at the latest.</p>
        ${DAYS.map((name, day) => {
          const h = s.hours[day];
          return `<div class="day" data-day="${day}">
            <strong>${name}</strong>
            <label class="switch"><input type="checkbox" data-open ${h ? 'checked' : ''}> Open</label>
            <span class="day-times set">
              <input type="time" data-from value="${toTime(h ? h.open : 1080)}" aria-label="${name} opening time" ${h ? '' : 'disabled'}>
              to
              <input type="time" data-to value="${toTime(h ? h.close : 1440)}" aria-label="${name} closing time" ${h ? '' : 'disabled'}>
            </span>
          </div>`;
        }).join('')}
      </section>`
          : ''
      }

      <section class="panel">
        <h2>Menu</h2>
        <p>${admin ? 'Change a price or switch something off when it is sold out. Changes are saved straight away.' : 'Switch something off when it is sold out. Prices need the manager PIN.'}</p>
        ${data.menu
          .map(
            (cat) => `
          <h3 class="cat-title">${esc(cat.name)}</h3>
          ${cat.items
            .map((item) => {
              const fixedPrice = !(item.price_cents === 0 && item.groups.some((g) => g.min > 0));
              return `
              <div class="row">
                <span class="row-name">${esc(item.name)}</span>
                ${fixedPrice ? priceInput('items', item.id, item.price_cents) : '<span class="muted">priced by size</span>'}
                ${availableSwitch('items', item.id, item.available)}
              </div>
              ${item.groups
                .map(
                  (g) => `<div class="row-group">${esc(g.name)}</div>
                  ${g.options
                    .map(
                      (o) => `<div class="row is-option">
                        <span class="row-name">${esc(o.name)}</span>
                        ${priceInput('options', o.id, o.price_cents)}
                        ${availableSwitch('options', o.id, o.available)}
                      </div>`
                    )
                    .join('')}`
                )
                .join('')}`;
            })
            .join('')}`
          )
          .join('')}
      </section>
    </div>`;
}

const dayName = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Sales figures, manager only. Cancelled orders and unpaid online orders are not counted.
function salesPanel() {
  if (role !== 'admin' || !sales) return '';
  const t = sales.today;
  return `
    <section class="panel">
      <h2>Sales</h2>
      <div class="stats">
        <div class="stat"><span class="stat-value">${money(t.total_cents || 0)}</span><span class="stat-label">Today</span></div>
        <div class="stat"><span class="stat-value">${t.orders}</span><span class="stat-label">Orders today</span></div>
        <div class="stat"><span class="stat-value">${money(t.average_cents)}</span><span class="stat-label">Average order</span></div>
        <div class="stat"><span class="stat-value">${money(t.online_cents || 0)}</span><span class="stat-label">Paid online today</span></div>
        <div class="stat"><span class="stat-value">${t.cancelled}</span><span class="stat-label">Cancelled today</span></div>
      </div>
      <h3>Last 7 days</h3>
      ${
        sales.days.length
          ? `<table class="sales-table"><thead><tr><th>Day</th><th class="num">Orders</th><th class="num">Sales</th><th class="num">Paid online</th></tr></thead><tbody>
              ${sales.days.map((d) => `<tr><td>${esc(dayName(d.day))}</td><td class="num">${d.orders}</td><td class="num">${money(d.total_cents)}</td><td class="num">${money(d.online_cents || 0)}</td></tr>`).join('')}
            </tbody></table>`
          : '<p>No orders in the last 7 days yet.</p>'
      }
      <h3>Best sellers, last 30 days</h3>
      ${
        sales.top_items.length
          ? `<table class="sales-table"><thead><tr><th>Dish</th><th class="num">Sold</th><th class="num">Sales</th></tr></thead><tbody>
              ${sales.top_items.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${i.quantity}</td><td class="num">${money(i.total_cents)}</td></tr>`).join('')}
            </tbody></table>`
          : '<p>Nothing sold yet.</p>'
      }
    </section>`;
}

async function save(run, message = 'Saved') {
  try {
    await run();
    toast(message);
    return true;
  } catch (err) {
    if (err.status === 401) return location.reload();
    toast(err.message, true);
    return false;
  }
}

async function reload() {
  const fresh = await api('/api/staff/menu');
  data = fresh;
  role = fresh.role;
  sales = role === 'admin' ? await api('/api/admin/sales').catch(() => null) : null;
}

function collectHours() {
  const hours = {};
  for (const row of app.querySelectorAll('.day')) {
    const open = row.querySelector('[data-open]').checked;
    hours[row.dataset.day] = open
      ? { open: fromTime(row.querySelector('[data-from]').value, false), close: fromTime(row.querySelector('[data-to]').value, true) }
      : null;
  }
  return hours;
}

app.addEventListener('change', async (event) => {
  const el = event.target;
  if (el.dataset.available) {
    const ok = await save(() => api(`/api/staff/${el.dataset.available}/${el.dataset.id}/available`, { method: 'POST', body: { available: el.checked } }), el.checked ? 'Back on the menu' : 'Marked sold out');
    if (!ok) el.checked = !el.checked;
    return;
  }
  if (el.dataset.price) {
    const cents = Math.round(Number(el.value) * 100);
    if (!Number.isFinite(cents) || cents < 0) return toast('Enter a price of 0 or more.', true);
    return save(() => api(`/api/admin/${el.dataset.price}/${el.dataset.id}`, { method: 'PATCH', body: { price_cents: cents } }), 'Price saved');
  }
  if (el.id === 'paused') {
    const ok = await save(() => api('/api/staff/pause', { method: 'POST', body: { paused: el.checked } }), el.checked ? 'Online orders paused' : 'Online orders are open again');
    if (!ok) el.checked = !el.checked;
    return;
  }
  const settingFields = { paused_message: 'paused_message', prep_minutes: 'prep_minutes', last_order: 'last_order_minutes_before_close', phone: 'phone' };
  if (settingFields[el.id]) {
    const value = el.type === 'number' ? Number(el.value) : el.value;
    return save(() => api('/api/admin/settings', { method: 'PUT', body: { [settingFields[el.id]]: value } }));
  }
  if (el.closest('.day')) {
    const row = el.closest('.day');
    const open = row.querySelector('[data-open]').checked;
    row.querySelector('[data-from]').disabled = !open;
    row.querySelector('[data-to]').disabled = !open;
    return save(() => api('/api/admin/settings', { method: 'PUT', body: { hours: collectHours() } }), 'Hours saved');
  }
});

app.addEventListener('click', (event) => {
  if (event.target.closest('[data-signout]')) signOut();
});

role = await requireStaff(app, { title: 'Menu and hours' });
await reload();
render();
