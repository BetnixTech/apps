// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const multer = require('multer');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2').Strategy;
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp'); // for thumbnails
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betnixdrive';
const MAX_STORAGE_BYTES_PER_USER = parseInt(process.env.MAX_STORAGE_BYTES_PER_USER || '1073741824', 10);
const SHARE_TOKEN_SECRET = process.env.SHARE_TOKEN_SECRET || 'secret_share_key';

// --------- DB Setup ----------
mongoose.set('strictQuery', false);
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const conn = mongoose.connection;

const FolderSchema = new mongoose.Schema({
  name: String,
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  owner: { type: String, default: 'public' }, // 'public' or 'betnix:<token-or-id>'
  createdAt: { type: Date, default: Date.now }
});
const Folder = mongoose.model('Folder', FolderSchema);

const ShareSchema = new mongoose.Schema({
  token: String,
  fileId: mongoose.Schema.Types.ObjectId,
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const Share = mongoose.model('Share', ShareSchema);

// Wait for native mongo client to be available for GridFS
let bucket;
conn.once('open', async () => {
  bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'files' });
  console.log('Connected to MongoDB and GridFS bucket ready.');
});

// --------- Auth (optional Betnix OAuth) ----------
app.use(session({
  secret: 'betnix-drive-session',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use('betnix', new OAuth2Strategy({
  authorizationURL: process.env.BETNIX_AUTH_URL,
  tokenURL: process.env.BETNIX_TOKEN_URL,
  clientID: process.env.BETNIX_CLIENT_ID,
  clientSecret: process.env.BETNIX_CLIENT_SECRET,
  callbackURL: process.env.BETNIX_CALLBACK
}, (accessToken, refreshToken, profile, done) => {
  // Minimal user object: in production fetch user profile endpoint to get stable id/email
  // We'll use accessToken truncated as owner key; ideally fetch a user id/email from Betnix.
  const id = `betnix:${crypto.createHash('sha256').update(accessToken).digest('hex')}`;
  done(null, { id, accessToken });
}));
passport.serializeUser((u, done) => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

app.get('/auth/betnix', passport.authenticate('betnix'));
app.get('/auth/callback', passport.authenticate('betnix', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// --------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cors')());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB limit per file

function ownerKey(req) {
  return req.isAuthenticated() ? req.user.id : 'public';
}

// --------- Helpers ----------
async function calculateUserUsage(owner) {
  // sum lengths of files with metadata.owner = owner
  const col = conn.db.collection('files.files');
  const agg = await col.aggregate([
    { $match: { 'metadata.owner': owner } },
    { $group: { _id: null, total: { $sum: '$length' } } }
  ]).toArray();
  return (agg[0] && agg[0].total) || 0;
}

function generateShareToken() {
  return uuidv4();
}

// --------- Folder endpoints ----------
app.post('/api/folders', async (req, res) => {
  const { name, parent } = req.body;
  if (!name) return res.status(400).json({ error: 'Folder name required' });
  const owner = ownerKey(req);
  const folder = new Folder({ name, parent: parent || null, owner });
  await folder.save();
  res.json(folder);
});

app.get('/api/folders', async (req, res) => {
  // optional parent query to get children
  const parent = req.query.parent || null;
  const owner = ownerKey(req);
  // return public folders + owner folders
  const folders = await Folder.find({
    parent: parent === 'null' ? null : parent,
    $or: [{ owner: 'public' }, { owner }]
  }).sort({ name: 1 }).lean();
  res.json(folders);
});

app.get('/api/folders/tree', async (req, res) => {
  // simple tree of root folders (public + user)
  const owner = ownerKey(req);
  const roots = await Folder.find({ parent: null, $or: [{ owner: 'public' }, { owner }] }).lean();
  res.json(roots);
});

// --------- File uploads (versioning + thumbnail + quotas) ----------
app.post('/api/upload', upload.array('files'), async (req, res) => {
  if (!bucket) return res.status(500).json({ error: 'Storage not ready' });
  const owner = ownerKey(req);
  const folder = req.body.folder || null;
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files' });

  const userUsage = await calculateUserUsage(owner);
  let used = userUsage;

  const results = [];
  for (const f of req.files) {
    if (used + f.size > MAX_STORAGE_BYTES_PER_USER && owner !== 'public') {
      results.push({ filename: f.originalname, error: 'Quota exceeded' });
      continue;
    }

    // Versioning: if same filename exists in folder and owner, we add version number in metadata
    const existing = await conn.db.collection('files.files').findOne({
      'filename': f.originalname,
      'metadata.owner': owner,
      'metadata.folder': folder || null
    }, { sort: { uploadDate: -1 } });

    const version = existing ? ((existing.metadata && existing.metadata.version) ? existing.metadata.version + 1 : 2) : 1;

    // store main file
    const uploadStream = bucket.openUploadStream(f.originalname, {
      contentType: f.mimetype,
      metadata: {
        owner,
        folder: folder || null,
        uploadedAt: new Date(),
        version
      }
    });

    await new Promise((resolve, reject) => {
      uploadStream.end(f.buffer, err => { if (err) reject(err); else resolve(); });
    });

    // create thumbnail for images (store as separate GridFS with metadata.thumbnailOf = fileId)
    let thumbId = null;
    try {
      if (f.mimetype.startsWith('image/')) {
        const thumbBuffer = await sharp(f.buffer).resize({ width: 320, height: 320, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
        const ts = bucket.openUploadStream(`thumb_${f.originalname}`, {
          contentType: 'image/jpeg',
          metadata: { owner, folder: folder || null, thumbnailOf: uploadStream.id, isThumbnail: true }
        });
        await new Promise((resolve, reject) => ts.end(thumbBuffer, (err) => err ? reject(err) : resolve()));
        thumbId = ts.id;
      }
    } catch (err) {
      console.error('Thumbnail generation failed', err);
    }

    used += f.size;
    results.push({ filename: f.originalname, id: uploadStream.id, version, thumbId });
  }

  res.json({ results });
});

// --------- List files (with pagination, search, sort) ----------
app.get('/api/files', async (req, res) => {
  const owner = ownerKey(req);
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
  const folder = req.query.folder || null;
  const q = req.query.q || null;
  const sortBy = req.query.sortBy || 'uploadDate';
  const sortDir = parseInt(req.query.sortDir || '-1', 10);

  const orClause = [{ 'metadata.owner': 'public' }];
  if (req.isAuthenticated()) orClause.push({ 'metadata.owner': owner });

  const filter = {
    $and: [
      { $or: orClause },
      folder === 'all' ? {} : { 'metadata.folder': folder || null }
    ]
  };

  if (q) filter.$and.push({ filename: { $regex: q, $options: 'i' } });

  const col = conn.db.collection('files.files');
  const total = await col.countDocuments(filter);
  const files = await col.find(filter).sort({ [sortBy]: sortDir }).skip((page - 1) * limit).limit(limit).toArray();

  const out = files.map(f => ({
    id: f._id,
    filename: f.filename,
    size: f.length,
    contentType: f.contentType,
    uploadDate: f.uploadDate,
    owner: f.metadata.owner,
    folder: f.metadata.folder,
    version: f.metadata.version || 1,
    isThumbnail: f.metadata.isThumbnail || false
  }));

  res.json({ total, page, limit, files: out });
});

// --------- File download / preview / thumbnail ----------
app.get('/api/file/:id/download', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).send('Invalid id');
  const fileDoc = await conn.db.collection('files.files').findOne({ _id: new ObjectId(id) });
  if (!fileDoc) return res.status(404).send('Not found');

  const owner = ownerKey(req);
  const allowed = fileDoc.metadata.owner === 'public' || fileDoc.metadata.owner === owner;
  if (!allowed) {
    // maybe shared token?
    const token = req.query.token;
    if (!token) return res.status(403).send('Forbidden');
    const share = await Share.findOne({ token, fileId: new ObjectId(id) });
    if (!share || (share.expiresAt && share.expiresAt < new Date())) return res.status(403).send('Forbidden');
  }

  res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${fileDoc.filename}"`);
  bucket.openDownloadStream(new ObjectId(id)).pipe(res);
});

app.get('/api/file/:id/preview', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).send('Invalid id');
  const fileDoc = await conn.db.collection('files.files').findOne({ _id: new ObjectId(id) });
  if (!fileDoc) return res.status(404).send('Not found');

  const owner = ownerKey(req);
  const allowed = fileDoc.metadata.owner === 'public' || fileDoc.metadata.owner === owner;
  if (!allowed) {
    const token = req.query.token;
    if (!token) return res.status(403).send('Forbidden');
    const share = await Share.findOne({ token, fileId: new ObjectId(id) });
    if (!share || (share.expiresAt && share.expiresAt < new Date())) return res.status(403).send('Forbidden');
  }

  // For images & PDFs set content-disposition inline
  const ct = fileDoc.contentType || 'application/octet-stream';
  if (ct.startsWith('image/') || ct === 'application/pdf' || ct.startsWith('text/')) {
    res.set('Content-Type', ct);
    res.set('Content-Disposition', `inline; filename="${fileDoc.filename}"`);
    bucket.openDownloadStream(new ObjectId(id)).pipe(res);
  } else {
    // fallback to download
    res.redirect(`/api/file/${id}/download`);
  }
});

// thumbnail fetch
app.get('/api/thumbnail/:id', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).send('Invalid id');
  const thumbDoc = await conn.db.collection('files.files').findOne({ _id: new ObjectId(id), 'metadata.isThumbnail': true });
  if (!thumbDoc) return res.status(404).send('No thumbnail');
  res.set('Content-Type', thumbDoc.contentType || 'image/jpeg');
  bucket.openDownloadStream(new ObjectId(id)).pipe(res);
});

// --------- Sharing ----------
app.post('/api/share/:id', async (req, res) => {
  const id = req.params.id;
  const expiresIn = parseInt(req.body.expiresIn || '0', 10); // seconds
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const fileDoc = await conn.db.collection('files.files').findOne({ _id: new ObjectId(id) });
  if (!fileDoc) return res.status(404).json({ error: 'Not found' });

  const owner = ownerKey(req);
  if (fileDoc.metadata.owner !== 'public' && fileDoc.metadata.owner !== owner) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const token = generateShareToken();
  const share = new Share({
    token,
    fileId: new ObjectId(id),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
  });
  await share.save();
  res.json({ shareUrl: `/s/${token}` });
});

app.get('/s/:token', async (req, res) => {
  const token = req.params.token;
  const share = await Share.findOne({ token });
  if (!share) return res.status(404).send('Not found');
  if (share.expiresAt && share.expiresAt < new Date()) return res.status(410).send('Expired');
  // redirect to preview URL with token so preview will check it
  res.redirect(`/api/file/${share.fileId.toString()}/preview?token=${token}`);
});

// --------- Search helper route (server-side search) ----------
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const owner = ownerKey(req);
  const filter = {
    $and: [
      {
        $or: [
          { 'metadata.owner': 'public' },
          { 'metadata.owner': owner }
        ]
      },
      { filename: { $regex: q, $options: 'i' } }
    ]
  };
  const col = conn.db.collection('files.files');
  const files = await col.find(filter).limit(50).toArray();
  res.json(files.map(f => ({ id: f._id, filename: f.filename, folder: f.metadata.folder })));
});

// --------- Basic file delete (owner or public) ----------
app.delete('/api/file/:id', async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
  const fileDoc = await conn.db.collection('files.files').findOne({ _id: new ObjectId(id) });
  if (!fileDoc) return res.status(404).json({ error: 'Not found' });
  const owner = ownerKey(req);
  if (fileDoc.metadata.owner !== 'public' && fileDoc.metadata.owner !== owner) return res.status(403).json({ error: 'Forbidden' });
  await bucket.delete(new ObjectId(id));
  res.json({ ok: true });
});

// --------- Start ----------
app.listen(PORT, () => console.log(`Betnix Drive (upgraded) listening on http://localhost:${PORT}`));
