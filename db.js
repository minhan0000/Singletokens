const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/singletokens.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ── CREATE TABLES ──
db.exec(`
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
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    messages TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── HELPER FUNCTIONS ──

// Users
const getUser = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const createUser = db.prepare('INSERT INTO users (id,email,password_hash,name) VALUES (?,?,?,?)');
const updateBalance = db.prepare('UPDATE users SET balance = balance + ?, updated_at = datetime("now") WHERE id = ?');
const updateUser = db.prepare('UPDATE users SET name = ?, updated_at = datetime("now") WHERE id = ?');

// API Keys
const getApiKeys = db.prepare('SELECT id,name,key,active,created_at FROM api_keys WHERE user_id = ?');
const getApiKey = db.prepare('SELECT * FROM api_keys WHERE key = ? AND active = 1');
const createApiKey = db.prepare('INSERT INTO api_keys (id,user_id,name,key) VALUES (?,?,?,?)');
const revokeApiKey = db.prepare('UPDATE api_keys SET active = 0 WHERE id = ? AND user_id = ?');
const deleteApiKey = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?');

// Chat history
const getChats = db.prepare('SELECT id,title,model,created_at,updated_at FROM chat_history WHERE user_id = ? ORDER BY updated_at DESC');
const getChat = db.prepare('SELECT * FROM chat_history WHERE id = ? AND user_id = ?');
const createChat = db.prepare('INSERT INTO chat_history (id,user_id,title,model,messages) VALUES (?,?,?,?,?)');
const updateChat = db.prepare('UPDATE chat_history SET title=?,messages=?,model=?,updated_at=datetime("now") WHERE id=? AND user_id=?');
const deleteChat = db.prepare('DELETE FROM chat_history WHERE id = ? AND user_id = ?');
const deleteAllChats = db.prepare('DELETE FROM chat_history WHERE user_id = ?');

// Transactions
const createTransaction = db.prepare('INSERT INTO transactions (id,user_id,tokens,amount_usd,method,stripe_intent_id,paypal_order_id) VALUES (?,?,?,?,?,?,?)');
const updateTransaction = db.prepare('UPDATE transactions SET status=? WHERE id=?');
const getTransactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20');
const getTransactionByStripe = db.prepare('SELECT * FROM transactions WHERE stripe_intent_id = ?');
const getTransactionByPaypal = db.prepare('SELECT * FROM transactions WHERE paypal_order_id = ?');

module.exports = {
  db,
  users: { get: getUser, getByEmail: getUserByEmail, create: createUser, updateBalance, update: updateUser },
  apiKeys: { getAll: getApiKeys, get: getApiKey, create: createApiKey, revoke: revokeApiKey, delete: deleteApiKey },
  chats: { getAll: getChats, get: getChat, create: createChat, update: updateChat, delete: deleteChat, deleteAll: deleteAllChats },
  transactions: { create: createTransaction, update: updateTransaction, getAll: getTransactions, getByStripe: getTransactionByStripe, getByPaypal: getTransactionByPaypal },
};
