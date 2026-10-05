console.log('=== SERVER STARTING ===');
process.on('uncaughtException', (err) => { console.error('CRASH:', err.message); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('UNHANDLED:', err); process.exit(1); });

require('dotenv').config();
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET is not set'); process.exit(1); }

const path    = require('path');
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const db   = require('./db');
const auth = require('./auth.middleware');
const openrouter = require('./openrouter');

const MIN_PASSWORD = 12;

const app = express();

// The app is served from this same server, so no CORS headers are sent:
// browsers block other websites from calling the API.
// Hosting platforms sit one proxy in front of us; this lets the rate limit see real visitor addresses.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
});
const chatLimit = rateLimit({
  windowMs: 60 * 1000, limit: 20,
  standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => req.user.id,
  message: { error: 'Too many messages. Wait a minute.' },
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', authLimit, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  if (await db.users.getByEmail(email)) return res.status(409).json({ error: 'Email already in use' });
  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  await db.users.create(id, email, hash, name);
  const token = jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: safeUser(await db.users.get(id)) });
});

app.post('/api/auth/login', authLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const user = await db.users.getByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
});

app.get('/api/auth/me',   auth, async (req, res) => {
  const user = await db.users.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user: safeUser(user) });
});
app.patch('/api/auth/me', auth, async (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name missing' });
  await db.users.update(req.body.name, req.user.id);
  res.json({ user: safeUser(await db.users.get(req.user.id)) });
});

app.delete('/api/auth/me', auth, async (req, res) => {
  await db.users.deleteEverything(req.user.id);
  res.json({ success: true });
});

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, balance: u.balance, created_at: u.created_at };
}

// ── CHATS ─────────────────────────────────────────────────────────────────────

app.get('/api/chats',       auth, async (req, res) => res.json({ chats: await db.chats.getAll(req.user.id) }));
app.get('/api/chats/:id',   auth, async (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
  res.json({ chat: { ...chat, messages: JSON.parse(chat.messages) } });
});
app.post('/api/chats',      auth, async (req, res) => {
  const { title, model, messages } = req.body;
  if (!title || !model) return res.status(400).json({ error: 'Missing fields' });
  const id = uuidv4();
  await db.chats.create(id, req.user.id, title, model, JSON.stringify(messages || []));
  res.status(201).json({ id, title, model });
});
app.patch('/api/chats/:id', auth, async (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
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
app.get('/api/transactions', auth, async (req, res) => res.json({ transactions: [] }));

// ── GPTS ──────────────────────────────────────────────────────────────────────

app.get('/api/gpts', auth, async (req, res) => {
  const gpts = await db.gpts.getAll(req.user.id);
  res.json({ gpts });
});
app.post('/api/gpts', auth, async (req, res) => {
  const { name, description, model, prompt, temp, cap, icon } = req.body;
  if (!name || !prompt) return res.status(400).json({ error: 'Name and prompt are required' });
  const id = uuidv4();
  await db.gpts.create(id, req.user.id, name, description||'', model||'Llama 3.3 70B', prompt, temp||0.7, cap||null, icon||'🤖');
  res.status(201).json({ id, name, description, model, prompt, temp, cap, icon });
});
app.patch('/api/gpts/:id', auth, async (req, res) => {
  const { name, description, model, prompt, temp, cap, icon } = req.body;
  if (!name || !prompt) return res.status(400).json({ error: 'Name and prompt are required' });
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

// ── CHAT ──────────────────────────────────────────────────────────────────────

app.post('/api/chat', auth, chatLimit, async (req, res) => {
  try {
    const { message, model, history = [], systemPrompt } = req.body;
    if (!message) return res.status(400).json({ error: 'Message missing' });
    if (!process.env.OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set' });

    const modelId = openrouter.MODELS[model];
    if (!modelId) return res.status(400).json({ error: `Unknown model: ${model}` });

    const user = await db.users.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user.balance <= 0) return res.status(402).json({ error: 'Buy tokens to send messages', balance: 0 });

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    for (const msg of history) {
      if (msg.role && msg.content)
        messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    }
    if (messages[messages.length - 1]?.content !== message)
      messages.push({ role: 'user', content: message });

    // Limit the reply to what the balance can pay for.
    const info = await openrouter.getModelInfo(modelId);
    const maxTokens = openrouter.affordableOutput(info, user.balance, messages);
    if (maxTokens === 0)
      return res.status(402).json({ error: 'Not enough tokens for this message. Buy tokens to continue.', balance: user.balance });

    const data = await openrouter.complete({ modelId, messages, maxTokens });

    // Charge from the real usage the provider reports.
    const usage = data.usage || {};
    const costUsd = typeof usage.cost === 'number'
      ? usage.cost
      : (usage.prompt_tokens || 0) * info.promptUsd + (usage.completion_tokens || 0) * info.completionUsd;
    const cost = openrouter.usdToSingleTokens(costUsd);
    const balance = await db.users.charge(cost, req.user.id);

    res.json({
      reply: data.choices?.[0]?.message?.content || 'No reply.',
      model: modelId,
      cost,
      balance,
      truncated: data.choices?.[0]?.finish_reason === 'length',
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/models', (_, res) => res.json({
  default: 'Llama 3.3 70B',
  models: Object.entries(openrouter.MODELS).map(([name, id]) => ({ id, name })),
}));

// ── HEALTH ────────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok', version: '3.0.0' }));

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
async function start() {
  await db.init();
  app.listen(PORT, '0.0.0.0', () => console.log(`✓ Server running on port ${PORT}`));
}
start().catch(err => { console.error('STARTUP ERROR:', err); process.exit(1); });
