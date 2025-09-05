// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { Twilio } = require("twilio");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// MongoDB setup
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect().then(() => {
  db = mongoClient.db("betnix_voice");
  console.log("Connected to MongoDB");
});

// Twilio setup
const twilioClient = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

// --- User login ---
app.post("/login", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });
  const users = db.collection("users");
  let user = await users.findOne({ phone });
  if (!user) {
    const result = await users.insertOne({ phone });
    user = result.ops[0];
  }
  res.json({ userId: user._id, phone: user.phone });
});

// --- Send SMS ---
app.post("/send-sms", async (req, res) => {
  const { to, message, from } = req.body;
  if (!to || !message || !from) return res.status(400).json({ error: "Missing params" });
  
  try {
    // Send via Twilio
    const msg = await twilioClient.messages.create({
      from: process.env.TWILIO_NUMBER,
      to,
      body: message
    });
    // Save to DB
    await db.collection("messages").insertOne({
      from, to, message, date: new Date()
    });
    res.json({ success: true, sid: msg.sid });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Incoming SMS webhook ---
app.post("/incoming-sms", async (req, res) => {
  const { From, Body } = req.body;
  console.log("Incoming SMS:", From, Body);
  await db.collection("messages").insertOne({
    from: From, to: process.env.TWILIO_NUMBER, message: Body, date: new Date()
  });
  res.send("<Response></Response>");
});

// --- Twilio Voice Token for WebRTC calls ---
app.get("/token", (req, res) => {
  const AccessToken = Twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWIML_APP_SID,
    incomingAllow: true
  });

  const token = new AccessToken(
    process.env.TWILIO_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity: "user_" + Math.floor(Math.random()*10000) }
  );
  token.addGrant(voiceGrant);
  res.json({ token: token.toJwt() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
