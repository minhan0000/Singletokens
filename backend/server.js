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
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const app = express();

// The app is served from this same server, so no CORS headers are sent:
// browsers block other websites from calling the API.
// Hosting platforms sit one proxy in front of us; this lets the rate limit see real visitor addresses.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
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

// Express 4 doesn't catch errors in async routes; this passes them to the error handler.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', authLimit, wrap(async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  if (await db.users.getByEmail(email)) return res.status(409).json({ error: 'Email already in use' });
  const hash = await bcrypt.hash(password, 12);
  const id = uuidv4();
  await db.users.create(id, email.trim(), hash, name.trim());
  const token = jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: safeUser(await db.users.get(id)) });
}));

app.post('/api/auth/login', authLimit, wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const user = await db.users.getByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: safeUser(user) });
}));

app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const user = await db.users.get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: safeUser(user) });
}));

app.patch('/api/auth/me', auth, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  await db.users.update(name.slice(0, 60), req.user.id);
  res.json({ user: safeUser(await db.users.get(req.user.id)) });
}));

// Changing email or password needs the current password.
async function checkPassword(userId, password) {
  const user = await db.users.get(userId);
  return user && password && (await bcrypt.compare(password, user.password_hash)) ? user : null;
}

app.patch('/api/auth/email', auth, authLimit, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!(await checkPassword(req.user.id, req.body.password))) return res.status(403).json({ error: 'Wrong password.' });
  const taken = await db.users.getByEmail(email);
  if (taken && taken.id !== req.user.id) return res.status(409).json({ error: 'That email is already in use.' });
  await db.users.setEmail(email, req.user.id);
  res.json({ user: safeUser(await db.users.get(req.user.id)) });
}));

