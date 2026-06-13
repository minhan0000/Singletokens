/* ─── SingleTokens api.js — Desktop + Mobile ─── */

const API_BASE = '';

const MODEL_MAP = {
  'Llama 3.3 70B':   'llama-3.3-70b-versatile',
  'Llama 3.1 8B':    'llama-3.1-8b-instant',
  'Gemma 2 9B':      'gemma2-9b-it',
  'Mixtral 8x7B':    'mixtral-8x7b-32768',
  'DeepSeek R1 70B': 'deepseek-r1-distill-llama-70b',
};

let _apiConvHistory = [];
let activeGptPrompt = null;

/* ══ AUTH ══════════════════════════════════════════════════════════════════ */

const _JSON_HEADERS = { 'Content-Type': 'application/json' };
const _FETCH_OPTS   = { credentials: 'include' };

function _authHeaders() {
  return _JSON_HEADERS;
}

function _fetchOpts(extra = {}) {
  return { ..._FETCH_OPTS, ...extra };
}

async function apiLogout() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, _fetchOpts({ method: 'POST' }));
  } catch { }
  localStorage.removeItem('st_user');
  window.location.href = '/login.html';
}

async function apiGetUser() {
  try {
    const r = await fetch(`${API_BASE}/api/auth/me`, _fetchOpts({ headers: _authHeaders() }));
    if (r.status === 401) { await apiLogout(); return null; }
    if (!r.ok) return null;
    const d = await r.json();
    return d.user || null;
  } catch { return null; }
}

/* ══ BALANCE ════════════════════════════════════════════════════════════════ */

async function apiFetchBalance() {
  try {
    const r = await fetch(`${API_BASE}/api/balance`, _fetchOpts({ headers: _authHeaders() }));
    if (!r.ok) return 0;
    const d = await r.json();
    return d.balance || 0;
  } catch { return 0; }
}

/* ══ CHATS ══════════════════════════════════════════════════════════════════ */

async function apiFetchChats() {
  try {
    const r = await fetch(`${API_BASE}/api/chats`, _fetchOpts({ headers: _authHeaders() }));
    if (!r.ok) return [];
    const d = await r.json();
    return d.chats || [];
  } catch { return []; }
}

async function apiFetchChat(id) {
  if (!id) return null;
  try {
    const r = await fetch(`${API_BASE}/api/chats/${id}`, _fetchOpts({ headers: _authHeaders() }));
    if (!r.ok) return null;
    const d = await r.json();
    return d.chat || null;
  } catch { return null; }
}

async function apiCreateChat(title, model, messages) {
  try {
    const r = await fetch(`${API_BASE}/api/chats`, _fetchOpts({
      method:  'POST',
      headers: _authHeaders(),
      body:    JSON.stringify({ title, model, messages })
    }));
    if (!r.ok) return null;
    const d = await r.json();
    return d.id || null;
  } catch { return null; }
}

async function apiSaveChat(id, title, model, messages) {
  if (!id) return;
  try {
    await fetch(`${API_BASE}/api/chats/${id}`, _fetchOpts({
      method:  'PATCH',
      headers: _authHeaders(),
      body:    JSON.stringify({ title, model, messages })
    }));
  } catch { }
}

async function serverDeleteChat(serverId) {
  if (!serverId) return;
  try {
    await fetch(`${API_BASE}/api/chats/${serverId}`, _fetchOpts({
      method:  'DELETE',
      headers: _authHeaders()
    }));
  } catch(e) {
    console.warn('Chat konnte nicht vom Server gelöscht werden:', e.message);
  }
}

