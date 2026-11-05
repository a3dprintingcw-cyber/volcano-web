// Manager dashboard: figures, orders, customers, menu, hours and settings. Manager PIN only.
import { api, esc, money, store } from '/shared.js';
import { requireStaff, signOut } from '/staff-login.js';
import { barChart, donut, funnel, lineChart, rankBars, sparkline, wireCharts } from '/charts.js';

const app = document.getElementById('app');
const TZ = 'America/Curacao';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COLORS = { sales: '#fdb429', orders: '#e2583c', visitors: '#f3dcc0', previous: '#7d6d60' };
const PALETTE = ['#fdb429', '#e2583c', '#f3dcc0', '#c77dff', '#5cc9b8', '#7aa2ff', '#ff9fb2', '#9c8a7a', '#b8d86b', '#ffcf8a', '#8a6cff', '#6b5d52'];

// ---------- icons ----------
const ICON = {
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  sales: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  visitors: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  orders: '<path d="M6 2h12l2 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/><path d="M4 6h16M9 11h6M9 15h6"/>',
  customers: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5"/>',
  menu: '<path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-2.5 1.5-4 4-4 8h4"/>',
  hours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  kitchen: '<path d="M3 11h18M5 11V7a7 7 0 0 1 14 0v4M4 15h16l-1 6H5z"/>',
  site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const SECTIONS = [
  { id: 'overview', label: 'Overview', group: 'Figures' },
  { id: 'sales', label: 'Sales', group: 'Figures' },
  { id: 'visitors', label: 'Visitors', group: 'Figures' },
  { id: 'orders', label: 'Orders', group: 'Figures' },
  { id: 'customers', label: 'Customers', group: 'Figures' },
  { id: 'menu', label: 'Menu', group: 'Manage' },
  { id: 'hours', label: 'Hours and ordering', group: 'Manage' },
  { id: 'settings', label: 'Settings', group: 'Manage' },
];
const RANGED = new Set(['overview', 'sales', 'visitors', 'orders', 'customers']);

// ---------- dates, on the restaurant's clock ----------
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmtDay = (iso, opts = { day: 'numeric', month: 'short' }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
const fmtTime = (sec) => new Date(sec * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const fmtStamp = (sec) => new Date(sec * 1000).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ });

const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastmonth', label: 'Last month' },
  { id: '12m', label: '12 months' },
];
function rangeFor(preset, custom = {}) {
  const t = todayIso();
  const monthStart = `${t.slice(0, 7)}-01`;
  switch (preset) {
    case 'today': return { from: t, to: t };
    case '30d': return { from: addDays(t, -29), to: t };
    case 'month': return { from: monthStart, to: t };
    case 'lastmonth': {
      const end = addDays(monthStart, -1);
      return { from: `${end.slice(0, 7)}-01`, to: end };
    }
    case '12m': return { from: addDays(t, -364), to: t };
    case 'custom': return { from: custom.from || addDays(t, -6), to: custom.to || t };
    default: return { from: addDays(t, -6), to: t };
  }
}

