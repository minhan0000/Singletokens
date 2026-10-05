// Talks to OpenRouter and turns real provider costs into SingleTokens.

const BASE = 'https://openrouter.ai/api/v1';

// 100,000 SingleTokens = €1, markup included.
const TOKENS_PER_EUR = 100000;
const MARKUP = 1.35;
// Providers bill in US dollars. We treat $1 as €1; the difference is extra margin.
const EUR_PER_USD = 1;

// Display name → OpenRouter model id. The full catalog arrives in step 2.
const MODELS = {
  'Claude Sonnet 4.5': 'anthropic/claude-sonnet-4.5',
  'Llama 3.3 70B':     'meta-llama/llama-3.3-70b-instruct',
};

// Prices come from OpenRouter's model list and are refreshed hourly.
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
    maxOutput:     m.top_provider?.max_completion_tokens || null,
  };
}

function usdToSingleTokens(usd) {
  return Math.max(1, Math.ceil(usd * EUR_PER_USD * MARKUP * TOKENS_PER_EUR));
}

function singleTokensToUsd(tokens) {
  return tokens / (TOKENS_PER_EUR * MARKUP * EUR_PER_USD);
}

// How many reply tokens the balance can pay for, after a cautious guess at the input cost.
// Returns 0 if not even the input is affordable, or null if there's no need to limit the reply.
function affordableOutput(info, balance, messages) {
  const chars = messages.reduce((n, m) => n + String(m.content).length, 0);
  const inputGuess = Math.ceil(chars / 3) + 10 * messages.length;
  const leftUsd = singleTokensToUsd(balance) - inputGuess * info.promptUsd;
  if (leftUsd <= 0) return 0;
  if (info.completionUsd <= 0) return null;
  const tokens = Math.floor(leftUsd / info.completionUsd);
  if (info.maxOutput && tokens >= info.maxOutput) return null;
  return tokens;
}

async function complete({ modelId, messages, maxTokens }) {
  const body = { model: modelId, messages, usage: { include: true } };
  if (maxTokens) body.max_tokens = maxTokens;
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'SingleTokens',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || 'Provider error');
  return data;
}

module.exports = { MODELS, getModelInfo, affordableOutput, complete, usdToSingleTokens };
