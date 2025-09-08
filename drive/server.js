// server.js
import express from "express";
import session from "express-session";
import mongoose, { Types } from "mongoose";
import { MongoClient, GridFSBucket } from "mongodb";
import multer from "multer";
import passport from "passport";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb://localhost:27017/betnixdrive";
const CLIENT_URL = "http://localhost:3000"; // frontend
const BETNIX_AUTH = {
  authorizationURL: "https://betnix.tech/oauth/authorize",
  tokenURL: "https://betnix.tech/oauth/token",
  clientID: "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
  callbackURL: "http://localhost:3000/auth/callback"
};

// Static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Sessions
app.use(session({
  secret: "betnix-drive-secret",
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Mongo + GridFS
const mongoClient = new MongoClient(MONGO_URI);
await mongoClient.connect();
const db = mongoClient.db();
const bucket = new GridFSBucket(db, { bucketName: "files" });

// File upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Passport OAuth (Betnix)
passport.use("betnix", new OAuth2Strategy(BETNIX_AUTH,
  (accessToken, refreshToken, profile, done) => {
    // We don’t have profile fetch yet, just keep token
    return done(null, { accessToken });
  }
));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Auth routes
app.get("/auth/login", passport.authenticate("betnix"));
app.get("/auth/callback",
  passport.authenticate("betnix", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);
app.get("/auth/logout", (req, res) => {
  req.logout(() => res.redirect("/"));
});

// Helper
function getOwner(req) {
  return req.isAuthenticated() ? `betnix:${req.user.accessToken}` : "public";
}

// Upload
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const folder = req.body.folder || "root";
  const owner = getOwner(req);

  const writeStream = bucket.openUploadStream(req.file.originalname, {
    contentType: req.file.mimetype,
    metadata: { folder, owner, uploadedAt: new Date() }
  });
  writeStream.end(req.file.buffer);

  writeStream.on("finish", f => res.json({ message: "File uploaded", file: f }));
  writeStream.on("error", err => res.status(500).json({ error: err.message }));
});

// List files
app.get("/files", async (req, res) => {
  const filter = req.isAuthenticated()
    ? { $or: [{ "metadata.owner": "public" }, { "metadata.owner": `betnix:${req.user.accessToken}` }] }
    : { "metadata.owner": "public" };

  const filesCursor = bucket.find(filter).sort({ uploadDate: -1 });
  const files = await filesCursor.toArray();

  res.json(files.map(f => ({
    id: f._id,
    filename: f.filename,
    folder: f.metadata.folder,
    size: f.length,
    uploadDate: f.uploadDate,
    owner: f.metadata.owner
  })));
});

// Download
app.get("/file/:id", async (req, res) => {
  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) return res.status(400).send("Invalid ID");

  const file = await bucket.find({ _id: new Types.ObjectId(id) }).next();
  if (!file) return res.status(404).send("Not found");

  const owner = getOwner(req);
  if (!(file.metadata.owner === "public" || file.metadata.owner === owner)) {
    return res.status(403).send("Forbidden");
  }

  res.set("Content-Type", file.contentType || "application/octet-stream");
  res.set("Content-Disposition", `attachment; filename="${file.filename}"`);
  bucket.openDownloadStream(file._id).pipe(res);
});

app.listen(PORT, () => {
  console.log(`🚀 Betnix Drive running at http://localhost:${PORT}`);
});
