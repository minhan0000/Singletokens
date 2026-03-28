
console.log('=== SERVER STARTING ===');
process.on('uncaughtException', (err) => {
  console.error('CRASH:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});
console.log('=== HANDLERS SET ===');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const auth = require('./auth.middleware');

const app = express();

// ✅ CORS fix — alle Origins erlaubt
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.use(express.json());
app.use(express.static(__dirname));

// ════════════════════════════════════════
//   AUTH
// ════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'E-Mail, Passwort und Name erforderlich' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });

  const existing = await db.users.getByEmail(email);
  if (existing) return res.status(409).json({ error: 'E-Mail bereits registriert' });

  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  await db.users.create(id, email, hash, name);
  await db.users.updateBalance(500, id);

  const token = jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  const user = await db.users.get(id);
  res.status(201).json({ token, user: safeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

  const user = await db.users.getByEmail(email);
  if (!user) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.users.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User nicht gefunden' });
  res.json({ user: safeUser(user) });
});

app.patch('/api/auth/me', auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  await db.users.update(name, req.user.id);
  const user = await db.users.get(req.user.id);
  res.json({ user: safeUser(user) });
});

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, balance: u.balance, created_at: u.created_at };
}

// ════════════════════════════════════════
//   API KEYS
// ════════════════════════════════════════

app.get('/api/keys', auth, async (req, res) => {
  const keys = await db.apiKeys.getAll(req.user.id);
  const masked = keys.map(k => ({ ...k, key: k.key.slice(0, 12) + '••••' + k.key.slice(-4) }));
  res.json({ keys: masked });
});

app.post('/api/keys', auth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const key = 'sk-st-' + uuidv4().replace(/-/g, '');
  const id = uuidv4();
  await db.apiKeys.create(id, req.user.id, name, key);
  res.status(201).json({ id, name, key, active: true });
});

app.patch('/api/keys/:id/revoke', auth, async (req, res) => {
  const result = await db.apiKeys.revoke(req.params.id, req.user.id);
  if (!result) return res.status(404).json({ error: 'Key nicht gefunden' });
  res.json({ success: true });
});

app.delete('/api/keys/:id', auth, async (req, res) => {
  const result = await db.apiKeys.delete(req.params.id, req.user.id);
  if (!result) return res.status(404).json({ error: 'Key nicht gefunden' });
  res.json({ success: true });
});

app.post('/api/keys/validate', async (req, res) => {
  const { key } = req.body;
  const found = await db.apiKeys.getByKey(key);
  if (!found) return res.status(401).json({ valid: false });
  const user = await db.users.get(found.user_id);
  res.json({ valid: true, userId: found.user_id, balance: user?.balance || 0 });
});

// ════════════════════════════════════════
//   CHAT HISTORY
// ════════════════════════════════════════

app.get('/api/chats', auth, async (req, res) => {
  const chats = await db.chats.getAll(req.user.id);
  res.json({ chats });
});

app.get('/api/chats/:id', auth, async (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden' });
  res.json({ chat: { ...chat, messages: JSON.parse(chat.messages) } });
});

app.post('/api/chats', auth, async (req, res) => {
  const { title, model, messages } = req.body;
  if (!title || !model) return res.status(400).json({ error: 'Titel und Modell erforderlich' });
  const id = uuidv4();
  await db.chats.create(id, req.user.id, title, model, JSON.stringify(messages || []));
  res.status(201).json({ id, title, model });
});

app.patch('/api/chats/:id', auth, async (req, res) => {
  const { title, messages, model } = req.body;
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden' });
  await db.chats.update(
    title || chat.title,
    JSON.stringify(messages || JSON.parse(chat.messages)),
    model || chat.model,
    req.params.id,
    req.user.id
  );
  res.json({ success: true });
});

app.delete('/api/chats/:id', auth, async (req, res) => {
  const result = await db.chats.delete(req.params.id, req.user.id);
  if (!result) return res.status(404).json({ error: 'Chat nicht gefunden' });
  res.json({ success: true });
});

app.delete('/api/chats', auth, async (req, res) => {
  await db.chats.deleteAll(req.user.id);
  res.json({ success: true });
});