// ---------- numbers ----------
const num = (n) => Number(n || 0).toLocaleString('en-US');
const cash = (cents) => {
  const v = (cents || 0) / 100;
  return `XCG ${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: v >= 1000 || Number.isInteger(v) ? 0 : 2 })}`;
};
const cashAxis = (cents, axis) => {
  const v = (cents || 0) / 100;
  if (!axis) return cash(cents);
  return v >= 1000 ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : `${Math.round(v)}`;
};
const pct = (v) => `${(v || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
function change(now, before) {
  if (!before && !now) return { text: 'No change', cls: '' };
  if (!before) return { text: 'New', cls: 'is-up' };
  const p = ((now - before) / before) * 100;
  if (Math.abs(p) < 0.5) return { text: 'Same as before', cls: '' };
  return { text: `${p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(p > -10 && p < 10 ? 1 : 0)}%`, cls: p > 0 ? 'is-up' : 'is-down' };
}

// ---------- state ----------
const saved = store.get('volcano_dash_v1', {});
const state = {
  section: SECTIONS.some((s) => s.id === location.hash.slice(1)) ? location.hash.slice(1) : 'overview',
  preset: saved.preset || '7d',
  custom: saved.custom || {},
  chartMetric: 'sales',
  stats: null,
  statsKey: '',
  loading: false,
  menu: null, // settings, menu, report_ready
  printer: null,
  kitchen: null,
  orders: { q: '', status: '', list: [], total: 0, total_cents: 0, key: '', open: null },
  customers: null,
  customersKey: '',
  customersAll: false,
  menuFilter: 'all',
  menuSearch: '',
  openDishes: new Set(),
  addOpen: false,
  confirmReset: false,
};
const range = () => rangeFor(state.preset, state.custom);
const rangeKey = () => {
  const r = range();
  return `${r.from}_${r.to}`;
};
const rangeLabel = () => {
  const r = range();
  if (r.from === r.to) return fmtDay(r.from, { weekday: 'long', day: 'numeric', month: 'long' });
  return `${fmtDay(r.from)} to ${fmtDay(r.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
};
const chartWidth = () => {
  const main = app.querySelector('.main');
  const w = main ? main.clientWidth : window.innerWidth;
  return Math.max(300, Math.min(1400, Math.round(w - 80)));
};

let toastTimer;
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
async function save(run, message = 'Saved') {
  try {
    await run();
    toast(message);
    return true;
  } catch (err) {
    if (err.status === 401 || err.status === 403) return location.reload();
    toast(err.message, true);
    return false;
  }
}

// ---------- loading ----------
async function loadBase() {
  const [menu, printer, kitchen] = await Promise.all([
    api('/api/staff/menu'),
    api('/api/admin/printer').catch(() => null),
    api('/api/staff/orders').catch(() => null),
  ]);
  // The manager sign-in lasts a few hours. Once it ends, ask for the manager PIN again.
  if (menu.role !== 'admin') return location.reload();
  state.menu = menu;
  state.printer = printer;
  state.kitchen = kitchen;
}
async function loadStats(force = false) {
  const key = rangeKey();
  if (!force && state.stats && state.statsKey === key) return;
  const r = range();
  state.loading = true;
  render();
  try {
    state.stats = await api(`/api/admin/stats?from=${r.from}&to=${r.to}`);
    state.statsKey = key;
  } catch (err) {
    if (err.status === 401 || err.status === 403) return location.reload();
    toast(err.message, true);
  }
  state.loading = false;
}
async function loadOrders(more = false) {
  const r = range();
  const o = state.orders;
  const key = `${rangeKey()}|${o.q}|${o.status}`;
  if (!more && o.key === key) return;
  const offset = more ? o.list.length : 0;
  const data = await api(`/api/admin/orders?from=${r.from}&to=${r.to}&q=${encodeURIComponent(o.q)}&status=${o.status}&offset=${offset}&limit=50`);
  o.list = more ? [...o.list, ...data.orders] : data.orders;
  o.total = data.total;
  o.total_cents = data.total_cents;
  o.key = key;
}
async function loadCustomers() {
  const key = rangeKey();
  if (state.customers && state.customersKey === key) return;
  const r = range();
  state.customers = (await api(`/api/admin/customers?from=${r.from}&to=${r.to}`)).customers;
  state.customersKey = key;
}
async function loadSection(force = false) {
  try {
    if (['overview', 'sales', 'visitors', 'customers'].includes(state.section)) await loadStats(force);
    if (state.section === 'orders') await loadOrders();
    if (state.section === 'customers') await loadCustomers();
  } catch (err) {
    if (err.status === 401 || err.status === 403) return location.reload();
    toast(err.message, true);
  }
  render();
}

// ---------- frame ----------
function render() {
  const scrollY = window.scrollY;
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  app.innerHTML = `<div class="shell">
    <aside class="side">
      <a class="brand" href="#overview" data-go="overview"><img src="/img/icon-180.png" alt=""><span><b>Volcano</b><small>Manager</small></span></a>
      <nav class="nav" aria-label="Sections">
        ${groups
          .map(
            (g) => `<div class="nav-label">${g}</div>${SECTIONS.filter((s) => s.group === g)
              .map((s) => `<a href="#${s.id}" data-go="${s.id}" class="${state.section === s.id ? 'is-active' : ''}" ${state.section === s.id ? 'aria-current="page"' : ''}>${icon(s.id)}${s.label}</a>`)
              .join('')}`
          )
          .join('')}
      </nav>
      <div class="side-foot">
        <a href="/kitchen/">${icon('kitchen')}<span>Kitchen board</span></a>
        <a href="/" target="_blank" rel="noopener">${icon('site')}<span>Website</span></a>
        <button type="button" data-signout>${icon('out')}<span>Sign out</span></button>
      </div>
    </aside>
    <main class="main">${section()}</main>
  </div>`;
  window.scrollTo(0, scrollY);
}

function head(title, intro = '') {
  const ranged = RANGED.has(state.section);
  return `<header class="head">
      <h1>${esc(title)}</h1>
      ${ranged ? rangePicker() : ''}
      <p>${ranged ? `${esc(rangeLabel())}${intro ? `. ${esc(intro)}` : ''}` : esc(intro)}</p>
    </header>
    ${state.loading ? '<div class="loading-bar" aria-hidden="true"></div>' : ''}`;
}
function rangePicker() {
  const r = range();
  return `<div class="range">
    <div class="seg" role="group" aria-label="Period">
      ${PRESETS.map((p) => `<button type="button" data-preset="${p.id}" class="${state.preset === p.id ? 'is-on' : ''}" aria-pressed="${state.preset === p.id}">${p.label}</button>`).join('')}
      <button type="button" data-preset="custom" class="${state.preset === 'custom' ? 'is-on' : ''}" aria-pressed="${state.preset === 'custom'}">Pick dates</button>
    </div>
    ${
      state.preset === 'custom'
        ? `<span class="custom"><input type="date" id="from" value="${r.from}" max="${todayIso()}" aria-label="From"> to <input type="date" id="to" value="${r.to}" max="${todayIso()}" aria-label="To"></span>`
        : ''
    }
    <button class="btn-s" type="button" data-refresh title="Refresh">${icon('refresh')}</button>
  </div>`;
}

function section() {
  switch (state.section) {
    case 'sales': return salesView();
    case 'visitors': return visitorsView();
    case 'orders': return ordersView();
    case 'customers': return customersView();
    case 'menu': return menuView();
    case 'hours': return hoursView();
    case 'settings': return settingsView();
    default: return overviewView();
  }
}

// ---------- shared pieces ----------
function kpi({ label, value, now, before, spark, main = false, color = COLORS.sales, invert = false }) {
  const c = before === undefined ? null : change(now, before);
  const cls = c && invert ? (c.cls === 'is-up' ? 'is-down' : c.cls === 'is-down' ? 'is-up' : '') : c?.cls;
  return `<div class="kpi ${main ? 'is-main' : ''}">
    <span class="kpi-label">${esc(label)}</span>
    <span class="kpi-value">${esc(value)}</span>
    ${c ? `<span class="kpi-change ${cls}">${esc(c.text)} <span>vs previous period</span></span>` : ''}
    ${spark ? sparkline(spark, color) : ''}
  </div>`;
}
const seriesLabels = (s) => s.series.map((p) => (s.range.bucket === 'month' ? fmtDay(p.day, { month: 'short' }) : fmtDay(p.day)));
const seriesTips = (s) =>
  s.series.map((p) => (s.range.bucket === 'month' ? fmtDay(p.day, { month: 'long', year: 'numeric' }) : fmtDay(p.day, { weekday: 'short', day: 'numeric', month: 'short' })));
const noStats = () => `${head('Loading')}<p class="muted">Loading the figures…</p>`;

function mainChart(s) {
  const metric = state.chartMetric;
  const pick = {
    sales: { label: 'Sales', key: 'sales_cents', fmt: cashAxis, color: COLORS.sales },
    orders: { label: 'Orders', key: 'orders', fmt: (v) => num(Math.round(v)), color: COLORS.orders },
    visitors: { label: 'Visitors', key: 'visitors', fmt: (v) => num(Math.round(v)), color: COLORS.visitors },
  }[metric];
  if (s.series.length < 2) {
    return `<p class="m-empty">Pick a longer period to see a line. For today: ${pick.label.toLowerCase()} ${pick.fmt(s.series[0]?.[pick.key] || 0)}.</p>`;
  }
  return `<div class="chart-key"><span><svg width="18" height="4"><rect width="18" height="4" rx="2" fill="${pick.color}"/></svg>${pick.label}</span></div>
    ${lineChart({
      id: 'main',
      width: chartWidth(),
      height: 280,
      labels: seriesLabels(s),
      tipLabels: seriesTips(s),
      format: pick.fmt,
      series: [{ label: pick.label, values: s.series.map((p) => p[pick.key]), color: pick.color, area: true }],
    })}`;
}

function liveStrip() {
  const k = state.kitchen;
  const settings = state.menu.settings;
  const a = k?.availability;
  const counts = { new: 0, preparing: 0, ready: 0 };
  for (const o of k?.orders || []) if (counts[o.status] !== undefined) counts[o.status] += 1;
  const p = state.printer;
  const seen = p?.last_seen ? Math.round((Date.now() - p.last_seen) / 60000) : null;
  const live = state.stats?.visitors.live ?? 0;
  return `<div class="live">
    <div class="live-item"><span class="dot ${settings.ordering_paused ? 'is-warn' : a?.can_order ? 'is-good' : 'is-bad'}"></span>
      <span><b>${settings.ordering_paused ? 'Online orders paused' : a?.can_order ? 'Taking orders now' : a?.open_now ? 'Open, last orders passed' : 'Closed now'}</b><small>${esc(a?.message || '')}</small></span>
      <button type="button" class="mini ${settings.ordering_paused ? 'is-warn' : ''}" data-quick-pause="${settings.ordering_paused ? '0' : '1'}">${settings.ordering_paused ? 'Resume' : 'Pause'}</button></div>
    <div class="live-item"><span class="dot ${counts.new ? 'is-warn' : 'is-good'}"></span>
      <span><b>${counts.new + counts.preparing + counts.ready} in the kitchen</b><small>${counts.new} new, ${counts.preparing} cooking, ${counts.ready} waiting for pickup</small></span></div>
    <div class="live-item"><span class="dot ${live ? 'is-good' : ''}"></span>
      <span><b>${num(live)} on the site</b><small>Visitors in the last 15 minutes</small></span></div>
    <div class="live-item"><span class="dot ${seen === null ? 'is-bad' : seen <= 2 ? 'is-good' : 'is-bad'}"></span>
      <span><b>${seen === null ? 'Printer not connected' : seen <= 2 ? 'Printer connected' : 'Printer offline'}</b><small>${seen === null ? 'See Settings' : seen <= 2 ? `Checked in ${seen <= 0 ? 'just now' : `${seen} min ago`}` : `Last seen ${fmtStamp(Math.round(p.last_seen / 1000))}. Is it on?`}</small></span></div>
  </div>`;
}

// ---------- overview ----------
function overviewView() {
  const s = state.stats;
  if (!s) return noStats();
  const t = s.totals;
  const p = s.previous;
  const top = s.top_items.slice(0, 6).map((i) => ({ label: i.name, value: i.quantity, sub: cash(i.sales_cents) }));
  const hours = s.hours.filter((h) => h.hour >= 15 || h.hour <= 2);
  const hourOrder = [...hours.filter((h) => h.hour >= 15), ...hours.filter((h) => h.hour <= 2)];
  return `${head('Overview', 'Compared with the same number of days just before')}
    ${liveStrip()}
    <div class="kpis">
      ${kpi({ label: 'Sales', value: cash(t.sales_cents), now: t.sales_cents, before: p.sales_cents, spark: s.series.map((x) => x.sales_cents), main: true })}
      ${kpi({ label: 'Orders', value: num(t.orders), now: t.orders, before: p.orders, spark: s.series.map((x) => x.orders), color: COLORS.orders })}
      ${kpi({ label: 'Average order', value: cash(t.average_cents), now: t.average_cents, before: p.average_cents })}
      ${kpi({ label: 'Visitors', value: num(t.visitors), now: t.visitors, before: p.visitors, spark: s.series.map((x) => x.visitors), color: COLORS.visitors })}
      ${kpi({ label: 'Visitors who ordered', value: pct(t.conversion), now: t.conversion, before: p.conversion })}
    </div>
    <div class="grid">
      <section class="card-p">
        <h2>${state.chartMetric === 'sales' ? 'Sales' : state.chartMetric === 'orders' ? 'Orders' : 'Visitors'} over time
          <span class="seg" role="group" aria-label="Show">${['sales', 'orders', 'visitors']
            .map((m) => `<button type="button" data-metric="${m}" class="${state.chartMetric === m ? 'is-on' : ''}">${m[0].toUpperCase()}${m.slice(1)}</button>`)
            .join('')}</span></h2>
        <p class="sub">${s.range.bucket === 'month' ? 'Per month' : 'Per day'}. Touch or point at the line to see each ${s.range.bucket}.</p>
        ${mainChart(s)}
      </section>
    </div>
    <div class="grid grid-3">
      <section class="card-p"><h2>Best sellers</h2><p class="sub">Times sold</p>
        ${rankBars({ rows: top, format: num, empty: 'Nothing sold in this period.' })}</section>
      <section class="card-p"><h2>Busiest hours</h2><p class="sub">Orders placed per hour</p>
        ${barChart({ width: 460, height: 230, values: hourOrder.map((h) => h.orders), labels: hourOrder.map((h) => (h.hour % 12 || 12) + (h.hour < 12 ? 'a' : 'p')), format: num })}</section>
      <section class="card-p"><h2>How people pay</h2><p class="sub">Share of sales</p>${paymentDonut(t)}</section>
    </div>
    <div class="grid grid-2">
      <section class="card-p"><h2>From visit to order</h2><p class="sub">How many visitors take each step</p>${funnelBlock(s)}</section>
      <section class="card-p"><h2>Where visitors come from</h2><p class="sub">Visitors per source</p>
        ${rankBars({ rows: s.visitors.sources.slice(0, 6).map((x) => ({ label: x.name, value: x.visitors })), format: num, color: COLORS.visitors, empty: 'No visits counted yet. Counting started with this dashboard.' })}</section>
    </div>`;
}
function paymentDonut(t) {
  return donut({
    parts: [
      { label: 'Card', value: t.card_cents, color: '#fdb429' },
      { label: 'Cash', value: t.cash_cents, color: '#e2583c' },
      { label: 'Online', value: t.online_cents, color: '#5cc9b8' },
      { label: 'Not recorded', value: t.unrecorded_cents, color: '#6b5d52' },
    ],
    format: cash,
    center: num(t.orders),
    centerLabel: 'orders',
  });
}
function funnelBlock(s) {
  const f = s.visitors.funnel;
  return funnel([
    { label: 'Visited the site', value: f.visitors, color: COLORS.visitors },
    { label: 'Opened a dish', value: f.opened_dish, color: '#ffcf8a' },
    { label: 'Opened their order', value: f.opened_order, color: COLORS.sales },
    { label: 'Placed the order', value: f.ordered, color: COLORS.orders },
  ]);
}

// ---------- sales ----------
function salesView() {
  const s = state.stats;
  if (!s) return noStats();
  const t = s.totals;
  const p = s.previous;
  const w = chartWidth();
  const days = s.series.length;
  const totalCat = s.categories.reduce((n, c) => n + c.sales_cents, 0);
  const weekOrder = [2, 3, 4, 5, 6, 0, 1];
  return `${head('Sales', 'Cancelled orders and unpaid online orders are not counted')}
    <div class="kpis">
      ${kpi({ label: 'Sales', value: cash(t.sales_cents), now: t.sales_cents, before: p.sales_cents, main: true })}
      ${kpi({ label: 'Orders', value: num(t.orders), now: t.orders, before: p.orders })}
      ${kpi({ label: 'Average order', value: cash(t.average_cents), now: t.average_cents, before: p.average_cents })}
      ${kpi({ label: 'Items sold', value: num(t.items_sold) })}
      ${kpi({ label: 'Average per day', value: cash(Math.round(t.sales_cents / Math.max(1, days))) })}
    </div>
    <div class="grid">
      <section class="card-p"><h2>Sales and orders
        <button class="btn-s" type="button" data-export="days">${icon('download')} Download figures</button></h2>
        <p class="sub">${s.range.bucket === 'month' ? 'Per month' : 'Per day'}</p>
        ${
          s.series.length < 2
            ? `<p class="m-empty">Pick a longer period to see a line.</p>`
            : `<div class="chart-key"><span><svg width="18" height="4"><rect width="18" height="4" rx="2" fill="${COLORS.sales}"/></svg>Sales</span></div>
              ${lineChart({ id: 'sales', width: w, height: 260, labels: seriesLabels(s), tipLabels: seriesTips(s), format: cashAxis, series: [{ label: 'Sales', values: s.series.map((x) => x.sales_cents), color: COLORS.sales, area: true }] })}
              <div class="chart-key"><span><svg width="18" height="4"><rect width="18" height="4" rx="2" fill="${COLORS.orders}"/></svg>Orders</span></div>
              ${lineChart({ id: 'orders', width: w, height: 170, labels: seriesLabels(s), tipLabels: seriesTips(s), format: (v) => num(Math.round(v)), series: [{ label: 'Orders', values: s.series.map((x) => x.orders), color: COLORS.orders, area: true }] })}`
        }
      </section>
    </div>
    <div class="grid grid-2">
      <section class="card-p"><h2>Best days of the week</h2><p class="sub">Sales per weekday</p>
        ${barChart({ width: Math.min(w, 640), height: 230, values: weekOrder.map((d) => s.weekdays[d].sales_cents), labels: weekOrder.map((d) => SHORT_DAYS[d]), format: (v) => cashAxis(v, true) })}</section>
      <section class="card-p"><h2>Orders per hour</h2><p class="sub">When orders come in</p>
        ${barChart({ width: Math.min(w, 640), height: 230, values: s.hours.filter((h) => h.hour >= 16 || h.hour <= 1).sort((a, b) => ((a.hour + 8) % 24) - ((b.hour + 8) % 24)).map((h) => h.orders), labels: s.hours.filter((h) => h.hour >= 16 || h.hour <= 1).sort((a, b) => ((a.hour + 8) % 24) - ((b.hour + 8) % 24)).map((h) => (h.hour % 12 || 12) + (h.hour < 12 ? 'am' : 'pm')), format: num })}</section>
    </div>
    <div class="grid grid-21">
      <section class="card-p"><h2>Dishes</h2><p class="sub">Every dish sold in this period</p>
        ${
          s.top_items.length
            ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Dish</th><th class="num">Sold</th><th class="num">Sales</th><th class="num">Share</th></tr></thead><tbody>
              ${s.top_items.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${num(i.quantity)}</td><td class="num">${cash(i.sales_cents)}</td><td class="num">${pct(t.sales_cents ? (i.sales_cents / t.sales_cents) * 100 : 0)}</td></tr>`).join('')}
            </tbody></table></div>`
            : '<p class="m-empty">Nothing sold in this period.</p>'
        }</section>
      <section class="card-p"><h2>Menu sections</h2><p class="sub">Share of sales</p>
        ${donut({ parts: s.categories.map((c, i) => ({ label: c.name, value: c.sales_cents, color: PALETTE[i % PALETTE.length] })), format: cash, center: totalCat ? cash(totalCat).replace('XCG ', '') : '0', centerLabel: 'XCG' })}
        <h3>Most chosen extras and changes</h3>
        ${rankBars({ rows: s.options.slice(0, 8).map((o) => ({ label: o.name, value: o.quantity })), format: num, color: '#c77dff', empty: 'No extras chosen yet.' })}</section>
    </div>
    <div class="grid grid-2">
      <section class="card-p"><h2>How people pay</h2><p class="sub">Card and cash are set at pickup on the kitchen board</p>${paymentDonut(t)}</section>
      <section class="card-p"><h2>Service</h2><p class="sub">Pickup and cancellations</p>
        <div class="facts">
          <div class="fact"><b>${num(t.asap)}</b><small>As soon as possible</small></div>
          <div class="fact"><b>${num(t.scheduled)}</b><small>For a set time</small></div>
          <div class="fact"><b>${t.avg_done_minutes ? `${t.avg_done_minutes} min` : '-'}</b><small>Order to picked up, on average</small></div>
          <div class="fact"><b>${num(t.cancelled)}</b><small>Cancelled (${pct(t.cancel_rate)}), ${num(t.cancelled_by_customer)} by the customer</small></div>
          <div class="fact"><b>${cash(t.cancelled_cents)}</b><small>Value of cancelled orders</small></div>
          <div class="fact"><b>${cash(t.paid_cents)}</b><small>Marked paid</small></div>
        </div></section>
    </div>`;
}

