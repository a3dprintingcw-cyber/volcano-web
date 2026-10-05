// Helpers shared by the customer site, the kitchen board and the admin page.

export const money = (cents) => {
  const value = cents / 100;
  return `XCG ${Number.isInteger(value) ? value : value.toFixed(2)}`;
};

// Shows a time on the restaurant's clock (Curaçao), whatever the device is set to.
export const clockTime = (unixSeconds) =>
  new Date(unixSeconds * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Curacao',
  });

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    const error = new Error('No connection. Check your internet and try again.');
    error.status = 0;
    throw error;
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!response.ok) {
    const error = new Error((data && data.error) || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

// localStorage can be blocked (private mode), so every access is guarded.
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
