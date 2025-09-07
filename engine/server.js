const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json({ limit: "50mb" }));
app.use(cors()); // allow cross-domain requests

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/html_assets";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

// Define Asset schema
const assetSchema = new mongoose.Schema({
  assetId: { type: String, unique: true },
  name: String,
  description: String,
  html: String,
  created: { type: Date, default: Date.now }
});

const Asset = mongoose.model("Asset", assetSchema);

// Generate unique asset ID
function makeId(bytes=6){
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}

// Routes

// Create new asset
app.post("/asset", async (req, res) => {
  const { name, description, html } = req.body;
  if (!name || !html) return res.status(400).json({ error: "Name and HTML required" });

  const assetId = Date.now().toString(36) + Math.random().toString(36).slice(2,8).toUpperCase();
  const newAsset = new Asset({ assetId, name, description, html });

  try {
    await newAsset.save();
    res.json({ assetId, url: `/asset/${assetId}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save asset" });
  }
});

// Get asset HTML by ID
app.get("/asset/:id", async (req, res) => {
  const { id } = req.params;
  const asset = await Asset.findOne({ assetId: id });
  if (!asset) return res.status(404).send("Asset not found");
  res.send(asset.html);
});

// List all assets
app.get("/assets", async (req, res) => {
  const assets = await Asset.find({}, "assetId name description created").sort({ created: -1 });
  res.json(assets);
});

// Serve frontend (optional)
app.use(express.static("public")); // put your frontend HTML here

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
