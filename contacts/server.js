require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
  db = mongoClient.db("betnix_contacts");
  console.log("Connected to MongoDB");
});

// Mock user system (replace with real auth if needed)
const USERS = ["user_1"]; // single public user for demo

// Get all contacts
app.get("/contacts", async (req, res) => {
  const contacts = await db.collection("contacts").find({ user: USERS[0] }).toArray();
  res.json(contacts);
});

// Add a contact
app.post("/contacts", async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email required" });
  const result = await db.collection("contacts").insertOne({ user: USERS[0], name, email, phone });
  res.json(result.ops[0]);
});

// Edit a contact
app.put("/contacts/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;
  const result = await db.collection("contacts").findOneAndUpdate(
    { _id: new ObjectId(id), user: USERS[0] },
    { $set: { name, email, phone } },
    { returnDocument: "after" }
  );
  res.json(result.value);
});

// Delete a contact
app.delete("/contacts/:id", async (req, res) => {
  const { id } = req.params;
  await db.collection("contacts").deleteOne({ _id: new ObjectId(id), user: USERS[0] });
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
