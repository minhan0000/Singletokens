/* ─── SingleTokens api.js ─── */

const API_BASE = 'https://singletokens-backend.onrender.com';

const MODEL_MAP = {
  'Llama 3.3 70B':    'llama-3.3-70b-versatile',
  'Llama 3.1 8B':     'llama-3.1-8b-instant',
  'Gemma 2 9B':       'gemma2-9b-it',
  'Mixtral 8x7B':     'mixtral-8x7b-32768',
  'DeepSeek R1 70B':  'deepseek-r1-distill-llama-70b',
};

let chatHistory = [];
let activeGptPrompt = null;

function resetChatHistory() {
  chatHistory = [];
  activeGptPrompt = null;
}

/* Backend aufwecken beim Laden der Seite */
fetch(`${API_BASE}/health`).catch(() => {});

/* ─── sendMessage ─── */
sendMessage = async function () {
  const input     = document.getElementById('chat-input');
  const modelName = document.getElementById('chat-model-sel')?.value || 'Llama 3.3 70B';
  const text      = input?.value?.trim();
  if (!text) return;

  addMsg(text, 'user');
  input.value = '';
  if (input) input.style.height = '22px';

  const mult = (typeof MODELS_MULT !== 'undefined' && MODELS_MULT[modelName]) || 1;
  if (typeof updateBalance === 'function')
    updateBalance(Math.floor(text.length * mult * 1.5 + 20));

  const typingEl = addTyping();
  chatHistory.push({ role: 'user', content: text });

  if (!MODEL_MAP[modelName]) {
    typingEl.remove();
    chatHistory.pop();
    addMsg(`⚠ "${modelName}" ist noch nicht live. Bitte wähle Llama, Gemma, Mixtral oder DeepSeek R1.`, 'ai', modelName);
    return;
  }

  const messages = [];
  if (activeGptPrompt) messages.push({ role: 'system', content: activeGptPrompt });
  messages.push(...chatHistory.slice(-20));

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, model: modelName, history: messages })
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok || data.error) {
      chatHistory.pop();
      addMsg('⚠ ' + (data.error || 'Backend-Fehler'), 'ai', modelName);
      return;
    }

    const reply = data.reply || 'Keine Antwort erhalten.';
    chatHistory.push({ role: 'assistant', content: reply });
    if (typeof updateBalance === 'function')
      updateBalance(Math.floor(reply.length * mult + 10));

    addMsg(reply, 'ai', modelName);
    if (typeof onMessageComplete === 'function') onMessageComplete();

  } catch (err) {
    typingEl.remove();
    chatHistory.pop();
    addMsg('⚠ Backend nicht erreichbar – ist der Render-Dienst online?', 'ai', modelName);
    console.error('api.js Fehler:', err);
  }
};
