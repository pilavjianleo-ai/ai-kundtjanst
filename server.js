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

// ✅ FIX: fetch fallback for Node/Render (if needed)
let safeFetch = globalThis.fetch;
try {
  if (!safeFetch) safeFetch = require("node-fetch");
} catch {
  // ignore
}

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "18mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* =====================
   ✅ ENV
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

function envOk(name) {
  return process.env[name] ? "OK" : "SAKNAS";
}

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", envOk("JWT_SECRET"));
console.log("OPENAI_API_KEY:", envOk("OPENAI_API_KEY"));
console.log("OPENAI_MODEL:", process.env.OPENAI_MODEL || "gpt-4o-mini (default)");
console.log("SMTP_HOST:", envOk("SMTP_HOST"));
console.log("SMTP_USER:", envOk("SMTP_USER"));
console.log("APP_URL:", envOk("APP_URL"));

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
   ✅ Helpers
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

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

function asObjectIdString(v) {
  try {
    return String(v || "");
  } catch {
    return "";
  }
}

/* =====================
   ✅ Models
===================== */
const userSchema = new mongoose.Schema({
  // ✅ Stable public user id
  publicUserId: { type: String, unique: true, index: true, default: () => genPublicId("U") },

  username: { type: String, unique: true, required: true, index: true },
  email: { type: String, default: "", index: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" }, // user | agent | admin

  resetTokenHash: { type: String, default: "" },
  resetTokenExpiresAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
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

  const breachedFirstResponse = firstResponseMs !== null ? firstResponseMs > limits.firstResponseLimitMs : false;

  const effectiveRunningMs = solvedAt ? resolutionMs : calcEffectiveMsFromCreated(t, now, now);
  const breachedResolution = effectiveRunningMs != null ? effectiveRunningMs > limits.resolutionLimitMs : false;

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
   ✅ Ticket model (STABLE ID)
===================== */
function genPublicId(prefix = "T") {
  const rnd = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${rnd}`;
}

const ticketSchema = new mongoose.Schema({
  // ✅ Stable ID (use only ticketPublicId everywhere)
  ticketPublicId: { type: String, unique: true, index: true, default: () => genPublicId("T") },

  // ✅ Backward compatibility (existing DB might have this index)
  publicTicketId: { type: String, unique: true, index: true, default: "" },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true },

  status: { type: String, default: "open" }, // open | pending | solved
  priority: { type: String, default: "normal" }, // low | normal | high
  title: { type: String, default: "" },

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

  sla: {
    firstResponseMs: { type: Number, default: null },
    resolutionMs: { type: Number, default: null },
    breachedFirstResponse: { type: Boolean, default: false },
    breachedResolution: { type: Boolean, default: false },

    firstResponseLimitMs: { type: Number, default: null },
    resolutionLimitMs: { type: Number, default: null },

    firstResponseDueAt: { type: Date, default: null },
    resolutionDueAt: { type: Date, default: null },
    firstResponseRemainingMs: { type: Number, default: null },
    resolutionRemainingMs: { type: Number, default: null },
    effectiveRunningMs: { type: Number, default: null },
    pendingTotalMs: { type: Number, default: 0 },

    pretty: {
      firstResponse: { type: String, default: "" },
      resolution: { type: String, default: "" },
      pendingTotal: { type: String, default: "" },
      effectiveRunning: { type: String, default: "" },
      firstRemaining: { type: String, default: "" },
      resolutionRemaining: { type: String, default: "" },
    },
  },

  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

// ✅ ensure legacy field matches (avoids DB conflicts)
ticketSchema.pre("save", function (next) {
  if (!this.ticketPublicId) this.ticketPublicId = genPublicId("T");
  if (!this.publicTicketId) this.publicTicketId = this.ticketPublicId;
  next();
});

ticketSchema.index({ lastActivityAt: -1 });
ticketSchema.index({ companyId: 1, status: 1, lastActivityAt: -1 });
ticketSchema.index({ assignedToUserId: 1, lastActivityAt: -1 });

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

/* =====================
   ✅ Category schema
===================== */
const categorySchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true, index: true }, // companyId
  name: { type: String, default: "" },
  systemPrompt: { type: String, default: "" },

  settings: {
    tone: { type: String, default: "professional" }, // professional | friendly | strict
    language: { type: String, default: "sv" },
    allowEmojis: { type: Boolean, default: true },
  },

  createdAt: { type: Date, default: Date.now },
});
const Category = mongoose.model("Category", categorySchema);

/* =====================
   ✅ AI Chat global settings
===================== */
const aiSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "global" },

  greeting: { type: String, default: "Hej! 👋 Hur kan jag hjälpa dig idag?" },
  tips: { type: String, default: "Tips: Beskriv problemet så tydligt som möjligt." },
  shortcuts: {
    type: [String],
    default: ["Spåra order", "Ändra bokning", "Få hjälp med faktura", "Teknisk felsökning"],
  },

  updatedAt: { type: Date, default: Date.now },
});
const AISettings = mongoose.model("AISettings", aiSettingsSchema);

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
slaStatSchema.index({ companyId: 1, createdAt: -1 });
const SLAStat = mongoose.model("SLAStat", slaStatSchema);

/* =====================
   ✅ Default categories
===================== */
async function ensureDefaultCategories() {
  const defaults = [
    {
      key: "demo",
      name: "Demo AB",
      systemPrompt: "Du är en professionell och vänlig AI-kundtjänst på svenska.",
      settings: { tone: "professional", language: "sv", allowEmojis: true },
    },
    {
      key: "law",
      name: "Juridik",
      systemPrompt:
        "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmän vägledning men inte juridisk rådgivning.",
      settings: { tone: "strict", language: "sv", allowEmojis: false },
    },
    {
      key: "tech",
      name: "Teknisk support",
      systemPrompt:
        "Du är en AI-kundtjänst för teknisk support på svenska. Felsök steg-för-steg och ge konkreta lösningar.",
      settings: { tone: "professional", language: "sv", allowEmojis: true },
    },
    {
      key: "cleaning",
      name: "Städservice",
      systemPrompt:
        "Du är en AI-kundtjänst för städservice på svenska. Hjälp med tjänster, rutiner, bokning och tips.",
      settings: { tone: "friendly", language: "sv", allowEmojis: true },
    },
  ];

  for (const c of defaults) {
    await Category.updateOne({ key: c.key }, { $setOnInsert: c }, { upsert: true });
  }
  console.log("✅ Default categories säkerställda");
}
ensureDefaultCategories().catch((e) => console.error("❌ ensureDefaultCategories error:", e));

async function ensureGlobalAISettings() {
  await AISettings.updateOne({ key: "global" }, { $setOnInsert: { key: "global" } }, { upsert: true });
}
ensureGlobalAISettings().catch(() => {});

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
   ✅ URL + PDF extraction
===================== */
async function fetchUrlText(url) {
  const f = safeFetch || globalThis.fetch;
  if (!f) throw new Error("fetch saknas i servern. Installera node-fetch eller uppgradera Node.");

  const res = await f(url, {
    headers: { "User-Agent": "Mozilla/5.0 (AI Kundtjanst Bot)", Accept: "text/html,application/xhtml+xml" },
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

async function getDbUser(req) {
  return await User.findById(req.user?.id);
}

const requireAdmin = async (req, res, next) => {
  const dbUser = await getDbUser(req);
  if (!dbUser || dbUser.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

const requireAgentOrAdmin = async (req, res, next) => {
  const dbUser = await getDbUser(req);
  if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "agent")) {
    return res.status(403).json({ error: "Agent/Admin krävs" });
  }
  next();
};

/* =====================
   ✅ RAG Embeddings
===================== */
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

  const context = scored.map((s, i) => `KÄLLA ${i + 1}: ${s.c.title || s.c.sourceRef}\n${s.c.content}`).join("\n\n");
  const sources = scored.map((s) => ({
    id: s.c._id,
    title: s.c.title || s.c.sourceRef || "KB",
    sourceType: s.c.sourceType,
    sourceRef: s.c.sourceRef,
  }));

  return { used: true, context, sources };
}

/* =====================
   ✅ Ticket helpers
===================== */
async function ensureTicket(userId, companyId) {
  let t = await Ticket.findOne({ userId, companyId, status: { $ne: "solved" } }).sort({ lastActivityAt: -1 });

  if (!t) {
    t = await new Ticket({
      userId,
      companyId,
      messages: [],
    }).save();
  }

  safeEnsureSla(t);
  if (!t.sla?.firstResponseLimitMs) await t.save().catch(() => {});
  return t;
}

function startPendingTimerIfNeeded(t) {
  if (!t.pendingStartedAt) t.pendingStartedAt = new Date();
}
function stopPendingTimerIfNeeded(t) {
  if (t.pendingStartedAt) {
    const add = msBetween(t.pendingStartedAt, new Date()) || 0;
    t.pendingTotalMs = Number(t.pendingTotalMs || 0) + add;
    t.pendingStartedAt = null;
  }
}

/* =====================
   ✅ ROUTES
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

app.get("/health", (req, res) => {
  return res.json({ ok: true, ts: new Date().toISOString() });
});

app.get("/me", authenticate, async (req, res) => {
  const u = await User.findById(req.user.id).select("-password");
  if (!u) return res.status(404).json({ error: "User saknas" });
  return res.json({
    id: u._id,
    publicUserId: u.publicUserId,
    username: u.username,
    role: u.role,
    email: u.email || "",
  });
});

/* =====================
   ✅ AUTH
===================== */
app.post("/register", async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  if (String(username).trim().length < 3) return res.status(400).json({ error: "Användarnamn måste vara minst 3 tecken" });
  if (String(password).trim().length < 6) return res.status(400).json({ error: "Lösenord måste vara minst 6 tecken" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await new User({
      username: username.trim(),
      password: hashedPassword,
      email: String(email || "").trim(),
    }).save();

    return res.json({
      message: "Registrering lyckades ✅",
      user: { id: u._id, username: u.username, role: u.role, publicUserId: u.publicUserId },
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
  return res.json({ token, user: { id: u._id, username: u.username, role: u.role, email: u.email || "" } });
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

    if (String(newPassword).trim().length < 6) return res.status(400).json({ error: "Nytt lösenord måste vara minst 6 tecken" });

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

    if (String(newPassword).trim().length < 6) return res.status(400).json({ error: "Nytt lösenord måste vara minst 6 tecken" });

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
   ✅ Categories (dropdown)
===================== */
app.get("/categories", async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ key: 1 });
    return res.json(
      cats.map((c) => ({
        key: c.key,
        name: c.name,
        systemPrompt: c.systemPrompt,
        settings: c.settings || {},
      }))
    );
  } catch {
    return res.status(500).json({ error: "Serverfel vid kategorier" });
  }
});

/* =====================
   ✅ AI Global Settings
===================== */
app.get("/ai/settings", authenticate, requireAdmin, async (req, res) => {
  const s = await AISettings.findOne({ key: "global" });
  return res.json(s || {});
});

app.post("/ai/settings", authenticate, requireAdmin, async (req, res) => {
  try {
    const { greeting, tips, shortcuts } = req.body || {};
    const s = await AISettings.findOne({ key: "global" });
    if (!s) {
      await new AISettings({ key: "global", greeting, tips, shortcuts }).save();
      return res.json({ message: "AI Settings sparade ✅" });
    }

    if (typeof greeting === "string") s.greeting = greeting;
    if (typeof tips === "string") s.tips = tips;
    if (Array.isArray(shortcuts)) s.shortcuts = shortcuts.filter(Boolean).slice(0, 12);
    s.updatedAt = new Date();
    await s.save();

    return res.json({ message: "AI Settings uppdaterade ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid AI settings" });
  }
});

/* =====================
   ✅ CHAT
===================== */
function safeGetOpenAIError(e) {
  const msg = e?.message || "Unknown error";
  const status = e?.status || e?.response?.status || null;
  const code = e?.code || e?.error?.code || null;
  const type = e?.type || e?.error?.type || null;
  return { msg, status, code, type };
}

app.post("/chat", authenticate, async (req, res) => {
  try {
    const { companyId, conversation, ticketId } = req.body || {};
    if (!companyId || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "companyId eller konversation saknas" });
    }

    let ticket;
    if (ticketId) {
      ticket = await Ticket.findOne({ _id: ticketId, userId: req.user.id });
      if (!ticket) return res.status(404).json({ error: "Ticket hittades inte" });
    } else {
      ticket = await ensureTicket(req.user.id, companyId);
    }

    const lastUserMsg = [...conversation].reverse().find((m) => m?.role === "user");
    const userQuery = cleanText(lastUserMsg?.content || "");

    if (!userQuery) return res.status(400).json({ error: "Tomt meddelande" });

    // Save user message
    ticket.messages.push({ role: "user", content: userQuery, timestamp: new Date() });
    if (!ticket.title) ticket.title = userQuery.slice(0, 60);
    ticket.lastActivityAt = new Date();

    // If ticket pending and customer writes -> stop pause
    if (ticket.status === "pending" && ticket.pendingStartedAt) {
      const add = msBetween(ticket.pendingStartedAt, new Date()) || 0;
      ticket.pendingTotalMs = Number(ticket.pendingTotalMs || 0) + add;
      ticket.pendingStartedAt = null;
      ticket.status = "open";
    }

    safeEnsureSla(ticket);
    await ticket.save();

    const cat = await Category.findOne({ key: companyId });
    const settings = (await AISettings.findOne({ key: "global" })) || null;

    const systemPrompt =
      cat?.systemPrompt || "Du är en professionell och vänlig AI-kundtjänst på svenska. Svara tydligt och hjälpsamt.";

    const rag = await ragSearch(companyId, userQuery, 4);

    const tone = cat?.settings?.tone || "professional";
    const allowEmojis = cat?.settings?.allowEmojis !== false;

    const toneExtra =
      tone === "friendly"
        ? "Ton: varm, hjälpsam, enkel."
        : tone === "strict"
        ? "Ton: saklig, kort, tydlig. Undvik spekulation."
        : "Ton: professionell, tydlig, konkret.";

    const globalHints = settings
      ? `\n\nHälsningsfras: ${settings.greeting}\nTips: ${settings.tips}\nGenvägar: ${(settings.shortcuts || [])
          .slice(0, 6)
          .join(" | ")}`
      : "";

    const systemMessage = {
      role: "system",
      content:
        `${systemPrompt}\n${toneExtra}\n` +
        (allowEmojis ? "Emojis: tillåt vid behov." : "Emojis: undvik.") +
        globalHints +
        (rag.used ? `\n\nIntern kunskapsdatabas (om relevant):\n${rag.context}\n\nSvara tydligt och konkret.` : ""),
    };

    // ✅ Smart history (only keep last messages)
    const shortHistory = conversation
      .slice(-14)
      .map((m) => ({ role: m.role, content: cleanText(m.content) }))
      .filter((m) => m.content);

    let response;
    try {
      response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [systemMessage, ...shortHistory],
        temperature: 0.4,
      });
    } catch (e) {
      const er = safeGetOpenAIError(e);
      console.error("❌ OpenAI error:", er, e?.stack || "");
      return res.status(500).json({
        error: "Serverfel vid chat (OpenAI). Kontrollera OPENAI_API_KEY och model.",
        debug: er,
      });
    }

    const replyRaw = response?.choices?.[0]?.message?.content || "Inget svar från AI.";
    const reply = cleanText(replyRaw);

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    ticket.lastActivityAt = new Date();

    safeEnsureSla(ticket);
    await ticket.save();

    return res.json({
      reply,
      ticketId: ticket._id,
      ticketPublicId: ticket.ticketPublicId,
      ragUsed: rag.used,
      sources: rag.sources,
    });
  } catch (e) {
    console.error("❌ Chat error:", e?.message || e, e?.stack || "");
    return res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/* =====================
   ✅ USER: My tickets
===================== */
app.get("/my/tickets", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ lastActivityAt: -1 }).limit(120);
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

    return res.json({ message: "Svar skickat ✅", ticket: t });
  } catch (e) {
    console.error("❌ my ticket reply error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid svar i ticket" });
  }
});

/* =====================
   ✅ ADMIN/AGENT: Inbox
===================== */
app.get("/admin/tickets", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const { status, companyId } = req.query || {};

    const query = {};
    if (status) query.status = status;
    if (companyId) query.companyId = companyId;

    if (dbUser?.role === "agent") {
      query.assignedToUserId = dbUser._id;
    }

    const tickets = await Ticket.find(query).sort({ lastActivityAt: -1 }).limit(700);
    tickets.forEach((t) => safeEnsureSla(t));
    return res.json(tickets);
  } catch {
    return res.status(500).json({ error: "Serverfel vid inbox" });
  }
});

app.get("/admin/tickets/:ticketId", authenticate, requireAgentOrAdmin, async (req, res) => {
  const dbUser = await getDbUser(req);

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  if (dbUser?.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
    return res.status(403).json({ error: "Du får bara se dina egna tickets" });
  }

  safeEnsureSla(t);
  return res.json(t);
});

app.post("/admin/tickets/:ticketId/status", authenticate, requireAgentOrAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["open", "pending", "solved"].includes(status)) return res.status(400).json({ error: "Ogiltig status" });

  const dbUser = await getDbUser(req);
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  if (dbUser?.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
    return res.status(403).json({ error: "Du får bara uppdatera dina egna tickets" });
  }

  if (status === "pending") startPendingTimerIfNeeded(t);
  if (status === "open") stopPendingTimerIfNeeded(t);

  t.status = status;
  t.lastActivityAt = new Date();

  if (status === "solved" && !t.solvedAt) {
    stopPendingTimerIfNeeded(t);
    t.solvedAt = new Date();
  }
  if (status !== "solved") t.solvedAt = null;

  safeEnsureSla(t);
  await t.save();

  await SLAStat.create({
    scope: "ticket",
    agentUserId: t.agentUserId || t.assignedToUserId || null,
    ticketId: t._id,
    createdAt: new Date(),
    firstResponseMs: t.sla?.firstResponseMs ?? null,
    resolutionMs: t.sla?.resolutionMs ?? null,
    breachedFirstResponse: !!t.sla?.breachedFirstResponse,
    breachedResolution: !!t.sla?.breachedResolution,
    priority: t.priority || "normal",
    companyId: t.companyId || "",
  }).catch(() => {});

  return res.json({ message: "Status uppdaterad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/priority", authenticate, requireAgentOrAdmin, async (req, res) => {
  const { priority } = req.body || {};
  if (!["low", "normal", "high"].includes(priority)) return res.status(400).json({ error: "Ogiltig prioritet" });

  const dbUser = await getDbUser(req);
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  if (dbUser?.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
    return res.status(403).json({ error: "Du får bara ändra prio på dina egna tickets" });
  }

  t.priority = priority;
  t.lastActivityAt = new Date();

  safeEnsureSla(t);
  await t.save();

  return res.json({ message: "Prioritet uppdaterad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/agent-reply", authenticate, requireAgentOrAdmin, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content saknas" });

  const dbUser = await getDbUser(req);
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  if (dbUser?.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
    return res.status(403).json({ error: "Du får bara svara på dina egna tickets" });
  }

  t.messages.push({ role: "agent", content: cleanText(content), timestamp: new Date() });

  t.status = "pending";
  t.lastActivityAt = new Date();
  t.agentUserId = dbUser?._id || t.agentUserId || null;

  if (!t.firstAgentReplyAt) t.firstAgentReplyAt = new Date();

  startPendingTimerIfNeeded(t);

  safeEnsureSla(t);
  await t.save();

  await SLAStat.create({
    scope: "ticket",
    agentUserId: t.agentUserId || t.assignedToUserId || null,
    ticketId: t._id,
    createdAt: new Date(),
    firstResponseMs: t.sla?.firstResponseMs ?? null,
    resolutionMs: t.sla?.resolutionMs ?? null,
    breachedFirstResponse: !!t.sla?.breachedFirstResponse,
    breachedResolution: !!t.sla?.breachedResolution,
    priority: t.priority || "normal",
    companyId: t.companyId || "",
  }).catch(() => {});

  return res.json({ message: "Agent-svar sparat ✅", ticket: t });
});

/* =====================
   ✅ Internal notes
===================== */
app.post("/admin/tickets/:ticketId/internal-note", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "Notering saknas" });

    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    if (dbUser?.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Du får bara skriva notes på dina egna tickets" });
    }

    t.internalNotes.push({ createdBy: req.user.id, content: cleanText(content) });
    t.lastActivityAt = new Date();

    safeEnsureSla(t);
    await t.save();

    return res.json({ message: "Intern notering sparad ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel vid intern notering" });
  }
});

app.delete("/admin/tickets/:ticketId/internal-notes", authenticate, requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const t = await Ticket.findById(ticketId);
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    t.internalNotes = [];
    t.lastActivityAt = new Date();

    safeEnsureSla(t);
    await t.save();

    return res.json({ message: "Alla noteringar borttagna ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel vid rensning av notes" });
  }
});

/* =====================
   ✅ Solve all / Remove solved
===================== */
app.post("/admin/tickets/solve-all", authenticate, requireAdmin, async (req, res) => {
  try {
    const all = await Ticket.find({ status: { $in: ["open", "pending"] } }).limit(50000);

    for (const t of all) {
      stopPendingTimerIfNeeded(t);
      t.status = "solved";
      t.lastActivityAt = new Date();
      t.solvedAt = new Date();
      safeEnsureSla(t);
      await t.save();
    }

    return res.json({ message: `Solve ALL ✅ Uppdaterade ${all.length} tickets.` });
  } catch (e) {
    console.error("❌ Solve ALL error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid Solve ALL" });
  }
});

app.post("/admin/tickets/remove-solved", authenticate, requireAdmin, async (req, res) => {
  try {
    const r = await Ticket.deleteMany({ status: "solved" });
    return res.json({ message: `Remove solved ✅ Tog bort ${r.deletedCount} tickets.` });
  } catch (e) {
    console.error("❌ Remove solved error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid Remove solved" });
  }
});

/* =====================
   ✅ Assign ticket (agents can assign if they own ticket)
===================== */
app.post("/admin/tickets/:ticketId/assign", authenticate, requireAgentOrAdmin, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId saknas" });

  const dbUser = await getDbUser(req);
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  // Agent can only reassign tickets assigned to them
  if (dbUser?.role === "agent") {
    if (String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Du får bara assigna dina egna tickets" });
    }
  }

  const target = await User.findById(userId).select("_id role");
  if (!target) return res.status(404).json({ error: "Mål-användare hittades inte" });

  if (!["agent", "admin"].includes(target.role)) {
    return res.status(400).json({ error: "Du kan bara assigna till agent/admin" });
  }

  t.assignedToUserId = target._id;
  t.lastActivityAt = new Date();

  safeEnsureSla(t);
  await t.save();

  return res.json({ message: "Ticket assignad ✅", ticket: t });
});

app.delete("/admin/tickets/:ticketId", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    if (dbUser?.role === "agent" && String(t.assignedToUserId || "") !== String(dbUser._id)) {
      return res.status(403).json({ error: "Du får bara ta bort dina egna tickets" });
    }

    await Ticket.deleteOne({ _id: t._id });
    return res.json({ message: "Ticket borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid borttagning av ticket" });
  }
});

/* =====================
   ✅ USERS (Admin only)
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(2000);
  return res.json(users);
});

app.get("/admin/agents", authenticate, requireAgentOrAdmin, async (req, res) => {
  const users = await User.find({ role: { $in: ["admin", "agent"] } }).select("_id username role").sort({ createdAt: -1 });
  return res.json(users);
});

app.post("/admin/users/:userId/role", authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

    const targetId = req.params.userId;
    const me = await User.findById(req.user.id);

    if (!me || me.role !== "admin") return res.status(403).json({ error: "Admin krävs" });

    const u = await User.findById(targetId);
    if (!u) return res.status(404).json({ error: "User hittades inte" });

    if (String(u._id) === String(me._id)) return res.status(400).json({ error: "Du kan inte ändra din egen roll." });

    u.role = role;
    await u.save();

    return res.json({ message: "Roll uppdaterad ✅", user: { id: u._id, username: u.username, role: u.role } });
  } catch {
    return res.status(500).json({ error: "Serverfel vid roll-ändring" });
  }
});

app.delete("/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.userId;

    if (String(targetId) === String(req.user.id)) return res.status(400).json({ error: "Du kan inte ta bort dig själv." });

    const u = await User.findById(targetId);
    if (!u) return res.status(404).json({ error: "User hittades inte" });

    await Ticket.deleteMany({ userId: targetId });
    await Feedback.deleteMany({ userId: targetId });
    await SLAStat.deleteMany({ agentUserId: targetId });

    await User.deleteOne({ _id: targetId });

    return res.json({ message: `Användaren ${u.username} togs bort ✅` });
  } catch {
    return res.status(500).json({ error: "Serverfel vid borttagning" });
  }
});

/* =====================
   ✅ ADMIN: Categories manager (CREATE / EDIT / DELETE)
===================== */
app.post("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  try {
    const { key, name, systemPrompt, settings } = req.body || {};
    if (!key || !name) return res.status(400).json({ error: "key + name krävs" });

    const exists = await Category.findOne({ key });
    if (exists) return res.status(400).json({ error: "Kategori finns redan" });

    await new Category({
      key,
      name,
      systemPrompt: systemPrompt || "",
      settings: settings || { tone: "professional", language: "sv", allowEmojis: true },
    }).save();

    return res.json({ message: "Kategori skapad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid skapa kategori" });
  }
});

app.patch("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    const cat = await Category.findOne({ key });
    if (!cat) return res.status(404).json({ error: "Kategori hittades inte" });

    const { name, systemPrompt, settings } = req.body || {};
    if (typeof name === "string" && name.trim()) cat.name = name.trim();
    if (typeof systemPrompt === "string") cat.systemPrompt = systemPrompt;

    if (settings && typeof settings === "object") {
      cat.settings = {
        tone: settings.tone || cat.settings?.tone || "professional",
        language: settings.language || cat.settings?.language || "sv",
        allowEmojis: typeof settings.allowEmojis === "boolean" ? settings.allowEmojis : cat.settings?.allowEmojis !== false,
      };
    }

    await cat.save();
    return res.json({ message: "Kategori uppdaterad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid uppdatera kategori" });
  }
});

app.delete("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    if (["demo", "law", "tech", "cleaning"].includes(key)) {
      return res.status(400).json({ error: "Default-kategorier kan inte tas bort" });
    }

    await Category.deleteOne({ key });
    await KBChunk.deleteMany({ companyId: key });
    await Ticket.deleteMany({ companyId: key });

    return res.json({ message: `Kategori ${key} borttagen ✅` });
  } catch {
    return res.status(500).json({ error: "Serverfel vid delete kategori" });
  }
});

/* =====================
   ✅ ADMIN: KB Upload / List / Export / Delete
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId, isDeleted: false }).sort({ createdAt: -1 }).limit(400);
  return res.json(items);
});

// ✅ NEW: delete specific KB item
app.delete("/kb/item/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const it = await KBChunk.findById(req.params.id);
    if (!it) return res.status(404).json({ error: "KB item hittades inte" });

    it.isDeleted = true;
    await it.save();

    return res.json({ message: "KB item borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid borttagning av KB item" });
  }
});

app.post("/kb/upload-text", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, title, content } = req.body || {};
    if (!companyId || !content) return res.status(400).json({ error: "companyId eller content saknas" });

    const chunks = chunkText(content);
    if (!chunks.length) return res.status(400).json({ error: "Ingen text att spara" });

    let okCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      const embeddingOk = !!emb;
      if (embeddingOk) okCount++;

      await new KBChunk({
        companyId,
        sourceType: "text",
        sourceRef: "manual",
        title: title || "Text",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk,
      }).save();
    }

    return res.json({ message: `Text uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})` });
  } catch (e) {
    return res.status(500).json({ error: `Serverfel: ${e.message}` });
  }
});

app.post("/kb/upload-url", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, url } = req.body || {};
    if (!companyId || !url) return res.status(400).json({ error: "companyId eller url saknas" });

    const text = await fetchUrlText(url);
    const chunks = chunkText(text);

    let okCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      const embeddingOk = !!emb;
      if (embeddingOk) okCount++;

      await new KBChunk({
        companyId,
        sourceType: "url",
        sourceRef: url,
        title: "URL",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk,
      }).save();
    }

    return res.json({ message: `URL uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})` });
  } catch (e) {
    return res.status(500).json({ error: `Serverfel vid URL-upload: ${e.message}` });
  }
});

app.post("/kb/upload-pdf", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, filename, base64 } = req.body || {};
    if (!companyId || !base64) return res.status(400).json({ error: "companyId eller base64 saknas" });

    const text = await extractPdfText(base64);
    const chunks = chunkText(text);

    let okCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      const embeddingOk = !!emb;
      if (embeddingOk) okCount++;

      await new KBChunk({
        companyId,
        sourceType: "pdf",
        sourceRef: filename || "pdf",
        title: filename || "PDF",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk,
      }).save();
    }

    return res.json({ message: `PDF uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})` });
  } catch (e) {
    return res.status(500).json({ error: `Serverfel vid PDF-upload: ${e.message}` });
  }
});

app.get("/export/kb/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="kb_${req.params.companyId}.json"`);
  return res.send(JSON.stringify(items, null, 2));
});

