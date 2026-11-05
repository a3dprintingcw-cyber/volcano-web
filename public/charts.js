// Small SVG charts for the manager dashboard. No libraries: the site loads nothing from elsewhere.
// Sizes and colours are SVG attributes, never style attributes, so the strict page policy allows them.

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A round number for the top of the axis: 0, 1, 2, 2.5, 5 times a power of ten.
export function niceMax(value, steps = 4) {
  if (!(value > 0)) return steps;
  const raw = value / steps;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * power) return m * power * steps;
  return 10 * power * steps;
}

const path = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
// A smooth line through the points (monotone, so it never overshoots below zero).
function smooth(points) {
  if (points.length < 3) return path(points);
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const cx = (x0 + x1) / 2;
    d += `C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

// Line chart with one or more lines, an area under the first, axis labels and a hover readout.
// series: [{ label, values, color, dashed, area }], labels: x labels, format: value -> text.
export function lineChart({ id, series, labels, format = String, height = 280, tipLabels, width = 800 }) {
  const W = width;
  const H = height;
  const pad = { l: 64, r: 16, t: 16, b: 34 };
  const n = labels.length;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const yy = y(max * f);
      return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" class="c-grid"/>
        <text x="${pad.l - 10}" y="${yy + 4}" text-anchor="end" class="c-axis">${esc(format(max * f, true))}</text>`;
    })
    .join('');
  const every = Math.max(1, Math.ceil(n / 8));
  const xLabels = labels
    .map((label, i) => (i % every === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="c-axis">${esc(label)}</text>` : ''))
    .join('');
  const lines = series
    .map((s, si) => {
      const pts = s.values.map((v, i) => [x(i), y(v)]);
      const d = smooth(pts);
      const area =
        s.area && pts.length
          ? `<path d="${d}L${pts[pts.length - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z" fill="url(#g-${id}-${si})" stroke="none"/>
             <defs><linearGradient id="g-${id}-${si}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity="0.35"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`
          : '';
      return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 2 : 3}" ${s.dashed ? 'stroke-dasharray="6 6"' : ''} stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  const dots = series[0].values.length <= 40 ? series[0].values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${series[0].color}" class="c-dot"/>`).join('') : '';
  // Hover readout: the page script positions it.
  const data = esc(JSON.stringify({ labels: tipLabels || labels, series: series.map((s) => ({ label: s.label, color: s.color, values: s.values.map((v) => format(v)) })), pad, n, w: W }));
  return `<div class="chart" data-chart="${data}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.label).join(', '))}">
      ${grid}${xLabels}${lines}${dots}
      <line class="c-cursor" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

// Vertical bars, for example orders per hour of the day. The highest bar is highlighted.
export function barChart({ values, labels, format = String, height = 220, color = '#fdb429', dim = '#5a4632', width = 800 }) {
  const W = width;
  const H = height;
  const pad = { l: 12, r: 12, t: 26, b: 30 };
  const n = values.length;
  const max = niceMax(Math.max(0, ...values));
  const slot = (W - pad.l - pad.r) / n;
  const bw = Math.min(56, slot * 0.68);
  const top = Math.max(...values);
  const bars = values
    .map((v, i) => {
      const h = ((H - pad.t - pad.b) * v) / max;
      const bx = pad.l + i * slot + (slot - bw) / 2;
      const by = H - pad.b - h;
      const hot = v === top && v > 0;
      return `<g><title>${esc(labels[i])}: ${esc(format(v))}</title>
        <rect x="${bx}" y="${by}" width="${bw}" height="${Math.max(h, v > 0 ? 2 : 0)}" rx="5" fill="${hot ? color : dim}"/>
        ${v > 0 && (n <= 14 || hot) ? `<text x="${bx + bw / 2}" y="${by - 7}" text-anchor="middle" class="c-val">${esc(format(v))}</text>` : ''}
        <text x="${bx + bw / 2}" y="${H - 10}" text-anchor="middle" class="c-axis">${esc(labels[i])}</text></g>`;
    })
    .join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${bars}</svg></div>`;
}

// Ring chart with a legend. parts: [{ label, value, color }].
export function donut({ parts, format = String, center = '', centerLabel = '' }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const rings = total
    ? parts
        .filter((p) => p.value > 0)
        .map((p) => {
          const len = (p.value / total) * c;
          const ring = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${p.color}" stroke-width="26" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"><title>${esc(p.label)}: ${esc(format(p.value))}</title></circle>`;
          offset += len;
          return ring;
        })
        .join('')
    : `<circle cx="100" cy="100" r="${r}" fill="none" stroke="#332d2a" stroke-width="26"/>`;
  const legend = parts
    .map(
      (p) => `<li><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${p.color}"/></svg>
        <span>${esc(p.label)} <em>${total ? Math.round((p.value / total) * 100) : 0}%</em></span><strong>${esc(format(p.value))}</strong></li>`
    )
    .join('');
  return `<div class="donut">
    <svg viewBox="0 0 200 200" role="img">${rings}
      <text x="100" y="98" text-anchor="middle" class="d-center">${esc(center)}</text>
      <text x="100" y="120" text-anchor="middle" class="d-label">${esc(centerLabel)}</text></svg>
    <ul class="legend">${legend}</ul>
  </div>`;
}