// ---------- visitors ----------
function visitorsView() {
  const s = state.stats;
  if (!s) return noStats();
  const t = s.totals;
  const p = s.previous;
  const v = s.visitors;
  const pagesPer = t.visitors ? (t.views / t.visitors).toFixed(1) : '0';
  return `${head('Visitors', 'Counted without cookies; each phone counts once per day')}
    <div class="kpis">
      ${kpi({ label: 'Visitors', value: num(t.visitors), now: t.visitors, before: p.visitors, main: true, spark: s.series.map((x) => x.visitors), color: COLORS.visitors })}
      ${kpi({ label: 'Page views', value: num(t.views), now: t.views, before: p.views })}
      ${kpi({ label: 'Visitors who ordered', value: pct(t.conversion), now: t.conversion, before: p.conversion })}
      ${kpi({ label: 'Views per visitor', value: pagesPer })}
      ${kpi({ label: 'On the site now', value: num(v.live) })}
    </div>
    <div class="grid">
      <section class="card-p"><h2>Visitors and orders</h2><p class="sub">${s.range.bucket === 'month' ? 'Per month' : 'Per day'}</p>
        ${
          s.series.length < 2
            ? '<p class="m-empty">Pick a longer period to see a line.</p>'
            : `<div class="chart-key"><span><svg width="18" height="4"><rect width="18" height="4" rx="2" fill="${COLORS.visitors}"/></svg>Visitors</span><span><svg width="18" height="4"><rect width="18" height="4" rx="2" fill="${COLORS.orders}"/></svg>Orders</span></div>
            ${lineChart({ id: 'visits', width: chartWidth(), height: 280, labels: seriesLabels(s), tipLabels: seriesTips(s), format: (x) => num(Math.round(x)), series: [{ label: 'Visitors', values: s.series.map((x) => x.visitors), color: COLORS.visitors, area: true }, { label: 'Orders', values: s.series.map((x) => x.orders), color: COLORS.orders }] })}`
        }
      </section>
    </div>
    <div class="grid grid-2">
      <section class="card-p"><h2>From visit to order</h2><p class="sub">Where people drop off</p>${funnelBlock(s)}</section>
      <section class="card-p"><h2>Where visitors come from</h2><p class="sub">Visitors per source</p>
        ${rankBars({ rows: v.sources.map((x) => ({ label: x.name, value: x.visitors })), format: num, color: COLORS.visitors, empty: 'No visits counted yet.' })}</section>
    </div>
    <div class="grid grid-3">
      <section class="card-p"><h2>Devices</h2><p class="sub">What visitors use</p>
        ${donut({ parts: v.devices.map((d, i) => ({ label: d.name, value: d.visitors, color: PALETTE[i] })), format: num, center: num(t.visitors), centerLabel: 'visitors' })}</section>
      <section class="card-p"><h2>Language</h2><p class="sub">English or Papiamentu</p>
        ${donut({ parts: v.languages.map((d, i) => ({ label: d.name, value: d.visitors, color: [COLORS.sales, COLORS.orders][i] || PALETTE[i] })), format: num, center: num(t.visitors), centerLabel: 'visitors' })}</section>
      <section class="card-p"><h2>Track your links</h2><p class="sub">Know which post or card brings people in</p>
        <div class="tip-box">Add a tag to the links you share. The visit is then counted under that name:
          <ul>
            <li>Instagram bio: <code>volcanostreetfood.com/?src=insta</code></li>
            <li>Facebook: <code>volcanostreetfood.com/?src=fb</code></li>
            <li>QR code on flyers: <code>volcanostreetfood.com/?src=qr</code></li>
            <li>TikTok: <code>volcanostreetfood.com/?src=tiktok</code></li>
          </ul></div></section>
    </div>`;
}

