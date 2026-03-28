// ═══════════════════════════════════════════
//   SINGLETOKENS API INTEGRATION (No Auth)
// ═══════════════════════════════════════════

const API = 'https://singletokens.onrender.com';

// ─── Modell-Mapping (Groq) ─────────────────
const GROQ_MODEL_MAP = {
  'Llama 3.3 70B':   'llama-3.3-70b-versatile',
  'Llama 3.1 8B':    'llama-3.1-8b-instant',
  'Gemma 2 9B':      'gemma2-9b-it',
  'Mixtral 8x7B':    'mixtral-8x7b-32768',
  'DeepSeek R1 70B': 'deepseek-r1-distill-llama-70b',
};

const DEFAULT_MODEL_NAME = 'Llama 3.3 70B';

function getGroqModel(modelName) {
  return GROQ_MODEL_MAP[modelName] || modelName;
}

// ─── Basis API-Call ────────────────────────
async function apiCall(path, method = 'GET', body = null) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null
  });
  const data = await res.json();
  if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
  return data;
}

// ─── Balance UI ────────────────────────────
function updateBalanceUI() {
  const fmt = typeof fmtBalance === 'function' ? fmtBalance
    : typeof fmtBal === 'function' ? fmtBal
    : () => balance;
  const counter = document.getElementById('token-counter');
  const topbar  = document.getElementById('topbar-tok');
  if (counter) counter.textContent = fmt() + ' Tokens';
  if (topbar)  topbar.textContent  = fmt();
}

// ─── Chat History (Multi-Turn) ─────────────
let chatHistory = [];

function resetChatHistory() {
  chatHistory = [];
}

// ─── Nachricht senden ──────────────────────
async function sendRealMessage(text, model) {
  try {
    const modelId = getGroqModel(model);
    const historySnapshot = [...chatHistory];
    chatHistory.push({ role: 'user', content: text });

    const data = await apiCall('/api/chat', 'POST', {
      model:   modelId,
      history: historySnapshot,
      message: text
    });

    if (data.error) {
      chatHistory.pop();
      return { error: data.error };
    }

    if (data.reply) {
      chatHistory.push({ role: 'assistant', content: data.reply });
    }

    return data;
  } catch (e) {
    console.error('sendRealMessage error:', e);
    chatHistory.pop();
    return { error: 'Verbindungsfehler. Bitte erneut versuchen.' };
  }
}

// ─── sendMessage ───────────────────────────
window.sendMessage = async function () {
  const inp  = document.getElementById('chat-input');
  const text = inp?.value?.trim();
  if (!text) return;

  const model = document.getElementById('chat-model-sel')?.value || DEFAULT_MODEL_NAME;

  const sb = document.querySelector('.send-btn');
  if (sb) {
    sb.classList.add('sending');
    sb.disabled = true;
    setTimeout(() => sb.classList.remove('sending'), 300);
  }

  if (typeof addMsg === 'function') addMsg(text, 'user');
  inp.value = '';
  inp.style.height = '22px';

  const typing = typeof addTyping === 'function' ? addTyping() : null;

  let reply;
  try {
    const data = await sendRealMessage(text, model);
    reply = data?.reply || ('⚠️ Fehler: ' + (data?.error || 'Keine Antwort vom Server'));
  } catch (e) {
    reply = '⚠️ Verbindungsfehler: ' + e.message;
  }

  if (typing) typing.remove();
  if (typeof addMsg === 'function') addMsg(reply, 'ai', model);
  if (sb) sb.disabled = false;
};

window.sendMsg = window.sendMessage;

// ─── Init ──────────────────────────────────
window.addEventListener('load', () => {
  const modelSel = document.getElementById('chat-model-sel');
  if (modelSel) modelSel.value = DEFAULT_MODEL_NAME;

  const topbarModel = document.getElementById('topbar-model');
  if (topbarModel) topbarModel.textContent = DEFAULT_MODEL_NAME;
});
