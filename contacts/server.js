require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// File upload setup
const upload = multer({ dest: "uploads/" });

// MongoDB setup
const client = new MongoClient(process.env.MONGO_URI);
let db;
client.connect().then(() => {
  db = client.db("betnix_contacts");
  console.log("MongoDB connected");
});

// JWT Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.id;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// --- User Routes ---
// Register
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email & password required" });
  const users = db.collection("users");
  const existing = await users.findOne({ email });
  if (existing) return res.status(400).json({ error: "User exists" });
  const hash = await bcrypt.hash(password, 10);
  const result = await users.insertOne({ email, password: hash });
  const token = jwt.sign({ id: result.insertedId }, process.env.JWT_SECRET);
  res.json({ token });
});

// Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const users = db.collection("users");
  const user = await users.findOne({ email });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: "Invalid credentials" });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

// --- Contacts Routes ---
// Get contacts
app.get("/api/contacts", authMiddleware, async (req, res) => {
  const search = req.query.search || "";
  const contacts = await db.collection("contacts").find({
    user: req.user,
    $or: [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } }
    ]
  }).toArray();
  res.json(contacts);
});

// Add contact
app.post("/api/contacts", authMiddleware, upload.single("avatar"), async (req, res) => {
  const { name, email, phone, group, favorite } = req.body;
  const avatar = req.file ? req.file.filename : "";
  const result = await db.collection("contacts").insertOne({
    user: req.user, name, email, phone, group, favorite: favorite === "true", avatar
  });
  res.json(result.ops[0]);
});

// Edit contact
app.put("/api/contacts/:id", authMiddleware, upload.single("avatar"), async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, group, favorite } = req.body;
  const avatar = req.file ? req.file.filename : undefined;
  const update = { name, email, phone, group, favorite: favorite === "true" };
  if (avatar) update.avatar = avatar;
  const result = await db.collection("contacts").findOneAndUpdate(
    { _id: new ObjectId(id), user: req.user },
    { $set: update },
    { returnDocument: "after" }
  );
  res.json(result.value);
});

// Delete contact
app.delete("/api/contacts/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  await db.collection("contacts").deleteOne({ _id: new ObjectId(id), user: req.user });
  res.json({ success: true });
});

// Import CSV
app.post("/api/import-csv", authMiddleware, upload.single("csv"), async (req, res) => {
  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", data => results.push(data))
    .on("end", async () => {
      for(const r of results){
        await db.collection("contacts").insertOne({
          user: req.user,
          name: r.name, email: r.email, phone: r.phone, group: r.group || "", favorite: r.favorite === "true", avatar: ""
        });
      }
      fs.unlinkSync(req.file.path);
      res.json({ success: true, imported: results.length });
    });
});

// Export CSV
app.get("/api/export-csv", authMiddleware, async (req, res) => {
  const contacts = await db.collection("contacts").find({ user: req.user }).toArray();
  const csvData = ["name,email,phone,group,favorite"];
  contacts.forEach(c => {
    csvData.push([c.name,c.email,c.phone,c.group,c.favorite].join(","));
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
  res.send(csvData.join("\n"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port "+PORT));