// ---------- orders ----------
const STATUS_LABEL = { new: 'New', preparing: 'Cooking', ready: 'Ready', done: 'Picked up', cancelled: 'Cancelled' };
const payLabel = (o) =>
  o.payment_method === 'sentoo' ? (o.payment_status === 'paid' ? 'Paid online' : 'Online, not paid') : o.payment_method === 'cash' ? 'Cash' : o.payment_method === 'card' ? 'Card' : 'Not recorded';
function ordersView() {
  const o = state.orders;
  const filters = [
    ['', 'All'],
    ['open', 'In the kitchen'],
    ['done', 'Picked up'],
    ['cancelled', 'Cancelled'],
  ];
  return `${head('Orders', 'Every order, newest first')}
    <section class="card-p">
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" id="order-q" value="${esc(o.q)}" placeholder="Search name, phone or order number" autocomplete="off"></label>
        <div class="seg" role="group" aria-label="Status">${filters.map(([v, l]) => `<button type="button" data-ostatus="${v}" class="${o.status === v ? 'is-on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn-s" type="button" data-export="orders">${icon('download')} Download</button>
      </div>
      <p class="sub">${num(o.total)} ${o.total === 1 ? 'order' : 'orders'}, ${cash(o.total_cents)} in sales (cancelled not counted)</p>
      ${
        o.list.length
          ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Placed</th><th>Customer</th><th class="hide-m">Items</th><th class="num">Total</th><th class="hide-m">Payment</th><th>Status</th></tr></thead><tbody>
            ${o.list
              .map((x) => {
                const open = o.open === x.id;
                return `<tr class="is-click ${open ? 'is-open' : ''}" data-order="${x.id}">
                  <td><b>${x.number}</b></td>
                  <td>${esc(fmtDay(x.service_day, { weekday: 'short', day: 'numeric', month: 'short' }))}<br><small class="muted">${fmtTime(x.created_at)}</small></td>
                  <td>${esc(x.customer_name)}<br><small class="muted">${esc(x.phone)}</small></td>
                  <td class="hide-m">${x.items.reduce((n, l) => n + l.quantity, 0)} ${x.items.length === 1 ? esc(x.items[0].name) : 'items'}</td>
                  <td class="num">${cash(x.total_cents)}</td>
                  <td class="hide-m">${payLabel(x)}</td>
                  <td><span class="m-badge ${x.status}">${STATUS_LABEL[x.status] || x.status}</span></td>
                </tr>
                ${open ? `<tr><td colspan="7" class="detail">${orderDetail(x)}</td></tr>` : ''}`;
              })
              .join('')}
          </tbody></table></div>
          ${o.list.length < o.total ? `<div class="more"><button class="btn-s" type="button" data-more>Show more (${num(o.total - o.list.length)} left)</button></div>` : ''}`
          : '<p class="m-empty">No orders match.</p>'
      }
    </section>`;
}
function orderDetail(x) {
  return `<ul class="m-lines">${x.items
    .map(
      (l) => `<li>${l.quantity} × <b>${esc(l.name)}</b> <span class="muted">${cash(l.unit_price_cents * l.quantity)}</span>
      ${l.options.length ? `<br><small>${esc(l.options.join(', '))}</small>` : ''}${l.note ? `<br><small>Note: ${esc(l.note)}</small>` : ''}</li>`
    )
    .join('')}</ul>
    ${x.notes ? `<p><b>Kitchen note:</b> ${esc(x.notes)}</p>` : ''}
    <p class="muted">Pickup ${x.pickup_type === 'scheduled' ? 'at' : 'as soon as possible, about'} ${fmtTime(x.pickup_at)}.
      ${x.status === 'cancelled' ? `Cancelled${x.cancelled_by === 'customer' ? ' by the customer' : ''}.` : ''}
      <a href="tel:${esc(x.phone)}">Call ${esc(x.customer_name)}</a></p>
    <div class="toolbar"><button class="btn-s" type="button" data-reprint="${x.id}" data-kind="receipt">${icon('print')} Print receipt</button>
      <button class="btn-s" type="button" data-reprint="${x.id}" data-kind="ticket">${icon('print')} Print kitchen ticket</button></div>`;
}

// ---------- customers ----------
function customersView() {
  const s = state.stats;
  const list = state.customers;
  if (!s || !list) return noStats();
  const t = s.totals;
  const repeat = list.filter((c) => c.lifetime_orders > 1).length;
  return `${head('Customers', 'Recognised by phone number')}
    <div class="kpis">
      ${kpi({ label: 'Customers', value: num(t.customers), main: true })}
      ${kpi({ label: 'New customers', value: num(t.new_customers) })}
      ${kpi({ label: 'Came back', value: num(t.returning_customers) })}
      ${kpi({ label: 'Ordered more than once, ever', value: pct(list.length ? (repeat / list.length) * 100 : 0) })}
      ${kpi({ label: 'Spent per customer', value: cash(t.customers ? Math.round(t.sales_cents / t.customers) : 0) })}
    </div>
    <div class="grid grid-21">
      <section class="card-p"><h2>Best customers
        <button class="btn-s" type="button" data-export="customers">${icon('download')} Download</button></h2>
        <p class="sub">In this period, by amount spent</p>
        ${
          list.length
            ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Customer</th><th class="num">Orders</th><th class="num">Spent</th><th class="num">All time</th><th>Last order</th></tr></thead><tbody>
              ${(state.customersAll ? list : list.slice(0, 25))
                .map(
                  (c) => `<tr><td><b>${esc(c.name)}</b><br><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td>
                  <td class="num">${num(c.orders)}</td><td class="num">${cash(c.sales_cents)}</td>
                  <td class="num">${num(c.lifetime_orders)} orders<br><small class="muted">${cash(c.lifetime_cents)}</small></td>
                  <td>${fmtStamp(c.last_at)}${c.first_at >= Date.parse(`${range().from}T00:00:00Z`) / 1000 ? ' <span class="m-badge new">New</span>' : ''}</td></tr>`
                )
                .join('')}
            </tbody></table></div>
            ${!state.customersAll && list.length > 25 ? `<div class="more"><button class="btn-s" type="button" data-all-customers>Show all ${num(list.length)}</button></div>` : ''}`
            : '<p class="m-empty">No customers in this period.</p>'
        }</section>
      <section class="card-p"><h2>New and returning</h2><p class="sub">Customers in this period</p>
        ${donut({ parts: [{ label: 'New', value: t.new_customers, color: COLORS.sales }, { label: 'Returning', value: t.returning_customers, color: COLORS.orders }], format: num, center: num(t.customers), centerLabel: 'customers' })}</section>
    </div>`;
}

// ---------- menu ----------
function menuView() {
  const { menu } = state.menu;
  const q = state.menuSearch.trim().toLowerCase();
  const cats = menu.filter((c) => state.menuFilter === 'all' || state.menuFilter === 'out' || String(c.id) === state.menuFilter);
  const allItems = menu.flatMap((c) => c.items).filter((i) => !i.archived);
  const outCount = allItems.filter((i) => !i.available || i.groups.some((g) => g.options.some((o) => !o.available))).length;
  return `${head('Menu', 'Prices, sold out, names, descriptions and photos. Changes are live straight away')}
    <div class="menu-tools">
      <label class="search">${icon('search')}<input type="search" id="menu-q" value="${esc(state.menuSearch)}" placeholder="Find a dish" autocomplete="off"></label>
      <button class="btn-s is-gold" type="button" data-add-toggle>${state.addOpen ? 'Close' : '+ Add a dish'}</button>
    </div>
    ${state.addOpen ? addDishForm() : ''}
    <div class="chips">
      <button type="button" class="chip ${state.menuFilter === 'all' ? 'is-on' : ''}" data-mfilter="all">All<em>${allItems.length}</em></button>
      <button type="button" class="chip ${state.menuFilter === 'out' ? 'is-on' : ''}" data-mfilter="out">Sold out<em>${outCount}</em></button>
      ${menu.map((c) => `<button type="button" class="chip ${state.menuFilter === String(c.id) ? 'is-on' : ''}" data-mfilter="${c.id}">${esc(c.name)}<em>${c.items.filter((i) => !i.archived).length}</em></button>`).join('')}
    </div>
    ${cats
      .map((cat) => {
        const items = cat.items.filter((i) => {
          if (q && !i.name.toLowerCase().includes(q)) return false;
          if (state.menuFilter === 'out') return !i.archived && (!i.available || i.groups.some((g) => g.options.some((o) => !o.available)));
          return true;
        });
        if (!items.length) return '';
        return `<section class="card-p"><h2>${esc(cat.name)}</h2><p class="sub">${items.length} ${items.length === 1 ? 'dish' : 'dishes'}</p>
          <div class="dish-list">${items.map(dishCard).join('')}</div></section>`;
      })
      .join('')}`;
}
function dishCard(item) {
  if (item.archived) {
    return `<div class="dish is-archived"><div class="dish-row">
      <span class="dish-thumb">Hidden</span><span class="dish-name">${esc(item.name)}<small>Removed from the menu</small></span>
      <span></span><button class="btn-s" type="button" data-restore="${item.id}">Put back</button></div></div>`;
  }
  const fixedPrice = !(item.price_cents === 0 && item.groups.some((g) => g.min > 0));
  return `<div class="dish ${item.available ? '' : 'is-out'}" data-dish="${item.id}">
    <div class="dish-row">
      ${item.photo ? `<img class="dish-thumb" src="${esc(item.photo.small)}" alt="" loading="lazy">` : '<span class="dish-thumb">No photo</span>'}
      <span class="dish-name">${esc(item.name)}<small>${esc(item.description || '')}</small></span>
      <span class="dish-price">${fixedPrice ? `XCG <input type="number" min="0" max="1000" step="0.5" inputmode="decimal" value="${item.price_cents / 100}" data-price="items" data-id="${item.id}" aria-label="Price of ${esc(item.name)} in guilders">` : 'Priced by size'}</span>
      <label class="toggle"><input type="checkbox" data-available="items" data-id="${item.id}" ${item.available ? 'checked' : ''}><span><small>${item.available ? 'On the menu' : 'Sold out'}</small></span></label>
    </div>
    <details class="dish-more" data-dish-more="${item.id}" ${state.openDishes.has(item.id) ? 'open' : ''}>
      <summary>Edit${item.groups.length ? ', choices' : ''} and photo</summary>
      <div class="form">
        <label class="m-field">Name <input type="text" data-field="name" maxlength="60" value="${esc(item.name)}"></label>
        <label class="m-field">Description <input type="text" data-field="description" maxlength="200" value="${esc(item.description || '')}"></label>
        <div class="dish-photo">
          ${item.photo ? `<img src="${esc(item.photo.small)}" alt="">` : ''}
          <label class="btn-s">${item.photo ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" data-photo hidden></label>
          ${item.photo ? '<button class="btn-s" type="button" data-nophoto>Remove photo</button>' : ''}
          <button class="btn-s is-danger" type="button" data-archive>Remove from menu</button>
        </div>
        ${
          item.groups.length
            ? `<div class="opts">${item.groups
                .map(
                  (g) => `<h4>${esc(g.name)}</h4>${g.options
                    .map(
                      (o) => `<div class="opt-row"><span>${esc(o.name)}</span>
                      <span class="dish-price">+ <input type="number" min="0" max="1000" step="0.5" inputmode="decimal" value="${o.price_cents / 100}" data-price="options" data-id="${o.id}" aria-label="Extra price of ${esc(o.name)}"></span>
                      <label class="toggle"><input type="checkbox" data-available="options" data-id="${o.id}" ${o.available ? 'checked' : ''}><span><small>${o.available ? 'Available' : 'Sold out'}</small></span></label></div>`
                    )
                    .join('')}`
                )
                .join('')}</div>`
            : ''
        }
      </div>
    </details>
  </div>`;
}
function addDishForm() {
  return `<section class="card-p"><h2>Add a dish</h2><p class="sub">You can add a photo after the dish is saved.</p>
    <form class="form" id="add-dish">
      <label class="m-field">Menu section <select name="category_id" required>${state.menu.menu.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label class="m-field">Name <input type="text" name="name" maxlength="60" required></label>
      <label class="m-field">Description <input type="text" name="description" maxlength="200"></label>
      <label class="m-field">Price in guilders <input type="number" name="price" min="1" max="1000" step="0.5" inputmode="decimal" required></label>
      <label class="toggle"><input type="checkbox" name="alcohol"><span><b>Contains alcohol</b><small>Customers confirm they are 18 or older</small></span></label>
      <div><button class="btn-s is-gold" type="submit">Add dish</button></div>
    </form></section>`;
}

// ---------- hours and ordering ----------
const toTime = (minutes) => `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const fromTime = (value, isClose) => {
  const [h, m] = value.split(':').map(Number);
  const minutes = h * 60 + m;
  return isClose && minutes === 0 ? 1440 : minutes;
};
function hoursView() {
  const s = state.menu.settings;
  return `${head('Hours and ordering', 'What customers can do on the website, and when')}
    <div class="grid grid-2">
      <section class="card-p"><h2>Right now</h2><p class="sub">Switches for tonight</p>
        <label class="toggle"><input type="checkbox" id="paused" ${s.ordering_paused ? 'checked' : ''}><span><b>Pause online orders</b><small>Customers see the message below until you switch it back</small></span></label>
        <label class="toggle"><input type="checkbox" id="closed_today" ${s.closed_today ? 'checked' : ''}><span><b>Closed today</b><small>Holiday or private event. Opens again by itself tomorrow</small></span></label>
        <label class="toggle"><input type="checkbox" id="busy_today" ${s.busy ? 'checked' : ''}><span><b>Busy today</b><small>Adds 15 minutes to the wait customers are told, until midnight</small></span></label>
      </section>
      <section class="card-p"><h2>Ordering rules</h2><p class="sub">Saved when you leave a field</p>
        <div class="form">
          <label class="m-field">Minutes to prepare an order <input type="number" id="prep_minutes" min="5" max="120" value="${s.prep_base ?? s.prep_minutes}"></label>
          <label class="m-field">Stop taking orders this many minutes before closing <input type="number" id="last_order" min="0" max="120" value="${s.last_order_minutes_before_close}"></label>
          <label class="m-field">Message while orders are paused <input type="text" id="paused_message" maxlength="160" value="${esc(s.paused_message || '')}" placeholder="Online ordering is paused right now. Please check back soon."></label>
          <label class="m-field">Phone number on the website <input type="text" id="phone" maxlength="30" value="${esc(s.phone || '')}"></label>
        </div>
      </section>
    </div>
    <section class="card-p"><h2>Opening hours</h2><p class="sub">Curaçao time. Closing can be midnight at the latest</p>
      <div class="m-hours">${DAYS.map((name, day) => {
        const h = s.hours[day];
        return `<div class="hours-row" data-day="${day}">
          <b>${name}</b>
          <label class="toggle"><input type="checkbox" data-open ${h ? 'checked' : ''}><span><small>${h ? 'Open' : 'Closed'}</small></span></label>
          <span class="hours-times"><input type="time" data-from value="${toTime(h ? h.open : 1080)}" aria-label="${name} opening time" ${h ? '' : 'disabled'}> to
            <input type="time" data-to value="${toTime(h ? h.close : 1440)}" aria-label="${name} closing time" ${h ? '' : 'disabled'}></span>
        </div>`;
      }).join('')}</div>
    </section>`;
}

// ---------- settings ----------
function settingsView() {
  const s = state.menu.settings;
  const p = state.printer;
  const seen = p?.last_seen ? new Date(p.last_seen) : null;
  const ago = seen ? Math.round((Date.now() - seen) / 60000) : null;
  return `${head('Settings', 'Printer, reports and figures')}
    <div class="grid grid-2">
      <section class="card-p"><h2>Kitchen printer</h2><p class="sub">The Star printer prints every website order by itself: a kitchen ticket, then the customer receipt</p>
        ${
          p
            ? `<div class="form"><label class="m-field">Printer link <small>In the printer's settings, switch on CloudPRNT and paste this as the server URL. Keep it private.</small>
                <input type="text" readonly value="${esc(p.url)}" data-select></label>
              <p><b>${!seen ? 'Not connected yet.' : ago <= 2 ? `Connected, last checked in at ${seen.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}.` : `Not heard from since ${fmtStamp(Math.round(p.last_seen / 1000))}. Is the printer on?`}</b>
                ${p.last_status ? ` Printer says: ${esc(p.last_status)}.` : ''} Tickets printed: ${num(p.printed)}.</p></div>`
            : '<p class="m-empty">Printer status could not be loaded.</p>'
        }
      </section>
      <section class="card-p"><h2>Day report by email</h2><p class="sub">After closing, the day's figures are emailed to the owners</p>
        <div class="form">
          <label class="m-field">Send the report to <small>Up to three addresses, with a comma between them. Leave empty to switch it off.</small>
            <input type="text" id="report_email" maxlength="320" inputmode="email" autocomplete="off" value="${esc(s.report_email || '')}" placeholder="owner@example.com"></label>
          ${
            state.menu.report_ready
              ? `<div><button class="btn-s" type="button" data-report-send ${s.report_email ? '' : 'disabled'}>Send today's report now</button></div>`
              : '<p class="muted">Email sending is not connected yet. The address is saved, and reports start by themselves once it is.</p>'
          }
          <details class="dish-more" id="report-preview"><summary>See what tonight's email will say</summary><pre class="report">Loading…</pre></details>
        </div>
      </section>
    </div>
    <div class="grid grid-2">
      <section class="card-p"><h2>Sales figures</h2><p class="sub">For after testing: orders made before now stop counting. Nothing is deleted.</p>
        <button class="btn-s ${state.confirmReset ? 'is-danger' : ''}" type="button" data-sales-reset>${state.confirmReset ? 'Tap again: figures start from zero now' : 'Start the sales figures fresh'}</button>
      </section>
      <section class="card-p"><h2>Sign-in</h2><p class="sub">This page needs the manager PIN and signs you out after 4 hours. The kitchen board has its own PIN.</p>
        <button class="btn-s" type="button" data-signout>${icon('out')} Sign out of the manager page</button>
      </section>
    </div>`;
}

// ---------- downloads ----------
function download(name, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function exportData(kind) {
  const r = range();
  const tag = `${r.from}_to_${r.to}`;
  if (kind === 'days' && state.stats) {
    download(`volcano-sales-${tag}.csv`, [
      [state.stats.range.bucket === 'month' ? 'Month' : 'Day', 'Orders', 'Sales (XCG)', 'Visitors'],
      ...state.stats.series.map((p) => [state.stats.range.bucket === 'month' ? p.day.slice(0, 7) : p.day, p.orders, (p.sales_cents / 100).toFixed(2), p.visitors]),
    ]);
  }
  if (kind === 'orders') {
    toast('Preparing the download…');
    const o = state.orders;
    const data = await api(`/api/admin/orders?from=${r.from}&to=${r.to}&q=${encodeURIComponent(o.q)}&status=${o.status}&limit=2000`);
    download(`volcano-orders-${tag}.csv`, [
      ['Day', 'Time', 'Order', 'Name', 'Phone', 'Items', 'Total (XCG)', 'Payment', 'Status'],
      ...data.orders.map((x) => [
        x.service_day,
        fmtTime(x.created_at),
        x.number,
        x.customer_name,
        x.phone,
        x.items.map((l) => `${l.quantity} x ${l.name}${l.options.length ? ` (${l.options.join(', ')})` : ''}`).join('; '),
        (x.total_cents / 100).toFixed(2),
        payLabel(x),
        STATUS_LABEL[x.status] || x.status,
      ]),
    ]);
  }
  if (kind === 'customers' && state.customers) {
    download(`volcano-customers-${tag}.csv`, [
      ['Name', 'Phone', 'Orders in period', 'Spent in period (XCG)', 'Orders all time', 'Spent all time (XCG)', 'Last order'],
      ...state.customers.map((c) => [c.name, c.phone, c.orders, (c.sales_cents / 100).toFixed(2), c.lifetime_orders, (c.lifetime_cents / 100).toFixed(2), fmtStamp(c.last_at)]),
    ]);
  }
}

// ---------- photos ----------
async function squareJpeg(file, size, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(size, side);
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}
async function reloadMenu() {
  state.menu = await api('/api/staff/menu');
  if (state.menu.role !== 'admin') return location.reload();
  render();
}
function collectHours() {
  const hours = {};
  for (const row of app.querySelectorAll('[data-day]')) {
    const open = row.querySelector('[data-open]').checked;
    hours[row.dataset.day] = open ? { open: fromTime(row.querySelector('[data-from]').value, false), close: fromTime(row.querySelector('[data-to]').value, true) } : null;
  }
  return hours;
}

// ---------- events ----------
function go(id) {
  if (state.section === id) return;
  state.section = id;
  history.replaceState(null, '', `#${id}`);
  window.scrollTo(0, 0);
  render();
  loadSection();
}
function persist() {
  store.set('volcano_dash_v1', { preset: state.preset, custom: state.custom });
}

app.addEventListener('click', async (event) => {
  const el = event.target.closest('button, a[data-go], tr[data-order], input[data-select]');
  if (!el) return;
  if (el.matches('input[data-select]')) return el.select();
  if (el.dataset.go) {
    event.preventDefault();
    return go(el.dataset.go);
  }
  if ('signout' in el.dataset) return signOut({ managerOnly: true });
  if (el.dataset.preset) {
    state.preset = el.dataset.preset;
    if (state.preset === 'custom' && !state.custom.from) state.custom = rangeFor('7d');
    persist();
    return loadSection();
  }
  if ('refresh' in el.dataset) {
    state.orders.key = '';
    state.customersKey = '';
    await loadBase().catch(() => {});
    return loadSection(true);
  }
  if (el.dataset.metric) {
    state.chartMetric = el.dataset.metric;
    return render();
  }
  if (el.dataset.quickPause) {
    const paused = el.dataset.quickPause === '1';
    if (await save(() => api('/api/staff/pause', { method: 'POST', body: { paused } }), paused ? 'Online orders paused' : 'Online orders are open again')) {
      await loadBase();
      render();
    }
    return;
  }
  if (el.dataset.export) return exportData(el.dataset.export).catch((err) => toast(err.message, true));
  if (el.dataset.ostatus !== undefined) {
    state.orders.status = el.dataset.ostatus;
    return loadSection();
  }
  if ('allCustomers' in el.dataset) {
    state.customersAll = true;
    return render();
  }
  if ('more' in el.dataset) {
    await loadOrders(true).catch((err) => toast(err.message, true));
    return render();
  }
  if (el.dataset.order) {
    state.orders.open = state.orders.open === el.dataset.order ? null : el.dataset.order;
    return render();
  }
  if (el.dataset.reprint) {
    return save(() => api(`/api/staff/orders/${el.dataset.reprint}/reprint`, { method: 'POST', body: { kind: el.dataset.kind } }), el.dataset.kind === 'receipt' ? 'Receipt sent to the printer' : 'Ticket sent to the printer');
  }
  if (el.dataset.mfilter) {
    state.menuFilter = el.dataset.mfilter;
    return render();
  }
  if ('addToggle' in el.dataset) {
    state.addOpen = !state.addOpen;
    return render();
  }
  if ('salesReset' in el.dataset) {
    if (!state.confirmReset) {
      state.confirmReset = true;
      render();
      setTimeout(() => {
        if (!state.confirmReset) return;
        state.confirmReset = false;
        render();
      }, 5000);
      return;
    }
    state.confirmReset = false;
    await save(() => api('/api/admin/sales/reset', { method: 'POST', body: {} }), 'Sales figures start from now');
    state.statsKey = '';
    return render();
  }
  if ('reportSend' in el.dataset) return save(() => api('/api/admin/report', { method: 'POST', body: {} }), 'Report sent');
  if (el.dataset.restore) {
    if (await save(() => api(`/api/admin/items/${el.dataset.restore}`, { method: 'PATCH', body: { archived: false } }), 'Back on the menu')) await reloadMenu();
    return;
  }
  const dish = el.closest('[data-dish]');
  if (dish && 'nophoto' in el.dataset) {
    if (await save(() => api(`/api/admin/items/${dish.dataset.dish}`, { method: 'PATCH', body: { image: '' } }), 'Photo removed')) await reloadMenu();
    return;
  }
  if (dish && 'archive' in el.dataset) {
    state.openDishes.delete(Number(dish.dataset.dish));
    if (await save(() => api(`/api/admin/items/${dish.dataset.dish}`, { method: 'PATCH', body: { archived: true } }), 'Removed from the menu')) await reloadMenu();
  }
});

let searchTimer;
app.addEventListener('input', (event) => {
  const el = event.target;
  if (el.id === 'order-q') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      state.orders.q = el.value;
      await loadSection();
      const box = app.querySelector('#order-q');
      if (box) {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      }
    }, 350);
  }
  if (el.id === 'menu-q') {
    state.menuSearch = el.value;
    render();
    const box = app.querySelector('#menu-q');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }
});

