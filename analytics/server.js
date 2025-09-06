require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Betnix imports
const { User } = require('./account/models/User'); // adjust if path differs
const { verifyToken } = require('./account/middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public')); // optional if serving HTML from public

// MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
.catch(err => console.log(err));

// Analytics Schemas
const visitSchema = new mongoose.Schema({
    betnixId: String,
    url: String,
    ref: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
});
const clickSchema = new mongoose.Schema({
    betnixId: String,
    tag: String,
    id: String,
    url: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
});

const Visit = mongoose.model('Visit', visitSchema);
const Click = mongoose.model('Click', clickSchema);

// Track route (only authenticated users)
app.post('/track', verifyToken, async (req, res) => {
    const betnixId = req.user.id; // from middleware
    const { type, info } = req.body;

    try {
        if(type === 'visit') await Visit.create({ ...info, betnixId });
        if(type === 'click') await Click.create({ ...info, betnixId });
        res.json({ status:'ok' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Dashboard data
app.get('/data', verifyToken, async (req, res) => {
    const betnixId = req.user.id;
    try {
        const visits = await Visit.find({ betnixId }).sort({ timestamp:-1 }).limit(1000);
        const clicks = await Click.find({ betnixId }).sort({ timestamp:-1 }).limit(1000);
        res.json({ visits, clicks });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve dashboard HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
