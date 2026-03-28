/* ─── SingleTokens api.js — Desktop + Mobile ─── */

const API_BASE = ''; // gleiche Origin wie der Server

const MODEL_MAP = {
  'Llama 3.3 70B':    'llama-3.3-70b-versatile',
  'Llama 3.1 8B':     'llama-3.1-8b-instant',
  'Gemma 2 9B':       'gemma2-9b-it',
  'Mixtral 8x7B':     'mixtral-8x7b-32768',
  'DeepSeek R1 70B':  'deepseek-r1-distill-llama-70b',
};

let chatHistory     = [];
let activeGptPrompt = null;

function setGptPrompt(prompt) {
  activeGptPrompt = prompt ? prompt.trim() : null;
  resetChatHistory();
}
/* ─── Hilfsfunktionen: funktionieren auf Desktop UND Mobile ─── */

function _getInputEl() {
  return document.getElementById('chat-input');
}

function _getModelName() {
  // Desktop: <select id="chat-model-sel">
  const sel = document.getElementById('chat-model-sel');
  if (sel) return sel.value;
  // Mobile: globale Variable curModel
  if (typeof curModel !== 'undefined') return curModel;
  return 'Llama 3.3 70B';
}

function _getMsgContainer() {
  // Desktop: chat-messages / Mobile: chat-msgs
  return document.getElementById('chat-messages') || document.getElementById('chat-msgs');
}

function _addMsg(text, role, model) {
  // Desktop hat eigene addMsg-Funktion → nutzen falls vorhanden
  if (typeof addMsg === 'function') {
    return addMsg(text, role, model);
  }
  // Fallback (sollte nicht aufgerufen werden)
  const msgs = _getMsgContainer();
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.innerHTML = `<div class="msg-bubble">${text}</div><div class="msg-meta">${role === 'user' ? 'Du' : (model || 'AI')}</div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function _addTyping() {
  if (typeof addTyping === 'function') {
    return addTyping();
  }
  const msgs = _getMsgContainer();
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function _updateBalance(used) {
  // Desktop
  if (typeof updateBalance === 'function') {
    updateBalance(used);
    return;
  }
  // Mobile: updateBal
  if (typeof updateBal === 'function') {
    updateBal(used);
  }
}

function _getMultiplier(modelName) {
  if (typeof MODELS_MULT !== 'undefined' && MODELS_MULT[modelName]) {
    return MODELS_MULT[modelName];
  }
  return 1;
}

/* ─── Kern-Logik: shared für Desktop + Mobile ─── */

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
  chatHistory.push({ role: 'user', content: text });

  if (!MODEL_MAP[modelName]) {
    typingEl.remove();
    chatHistory.pop();
    _addMsg(`⚠ "${modelName}" ist noch nicht live. Bitte wähle Llama, Gemma, Mixtral oder DeepSeek R1.`, 'ai', modelName);
    return;
  }

  const messages = [];
  // ✅ activeGptPrompt NICHT mehr hier in messages packen —
  // wird direkt als systemPrompt ans Backend geschickt
  messages.push(...chatHistory.slice(-20));

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        model: modelName,
        history: messages,
        systemPrompt: activeGptPrompt || null  // ✅ Custom GPT Prompt oder null → Backend nutzt Deutsch-Default
      })
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok || data.error) {
      chatHistory.pop();
      _addMsg('⚠ ' + (data.error || 'Server-Fehler'), 'ai', modelName);
      return;
    }

    const reply = data.reply || 'Keine Antwort erhalten.';
    chatHistory.push({ role: 'assistant', content: reply });
    _updateBalance(Math.floor(reply.length * mult + 10));
    _addMsg(reply, 'ai', modelName);

    if (typeof onMessageComplete === 'function') onMessageComplete();

  } catch (err) {
    typingEl.remove();
    chatHistory.pop();
    _addMsg('⚠ Server nicht erreichbar: ' + err.message, 'ai', modelName);
    console.error('api.js Fehler:', err);
  }
}

/* ─── Desktop: überschreibt sendMessage-Stub ─── */
sendMessage = function () { _doSend(); };

/* ─── Mobile: überschreibt sendMsg ─── */
var _origSendMsg = (typeof sendMsg === 'function') ? sendMsg : null;
sendMsg = function () { _doSend(); };