app.addEventListener('change', async (event) => {
  const el = event.target;
  if (el.id === 'from' || el.id === 'to') {
    const from = app.querySelector('#from').value;
    const to = app.querySelector('#to').value;
    if (from && to && from <= to) {
      state.custom = { from, to };
      persist();
      loadSection();
    }
    return;
  }
  if (el.dataset.available) {
    const ok = await save(() => api(`/api/staff/${el.dataset.available}/${el.dataset.id}/available`, { method: 'POST', body: { available: el.checked } }), el.checked ? 'Back on the menu' : 'Marked sold out');
    if (ok) await reloadMenu();
    else el.checked = !el.checked;
    return;
  }
  const dish = el.closest('[data-dish]');
  if (dish && el.dataset.field) {
    if (await save(() => api(`/api/admin/items/${dish.dataset.dish}`, { method: 'PATCH', body: { [el.dataset.field]: el.value } }))) await reloadMenu();
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
    if (ok) await reloadMenu();
    return;
  }
  if (el.dataset.price) {
    const cents = Math.round(Number(el.value) * 100);
    if (!Number.isFinite(cents) || cents < 0) return toast('Enter a price of 0 or more.', true);
    return save(() => api(`/api/admin/${el.dataset.price}/${el.dataset.id}`, { method: 'PATCH', body: { price_cents: cents } }), 'Price saved');
  }
  if (el.id === 'closed_today' || el.id === 'busy_today') {
    const closing = el.id === 'closed_today';
    const ok = await save(
      () => api(`/api/staff/${closing ? 'closed' : 'busy'}`, { method: 'POST', body: { on: el.checked } }),
      closing ? (el.checked ? 'Closed for today' : 'Open again today') : el.checked ? 'Wait is 15 minutes longer today' : 'Wait is back to normal'
    );
    if (ok) await reloadMenu();
    else el.checked = !el.checked;
    return;
  }
  if (el.id === 'paused') {
    const ok = await save(() => api('/api/staff/pause', { method: 'POST', body: { paused: el.checked } }), el.checked ? 'Online orders paused' : 'Online orders are open again');
    if (ok) await reloadMenu();
    else el.checked = !el.checked;
    return;
  }
  const settingFields = { paused_message: 'paused_message', prep_minutes: 'prep_minutes', last_order: 'last_order_minutes_before_close', phone: 'phone', report_email: 'report_email' };
  if (settingFields[el.id]) {
    const value = el.type === 'number' ? Number(el.value) : el.value;
    if (await save(() => api('/api/admin/settings', { method: 'PUT', body: { [settingFields[el.id]]: value } }))) {
      state.menu.settings[settingFields[el.id]] = el.id === 'report_email' ? el.value.trim() : value;
      const button = app.querySelector('[data-report-send]');
      if (button) button.disabled = !state.menu.settings.report_email;
    }
    return;
  }
  if (el.closest('[data-day]')) {
    const row = el.closest('[data-day]');
    const open = row.querySelector('[data-open]').checked;
    row.querySelector('[data-from]').disabled = !open;
    row.querySelector('[data-to]').disabled = !open;
    row.querySelector('.toggle small').textContent = open ? 'Open' : 'Closed';
    if (await save(() => api('/api/admin/settings', { method: 'PUT', body: { hours: collectHours() } }), 'Hours saved')) {
      state.menu.settings.hours = collectHours();
    }
  }
});

