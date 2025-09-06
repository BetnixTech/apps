require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const User = require('./models/User');
const Client = require('./models/Client');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Serve public files
app.use(express.static('public'));

// Temporary store for auth codes
const authCodes = {};

// --- User registration ---
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = new User({ username, password: hashed });
    await user.save();
    res.send('User registered!');
  } catch (err) { res.send('Error: ' + err.message); }
});

// --- Authorization endpoint ---
app.get('/authorize', async (req, res) => {
  const { client_id, redirect_uri } = req.query;
  let client = await Client.findOne({ clientId: client_id });
  if (!client) {
    // Auto-register your public client if not exists
    client = new Client({
      clientId: process.env.PUBLIC_CLIENT_ID,
      clientSecret: process.env.PUBLIC_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/public/callback"
    });
    await client.save();
  }

  if (!req.session.user) {
    return res.send(`
      <h2>Login to Betnix</h2>
      <form method="POST" action="/authorize">
        <input type="hidden" name="client_id" value="${client_id}">
        <input type="hidden" name="redirect_uri" value="${redirect_uri}">
        <input type="text" name="username" placeholder="Username" required>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit">Login</button>
      </form>
    `);
  }

  const code = uuidv4();
  authCodes[code] = req.session.user;
  return res.redirect(`${redirect_uri}?code=${code}`);
});

// --- Handle login form ---
app.post('/authorize', async (req, res) => {
  const { username, password, client_id, redirect_uri } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.send('User not found');
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.send('Wrong password');

  req.session.user = username;
  const code = uuidv4();
  authCodes[code] = username;
  res.redirect(`${redirect_uri}?code=${code}`);
});

// --- Token endpoint ---
app.post('/token', async (req, res) => {
  const { client_id, client_secret, code } = req.body;
  const client = await Client.findOne({ clientId: client_id });
  if (!client || client.clientSecret !== client_secret) return res.status(400).send('Invalid client');

  const username = authCodes[code];
  if (!username) return res.status(400).send('Invalid code');

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
  delete authCodes[code];
  res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
});

// --- User info endpoint ---
app.get('/userinfo', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).send('No token');
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ username: payload.username });
  } catch (err) {
    res.status(401).send('Invalid token');
  }
});

// --- Public client callback ---
app.get('/public/callback', (req, res) => {
  const { code } = req.query;
  res.send(`
    <script>
      async function exchange() {
        const response = await fetch('/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: "${process.env.PUBLIC_CLIENT_ID}",
            client_secret: "${process.env.PUBLIC_CLIENT_SECRET}",
            code: "${code}"
          })
        });
        const data = await response.json();
        window.opener.postMessage(data, "*");
        window.close();
      }
      exchange();
    </script>
    <p>Connecting...</p>
  `);
});

app.listen(process.env.PORT, () => console.log(`Betnix OAuth Server running at http://localhost:${process.env.PORT}`));
