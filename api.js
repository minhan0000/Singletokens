/* ─── SingleTokens api.js — Desktop + Mobile ─── */

const API_BASE = ''; // gleiche Origin wie der Server

const MODEL_MAP = {
  'Llama 3.3 70B':    'llama-3.3-70b-versatile',
  'Llama 3.1 8B':     'llama-3.1-8b-instant',
  'Gemma 2 9B':       'gemma2-9b-it',
  'Mixtral 8x7B':     'mixtral-8x7b-32768',
  'DeepSeek R1 70B':  'deepseek-r1-distill-llama-70b',
};

// ─── apiChatHistory: NUR der laufende Gesprächskontext für den Groq-API-Call ───
// Umbenannt von "chatHistory" → kein Konflikt mit dem gleichnamigen
// localStorage-Array in index-mobile.html
let apiChatHistory  = [];
let activeGptPrompt = null;

// ─── Hooks: werden von newChat() / loadChat() im mobilen Frontend aufgerufen ───

function apiResetConversation() {
  apiChatHistory = [];
}

function apiLoadConversation(messages) {
  apiChatHistory = (messages || []).map(m => ({
    role:    m.role === 'user' ? 'user' : 'assistant',
    content: m.text || m.content || ''
  }));
}

// ─── deleteAllHistory: löscht localStorage + Server (beide Versionen) ─────────
// Mobile: wird von clearAllHistory() aufgerufen
// Desktop: einfach deleteAllHistory() aufrufen (z.B. per Button onclick)
async function deleteAllHistory() {
  // 1) localStorage leeren (Mobile)
  try { localStorage.removeItem('st_chat_history'); } catch(e) {}

  // 2) Server-seitig löschen (falls eingeloggt)
  try {
    const token = localStorage.getItem('st_token');
    if (token) {
      await fetch(`${API_BASE}/api/chats`, {
        method:  'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  } catch(e) {
    console.warn('Server-Verlauf konnte nicht gelöscht werden:', e.message);
  }

  // 3) Laufenden Kontext zurücksetzen
  apiResetConversation();
}

function resetChatHistory() { apiChatHistory = []; }

function setGptPrompt(prompt) {
  activeGptPrompt = prompt ? prompt.trim() : null;
  apiChatHistory  = [];
}

/* ─── Hilfsfunktionen: funktionieren auf Desktop UND Mobile ─── */

function _getInputEl() {
  return document.getElementById('chat-input');
}

function _getModelName() {
  const sel = document.getElementById('chat-model-sel');
  if (sel) return sel.value;
  if (typeof curModel !== 'undefined') return curModel;
  return 'Llama 3.3 70B';
}

function _getMsgContainer() {
  return document.getElementById('chat-messages') || document.getElementById('chat-msgs');
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
  if (typeof updateBal     === 'function') { updateBal(used); }
}

function _getMultiplier(modelName) {
  if (typeof MODELS_MULT !== 'undefined' && MODELS_MULT[modelName]) return MODELS_MULT[modelName];
  return 1;
}

/* ─── Kern-Logik ─── */

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
  apiChatHistory.push({ role: 'user', content: text });

  if (!MODEL_MAP[modelName]) {
    typingEl.remove();
    apiChatHistory.pop();
    _addMsg(`⚠ "${modelName}" ist noch nicht live. Bitte wähle Llama, Gemma, Mixtral oder DeepSeek R1.`, 'ai', modelName);
    return;
  }

  const messages = [...apiChatHistory.slice(-20)];

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:      text,
        model:        modelName,
        history:      messages,
        systemPrompt: activeGptPrompt || null
      })
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok || data.error) {
      apiChatHistory.pop();
      _addMsg('⚠ ' + (data.error || 'Server-Fehler'), 'ai', modelName);
      return;
    }

    const reply = data.reply || 'Keine Antwort erhalten.';
    apiChatHistory.push({ role: 'assistant', content: reply });
    _updateBalance(Math.floor(reply.length * mult + 10));
    _addMsg(reply, 'ai', modelName);

    if (typeof onMessageComplete === 'function') onMessageComplete();

  } catch (err) {
    typingEl.remove();
    apiChatHistory.pop();
    _addMsg('⚠ Server nicht erreichbar: ' + err.message, 'ai', modelName);
    console.error('api.js Fehler:', err);
  }
}

/* ─── Desktop ─── */
if (typeof sendMessage !== 'undefined') {
  sendMessage = function () { _doSend(); };
}

/* ─── Mobile ─── */
sendMsg = function () { _doSend(); };
