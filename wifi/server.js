// server.js
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const { exec } = require('child_process');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');

const User = require('./models/User');
const Setting = require('./models/Setting');

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// connect to mongo
mongoose.connect(config.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// sessions
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: config.MONGO_URI })
}));

// Passport setup (OAuth2 generic)
passport.use('betnix', new OAuth2Strategy({
  authorizationURL: config.OAUTH.authorizationURL,
  tokenURL: config.OAUTH.tokenURL,
  clientID: config.OAUTH.clientID,
  clientSecret: config.OAUTH.clientSecret,
  callbackURL: config.OAUTH.callbackURL
},
async (accessToken, refreshToken, profile, cb) => {
  // Many OAuth2 providers require a separate userinfo request.
  // We'll fetch the profile using config.OAUTH.userProfileURL
  try {
    const res = await fetch(config.OAUTH.userProfileURL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const userInfo = await res.json();
    // Map this to your User model - ensure userInfo has an id
    const betnixId = userInfo.id || userInfo.sub || userInfo.user_id;
    let user = await User.findOne({ betnixId });
    if (!user) {
      user = await User.create({
        betnixId,
        displayName: userInfo.name || userInfo.username || '',
        email: userInfo.email || ''
      });
    }
    return cb(null, user);
  } catch (err) {
    return cb(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const u = await User.findById(id);
  done(null, u);
});

app.use(passport.initialize());
app.use(passport.session());

// --- Auth routes ---
app.get('/auth/betnix', passport.authenticate('betnix', { scope: ['profile', 'email'] }));

app.get('/auth/betnix/callback',
  passport.authenticate('betnix', { failureRedirect: '/?login=fail' }),
  (req, res) => {
    res.redirect('/');
  });

app.get('/auth/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

// --- Middleware to check admin ---
function ensureAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  // Optional: check config.ADMINS or user.role
  if (config.ADMINS.includes(req.user.betnixId) || req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Not authorized' });
}

// --- Settings API ---
app.get('/api/settings', async (req, res) => {
  let s = await Setting.findOne();
  if (!s) {
    s = await Setting.create({});
  }
  res.json(s);
});

app.post('/api/settings', ensureAdmin, async (req, res) => {
  const allowed = ['ssid','wifiPass','channel','dhcpStart','dhcpEnd'];
  const updates = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  updates.updatedAt = new Date();
  let s = await Setting.findOneAndUpdate({}, updates, { new: true, upsert: true });
  // Apply to system files (must run as root or via sudoers)
  try {
    await applySettingsToSystem(s);
    res.json({ ok: true, settings: s });
  } catch (err) {
    console.error('applySettings error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- helper to write config files + restart services ---
function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

async function applySettingsToSystem(s) {
  // Generate hostapd content
  const hostapd = `
interface=${config.ROUTER.WIFI_IFACE}
driver=nl80211
ssid=${s.ssid}
hw_mode=g
channel=${s.channel}
wmm_enabled=1
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${s.wifiPass}
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
`.trim();

  const dnsmasq = `
interface=${config.ROUTER.WIFI_IFACE}
dhcp-range=${s.dhcpStart},${s.dhcpEnd},12h
`.trim();

  // IMPORTANT: These write actions require root privileges.
  // We write to /etc/hostapd/hostapd.conf and /etc/dnsmasq.conf
  await execAsync(`echo "${escapeForShell(hostapd)}" | sudo tee /etc/hostapd/hostapd.conf > /dev/null`);
  await execAsync(`echo "${escapeForShell(dnsmasq)}" | sudo tee /etc/dnsmasq.conf > /dev/null`);

  // Ensure hostapd points to conf in /etc/default/hostapd
  await execAsync(`sudo sed -i 's|^#DAEMON_CONF=.*|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd || true`);

  // Enable ip forwarding in sysctl
  await execAsync(`sudo sed -i 's/^#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf || true`);
  await execAsync(`sudo sysctl -w net.ipv4.ip_forward=1 || true`);

  // NAT rule
  await execAsync(`sudo iptables -t nat -A POSTROUTING -o ${config.ROUTER.WAN_IFACE} -j MASQUERADE || true`);
  await execAsync(`sudo netfilter-persistent save || true`);

  // Restart services
  await execAsync(`sudo systemctl restart hostapd`);
  await execAsync(`sudo systemctl restart dnsmasq`);
}

function escapeForShell(s) {
  // simple escape for echoing multiline content
  return s.replace(/"/g, '\\"');
}

// Simple route to see current user
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ loggedIn: false });
  return res.json({ loggedIn: true, user: req.user });
});

const port = config.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
