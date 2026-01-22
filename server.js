require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const sanitizeHtml = require("sanitize-html");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const cheerio = require("cheerio");
const pdfParse = require("pdf-parse");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "18mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* =====================
   ✅ ENV
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", process.env.MONGO_URI || process.env.MONGODB_URI ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "OK" : "SAKNAS");
console.log("SMTP_USER:", process.env.SMTP_USER ? "OK" : "SAKNAS");
console.log("APP_URL:", process.env.APP_URL ? "OK" : "SAKNAS");

if (!mongoUri) console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i Render env.");
if (!process.env.JWT_SECRET) console.error("❌ JWT_SECRET saknas!");
if (!process.env.OPENAI_API_KEY) console.error("❌ OPENAI_API_KEY saknas!");
if (!process.env.APP_URL) console.error("❌ APP_URL saknas! Ex: https://ai-kundtjanst.onrender.com");

/* =====================
   ✅ MongoDB
===================== */
mongoose.set("strictQuery", true);

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB ansluten"))
  .catch((err) => console.error("❌ MongoDB-fel:", err.message));

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB runtime error:", err);
});

/* =====================
   ✅ Helpers: sanitize
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

/* =====================
   ✅ IDs / Counters
   - Users: publicId + idNumber
   - Tickets: publicTicketId + ticketNumber
===================== */
function makePublicId() {
  const s = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `USR-${s.slice(0, 6)}`;
}

