/* ─── SingleTokens api.js ─── */

const API_BASE = 'https://singletokens-backend.onrender.com'; // ← deine Backend-URL

let chatHistory = [];   // OpenAI-Format: [{role:'user',content:'...'}, ...]
let activeGptPrompt = null;

/* ─── Chat-History Reset ─── */
function resetChatHistory() {
  chatHistory = [];
  activeGptPrompt = null;
}

/* ─── sendMessage (überschreibt den Stub in app.html) ─── */
sendMessage = async function () {
  const input  = document.getElementById('chat-input');
  const model  = document.getElementById('chat-model-sel')?.value || 'Llama 3.3 70B';
  const text   = input?.value?.trim();
  if (!text) return;

  // UI: Nachricht des Users anzeigen
  addMsg(text, 'user');
  input.value = '';
  if (input) { input.style.height = '22px'; }

  // Token-Schätzung abziehen (grobe Schätzung vor Antwort)
  const mult = (typeof MODELS_MULT !== 'undefined' && MODELS_MULT[model]) || 1;
  const estimatedCost = Math.floor(text.length * mult * 1.5 + 20);
  if (typeof updateBalance === 'function') updateBalance(estimatedCost);

  // Typing-Indikator
  const typingEl = addTyping();

  // History updaten
  chatHistory.push({ role: 'user', content: text });

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        model: model,
        history: chatHistory.slice(-20), // max 20 Nachrichten Kontext
        systemPrompt: activeGptPrompt || undefined
      })
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok || data.error) {
      const errMsg = data.error || 'Backend-Fehler – bitte erneut versuchen.';
      addMsg('⚠ ' + errMsg, 'ai', model);
      // History-Push rückgängig machen
      chatHistory.pop();
      return;
    }

    const reply = data.reply || 'Keine Antwort erhalten.';
    chatHistory.push({ role: 'assistant', content: reply });

    // Antwort-Kosten abziehen
    const replyCost = Math.floor(reply.length * mult + 10);
    if (typeof updateBalance === 'function') updateBalance(replyCost);

    addMsg(reply, 'ai', model);

    // Chat speichern
    if (typeof onMessageComplete === 'function') onMessageComplete();

  } catch (err) {
    typingEl.remove();
    chatHistory.pop();
    addMsg('⚠ Verbindung fehlgeschlagen – ist das Backend erreichbar?', 'ai', model);
    console.error('api.js Fetch-Fehler:', err);
  }
};
