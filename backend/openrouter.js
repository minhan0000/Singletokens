// Talks to OpenRouter. Each user connects their own OpenRouter account and pays OpenRouter directly.

const crypto = require('crypto');

const BASE = 'https://openrouter.ai/api/v1';

// SingleTokens is a display unit: 100,000 SingleTokens = $1 of OpenRouter credit, no markup.
const TOKENS_PER_USD = 100000;

// Display name → OpenRouter model id. The full catalog arrives in step 2.
const MODELS = {
  'Claude Sonnet 4.5': 'anthropic/claude-sonnet-4.5',
  'Llama 3.3 70B':     'meta-llama/llama-3.3-70b-instruct',
};

// Prices come from OpenRouter's public model list and are refreshed hourly.
const CACHE_MS = 60 * 60 * 1000;
let catalog = null;
let catalogAt = 0;

async function getModelInfo(modelId) {
  if (!catalog || Date.now() - catalogAt > CACHE_MS) {
    const r = await fetch(`${BASE}/models`);
    if (!r.ok) throw new Error('Could not load model prices');
    const { data } = await r.json();
    catalog = new Map(data.map(m => [m.id, m]));
    catalogAt = Date.now();
  }
  const m = catalog.get(modelId);
  if (!m) throw new Error(`Model ${modelId} is not available`);
  return {
    promptUsd:     Number(m.pricing.prompt),
    completionUsd: Number(m.pricing.completion),
  };
}

function usdToSingleTokens(usd) {
  return Math.ceil(usd * TOKENS_PER_USD);
}

// Errors from OpenRouter keep their HTTP status, so the server can tell
// "key no longer valid" (401) apart from "credit is empty" (402).
class OpenRouterError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function complete({ apiKey, modelId, messages }) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'SingleTokens',
    },
    body: JSON.stringify({ model: modelId, messages, usage: { include: true } }),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new OpenRouterError(data.error?.message || 'Provider error', r.status);
  return data;
}

// Final step of "Connect OpenRouter": trade the one-time code for the user's key.
async function exchangeCode(code, codeVerifier) {
  const r = await fetch(`${BASE}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: 'S256' }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.key) throw new OpenRouterError(data.error?.message || 'Could not connect OpenRouter', r.status);
  return data.key;
}

// Remaining credit in dollars, or null if OpenRouter doesn't tell us.
async function remainingCredit(apiKey) {
  const headers = { 'Authorization': `Bearer ${apiKey}` };
  const credits = await fetch(`${BASE}/credits`, { headers }).catch(() => null);
  if (credits?.ok) {
    const { data } = await credits.json();
    return data.total_credits - data.total_usage;
  }
  const key = await fetch(`${BASE}/key`, { headers }).catch(() => null);
  if (key?.ok) {
    const { data } = await key.json();
    if (typeof data.limit_remaining === 'number') return data.limit_remaining;
  }
  return null;
}

// Stored keys are encrypted with ENCRYPTION_KEY (AES-256-GCM), so a leaked database alone is useless.
const SECRET = () => Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SECRET(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('hex')).join(':');
}

function decrypt(stored) {
  const [iv, tag, data] = stored.split(':').map(h => Buffer.from(h, 'hex'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = {
  MODELS, TOKENS_PER_USD, getModelInfo, usdToSingleTokens,
  complete, exchangeCode, remainingCredit, encrypt, decrypt,
};