function makePublicTicketId() {
  const s = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TCK-${s.slice(0, 6)}`;
}

const counterSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  seq: { type: Number, default: 1000 },
});
const Counter = mongoose.model("Counter", counterSchema);

async function nextSequence(key) {
  const r = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return r.seq;
}

/* =====================
   ✅ Models
===================== */
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, index: true },
  email: { type: String, default: "", index: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" }, // user | agent | admin

  publicId: { type: String, unique: true, index: true, default: "" },
  idNumber: { type: Number, unique: true, sparse: true, index: true, default: null },

  resetTokenHash: { type: String, default: "" },
  resetTokenExpiresAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

userSchema.pre("save", async function (next) {
  try {
    if (!this.publicId) {
      let tries = 0;
      while (tries < 5) {
        const pid = makePublicId();
        const exists = await mongoose.models.User.findOne({ publicId: pid }).select("_id");
        if (!exists) {
          this.publicId = pid;
          break;
        }
        tries++;
      }
      if (!this.publicId) this.publicId = makePublicId();
    }

    if (this.idNumber == null) {
      const n = await nextSequence("users");
      this.idNumber = n;
    }
    next();
  } catch (e) {
    next(e);
  }
});

const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  role: String, // user | assistant | agent
  content: String,
  timestamp: { type: Date, default: Date.now },
});

/* =====================
   ✅ SLA Defaults
===================== */
function slaLimitsForPriority(priority) {
  const MIN = 60 * 1000;

  if (priority === "high") {
    return { firstResponseLimitMs: 60 * MIN, resolutionLimitMs: 24 * 60 * MIN };
  }

  if (priority === "low") {
    return { firstResponseLimitMs: 24 * 60 * MIN, resolutionLimitMs: 7 * 24 * 60 * MIN };
  }

  return { firstResponseLimitMs: 8 * 60 * MIN, resolutionLimitMs: 3 * 24 * 60 * MIN };
}

/* =====================
   ✅ SLA Helpers
===================== */
function msBetween(a, b) {
  try {
    const A = new Date(a).getTime();
    const B = new Date(b).getTime();
    if (!Number.isFinite(A) || !Number.isFinite(B)) return null;
    return Math.max(0, B - A);
  } catch {
    return null;
  }
}

function msToPretty(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  const hh = h % 24;
  const mm = m % 60;

  if (d > 0) return `${d}d ${hh}h ${mm}m`;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function calcPendingMs(t, now = new Date()) {
  const pendingTotal = Number(t.pendingTotalMs || 0);
  if (!t.pendingStartedAt) return pendingTotal;
  const active = msBetween(t.pendingStartedAt, now) || 0;
  return pendingTotal + active;
}

function calcEffectiveMsFromCreated(t, endAt, now = new Date()) {
  const createdAt = t.createdAt || now;
  const end = endAt || now;
  const total = msBetween(createdAt, end);
  if (total == null) return null;

  const paused = calcPendingMs(t, now);
  return Math.max(0, total - paused);
}

function computeSlaForTicket(t, now = new Date()) {
  const limits = slaLimitsForPriority(t.priority || "normal");
  const createdAt = t.createdAt || now;
  const firstAgentReplyAt = t.firstAgentReplyAt || null;
  const solvedAt = t.solvedAt || null;

  const firstResponseMs = firstAgentReplyAt ? msBetween(createdAt, firstAgentReplyAt) : null;
  const resolutionMs = solvedAt ? calcEffectiveMsFromCreated(t, solvedAt, now) : null;

  const firstResponseDueAt = new Date(new Date(createdAt).getTime() + limits.firstResponseLimitMs);
  const resolutionDueAt = new Date(new Date(createdAt).getTime() + limits.resolutionLimitMs);

  const nowMs = now.getTime();

  const firstResponseRemainingMs = firstAgentReplyAt ? 0 : Math.max(0, firstResponseDueAt.getTime() - nowMs);
  const resolutionRemainingMs = solvedAt ? 0 : Math.max(0, resolutionDueAt.getTime() - nowMs);

  const breachedFirstResponse =
    firstResponseMs !== null ? firstResponseMs > limits.firstResponseLimitMs : false;

  const effectiveRunningMs = solvedAt ? resolutionMs : calcEffectiveMsFromCreated(t, now, now);
  const breachedResolution =
    effectiveRunningMs != null ? effectiveRunningMs > limits.resolutionLimitMs : false;

  const riskPct = 0.8;

  function stateFirst() {
    if (!firstAgentReplyAt) {
      if (firstResponseRemainingMs <= 0) return "breached";
      const used = limits.firstResponseLimitMs - firstResponseRemainingMs;
      if (used >= limits.firstResponseLimitMs * riskPct) return "at_risk";
      return "waiting";
    }
    return breachedFirstResponse ? "breached" : "ok";
  }

  function stateRes() {
    if (!solvedAt) {
      if (resolutionRemainingMs <= 0) return "breached";
      const used = limits.resolutionLimitMs - resolutionRemainingMs;
      if (used >= limits.resolutionLimitMs * riskPct) return "at_risk";
      return "waiting";
    }
    return breachedResolution ? "breached" : "ok";
  }

  return {
    firstResponseMs,
    resolutionMs,

    breachedFirstResponse,
    breachedResolution,

    firstResponseLimitMs: limits.firstResponseLimitMs,
    resolutionLimitMs: limits.resolutionLimitMs,

    firstResponseDueAt,
    resolutionDueAt,

    firstResponseRemainingMs,
    resolutionRemainingMs,

    effectiveRunningMs: effectiveRunningMs ?? null,
    pendingTotalMs: calcPendingMs(t, now),

    firstResponseState: stateFirst(),
    resolutionState: stateRes(),

    pretty: {
      firstResponse: msToPretty(firstResponseMs),
      resolution: msToPretty(resolutionMs),
      pendingTotal: msToPretty(calcPendingMs(t, now)),
      effectiveRunning: msToPretty(effectiveRunningMs),
      firstRemaining: msToPretty(firstResponseRemainingMs),
      resolutionRemaining: msToPretty(resolutionRemainingMs),
    },
  };
}

function safeEnsureSla(t) {
  t.sla = computeSlaForTicket(t);
  return t;
}

/* =====================
   ✅ KPI helpers
===================== */
function avg(arr) {
  const a = (arr || []).filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!a.length) return null;
  return Math.round(a.reduce((s, n) => s + n, 0) / a.length);
}

function median(arr) {
  const a = (arr || [])
    .filter((x) => typeof x === "number" && Number.isFinite(x))
    .slice()
    .sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 0) return Math.round((a[mid - 1] + a[mid]) / 2);
  return Math.round(a[mid]);
}

function percentile(arr, p = 90) {
  const a = (arr || [])
    .filter((x) => typeof x === "number" && Number.isFinite(x))
    .slice()
    .sort((x, y) => x - y);
  if (!a.length) return null;
  const idx = Math.ceil((p / 100) * a.length) - 1;
  const i = Math.max(0, Math.min(a.length - 1, idx));
  return Math.round(a[i]);
}

function toCsv(rows) {
  if (!rows || !rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [];
  lines.push(headers.join(","));
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

/* =====================
   ✅ Ticket Model
===================== */
const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true },
  status: { type: String, default: "open" }, // open | pending | solved
  priority: { type: String, default: "normal" }, // low | normal | high
  title: { type: String, default: "" },

  publicTicketId: { type: String, unique: true, index: true, default: "" },
  ticketNumber: { type: Number, unique: true, sparse: true, index: true, default: null },

  assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  internalNotes: [
    {
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      content: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],

  firstAgentReplyAt: { type: Date, default: null },
  solvedAt: { type: Date, default: null },

  pendingStartedAt: { type: Date, default: null },
  pendingTotalMs: { type: Number, default: 0 },

  sla: Object,

  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ lastActivityAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ assignedToUserId: 1, createdAt: -1 });
ticketSchema.index({ companyId: 1, createdAt: -1 });

ticketSchema.pre("save", async function (next) {
  try {
    if (!this.publicTicketId) {
      let tries = 0;
      while (tries < 5) {
        const pid = makePublicTicketId();
        const exists = await mongoose.models.Ticket.findOne({ publicTicketId: pid }).select("_id");
        if (!exists) {
          this.publicTicketId = pid;
          break;
        }
        tries++;
      }
      if (!this.publicTicketId) this.publicTicketId = makePublicTicketId();
    }

    if (this.ticketNumber == null) {
      const n = await nextSequence("tickets");
      this.ticketNumber = n;
    }
    next();
  } catch (e) {
    next(e);
  }
});

const Ticket = mongoose.model("Ticket", ticketSchema);

/* =====================
   ✅ KB Chunk model
===================== */
const kbChunkSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  sourceType: { type: String, required: true }, // url | text | pdf
  sourceRef: { type: String, default: "" },
  title: { type: String, default: "" },
  chunkIndex: { type: Number, default: 0 },
  content: { type: String, default: "" },
  embedding: { type: [Number], default: [] },
  embeddingOk: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
const KBChunk = mongoose.model("KBChunk", kbChunkSchema);

const feedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String,
  companyId: String,
  createdAt: { type: Date, default: Date.now },
});
const Feedback = mongoose.model("Feedback", feedbackSchema);

const categorySchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true, index: true },
  name: { type: String, default: "" },
  systemPrompt: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});
const Category = mongoose.model("Category", categorySchema);

/* =====================
   ✅ SLA Stat model
===================== */
const slaStatSchema = new mongoose.Schema({
  scope: { type: String, default: "ticket" }, // ticket | agent | overview
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", default: null },

  createdAt: { type: Date, default: Date.now },

  firstResponseMs: { type: Number, default: null },
  resolutionMs: { type: Number, default: null },
  breachedFirstResponse: { type: Boolean, default: false },
  breachedResolution: { type: Boolean, default: false },

  priority: { type: String, default: "normal" },
  companyId: { type: String, default: "" },
});
slaStatSchema.index({ createdAt: -1 });
slaStatSchema.index({ agentUserId: 1, createdAt: -1 });
const SLAStat = mongoose.model("SLAStat", slaStatSchema);

/* =====================
   ✅ Default categories
===================== */
async function ensureDefaultCategories() {
  const defaults = [
    { key: "demo", name: "Demo AB", systemPrompt: "Du är en professionell och vänlig AI-kundtjänst på svenska." },
    { key: "law", name: "Juridik", systemPrompt: "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmän vägledning men inte juridisk rådgivning." },
    { key: "tech", name: "Teknisk support", systemPrompt: "Du är en AI-kundtjänst för teknisk support på svenska. Felsök steg-för-steg och ge konkreta lösningar." },
    { key: "cleaning", name: "Städservice", systemPrompt: "Du är en AI-kundtjänst för städservice på svenska. Hjälp med tjänster, rutiner, bokning och tips." },
  ];

  for (const c of defaults) await Category.updateOne({ key: c.key }, { $setOnInsert: c }, { upsert: true });
  console.log("✅ Default categories säkerställda");
}
ensureDefaultCategories().catch((e) => console.error("❌ ensureDefaultCategories error:", e));

/* =====================
   ✅ OpenAI
===================== */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================
   ✅ Rate limit
===================== */
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);
app.use("/auth", limiterAuth);

/* =====================
   ✅ Chunking + Embeddings
===================== */
function chunkText(text, chunkSize = 1200, overlap = 150) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const chunks = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}
function norm(a) {
  return Math.sqrt(dot(a, a));
}
function cosineSim(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return dot(a, b) / (na * nb);
}

async function createEmbedding(text) {
  try {
    const r = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return r.data?.[0]?.embedding || null;
  } catch (e) {
    console.error("❌ Embedding error:", e?.message || e);
    return null;
  }
}

async function ragSearch(companyId, query, topK = 4) {
  const qEmbed = await createEmbedding(query);
  if (!qEmbed) return { used: false, context: "", sources: [] };

  const chunks = await KBChunk.find({ companyId, embeddingOk: true, isDeleted: false }).limit(1500);
  if (!chunks.length) return { used: false, context: "", sources: [] };

  const scored = chunks
    .filter((c) => c.embedding?.length)
    .map((c) => ({ score: cosineSim(qEmbed, c.embedding), c }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (!scored.length || scored[0].score < 0.2) return { used: false, context: "", sources: [] };

  const context = scored
    .map((s, i) => `KÄLLA ${i + 1}: ${s.c.title || s.c.sourceRef}\n${s.c.content}`)
    .join("\n\n");

  const sources = scored.map((s) => ({
    title: s.c.title || s.c.sourceRef || "KB",
    sourceType: s.c.sourceType,
    sourceRef: s.c.sourceRef,
  }));

  return { used: true, context, sources };
}

async function ensureTicket(userId, companyId) {
  let t = await Ticket.findOne({ userId, companyId, status: { $ne: "solved" } }).sort({ lastActivityAt: -1 });
  if (!t) t = await new Ticket({ userId, companyId, messages: [] }).save();
  safeEnsureSla(t);
  if (!t.sla?.firstResponseLimitMs) await t.save().catch(() => {});
  return t;
}

/* =====================
   ✅ URL + PDF extraction
===================== */
async function fetchUrlText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (AI Kundtjanst Bot)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) throw new Error(`Kunde inte hämta URL. Status: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside").remove();
  const main = $("main").text() || $("article").text() || $("body").text();
  const text = cleanText(main);

  if (!text || text.length < 200) throw new Error("Ingen tillräcklig text kunde extraheras från URL.");
  return text;
}

