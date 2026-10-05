/* ─── SingleTokens api.js — Desktop + Mobile ─── */

const API_BASE = '';

// Models the server can run right now. The full catalog comes in step 2.
const MODEL_MAP = {
  'Claude Sonnet 4.5': 'anthropic/claude-sonnet-4.5',
  'Llama 3.3 70B':     'meta-llama/llama-3.3-70b-instruct',
};

let _apiConvHistory = [];
let activeGptPrompt = null;

/* ══ AUTH ══════════════════════════════════════════════════════════════════ */

function _getToken() {
  try { return localStorage.getItem('st_token') || null; } catch(e) { return null; }
}

function _authHeaders() {
  const t = _getToken();
  return t
    ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t }
    : { 'Content-Type': 'application/json' };
}

function apiLogout() {
  localStorage.removeItem('st_token');
  localStorage.removeItem('st_user');
  window.location.href = '/login.html';
}

async function apiGetUser() {
  if (!_getToken()) return null;
  try {
    const r = await fetch(`${API_BASE}/api/auth/me`, { headers: _authHeaders() });
    if (r.status === 401) { apiLogout(); return null; }
    if (!r.ok) return null;
    const d = await r.json();
    // The app shows the user right after this returns; the credit lands a moment later.
    if (d.user?.openrouterConnected) _refreshCredit();
    return d.user || null;
  } catch { return null; }
}

/* ══ BALANCE ════════════════════════════════════════════════════════════════ */

/* ══ OPENROUTER ═════════════════════════════════════════════════════════════ */

// Users pay OpenRouter directly. "Connect" sends them to OpenRouter to approve,
// and OpenRouter sends them back to connect.html with a one-time code.
async function apiConnectOpenRouter() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = _base64url(bytes);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  sessionStorage.setItem('st_or_verifier', verifier);
  const callback = encodeURIComponent(`${location.origin}/connect.html`);
  location.href = `https://openrouter.ai/auth?callback_url=${callback}&code_challenge=${_base64url(new Uint8Array(hash))}&code_challenge_method=S256`;
}

function _base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// { connected, creditUsd, creditTokens }
async function apiFetchOpenRouterStatus() {
  if (!_getToken()) return { connected: false };
  try {
    const r = await fetch(`${API_BASE}/api/openrouter/status`, { headers: _authHeaders() });
    if (!r.ok) return { connected: false };
    return await r.json();
  } catch { return { connected: false }; }
}

// Shows the remaining OpenRouter credit in the token counter.
async function _refreshCredit() {
  const s = await apiFetchOpenRouterStatus();
  if (s.connected && typeof s.creditTokens === 'number') _setBalance(s.creditTokens);
}

/* ══ CHATS ══════════════════════════════════════════════════════════════════ */

async function apiFetchChats() {
  if (!_getToken()) return [];
  try {
    const r = await fetch(`${API_BASE}/api/chats`, { headers: _authHeaders() });
    if (!r.ok) return [];
    const d = await r.json();
    return d.chats || [];
  } catch { return []; }
}

async function apiFetchChat(id) {
  if (!_getToken() || !id) return null;
  try {
    const r = await fetch(`${API_BASE}/api/chats/${id}`, { headers: _authHeaders() });
    if (!r.ok) return null;
    const d = await r.json();
    return d.chat || null;
  } catch { return null; }
}

async function apiCreateChat(title, model, messages) {
  if (!_getToken()) return null;
  try {
    const r = await fetch(`${API_BASE}/api/chats`, {
      method:  'POST',
      headers: _authHeaders(),
      body:    JSON.stringify({ title, model, messages })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.id || null;
  } catch { return null; }
}

async function apiSaveChat(id, title, model, messages) {
  if (!_getToken() || !id) return;
  try {
    await fetch(`${API_BASE}/api/chats/${id}`, {
      method:  'PATCH',
      headers: _authHeaders(),
      body:    JSON.stringify({ title, model, messages })
    });
  } catch { }
}

async function serverDeleteChat(serverId) {
  if (!serverId || !_getToken()) return;
  try {
    await fetch(`${API_BASE}/api/chats/${serverId}`, {
      method:  'DELETE',
      headers: _authHeaders()
    });
  } catch(e) {
    console.warn('Chat konnte nicht vom Server gelöscht werden:', e.message);
  }
}

async function serverDeleteAllChats() {
  if (!_getToken()) return;
  try {
    await fetch(`${API_BASE}/api/chats`, {
      method:  'DELETE',
      headers: _authHeaders()
    });
  } catch(e) {
    console.warn('Server-Verlauf konnte nicht gelöscht werden:', e.message);
  }
}

/* ══ CONVERSATION HOOKS ═════════════════════════════════════════════════════ */

function apiResetConversation() {
  _apiConvHistory = [];
  activeGptPrompt = null;
}

function apiLoadConversation(messages) {
  _apiConvHistory = (messages || [])
    .filter(m => m.role === 'user' || m.role === 'ai')
    .map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.text || m.content || ''
    }));
}

/* ══ HELPERS ════════════════════════════════════════════════════════════════ */

function _getInputEl()  { return document.getElementById('chat-input'); }

function _getMsgContainer() {
  return document.getElementById('chat-messages') || document.getElementById('chat-msgs');
}

function _getModelName() {
  const sel = document.getElementById('chat-model-sel');
  if (sel) return sel.value;
  if (typeof curModel !== 'undefined') {
    return typeof curModel === 'function' ? curModel() : curModel;
  }
  return 'Llama 3.3 70B';
}

