require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./db');
const auth = require('./auth.middleware');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Stripe webhook needs raw body
app.use('/api/payment/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ════════════════════════════════════════
//   AUTH
// ════════════════════════════════════════

// Register
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

  // Give new users 500 free tokens
  await db.users.updateBalance(500, id);

  const token = jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '30d' });
  const user = await db.users.get(id);
  res.status(201).json({ token, user: safeUser(user) });
});

// Login
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

// Get current user
app.get('/api/auth/me', auth, (req, res) => {
  const user = await db.users.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User nicht gefunden' });
  res.json({ user: safeUser(user) });
});

// Update profile
app.patch('/api/auth/me', auth, (req, res) => {
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

app.get('/api/keys', auth, (req, res) => {
  const keys = await db.apiKeys.getAll(req.user.id);
  // Mask keys
  const masked = keys.map(k => ({ ...k, key: k.key.slice(0, 12) + '••••' + k.key.slice(-4) }));
  res.json({ keys: masked });
});

app.post('/api/keys', auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const key = 'sk-st-' + uuidv4().replace(/-/g, '');
  const id = uuidv4();
  await db.apiKeys.create(id, req.user.id, name, key);
  // Return full key once
  res.status(201).json({ id, name, key, active: true });
});

app.patch('/api/keys/:id/revoke', auth, (req, res) => {
  const result = await db.apiKeys.revoke(req.params.id, req.user.id);
  const result =  return res.status(404).json({ error: 'Key nicht gefunden' });
  res.json({ success: true });
});

app.delete('/api/keys/:id', auth, (req, res) => {
  const result = await db.apiKeys.delete(req.params.id, req.user.id);
  const result =  return res.status(404).json({ error: 'Key nicht gefunden' });
  res.json({ success: true });
});

// Validate API key (for external use)
app.post('/api/keys/validate', (req, res) => {
  const { key } = req.body;
  const found = await db.apiKeys.getByKey(key);
  if (!found) return res.status(401).json({ valid: false });
  const user = await db.users.get(found.user_id);
  res.json({ valid: true, userId: found.user_id, balance: user?.balance || 0 });
});

// ════════════════════════════════════════
//   CHAT HISTORY
// ════════════════════════════════════════

app.get('/api/chats', auth, (req, res) => {
  const chats = await db.chats.getAll(req.user.id);
  res.json({ chats });
});

app.get('/api/chats/:id', auth, (req, res) => {
  const chat = await db.chats.get(req.params.id, req.user.id);
  if (!chat) return res.status(404).json({ error: 'Chat nicht gefunden' });
  res.json({ chat: { ...chat, messages: JSON.parse(chat.messages) } });
});

app.post('/api/chats', auth, (req, res) => {
  const { title, model, messages } = req.body;
  if (!title || !model) return res.status(400).json({ error: 'Titel und Modell erforderlich' });
  const id = uuidv4();
  await db.chats.create(id, req.user.id, title, model, JSON.stringify(messages || []));
  res.status(201).json({ id, title, model });
});

app.patch('/api/chats/:id', auth, (req, res) => {
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

app.delete('/api/chats/:id', auth, (req, res) => {
  const result = await db.chats.delete(req.params.id, req.user.id);
  const result =  return res.status(404).json({ error: 'Chat nicht gefunden' });
  res.json({ success: true });
});

app.delete('/api/chats', auth, (req, res) => {
  await db.chats.deleteAll(req.user.id);
  res.json({ success: true });
});

// ════════════════════════════════════════
//   TOKENS / BALANCE
// ════════════════════════════════════════

app.get('/api/balance', auth, (req, res) => {
  const user = await db.users.get(req.user.id);
  res.json({ balance: user?.balance || 0 });
});

app.post('/api/consume', auth, (req, res) => {
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
//   STRIPE PAYMENTS
// ════════════════════════════════════════

app.post('/api/payment/stripe/create-intent', auth, async (req, res) => {
  try {
    const { tokens, amount } = req.body;
    const txId = uuidv4();

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      metadata: { userId: req.user.id, tokens: String(tokens), txId },
      automatic_payment_methods: { enabled: true },
    });

    await db.transactions.create(txId, req.user.id, tokens, amount, 'card', intent.id, null);
    res.json({ clientSecret: intent.client_secret, txId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const tx = await db.transactions.getByStripe(intent.id);
    if (tx && tx.status === 'pending') {
      await db.users.updateBalance(tx.tokens, tx.user_id);
      await db.transactions.update('completed', tx.id);
      console.log(`✓ Stripe: +${tx.tokens} Tokens für User ${tx.user_id}`);
    }
  }
  res.json({ received: true });
});

// ════════════════════════════════════════
//   PAYPAL PAYMENTS
// ════════════════════════════════════════

async function getPaypalToken() {
  const res = await fetch(
    process.env.PAYPAL_SANDBOX === 'true'
      ? 'https://api-m.sandbox.paypal.com/v1/oauth2/token'
      : 'https://api-m.paypal.com/v1/oauth2/token',
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  );
  const data = await res.json();
  return data.access_token;
}

app.post('/api/payment/paypal/create-order', auth, async (req, res) => {
  try {
    const { tokens, amount } = req.body;
    const txId = uuidv4();
    const token = await getPaypalToken();
    const base = process.env.PAYPAL_SANDBOX === 'true' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

    const order = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: amount.toFixed(2) },
          custom_id: JSON.stringify({ userId: req.user.id, tokens, txId }),
        }],
        application_context: {
          return_url: `${process.env.FRONTEND_URL}/payment-success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
        },
      }),
    }).then(r => r.json());

    await db.transactions.create(txId, req.user.id, tokens, amount, 'paypal', null, order.id);
    res.json({ orderId: order.id, txId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/paypal/capture-order', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const token = await getPaypalToken();
    const base = process.env.PAYPAL_SANDBOX === 'true' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

    const capture = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }).then(r => r.json());

    if (capture.status === 'COMPLETED') {
      const customId = JSON.parse(capture.purchase_units[0].payments.captures[0].custom_id);
      const tx = await db.transactions.getByPaypal(orderId);
      if (tx && tx.status === 'pending') {
        await db.users.updateBalance(customId.tokens, customId.userId);
        await db.transactions.update('completed', tx.id);
        console.log(`✓ PayPal: +${customId.tokens} Tokens für User ${customId.userId}`);
      }
      res.json({ success: true, tokens: customId.tokens });
    } else {
      res.status(400).json({ error: 'Zahlung nicht abgeschlossen' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transactions history
app.get('/api/transactions', auth, (req, res) => {
  const txs = await db.transactions.getAll(req.user.id);
  res.json({ transactions: txs });
});

// ════════════════════════════════════════
//   GEMINI CHAT (Standard-KI)
// ════════════════════════════════════════

const DEFAULT_MODEL = 'gemini-2.0-flash';

app.post('/api/chat', auth, async (req, res) => {
  try {
    const { message, model, history = [], systemPrompt } = req.body;
    if (!message) return res.status(400).json({ error: 'Nachricht erforderlich' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Kein Gemini API Key konfiguriert' });

    // Token-Kosten berechnen (ca. 500 Tokens pro Nachricht)
    const tokenCost = 500;
    const user = await db.users.get(req.user.id);
    if (!user || user.balance < tokenCost) {
      return res.status(402).json({ error: 'Kein Guthaben', balance: user?.balance || 0 });
    }

    // Gemini API aufrufen
    const modelName = model || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Konvertiere Chat-History ins Gemini Format
    const contents = [];

    if (history.length > 0) {
      for (const msg of history) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Aktuelle Nachricht hinzufügen
    contents.push({ role: 'user', parts: [{ text: message }] });

    const body = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      }
    };

    // System-Prompt falls vorhanden
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('Gemini Error:', data);
      return res.status(500).json({ error: data.error?.message || 'Gemini Fehler' });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Tokens abziehen
    await db.users.updateBalance(-tokenCost, req.user.id);
    const updatedUser = await db.users.get(req.user.id);

    res.json({
      reply,
      model: modelName,
      tokensUsed: tokenCost,
      balance: updatedUser.balance
    });

  } catch (err) {
    console.error('Chat Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verfügbare Gemini Modelle
app.get('/api/models', (req, res) => {
  res.json({
    default: DEFAULT_MODEL,
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', mult: 0.5 },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', mult: 0.25 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', mult: 2.33 },
    ]
  });
});

// ════════════════════════════════════════
//   HEALTH CHECK
// ════════════════════════════════════════

app.get('/health', (_, res) => res.json({ status: 'ok', version: '2.0.0' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ SingleTokens Backend v2 läuft auf Port ${PORT}`));
