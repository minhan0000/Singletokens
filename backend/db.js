const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Models every account starts with in "Your models".
const DEFAULT_MODELS = ['anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro'];
const FALLBACK_MODEL = 'anthropic/claude-sonnet-4.5';

// Older versions stored display names instead of OpenRouter ids.
const OLD_MODEL_NAMES = {
  'Llama 3.3 70B': 'meta-llama/llama-3.3-70b-instruct',
  'Llama 3.1 8B': 'meta-llama/llama-3.1-8b-instruct',
  'Claude Sonnet 4.5': 'anthropic/claude-sonnet-4.5',
};
const toModelId = name => (name && name.includes('/') ? name : OLD_MODEL_NAMES[name] || FALLBACK_MODEL);

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      balance INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      amount_usd REAL NOT NULL,
      method TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      stripe_intent_id TEXT,
      paypal_order_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gpts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      model TEXT DEFAULT 'Llama 3.3 70B',
      prompt TEXT NOT NULL,
      temp REAL DEFAULT 0.7,
      cap INTEGER,
      icon TEXT DEFAULT '🤖',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- "Your models"
    CREATE TABLE IF NOT EXISTS user_models (
      user_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, model_id)
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS openrouter_key TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS models_initialized BOOLEAN DEFAULT FALSE;

    -- Chats talk to a model or a GPT
    ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS target_kind TEXT;
    ALTER TABLE chat_history ADD COLUMN IF NOT EXISTS target_id TEXT;

    -- GPTs: instructions, memory and all settings
    ALTER TABLE gpts ADD COLUMN IF NOT EXISTS model_id TEXT;
    ALTER TABLE gpts ADD COLUMN IF NOT EXISTS instructions TEXT;
    ALTER TABLE gpts ADD COLUMN IF NOT EXISTS memory TEXT DEFAULT '';
    ALTER TABLE gpts ADD COLUMN IF NOT EXISTS settings JSONB;
    ALTER TABLE gpts ALTER COLUMN prompt DROP NOT NULL;
  `);

  // Convert rows saved by older versions.
  for (const row of await all(`SELECT id, model FROM chat_history WHERE target_kind IS NULL`))
    await run(`UPDATE chat_history SET target_kind = 'model', target_id = $1 WHERE id = $2`, [toModelId(row.model), row.id]);
  for (const row of await all(`SELECT id, model, prompt, temp, cap FROM gpts WHERE model_id IS NULL`))
    await run(`UPDATE gpts SET model_id = $1, instructions = COALESCE(instructions, $2), settings = $3 WHERE id = $4`,
      [toModelId(row.model), row.prompt || '', JSON.stringify({ temperature: row.temp ?? 0.7, max_tokens: row.cap ?? null, stop: [] }), row.id]);

  console.log('✓ Database ready');
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function run(sql, params = []) {
  await pool.query(sql, params);
}

async function get(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// Messages from older versions used { role: 'ai', text }.
function parseMessages(json) {
  let list;
  try { list = JSON.parse(json); } catch { list = []; }
  return (Array.isArray(list) ? list : []).map(m => ({
    ...m,
    role: m.role === 'ai' || m.role === 'model' ? 'assistant' : m.role,
    content: m.content ?? m.text ?? '',
  })).filter(m => m.role === 'user' || m.role === 'assistant');
}

const chatFromRow = r => r && ({
  id: r.id,
  title: r.title,
  target: { kind: r.target_kind || 'model', id: r.target_id || toModelId(r.model) },
  updatedAt: new Date(r.updated_at).getTime(),
  ...(r.messages !== undefined ? { messages: parseMessages(r.messages) } : {}),
});

const gptFromRow = r => r && ({
  id: r.id,
  name: r.name,
  icon: r.icon === '🤖' ? '' : (r.icon || ''),
  description: r.description || '',
  modelId: r.model_id || toModelId(r.model),
  instructions: r.instructions ?? r.prompt ?? '',
  memory: r.memory || '',
  settings: r.settings || { temperature: 0.7, max_tokens: null, stop: [] },
});

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  init,
  DEFAULT_MODELS,

  users: {
    get:           (id)                   => get('SELECT * FROM users WHERE id = $1', [id]),
    getByEmail:    (email)                => get('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]),
    create:        (id, email, hash, name)=> run('INSERT INTO users (id,email,password_hash,name) VALUES ($1,$2,$3,$4)', [id, email, hash, name]),
    update:        (name, id)             => run('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, id]),
    setEmail:      (email, id)            => run('UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2', [email, id]),
    setPassword:   (hash, id)             => run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, id]),
    // The user's OpenRouter key, stored encrypted. null disconnects.
    setOpenRouterKey: (encrypted, id)     => run('UPDATE users SET openrouter_key = $1, updated_at = NOW() WHERE id = $2', [encrypted, id]),
    // Removes the user and everything they own. All or nothing.
    deleteEverything: async (id) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const table of ['api_keys', 'chat_history', 'gpts', 'transactions', 'user_models'])
          await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [id]);
        await client.query('DELETE FROM users WHERE id = $1', [id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  },

  // "Your models". The first time, the account gets the default models.
  myModels: {
    getAll: async (userId) => {
      const user = await get('SELECT models_initialized FROM users WHERE id = $1', [userId]);
      if (user && !user.models_initialized) {
        for (const m of DEFAULT_MODELS)
          await run('INSERT INTO user_models (user_id, model_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, m]);
        await run('UPDATE users SET models_initialized = TRUE WHERE id = $1', [userId]);
      }
      return (await all('SELECT model_id FROM user_models WHERE user_id = $1 ORDER BY added_at, model_id', [userId])).map(r => r.model_id);
    },
    add:    (userId, modelId) => run('INSERT INTO user_models (user_id, model_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, modelId]),
    remove: (userId, modelId) => run('DELETE FROM user_models WHERE user_id = $1 AND model_id = $2', [userId, modelId]),
  },

  chats: {
    getAll:    async (userId) => (await all('SELECT id,title,model,target_kind,target_id,updated_at FROM chat_history WHERE user_id = $1 ORDER BY updated_at DESC', [userId])).map(chatFromRow),
    get:       async (id, userId) => chatFromRow(await get('SELECT * FROM chat_history WHERE id = $1 AND user_id = $2', [id, userId])),
    create:    (id, userId, title, target) => run('INSERT INTO chat_history (id,user_id,title,model,messages,target_kind,target_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, userId, title, target.id, '[]', target.kind, target.id]),
    rename:    (id, userId, title)  => run('UPDATE chat_history SET title=$1 WHERE id=$2 AND user_id=$3', [title, id, userId]),
    setTarget: (id, userId, target) => run('UPDATE chat_history SET target_kind=$1, target_id=$2 WHERE id=$3 AND user_id=$4', [target.kind, target.id, id, userId]),
    setMessages: (id, userId, messages) => run('UPDATE chat_history SET messages=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3', [JSON.stringify(messages), id, userId]),
    // When a GPT is deleted, its chats continue with the model it used.
    retarget:  (userId, gptId, modelId) => run(`UPDATE chat_history SET target_kind='model', target_id=$1 WHERE user_id=$2 AND target_kind='gpt' AND target_id=$3`, [modelId, userId, gptId]),
    delete:    (id, userId) => run('DELETE FROM chat_history WHERE id = $1 AND user_id = $2', [id, userId]),
    // How often each model answered, to find the user's most used model.
    modelCounts: async (userId) => {
      const counts = {};
      for (const r of await all('SELECT messages FROM chat_history WHERE user_id = $1', [userId]))
        for (const m of parseMessages(r.messages)) if (m.modelId) counts[m.modelId] = (counts[m.modelId] || 0) + 1;
      return counts;
    },
  },

  gpts: {
    getAll: async (userId) => (await all('SELECT * FROM gpts WHERE user_id = $1 ORDER BY created_at DESC', [userId])).map(gptFromRow),
    get:    async (id, userId) => gptFromRow(await get('SELECT * FROM gpts WHERE id = $1 AND user_id = $2', [id, userId])),
    create: (id, userId, g) => run(
      'INSERT INTO gpts (id,user_id,name,icon,description,model_id,model,instructions,prompt,memory,settings) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$7,$8,$9)',
      [id, userId, g.name, g.icon, g.description, g.modelId, g.instructions, g.memory, JSON.stringify(g.settings)]),
    update: (id, userId, g) => run(
      'UPDATE gpts SET name=$1,icon=$2,description=$3,model_id=$4,model=$4,instructions=$5,prompt=$5,memory=$6,settings=$7,updated_at=NOW() WHERE id=$8 AND user_id=$9',
      [g.name, g.icon, g.description, g.modelId, g.instructions, g.memory, JSON.stringify(g.settings), id, userId]),
    delete: (id, userId) => run('DELETE FROM gpts WHERE id=$1 AND user_id=$2', [id, userId]),
  },
};
