const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
const db = new sqlite3.Database('./singletokens.db'); 

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, balance INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, key TEXT UNIQUE NOT NULL, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS chat_history (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, model TEXT NOT NULL, messages TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tokens INTEGER NOT NULL, amount_usd REAL NOT NULL, method TEXT NOT NULL, status TEXT DEFAULT 'pending', stripe_intent_id TEXT, paypal_order_id TEXT, created_at TEXT DEFAULT (datetime('now')))`);
});

const get = (sql, p=[]) => new Promise((res,rej) => db.get(sql, p, (e,r) => e ? rej(e) : res(r)));
const all = (sql, p=[]) => new Promise((res,rej) => db.all(sql, p, (e,r) => e ? rej(e) : res(r)));
const run = (sql, p=[]) => new Promise((res,rej) => db.run(sql, p, function(e){ e ? rej(e) : res({changes:this.changes}); }));

module.exports = {
  users: {
    get: (id) => get('SELECT * FROM users WHERE id=?',[id]),
    getByEmail: (email) => get('SELECT * FROM users WHERE email=?',[email]),
    create: (id,email,hash,name) => run('INSERT INTO users (id,email,password_hash,name) VALUES (?,?,?,?)',[id,email,hash,name]),
    updateBalance: (amount,id) => run('UPDATE users SET balance=balance+?,updated_at=datetime("now") WHERE id=?',[amount,id]),
    update: (name,id) => run('UPDATE users SET name=?,updated_at=datetime("now") WHERE id=?',[name,id]),
  },
  apiKeys: {
    getAll: (uid) => all('SELECT id,name,key,active,created_at FROM api_keys WHERE user_id=?',[uid]),
    getByKey: (key) => get('SELECT * FROM api_keys WHERE key=? AND active=1',[key]),
    create: (id,uid,name,key) => run('INSERT INTO api_keys (id,user_id,name,key) VALUES (?,?,?,?)',[id,uid,name,key]),
    revoke: (id,uid) => run('UPDATE api_keys SET active=0 WHERE id=? AND user_id=?',[id,uid]),
    delete: (id,uid) => run('DELETE FROM api_keys WHERE id=? AND user_id=?',[id,uid]),
  },
  chats: {
    getAll: (uid) => all('SELECT id,title,model,created_at,updated_at FROM chat_history WHERE user_id=? ORDER BY updated_at DESC',[uid]),
    get: (id,uid) => get('SELECT * FROM chat_history WHERE id=? AND user_id=?',[id,uid]),
    create: (id,uid,title,model,msgs) => run('INSERT INTO chat_history (id,user_id,title,model,messages) VALUES (?,?,?,?,?)',[id,uid,title,model,msgs]),
    update: (title,msgs,model,id,uid) => run('UPDATE chat_history SET title=?,messages=?,model=?,updated_at=datetime("now") WHERE id=? AND user_id=?',[title,msgs,model,id,uid]),
    delete: (id,uid) => run('DELETE FROM chat_history WHERE id=? AND user_id=?',[id,uid]),
    deleteAll: (uid) => run('DELETE FROM chat_history WHERE user_id=?',[uid]),
  },
  transactions: {
    create: (id,uid,tok,amt,meth,sid,pid) => run('INSERT INTO transactions (id,user_id,tokens,amount_usd,method,stripe_intent_id,paypal_order_id) VALUES (?,?,?,?,?,?,?)',[id,uid,tok,amt,meth,sid,pid]),
    update: (status,id) => run('UPDATE transactions SET status=? WHERE id=?',[status,id]),
    getAll: (uid) => all('SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 20',[uid]),
    getByStripe: (sid) => get('SELECT * FROM transactions WHERE stripe_intent_id=?',[sid]),
    getByPaypal: (pid) => get('SELECT * FROM transactions WHERE paypal_order_id=?',[pid]),
  },
};
