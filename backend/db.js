const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

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

    CREATE INDEX IF NOT EXISTS idx_api_keys_user_id      ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_history_user_id  ON chat_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id  ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_gpts_user_id          ON gpts(user_id);
  `);
  console.log('✓ Neon DB bereit');
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

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  init,

  users: {
    get:           (id)                   => get('SELECT * FROM users WHERE id = $1', [id]),
    getByEmail:    (email)                => get('SELECT * FROM users WHERE email = $1', [email]),
    create:        (id, email, hash, name)=> run('INSERT INTO users (id,email,password_hash,name) VALUES ($1,$2,$3,$4)', [id, email, hash, name]),
    updateBalance:  (amount, id)          => run('UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [amount, id]),
    consumeBalance: async (amount, id) => {
      const { rowCount, rows } = await pool.query(
        'UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2 AND balance >= $1 RETURNING balance',
        [amount, id]
      );
      return rowCount > 0 ? rows[0].balance : null;
    },
    // Deducts up to `amount`, clamping at 0 (for post-hoc output costs).
    consumeBalanceClamp: async (amount, id) => {
      const { rows } = await pool.query(
        'UPDATE users SET balance = GREATEST(balance - $1, 0), updated_at = NOW() WHERE id = $2 RETURNING balance',
        [amount, id]
      );
      return rows[0] ? rows[0].balance : null;
    },
    update:        (name, id)             => run('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, id]),
    delete:        (id)                   => run('DELETE FROM users WHERE id = $1', [id]),
  },

  apiKeys: {
    getAll:    (userId)       => all('SELECT id,name,key,active,created_at FROM api_keys WHERE user_id = $1', [userId]),
    getByKey:  (key)          => get('SELECT * FROM api_keys WHERE key = $1 AND active = 1', [key]),
    create:    (id, userId, name, key) => run('INSERT INTO api_keys (id,user_id,name,key) VALUES ($1,$2,$3,$4)', [id, userId, name, key]),
    revoke:    (id, userId)   => run('UPDATE api_keys SET active = 0 WHERE id = $1 AND user_id = $2', [id, userId]),
    delete:    (id, userId)   => run('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [id, userId]),
  },

  chats: {
    getAll:    (userId)                          => all('SELECT id,title,model,created_at,updated_at FROM chat_history WHERE user_id = $1 ORDER BY updated_at DESC', [userId]),
    get:       (id, userId)                      => get('SELECT * FROM chat_history WHERE id = $1 AND user_id = $2', [id, userId]),
    count:     (userId)                          => get('SELECT COUNT(*) as count FROM chat_history WHERE user_id = $1', [userId]),
    create:    (id, userId, title, model, msgs)  => run('INSERT INTO chat_history (id,user_id,title,model,messages) VALUES ($1,$2,$3,$4,$5)', [id, userId, title, model, msgs]),
    update:    (title, msgs, model, id, userId)  => run('UPDATE chat_history SET title=$1,messages=$2,model=$3,updated_at=NOW() WHERE id=$4 AND user_id=$5', [title, msgs, model, id, userId]),
    delete:    (id, userId)                      => run('DELETE FROM chat_history WHERE id = $1 AND user_id = $2', [id, userId]),
    deleteAll: (userId)                          => run('DELETE FROM chat_history WHERE user_id = $1', [userId]),
  },

  gpts: {
    getAll:    (userId)                                              => all('SELECT * FROM gpts WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    get:       (id, userId)                                          => get('SELECT * FROM gpts WHERE id = $1 AND user_id = $2', [id, userId]),
    create:    (id, userId, name, desc, model, prompt, temp, cap, icon) => run('INSERT INTO gpts (id,user_id,name,description,model,prompt,temp,cap,icon) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, userId, name, desc, model, prompt, temp, cap, icon]),
    update:    (name, desc, model, prompt, temp, cap, icon, id, userId) => run('UPDATE gpts SET name=$1,description=$2,model=$3,prompt=$4,temp=$5,cap=$6,icon=$7,updated_at=NOW() WHERE id=$8 AND user_id=$9', [name, desc, model, prompt, temp, cap, icon, id, userId]),
    delete:    (id, userId)                                          => run('DELETE FROM gpts WHERE id=$1 AND user_id=$2', [id, userId]),
    deleteAll: (userId)                                              => run('DELETE FROM gpts WHERE user_id=$1', [userId]),
  },

  transactions: {
    create:  (id, userId, tokens, amount, method, stripeId, paypalId) => run('INSERT INTO transactions (id,user_id,tokens,amount_usd,method,stripe_intent_id,paypal_order_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, userId, tokens, amount, method, stripeId, paypalId]),
    update:  (status, id)  => run('UPDATE transactions SET status=$1 WHERE id=$2', [status, id]),
    getAll:  (userId)      => all('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [userId]),
  },
};
