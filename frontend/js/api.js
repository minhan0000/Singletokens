// Data layer. Right now everything is FAKE data kept in memory, so screens can be built and
// reviewed first. When a screen is approved, its functions here get swapped for real
// requests to the backend. Function names and return shapes stay the same.

const TOKENS_PER_USD = 100000;
const wait = ms => new Promise(r => setTimeout(r, ms));

// ── Models ──────────────────────────────────────────────────────────────────
// Prices are dollars per token, as OpenRouter reports them.

const MODELS = [
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', p: 'anthropic', promptUsd: 3e-6, completionUsd: 15e-6, context: 1000000, images: true, files: true },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'Anthropic', p: 'anthropic', promptUsd: 1e-6, completionUsd: 5e-6, context: 200000, images: true, files: true },
  { id: 'openai/gpt-5', name: 'GPT-5', provider: 'OpenAI', p: 'openai', promptUsd: 1.25e-6, completionUsd: 10e-6, context: 400000, images: true, files: true },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', p: 'google', promptUsd: 1.25e-6, completionUsd: 10e-6, context: 1000000, images: true, files: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta', p: 'meta', promptUsd: 0.1e-6, completionUsd: 0.25e-6, context: 131000, images: false, files: true },
  { id: 'deepseek/deepseek-chat-v3', name: 'DeepSeek V3', provider: 'DeepSeek', p: 'deepseek', promptUsd: 0.27e-6, completionUsd: 1.1e-6, context: 164000, images: false, files: true },
  { id: 'mistralai/mistral-large', name: 'Mistral Large', provider: 'Mistral', p: 'mistral', promptUsd: 2e-6, completionUsd: 6e-6, context: 128000, images: false, files: true },
];

// Multiplier = this model's price ÷ Claude Sonnet 4.5's price (input + output per token).
const BASE = MODELS[0];
for (const m of MODELS) m.mult = (m.promptUsd + m.completionUsd) / (BASE.promptUsd + BASE.completionUsd);

export const getModel = id => MODELS.find(m => m.id === id);
export async function getCatalog() { return MODELS; }

// The user's own models ("Your models"), in the order they added them.
let myModelIds = ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.5-pro'];
export async function getMyModels() { return myModelIds.map(getModel); }
export async function addMyModel(id) { if (!myModelIds.includes(id)) myModelIds.push(id); }
export async function removeMyModel(id) { myModelIds = myModelIds.filter(x => x !== id); }

// ── User ────────────────────────────────────────────────────────────────────

const user = { name: 'Edo', email: 'edo@example.com', openrouterConnected: true, creditTokens: 750000 };
export async function getUser() { return { ...user }; }

// ── GPTs ────────────────────────────────────────────────────────────────────

const GPTS = [
  { id: 'gpt-study', name: 'Study Buddy', icon: '📚', modelId: 'openai/gpt-5', description: 'Quizzes me on French verbs and explains mistakes in English, short and friendly.' },
  { id: 'gpt-code', name: 'Code Helper', icon: 'C', modelId: 'anthropic/claude-sonnet-4.5', description: 'Reviews JavaScript backend code, points out bugs first and suggests the smallest fix.' },
];
export const getGpt = id => GPTS.find(g => g.id === id);
export async function getGpts() { return GPTS; }

// ── Chats ───────────────────────────────────────────────────────────────────
// A chat talks to a "target": { kind: 'model', id } or { kind: 'gpt', id }.

