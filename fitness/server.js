// server.js
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- MongoDB ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true, useUnifiedTopology: true
}).then(()=>console.log("MongoDB connected"))
  .catch(err=>console.error(err));

// --- Session ---
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { secure:false, httpOnly:true }
}));

// --- Schema ---
const HealthMetricSchema = new mongoose.Schema({
  userId: String,
  type: String,
  value: Number,
  unit: String,
  ts: { type: Date, default: Date.now }
});
const HealthMetric = mongoose.model("HealthMetric", HealthMetricSchema);

// --- Betnix login simulation ---
app.post("/login", async (req,res)=>{
  const { username, password } = req.body;
  if(username && password){
    req.session.userId = username;
    return res.json({ success:true });
  }
  res.status(400).json({ error:"Invalid credentials" });
});

app.post("/logout", (req,res)=>{
  req.session.destroy(()=>res.json({ success:true }));
});

// --- Auth Middleware ---
function authRequired(req,res,next){
  if(!req.session.userId) return res.status(401).json({ error:"Not logged in" });
  next();
}

// --- Save metric ---
app.post("/api/metrics", authRequired, async (req,res)=>{
  try{
    const { type, value, unit } = req.body;
    const metric = new HealthMetric({ userId:req.session.userId, type, value, unit });
    await metric.save();
    res.json({ success:true });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// --- Get metrics ---
app.get("/api/metrics", authRequired, async (req,res)=>{
  try{
    const metrics = await HealthMetric.find({ userId:req.session.userId }).sort({ ts:1 });
    res.json(metrics);
  }catch(err){ res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
