// server.js
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const app = express();
const db = new sqlite3.Database('./vault.db');

app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use(session({
  secret: 'super-secret-key',
  resave: false,
  saveUninitialized: false
}));

// Initialize DB
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE,
      password_hash TEXT,
      twofa_secret TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      title TEXT,
      account TEXT,
      password TEXT
    )
  `);
});

// --- Auth ---
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (username, password_hash) VALUES (?,?)`,
    [username, hash], function (err) {
      if (err) return res.status(400).json({ error: 'Username taken' });
      req.session.userId = this.lastID;
      res.json({ ok: true });
    });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username=?`, [username], async (err, row) => {
    if (!row) return res.status(400).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });
    req.session.userId = row.id;
    if (row.twofa_secret) {
      req.session.twofaPending = true;
      return res.json({ twofa: true });
    }
    res.json({ ok: true });
  });
});

// --- 2FA Setup ---
app.post('/api/2fa/setup', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const secret = speakeasy.generateSecret({ name: "Betnix Passwords" });
  db.run(`UPDATE users SET twofa_secret=? WHERE id=?`,
    [secret.base32, req.session.userId], (err) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      QRCode.toDataURL(secret.otpauth_url, (err, qr) => {
        res.json({ qr, secret: secret.base32 });
      });
    });
});

app.post('/api/2fa/verify', (req, res) => {
  if (!req.session.userId || !req.session.twofaPending)
    return res.status(401).json({ error: 'Not pending 2FA' });

  const { token } = req.body;
  db.get(`SELECT twofa_secret FROM users WHERE id=?`, [req.session.userId], (err, row) => {
    if (!row) return res.status(400).json({ error: 'No 2FA' });
    const verified = speakeasy.totp.verify({
      secret: row.twofa_secret,
      encoding: 'base32',
      token
    });
    if (!verified) return res.status(400).json({ error: 'Invalid code' });
    req.session.twofaPending = false;
    res.json({ ok: true });
  });
});

// --- Vault CRUD ---
app.get('/api/vault', (req, res) => {
  if (!req.session.userId || req.session.twofaPending)
    return res.status(401).json({ error: 'Not authorized' });
  db.all(`SELECT * FROM entries WHERE user_id=?`, [req.session.userId], (err, rows) => {
    res.json(rows || []);
  });
});

app.post('/api/vault', (req, res) => {
  if (!req.session.userId || req.session.twofaPending)
    return res.status(401).json({ error: 'Not authorized' });
  const { title, account, password } = req.body;
  db.run(`INSERT INTO entries (user_id, title, account, password) VALUES (?,?,?,?)`,
    [req.session.userId, title, account, password], function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ ok: true, id: this.lastID });
    });
});

app.listen(3000, () => console.log("Running at http://localhost:3000"));
