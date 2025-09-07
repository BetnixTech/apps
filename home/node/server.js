const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5000;

// Serve static HTML, CSS, JS files from public folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

const DEVICES_FILE = 'devices.json';
const USERS_FILE = 'users.json';

// -------------------------------
// Helper functions
// -------------------------------
function loadJSON(filePath, defaultValue) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath));
    } catch (err) {
      console.error(`Error reading ${filePath}:`, err);
      return defaultValue;
    }
  }
  return defaultValue;
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// -------------------------------
// API endpoint: Save setup
// -------------------------------
app.post('/save_setup', (req, res) => {
  const { room, dtype, ip, email, password } = req.body;

  if (!room || !dtype || !ip || !email || !password) {
    return res.status(400).send('All fields are required');
  }

  // ---- Save user ----
  let users = loadJSON(USERS_FILE, []);
  if (!users.some(u => u.email === email)) {
    users.push({ email, password });
    saveJSON(USERS_FILE, users);
  }

  // ---- Save device ----
  let devices = loadJSON(DEVICES_FILE, {});
  if (!devices[room]) devices[room] = {};

  let devEntry = {
    type: dtype === 'light' || dtype === 'plug' ? 'kasa' : 'pi',
    state: false
  };

  if (devEntry.type === 'kasa') {
    devEntry.ip = ip; // Kasa device IP
  } else {
    const pinNumber = parseInt(ip);
    if (isNaN(pinNumber)) {
      return res.status(400).send('Invalid GPIO pin number for Pi device');
    }
    devEntry.pin = pinNumber; // Pi GPIO pin
  }

  devices[room][dtype] = devEntry;
  saveJSON(DEVICES_FILE, devices);

  res.send('Setup saved successfully!');
});

// -------------------------------
// Start server
// -------------------------------
app.listen(PORT, () => {
  console.log(`Betnix Setup Server running at http://localhost:${PORT}`);
});