// Ranked list with a bar behind each value. rows: [{ label, value, sub }].
export function rankBars({ rows, format = String, color = '#fdb429', empty = 'Nothing yet.' }) {
  if (!rows.length) return `<p class="m-empty">${esc(empty)}</p>`;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<ol class="rank">${rows
    .map(
      (r, i) => `<li>
        <span class="rank-n">${i + 1}</span>
        <span class="rank-label">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
        <strong class="rank-value">${esc(format(r.value))}</strong>
        <svg class="rank-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="6" rx="3" fill="#2f2926"/><rect width="${((r.value / max) * 100).toFixed(1)}" height="6" rx="3" fill="${color}"/></svg>
      </li>`
    )
    .join('')}</ol>`;
}

// A tiny line for a figure card.
export function sparkline(values, color = '#fdb429') {
  if (!values.length) return '';
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [values.length === 1 ? 50 : (i * 100) / (values.length - 1), 28 - (v / max) * 26]);
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${path(pts)}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// Steps of a funnel: visitors, opened a dish, opened the order, ordered.
export function funnel(steps) {
  const first = steps[0]?.value || 0;
  return `<ol class="funnel">${steps
    .map((s, i) => {
      const share = first ? (s.value / first) * 100 : 0;
      const prev = i ? steps[i - 1].value : 0;
      return `<li>
        <div class="funnel-head"><span>${esc(s.label)}</span><strong>${s.value.toLocaleString('en-US')}</strong></div>
        <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="10" rx="5" fill="#2f2926"/><rect width="${share.toFixed(1)}" height="10" rx="5" fill="${s.color}"/></svg>
        <small>${i === 0 ? '100%' : `${share.toFixed(0)}% of visitors${prev ? `, ${Math.round((s.value / prev) * 100)}% of the step before` : ''}`}</small>
      </li>`;
    })
    .join('')}</ol>`;
}

// Hover readout for line charts: one listener for the whole page.
export function wireCharts(root) {
  root.addEventListener('pointermove', (event) => {
    const box = event.target.closest?.('.chart[data-chart]');
    root.querySelectorAll('.chart-tip:not([hidden])').forEach((tip) => {
      if (!box || !box.contains(tip)) {
        tip.hidden = true;
        tip.parentElement.querySelector('.c-cursor')?.setAttribute('visibility', 'hidden');
      }
    });
    if (!box) return;
    const info = JSON.parse(box.dataset.chart);
    const rect = box.getBoundingClientRect();
    const scale = rect.width / info.w;
    const left = info.pad.l * scale;
    const right = rect.width - info.pad.r * scale;
    const fx = Math.min(Math.max(event.clientX - rect.left, left), right);
    const i = info.n <= 1 ? 0 : Math.round(((fx - left) / (right - left)) * (info.n - 1));
    const tip = box.querySelector('.chart-tip');
    tip.innerHTML = `<b>${esc(info.labels[i])}</b>${info.series
      .map((s) => `<span><svg width="10" height="10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="${s.color}"/></svg>${esc(s.label)}: <strong>${esc(s.values[i])}</strong></span>`)
      .join('')}`;
    tip.hidden = false;
    const cx = left + (info.n <= 1 ? (right - left) / 2 : ((right - left) * i) / (info.n - 1));
    tip.style.left = `${Math.min(Math.max(cx, 80), rect.width - 80)}px`;
    const cursor = box.querySelector('.c-cursor');
    cursor.setAttribute('x1', cx / scale);
    cursor.setAttribute('x2', cx / scale);
    cursor.setAttribute('visibility', 'visible');
  });
  root.addEventListener('pointerleave', () => {
    root.querySelectorAll('.chart-tip').forEach((tip) => (tip.hidden = true));
    root.querySelectorAll('.c-cursor').forEach((c) => c.setAttribute('visibility', 'hidden'));
  });
}