async function extractPdfText(base64) {
  const buffer = Buffer.from(base64, "base64");
  const data = await pdfParse(buffer);
  const text = cleanText(data.text || "");
  if (!text || text.length < 200) throw new Error("Ingen tillräcklig text i PDF.");
  return text;
}

/* =====================
   ✅ Auth middleware
===================== */
const authenticate = (req, res, next) => {
  const t = req.header("Authorization")?.replace("Bearer ", "");
  if (!t) return res.status(401).json({ error: "Ingen token" });

  try {
    req.user = jwt.verify(t, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Ogiltig token" });
  }
};

const requireAdmin = async (req, res, next) => {
  const dbUser = await User.findById(req.user?.id);
  if (!dbUser || dbUser.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

const requireAgentOrAdmin = async (req, res, next) => {
  const dbUser = await User.findById(req.user?.id);
  if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "agent")) {
    return res.status(403).json({ error: "Agent/Admin krävs" });
  }
  next();
};

async function getDbUser(req) {
  return await User.findById(req.user?.id);
}

/* =====================
   ✅ Email (SMTP)
===================== */
function smtpReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/* =====================
   ✅ INBOX REALTIME (SSE)
===================== */
const sseClients = new Map(); // userId -> Set(res)
function sseAddClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);
}
function sseRemoveClient(userId, res) {
  const set = sseClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(userId);
}
function sseSendToUser(userId, event, payload) {
  const set = sseClients.get(String(userId));
  if (!set || !set.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const res of set) {
    try {
      res.write(msg);
    } catch {}
  }
}

/* =====================
   ✅ ROUTES BASIC
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/health", (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.get("/me", authenticate, async (req, res) => {
  const u = await User.findById(req.user.id).select("-password");
  if (!u) return res.status(404).json({ error: "User saknas" });

  return res.json({
    id: u._id,
    username: u.username,
    role: u.role,
    email: u.email || "",
    publicId: u.publicId || "",
    idNumber: u.idNumber || null,
  });
});

/* =====================
   ✅ AUTH
===================== */
app.post("/register", async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await new User({ username, password: hashedPassword, email: email || "" }).save();
    return res.json({
      message: "Registrering lyckades",
      user: { id: u._id, username: u.username, role: u.role, publicId: u.publicId, idNumber: u.idNumber },
    });
  } catch {
    return res.status(400).json({ error: "Användarnamn upptaget" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const u = await User.findOne({ username });
  if (!u) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const token = jwt.sign({ id: u._id, username: u.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  return res.json({
    token,
    user: {
      id: u._id,
      username: u.username,
      role: u.role,
      email: u.email || "",
      publicId: u.publicId,
      idNumber: u.idNumber,
    },
  });
});

app.post("/auth/change-username", authenticate, async (req, res) => {
  try {
    const { newUsername } = req.body || {};
    if (!newUsername || newUsername.length < 3) return res.status(400).json({ error: "Nytt username är för kort" });

    const exists = await User.findOne({ username: newUsername });
    if (exists) return res.status(400).json({ error: "Användarnamn upptaget" });

    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ error: "User saknas" });

    u.username = newUsername;
    await u.save();

    return res.json({ message: "Användarnamn uppdaterat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid byte av användarnamn" });
  }
});

app.post("/auth/change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Fyll i båda fälten" });

    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ error: "User saknas" });

    const ok = await bcrypt.compare(currentPassword, u.password);
    if (!ok) return res.status(401).json({ error: "Fel nuvarande lösenord" });

    u.password = await bcrypt.hash(newPassword, 10);
    await u.save();

    return res.json({ message: "Lösenord uppdaterat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid byte av lösenord" });
  }
});

