// ═══════════════════════════════════════════
//   SINGLETOKENS API INTEGRATION
// ═══════════════════════════════════════════

const API = 'https://singletokens.onrender.com';
let authToken = localStorage.getItem('st_token');
let currentUser = JSON.parse(localStorage.getItem('st_user') || 'null');
let balance = 0;

// ─── Modell-Mapping ───────────────────────
const GEMINI_MODEL_MAP = {
  'Gemini 2.0 Flash':      'gemini-2.0-flash',
  'Gemini Flash':          'gemini-2.0-flash',
  'Gemini Pro 2.0':        'gemini-1.5-pro',
  'Gemini 1.5 Pro':        'gemini-1.5-pro',
  'Gemini 2.0 Flash Lite': 'gemini-2.0-flash-lite',
};

function getGeminiModel(modelName) {
  return GEMINI_MODEL_MAP[modelName] || 'gemini-2.0-flash';
}

// ─── Basis API-Call ────────────────────────
async function apiCall(path, method = 'GET', body = null) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: 'Bearer ' + authToken } : {})
    },
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
}

// ─── Auth ──────────────────────────────────
async function register(email, password, name) {
  const data = await apiCall('/api/auth/register', 'POST', { email, password, name });
  if (data.token) {
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('st_token', authToken);
    localStorage.setItem('st_user', JSON.stringify(currentUser));
    onAuthSuccess();
  }
  return data;
}

async function login(email, password) {
  const data = await apiCall('/api/auth/login', 'POST', { email, password });
  if (data.token) {
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('st_token', authToken);
    localStorage.setItem('st_user', JSON.stringify(currentUser));
    onAuthSuccess();
  }
  return data;
}

function logout() {
  authToken = null;
  currentUser = null;
  chatHistory = [];
  localStorage.removeItem('st_token');
  localStorage.removeItem('st_user');
  showAuthModal();
}

function onAuthSuccess() {
  closeAuthModal();
  updateUIForUser();
  fetchBalance();
}

// ─── Balance ───────────────────────────────
async function fetchBalance() {
  if (!authToken) return;
  const data = await apiCall('/api/balance');
  if (data.balance !== undefined) {
    balance = data.balance;
    updateBalanceUI();
  }
}

function updateBalanceUI() {
  const fmt = typeof fmtBalance === 'function'
    ? fmtBalance
    : typeof fmtBal === 'function'
      ? fmtBal
      : () => balance;

  const counter = document.getElementById('token-counter');
  const topbar  = document.getElementById('topbar-tok');
  if (counter) counter.textContent = fmt() + ' Tokens';
  if (topbar)  topbar.textContent  = fmt();
}

function updateUIForUser() {
  if (!currentUser) return;
  const initial = currentUser.name.charAt(0).toUpperCase();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('sidebar-av',      initial);
  set('sidebar-name',    currentUser.name);
  set('s-av',            initial);
  set('s-display-name',  currentUser.name);
  set('s-display-email', currentUser.email);
  balance = currentUser.balance ?? 0;
  updateBalanceUI();
}

// ─── Chat History (Multi-Turn) ─────────────
let chatHistory = [];

function resetChatHistory() {
  chatHistory = [];
}

// ─── Echte KI-Nachricht senden ─────────────
async function sendRealMessage(text, model) {
  try {
    const geminiModel = getGeminiModel(model);
    chatHistory.push({ role: 'user', content: text });

    const data = await apiCall('/api/chat', 'POST', {
      model:   geminiModel,
      history: chatHistory,
      message: text
    });

    if (data.error) {
      chatHistory.pop();
      return { error: data.error };
    }

    if (data.reply) {
      chatHistory.push({ role: 'assistant', content: data.reply });
    }

    if (data.balance !== undefined) {
      balance = data.balance;
      updateBalanceUI();
    }

    return data;
  } catch (e) {
    console.error('sendRealMessage error:', e);
    chatHistory.pop();
    return { error: 'Verbindungsfehler. Bitte erneut versuchen.' };
  }
}

// ─────────────────────────────────────────────────────────────
//  sendMessage SOFORT überschreiben — kein load-Event nötig.
//  Da api.js am Ende von app.html eingebunden wird, ist der
//  DOM bereits fertig. window.sendMessage wird hier direkt
//  neu gesetzt und überschreibt die app.html-Version.
// ─────────────────────────────────────────────────────────────

window.sendMessage = async function () {
  const inp  = document.getElementById('chat-input');
  const text = inp?.value?.trim();
  if (!text) return;

  const model = document.getElementById('chat-model-sel')?.value || 'Gemini 2.0 Flash';

  const sb = document.querySelector('.send-btn');
  if (sb) { sb.classList.add('sending'); setTimeout(() => sb.classList.remove('sending'), 300); }

  if (typeof addMsg === 'function') addMsg(text, 'user');
  inp.value = '';
  inp.style.height = '22px';

  const typing = typeof addTyping === 'function' ? addTyping() : null;

  let reply;
  try {
    const data = await sendRealMessage(text, model);
    reply = data?.reply || ('⚠️ Fehler vom Server: ' + (data?.error || 'Keine Antwort'));
  } catch(e) {
    reply = '⚠️ Verbindungsfehler: ' + e.message;
  }

  if (typing) typing.remove();
  if (typeof addMsg === 'function') addMsg(reply, 'ai', model);
};

