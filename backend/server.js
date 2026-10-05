console.log('=== SERVER STARTING ===');
process.on('uncaughtException', (err) => { console.error('CRASH:', err.message); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('UNHANDLED:', err); process.exit(1); });

require('dotenv').config();
for (const name of ['JWT_SECRET', 'ENCRYPTION_KEY'])
  if (!process.env[name]) { console.error(`${name} is not set`); process.exit(1); }
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY)) { console.error('ENCRYPTION_KEY must be 64 hex characters'); process.exit(1); }

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
  return { id: u.id, email: u.email, name: u.name, openrouterConnected: !!u.openrouter_key, created_at: u.created_at };
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

// ── OPENROUTER CONNECTION ─────────────────────────────────────────────────────

app.post('/api/openrouter/connect', auth, authLimit, async (req, res) => {
  const { code, codeVerifier } = req.body;
  if (!code || !codeVerifier) return res.status(400).json({ error: 'Missing fields' });
  try {
    const key = await openrouter.exchangeCode(code, codeVerifier);
    await db.users.setOpenRouterKey(openrouter.encrypt(key), req.user.id);
    res.json({ connected: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/openrouter', auth, async (req, res) => {
  await db.users.setOpenRouterKey(null, req.user.id);
  res.json({ connected: false });
});

// Connection state and remaining OpenRouter credit, in dollars and SingleTokens.
app.get('/api/openrouter/status', auth, async (req, res) => {
  const user = await db.users.get(req.user.id);
  if (!user?.openrouter_key) return res.json({ connected: false });
  const usd = await openrouter.remainingCredit(openrouter.decrypt(user.openrouter_key));
  res.json({
    connected: true,
    creditUsd: usd,
    creditTokens: usd === null ? null : Math.floor(usd * openrouter.TOKENS_PER_USD),
  });
});

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

app.get('/api/transactions', auth, async (req, res) => res.json({ transactions: [] }));

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

    const modelId = openrouter.MODELS[model];
    if (!modelId) return res.status(400).json({ error: `Unknown model: ${model}` });

    const user = await db.users.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (!user.openrouter_key)
      return res.status(409).json({ error: 'Connect your OpenRouter account to send messages.', needsConnect: true });

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    for (const msg of history) {
      if (msg.role && msg.content)
        messages.push({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content });
    }
    if (messages[messages.length - 1]?.content !== message)
      messages.push({ role: 'user', content: message });

    let data;
    try {
      data = await openrouter.complete({ apiKey: openrouter.decrypt(user.openrouter_key), modelId, messages });
    } catch (err) {
      if (err.status === 401) {
        // The key was deleted on OpenRouter's side.
        await db.users.setOpenRouterKey(null, req.user.id);
        return res.status(409).json({ error: 'Your OpenRouter connection expired. Connect again.', needsConnect: true });
      }
      if (err.status === 402)
        return res.status(402).json({ error: 'Your OpenRouter credit is empty. Top up on OpenRouter to continue.' });
      throw err;
    }

    // Cost as OpenRouter reports it, with a fallback from token counts × list prices.
    const usage = data.usage || {};
    let costUsd = usage.cost;
    if (typeof costUsd !== 'number') {
      const info = await openrouter.getModelInfo(modelId);
      costUsd = (usage.prompt_tokens || 0) * info.promptUsd + (usage.completion_tokens || 0) * info.completionUsd;
    }

    res.json({
      reply: data.choices?.[0]?.message?.content || 'No reply.',
      model: modelId,
      costUsd,
      cost: openrouter.usdToSingleTokens(costUsd),
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