/* =====================
   ✅ ADMIN: Export All + Training Export
===================== */
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const [users, tickets, cats, kb, stats, feedback] = await Promise.all([
      User.find({}).select("-password").limit(5000),
      Ticket.find({}).limit(50000),
      Category.find({}).limit(1000),
      KBChunk.find({}).limit(50000),
      SLAStat.find({}).limit(50000),
      Feedback.find({}).limit(50000),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      users,
      tickets,
      categories: cats,
      kb,
      slaStats: stats,
      feedback,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="export_all_${Date.now()}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid Export All" });
  }
});

// Training export = ready for fine-tuning / dataset
app.get("/admin/export/training", authenticate, requireAdmin, async (req, res) => {
  try {
    const companyId = String(req.query.companyId || "").trim();
    if (!companyId) return res.status(400).json({ error: "companyId saknas" });

    const tickets = await Ticket.find({ companyId }).sort({ createdAt: 1 }).limit(10000);

    const rows = [];
    for (const t of tickets) {
      const msgs = (t.messages || []).slice(-50).map((m) => ({ role: m.role, content: m.content }));
      if (msgs.length < 2) continue;
      rows.push({
        ticketPublicId: t.ticketPublicId,
        companyId: t.companyId,
        createdAt: t.createdAt,
        messages: msgs,
      });
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="training_export_${companyId}_${Date.now()}.json"`);
    return res.send(JSON.stringify({ companyId, exportedAt: new Date().toISOString(), rows }, null, 2));
  } catch {
    return res.status(500).json({ error: "Serverfel vid training export" });
  }
});

/* =====================
   ✅ SLA / KPI API (PRO)
   - agent: only their stats
   - admin: all stats
===================== */
function parseDays(d) {
  const n = Number(d || 30);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(365, Math.max(1, Math.floor(n)));
}

async function getScopedTickets(req, days) {
  const dbUser = await getDbUser(req);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const baseQuery = { lastActivityAt: { $gte: since } };

  if (dbUser?.role === "agent") {
    // agent sees only assigned tickets
    baseQuery.assignedToUserId = dbUser._id;
  }
  return await Ticket.find(baseQuery).sort({ lastActivityAt: -1 }).limit(50000);
}

function summarizeTickets(tickets) {
  const totalTickets = tickets.length;

  const statusCounts = { open: 0, pending: 0, solved: 0 };
  const firstArr = [];
  const resArr = [];
  let breachedFirst = 0;
  let breachedRes = 0;

  for (const t of tickets) {
    safeEnsureSla(t);
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

    if (typeof t.sla?.firstResponseMs === "number") firstArr.push(t.sla.firstResponseMs);
    if (typeof t.sla?.resolutionMs === "number") resArr.push(t.sla.resolutionMs);

    if (t.sla?.breachedFirstResponse) breachedFirst++;
    if (t.sla?.breachedResolution) breachedRes++;
  }

  const firstCompliancePct =
    totalTickets > 0 ? Math.round(((totalTickets - breachedFirst) / totalTickets) * 100) : null;
  const resCompliancePct =
    totalTickets > 0 ? Math.round(((totalTickets - breachedRes) / totalTickets) * 100) : null;

  return {
    totalTickets,
    statusCounts,
    firstResponse: {
      compliancePct: firstCompliancePct ?? 0,
      breached: breachedFirst,
      avgMs: avg(firstArr),
      medianMs: median(firstArr),
    },
    resolution: {
      compliancePct: resCompliancePct ?? 0,
      breached: breachedRes,
      avgMs: avg(resArr),
      medianMs: median(resArr),
    },
  };
}

app.get("/admin/sla/overview", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const tickets = await getScopedTickets(req, days);
    const ov = summarizeTickets(tickets);

    return res.json({
      days,
      ...ov,
    });
  } catch {
    return res.status(500).json({ error: "Serverfel vid SLA overview" });
  }
});

app.get("/admin/sla/tickets", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const tickets = await getScopedTickets(req, days);

    tickets.forEach((t) => safeEnsureSla(t));

    return res.json({
      days,
      rows: tickets.slice(0, 1200).map((t) => ({
        _id: t._id,
        ticketPublicId: t.ticketPublicId,
        companyId: t.companyId,
        status: t.status,
        priority: t.priority,
        lastActivityAt: t.lastActivityAt,
        sla: t.sla,
      })),
    });
  } catch {
    return res.status(500).json({ error: "Serverfel vid SLA tickets" });
  }
});

app.get("/admin/sla/agents", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const days = parseDays(req.query.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // agent sees only their row, admin sees all
    const agents =
      dbUser?.role === "admin"
        ? await User.find({ role: { $in: ["agent", "admin"] } }).select("_id username role")
        : [dbUser];

    const rows = [];

    for (const a of agents) {
      const q = { lastActivityAt: { $gte: since } };
      // Only assigned tickets counts
      q.assignedToUserId = a._id;

      const tickets = await Ticket.find(q).limit(20000);
      const sum = summarizeTickets(tickets);

      rows.push({
        agentUserId: a._id,
        username: a.username,
        role: a.role,
        tickets: sum.totalTickets,
        open: sum.statusCounts.open || 0,
        pending: sum.statusCounts.pending || 0,
        solved: sum.statusCounts.solved || 0,
        firstResponse: sum.firstResponse,
        resolution: sum.resolution,
      });
    }

    rows.sort((x, y) => (y.tickets || 0) - (x.tickets || 0));

    return res.json({ days, rows });
  } catch {
    return res.status(500).json({ error: "Serverfel vid SLA agents" });
  }
});

function isoWeekLabel(d) {
  const date = new Date(d);
  const year = date.getUTCFullYear();
  // ISO week approx label (simple)
  const onejan = new Date(Date.UTC(year, 0, 1));
  const millis = date - onejan;
  const day = Math.floor(millis / (24 * 60 * 60 * 1000));
  const week = Math.floor((day + onejan.getUTCDay()) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

app.get("/admin/sla/trend/weekly", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const tickets = await getScopedTickets(req, days);

    // group by week label
    const map = new Map();
    for (const t of tickets) {
      safeEnsureSla(t);
      const label = isoWeekLabel(t.createdAt || t.lastActivityAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(t);
    }

    const rows = [];
    for (const [week, arr] of map.entries()) {
      const sum = summarizeTickets(arr);
      rows.push({
        week,
        tickets: sum.totalTickets,
        firstCompliancePct: sum.firstResponse.compliancePct || 0,
        resolutionCompliancePct: sum.resolution.compliancePct || 0,
      });
    }

    rows.sort((a, b) => a.week.localeCompare(b.week));
    return res.json({ days, rows });
  } catch {
    return res.status(500).json({ error: "Serverfel vid SLA trend" });
  }
});

app.get("/admin/sla/export/csv", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = parseDays(req.query.days);
    const tickets = await getScopedTickets(req, days);
    tickets.forEach((t) => safeEnsureSla(t));

    const rows = tickets.slice(0, 50000).map((t) => ({
      ticketPublicId: t.ticketPublicId,
      companyId: t.companyId,
      status: t.status,
      priority: t.priority,
      assignedToUserId: asObjectIdString(t.assignedToUserId),
      lastActivityAt: t.lastActivityAt?.toISOString?.() || "",
      firstResponseMs: t.sla?.firstResponseMs ?? "",
      resolutionMs: t.sla?.resolutionMs ?? "",
      breachedFirstResponse: t.sla?.breachedFirstResponse ? "YES" : "NO",
      breachedResolution: t.sla?.breachedResolution ? "YES" : "NO",
      pendingTotalMs: t.sla?.pendingTotalMs ?? "",
      effectiveRunningMs: t.sla?.effectiveRunningMs ?? "",
    }));

    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sla_export_${days}d_${Date.now()}.csv"`);
    return res.send(csv);
  } catch {
    return res.status(500).json({ error: "Serverfel vid SLA export csv" });
  }
});

// Clear my stats = remove SLAStat rows for me (only)
app.post("/admin/sla/clear/my", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(401).json({ error: "Ogiltig user" });

    await SLAStat.deleteMany({ agentUserId: dbUser._id });
    return res.json({ message: "Din SLA statistik raderad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid clear my stats" });
  }
});

// Clear ALL stats = admin only
app.post("/admin/sla/clear/all", authenticate, requireAdmin, async (req, res) => {
  try {
    await SLAStat.deleteMany({});
    return res.json({ message: "ALL SLA statistik raderad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid clear all stats" });
  }
});

/* =====================
   ✅ JSON 404 for API routes
===================== */
app.use((req, res, next) => {
  if (
    req.path.startsWith("/admin") ||
    req.path.startsWith("/auth") ||
    req.path.startsWith("/kb") ||
    req.path.startsWith("/chat") ||
    req.path.startsWith("/my") ||
    req.path.startsWith("/feedback") ||
    req.path.startsWith("/ai")
  ) {
    return res.status(404).json({ error: "API route hittades inte" });
  }
  next();
});

/* =====================
   ✅ Start
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
console.log("✅ server.js reached end of file without crashing");
