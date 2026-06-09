console.log('=== SERVER STARTING ===');
process.on('uncaughtException', (err) => { console.error('CRASH:', err.message); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('UNHANDLED:', err); process.exit(1); });

require('dotenv').config();
const express      = require('express');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const db   = require('./db');
const auth = require('./auth.middleware');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production set ALLOWED_ORIGIN to your frontend domain (e.g. https://singletokens.com).
// Falls back to localhost for local development.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3001';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── SECURITY HEADERS ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ── RATE LIMITER ──────────────────────────────────────────────────────────────
// Simple in-memory rate limiter; resets on server restart.
function createRateLimiter({ windowMs, max }) {
  const store = new Map(); // ip -> { count, resetAt }
  return function rateLimiter(req, res, next) {
    const ip  = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = store.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
    }
    next();
  };
}

const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }); // 10/15 min
const chatRateLimit = createRateLimiter({ windowMs: 60 * 1000,      max: 60 }); // 60/min

app.use(cookieParser());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '../frontend')));

// ── AUTH ──────────────────────────────────────────────────────────────────────

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
};

function setAuthCookie(res, token) {
  res.cookie('st_token', token, COOKIE_OPTS);
}

app.post('/api/auth/register', authRateLimit, async (req, res) => {
  let { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Felder fehlen' });
  email    = String(email).trim();
  password = String(password);
  name     = String(name).trim();
  if (email.length > 254)    return res.status(400).json({ error: 'E-Mail zu lang (max. 254 Zeichen)' });
  if (password.length > 128) return res.status(400).json({ error: 'Passwort zu lang (max. 128 Zeichen)' });
  if (name.length > 100)     return res.status(400).json({ error: 'Name zu lang (max. 100 Zeichen)' });
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  if (password.length < 8) return res.status(400).json({ error: 'Passwort zu kurz (min. 8 Zeichen)' });
  if (await db.users.getByEmail(email)) return res.status(409).json({ error: 'E-Mail vergeben' });
  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  await db.users.create(id, email, hash, name);
  await db.users.updateBalance(500, id);
  const token = jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  setAuthCookie(res, token);
  res.status(201).json({ user: safeUser(await db.users.get(id)) });
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Felder fehlen' });
  email    = String(email).trim();
  password = String(password);
  if (email.length > 254)    return res.status(400).json({ error: 'E-Mail zu lang (max. 254 Zeichen)' });
  if (password.length > 128) return res.status(400).json({ error: 'Passwort zu lang (max. 128 Zeichen)' });
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  const user = await db.users.getByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  setAuthCookie(res, token);
  res.json({ user: safeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('st_token', COOKIE_OPTS);
  res.json({ success: true });
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

app.delete('/api/auth/me', auth, async (req, res) => {
  await db.chats.deleteAll(req.user.id);
  await db.gpts.deleteAll(req.user.id);
  await db.users.delete(req.user.id);
  res.json({ success: true });
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
app.post('/api/keys/validate', authRateLimit, async (req, res) => {
  if (!req.body.key || typeof req.body.key !== 'string') return res.status(400).json({ error: 'Key fehlt' });
  const found = await db.apiKeys.getByKey(req.body.key);
  if (!found) return res.status(401).json({ valid: false });
  // Do not expose userId to prevent user enumeration via key brute-force
  res.json({ valid: true });
});

// ── MODELS ────────────────────────────────────────────────────────────────────

const MODEL_MAP = {
  'Llama 3.3 70B':    'llama-3.3-70b-versatile',
  'Llama 3.1 8B':     'llama-3.1-8b-instant',
  'Gemma 2 9B':       'gemma2-9b-it',
  'Mixtral 8x7B':     'mixtral-8x7b-32768',
  'DeepSeek R1 70B':  'deepseek-r1-distill-llama-70b',
};

const DEFAULT_SYSTEM_PROMPT = `Du bist SingleTokens AI. Antworte IMMER in maximal 2 Sätzen. Keine Gegenfragen. Keine Füllphrasen. Nur die Antwort, nichts mehr. Sprache: Deutsch.`;

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
  if (title.length > 200) return res.status(400).json({ error: 'Titel zu lang (max. 200 Zeichen)' });
  if (!Object.keys(MODEL_MAP).includes(model)) return res.status(400).json({ error: 'Ungültiges Modell' });
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
const CONSUME_MAX = 10000; // prevent draining entire balance in one call

app.post('/api/consume', auth, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Ungültige Menge' });
  if (amount > CONSUME_MAX) return res.status(400).json({ error: `Menge überschreitet Maximum (${CONSUME_MAX})` });
  const newBalance = await db.users.consumeBalance(amount, req.user.id);
  if (newBalance === null) {
    const user = await db.users.get(req.user.id);
    return res.status(402).json({ error: 'Kein Guthaben', balance: user?.balance || 0 });
  }
  res.json({ success: true, balance: newBalance });
});
app.get('/api/transactions', auth, async (req, res) => res.json({ transactions: [] }));

// ── GPTS ──────────────────────────────────────────────────────────────────────

app.get('/api/gpts', auth, async (req, res) => {
  const gpts = await db.gpts.getAll(req.user.id);
  res.json({ gpts });
});
const ALLOWED_MODELS = Object.keys(MODEL_MAP);

function validateGptFields({ name, description, model, prompt, temp, cap, icon }) {
  if (name.length > 100)        return 'Name zu lang (max. 100 Zeichen)';
  if ((description||'').length > 500) return 'Beschreibung zu lang (max. 500 Zeichen)';
  if (prompt.length > 4000)     return 'Prompt zu lang (max. 4000 Zeichen)';
  if (model && !ALLOWED_MODELS.includes(model)) return 'Ungültiges Modell';
  if (temp !== undefined && temp !== null && (typeof temp !== 'number' || temp < 0 || temp > 2)) return 'Temperatur muss zwischen 0 und 2 liegen';
  if (cap !== undefined && cap !== null && (typeof cap !== 'number' || cap < 1)) return 'Ungültiges Token-Limit';
  return null;
}

app.post('/api/gpts', auth, async (req, res) => {
  const { name, description, model, prompt, temp, cap, icon } = req.body;
  if (!name || !prompt) return res.status(400).json({ error: 'Name und Prompt erforderlich' });
  const validationError = validateGptFields({ name, description, model, prompt, temp, cap, icon });
  if (validationError) return res.status(400).json({ error: validationError });
  const id = uuidv4();
  await db.gpts.create(id, req.user.id, name, description||'', model||'Llama 3.3 70B', prompt, temp||0.7, cap||null, icon||'🤖');
  res.status(201).json({ id, name, description, model, prompt, temp, cap, icon });
});
app.patch('/api/gpts/:id', auth, async (req, res) => {
  const { name, description, model, prompt, temp, cap, icon } = req.body;
  if (!name || !prompt) return res.status(400).json({ error: 'Name und Prompt erforderlich' });
  const validationError = validateGptFields({ name, description, model, prompt, temp, cap, icon });
  if (validationError) return res.status(400).json({ error: validationError });
  const existing = await db.gpts.get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'GPT nicht gefunden' });
  await db.gpts.update(name, description||'', model||'Llama 3.3 70B', prompt, temp||0.7, cap||null, icon||'🤖', req.params.id, req.user.id);
  res.json({ success: true });
});
app.delete('/api/gpts/:id', auth, async (req, res) => {
  await db.gpts.delete(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── PAYMENTS ──────────────────────────────────────────────────────────────────

app.post('/api/payment/stripe/create-intent', (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/stripe/webhook',       (_, res) => res.json({ received: true }));
app.post('/api/payment/paypal/create-order',  (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/paypal/capture-order', (_, res) => res.status(503).json({ error: 'Coming soon' }));

// ── GROQ CHAT PROXY ───────────────────────────────────────────────────────────

// NOTE: /api/keys/validate is intentionally public (used by external integrations).
// Only active keys are accepted. In production, consider IP-allowlisting this endpoint.

app.post('/api/chat', auth, chatRateLimit, async (req, res) => {
  try {
    const { message, model, history = [], systemPrompt } = req.body;
    if (!message) return res.status(400).json({ error: 'Nachricht fehlt' });
    if (message.length > 4000) return res.status(400).json({ error: 'Nachricht zu lang (max. 4000 Zeichen)' });
    if (systemPrompt && systemPrompt.length > 4000) return res.status(400).json({ error: 'System-Prompt zu lang (max. 4000 Zeichen)' });

    // Limit history to last 20 entries to prevent prompt-injection via huge payloads
    const safeHistory = (history || []).slice(-20);

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY nicht gesetzt' });

    const modelId = MODEL_MAP[model] || 'llama-3.3-70b-versatile';

    const messages = [];

    // Custom GPT / Personalisierungs-Prompt hat Vorrang, sonst direkter Default
    messages.push({
      role: 'system',
      content: systemPrompt || DEFAULT_SYSTEM_PROMPT
    });

    const validRoles = new Set(['user', 'assistant', 'model']);
    for (const msg of safeHistory) {
      if (msg.role && validRoles.has(msg.role) && msg.content && typeof msg.content === 'string' && msg.content.length <= 4000)
        messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    }

    if (messages[messages.length - 1]?.content !== message)
      messages.push({ role: 'user', content: message });

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId, messages, temperature: 0.7, max_tokens: 250 })
    });

    const data = await groqRes.json();
    if (!groqRes.ok) return res.status(500).json({ error: data.error?.message || 'Groq Fehler' });

    res.json({ reply: data.choices?.[0]?.message?.content || 'Keine Antwort.', model: modelId });

  } catch (err) {
    console.error('Chat Error:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
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