const ago = min => Date.now() - min * 60000;
let chats = [
  {
    id: 'c1', title: 'Read a JSON file in Node', target: { kind: 'gpt', id: 'gpt-code' }, updatedAt: ago(3),
    messages: [
      { role: 'user', content: 'Can you show me how to read a JSON file in Node?' },
      { role: 'assistant', content: 'Sure. Use `fs/promises` and **JSON.parse**:\n\n```js\nimport { readFile } from \'fs/promises\';\n\nconst data = JSON.parse(await readFile(\'config.json\', \'utf8\'));\nconsole.log(data.port);\n```\n\n| Method | Blocks the server? |\n|---|---|\n| `readFile` | No |\n| `readFileSync` | Yes |\n\nUse `readFile` inside request handlers so other users don\'t wait.', modelId: 'anthropic/claude-sonnet-4.5', gptId: 'gpt-code', cost: 1214 },
      { role: 'user', content: 'And if the file is missing?' },
      { role: 'assistant', content: 'Wrap it in `try/catch` and check `err.code === \'ENOENT\'` — that means the file doesn\'t exist.', modelId: 'anthropic/claude-sonnet-4.5', gptId: 'gpt-code', cost: 655 },
    ],
  },
  { id: 'c2', title: 'Product roadmap discussion', target: { kind: 'model', id: 'anthropic/claude-sonnet-4.5' }, updatedAt: ago(90), messages: [
    { role: 'user', content: 'Give me 3 ideas for v2.' },
    { role: 'assistant', content: '1. **Saved presets** for custom requests\n2. **Shared GPTs** between friends\n3. A **usage dashboard** per model', modelId: 'anthropic/claude-sonnet-4.5', cost: 512 },
  ] },
  { id: 'c3', title: 'French verbs quiz', target: { kind: 'gpt', id: 'gpt-study' }, updatedAt: ago(60 * 26), messages: [
    { role: 'user', content: 'Quiz me on "être" in the passé composé.' },
    { role: 'assistant', content: 'Let\'s go! How do you say **"we went"** using *aller*?', modelId: 'openai/gpt-5', gptId: 'gpt-study', cost: 96 },
  ] },
  { id: 'c4', title: 'Minecraft PvP server plugin ideas', target: { kind: 'model', id: 'meta-llama/llama-3.3-70b-instruct' }, updatedAt: ago(60 * 50), messages: [
    { role: 'user', content: 'Ideas for a PvP plugin?' },
    { role: 'assistant', content: 'Kill streak rewards, a bounty board, and a 1v1 queue with ELO.', modelId: 'meta-llama/llama-3.3-70b-instruct', cost: 3 },
  ] },
  { id: 'c5', title: 'Explain database indexes', target: { kind: 'model', id: 'anthropic/claude-sonnet-4.5' }, updatedAt: ago(60 * 80), messages: [] },
];

export async function getChats() {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt).map(({ messages, ...c }) => c);
}
export async function getChat(id) { return chats.find(c => c.id === id) || null; }

export async function createChat(target, title) {
  const chat = { id: 'c' + Date.now(), title, target, updatedAt: Date.now(), messages: [] };
  chats.push(chat);
  return chat;
}
export async function renameChat(id, title) { const c = chats.find(c => c.id === id); if (c) c.title = title; }
export async function deleteChat(id) { chats = chats.filter(c => c.id !== id); }
export async function setChatTarget(id, target) { const c = chats.find(c => c.id === id); if (c) c.target = target; }

// The 3 most recently used models or GPTs, newest first.
export async function getRecentTargets() {
  const seen = new Set(), out = [];
  for (const c of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const key = c.target.kind + ':' + c.target.id;
    if (!seen.has(key)) { seen.add(key); out.push(c.target); }
    if (out.length === 3) break;
  }
  return out;
}

// ── Cost estimates ──────────────────────────────────────────────────────────

// Rough token count: ~4 characters per token.
export const roughTokens = text => Math.ceil(String(text).length / 4);

// What the next message costs to SEND (the whole history is re-sent) and a rough reply cost.
export function estimate(modelId, history, draft, systemPrompt = '') {
  const m = getModel(modelId);
  const inTokens = roughTokens(systemPrompt) + history.reduce((n, msg) => n + roughTokens(msg.content), 0) + roughTokens(draft);
  return {
    input: Math.ceil(inTokens * m.promptUsd * TOKENS_PER_USD),
    output: Math.ceil(400 * m.completionUsd * TOKENS_PER_USD),
  };
}

// ── Sending ─────────────────────────────────────────────────────────────────

const FAKE_REPLIES = [
  'Good question! Here\'s the short version:\n\n- **Indexes** make lookups fast, like the index at the back of a book.\n- They cost a bit of disk space and slow down writes slightly.\n\n```sql\nCREATE INDEX idx_users_email ON users (email);\n```',
  'This is a **fake reply** — the screen is running on fake data. Once it\'s approved, real answers come from OpenRouter.',
];

export async function sendMessage(chatId, content) {
  const chat = chats.find(c => c.id === chatId);
  const modelId = chat.target.kind === 'gpt' ? getGpt(chat.target.id).modelId : chat.target.id;
  const est = estimate(modelId, chat.messages, content);
  chat.messages.push({ role: 'user', content });
  await wait(1400);
  const reply = {
    role: 'assistant',
    content: FAKE_REPLIES[chat.messages.length % FAKE_REPLIES.length],
    modelId,
    gptId: chat.target.kind === 'gpt' ? chat.target.id : undefined,
    cost: est.input + est.output,
  };
  chat.messages.push(reply);
  chat.updatedAt = Date.now();
  user.creditTokens = Math.max(0, user.creditTokens - reply.cost);
  return { reply, creditTokens: user.creditTokens };
}