async function serverDeleteAllChats() {
  try {
    await fetch(`${API_BASE}/api/chats`, _fetchOpts({
      method:  'DELETE',
      headers: _authHeaders()
    }));
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
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = role === 'user' ? 'Du' : (model || 'AI');
  d.appendChild(bubble);
  d.appendChild(meta);
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function _addTyping() {
  if (typeof addTyping === 'function') return addTyping();
  const msgs = _getMsgContainer();
  const d = document.createElement('div');
  d.className = 'msg ai';
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  for (let i = 0; i < 3; i++) { const dot = document.createElement('div'); dot.className = 'typing-dot'; indicator.appendChild(dot); }
  d.appendChild(indicator);
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function _updateBalance(used) {
  if (typeof updateBalance === 'function') { updateBalance(used); return; }
  if (typeof updateBal    === 'function') { updateBal(used); }
}

function _getMultiplier(modelName) {
  if (typeof MODELS_MULT !== 'undefined' && MODELS_MULT[modelName]) return MODELS_MULT[modelName];
  return 1;
}

/* ══ CORE SEND ══════════════════════════════════════════════════════════════ */

async function _doSend() {
  const input     = _getInputEl();
  const modelName = _getModelName();
  const text      = input?.value?.trim();
  if (!text) return;

  _addMsg(text, 'user', modelName);
  input.value = '';
  if (input) input.style.height = 'auto';

  const mult = _getMultiplier(modelName);
  _updateBalance(Math.floor(text.length * mult * 1.5 + 20));

  const typingEl = _addTyping();
  _apiConvHistory.push({ role: 'user', content: text });

  if (!MODEL_MAP[modelName]) {
    typingEl.remove();
    _apiConvHistory.pop();
    _addMsg(`⚠ "${modelName}" ist noch nicht live. Bitte wähle Llama, Gemma, Mixtral oder DeepSeek R1.`, 'ai', modelName);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/chat`, _fetchOpts({
      method:  'POST',
      headers: _authHeaders(),
      body: JSON.stringify({
        message:      text,
        model:        modelName,
        history:      _apiConvHistory.slice(-20),
        systemPrompt: activeGptPrompt || null
      })
    }));

    const data = await res.json();
    typingEl.remove();

    if (!res.ok || data.error) {
      _apiConvHistory.pop();
      _addMsg('⚠ ' + (data.error || 'Server-Fehler'), 'ai', modelName);
      return;
    }

    const reply = data.reply || 'Keine Antwort erhalten.';
    _apiConvHistory.push({ role: 'assistant', content: reply });
    _updateBalance(Math.floor(reply.length * mult + 10));
    _addMsg(reply, 'ai', modelName);

    if (typeof onMessageComplete === 'function') onMessageComplete();

  } catch (err) {
    typingEl.remove();
    _apiConvHistory.pop();
    _addMsg('⚠ Server nicht erreichbar: ' + err.message, 'ai', modelName);
    console.error('api.js Fehler:', err);
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
  if (!name) return null;
  try {
    const r = await fetch(`${API_BASE}/api/auth/me`, _fetchOpts({
      method:  'PATCH',
      headers: _authHeaders(),
      body:    JSON.stringify({ name })
    }));
    if (!r.ok) return null;
    const d = await r.json();
    if (d.user) localStorage.setItem('st_user', JSON.stringify(d.user));
    return d.user || null;
  } catch { return null; }
}

async function apiDeleteAccount() {
  try {
    const r = await fetch(`${API_BASE}/api/auth/me`, _fetchOpts({
      method:  'DELETE',
      headers: _authHeaders()
    }));
    return r.ok;
  } catch { return false; }
}

/* ══ API KEYS ═══════════════════════════════════════════════════════════════ */

async function apiFetchApiKeys() {
  try {
    const r = await fetch(`${API_BASE}/api/keys`, _fetchOpts({ headers: _authHeaders() }));
    if (!r.ok) return [];
    const d = await r.json();
    return d.keys || [];
  } catch { return []; }
}

async function apiCreateApiKey(name) {
  try {
    const r = await fetch(`${API_BASE}/api/keys`, _fetchOpts({
      method:  'POST',
      headers: _authHeaders(),
      body:    JSON.stringify({ name })
    }));
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function apiRevokeApiKey(id) {
  if (!id) return;
  try {
    await fetch(`${API_BASE}/api/keys/${id}/revoke`, _fetchOpts({
      method:  'PATCH',
      headers: _authHeaders()
    }));
  } catch { }
}

/* ══ GPTS ═══════════════════════════════════════════════════════════════════ */

async function apiFetchGpts() {
  try {
    const r = await fetch(`${API_BASE}/api/gpts`, _fetchOpts({ headers: _authHeaders() }));
    if (!r.ok) return [];
    const d = await r.json();
    return d.gpts || [];
  } catch { return []; }
}

async function apiCreateGpt(gpt) {
  try {
    const r = await fetch(`${API_BASE}/api/gpts`, _fetchOpts({
      method:  'POST',
      headers: _authHeaders(),
      body:    JSON.stringify(gpt)
    }));
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function apiUpdateGpt(id, gpt) {
  if (!id) return;
  try {
    await fetch(`${API_BASE}/api/gpts/${id}`, _fetchOpts({
      method:  'PATCH',
      headers: _authHeaders(),
      body:    JSON.stringify(gpt)
    }));
  } catch { }
}

async function apiDeleteGpt(id) {
  if (!id) return;
  try {
    await fetch(`${API_BASE}/api/gpts/${id}`, _fetchOpts({
      method:  'DELETE',
      headers: _authHeaders()
    }));
  } catch { }
}

/* ══ BOOT — called after api.js is fully loaded ═════════════════════════════ */
if (typeof initApp === 'function') {
  // Mobile needs loadGpts stub first (noop, GPTs loaded in initApp)
  initApp();
}