app.post("/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email krävs" });

    const u = await User.findOne({ email });
    if (!u) return res.json({ message: "Om email finns så skickas en länk ✅" });

    if (!smtpReady()) return res.status(500).json({ error: "SMTP är inte konfigurerat i Render ENV" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    u.resetTokenHash = resetTokenHash;
    u.resetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await u.save();

    const resetLink = `${process.env.APP_URL}/?resetToken=${resetToken}`;

    const transporter = createTransport();
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Återställ ditt lösenord",
      html: `
        <div style="font-family:Arial">
          <h2>Återställ lösenord</h2>
          <p>Klicka på länken nedan för att välja nytt lösenord:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>Länken gäller i 30 minuter.</p>
        </div>
      `,
    });

    return res.json({ message: "Återställningsmail skickat ✅" });
  } catch (e) {
    console.error("❌ forgot-password error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid återställning (mail)" });
  }
});

app.post("/auth/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body || {};
    if (!resetToken || !newPassword) return res.status(400).json({ error: "Token + nytt lösenord krävs" });

    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    const u = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiresAt: { $gt: new Date() },
    });

    if (!u) return res.status(400).json({ error: "Reset-token är ogiltig eller har gått ut" });

    u.password = await bcrypt.hash(newPassword, 10);
    u.resetTokenHash = "";
    u.resetTokenExpiresAt = null;
    await u.save();

    return res.json({ message: "Lösenord återställt ✅ Logga in nu." });
  } catch (e) {
    console.error("❌ reset-password error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid reset" });
  }
});

/* =====================
   ✅ Feedback
===================== */
app.post("/feedback", authenticate, async (req, res) => {
  try {
    const { type, companyId } = req.body || {};
    if (!type) return res.status(400).json({ error: "type saknas" });

    await new Feedback({ userId: req.user.id, type, companyId: companyId || "demo" }).save();
    return res.json({ message: "Feedback sparad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid feedback" });
  }
});

/* =====================
   ✅ Categories
===================== */
app.get("/categories", async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ createdAt: 1 });
    return res.json(cats.map((c) => ({ key: c.key, name: c.name, systemPrompt: c.systemPrompt })));
  } catch {
    return res.status(500).json({ error: "Serverfel vid kategorier" });
  }
});

/* ✅ ADMIN: Create category */
app.post("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  try {
    const { key, name, systemPrompt } = req.body || {};
    if (!key || !name) return res.status(400).json({ error: "key + name krävs" });

    const exists = await Category.findOne({ key });
    if (exists) return res.status(400).json({ error: "Kategori key finns redan" });

    const c = await new Category({ key, name, systemPrompt: systemPrompt || "" }).save();
    return res.json({ message: "Kategori skapad ✅", category: c });
  } catch {
    return res.status(500).json({ error: "Serverfel vid skapa kategori" });
  }
});

/* ✅ ADMIN: Update category */
app.put("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    const { name, systemPrompt } = req.body || {};

    const c = await Category.findOne({ key });
    if (!c) return res.status(404).json({ error: "Kategori hittades inte" });

    if (typeof name === "string") c.name = name;
    if (typeof systemPrompt === "string") c.systemPrompt = systemPrompt;

    await c.save();
    return res.json({
      message: "Kategori uppdaterad ✅",
      category: { key: c.key, name: c.name, systemPrompt: c.systemPrompt },
    });
  } catch {
    return res.status(500).json({ error: "Serverfel vid uppdatera kategori" });
  }
});

/* ✅ ADMIN: Delete category */
app.delete("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;

    if (["demo", "law", "tech", "cleaning"].includes(key)) {
      return res.status(400).json({ error: "Default-kategorier kan inte raderas" });
    }

    const c = await Category.findOneAndDelete({ key });
    if (!c) return res.status(404).json({ error: "Kategori hittades inte" });

    return res.json({ message: "Kategori raderad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid radera kategori" });
  }
});

/* =====================
   ✅ CHAT (ticket + RAG)
===================== */
app.post("/chat", authenticate, async (req, res) => {
  try {
    const { companyId, conversation, ticketId } = req.body || {};
    if (!companyId || !Array.isArray(conversation))
      return res.status(400).json({ error: "companyId eller konversation saknas" });

    let ticket;
    if (ticketId) {
      ticket = await Ticket.findOne({ _id: ticketId, userId: req.user.id });
      if (!ticket) return res.status(404).json({ error: "Ticket hittades inte" });
    } else {
      ticket = await ensureTicket(req.user.id, companyId);
    }

    const lastUser = conversation[conversation.length - 1];
    const userQuery = cleanText(lastUser?.content || "");

    if (lastUser?.role === "user") {
      ticket.messages.push({ role: "user", content: userQuery, timestamp: new Date() });
      if (!ticket.title) ticket.title = userQuery.slice(0, 60);
      ticket.lastActivityAt = new Date();

      if (ticket.status === "pending" && ticket.pendingStartedAt) {
        const add = msBetween(ticket.pendingStartedAt, new Date()) || 0;
        ticket.pendingTotalMs = Number(ticket.pendingTotalMs || 0) + add;
        ticket.pendingStartedAt = null;
        ticket.status = "open";
      }

      safeEnsureSla(ticket);
      await ticket.save();

      if (ticket.assignedToUserId) {
        sseSendToUser(String(ticket.assignedToUserId), "inbox:new", {
          ticketId: String(ticket._id),
          title: ticket.title || "",
          companyId: ticket.companyId,
          status: ticket.status,
          lastActivityAt: ticket.lastActivityAt,
        });
      }
    }

    const cat = await Category.findOne({ key: companyId });
    const systemPrompt = cat?.systemPrompt || "Du är en professionell och vänlig AI-kundtjänst på svenska.";

    const rag = await ragSearch(companyId, userQuery, 4);
    const isNewConversation = (ticket.messages || []).filter((m) => m.role === "user").length <= 1;

    const systemMessage = {
      role: "system",
      content:
        [
          systemPrompt,
          "",
          "VIKTIGT:",
          "- Svara på svenska.",
          "- Var tydlig, trevlig, professionell och lösningsorienterad.",
          "- Ställ en kort följdfråga om något är oklart.",
          "- Ge steg-för-steg när det är tekniska problem.",
          "- Om du saknar info: be om exakt det du behöver.",
          isNewConversation ? "- Börja med en kort välkomstfras." : "",
          rag.used ? "Intern kunskapsdatabas (om relevant):" : "",
          rag.used ? rag.context : "",
        ]
          .filter(Boolean)
          .join("\n"),
    };

    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.4,
    });

    const reply = cleanText(response.choices?.[0]?.message?.content || "Inget svar från AI.");

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    ticket.lastActivityAt = new Date();

    safeEnsureSla(ticket);
    await ticket.save();

    return res.json({
      reply,
      ticketId: ticket._id,
      ragUsed: rag.used,
      sources: rag.sources,
      publicTicketId: ticket.publicTicketId,
      ticketNumber: ticket.ticketNumber,
    });
  } catch (e) {
    console.error("❌ Chat error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/* =====================
   ✅ USER: My tickets
===================== */
app.get("/my/tickets", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ lastActivityAt: -1 }).limit(100);
  tickets.forEach((t) => safeEnsureSla(t));
  return res.json(tickets);
});

