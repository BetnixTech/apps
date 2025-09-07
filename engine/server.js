const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ASSET_FILE = path.join(__dirname, "assets.json");

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public")); // optional: frontend folder

// Setup Multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Load or initialize JSON file
let assets = [];
if (fs.existsSync(ASSET_FILE)) {
  assets = JSON.parse(fs.readFileSync(ASSET_FILE, "utf-8"));
}

// Save assets helper
function saveAssets() {
  fs.writeFileSync(ASSET_FILE, JSON.stringify(assets, null, 2), "utf-8");
}

// Generate asset ID
function generateAssetId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  const { name, description } = req.body;
  const file = req.file;

  if (!name || !file) return res.status(400).send("Name and file are required");

  // Convert file to data URL
  const mimeType = file.mimetype;
  const base64 = file.buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Create asset object
  const assetId = generateAssetId();
  const asset = { assetId, name, description, dataUrl, created: Date.now() };
  assets.push(asset);
  saveAssets();

  res.json({ assetId, url: `/asset/${assetId}` });
});

// Serve asset by ID
app.get("/asset/:id", (req, res) => {
  const asset = assets.find(a => a.assetId === req.params.id);
  if (!asset) return res.status(404).send("Asset not found");
  res.send(`<html><body><iframe src="${asset.dataUrl}" style="width:100%;height:100vh;border:none;"></iframe></body></html>`);
});

// List all assets
app.get("/assets", (req, res) => {
  res.json(assets.map(a => ({ assetId: a.assetId, name: a.name, description: a.description })));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
