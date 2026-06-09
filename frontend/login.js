const API = '';

/* ── Tab switch ── */
function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
  hideMsg();
}

/* ── Messages ── */
function showError(msg) {
  const el = document.getElementById('error-box');
  el.textContent = msg; el.classList.add('show');
  document.getElementById('success-box').classList.remove('show');
}
function showSuccess(msg) {
  const el = document.getElementById('success-box');
  el.textContent = msg; el.classList.add('show');
  document.getElementById('error-box').classList.remove('show');
}
function hideMsg() {
  document.getElementById('error-box').classList.remove('show');
  document.getElementById('success-box').classList.remove('show');
}

/* ── Loading state ── */
function setLoading(btnId, loading, defaultText) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span> Bitte warten...`
    : defaultText;
}

/* ── Redirect after login ── */
function redirectToApp() {
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 768) {
    window.location.href = '/index-mobile.html';
  } else {
    window.location.href = '/app.html';
  }
}

/* ── Login ── */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showError('Bitte E-Mail und Passwort eingeben.'); return; }
  setLoading('btn-login', true, 'Anmelden →');
  try {
    const r = await fetch(API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) { showError(data.error || 'Anmeldung fehlgeschlagen.'); return; }
    localStorage.setItem('st_user', JSON.stringify(data.user));
    showSuccess('Angemeldet! Weiterleitung...');
    setTimeout(redirectToApp, 600);
  } catch (e) {
    showError('Server nicht erreichbar. Bitte später nochmal versuchen.');
  } finally {
    setLoading('btn-login', false, 'Anmelden →');
  }
}

/* ── Register ── */
async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name) { showError('Bitte einen Namen eingeben.'); return; }
  if (!email) { showError('Bitte eine E-Mail eingeben.'); return; }
  if (password.length < 12) { showError('Passwort muss mindestens 12 Zeichen haben.'); return; }
  if (!/[A-Z]/.test(password)) { showError('Passwort muss mindestens einen Großbuchstaben enthalten.'); return; }
  if (!/[0-9]/.test(password)) { showError('Passwort muss mindestens eine Zahl enthalten.'); return; }
  if (!/[^A-Za-z0-9]/.test(password)) { showError('Passwort muss mindestens ein Sonderzeichen enthalten.'); return; }
  setLoading('btn-register', true, 'Konto erstellen →');
  try {
    const r = await fetch(API + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name })
    });
    const data = await r.json();
    if (!r.ok) { showError(data.error || 'Registrierung fehlgeschlagen.'); return; }
    localStorage.setItem('st_user', JSON.stringify(data.user));
    showSuccess('Konto erstellt! 500K Tokens wurden gutgeschrieben. Weiterleitung...');
    setTimeout(redirectToApp, 900);
  } catch (e) {
    showError('Server nicht erreichbar. Bitte später nochmal versuchen.');
  } finally {
    setLoading('btn-register', false, 'Konto erstellen →');
  }
}

/* ── Enter key ── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const loginVisible = document.getElementById('form-login').style.display !== 'none';
  if (loginVisible) doLogin(); else doRegister();
});

/* ── Already logged in? Check via server (cookie-based auth) ── */
(async () => {
  try {
    const r = await fetch(API + '/api/auth/me', { credentials: 'include' });
    if (r.ok) redirectToApp();
  } catch { }
})();