app.get("/my/tickets/:ticketId", authenticate, async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.ticketId, userId: req.user.id });
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  safeEnsureSla(t);
  return res.json(t);
});

app.post("/my/tickets/:ticketId/reply", authenticate, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "content saknas" });

    const t = await Ticket.findOne({ _id: req.params.ticketId, userId: req.user.id });
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    t.messages.push({ role: "user", content: cleanText(content), timestamp: new Date() });

    t.status = "open";
    t.lastActivityAt = new Date();

    if (t.pendingStartedAt) {
      const add = msBetween(t.pendingStartedAt, new Date()) || 0;
      t.pendingTotalMs = Number(t.pendingTotalMs || 0) + add;
      t.pendingStartedAt = null;
    }

    safeEnsureSla(t);
    await t.save();

    if (t.assignedToUserId) {
      sseSendToUser(String(t.assignedToUserId), "inbox:new", {
        ticketId: String(t._id),
        title: t.title || "",
        companyId: t.companyId,
        status: t.status,
        lastActivityAt: t.lastActivityAt,
      });
    }

    return res.json({ message: "Svar skickat ✅", ticket: t });
  } catch (e) {
    console.error("❌ my ticket reply error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid svar i ticket" });
  }
});

/* =====================
   ✅ DEL 1 SLUTAR HÄR
   Nästa meddelande = DEL 2/2
===================== */
/* =====================
   ✅ ADMIN/AGENT: SSE realtime events
   (för inbox highlight + notis)
===================== */
app.get("/events", authenticate, async (req, res) => {
  try {
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).end();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // registrera client
    sseAddClient(String(u._id), res);

    // ping så den inte dör i render/proxy
    const ping = setInterval(() => {
      try {
        res.write(`event: ping\ndata: {"t":"${new Date().toISOString()}"}\n\n`);
      } catch {}
    }, 25000);

    req.on("close", () => {
      clearInterval(ping);
      sseRemoveClient(String(u._id), res);
    });
  } catch {
    return res.status(500).end();
  }
});

/* =====================
   ✅ ADMIN USERS (list + role + delete)
===================== */
app.get("/admin/users", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(401).json({ error: "Inte inloggad" });

    // Agent får se endast agents/admin (för assign)
    if (dbUser.role === "agent") {
      const users = await User.find({ role: { $in: ["agent", "admin"] } }).select("-password").sort({ createdAt: -1 });
      return res.json(users);
    }

    // Admin får se alla
    const users = await User.find({}).select("-password").sort({ createdAt: -1 });
    return res.json(users);
  } catch {
    return res.status(500).json({ error: "Serverfel users" });
  }
});

app.post("/admin/users/:id/role", authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: "User saknas" });

    u.role = role;
    await u.save();
    return res.json({ message: "Roll uppdaterad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel roll" });
  }
});

app.delete("/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ error: "Du kan inte ta bort dig själv" });
    }

    await User.deleteOne({ _id: req.params.id });
    return res.json({ message: "User borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel delete user" });
  }
});

/* =====================
   ✅ ADMIN/AGENT: Tickets (Inbox)
   - Agent ser bara tickets assignedToUserId == agent
   - Admin ser alla
===================== */
function buildTicketQueryForRole(dbUser, reqQuery) {
  const q = {};
  const status = reqQuery.status || "";
  const companyId = reqQuery.companyId || "";

  if (status) q.status = status;
  if (companyId) q.companyId = companyId;

  if (dbUser.role === "agent") {
    q.assignedToUserId = dbUser._id;
  }
  return q;
}

app.get("/admin/tickets", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(401).json({ error: "Inte inloggad" });

    const q = buildTicketQueryForRole(dbUser, req.query || {});
    const tickets = await Ticket.find(q).sort({ lastActivityAt: -1 }).limit(400);

    tickets.forEach((t) => safeEnsureSla(t));
    return res.json(tickets);
  } catch {
    return res.status(500).json({ error: "Serverfel tickets" });
  }
});

app.get("/admin/tickets/:ticketId", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(401).json({ error: "Inte inloggad" });

    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket saknas" });

    // Agent får endast öppna sina assigned tickets
    if (dbUser.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Inte behörig" });
    }

    safeEnsureSla(t);
    return res.json(t);
  } catch {
    return res.status(500).json({ error: "Serverfel ticket details" });
  }
});