app.addEventListener(
  'toggle',
  (event) => {
    const el = event.target;
    if (el.id === 'report-preview' && el.open) {
      api('/api/admin/report')
        .then((r) => (el.querySelector('pre').textContent = `Subject: ${r.subject}\n\n${r.text}`))
        .catch((err) => (el.querySelector('pre').textContent = err.message));
    } else if (el.dataset?.dishMore) {
      state.openDishes[el.open ? 'add' : 'delete'](Number(el.dataset.dishMore));
    }
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
  state.addOpen = false;
  state.openDishes.add(created.id);
  state.menuFilter = 'all';
  await reloadMenu();
  app.querySelector(`[data-dish="${created.id}"]`)?.scrollIntoView({ block: 'center' });
});

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (SECTIONS.some((s) => s.id === id)) go(id);
});
// Charts are drawn to the width of the screen; redraw after turning a tablet.
let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (Math.abs(window.innerWidth - lastWidth) < 40) return;
    lastWidth = window.innerWidth;
    if (RANGED.has(state.section) && !app.querySelector('input:focus')) render();
  }, 250);
});
// Keep the live strip fresh while the overview is open.
setInterval(async () => {
  if (document.hidden || state.section !== 'overview' || app.querySelector('input:focus')) return;
  try {
    await loadBase();
    if (state.preset === 'today') await loadStats(true);
    render();
  } catch {
    /* next time */
  }
}, 60_000);

// ---------- start ----------
document.body.classList.add('mgr');
wireCharts(app);
await requireStaff(app, { title: 'Manager', needAdmin: true });
await loadBase();
render();
loadSection();