app.patch('/api/auth/password', auth, authLimit, wrap(async (req, res) => {
  const { current, next } = req.body;
  if (!(await checkPassword(req.user.id, current))) return res.status(403).json({ error: 'Wrong password.' });
  if (!next || next.length < MIN_PASSWORD) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters.` });
  await db.users.setPassword(await bcrypt.hash(next, 12), req.user.id);
  res.json({ success: true });
}));

app.delete('/api/auth/me', auth, wrap(async (req, res) => {
  await db.users.deleteEverything(req.user.id);
  res.json({ success: true });
}));

function safeUser(u) {
  return { id: u.id, email: u.email, name: u.name, openrouterConnected: !!u.openrouter_key, created_at: u.created_at };
}

// ── MODELS ────────────────────────────────────────────────────────────────────

// Every text model on OpenRouter with live prices and multipliers.
app.get('/api/models', wrap(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ models: await openrouter.getCatalog() });
}));

app.get('/api/my-models', auth, wrap(async (req, res) => res.json({ ids: await db.myModels.getAll(req.user.id) })));
app.post('/api/my-models', auth, wrap(async (req, res) => {
  if (!(await openrouter.getModel(req.body.id))) return res.status(400).json({ error: 'Unknown model' });
  await db.myModels.add(req.user.id, req.body.id);
  res.status(201).json({ ids: await db.myModels.getAll(req.user.id) });
}));
app.delete('/api/my-models/:id(*)', auth, wrap(async (req, res) => {
  await db.myModels.remove(req.user.id, req.params.id);
  res.json({ ids: await db.myModels.getAll(req.user.id) });
}));

// ── GPTS ──────────────────────────────────────────────────────────────────────

// Cleans what the editor sends, so only known fields with sane values get stored.
async function cleanGpt(body) {
  const num = (v, min, max) => (v === null || v === undefined || v === '' || isNaN(v) ? null : Math.min(max, Math.max(min, Number(v))));
  const s = body.settings || {};
  const maxTokens = num(s.max_tokens, 1, 1e6);
  const g = {
    name: String(body.name || '').trim().slice(0, 60),
    icon: String(body.icon || '').slice(0, 16),
    description: String(body.description || '').trim().slice(0, 160),
    modelId: String(body.modelId || ''),
    instructions: String(body.instructions || '').trim().slice(0, 20000),
    memory: String(body.memory || '').trim().slice(0, 20000),
    settings: {
      temperature: num(s.temperature, 0, 2) ?? 0.7,
      max_tokens: maxTokens === null ? null : Math.round(maxTokens),
      top_p: num(s.top_p, 0, 1),
      top_k: num(s.top_k, 1, 1000),
      frequency_penalty: num(s.frequency_penalty, -2, 2),
      presence_penalty: num(s.presence_penalty, -2, 2),
      stop: (Array.isArray(s.stop) ? s.stop : []).map(String).filter(Boolean).slice(0, 4),
    },
  };
  if (!g.name) return { error: 'Give your GPT a name.' };
  if (!g.instructions) return { error: 'Write some instructions so it knows how to behave.' };
  if (!(await openrouter.getModel(g.modelId))) return { error: 'Pick a model.' };
  if (g.memory) { try { JSON.parse(g.memory); } catch { return { error: 'Memory must be valid JSON.' }; } }
  return { gpt: g };
}

app.get('/api/gpts', auth, wrap(async (req, res) => res.json({ gpts: await db.gpts.getAll(req.user.id) })));
app.post('/api/gpts', auth, wrap(async (req, res) => {
  const { gpt, error } = await cleanGpt(req.body);
  if (error) return res.status(400).json({ error });
  const id = uuidv4();
  await db.gpts.create(id, req.user.id, gpt);
  res.status(201).json({ gpt: await db.gpts.get(id, req.user.id) });
}));
app.put('/api/gpts/:id', auth, wrap(async (req, res) => {
  if (!(await db.gpts.get(req.params.id, req.user.id))) return res.status(404).json({ error: 'Not found' });
  const { gpt, error } = await cleanGpt(req.body);
  if (error) return res.status(400).json({ error });
  await db.gpts.update(req.params.id, req.user.id, gpt);
  res.json({ gpt: await db.gpts.get(req.params.id, req.user.id) });
}));
// Chats with a deleted GPT stay, and continue with the model it used.
app.delete('/api/gpts/:id', auth, wrap(async (req, res) => {
  const gpt = await db.gpts.get(req.params.id, req.user.id);
  if (!gpt) return res.status(404).json({ error: 'Not found' });
  await db.chats.retarget(req.user.id, gpt.id, gpt.modelId);
  await db.gpts.delete(gpt.id, req.user.id);
  res.json({ success: true });
}));

// ── CHATS ─────────────────────────────────────────────────────────────────────

// A chat talks to { kind: 'model', id } or { kind: 'gpt', id } — the GPT must be the user's own.
async function validTarget(t, userId) {
  if (!t || typeof t.id !== 'string') return false;
  if (t.kind === 'model') return !!(await openrouter.getModel(t.id));
  if (t.kind === 'gpt') return !!(await db.gpts.get(t.id, userId));
  return false;
}

app.get('/api/chats', auth, wrap(async (req, res) => res.json({ chats: await db.chats.getAll(req.user.id) })));
app.get('/api/chats/:id', auth, wrap(async (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
  res.json({ chat });
}));
app.post('/api/chats', auth, wrap(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120) || 'New chat';
  if (!(await validTarget(req.body.target, req.user.id))) return res.status(400).json({ error: 'Pick a model or GPT.' });
  const id = uuidv4();
  await db.chats.create(id, req.user.id, title, req.body.target);
  res.status(201).json({ chat: await db.chats.get(id, req.user.id) });
}));
app.patch('/api/chats/:id', auth, wrap(async (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: 'Enter a name.' });
    await db.chats.rename(chat.id, req.user.id, title);
  }
  if (req.body.target !== undefined) {
    if (!(await validTarget(req.body.target, req.user.id))) return res.status(400).json({ error: 'Pick a model or GPT.' });
    await db.chats.setTarget(chat.id, req.user.id, req.body.target);
  }
  res.json({ chat: await db.chats.get(chat.id, req.user.id) });
}));
app.delete('/api/chats/:id', auth, wrap(async (req, res) => {
  await db.chats.delete(req.params.id, req.user.id);
  res.json({ success: true });
}));

// The user's OpenRouter key, or a ready-made error response.
async function userKey(userId, res) {
  const user = await db.users.get(userId);
  if (!user?.openrouter_key) {
    res.status(409).json({ error: 'Connect your OpenRouter account to send messages.', needsConnect: true });
    return null;
  }
  return openrouter.decrypt(user.openrouter_key);
}

// Turns OpenRouter failures into clear messages. Returns true if it answered.
async function providerError(err, userId, res) {
  if (err.status === 401) {
    // The key was deleted on OpenRouter's side.
    await db.users.setOpenRouterKey(null, userId);
    res.status(409).json({ error: 'Your OpenRouter connection expired. Connect again.', needsConnect: true });
    return true;
  }
  if (err.status === 402) {
    res.status(402).json({ error: 'Your OpenRouter credit is empty. Top up on OpenRouter to continue.' });
    return true;
  }
  if (err instanceof openrouter.OpenRouterError) {
    res.status(502).json({ error: err.message });
    return true;
  }
  return false;
}

const creditTokens = async apiKey => {
  const usd = await openrouter.remainingCredit(apiKey).catch(() => null);
  return usd === null ? null : Math.floor(usd * openrouter.TOKENS_PER_USD);
};

// Sends a message: the server builds the full request (history, GPT instructions, memory, settings),
// sends it with the user's own key, and saves both messages with the real cost.
app.post('/api/chats/:id/messages', auth, chatLimit, wrap(async (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message missing' });
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
  const apiKey = await userKey(req.user.id, res);
  if (!apiKey) return;

  let modelId = chat.target.id, gpt = null, settings = {};
  if (chat.target.kind === 'gpt') {
    gpt = await db.gpts.get(chat.target.id, req.user.id);
    if (!gpt) return res.status(400).json({ error: 'This GPT no longer exists. Pick another model.' });
    modelId = gpt.modelId;
    settings = gpt.settings;
  }

  const messages = [];
  if (gpt) messages.push({ role: 'system', content: gpt.instructions + (gpt.memory ? '\n\nMemory (JSON):\n' + gpt.memory : '') });
  for (const m of chat.messages) messages.push({ role: m.role, content: m.content });
  messages.push({ role: 'user', content });

  let json;
  try {
    json = await openrouter.complete({ apiKey, modelId, messages, settings });
  } catch (err) {
    if (await providerError(err, req.user.id, res)) return;
    throw err;
  }

  const cost = openrouter.usdToSingleTokens(await openrouter.costOf(json, modelId));
  const reply = {
    role: 'assistant',
    content: json.choices?.[0]?.message?.content || '',
    modelId,
    ...(gpt ? { gptId: gpt.id } : {}),
    cost,
    at: Date.now(),
  };
  await db.chats.setMessages(chat.id, req.user.id, [...chat.messages, { role: 'user', content, at: Date.now() }, reply]);
  res.json({ reply, creditTokens: await creditTokens(apiKey) });
}));

// ── CUSTOM REQUEST ({ }) ──────────────────────────────────────────────────────

// Sends the exact request the user built, with only known fields, and returns the raw reply.
app.post('/api/custom', auth, chatLimit, wrap(async (req, res) => {
  const b = req.body || {};
  if (!(await openrouter.getModel(b.model))) return res.status(400).json({ error: 'Unknown model' });
  if (!Array.isArray(b.messages) || !b.messages.length) return res.status(400).json({ error: 'Add at least one message' });
  const body = { model: b.model, messages: [] };
  for (const m of b.messages) {
    if (!['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')
      return res.status(400).json({ error: 'Each message needs a role (system, user, assistant) and text' });
    body.messages.push({ role: m.role, content: m.content });
  }
  for (const p of openrouter.PARAMS) if (b[p] !== undefined && b[p] !== null) body[p] = b[p];
  body.usage = { include: true };

  const apiKey = await userKey(req.user.id, res);
  if (!apiKey) return;
  const r = await openrouter.raw(apiKey, body);
  if (r.status === 401) {
    await db.users.setOpenRouterKey(null, req.user.id);
    return res.status(409).json({ error: 'Your OpenRouter connection expired. Connect again.', needsConnect: true });
  }
  const cost = r.status < 400 ? openrouter.usdToSingleTokens(await openrouter.costOf(r.json, body.model)) : 0;
  res.json({ status: r.status, statusText: r.statusText, raw: r.json, cost, ms: r.ms, creditTokens: await creditTokens(apiKey) });
}));

// ── OPENROUTER CONNECTION ─────────────────────────────────────────────────────

app.post('/api/openrouter/connect', auth, authLimit, wrap(async (req, res) => {
  const { code, codeVerifier } = req.body;
  if (!code || !codeVerifier) return res.status(400).json({ error: 'Missing fields' });
  try {
    const key = await openrouter.exchangeCode(code, codeVerifier);
    await db.users.setOpenRouterKey(openrouter.encrypt(key), req.user.id);
    res.json({ connected: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

app.delete('/api/openrouter', auth, wrap(async (req, res) => {
  await db.users.setOpenRouterKey(null, req.user.id);
  res.json({ connected: false });
}));

// Connection state, remaining credit, and the most used model (for the "messages left" line).
app.get('/api/openrouter/status', auth, wrap(async (req, res) => {
  const user = await db.users.get(req.user.id);
  const counts = await db.chats.modelCounts(req.user.id);
  const mostUsedModel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'anthropic/claude-sonnet-4.5';
  if (!user?.openrouter_key) return res.json({ connected: false, mostUsedModel });
  res.json({ connected: true, creditTokens: await creditTokens(openrouter.decrypt(user.openrouter_key)), mostUsedModel });
}));

// ── PAYMENTS (Stripe comes later) ─────────────────────────────────────────────

app.post('/api/payment/stripe/create-intent', (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/stripe/webhook',       (_, res) => res.json({ received: true }));
app.post('/api/payment/paypal/create-order',  (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.post('/api/payment/paypal/capture-order', (_, res) => res.status(503).json({ error: 'Coming soon' }));
app.get('/api/transactions', auth, (req, res) => res.json({ transactions: [] }));

// ── HEALTH + ERRORS ───────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok', version: '3.0.0' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Something went wrong on our side. Try again.' });
});

// ── START ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
async function start() {
  await db.init();
  app.listen(PORT, '0.0.0.0', () => console.log(`✓ Server running on port ${PORT}`));
}
start().catch(err => { console.error('STARTUP ERROR:', err); process.exit(1); });
