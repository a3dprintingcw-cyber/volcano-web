// Opening hours and pickup slots. Pure functions, no database access,
// so they can be tested on their own (see test/hours.test.js).

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_MINUTES = 15;

// The restaurant's wall clock, built from a fixed UTC offset.
export function localClock(nowMs, offsetMinutes) {
  const d = new Date(nowMs + offsetMinutes * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    // Unix seconds of local midnight today.
    midnight: Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offsetMinutes * 60_000) / 1000),
  };
}

export function formatMinutes(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

function nextOpening(hours, weekday) {
  for (let i = 1; i <= 7; i += 1) {
    const day = (weekday + i) % 7;
    if (hours[day]) return { day, daysAhead: i, open: hours[day].open };
  }
  return null;
}

// Works out whether orders can be taken right now and which pickup times to offer.
// Orders are for today's service only.
export function availability(settings, nowMs) {
  const clock = localClock(nowMs, settings.timezone_offset_minutes);
  // "Closed today" (a holiday, a private event) switches one day off without touching the weekly hours.
  const today = settings.closed_day === clock.date ? null : settings.hours[clock.weekday] || null;
  const base = {
    service_day: clock.date,
    open_now: false,
    can_order: false,
    asap: null,
    slots: [],
    message: '',
    today: today ? { open: today.open, close: today.close } : null,
  };

  // "notice" carries the same information as "message" in a form the website can
  // put into another language: a key plus the numbers it needs.
  const next = nextOpening(settings.hours, clock.weekday);
  const nextInfo = next ? { days_ahead: next.daysAhead, day: next.day, open: next.open } : null;

  const closedUntilNext = () => {
    const next = nextOpening(settings.hours, clock.weekday);
    if (!next) return 'Online ordering is closed.';
    const when = next.daysAhead === 1 ? 'tomorrow' : DAY_NAMES[next.day];
    return `We open again ${when} at ${formatMinutes(next.open)}.`;
  };

  if (settings.ordering_paused) {
    return {
      ...base,
      message: settings.paused_message || 'Online ordering is paused right now. Please check back soon.',
      notice: settings.paused_message ? { key: 'custom', text: settings.paused_message } : { key: 'paused' },
    };
  }
  if (!today) {
    return { ...base, message: `Closed today. ${closedUntilNext()}`, notice: { key: 'closed_today', next: nextInfo } };
  }

  const lastOrder = today.close - settings.last_order_minutes_before_close;
  if (clock.minutes >= today.close) {
    return { ...base, message: `Closed for tonight. ${closedUntilNext()}`, notice: { key: 'closed_tonight', next: nextInfo } };
  }
  if (clock.minutes > lastOrder) {
    return {
      ...base,
      open_now: true,
      message: `The kitchen is closing, so we have stopped taking online orders. ${closedUntilNext()}`,
      notice: { key: 'closing', next: nextInfo },
    };
  }

  const openNow = clock.minutes >= today.open;
  const earliest = Math.max(clock.minutes, today.open) + settings.prep_minutes;
  const slots = [];
  const first = Math.ceil(earliest / SLOT_MINUTES) * SLOT_MINUTES;
  for (let m = first; m <= today.close; m += SLOT_MINUTES) {
    slots.push({ at: clock.midnight + m * 60, label: formatMinutes(m) });
  }

  return {
    ...base,
    open_now: openNow,
    can_order: true,
    asap: openNow ? { at: Math.floor(nowMs / 1000) + settings.prep_minutes * 60, minutes: settings.prep_minutes } : null,
    slots,
    message: openNow
      ? `Open until ${formatMinutes(today.close)}`
      : `Opens at ${formatMinutes(today.open)}. Order now and pick up tonight.`,
    notice: openNow ? { key: 'open_until', close: today.close } : { key: 'opens_at', open: today.open },
  };
}

export function describeHours(hours) {
  return DAY_NAMES.map((name, day) => ({
    day,
    name,
    open: hours[day] ? hours[day].open : null,
    close: hours[day] ? hours[day].close : null,
    text: hours[day] ? `${formatMinutes(hours[day].open)} to ${formatMinutes(hours[day].close)}` : 'Closed',
  }));
}
