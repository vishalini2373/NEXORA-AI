require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120 }));
app.use(express.static(path.join(__dirname, "public")));

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
} else {
  console.warn("Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON before using protected APIs.");
}
const db = admin.apps.length ? admin.firestore() : null;

async function authenticate(req, res, next) {
  try {
    if (!admin.apps.length) return res.status(503).json({ error: "Server authentication is not configured yet." });
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Please sign in." });
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}
async function roleOf(uid) {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data().role || "student") : "student";
}
function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const role = await roleOf(req.user.uid);
      if (!roles.includes(role)) return res.status(403).json({ error: "You don't have permission for this action." });
      req.userRole = role;
      next();
    } catch { res.status(500).json({ error: "Could not verify role." }); }
  };
}

app.get("/api/health", (_, res) => res.json({ ok: true, app: "NEXORA AI" }));

app.post("/api/profile", authenticate, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database is not configured." });
  const { displayName } = req.body || {};
  const ref = db.collection("users").doc(req.user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ displayName: String(displayName || req.user.name || "User").slice(0,80), email: req.user.email || "", role: "student", createdAt: admin.firestore.FieldValue.serverTimestamp() });
  }
  const data = (await ref.get()).data();
  res.json({ uid: req.user.uid, ...data });
});

app.get("/api/profile", authenticate, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database is not configured." });
  const snap = await db.collection("users").doc(req.user.uid).get();
  res.json(snap.exists ? snap.data() : { role: "student", email: req.user.email });
});

app.post("/api/chat", authenticate, async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) return res.status(400).json({ error: "Send 1–30 messages." });
  if (!process.env.AI_API_KEY || !process.env.AI_API_URL || !process.env.AI_MODEL) return res.status(503).json({ error: "AI is not connected yet. Add AI_API_URL, AI_API_KEY and AI_MODEL on the server." });
  try {
    const safe = messages.slice(-20).map(m => ({ role: ["user","assistant"].includes(m.role) ? m.role : "user", content: String(m.content || "").slice(0,12000) }));
    const response = await fetch(process.env.AI_API_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: process.env.AI_MODEL, messages: [{ role:"system", content:"You are NEXORA AI, a helpful assistant. Answer accurately and clearly. Support English, Tamil and Tanglish. If uncertain, say so." }, ...safe], temperature: 0.6 })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || "AI provider request failed." });
    res.json({ reply: data.choices?.[0]?.message?.content || "I couldn't generate a response." });
  } catch { res.status(502).json({ error: "Could not reach the AI service." }); }
});

app.post("/api/notes", authenticate, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database is not configured." });
  const { title, body } = req.body || {};
  if (!String(title || "").trim() || !String(body || "").trim()) return res.status(400).json({ error: "Title and note are required." });
  const ref = await db.collection("users").doc(req.user.uid).collection("notes").add({
    title: String(title).slice(0,120), body: String(body).slice(0,20000), createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  res.json({ id: ref.id, ok: true });
});
app.get("/api/notes", authenticate, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database is not configured." });
  const snap = await db.collection("users").doc(req.user.uid).collection("notes").orderBy("createdAt","desc").limit(100).get();
  res.json(snap.docs.map(d => ({ id:d.id, ...d.data() })));
});
app.delete("/api/notes/:id", authenticate, async (req, res) => {
  if (!db) return res.status(503).json({ error: "Database is not configured." });
  await db.collection("users").doc(req.user.uid).collection("notes").doc(req.params.id).delete();
  res.json({ ok:true });
});

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive:true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ["application/pdf","image/png","image/jpeg","image/webp","text/plain"];
    cb(allowed.includes(file.mimetype) ? null : new Error("Only PDF, PNG, JPG, WEBP or TXT files are allowed."), allowed.includes(file.mimetype));
  }
});
app.post("/api/upload", authenticate, upload.single("file"), (req,res) => {
  if (!req.file) return res.status(400).json({ error:"Choose a file." });
  // File is stored privately on server. A production deployment should connect OCR/document parsing and private object storage.
  res.json({ ok:true, fileName:req.file.originalname, message:"File uploaded securely to the server. Document analysis needs a parser/vision provider integration." });
});

app.get("/api/admin/users", authenticate, requireRole("admin"), async (_,res) => {
  if (!db) return res.status(503).json({ error:"Database is not configured." });
  const snap = await db.collection("users").limit(200).get();
  res.json(snap.docs.map(d => ({ uid:d.id, ...d.data() })));
});
app.patch("/api/admin/users/:uid/role", authenticate, requireRole("admin"), async (req,res) => {
  if (!db) return res.status(503).json({ error:"Database is not configured." });
  const role = req.body?.role;
  if (!["student","teacher","admin"].includes(role)) return res.status(400).json({error:"Invalid role."});
  await db.collection("users").doc(req.params.uid).set({ role }, { merge:true });
  res.json({ok:true});
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message || "Request failed." });
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`NEXORA AI running on http://localhost:${port}`));