app.post("/admin/tickets/:ticketId/status", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["open", "pending", "solved"].includes(status)) return res.status(400).json({ error: "Ogiltig status" });

    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket saknas" });

    if (dbUser.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Inte behörig" });
    }

    const now = new Date();

    // pending -> start pause timer
    if (status === "pending" && t.status !== "pending") {
      t.pendingStartedAt = now;
    }

    // leaving pending -> add paused
    if (t.status === "pending" && status !== "pending" && t.pendingStartedAt) {
      const add = msBetween(t.pendingStartedAt, now) || 0;
      t.pendingTotalMs = Number(t.pendingTotalMs || 0) + add;
      t.pendingStartedAt = null;
    }

    t.status = status;

    if (status === "solved") {
      t.solvedAt = now;
    } else {
      t.solvedAt = null;
    }

    t.lastActivityAt = now;
    safeEnsureSla(t);
    await t.save();

    // log SLA stat when solved
    if (status === "solved") {
      const sla = computeSlaForTicket(t, now);
      await new SLAStat({
        scope: "ticket",
        agentUserId: t.agentUserId || t.assignedToUserId || null,
        ticketId: t._id,
        createdAt: now,
        firstResponseMs: sla.firstResponseMs,
        resolutionMs: sla.resolutionMs,
        breachedFirstResponse: sla.breachedFirstResponse,
        breachedResolution: sla.breachedResolution,
        priority: t.priority || "normal",
        companyId: t.companyId || "",
      }).save();
    }

    return res.json({ message: "Status uppdaterad ✅", ticket: t });
  } catch (e) {
    console.error("❌ status error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel status" });
  }
});

app.post("/admin/tickets/:ticketId/priority", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const { priority } = req.body || {};
    if (!["low", "normal", "high"].includes(priority)) return res.status(400).json({ error: "Ogiltig prio" });

    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket saknas" });

    if (dbUser.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Inte behörig" });
    }

    t.priority = priority;
    t.lastActivityAt = new Date();
    safeEnsureSla(t);
    await t.save();

    return res.json({ message: "Prioritet uppdaterad ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel prio" });
  }
});

app.post("/admin/tickets/:ticketId/agent-reply", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "content saknas" });

    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket saknas" });

    if (dbUser.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Inte behörig" });
    }

    const now = new Date();

    t.messages.push({ role: "agent", content: cleanText(content), timestamp: now });
    t.lastActivityAt = now;

    // First agent reply time
    if (!t.firstAgentReplyAt) {
      t.firstAgentReplyAt = now;
      t.agentUserId = dbUser._id;
    }

    // Ticket goes to pending after reply (vanligt)
    if (t.status === "open") {
      t.status = "pending";
      t.pendingStartedAt = now;
    }

    safeEnsureSla(t);
    await t.save();

    return res.json({ message: "Svar skickat ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel agent reply" });
  }
});

app.post("/admin/tickets/:ticketId/internal-note", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "content saknas" });

    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket saknas" });

    if (dbUser.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Inte behörig" });
    }

    t.internalNotes.push({ createdBy: dbUser._id, content: cleanText(content), createdAt: new Date() });
    await t.save();

    return res.json({ message: "Note sparad ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel note" });
  }
});

app.delete("/admin/tickets/:ticketId/internal-notes", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket saknas" });

    if (dbUser.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Inte behörig" });
    }

    t.internalNotes = [];
    await t.save();

    return res.json({ message: "Notes rensade ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel clear notes" });
  }
});

/* ✅ Assign ticket to agent (admin + agent allowed) */
app.post("/admin/tickets/:ticketId/assign", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId saknas" });

    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket saknas" });

    // agent får bara assigna tickets som de själva har
    if (dbUser.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Inte behörig" });
    }

    const toUser = await User.findById(userId);
    if (!toUser || (toUser.role !== "agent" && toUser.role !== "admin")) {
      return res.status(400).json({ error: "Target user måste vara agent/admin" });
    }

    t.assignedToUserId = toUser._id;
    t.lastActivityAt = new Date();
    await t.save();

    // realtime ping till nya agenten
    sseSendToUser(String(toUser._id), "inbox:new", {
      ticketId: String(t._id),
      title: t.title || "",
      companyId: t.companyId,
      status: t.status,
      lastActivityAt: t.lastActivityAt,
    });

    return res.json({ message: "Assigned ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel assign" });
  }
});

app.delete("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  try {
    await Ticket.deleteOne({ _id: req.params.ticketId });
    return res.json({ message: "Ticket borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel delete ticket" });
  }
});

/* ✅ Solve all / remove solved (Admin only) */
app.post("/admin/tickets/solve-all", authenticate, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const list = await Ticket.find({ status: { $ne: "solved" } }).limit(2000);
    for (const t of list) {
      t.status = "solved";
      t.solvedAt = now;
      safeEnsureSla(t);
      await t.save();
    }
    return res.json({ message: "Solve all ✅", count: list.length });
  } catch {
    return res.status(500).json({ error: "Serverfel solve all" });
  }
});

app.post("/admin/tickets/remove-solved", authenticate, requireAdmin, async (req, res) => {
  try {
    const r = await Ticket.deleteMany({ status: "solved" });
    return res.json({ message: "Removed solved ✅", deleted: r.deletedCount || 0 });
  } catch {
    return res.status(500).json({ error: "Serverfel remove solved" });
  }
});

/* =====================
   ✅ SLA / KPI (Agent sees only their own)
===================== */
function daysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function applyRoleScopeTickets(dbUser, baseQuery) {
  const q = { ...baseQuery };
  if (dbUser.role === "agent") {
    q.assignedToUserId = dbUser._id;
  }
  return q;
}

