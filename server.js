// =========================
// API: Premium widgets/statistik
// =========================
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
// ...existing code...

// Flyttade API endpoints hit, EFTER att app är deklarerad
// =========================
// API: Premium widgets/statistik
// =========================
app.get("/api/ai/stats", async (req, res) => {
  try {
    // Exempel: summera AI-svar och snitt svarstid
    const totalResponses = await Message.countDocuments({ role: "assistant" });
    const avgResponse = await Message.aggregate([
      { $match: { role: "assistant" } },
      { $group: { _id: null, avg: { $avg: "$responseTimeMs" } } }
    ]);
    res.json({
      totalResponses,
      avgResponseTime: avgResponse[0]?.avg ? Math.round(avgResponse[0].avg) : null
    });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

app.get("/api/agent/stats", async (req, res) => {
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Exempel: summera ärenden och snittbetyg för agent
    const ticketsSolved = await Ticket.countDocuments({ agentUserId: decoded.id, status: "solved" });
    const avgRating = await Ticket.aggregate([
      { $match: { agentUserId: decoded.id, rating: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: "$rating" } } }
    ]);
    res.json({
      ticketsSolved,
      avgRating: avgRating[0]?.avg ? avgRating[0].avg.toFixed(2) : null
    });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

app.get("/api/sla/trends", async (req, res) => {
  try {
    // Exempel: trend för första svar och lösningstid senaste 30 dagar
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const stats = await SLAStat.find({ createdAt: { $gte: since } });
    const firstResponseTrend = stats.length ? Math.round(100 * stats.filter(s => s.firstResponseMs <= s.firstResponseLimitMs).length / stats.length) : null;
    const resolutionTrend = stats.length ? Math.round(100 * stats.filter(s => s.resolutionMs <= s.resolutionLimitMs).length / stats.length) : null;
    res.json({
      firstResponseTrend,
      resolutionTrend
    });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// SSE: Realtidsnotiser för agenter (nya ärenden)
// =========================
const sseClients = [];
app.get("/sse/agent-notify", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  sseClients.push(res);
  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

function notifyAgentsSSE(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => res.write(msg));
}
// --- SSE END ---

// Exempel: Anropa notifyAgentsSSE({ type: 'new_ticket', ticketId }) när nytt ärende skapas
// Lägg till i din ticket-creation endpoint:
// notifyAgentsSSE({ type: 'new_ticket', ticketId: ticket._id, title: ticket.title });
// =========================
// API: Byt användarnamn (inloggad)
// =========================
app.post("/auth/change-username", async (req, res) => {
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { newUsername } = req.body;
    if (!newUsername) return res.status(400).json({ error: "Nytt användarnamn krävs" });
    const exists = await User.findOne({ username: newUsername });
    if (exists) return res.status(400).json({ error: "Användarnamnet är upptaget" });
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Användare saknas" });
    user.username = newUsername;
    await user.save();
    res.json({ message: "Användarnamn uppdaterat" });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// API: Byt lösenord (inloggad)
// =========================
app.post("/auth/change-password", async (req, res) => {
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Båda lösenord krävs" });
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Användare saknas" });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ error: "Fel nuvarande lösenord" });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Lösenord uppdaterat" });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// API: Byt lösenord (utloggad, via reset-token)
// =========================
app.post("/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: "Token och nytt lösenord krävs" });
    const user = await User.findOne({ resetTokenHash: token, resetTokenExpiresAt: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: "Ogiltig eller utgången token" });
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetTokenHash = "";
    user.resetTokenExpiresAt = null;
    await user.save();
    res.json({ message: "Lösenord återställt" });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// API: Radera användare (admin)
// =========================
app.delete("/admin/users/:id", async (req, res) => {
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Endast admin" });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "Användare hittades inte" });
    res.json({ message: "Användare raderad" });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// API: Ändra roll (admin)
// =========================
app.post("/admin/users/:id/role", async (req, res) => {
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Endast admin" });
    const { role } = req.body;
    if (!role || !["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Användare hittades inte" });
    user.role = role;
    await user.save();
    res.json({ message: "Roll uppdaterad" });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});
// =========================
// API: Skapa AI-kategori (admin)
// =========================
app.post("/api/categories", async (req, res) => {
  try {
    const { key, name, systemPrompt } = req.body;
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Endast admin" });
    if (!key || !name) return res.status(400).json({ error: "key och name krävs" });
    const exists = await Category.findOne({ key });
    if (exists) return res.status(400).json({ error: "Kategori med denna key finns redan" });
    const cat = await Category.create({ key, name, systemPrompt });
    res.json(cat);
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// API: Redigera AI-kategori (admin)
// =========================
app.put("/api/categories/:key", async (req, res) => {
  try {
    const { name, systemPrompt } = req.body;
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Endast admin" });
    const cat = await Category.findOne({ key: req.params.key });
    if (!cat) return res.status(404).json({ error: "Kategori hittades inte" });
    if (name) cat.name = name;
    if (systemPrompt) cat.systemPrompt = systemPrompt;
    await cat.save();
    res.json(cat);
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// API: Radera AI-kategori (admin)
// =========================
app.delete("/api/categories/:key", async (req, res) => {
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Endast admin" });
    const cat = await Category.findOneAndDelete({ key: req.params.key });
    if (!cat) return res.status(404).json({ error: "Kategori hittades inte" });
    res.json({ message: "Kategori raderad" });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});
// =========================
// API: Nollställ specifik statistik (admin)
// =========================
app.post("/api/sla/reset", async (req, res) => {
  try {
    const { statId } = req.body;
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ error: "Endast admin" });
    if (!statId) return res.status(400).json({ error: "statId krävs" });
    await SLAStat.deleteOne({ _id: statId });
    res.json({ message: "Statistik nollställd" });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});

// =========================
// API: Hämta detaljerad statistik (admin/agent)
// =========================
app.get("/api/sla/stats", async (req, res) => {
  try {
    if (!req.headers.authorization) return res.status(401).json({ error: "Ingen token" });
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let stats;
    if (decoded.role === "admin") {
      stats = await SLAStat.find({}).sort({ createdAt: -1 }).limit(500);
    } else if (decoded.role === "agent") {
      stats = await SLAStat.find({ agentUserId: decoded.id }).sort({ createdAt: -1 }).limit(200);
    } else {
      return res.status(403).json({ error: "Endast admin eller agent" });
    }
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});
// =========================
// API: Byt AI-kategori för chatten (och återställ kontext)
// =========================
app.post("/api/chat/set-category", async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId krävs" });
    // Här kan du lägga till logik för att spara användarens valda kategori i session eller databas om du vill
    // För demo: returnera kategori-info och ev. systemprompt
    const cat = await Category.findOne({ key: companyId });
    if (!cat) return res.status(404).json({ error: "Kategori hittades inte" });
    res.json({
      key: cat.key,
      name: cat.name,
      systemPrompt: cat.systemPrompt
    });
  } catch (e) {
    res.status(500).json({ error: "Serverfel: " + e.message });
  }
});


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
   ✅ Helpers: safe sanitize
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

/* =====================
   ✅ Models
   - NEW: publicId + idNumber (alla users får ID)
===================== */
function makePublicId() {
  // kort, vänligt ID: ex "USR-7F3K2P"
  const s = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `USR-${s.slice(0, 6)}`;
}

// enkel auto-increment med counter collection
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

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, index: true },
  email: { type: String, default: "", index: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" }, // user | agent | admin

  // ✅ NEW IDs
  publicId: { type: String, unique: true, index: true, default: "" },
  idNumber: { type: Number, unique: true, sparse: true, index: true, default: null },

  resetTokenHash: { type: String, default: "" },
  resetTokenExpiresAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

// ensure ids on save
userSchema.pre("save", async function (next) {
  try {
    if (!this.publicId) {
      // retry if collision
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
    return {
      firstResponseLimitMs: 60 * MIN, // 1h
      resolutionLimitMs: 24 * 60 * MIN, // 24h
    };
  }

  if (priority === "low") {
    return {
      firstResponseLimitMs: 24 * 60 * MIN, // 24h
      resolutionLimitMs: 7 * 24 * 60 * MIN, // 7 dagar
    };
  }

  // normal
  return {
    firstResponseLimitMs: 8 * 60 * MIN, // 8h
    resolutionLimitMs: 3 * 24 * 60 * MIN, // 3 dagar
  };
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

// ✅ pending pause SLA
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

/**
 * ✅ SLA Engine (UPGRADED)
 */
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

  const firstResponseRemainingMs =
    firstAgentReplyAt ? 0 : Math.max(0, firstResponseDueAt.getTime() - nowMs);

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
   ✅ Math helpers
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
   ✅ Ticket model
===================== */
const ticketSchema = new mongoose.Schema({
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

    firstResponseState: { type: String, default: "" },
    resolutionState: { type: String, default: "" },

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
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ lastActivityAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ assignedToUserId: 1, createdAt: -1 });
ticketSchema.index({ companyId: 1, createdAt: -1 });

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
   ✅ OpenAI (UPGRADED prompt style)
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
   - inbox ska highlightas när ärende inkommer
===================== */
// ...existing code...
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
   ✅ ROUTES
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

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
  } catch (e) {
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
    user: { id: u._id, username: u.username, role: u.role, email: u.email || "", publicId: u.publicId, idNumber: u.idNumber },
  });
});

/* =====================
   ✅ Change username/password
===================== */
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

/* =====================
   ✅ Forgot/Reset password
===================== */
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

/* =====================
   ✅ ADMIN: Update category (EDIT)
   - "gör så att man kan redigera en AI kategori"
===================== */
app.put("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    const { name, systemPrompt } = req.body || {};

    const c = await Category.findOne({ key });
    if (!c) return res.status(404).json({ error: "Kategori hittades inte" });

    if (typeof name === "string") c.name = name;
    if (typeof systemPrompt === "string") c.systemPrompt = systemPrompt;

    await c.save();
    return res.json({ message: "Kategori uppdaterad ✅", category: { key: c.key, name: c.name, systemPrompt: c.systemPrompt } });
  } catch (e) {
    console.error("❌ update category error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid uppdatera kategori" });
  }
});

/* =====================
   ✅ CHAT (ticket + RAG) (SMARTARE AI)
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

      // ✅ If user replies while pending => resume SLA
      if (ticket.status === "pending" && ticket.pendingStartedAt) {
        const add = msBetween(ticket.pendingStartedAt, new Date()) || 0;
        ticket.pendingTotalMs = Number(ticket.pendingTotalMs || 0) + add;
        ticket.pendingStartedAt = null;
        ticket.status = "open";
      }

      safeEnsureSla(ticket);
      await ticket.save();

      // ✅ Notify agent inbox about NEW message (open ticket)
      // send to assigned agent if any
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

    // ✅ Smarter system message: proffsig, tydlig, välkomnar om ny konversation
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
          rag.used ? "" : "",
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

    return res.json({ reply, ticketId: ticket._id, ragUsed: rag.used, sources: rag.sources });
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

    // notify assigned agent
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
   ✅ ADMIN/AGENT: Inbox
   ✅ Agent kan INTE se admin panel routes (backend skydd)
===================== */
app.get("/admin/tickets", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const { status, companyId } = req.query || {};
    const query = {};
    if (status) query.status = status;
    if (companyId) query.companyId = companyId;

    if (dbUser?.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).sort({ lastActivityAt: -1 }).limit(500);
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

/* =====================
   ✅ Pending timer logic
===================== */
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
   ✅ Ticket actions
===================== */
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

  // notify UI (agent himself)
  sseSendToUser(String(dbUser._id), "inbox:update", { ticketId: String(t._id) });

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

app.delete("/admin/tickets/:ticketId/internal-note/:noteId", authenticate, requireAdmin, async (req, res) => {
  try {
    const { ticketId, noteId } = req.params;

    const t = await Ticket.findById(ticketId);
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    t.internalNotes = (t.internalNotes || []).filter((n) => String(n._id) !== String(noteId));
    t.lastActivityAt = new Date();

    safeEnsureSla(t);
    await t.save();

    return res.json({ message: "Notering borttagen ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel vid borttagning av note" });
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
   ✅ Solve all / Remove solved (Admin only)
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
   ✅ Assign + Delete
===================== */
app.post("/admin/tickets/:ticketId/assign", authenticate, requireAgentOrAdmin, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId saknas" });

  const dbUser = await getDbUser(req);

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  if (dbUser?.role === "agent") return res.status(403).json({ error: "Endast admin kan assigna" });

  t.assignedToUserId = userId;
  t.lastActivityAt = new Date();

  safeEnsureSla(t);
  await t.save();

  // notify new assignment
  sseSendToUser(String(userId), "inbox:assigned", {
    ticketId: String(t._id),
    title: t.title || "",
    companyId: t.companyId,
    status: t.status,
    lastActivityAt: t.lastActivityAt,
  });

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
   ✅ SLA / KPI / Trend endpoints (kept + improved)
===================== */
function weekKey(d) {
  const dt = new Date(d);
  if (!dt || isNaN(dt.getTime())) return "unknown";
  const onejan = new Date(dt.getFullYear(), 0, 1);
  const day = Math.floor((dt - onejan) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((day + onejan.getDay() + 1) / 7);
  return `${dt.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function dayKey(d) {
  const dt = new Date(d);
  if (!dt || isNaN(dt.getTime())) return "unknown";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function buildTrendWeekly(tickets) {
  const map = {};
  for (const t of tickets) {
    safeEnsureSla(t);
    const wk = weekKey(t.createdAt);

    if (!map[wk]) map[wk] = { week: wk, total: 0, firstOk: 0, resOk: 0, firstArr: [], resArr: [] };
    map[wk].total++;

    const b1 = !!t.sla?.breachedFirstResponse;
    const b2 = !!t.sla?.breachedResolution;

    if (t.sla?.firstResponseMs != null) map[wk].firstArr.push(t.sla.firstResponseMs);
    if (t.sla?.resolutionMs != null) map[wk].resArr.push(t.sla.resolutionMs);
    if (t.sla?.firstResponseMs != null && !b1) map[wk].firstOk++;
    if (t.sla?.resolutionMs != null && !b2) map[wk].resOk++;
  }

  const rows = Object.values(map).sort((a, b) => String(a.week).localeCompare(String(b.week)));
  return rows.map((r) => ({
    week: r.week,
    tickets: r.total,
    firstCompliancePct: r.total ? Math.round((r.firstOk / r.total) * 100) : 0,
    resolutionCompliancePct: r.total ? Math.round((r.resOk / r.total) * 100) : 0,
    avgFirstMs: r.firstArr.length ? Math.round(r.firstArr.reduce((a, b) => a + b, 0) / r.firstArr.length) : 0,
    avgResMs: r.resArr.length ? Math.round(r.resArr.reduce((a, b) => a + b, 0) / r.resArr.length) : 0,
  }));
}

function buildTrendDaily(tickets) {
  const map = {};
  for (const t of tickets) {
    safeEnsureSla(t);
    const dk = dayKey(t.createdAt);

    if (!map[dk]) map[dk] = { day: dk, total: 0, firstOk: 0, resOk: 0 };
    map[dk].total++;

    const b1 = !!t.sla?.breachedFirstResponse;
    const b2 = !!t.sla?.breachedResolution;

    if (t.sla?.firstResponseMs != null && !b1) map[dk].firstOk++;
    if (t.sla?.resolutionMs != null && !b2) map[dk].resOk++;
  }

  const rows = Object.values(map).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  return rows.map((r) => ({
    day: r.day,
    tickets: r.total,
    firstCompliancePct: r.total ? Math.round((r.firstOk / r.total) * 100) : 0,
    resolutionCompliancePct: r.total ? Math.round((r.resOk / r.total) * 100) : 0,
  }));
}

function calcAgeingBuckets(openTickets) {
  const now = Date.now();
  const buckets = [
    { key: "0-4h", from: 0, to: 4 * 3600 * 1000, count: 0 },
    { key: "4-24h", from: 4 * 3600 * 1000, to: 24 * 3600 * 1000, count: 0 },
    { key: "1-3d", from: 24 * 3600 * 1000, to: 3 * 24 * 3600 * 1000, count: 0 },
    { key: "3-7d", from: 3 * 24 * 3600 * 1000, to: 7 * 24 * 3600 * 1000, count: 0 },
    { key: "7d+", from: 7 * 24 * 3600 * 1000, to: Infinity, count: 0 },
  ];

  for (const t of openTickets) {
    const age = now - new Date(t.createdAt).getTime();
    const b = buckets.find((x) => age >= x.from && age < x.to);
    if (b) b.count++;
  }
  return buckets;
}

function safePct(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

app.get("/admin/sla/overview", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(403).json({ error: "User saknas" });

    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const query = { createdAt: { $gte: since } };
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).limit(9000);
    tickets.forEach((t) => safeEnsureSla(t));

    const firstArr = tickets.map((t) => t.sla?.firstResponseMs).filter((x) => x != null);
    const resArr = tickets.map((t) => t.sla?.resolutionMs).filter((x) => x != null);

    const breachesFirst = tickets.filter((t) => t.sla?.firstResponseMs != null && t.sla.breachedFirstResponse).length;
    const breachesRes = tickets.filter((t) => t.sla?.effectiveRunningMs != null && t.sla.breachedResolution).length;

    const complianceFirst = firstArr.length ? Math.round(((firstArr.length - breachesFirst) / firstArr.length) * 100) : null;
    const complianceRes = resArr.length ? Math.round(((resArr.length - breachesRes) / resArr.length) * 100) : null;

    const atRiskFirst = tickets.filter((t) => t.sla?.firstResponseState === "at_risk").length;
    const atRiskRes = tickets.filter((t) => t.sla?.resolutionState === "at_risk").length;

    const byPriority = { low: 0, normal: 0, high: 0 };
    tickets.forEach((t) => {
      byPriority[t.priority || "normal"] = (byPriority[t.priority || "normal"] || 0) + 1;
    });

    const trendWeeks = buildTrendWeekly(tickets);

    return res.json({
      rangeDays,
      totalTickets: tickets.length,
      byPriority,
      trendWeeks,

      firstResponse: {
        avgMs: avg(firstArr),
        medianMs: median(firstArr),
        p90Ms: percentile(firstArr, 90),
        breaches: breachesFirst,
        compliancePct: complianceFirst,
        atRisk: atRiskFirst,
      },
      resolution: {
        avgMs: avg(resArr),
        medianMs: median(resArr),
        p90Ms: percentile(resArr, 90),
        breaches: breachesRes,
        compliancePct: complianceRes,
        atRisk: atRiskRes,
      },
    });
  } catch (e) {
    console.error("❌ SLA overview error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA overview" });
  }
});

app.get("/admin/sla/tickets", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(403).json({ error: "User saknas" });

    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const query = { createdAt: { $gte: since } };
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).sort({ createdAt: -1 }).limit(6000);

    const rows = tickets.map((t) => {
      safeEnsureSla(t);
      return {
        ticketId: String(t._id),
        companyId: t.companyId,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        sla: t.sla,
      };
    });

    return res.json({ rangeDays, count: rows.length, rows });
  } catch (e) {
    console.error("❌ SLA tickets error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA tickets" });
  }
});

app.get("/admin/sla/agents", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(403).json({ error: "User saknas" });

    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const query = { createdAt: { $gte: since }, assignedToUserId: { $ne: null } };
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).limit(12000);
    const users = await User.find({ role: { $in: ["agent", "admin"] } }).select("_id username role");

    const map = {};
    for (const t of tickets) {
      safeEnsureSla(t);
      const agentId = String(t.assignedToUserId);

      if (!map[agentId]) {
        map[agentId] = {
          agentId,
          tickets: 0,
          pending: 0,
          open: 0,
          solved: 0,
          firstArr: [],
          resArr: [],
          firstBreaches: 0,
          resBreaches: 0,
          firstRisk: 0,
          resRisk: 0,
        };
      }

      map[agentId].tickets++;
      if (t.status === "pending") map[agentId].pending++;
      if (t.status === "open") map[agentId].open++;
      if (t.status === "solved") map[agentId].solved++;

      if (t.sla?.firstResponseMs != null) {
        map[agentId].firstArr.push(t.sla.firstResponseMs);
        if (t.sla.breachedFirstResponse) map[agentId].firstBreaches++;
      }
      if (t.sla?.resolutionMs != null) {
        map[agentId].resArr.push(t.sla.resolutionMs);
        if (t.sla.breachedResolution) map[agentId].resBreaches++;
      }

      if (t.sla?.firstResponseState === "at_risk") map[agentId].firstRisk++;
      if (t.sla?.resolutionState === "at_risk") map[agentId].resRisk++;
    }

    let rows = Object.values(map).map((s) => {
      const u = users.find((x) => String(x._id) === String(s.agentId));
      const firstCompliance = s.firstArr.length ? Math.round(((s.firstArr.length - s.firstBreaches) / s.firstArr.length) * 100) : null;
      const resCompliance = s.resArr.length ? Math.round(((s.resArr.length - s.resBreaches) / s.resArr.length) * 100) : null;

      return {
        agentId: s.agentId,
        username: u?.username || "(unknown)",
        role: u?.role || "agent",
        tickets: s.tickets,
        open: s.open,
        pending: s.pending,
        solved: s.solved,
        firstRisk: s.firstRisk,
        resRisk: s.resRisk,
        firstResponse: {
          avgMs: avg(s.firstArr),
          medianMs: median(s.firstArr),
          p90Ms: percentile(s.firstArr, 90),
          breaches: s.firstBreaches,
          compliancePct: firstCompliance,
        },
        resolution: {
          avgMs: avg(s.resArr),
          medianMs: median(s.resArr),
          p90Ms: percentile(s.resArr, 90),
          breaches: s.resBreaches,
          compliancePct: resCompliance,
        },
      };
    });

    if (dbUser.role === "agent") rows = rows.filter((r) => String(r.agentId) === String(dbUser._id));

    return res.json({ rangeDays, count: rows.length, rows });
  } catch (e) {
    console.error("❌ SLA agents error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA agents" });
  }
});

app.get("/admin/sla/trend/weekly", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const query = { createdAt: { $gte: since } };
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).limit(12000);
    const rows = buildTrendWeekly(tickets);

    return res.json({ rangeDays, count: rows.length, rows });
  } catch (e) {
    console.error("❌ SLA trend weekly error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA trend weekly" });
  }
});

app.get("/admin/sla/trend/daily", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const rangeDays = Math.max(1, Math.min(120, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const query = { createdAt: { $gte: since } };
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).limit(12000);
    const rows = buildTrendDaily(tickets);
    return res.json({ rangeDays, count: rows.length, rows });
  } catch (e) {
    console.error("❌ SLA trend daily error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA trend daily" });
  }
});

app.get("/admin/sla/kpi", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const baseQuery = { createdAt: { $gte: since } };
    if (dbUser.role === "agent") baseQuery.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(baseQuery).limit(15000);
    tickets.forEach((t) => safeEnsureSla(t));

    const total = tickets.length;

    const open = tickets.filter((t) => t.status === "open").length;
    const pending = tickets.filter((t) => t.status === "pending").length;
    const solved = tickets.filter((t) => t.status === "solved").length;

    const breachedAny = tickets.filter((t) => t.sla?.breachedFirstResponse || t.sla?.breachedResolution).length;
    const riskAny = tickets.filter((t) => t.sla?.firstResponseState === "at_risk" || t.sla?.resolutionState === "at_risk").length;

    const firstArr = tickets.map((t) => t.sla?.firstResponseMs).filter((x) => x != null);
    const resArr = tickets.map((t) => t.sla?.resolutionMs).filter((x) => x != null);

    const byCategory = {};
    for (const t of tickets) {
      const k = t.companyId || "unknown";
      if (!byCategory[k]) {
        byCategory[k] = { companyId: k, total: 0, breached: 0, risk: 0, solved: 0, open: 0, pending: 0 };
      }
      byCategory[k].total++;
      if (t.status === "solved") byCategory[k].solved++;
      if (t.status === "open") byCategory[k].open++;
      if (t.status === "pending") byCategory[k].pending++;
      if (t.sla?.breachedFirstResponse || t.sla?.breachedResolution) byCategory[k].breached++;
      if (t.sla?.firstResponseState === "at_risk" || t.sla?.resolutionState === "at_risk") byCategory[k].risk++;
    }

    const catRows = Object.values(byCategory).map((r) => ({
      ...r,
      breachedPct: safePct(r.breached, r.total),
      solvedPct: safePct(r.solved, r.total),
    }));

    const activeTickets = tickets.filter((t) => t.status !== "solved");
    const ageing = calcAgeingBuckets(activeTickets);

    const solveRatePct = safePct(solved, total);

    return res.json({
      rangeDays,
      totals: {
        total,
        open,
        pending,
        solved,
        solveRatePct,
      },
      slaHealth: {
        breachedAny,
        breachedPct: safePct(breachedAny, total),
        riskAny,
        riskPct: safePct(riskAny, total),
      },
      distribution: {
        firstResponse: {
          avgMs: avg(firstArr),
          medianMs: median(firstArr),
          p90Ms: percentile(firstArr, 90),
        },
        resolution: {
          avgMs: avg(resArr),
          medianMs: median(resArr),
          p90Ms: percentile(resArr, 90),
        },
      },
      ageing,
      byCategory: catRows.sort((a, b) => (b.total || 0) - (a.total || 0)),
    });
  } catch (e) {
    console.error("❌ SLA KPI error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA KPI" });
  }
});

app.get("/admin/sla/compare", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);

    const a = Math.max(1, Math.min(365, Number(req.query.a || 30)));
    const b = Math.max(1, Math.min(365, Number(req.query.b || 7)));

    async function build(days) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const query = { createdAt: { $gte: since } };
      if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

      const tickets = await Ticket.find(query).limit(15000);
      tickets.forEach((t) => safeEnsureSla(t));

      const firstArr = tickets.map((t) => t.sla?.firstResponseMs).filter((x) => x != null);
      const resArr = tickets.map((t) => t.sla?.resolutionMs).filter((x) => x != null);

      const breachesFirst = tickets.filter((t) => t.sla?.firstResponseMs != null && t.sla.breachedFirstResponse).length;
      const breachesRes = tickets.filter((t) => t.sla?.effectiveRunningMs != null && t.sla.breachedResolution).length;

      const firstCompliance = firstArr.length ? Math.round(((firstArr.length - breachesFirst) / firstArr.length) * 100) : null;
      const resCompliance = resArr.length ? Math.round(((resArr.length - breachesRes) / resArr.length) * 100) : null;

      const atRiskFirst = tickets.filter((t) => t.sla?.firstResponseState === "at_risk").length;
      const atRiskRes = tickets.filter((t) => t.sla?.resolutionState === "at_risk").length;

      return {
        rangeDays: days,
        totalTickets: tickets.length,
        firstResponse: {
          avgMs: avg(firstArr),
          medianMs: median(firstArr),
          p90Ms: percentile(firstArr, 90),
          breaches: breachesFirst,
          compliancePct: firstCompliance,
          atRisk: atRiskFirst,
        },
        resolution: {
          avgMs: avg(resArr),
          medianMs: median(resArr),
          p90Ms: percentile(resArr, 90),
          breaches: breachesRes,
          compliancePct: resCompliance,
          atRisk: atRiskRes,
        },
      };
    }

    const A = await build(a);
    const B = await build(b);

    return res.json({ a: A, b: B });
  } catch (e) {
    console.error("❌ SLA compare error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid compare" });
  }
});

app.get("/admin/sla/export.csv", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const query = { createdAt: { $gte: since } };
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).sort({ createdAt: -1 }).limit(10000);

    const rows = tickets.map((t) => {
      safeEnsureSla(t);
      return {
        ticketId: String(t._id),
        companyId: t.companyId,
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedToUserId ? String(t.assignedToUserId) : "",
        createdAt: t.createdAt?.toISOString?.() || "",
        firstResponseMs: t.sla?.firstResponseMs ?? "",
        resolutionMs: t.sla?.resolutionMs ?? "",
        pendingTotalMs: t.sla?.pendingTotalMs ?? "",
        effectiveRunningMs: t.sla?.effectiveRunningMs ?? "",
        firstState: t.sla?.firstResponseState ?? "",
        resState: t.sla?.resolutionState ?? "",
        breachedFirstResponse: t.sla?.breachedFirstResponse ? "YES" : "NO",
        breachedResolution: t.sla?.breachedResolution ? "YES" : "NO",
      };
    });

    const csv = toCsv(rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sla_export_${rangeDays}d.csv"`);
    return res.send(csv);
  } catch (e) {
    console.error("❌ SLA CSV export error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA export CSV" });
  }
});

app.get("/admin/sla/export/csv", authenticate, requireAgentOrAdmin, async (req, res) => {
  req.url = "/admin/sla/export.csv";
  return app._router.handle(req, res, () => {});
});

app.get("/admin/sla/ticket/:ticketId/live", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    safeEnsureSla(t);
    return res.json({
      ticketId: String(t._id),
      status: t.status,
      priority: t.priority,
      sla: t.sla,
    });
  } catch {
    return res.status(500).json({ error: "Serverfel vid live SLA" });
  }
});

app.get("/admin/sla/breached", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const query = { createdAt: { $gte: since } };
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const tickets = await Ticket.find(query).sort({ createdAt: -1 }).limit(10000);
    tickets.forEach((t) => safeEnsureSla(t));

    const breached = tickets.filter((t) => t.sla?.breachedFirstResponse || t.sla?.breachedResolution);

    return res.json({
      rangeDays,
      count: breached.length,
      rows: breached.map((t) => ({
        ticketId: String(t._id),
        companyId: t.companyId,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        sla: t.sla,
      })),
    });
  } catch {
    return res.status(500).json({ error: "Serverfel vid breached SLA" });
  }
});

app.post("/admin/sla/recalc/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const tickets = await Ticket.find({}).limit(50000);
    let updated = 0;

    for (const t of tickets) {
      safeEnsureSla(t);
      await t.save().catch(() => {});
      updated++;
    }

    return res.json({ message: `SLA recalculated ✅ (${updated} tickets)` });
  } catch {
    return res.status(500).json({ error: "Serverfel vid SLA recalc" });
  }
});

app.post("/admin/sla/clear/all", authenticate, requireAdmin, async (req, res) => {
  try {
    const r = await SLAStat.deleteMany({});
    return res.json({ message: `SLA statistik raderad ✅ (${r.deletedCount} rows)` });
  } catch {
    return res.status(500).json({ error: "Serverfel vid radera statistik" });
  }
});

app.post("/admin/sla/clear/agent/:agentId", authenticate, requireAdmin, async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const r = await SLAStat.deleteMany({ agentUserId: agentId });
    return res.json({ message: `Agent statistik raderad ✅ (${r.deletedCount} rows)` });
  } catch {
    return res.status(500).json({ error: "Serverfel vid radera agent statistik" });
  }
});

/* =====================
   ✅ ADMIN: Users + roles
   ✅ NEW: agent får inte lista ALLA users (endast admin)
===================== */
app.get("/admin/users", authenticate, requireAgentOrAdmin, async (req, res) => {
  const dbUser = await getDbUser(req);
  if (!dbUser) return res.status(403).json({ error: "User saknas" });

  // ✅ Agent ska inte se admin panel info: begränsa listan (admin only full list)
  if (dbUser.role === "agent") {
    // agent ser bara sig själv + admins/agents (för assign-dropdown behövs egentligen admin)
    const users = await User.find({ role: { $in: ["agent", "admin"] } })
      .select("_id username role publicId idNumber createdAt email")
      .sort({ createdAt: -1 })
      .limit(2000);
    return res.json(users);
  }

  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(2000);
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

    return res.json({
      message: "Roll uppdaterad ✅",
      user: { id: u._id, username: u.username, role: u.role, publicId: u.publicId, idNumber: u.idNumber },
    });
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
   ✅ ADMIN: Categories manager
===================== */
app.post("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  try {
    const { key, name, systemPrompt } = req.body || {};
    if (!key || !name) return res.status(400).json({ error: "key + name krävs" });

    const exists = await Category.findOne({ key });
    if (exists) return res.status(400).json({ error: "Kategori finns redan" });

    await new Category({ key, name, systemPrompt: systemPrompt || "" }).save();
    return res.json({ message: "Kategori skapad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid skapa kategori" });
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
   ✅ ADMIN: KB Upload / List / Export
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(400);
  return res.json(items);
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
   ✅ EXPORT ALL
===================== */
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password");
  const tickets = await Ticket.find({});
  const kb = await KBChunk.find({});
  const feedback = await Feedback.find({});
  const categories = await Category.find({});
  const slaStats = await SLAStat.find({}).limit(20000);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="export_all.json"`);
  return res.send(
    JSON.stringify(
      { users, tickets, kb, feedback, categories, slaStats, exportedAt: new Date().toISOString() },
      null,
      2
    )
  );
});

/* =====================
   ✅ TRAINING EXPORT
===================== */
app.get("/admin/export/training", authenticate, requireAdmin, async (req, res) => {
  const { companyId } = req.query || {};
  const query = {};
  if (companyId) query.companyId = companyId;

  const tickets = await Ticket.find(query).sort({ createdAt: -1 }).limit(4000);

  const rows = [];
  for (const t of tickets) {
    const msgs = t.messages || [];
    for (let i = 0; i < msgs.length - 1; i++) {
      const a = msgs[i];
      const b = msgs[i + 1];
      if (a.role === "user" && (b.role === "assistant" || b.role === "agent")) {
        rows.push({
          companyId: t.companyId,
          ticketId: String(t._id),
          question: a.content,
          answer: b.content,
          answeredBy: b.role,
          timestamp: b.timestamp,
        });
      }
    }
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="training_export${companyId ? "_" + companyId : ""}.json"`
  );
  return res.send(JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2));
});

/* =====================
   ✅ WIDGET: SSE för inbox highlight + KPI snabb widget
===================== */
app.get("/events", authenticate, requireAgentOrAdmin, async (req, res) => {
  // SSE stream
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const userId = String(req.user.id);

  // keep-alive ping
  const ping = setInterval(() => {
    try {
      res.write(`event: ping\ndata: {}\n\n`);
    } catch {}
  }, 25000);

  sseAddClient(userId, res);

  // send initial hello
  try {
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  } catch {}

  req.on("close", () => {
    clearInterval(ping);
    sseRemoveClient(userId, res);
  });
});

// quick widget endpoint: agent/admin inbox counts
app.get("/admin/widget/summary", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const dbUser = await getDbUser(req);
    if (!dbUser) return res.status(403).json({ error: "User saknas" });

    const query = {};
    if (dbUser.role === "agent") query.assignedToUserId = dbUser._id;

    const total = await Ticket.countDocuments(query);
    const open = await Ticket.countDocuments({ ...query, status: "open" });
    const pending = await Ticket.countDocuments({ ...query, status: "pending" });
    const solved = await Ticket.countDocuments({ ...query, status: "solved" });

    return res.json({
      total,
      open,
      pending,
      solved,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid widget summary" });
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
    req.path.startsWith("/events")
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