window.sendMsg = async function () {
  const inp  = document.getElementById('chat-input');
  const text = inp?.value?.trim();
  if (!text) return;

  const model = (typeof curModel !== 'undefined' ? curModel : null)
    || document.getElementById('chat-model-sel')?.value
    || 'Gemini 2.0 Flash';

  if (typeof addMsg === 'function') addMsg(text, 'user');
  inp.value = '';
  inp.style.height = 'auto';

  const typing = typeof addTyping === 'function' ? addTyping() : null;
  const data   = await sendRealMessage(text, model);
  if (typing) typing.remove();

  const reply = data?.reply || ('Fehler: ' + (data?.error || 'Unbekannt'));
  if (typeof addMsg === 'function') addMsg(reply, 'ai', model);
};

// ─── Auth Modal ────────────────────────────
function showAuthModal() {
  let modal = document.getElementById('auth-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif">
        <div style="background:#0F1218;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:32px;width:100%;max-width:400px;margin:16px">
          <div style="text-align:center;margin-bottom:28px">
            <div style="font-size:20px;font-weight:800;letter-spacing:-.02em">Single<span style="color:#22D3EE">Tokens</span></div>
            <div style="font-size:13px;color:#9CA3AF;margin-top:6px">Anmelden oder registrieren</div>
          </div>
          <div style="display:flex;gap:0;background:#151A22;border-radius:8px;padding:3px;margin-bottom:24px">
            <button id="tab-login"    onclick="switchTab('login')"    style="flex:1;padding:8px;background:#22D3EE;border:none;border-radius:6px;color:#03060F;font-size:13px;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif">Anmelden</button>
            <button id="tab-register" onclick="switchTab('register')" style="flex:1;padding:8px;background:transparent;border:none;color:#9CA3AF;font-size:13px;font-weight:600;cursor:pointer;font-family:'Syne',sans-serif">Registrieren</button>
          </div>
          <div id="auth-form">
            <div id="register-name-wrap" style="display:none;margin-bottom:12px">
              <input id="auth-name" type="text" placeholder="Name" style="width:100%;box-sizing:border-box;background:#151A22;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:13px;color:#FAFAFA;outline:none">
            </div>
            <div style="margin-bottom:12px">
              <input id="auth-email" type="email" placeholder="E-Mail" style="width:100%;box-sizing:border-box;background:#151A22;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:13px;color:#FAFAFA;outline:none">
            </div>
            <div style="margin-bottom:20px">
              <input id="auth-password" type="password" placeholder="Passwort (min. 6 Zeichen)" style="width:100%;box-sizing:border-box;background:#151A22;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:13px;color:#FAFAFA;outline:none">
            </div>
            <div id="auth-error" style="display:none;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:8px;padding:10px 14px;font-family:'DM Mono',monospace;font-size:12px;color:#F87171;margin-bottom:16px"></div>
            <button id="auth-submit-btn" onclick="submitAuth()" style="width:100%;padding:13px;background:#22D3EE;border:none;border-radius:10px;color:#03060F;font-size:14px;font-weight:800;cursor:pointer;font-family:'Syne',sans-serif">Anmelden</button>
            <div style="text-align:center;margin-top:12px;font-family:'DM Mono',monospace;font-size:11px;color:#4B5563">Neu hier? Bekommst du 500 gratis Tokens 🎁</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'block';
}

let authMode = 'login';

function switchTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  const activeStyle   = `flex:1;padding:8px;background:#22D3EE;border:none;border-radius:6px;color:#03060F;font-size:13px;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif`;
  const inactiveStyle = `flex:1;padding:8px;background:transparent;border:none;color:#9CA3AF;font-size:13px;font-weight:600;cursor:pointer;font-family:'Syne',sans-serif`;
  document.getElementById('tab-login').style.cssText    = isLogin  ? activeStyle : inactiveStyle;
  document.getElementById('tab-register').style.cssText = !isLogin ? activeStyle : inactiveStyle;
  document.getElementById('register-name-wrap').style.display = isLogin ? 'none' : 'block';
  document.getElementById('auth-submit-btn').textContent = isLogin ? 'Anmelden' : 'Registrieren';
  document.getElementById('auth-error').style.display = 'none';
}

async function submitAuth() {
  const errorEl  = document.getElementById('auth-error');
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  let btn = document.getElementById('auth-submit-btn');

  btn.textContent = '...';
  btn.disabled = true;
  errorEl.style.display = 'none';

  try {
    const data = authMode === 'login'
      ? await login(email, password)
      : await register(email, password, document.getElementById('auth-name').value.trim());

    if (data.error) {
      errorEl.textContent   = data.error;
      errorEl.style.display = 'block';
    }
  } catch (e) {
    console.error('Auth error:', e);
    errorEl.textContent   = 'Verbindungsfehler. Bitte erneut versuchen.';
    errorEl.style.display = 'block';
  }

  btn = document.getElementById('auth-submit-btn');
  if (btn) {
    btn.textContent = authMode === 'login' ? 'Anmelden' : 'Registrieren';
    btn.disabled = false;
  }
}

function closeAuthModal() {
  const m = document.getElementById('auth-modal');
  if (m) m.style.display = 'none';
}

// ─── Init ──────────────────────────────────
window.addEventListener('load', () => {
  const modelSel = document.getElementById('chat-model-sel');
  if (modelSel) modelSel.value = 'Gemini 2.0 Flash';

  const topbarModel = document.getElementById('topbar-model');
  if (topbarModel) topbarModel.textContent = 'Gemini 2.0 Flash';

  if (authToken && currentUser) {
    updateUIForUser();
    fetchBalance();
  }
});