/* Overview: admin gets all, agent only own */
app.get("/admin/sla/overview", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const dbUser = await getDbUser(req);

    const from = daysAgoDate(days);
    const q = applyRoleScopeTickets(dbUser, { createdAt: { $gte: from } });

    const tickets = await Ticket.find(q).limit(5000);
    tickets.forEach((t) => safeEnsureSla(t));

    const byP = { low: 0, normal: 0, high: 0 };
    for (const t of tickets) byP[t.priority || "normal"] = (byP[t.priority || "normal"] || 0) + 1;

    const firstMs = tickets.map((t) => t.sla?.firstResponseMs).filter((x) => typeof x === "number");
    const resMs = tickets.map((t) => t.sla?.resolutionMs).filter((x) => typeof x === "number");

    const firstBreaches = tickets.filter((t) => t.sla?.breachedFirstResponse).length;
    const resBreaches = tickets.filter((t) => t.sla?.breachedResolution).length;

    const firstComp = tickets.length ? Math.round(((tickets.length - firstBreaches) / tickets.length) * 100) : null;
    const resComp = tickets.length ? Math.round(((tickets.length - resBreaches) / tickets.length) * 100) : null;

    return res.json({
      totalTickets: tickets.length,
      byPriority: byP,
      firstResponse: {
        avgMs: avg(firstMs),
        medianMs: median(firstMs),
        p90Ms: percentile(firstMs, 90),
        breaches: firstBreaches,
        compliancePct: firstComp,
      },
      resolution: {
        avgMs: avg(resMs),
        medianMs: median(resMs),
        p90Ms: percentile(resMs, 90),
        breaches: resBreaches,
        compliancePct: resComp,
      },
    });
  } catch (e) {
    console.error("❌ SLA overview error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel SLA overview" });
  }
});

/* Agents table: admin gets everyone, agent sees only themselves */
app.get("/admin/sla/agents", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const dbUser = await getDbUser(req);
    const from = daysAgoDate(days);

    let agents = [];
    if (dbUser.role === "agent") {
      agents = [dbUser];
    } else {
      agents = await User.find({ role: { $in: ["agent", "admin"] } }).select("-password");
    }

    const rows = [];
    for (const ag of agents) {
      const tq = { assignedToUserId: ag._id, createdAt: { $gte: from } };
      const tickets = await Ticket.find(tq).limit(5000);
      tickets.forEach((t) => safeEnsureSla(t));

      const firstMs = tickets.map((t) => t.sla?.firstResponseMs).filter((x) => typeof x === "number");
      const resMs = tickets.map((t) => t.sla?.resolutionMs).filter((x) => typeof x === "number");

      const firstBreaches = tickets.filter((t) => t.sla?.breachedFirstResponse).length;
      const resBreaches = tickets.filter((t) => t.sla?.breachedResolution).length;

      const firstComp = tickets.length ? Math.round(((tickets.length - firstBreaches) / tickets.length) * 100) : null;
      const resComp = tickets.length ? Math.round(((tickets.length - resBreaches) / tickets.length) * 100) : null;

      rows.push({
        userId: ag._id,
        username: ag.username,
        role: ag.role,
        tickets: tickets.length,
        open: tickets.filter((t) => t.status === "open").length,
        pending: tickets.filter((t) => t.status === "pending").length,
        solved: tickets.filter((t) => t.status === "solved").length,
        firstResponse: { avgMs: avg(firstMs), compliancePct: firstComp },
        resolution: { avgMs: avg(resMs), compliancePct: resComp },
      });
    }

    rows.sort((a, b) => (b.tickets || 0) - (a.tickets || 0));
    return res.json({ rows });
  } catch {
    return res.status(500).json({ error: "Serverfel SLA agents" });
  }
});

/* Trend weekly */
app.get("/admin/sla/trend/weekly", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const dbUser = await getDbUser(req);

    const from = daysAgoDate(days);
    const q = applyRoleScopeTickets(dbUser, { createdAt: { $gte: from } });
    const tickets = await Ticket.find(q).limit(10000);

    // grupp per vecka
    const map = new Map();
    for (const t of tickets) {
      safeEnsureSla(t);
      const dt = new Date(t.createdAt);
      const y = dt.getFullYear();
      const onejan = new Date(y, 0, 1);
      const week = Math.ceil((((dt - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      const key = `${y}-V${week}`;

      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }

    const rows = [];
    for (const [week, arr] of map.entries()) {
      const firstBreaches = arr.filter((t) => t.sla?.breachedFirstResponse).length;
      const resBreaches = arr.filter((t) => t.sla?.breachedResolution).length;

      const firstComp = arr.length ? Math.round(((arr.length - firstBreaches) / arr.length) * 100) : 0;
      const resComp = arr.length ? Math.round(((arr.length - resBreaches) / arr.length) * 100) : 0;

      rows.push({
        week,
        count: arr.length,
        firstCompliancePct: firstComp,
        resolutionCompliancePct: resComp,
      });
    }

    rows.sort((a, b) => a.week.localeCompare(b.week));
    return res.json({ rows });
  } catch {
    return res.status(500).json({ error: "Serverfel SLA trend" });
  }
});

/* SLA Tickets list */
app.get("/admin/sla/tickets", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const dbUser = await getDbUser(req);
    const from = daysAgoDate(days);

    const q = applyRoleScopeTickets(dbUser, { createdAt: { $gte: from } });
    const tickets = await Ticket.find(q).sort({ createdAt: -1 }).limit(5000);

    const rows = tickets.map((t) => {
      safeEnsureSla(t);
      return {
        ticketId: t.ticketNumber ? `#${t.ticketNumber}` : String(t._id),
        _id: t._id,
        publicTicketId: t.publicTicketId,
        companyId: t.companyId,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        assignedToUserId: t.assignedToUserId,
        sla: {
          firstResponseMs: t.sla?.firstResponseMs ?? null,
          resolutionMs: t.sla?.resolutionMs ?? null,
          breachedFirstResponse: !!t.sla?.breachedFirstResponse,
          breachedResolution: !!t.sla?.breachedResolution,
          firstResponseState: t.sla?.firstResponseState || "",
          resolutionState: t.sla?.resolutionState || "",
        },
      };
    });

    return res.json({ rows });
  } catch {
    return res.status(500).json({ error: "Serverfel SLA tickets" });
  }
});