function _addMsg(text, role, model) {
  if (typeof addMsg === 'function') return addMsg(text, role, model);
  const msgs = _getMsgContainer();
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.innerHTML = `<div class="msg-bubble">${text}</div><div class="msg-meta">${role === 'user' ? 'Du' : (model || 'AI')}</div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function _addTyping() {
  if (typeof addTyping === 'function') return addTyping();
  const msgs = _getMsgContainer();
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function _updateBalance(used) {
  if (typeof updateBalance === 'function') { updateBalance(used); return; }
  if (typeof updateBal    === 'function') { updateBal(used); }
}

function _addConnectButton(msgEl) {
  const btn = document.createElement('button');
  btn.textContent = 'Connect OpenRouter';
  btn.style.cssText = 'margin-top:8px;padding:8px 14px;border:none;border-radius:8px;background:#5865f2;color:#fff;font-weight:600;cursor:pointer';
  btn.onclick = apiConnectOpenRouter;
  (msgEl.querySelector('.msg-bubble') || msgEl).appendChild(btn);
}

// The server decides the balance; the page only shows it.
function _setBalance(value) {
  if (typeof balance !== 'undefined') balance = value;
  _updateBalance(0);
}

/* ══ CORE SEND ══════════════════════════════════════════════════════════════ */

async function _doSend() {
  const input     = _getInputEl();
  const modelName = _getModelName();
  const text      = (input?.value !== undefined ? input.value : input?.innerText)?.trim();
  if (!text) return;

  _addMsg(text, 'user', modelName);
  if (input.value !== undefined) { input.value = ''; input.style.height = 'auto'; }
  else { input.innerHTML = ''; }

  const typingEl = _addTyping();
  _apiConvHistory.push({ role: 'user', content: text });

  if (!MODEL_MAP[modelName]) {
    typingEl.remove();
    _apiConvHistory.pop();
    _addMsg(`⚠ "${modelName}" isn't available yet. Pick Claude Sonnet 4.5 or Llama 3.3 70B.`, 'ai', modelName);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method:  'POST',
      headers: _authHeaders(),
      body: JSON.stringify({
        message:      text,
        model:        modelName,
        history:      _apiConvHistory.slice(-20),
        systemPrompt: activeGptPrompt || null
      })
    });

    const data = await res.json();
    typingEl.remove();

    if (res.status === 401) { apiLogout(); return; }

    if (!res.ok || data.error) {
      _apiConvHistory.pop();
      const el = _addMsg('⚠ ' + (data.error || 'Server error'), 'ai', modelName);
      if (data.needsConnect) _addConnectButton(el);
      return;
    }

    const reply = data.reply || 'No reply.';
    _apiConvHistory.push({ role: 'assistant', content: reply });
    _addMsg(reply, 'ai', modelName);
    _refreshCredit();

    if (typeof onMessageComplete === 'function') onMessageComplete();

  } catch (err) {
    typingEl.remove();
    _apiConvHistory.pop();
    _addMsg('⚠ Server unreachable: ' + err.message, 'ai', modelName);
    console.error('api.js error:', err);
  }
}

function setGptPrompt(prompt) {
  activeGptPrompt = prompt ? prompt.trim() : null;
  _apiConvHistory = [];
}

function resetChatHistory() {
  _apiConvHistory = [];
}

sendMessage = function() { _doSend(); };
sendMsg     = function() { _doSend(); };

/* ══ ACCOUNT ════════════════════════════════════════════════════════════════ */

async function apiUpdateName(name) {
  if (!_getToken() || !name) return null;
  try {
    const r = await fetch(`${API_BASE}/api/auth/me`, {
      method:  'PATCH',
      headers: _authHeaders(),
      body:    JSON.stringify({ name })
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.user) localStorage.setItem('st_user', JSON.stringify(d.user));
    return d.user || null;
  } catch { return null; }
}

async function apiDeleteAccount() {
  if (!_getToken()) return false;
  try {
    const r = await fetch(`${API_BASE}/api/auth/me`, {
      method:  'DELETE',
      headers: _authHeaders()
    });
    return r.ok;
  } catch { return false; }
}

/* ══ GPTS ═══════════════════════════════════════════════════════════════════ */

async function apiFetchGpts() {
  if (!_getToken()) return [];
  try {
    const r = await fetch(`${API_BASE}/api/gpts`, { headers: _authHeaders() });
    if (!r.ok) return [];
    const d = await r.json();
    return d.gpts || [];
  } catch { return []; }
}

async function apiCreateGpt(gpt) {
  if (!_getToken()) return null;
  try {
    const r = await fetch(`${API_BASE}/api/gpts`, {
      method:  'POST',
      headers: _authHeaders(),
      body:    JSON.stringify(gpt)
    });
    if (!r.ok) return null;
    return await r.json(); // { id, name, ... }
  } catch { return null; }
}

async function apiUpdateGpt(id, gpt) {
  if (!_getToken() || !id) return;
  try {
    await fetch(`${API_BASE}/api/gpts/${id}`, {
      method:  'PATCH',
      headers: _authHeaders(),
      body:    JSON.stringify(gpt)
    });
  } catch { }
}

async function apiDeleteGpt(id) {
  if (!_getToken() || !id) return;
  try {
    await fetch(`${API_BASE}/api/gpts/${id}`, {
      method:  'DELETE',
      headers: _authHeaders()
    });
  } catch { }
}

/* ══ BOOT — called after api.js is fully loaded ═════════════════════════════ */
if (typeof initApp === 'function') {
  // Mobile needs loadGpts stub first (noop, GPTs loaded in initApp)
  initApp();
}
