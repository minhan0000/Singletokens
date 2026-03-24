// ═══════════════════════════════════════════
//   SINGLETOKENS API INTEGRATION
// ═══════════════════════════════════════════

const API = 'https://singletokens.onrender.com';
let authToken = localStorage.getItem('st_token');
let currentUser = JSON.parse(localStorage.getItem('st_user') || 'null');

// ── API HELPER ──
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

// ── AUTH ──
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
  localStorage.removeItem('st_token');
  localStorage.removeItem('st_user');
  showAuthModal();
}

function onAuthSuccess() {
  closeAuthModal();
  updateUIForUser();
  fetchBalance();
}

async function fetchBalance() {
  if (!authToken) return;
  const data = await apiCall('/api/balance');
  if (data.balance !== undefined) {
    balance = data.balance;
    const counter = document.getElementById('token-counter') || document.getElementById('topbar-tok');
    if (counter) counter.textContent = fmtBalance ? fmtBalance() : (fmtBal ? fmtBal() : data.balance);
  }
}

function updateUIForUser() {
  if (!currentUser) return;
  const initial = currentUser.name.charAt(0).toUpperCase();
  // Desktop
  const sidebarAv = document.getElementById('sidebar-av');
  const sidebarName = document.getElementById('sidebar-name');
  const sAv = document.getElementById('s-av');
  const sDisplayName = document.getElementById('s-display-name');
  const sDisplayEmail = document.getElementById('s-display-email');
  if (sidebarAv) sidebarAv.textContent = initial;
  if (sidebarName) sidebarName.textContent = currentUser.name;
  if (sAv) sAv.textContent = initial;
  if (sDisplayName) sDisplayName.textContent = currentUser.name;
  if (sDisplayEmail) sDisplayEmail.textContent = currentUser.email;
  // Mobile
  const mAv = document.getElementById('s-av');
  if (mAv) mAv.textContent = initial;
  balance = currentUser.balance;
}

// ── REAL CHAT ──
const GEMINI_MODEL_MAP = {
  'Gemini 2.0 Flash': 'gemini-2.0-flash',
  'Gemini Flash': 'gemini-2.0-flash',
  'Gemini Pro 2.0': 'gemini-1.5-pro',
  'Gemini 1.5 Pro': 'gemini-1.5-pro',
};

let chatHistory = [];

async function sendRealMessage(message, modelName) {
  if (!authToken) { showAuthModal(); return null; }
  const geminiModel = GEMINI_MODEL_MAP[modelName] || 'gemini-2.0-flash';
  const data = await apiCall('/api/chat', 'POST', {
    message,
    model: geminiModel,
    history: chatHistory,
  });
  if (data.reply) {
    chatHistory.push({ role: 'user', content: message });
    chatHistory.push({ role: 'assistant', content: data.reply });
    if (data.balance !== undefined) {
      balance = data.balance;
      const counter = document.getElementById('token-counter') || document.getElementById('topbar-tok');
      if (counter) {
        const fmt = typeof fmtBalance === 'function' ? fmtBalance : (typeof fmtBal === 'function' ? fmtBal : null);
        if (fmt) counter.textContent = fmt() + (counter.id === 'token-counter' ? ' Tokens' : '');
      }
    }
  }
  return data;
}

// ── AUTH MODAL ──
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
            <div style="font-size:13px;color:#9CA3AF;margin-top:6px" id="auth-subtitle">Anmelden oder registrieren</div>
          </div>
          <div style="display:flex;gap:0;background:#151A22;border-radius:8px;padding:3px;margin-bottom:24px">
            <button id="tab-login" onclick="switchTab('login')" style="flex:1;padding:8px;background:#22D3EE;border:none;border-radius:6px;color:#03060F;font-size:13px;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif">Anmelden</button>
            <button id="tab-register" onclick="switchTab('register')" style="flex:1;padding:8px;background:transparent;border:none;color:#9CA3AF;font-size:13px;font-weight:600;cursor:pointer;font-family:'Syne',sans-serif">Registrieren</button>
          </div>
          <div id="auth-form">
            <div id="register-name-wrap" style="display:none;margin-bottom:12px">
              <input id="auth-name" type="text" placeholder="Name" style="width:100%;background:#151A22;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:13px;color:#FAFAFA;outline:none">
            </div>
            <div style="margin-bottom:12px">
              <input id="auth-email" type="email" placeholder="E-Mail" style="width:100%;background:#151A22;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:13px;color:#FAFAFA;outline:none">
            </div>
            <div style="margin-bottom:20px">
              <input id="auth-password" type="password" placeholder="Passwort (min. 6 Zeichen)" style="width:100%;background:#151A22;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:11px 14px;font-family:'DM Mono',monospace;font-size:13px;color:#FAFAFA;outline:none">
            </div>
            <div id="auth-error" style="display:none;background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);border-radius:8px;padding:10px 14px;font-family:'DM Mono',monospace;font-size:12px;color:#F87171;margin-bottom:16px"></div>
            <button id="auth-submit-btn" onclick="submitAuth()" style="width:100%;padding:13px;background:#22D3EE;border:none;border-radius:10px;color:#03060F;font-size:14px;font-weight:800;cursor:pointer;font-family:'Syne',sans-serif">Anmelden</button>
            <div style="text-align:center;margin-top:12px;font-family:'DM Mono',monospace;font-size:11px;color:#4B5563">Neu hier? Bekommst du 500 gratis Tokens 🎁</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.style.display = 'block';
}

