console.log('=== SERVER STARTING ===');
process.on('uncaughtException', (err) => { console.error('CRASH:', err.message); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('UNHANDLED:', err); process.exit(1); });

require('dotenv').config();
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db   = require('./db');
const auth = require('./auth.middleware');

const app = express();

// ✅ CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Felder fehlen' });
  if (password.length < 6) return res.status(400).json({ error: 'Passwort zu kurz' });
  if (await db.users.getByEmail(email)) return res.status(409).json({ error: 'E-Mail vergeben' });
  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  await db.users.create(id, email, hash, name);
  await db.users.updateBalance(500, id);
  const token = jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: safeUser(await db.users.get(id)) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Felder fehlen' });
  const user = await db.users.getByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.get('/api/auth/me',   auth, async (req, res) => {
  const user = await db.users.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ user: safeUser(user) });
});
app.patch('/api/auth/me', auth, async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name fehlt' });
  await db.users.update(req.body.name, req.user.id);
  res.json({ user: safeUser(await db.users.get(req.user.id)) });
});

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, balance: u.balance, created_at: u.created_at };
}

// ── API KEYS ──────────────────────────────────────────────────────────────────

app.get('/api/keys',            auth, async (req, res) => {
  const keys = await db.apiKeys.getAll(req.user.id);
  res.json({ keys: keys.map(k => ({ ...k, key: k.key.slice(0,12)+'••••'+k.key.slice(-4) })) });
});
app.post('/api/keys',           auth, async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name fehlt' });
  const key = 'sk-st-' + uuidv4().replace(/-/g,'');
  const id  = uuidv4();
  await db.apiKeys.create(id, req.user.id, req.body.name, key);
  res.status(201).json({ id, name: req.body.name, key, active: true });
});
app.patch('/api/keys/:id/revoke', auth, async (req, res) => {
  await db.apiKeys.revoke(req.params.id, req.user.id);
  res.json({ success: true });
});
app.delete('/api/keys/:id',     auth, async (req, res) => {
  await db.apiKeys.delete(req.params.id, req.user.id);
  res.json({ success: true });
});
app.post('/api/keys/validate',        async (req, res) => {
  const found = await db.apiKeys.getByKey(req.body.key);
  if (!found) return res.status(401).json({ valid: false });
  const user = await db.users.get(found.user_id);
  res.json({ valid: true, userId: found.user_id, balance: user?.balance || 0 });
});

// ── CHATS ─────────────────────────────────────────────────────────────────────

app.get('/api/chats',       auth, async (req, res) => res.json({ chats: await db.chats.getAll(req.user.id) }));
app.get('/api/chats/:id',   auth, async (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ chat: { ...chat, messages: JSON.parse(chat.messages) } });
});
app.post('/api/chats',      auth, async (req, res) => {
  const { title, model, messages } = req.body;
  if (!title || !model) return res.status(400).json({ error: 'Felder fehlen' });
  const id = uuidv4();
  await db.chats.create(id, req.user.id, title, model, JSON.stringify(messages || []));
  res.status(201).json({ id, title, model });
});
app.patch('/api/chats/:id', auth, async (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Nicht gefunden' });
  const { title, messages, model } = req.body;
  await db.chats.update(title||chat.title, JSON.stringify(messages||JSON.parse(chat.messages)), model||chat.model, req.params.id, req.user.id);
  res.json({ success: true });
});
app.delete('/api/chats/:id', auth, async (req, res) => {
  await db.chats.delete(req.params.id, req.user.id);
  res.json({ success: true });
});
app.delete('/api/chats',    auth, async (req, res) => {
  await db.chats.deleteAll(req.user.id);
  res.json({ success: true });
});

// ── BALANCE ───────────────────────────────────────────────────────────────────

app.get('/api/balance',  auth, async (req, res) => {
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
  res.json({ success: true, balance: (await db.users.get(req.user.id)).balance });
});
app.get('/api/transactions', auth, async (req, res) => res.json({ transactions: [] }));

// ── PAYMENTS ──────────────────────────────────────────────────────────────────

app.post('/api/payment/stripe/create-intent', (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/stripe/webhook',       (_, res) => res.json({ received: true }));
app.post('/api/payment/paypal/create-order',  (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/paypal/capture-order', (_, res) => res.status(503).json({ error: 'Coming soon' }));

// ── GROQ CHAT PROXY ───────────────────────────────────────────────────────────

const MODEL_MAP = {
  'Llama 3.3 70B':    'llama-3.3-70b-versatile',
  'Llama 3.1 8B':     'llama-3.1-8b-instant',
  'Gemma 2 9B':       'gemma2-9b-it',
  'Mixtral 8x7B':     'mixtral-8x7b-32768',
  'DeepSeek R1 70B':  'deepseek-r1-distill-llama-70b',
};

// ✅ Maximally direct system prompt

const DEFAULT_SYSTEM_PROMPT = `Du bist SingleTokens AI. Antworte IMMER in maximal 2 Sätzen. Keine Gegenfragen. Keine Füllphrasen. Nur die Antwort, nichts mehr. Sprache: Deutsch.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, model, history = [], systemPrompt } = req.body;
    if (!message) return res.status(400).json({ error: 'Nachricht fehlt' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY nicht gesetzt' });

    const modelId = MODEL_MAP[model] || 'llama-3.3-70b-versatile';

    const messages = [];

    // Custom GPT / Personalisierungs-Prompt hat Vorrang, sonst direkter Default
    messages.push({
      role: 'system',
      content: systemPrompt || DEFAULT_SYSTEM_PROMPT
    });

    for (const msg of history) {
      if (msg.role && msg.content)
        messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    }

    if (messages[messages.length - 1]?.content !== message)
      messages.push({ role: 'user', content: message });

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, messages, temperature: 0.7, max_tokens: 2048 })
    });

    const data = await groqRes.json();
    if (!groqRes.ok) return res.status(500).json({ error: data.error?.message || 'Groq Fehler' });

    res.json({ reply: data.choices?.[0]?.message?.content || 'Keine Antwort.', model: modelId });

  } catch (err) {
    console.error('Chat Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/models', (_, res) => res.json({
  default: 'llama-3.3-70b-versatile',
  models: Object.entries(MODEL_MAP).map(([name, id]) => ({ id, name }))
}));

// ── HEALTH ────────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok', version: '2.2.1' }));

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
async function start() {
  await db.init();
  console.log('✓ DB bereit');
  app.listen(PORT, '0.0.0.0', () => console.log(`✓ Server läuft auf Port ${PORT}`));
}
start().catch(err => { console.error('STARTUP ERROR:', err); process.exit(1); });
