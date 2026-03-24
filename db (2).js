const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'singletokens.db');

let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      balance INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      messages TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  save();
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

module.exports = {
  init: getDb,
  users: {
    get: (id) => get('SELECT * FROM users WHERE id = ?', [id]),
    getByEmail: (email) => get('SELECT * FROM users WHERE email = ?', [email]),
    create: (id, email, hash, name) => run('INSERT INTO users (id,email,password_hash,name) VALUES (?,?,?,?)', [id, email, hash, name]),
    updateBalance: (amount, id) => run('UPDATE users SET balance = balance + ?, updated_at = datetime("now") WHERE id = ?', [amount, id]),
    update: (name, id) => run('UPDATE users SET name = ?, updated_at = datetime("now") WHERE id = ?', [name, id]),
  },
  apiKeys: {
    getAll: (userId) => all('SELECT id,name,key,active,created_at FROM api_keys WHERE user_id = ?', [userId]),
    getByKey: (key) => get('SELECT * FROM api_keys WHERE key = ? AND active = 1', [key]),
    create: (id, userId, name, key) => run('INSERT INTO api_keys (id,user_id,name,key) VALUES (?,?,?,?)', [id, userId, name, key]),
    revoke: (id, userId) => run('UPDATE api_keys SET active = 0 WHERE id = ? AND user_id = ?', [id, userId]),
    delete: (id, userId) => run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [id, userId]),
  },
  chats: {
    getAll: (userId) => all('SELECT id,title,model,created_at,updated_at FROM chat_history WHERE user_id = ? ORDER BY updated_at DESC', [userId]),
    get: (id, userId) => get('SELECT * FROM chat_history WHERE id = ? AND user_id = ?', [id, userId]),
    create: (id, userId, title, model, messages) => run('INSERT INTO chat_history (id,user_id,title,model,messages) VALUES (?,?,?,?,?)', [id, userId, title, model, messages]),
    update: (title, messages, model, id, userId) => run('UPDATE chat_history SET title=?,messages=?,model=?,updated_at=datetime("now") WHERE id=? AND user_id=?', [title, messages, model, id, userId]),
    delete: (id, userId) => run('DELETE FROM chat_history WHERE id = ? AND user_id = ?', [id, userId]),
    deleteAll: (userId) => run('DELETE FROM chat_history WHERE user_id = ?', [userId]),
  },
  transactions: {
    create: (id, userId, tokens, amount, method, stripeId, paypalId) => run('INSERT INTO transactions (id,user_id,tokens,amount_usd,method,stripe_intent_id,paypal_order_id) VALUES (?,?,?,?,?,?,?)', [id, userId, tokens, amount, method, stripeId, paypalId]),
    update: (status, id) => run('UPDATE transactions SET status=? WHERE id=?', [status, id]),
    getAll: (userId) => all('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [userId]),
  },
};