/* Export CSV */
app.get("/admin/sla/export/csv", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const dbUser = await getDbUser(req);
    const from = daysAgoDate(days);

    const q = applyRoleScopeTickets(dbUser, { createdAt: { $gte: from } });
    const tickets = await Ticket.find(q).sort({ createdAt: -1 }).limit(10000);

    const rows = tickets.map((t) => {
      safeEnsureSla(t);
      return {
        ticketNumber: t.ticketNumber || "",
        publicTicketId: t.publicTicketId || "",
        companyId: t.companyId || "",
        status: t.status || "",
        priority: t.priority || "",
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : "",
        assignedTo: t.assignedToUserId ? String(t.assignedToUserId) : "",
        firstResponseMs: t.sla?.firstResponseMs ?? "",
        resolutionMs: t.sla?.resolutionMs ?? "",
        breachedFirstResponse: t.sla?.breachedFirstResponse ? "YES" : "NO",
        breachedResolution: t.sla?.breachedResolution ? "YES" : "NO",
        pendingTotalMs: t.sla?.pendingTotalMs ?? "",
      };
    });

    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sla_export_${days}d.csv"`);
    return res.send(csv);
  } catch {
    return res.status(500).json({ error: "Serverfel export csv" });
  }
});

/* Clear stats:
   - Agent: clears their SLAStat rows only
   - Admin: clears all
*/
app.delete("/admin/sla/clear/my", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(401).json({ error: "Inte inloggad" });

    await SLAStat.deleteMany({ agentUserId: dbUser._id });
    return res.json({ message: "Din statistik rensad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel clear my stats" });
  }
});

app.delete("/admin/sla/clear/all", authenticate, requireAdmin, async (req, res) => {
  try {
    await SLAStat.deleteMany({});
    return res.json({ message: "ALL statistik rensad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel clear all stats" });
  }
});

/* =====================
   ✅ KB Endpoints
   - list
   - upload text/url/pdf
   - export
   - delete specific kb item ✅
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const items = await KBChunk.find({ companyId, isDeleted: false }).sort({ createdAt: -1 }).limit(600);
    return res.json(items);
  } catch {
    return res.status(500).json({ error: "Serverfel KB list" });
  }
});

app.post("/kb/upload-text", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, title, content } = req.body || {};
    if (!companyId || !content) return res.status(400).json({ error: "companyId + content krävs" });

    const chunks = chunkText(content);
    if (!chunks.length) return res.status(400).json({ error: "Ingen text att spara" });

    let created = 0;
    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      await new KBChunk({
        companyId,
        sourceType: "text",
        sourceRef: title || "Text",
        title: title || "Text",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk: !!emb,
      }).save();
      created++;
    }

    return res.json({ message: `Uppladdat ✅ (${created} chunks)` });
  } catch (e) {
    console.error("❌ upload-text:", e?.message || e);
    return res.status(500).json({ error: "Serverfel upload text" });
  }
});

app.post("/kb/upload-url", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, url } = req.body || {};
    if (!companyId || !url) return res.status(400).json({ error: "companyId + url krävs" });

    const txt = await fetchUrlText(url);
    const chunks = chunkText(txt);

    let created = 0;
    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      await new KBChunk({
        companyId,
        sourceType: "url",
        sourceRef: url,
        title: url,
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk: !!emb,
      }).save();
      created++;
    }

    return res.json({ message: `URL uppladdad ✅ (${created} chunks)` });
  } catch (e) {
    console.error("❌ upload-url:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Serverfel upload url" });
  }
});

app.post("/kb/upload-pdf", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, filename, base64 } = req.body || {};
    if (!companyId || !base64) return res.status(400).json({ error: "companyId + base64 krävs" });

    const txt = await extractPdfText(base64);
    const chunks = chunkText(txt);

    let created = 0;
    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      await new KBChunk({
        companyId,
        sourceType: "pdf",
        sourceRef: filename || "PDF",
        title: filename || "PDF",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk: !!emb,
      }).save();
      created++;
    }

    return res.json({ message: `PDF uppladdad ✅ (${created} chunks)` });
  } catch (e) {
    console.error("❌ upload-pdf:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Serverfel upload pdf" });
  }
});

/* ✅ Delete specific KB by id */
app.delete("/kb/item/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const it = await KBChunk.findById(req.params.id);
    if (!it) return res.status(404).json({ error: "KB item saknas" });

    it.isDeleted = true;
    await it.save();
    return res.json({ message: "KB item borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel delete KB item" });
  }
});

app.get("/export/kb/:companyId", authenticate, requireAdmin, async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const items = await KBChunk.find({ companyId, isDeleted: false }).sort({ createdAt: -1 }).limit(5000);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="kb_${companyId}.json"`);
    return res.send(JSON.stringify(items, null, 2));
  } catch {
    return res.status(500).json({ error: "Serverfel export KB" });
  }
});

/* =====================
   ✅ ADMIN EXPORTS
===================== */
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("-password");
    const tickets = await Ticket.find({}).limit(20000);
    const cats = await Category.find({});
    const kb = await KBChunk.find({ isDeleted: false }).limit(20000);
    const feedback = await Feedback.find({}).limit(20000);

    const data = { users, tickets, categories: cats, kb, feedback };
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="export_all_${new Date().toISOString().slice(0, 10)}.json"`);
    return res.send(JSON.stringify(data, null, 2));
  } catch {
    return res.status(500).json({ error: "Serverfel export all" });
  }
});

app.get("/admin/export/training", authenticate, requireAdmin, async (req, res) => {
  try {
    const companyId = req.query.companyId || "demo";
    const chunks = await KBChunk.find({ companyId, isDeleted: false }).sort({ createdAt: -1 }).limit(5000);

    const rows = chunks.map((c) => ({
      companyId: c.companyId,
      title: c.title,
      sourceType: c.sourceType,
      content: c.content,
    }));

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="training_export_${companyId}.json"`);
    return res.send(JSON.stringify(rows, null, 2));
  } catch {
    return res.status(500).json({ error: "Serverfel export training" });
  }
});

/* =====================
   ✅ Widget endpoint
   - enkel "status" widget du kan använda i framtiden
===================== */
app.get("/widget/status", async (req, res) => {
  try {
    const openTickets = await Ticket.countDocuments({ status: "open" });
    const pendingTickets = await Ticket.countDocuments({ status: "pending" });

    return res.json({
      ok: true,
      openTickets,
      pendingTickets,
      lastUpdate: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/* =====================
   ✅ Fallback (important)
===================== */
app.use((req, res) => {
  return res.status(404).json({ error: "Endpoint finns inte" });
});

/* =====================
   ✅ START
===================== */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log("✅ Server kör på port", port));