// ════════════════════════════════════════
//   TOKENS / BALANCE
// ════════════════════════════════════════

app.get('/api/balance', auth, async (req, res) => {
  const user = await db.users.get(req.user.id);
  res.json({ balance: user?.balance || 0 });
});

app.post('/api/consume', auth, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Ungültige Menge' });
  const user = await db.users.get(req.user.id);
  if (!user || user.balance < amount)
    return res.status(402).json({ error: 'Kein Guthaben', balance: user?.balance || 0 });
  await db.users.updateBalance(-amount, req.user.id);
  const updated = await db.users.get(req.user.id);
  res.json({ success: true, balance: updated.balance });
});

// ════════════════════════════════════════
//   PAYMENTS (coming soon)
// ════════════════════════════════════════

app.post('/api/payment/stripe/create-intent', (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/stripe/webhook', (_, res) => res.json({ received: true }));
app.post('/api/payment/paypal/create-order', (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/paypal/capture-order', (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.get('/api/transactions', auth, async (req, res) => res.json({ transactions: [] }));

// ════════════════════════════════════════
//   GROQ CHAT ✅ Groq als Standard-KI
// ════════════════════════════════════════

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// Mapping: Frontend-Anzeigename → Groq Modell-ID
const MODEL_MAP = {
  'Llama 3.3 70B':        'llama-3.3-70b-versatile',
  'Llama 3.1 8B':         'llama-3.1-8b-instant',
  'Gemma 2 9B':           'gemma2-9b-it',
  'Mixtral 8x7B':         'mixtral-8x7b-32768',
  'DeepSeek R1 70B':      'deepseek-r1-distill-llama-70b',
  // Weitere Modelle mit Fallback auf Default
};

app.post('/api/chat', async (req, res) => {
  try {
    const { message, model, history = [], systemPrompt } = req.body;
    if (!message) return res.status(400).json({ error: 'Nachricht erforderlich' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Kein Groq API Key konfiguriert' });

    // Modell-ID aus Mapping auflösen, oder direkt verwenden falls schon eine ID
    const modelId = MODEL_MAP[model] || model || DEFAULT_MODEL;

    // Chat-History ins OpenAI-Format konvertieren (Groq ist OpenAI-kompatibel)
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of history) {
      // Letzten User-Eintrag überspringen falls er der aktuelle message-Wert ist
      if (msg.role === 'user' && msg.content === message && msg === history[history.length - 1]) continue;
      messages.push({
        role: msg.role === 'model' ? 'assistant' : msg.role, // Gemini-Kompatibilität
        content: msg.content
      });
    }

    messages.push({ role: 'user', content: message });

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      })
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      console.error('Groq Error:', data);
      return res.status(500).json({ error: data.error?.message || 'Groq Fehler' });
    }

    const reply = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
    res.json({ reply, model: modelId });

  } catch (err) {
    console.error('Chat Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models', (req, res) => {
  res.json({
    default: DEFAULT_MODEL,
    models: [
      { id: 'llama-3.3-70b-versatile',      name: 'Llama 3.3 70B',   mult: 0.30 },
      { id: 'llama-3.1-8b-instant',          name: 'Llama 3.1 8B',    mult: 0.10 },
      { id: 'gemma2-9b-it',                  name: 'Gemma 2 9B',      mult: 0.15 },
      { id: 'mixtral-8x7b-32768',            name: 'Mixtral 8x7B',    mult: 0.20 },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B', mult: 0.35 },
    ]
  });
});

// ════════════════════════════════════════
//   HEALTH CHECK
// ════════════════════════════════════════

app.get('/health', (_, res) => res.json({ status: 'ok', version: '2.1.0' }));

// ════════════════════════════════════════
//   START
// ════════════════════════════════════════

const PORT = process.env.PORT || 3001;

async function start() {
  await db.init();
  console.log('✓ Datenbank initialisiert');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ SingleTokens Backend v2.1 läuft auf Port ${PORT} — Groq powered`);
  });
}

start().catch(err => {
  console.error('STARTUP ERROR:', err);
  process.exit(1);
});
