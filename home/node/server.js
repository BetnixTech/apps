const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // for setup.html

const DEVICES_FILE = path.join(__dirname, 'devices.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// -------------------------------
// Helper functions
// -------------------------------
function loadJSON(filePath, defaultValue) {
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath));
        } catch (err) {
            console.error(`Error parsing ${filePath}:`, err);
            return defaultValue;
        }
    }
    return defaultValue;
}

function saveJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// -------------------------------
// POST /save_setup
// -------------------------------
app.post('/save_setup', (req, res) => {
    const { room, dtype, ip, email, password } = req.body;
    if (!room || !dtype || !ip || !email || !password) {
        return res.status(400).send('All fields are required');
    }

    // Load existing data
    const devices = loadJSON(DEVICES_FILE, {});
    const users = loadJSON(USERS_FILE, []);

    // Save device
    if (!devices[room]) devices[room] = {};
    let devEntry = {
        type: dtype === 'light' || dtype === 'plug' ? 'kasa' : 'pi',
        state: false
    };
    if (devEntry.type === 'kasa') devEntry.ip = ip;
    else devEntry.pin = parseInt(ip); // GPIO pin for Pi

    devices[room][dtype] = devEntry;
    saveJSON(DEVICES_FILE, devices);

    // Save user if not already exists
    if (!users.some(u => u.email === email)) {
        users.push({ email, password });
        saveJSON(USERS_FILE, users);
    }

    res.send('Setup saved successfully');
});

// -------------------------------
// Start server
// -------------------------------
app.listen(PORT, () => {
    console.log(`Betnix setup server running at http://localhost:${PORT}`);
});
