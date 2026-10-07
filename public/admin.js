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
const openDishes = new Set(); // dish editors the manager has open
let addOpen = false;

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
      ${admin ? reportPanel() : ''}

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
        ${admin ? addDishForm() : ''}
        ${data.menu
          .map(
            (cat) => `
          <h3 class="cat-title">${esc(cat.name)}</h3>
          ${cat.items
            .map((item) => {
              const fixedPrice = !(item.price_cents === 0 && item.groups.some((g) => g.min > 0));
              if (item.archived) {
                return admin
                  ? `<div class="row is-archived">
                      <span class="row-name">${esc(item.name)} <span class="muted">(removed from the menu)</span></span>
                      <button class="pill" type="button" data-restore="${item.id}">Put back</button>
                    </div>`
                  : '';
              }
              return `
              <div class="row">
                <span class="row-name">${esc(item.name)}</span>
                ${fixedPrice ? priceInput('items', item.id, item.price_cents) : '<span class="muted">priced by size</span>'}
                ${availableSwitch('items', item.id, item.available)}
              </div>
              ${admin ? dishEditor(item) : ''}
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

// Name, description and photo of one dish, folded away until the manager opens it.
function dishEditor(item) {
  return `<details class="dish-edit" data-dish="${item.id}" ${openDishes.has(item.id) ? 'open' : ''}>
    <summary>Edit name, description and photo</summary>
    <div class="set">
      <label>Name <input type="text" data-field="name" maxlength="60" value="${esc(item.name)}"></label>
      <label>Description <input type="text" data-field="description" maxlength="200" value="${esc(item.description || '')}"></label>
      <div class="dish-photo">
        ${item.photo ? `<img src="${esc(item.photo.small)}" alt="" width="84" height="84">` : '<span class="dish-nophoto">No photo</span>'}
        <label class="pill">${item.photo ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" data-photo hidden></label>
        ${item.photo ? '<button class="pill" type="button" data-nophoto>Remove photo</button>' : ''}
        <button class="pill is-danger" type="button" data-archive>Remove from menu</button>
      </div>
    </div>
  </details>`;
}

function addDishForm() {
  return `<details class="dish-edit dish-add" ${addOpen ? 'open' : ''}>
    <summary>Add a new dish</summary>
    <form class="set" id="add-dish">
      <label>Menu section <select name="category_id" required>${data.menu.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label>Name <input type="text" name="name" maxlength="60" required></label>
      <label>Description <input type="text" name="description" maxlength="200"></label>
      <label>Price in guilders <input type="number" name="price" min="1" max="1000" step="0.5" inputmode="decimal" required></label>
      <label class="switch"><input type="checkbox" name="alcohol"> Contains alcohol (customers confirm they are 18 or older)</label>
      <button class="pill" type="submit">Add dish</button>
      <p class="muted">You can add a photo after the dish is saved.</p>
    </form>
  </details>`;
}

// Shrinks a photo in the browser to a square JPEG, so any phone photo can be used.
async function squareJpeg(file, size, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(size, side);
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

// The end of day email for the owners.
function reportPanel() {
  const s = data.settings;
  return `<section class="panel">
    <h2>Day report by email</h2>
    <p>After closing, the day's sales, number of orders and best sellers are emailed to the owners.</p>
    <div class="set">
      <label>Send the report to <input type="text" id="report_email" maxlength="320" inputmode="email" autocomplete="off" value="${esc(s.report_email || '')}" placeholder="owner@example.com"></label>
      <p class="muted">Up to three addresses, with a comma between them. Leave empty to switch the report off.</p>
      ${
        data.report_ready
          ? `<button class="pill" type="button" data-report-send ${s.report_email ? '' : 'disabled'}>Send today's report now</button>`
          : `<p class="muted">Email sending is not connected yet. It needs the restaurant's domain to be active. The address is saved, and the reports start by themselves once it is.</p>`
      }
      <details class="dish-edit" id="report-preview"><summary>See what tonight's email will say</summary><pre class="report-text">Loading…</pre></details>
    </div>
  </section>`;
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
  const dish = el.closest('[data-dish]');
  if (dish && el.dataset.field) {
    const ok = await save(() => api(`/api/admin/items/${dish.dataset.dish}`, { method: 'PATCH', body: { [el.dataset.field]: el.value } }));
    if (ok) {
      await reload();
      render();
    }
    return;
  }
  if (dish && 'photo' in el.dataset) {
    const file = el.files[0];
    if (!file) return;
    toast('Uploading the photo…');
    const ok = await save(async () => {
      let small;
      let large;
      try {
        [small, large] = await Promise.all([squareJpeg(file, 420, 0.8), squareJpeg(file, 900, 0.82)]);
      } catch {
        throw new Error('That file is not a photo this browser can read. Please try a JPG or PNG.');
      }
      await api(`/api/admin/items/${dish.dataset.dish}/photo`, { method: 'POST', body: { small, large } });
    }, 'Photo saved');
    if (ok) {
      await reload();
      render();
    }
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
  const settingFields = { paused_message: 'paused_message', prep_minutes: 'prep_minutes', last_order: 'last_order_minutes_before_close', phone: 'phone', report_email: 'report_email' };
  if (settingFields[el.id]) {
    const value = el.type === 'number' ? Number(el.value) : el.value;
    const ok = await save(() => api('/api/admin/settings', { method: 'PUT', body: { [settingFields[el.id]]: value } }));
    if (ok && el.id === 'report_email') {
      data.settings.report_email = el.value.trim();
      const button = app.querySelector('[data-report-send]');
      if (button) button.disabled = !data.settings.report_email;
    }
    return;
  }
  if (el.closest('.day')) {
    const row = el.closest('.day');
    const open = row.querySelector('[data-open]').checked;
    row.querySelector('[data-from]').disabled = !open;
    row.querySelector('[data-to]').disabled = !open;
    return save(() => api('/api/admin/settings', { method: 'PUT', body: { hours: collectHours() } }), 'Hours saved');
  }
});

async function changeDish(id, body, message) {
  if (await save(() => api(`/api/admin/items/${id}`, { method: 'PATCH', body }), message)) {
    await reload();
    render();
  }
}

app.addEventListener('click', (event) => {
  if (event.target.closest('[data-signout]')) return signOut();
  if (event.target.closest('[data-report-send]')) {
    return save(async () => {
      await api('/api/admin/report', { method: 'POST', body: {} });
    }, 'Report sent');
  }
  const restore = event.target.closest('[data-restore]');
  if (restore) return changeDish(restore.dataset.restore, { archived: false }, 'Back on the menu');
  const dish = event.target.closest('[data-dish]');
  if (!dish) return;
  if (event.target.closest('[data-nophoto]')) return changeDish(dish.dataset.dish, { image: '' }, 'Photo removed');
  if (event.target.closest('[data-archive]')) {
    openDishes.delete(Number(dish.dataset.dish));
    return changeDish(dish.dataset.dish, { archived: true }, 'Removed from the menu');
  }
});

// Remember which editors are open, so saving does not fold them shut.
app.addEventListener(
  'toggle',
  (event) => {
    const el = event.target;
    if (el.id === 'report-preview') {
      if (el.open) {
        api('/api/admin/report')
          .then((r) => (el.querySelector('pre').textContent = `Subject: ${r.subject}\n\n${r.text}`))
          .catch((err) => (el.querySelector('pre').textContent = err.message));
      }
      return;
    }
    if (el.matches?.('.dish-add')) addOpen = el.open;
    else if (el.dataset?.dish) openDishes[el.open ? 'add' : 'delete'](Number(el.dataset.dish));
  },
  true
);

app.addEventListener('submit', async (event) => {
  if (event.target.id !== 'add-dish') return;
  event.preventDefault();
  const form = new FormData(event.target);
  let created = null;
  const ok = await save(async () => {
    created = await api('/api/admin/items', {
      method: 'POST',
      body: {
        category_id: Number(form.get('category_id')),
        name: form.get('name'),
        description: form.get('description'),
        price_cents: Math.round(Number(form.get('price')) * 100),
        alcohol: !!form.get('alcohol'),
      },
    });
  }, 'Dish added');
  if (!ok) return;
  addOpen = false;
  openDishes.add(created.id);
  await reload();
  render();
  app.querySelector(`[data-dish="${created.id}"]`)?.scrollIntoView({ block: 'center' });
});

role = await requireStaff(app, { title: 'Menu and hours' });
await reload();
render();
