// Data layer: every screen gets its data through these functions, which talk to the backend.
// Models and GPTs are also kept in memory, so screens can look them up instantly (getModel, getGpt).

const TOKENS_PER_USD = 100000;

// ── Requests ────────────────────────────────────────────────────────────────

const token = () => { try { return localStorage.getItem('st_token'); } catch { return null; } };

function logout() {
  try { localStorage.removeItem('st_token'); localStorage.removeItem('st_user'); } catch {}
  location.href = '/login.html';
}

// Calls the backend. Throws an Error with the server's message (and .status, .data) on failure.
async function request(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Server unreachable. Check your connection and try again.');
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { logout(); throw new Error('Logged out'); }
  if (!r.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: r.status, data });
  return data;
}

// ── Startup ─────────────────────────────────────────────────────────────────

let catalog = [], catalogById = new Map(), gpts = [], chatList = [];
const chatCache = new Map();

// Loads everything the app needs before the first screen. Sends logged-out visitors to the login page.
export async function init() {
  if (!token()) { logout(); return new Promise(() => {}); }
  const [models] = await Promise.all([request('/api/models'), getGpts(), getChats()]);
  catalog = models.models;
  catalogById = new Map(catalog.map(m => [m.id, m]));
}

// ── Models ──────────────────────────────────────────────────────────────────

// A model that left OpenRouter still needs a name and a color for old chats.
const missingModel = id => ({ id, name: id.split('/').pop(), provider: id.split('/')[0], p: 'other', promptUsd: 0, completionUsd: 0, context: 0, images: false, files: true, params: [], mult: 0 });

export const getModel = id => catalogById.get(id) || missingModel(id);
export async function getCatalog() { return catalog; }

export async function getMyModels() { return (await request('/api/my-models')).ids.map(getModel); }
export async function addMyModel(id) { await request('/api/my-models', { method: 'POST', body: { id } }); }
export async function removeMyModel(id) { await request('/api/my-models/' + encodeURIComponent(id), { method: 'DELETE' }); }

// ── User + OpenRouter ───────────────────────────────────────────────────────

let statusPromise = null;

export async function getUser() {
  statusPromise = request('/api/openrouter/status');
  const [{ user }, status] = await Promise.all([request('/api/auth/me'), statusPromise]);
  try { localStorage.setItem('st_user', JSON.stringify(user)); } catch {}
  return { ...user, openrouterConnected: status.connected, creditTokens: status.creditTokens ?? 0, creditKnown: typeof status.creditTokens === 'number' };
}

// "Connect OpenRouter": go to OpenRouter to approve. It sends the user back to connect.html with a one-time code.
export async function connectOpenRouter() {
  const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('st_or_verifier', verifier);
  const callback = encodeURIComponent(location.origin + '/connect.html');
  location.href = `https://openrouter.ai/auth?callback_url=${callback}&code_challenge=${b64url(hash)}&code_challenge_method=S256`;
  return new Promise(() => {});  // the page is leaving
}
export async function disconnectOpenRouter() { await request('/api/openrouter', { method: 'DELETE' }); }

// The model the user sends the most messages with (Claude Sonnet 4.5 for new users).
export async function getMostUsedModel() {
  const status = await (statusPromise || request('/api/openrouter/status'));
  return getModel(status.mostUsedModel);
}

// What a typical message (500 tokens in, 500 out) costs with a model, in SingleTokens.
export const typicalMessageCost = m => Math.ceil((500 * m.promptUsd + 500 * m.completionUsd) * TOKENS_PER_USD);

// ── GPTs ────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { temperature: 0.7, max_tokens: null, top_p: null, top_k: null, frequency_penalty: null, presence_penalty: null, stop: [] };

export const getGpt = id => gpts.find(g => g.id === id);
export async function getGpts() {
  gpts = (await request('/api/gpts')).gpts.map(g => ({ ...g, settings: { ...DEFAULT_SETTINGS, ...g.settings } }));
  return gpts;
}
export const newGptDraft = () => ({ id: null, name: '', icon: '', modelId: 'anthropic/claude-sonnet-4.5', description: '', instructions: '', memory: '', settings: structuredClone(DEFAULT_SETTINGS) });

export async function saveGpt(g) {
  const { gpt } = g.id
    ? await request('/api/gpts/' + g.id, { method: 'PUT', body: g })
    : await request('/api/gpts', { method: 'POST', body: g });
  await getGpts();
  return gpt;
}
// Chats with a deleted GPT stay, and continue with the model it used.
export async function deleteGpt(id) {
  await request('/api/gpts/' + id, { method: 'DELETE' });
  chatCache.clear();
  await Promise.all([getGpts(), getChats()]);
}

// ── Chats ───────────────────────────────────────────────────────────────────
// A chat talks to a "target": { kind: 'model', id } or { kind: 'gpt', id }.

export async function getChats() {
  chatList = (await request('/api/chats')).chats;
  return chatList;
}

// The chat object is kept, so the chat screen and sendMessage share the same message list.
export async function getChat(id) {
  try {
    const { chat } = await request('/api/chats/' + encodeURIComponent(id));
    chatCache.set(id, chat);
    return chat;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function createChat(target, title) {
  const { chat } = await request('/api/chats', { method: 'POST', body: { target, title } });
  chatCache.set(chat.id, chat);
  return chat;
}
export async function renameChat(id, title) { await request('/api/chats/' + id, { method: 'PATCH', body: { title } }); }
export async function deleteChat(id) { await request('/api/chats/' + id, { method: 'DELETE' }); chatCache.delete(id); }
export async function setChatTarget(id, target) { await request('/api/chats/' + id, { method: 'PATCH', body: { target } }); }

// The 3 most recently used models or GPTs, newest first.
export async function getRecentTargets() {
  const seen = new Set(), out = [];
  for (const c of chatList) {
    if (c.target.kind === 'gpt' && !getGpt(c.target.id)) continue;
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

// The user's message appears right away; the answer is added when the server replies.
// If sending fails, the message is taken back out and the error is thrown.
export async function sendMessage(chatId, content) {
  const chat = chatCache.get(chatId);
  const mine = { role: 'user', content };
  chat?.messages.push(mine);
  try {
    const { reply, creditTokens } = await request(`/api/chats/${chatId}/messages`, { method: 'POST', body: { content } });
    chat?.messages.push(reply);
    const item = chatList.find(c => c.id === chatId);
    if (item) item.updatedAt = Date.now();
    return { reply, creditTokens };
  } catch (err) {
    if (chat) chat.messages.splice(chat.messages.indexOf(mine), 1);
    throw err;
  }
}

// Sends the exact request body the user built. Returns the provider's raw reply plus status, cost and time.
export async function sendCustom(body) {
  return request('/api/custom', { method: 'POST', body });
}

// ── Account ─────────────────────────────────────────────────────────────────

export async function updateName(name) { await request('/api/auth/me', { method: 'PATCH', body: { name } }); }
export async function updateEmail(email, password) { await request('/api/auth/email', { method: 'PATCH', body: { email, password } }); }
export async function updatePassword(current, next) { await request('/api/auth/password', { method: 'PATCH', body: { current, next } }); }
// Deletes everything: chats, GPTs, models, the OpenRouter connection and the account.
export async function deleteAccount() { await request('/api/auth/me', { method: 'DELETE' }); }
