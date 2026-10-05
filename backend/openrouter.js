// Talks to OpenRouter. Each user connects their own OpenRouter account and pays OpenRouter directly.

const crypto = require('crypto');

const BASE = 'https://openrouter.ai/api/v1';

// SingleTokens is a display unit: 100,000 SingleTokens = $1 of OpenRouter credit, no markup.
const TOKENS_PER_USD = 100000;

// Multipliers compare every model to this one (1.00x).
const BASE_MODEL = 'anthropic/claude-sonnet-4.5';

// Settings users can change, besides model and messages.
const PARAMS = ['temperature', 'max_tokens', 'top_p', 'top_k', 'frequency_penalty', 'presence_penalty', 'stop'];

// Provider prefix in the model id → color key used by the frontend.
const COLORS = { anthropic: 'anthropic', openai: 'openai', google: 'google', 'meta-llama': 'meta', mistralai: 'mistral', deepseek: 'deepseek' };
// Readable provider names when the model name doesn't include one.
const PROVIDERS = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', 'meta-llama': 'Meta', mistralai: 'Mistral', deepseek: 'DeepSeek', 'x-ai': 'xAI', qwen: 'Qwen', cohere: 'Cohere', perplexity: 'Perplexity', microsoft: 'Microsoft', amazon: 'Amazon', nvidia: 'NVIDIA' };
const providerName = prefix => PROVIDERS[prefix] || prefix.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// ── Catalog ─────────────────────────────────────────────────────────────────
// Every model on OpenRouter that answers in text, with live prices. Refreshed hourly.

const CACHE_MS = 60 * 60 * 1000;
let catalog = null;
let catalogAt = 0;

function toModel(m) {
  const prefix = m.id.split('/')[0];
  const [provider, modelName] = m.name.includes(': ') ? m.name.split(/: (.+)/) : [providerName(prefix), m.name];
  const arch = m.architecture || {};
  const inputs = arch.input_modalities || (arch.modality || '').split('->')[0].split('+');
  return {
    id: m.id,
    name: modelName,
    provider,
    p: COLORS[prefix] || 'other',
    promptUsd: Number(m.pricing?.prompt) || 0,
    completionUsd: Number(m.pricing?.completion) || 0,
    context: m.context_length || 0,
    images: inputs.includes('image'),
    files: true,
    params: (m.supported_parameters || PARAMS).filter(p => PARAMS.includes(p) && p !== 'temperature' && p !== 'max_tokens'),
  };
}

async function getCatalog() {
  if (catalog && Date.now() - catalogAt < CACHE_MS) return catalog;
  const r = await fetch(`${BASE}/models`);
  if (!r.ok) {
    if (catalog) return catalog;  // keep serving the last good list
    throw new Error('Could not load the model list');
  }
  const { data } = await r.json();
  const textModels = data.filter(m => {
    const arch = m.architecture || {};
    const outputs = arch.output_modalities || [(arch.modality || 'text').split('->')[1] || 'text'];
    return outputs.includes('text') && Number(m.pricing?.prompt) >= 0 && Number(m.pricing?.completion) >= 0;
  }).map(toModel);
  const base = textModels.find(m => m.id === BASE_MODEL) || { promptUsd: 3e-6, completionUsd: 15e-6 };
  for (const m of textModels) m.mult = (m.promptUsd + m.completionUsd) / (base.promptUsd + base.completionUsd);
  catalog = textModels;
  catalogAt = Date.now();
  return catalog;
}

async function getModel(id) {
  return (await getCatalog()).find(m => m.id === id) || null;
}

const usdToSingleTokens = usd => Math.ceil(usd * TOKENS_PER_USD);

// ── Requests ────────────────────────────────────────────────────────────────

// Errors keep their HTTP status, so the server can tell "key no longer valid" (401) from "credit is empty" (402).
class OpenRouterError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Sends a request body as-is. Returns status, raw reply and how long it took.
async function raw(apiKey, body) {
  const started = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'SingleTokens' },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({ error: { message: 'The provider sent an unreadable reply' } }));
  return { status: r.status, statusText: r.statusText, json, ms: Date.now() - started };
}

// A normal chat request. Throws OpenRouterError on failure.
async function complete({ apiKey, modelId, messages, settings = {} }) {
  const body = { model: modelId, messages, usage: { include: true } };
  for (const p of PARAMS) {
    const v = settings[p];
    if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length)) body[p] = v;
  }
  const { status, json } = await raw(apiKey, body);
  if (status >= 400 || json.error) throw new OpenRouterError(json.error?.message || 'Provider error', json.error?.code || status);
  return json;
}

// Cost of a reply in dollars: what OpenRouter reports, or token counts × list prices.
async function costOf(json, modelId) {
  const usage = json.usage || {};
  if (typeof usage.cost === 'number') return usage.cost;
  const m = await getModel(modelId);
  return m ? (usage.prompt_tokens || 0) * m.promptUsd + (usage.completion_tokens || 0) * m.completionUsd : 0;
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

// ── Key encryption ──────────────────────────────────────────────────────────
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
  TOKENS_PER_USD, PARAMS, getCatalog, getModel, usdToSingleTokens,
  raw, complete, costOf, exchangeCode, remainingCredit, encrypt, decrypt, OpenRouterError,
};