let authMode = 'login';
function switchTab(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  document.getElementById('tab-login').style.background = isLogin ? '#22D3EE' : 'transparent';
  document.getElementById('tab-login').style.color = isLogin ? '#03060F' : '#9CA3AF';
  document.getElementById('tab-register').style.background = !isLogin ? '#22D3EE' : 'transparent';
  document.getElementById('tab-register').style.color = !isLogin ? '#03060F' : '#9CA3AF';
  document.getElementById('register-name-wrap').style.display = isLogin ? 'none' : 'block';
  document.getElementById('auth-submit-btn').textContent = isLogin ? 'Anmelden' : 'Registrieren';
  document.getElementById('auth-error').style.display = 'none';
}

async function submitAuth() {
  const btn = document.getElementById('auth-submit-btn');
  const errorEl = document.getElementById('auth-error');
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  btn.textContent = '...';
  btn.disabled = true;
  errorEl.style.display = 'none';
  let data;
  if (authMode === 'login') {
    data = await login(email, password);
  } else {
    const name = document.getElementById('auth-name').value.trim();
    data = await register(email, password, name);
  }
  if (data.error) {
    errorEl.textContent = data.error;
    errorEl.style.display = 'block';
  }
  btn.textContent = authMode === 'login' ? 'Anmelden' : 'Registrieren';
  btn.disabled = false;
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
}

// ── PATCH SEND MESSAGE ──
// Overrides the existing sendMessage / sendMsg function to use real API
function patchSendMessage() {
  // Desktop: sendMessage
  const origSend = window.sendMessage;
  window.sendMessage = async function() {
    if (!authToken) { showAuthModal(); return; }
    const inp = document.getElementById('chat-input');
    const text = inp?.value?.trim();
    if (!text) return;
    const model = document.getElementById('chat-model-sel')?.value || 'Gemini Flash';

    // Only use real API for Gemini models
    if (!GEMINI_MODEL_MAP[model]) {
      // Fallback to original for non-Gemini models
      if (origSend) return origSend();
      return;
    }

    const sb = document.querySelector('.send-btn');
    if (sb) { sb.classList.add('sending'); setTimeout(() => sb.classList.remove('sending'), 300); }

    if (typeof addMsg === 'function') addMsg(text, 'user');
    inp.value = ''; inp.style.height = '22px';

    let typing = null;
    if (typeof addTyping === 'function') typing = addTyping();

    const data = await sendRealMessage(text, model);

    if (typing) typing.remove();
    if (data?.reply && typeof addMsg === 'function') {
      addMsg(data.reply, 'ai', model);
    } else if (data?.error && typeof addMsg === 'function') {
      addMsg('Fehler: ' + (data.error || 'Unbekannt'), 'ai', model);
    }
  };

  // Mobile: sendMsg
  const origSendM = window.sendMsg;
  window.sendMsg = async function() {
    if (!authToken) { showAuthModal(); return; }
    const inp = document.getElementById('chat-input');
    const text = inp?.value?.trim();
    if (!text) return;
    const model = typeof curModel !== 'undefined' ? curModel : 'Gemini Flash';

    if (!GEMINI_MODEL_MAP[model]) {
      if (origSendM) return origSendM();
      return;
    }

    if (typeof addMsg === 'function') addMsg(text, 'user');
    else {
      const msgs = document.getElementById('chat-msgs');
      if (msgs) {
        const d = document.createElement('div'); d.className = 'msg user';
        d.innerHTML = `<div class="msg-bubble">${text}</div><div class="msg-meta">Du</div>`;
        msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
      }
    }
    inp.value = ''; inp.style.height = 'auto';

    let typing = null;
    if (typeof addTyping === 'function') typing = addTyping();

    const data = await sendRealMessage(text, model);

    if (typing) typing.remove();
    const reply = data?.reply || ('Fehler: ' + (data?.error || 'Unbekannt'));
    if (typeof addMsg === 'function') addMsg(reply, 'ai');
    else {
      const msgs = document.getElementById('chat-msgs');
      if (msgs) {
        const d = document.createElement('div'); d.className = 'msg ai';
        d.innerHTML = `<div class="msg-bubble">${reply}</div><div class="msg-meta">${model}</div>`;
        msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
      }
    }
  };
}

// ── INIT ──
window.addEventListener('load', () => {
  patchSendMessage();
  if (!authToken) {
    showAuthModal();
  } else {
    updateUIForUser();
    fetchBalance();
  }
});
