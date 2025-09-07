const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const User = require('./models/User');
const Device = require('./models/Device');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Connect MongoDB
mongoose.connect('mongodb://localhost:27017/betnix_home', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(()=>console.log("MongoDB connected"));

// -------------------------------
// User registration
// -------------------------------
app.post('/api/register', async (req,res)=>{
    const {email, house_name} = req.body;
    if(!email || !house_name) return res.json({success:false, error:"Missing info"});
    const user = new User({email, house_name});
    await user.save();
    res.json({success:true, user});
});

// -------------------------------
// Add device
// -------------------------------
app.post('/api/add_device', async (req,res)=>{
    const {userId, room, type, brand, ip} = req.body;
    if(!userId || !room || !type || !ip) return res.json({success:false, error:"Missing info"});
    // Check if IP is reachable (basic ping)
    const net = require('net');
    const reachable = await new Promise(r=>{
        const sock = new net.Socket();
        sock.setTimeout(2000);
        sock.on('connect', ()=>{sock.destroy(); r(true)});
        sock.on('error', ()=>{r(false)});
        sock.connect(80, ip);
    });
    if(!reachable) return res.json({success:false, error:"IP unreachable"});
    let name = `Betnix ${brand || type}`;
    const device = new Device({room, type, brand, ip, user:userId});
    await device.save();
    // Update user
    const user = await User.findById(userId);
    user.devices.push(device._id);
    await user.save();
    res.json({success:true, device});
});

// -------------------------------
// Toggle device
// -------------------------------
app.post('/api/set_device', async (req,res)=>{
    const {deviceId, state} = req.body;
    const device = await Device.findById(deviceId);
    if(!device) return res.json({success:false, error:"Device not found"});
    device.state = state;
    await device.save();
    // TODO: call Python AI or Kasa API for real device toggle
    res.json({success:true, state:device.state});
});

app.listen(3000, ()=>console.log("Node.js server running on port 3000"));
