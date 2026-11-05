// Sign-in screen shared by the kitchen board and the admin page.
import { api, esc } from '/shared.js';

export async function requireStaff(app, { title, needAdmin = false }) {
  const session = await api('/api/staff/session');
  if (session.role && (!needAdmin || session.role === 'admin')) return session.role;

  return new Promise((resolve) => {
    const draw = (error = '') => {
      if (!session.configured) {
        app.innerHTML = `<div class="login"><img src="/img/logo.png" alt=""><h1>${esc(title)}</h1>
          <p>Staff PINs have not been set up yet. Follow the "Staff access" steps in the README, then reload this page.</p></div>`;
        return;
      }
      app.innerHTML = `
        <div class="login">
          <img src="/img/logo.png" alt="">
          <h1>${esc(title)}</h1>
          <form id="login">
            <label for="pin">${needAdmin ? 'Manager PIN' : 'Staff PIN'}</label>
            <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="off" required autofocus>
            ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
            <button class="btn btn-primary" type="submit">Sign in</button>
          </form>
          <a href="/">Back to the website</a>
        </div>`;
      app.querySelector('#login').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const result = await api('/api/staff/login', { method: 'POST', body: { pin: event.target.pin.value } });
          if (needAdmin && result.role !== 'admin') return draw('That PIN is not right.');
          resolve(result.role);
        } catch (err) {
          draw(err.message);
        }
      });
    };
    draw('');
  });
}

// From the manager page, only the manager sign-in ends; the kitchen board on the same device stays on.
export async function signOut({ managerOnly = false } = {}) {
  await api('/api/staff/logout', { method: 'POST', body: managerOnly ? { scope: 'admin' } : {} });
  location.reload();
}
