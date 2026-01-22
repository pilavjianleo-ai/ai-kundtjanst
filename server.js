// server.js (FIXAD ORIGINALVERSION - CommonJS + Render Node 20)
// ✅ MongoDB (dina gamla users funkar igen)
// ✅ JWT login + bcrypt
// ✅ RAG + KB + SLA + Admin/Agent skydd
// ✅ SSE events för inbox-notis
// ✅ Stabil: kraschar inte pga småfel

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

// ✅ FIX: node-fetch v3 är ESM, men du kör commonjs -> använd dynamic import
async function fetchCompat(...args) {
  const mod = await import("node-fetch");
  return mod.default(...args);
}

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "18mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* ===================== ✅ ENV ===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "OK" : "SAKNAS");
console.log("SMTP_USER:", process.env.SMTP_USER ? "OK" : "SAKNAS");
console.log("APP_URL:", process.env.APP_URL ? "OK" : "SAKNAS");

if (!mongoUri) console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i Render env.");
if (!process.env.JWT_SECRET) console.error("❌ JWT_SECRET saknas!");
if (!process.env.OPENAI_API_KEY) console.error("❌ OPENAI_API_KEY saknas!");
if (!process.env.APP_URL) console.error("❌ APP_URL saknas! Ex: https://din-app.onrender.com");

/* ===================== ✅ MongoDB ===================== */
mongoose.set("strictQuery", true);

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB ansluten"))
  .catch((err) => console.error("❌ MongoDB-fel:", err.message));

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB runtime error:", err);
});

/* ===================== ✅ Helpers ===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
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

/* ===================== ✅ Models (User) ===================== */
function makePublicId() {
  const s = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `USR-${s.slice(0, 6)}`;
}

// Auto-increment counter
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

/* ===================== ✅ Ticket / Messages ===================== */
const messageSchema = new mongoose.Schema({
  role: String, // user | assistant | agent
  content: String,
  timestamp: { type: Date, default: Date.now },
});

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
      resolutionLimitMs: 7 * 24 * 60 * MIN, // 7d
    };
  }

  return {
    firstResponseLimitMs: 8 * 60 * MIN, // 8h
    resolutionLimitMs: 3 * 24 * 60 * MIN, // 3d
  };
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

  const firstResponseRemainingMs = firstAgentReplyAt
    ? 0
    : Math.max(0, firstResponseDueAt.getTime() - nowMs);

  const resolutionRemainingMs = solvedAt
    ? 0
    : Math.max(0, resolutionDueAt.getTime() - nowMs);

  const breachedFirstResponse = firstResponseMs !== null ? firstResponseMs > limits.firstResponseLimitMs : false;

  const effectiveRunningMs = solvedAt ? resolutionMs : calcEffectiveMsFromCreated(t, now, now);

  const breachedResolution = effectiveRunningMs != null ? effectiveRunningMs > limits.resolutionLimitMs : false;

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

  sla: { type: Object, default: {} },

  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

const Ticket = mongoose.model("Ticket", ticketSchema);

/* ===================== ✅ KB + Feedback + Categories ===================== */
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

/* ===================== ✅ Default categories ===================== */
async function ensureDefaultCategories() {
  const defaults = [
    {
      key: "demo",
      name: "Demo AB",
      systemPrompt: "Du är en professionell och vänlig AI-kundtjänst på svenska.",
    },
    {
      key: "law",
      name: "Juridik",
      systemPrompt: "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmän vägledning men inte juridisk rådgivning.",
    },
    {
      key: "tech",
      name: "Teknisk support",
      systemPrompt: "Du är en AI-kundtjänst för teknisk support på svenska. Felsök steg-för-steg och ge konkreta lösningar.",
    },
    {
      key: "cleaning",
      name: "Städservice",
      systemPrompt: "Du är en AI-kundtjänst för städservice på svenska. Hjälp med tjänster, rutiner, bokning och tips.",
    },
  ];

  for (const c of defaults) {
    await Category.updateOne({ key: c.key }, { $setOnInsert: c }, { upsert: true });
  }
  console.log("✅ Default categories säkerställda");
}
ensureDefaultCategories().catch((e) => console.error("❌ ensureDefaultCategories error:", e));

/* ===================== ✅ OpenAI ===================== */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ===================== ✅ Rate limit ===================== */
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);
app.use("/auth", limiterAuth);

/* ===================== ✅ Chunking + Embeddings ===================== */
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

/* ===================== ✅ URL + PDF extraction ===================== */
async function fetchUrlText(url) {
  const res = await fetchCompat(url, {
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

/* ===================== ✅ Auth middleware ===================== */
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

/* ===================== ✅ Email (SMTP) ===================== */
function smtpReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/* ===================== ✅ SSE (Inbox realtime) ===================== */
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

/* ===================== ✅ ROUTES ===================== */
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

/* ===================== ✅ AUTH ===================== */
app.post("/register", async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await new User({
      username,
      password: hashedPassword,
      email: email || "",
    }).save();

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
/* ===================== ✅ Change username/password ===================== */
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

/* ===================== ✅ Forgot/Reset password ===================== */
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

/* ===================== ✅ Feedback ===================== */
app.post("/feedback", authenticate, async (req, res) => {
  try {
    const { type, companyId } = req.body || {};
    if (!type) return res.status(400).json({ error: "type saknas" });

    await new Feedback({
      userId: req.user.id,
      type,
      companyId: companyId || "demo",
    }).save();

    return res.json({ message: "Feedback sparad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid feedback" });
  }
});

/* ===================== ✅ Categories ===================== */
app.get("/categories", async (req, res) => {
  try {
    const cats = await Category.find({}).sort({ createdAt: 1 });
    return res.json(
      cats.map((c) => ({
        key: c.key,
        name: c.name,
        systemPrompt: c.systemPrompt,
      }))
    );
  } catch {
    return res.status(500).json({ error: "Serverfel vid kategorier" });
  }
});

/* ✅ Admin kan redigera kategori */
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
  } catch (e) {
    console.error("❌ update category error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid uppdatera kategori" });
  }
});

/* ===================== ✅ CHAT (ticket + RAG) ===================== */
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

    const lastUser = conversation[conversation.length - 1];
    const userQuery = cleanText(lastUser?.content || "");

    if (lastUser?.role === "user") {
      ticket.messages.push({ role: "user", content: userQuery, timestamp: new Date() });
      if (!ticket.title) ticket.title = userQuery.slice(0, 60);
      ticket.lastActivityAt = new Date();

      // ✅ om user svarar när pending -> resume
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
      content: [
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

    return res.json({ reply, ticketId: ticket._id, ragUsed: rag.used, sources: rag.sources });
  } catch (e) {
    console.error("❌ Chat error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/* ===================== ✅ USER: My tickets ===================== */
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

/* ===================== ✅ ADMIN/AGENT: Inbox ===================== */
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

/* ===================== ✅ Pending timer logic ===================== */
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

/* ===================== ✅ Ticket actions ===================== */
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

  sseSendToUser(String(dbUser._id), "inbox:update", { ticketId: String(t._id) });

  return res.json({ message: "Agent-svar sparat ✅", ticket: t });
});

/* ===================== ✅ Internal notes ===================== */
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

    t.internalNotes.push({ createdBy: req.user.id, content: cleanText(content), createdAt: new Date() });
    t.lastActivityAt = new Date();

    safeEnsureSla(t);
    await t.save();

    return res.json({ message: "Intern notering sparad ✅", ticket: t });
  } catch {
    return res.status(500).json({ error: "Serverfel vid intern notering" });
  }
});

/* ===================== ✅ Solve all / Remove solved (Admin only) ===================== */
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

/* ===================== ✅ Assign + Delete ===================== */
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

/* ===================== ✅ ADMIN: Users + roles ===================== */
app.get("/admin/users", authenticate, requireAgentOrAdmin, async (req, res) => {
  const dbUser = await getDbUser(req);
  if (!dbUser) return res.status(403).json({ error: "User saknas" });

  // agent ser bara agents + admins
  if (dbUser.role === "agent") {
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

    if (String(targetId) === String(req.user.id)) {
      return res.status(400).json({ error: "Du kan inte ta bort dig själv." });
    }

    const u = await User.findById(targetId);
    if (!u) return res.status(404).json({ error: "User hittades inte" });

    await Ticket.deleteMany({ userId: targetId });
    await Feedback.deleteMany({ userId: targetId });

    await User.deleteOne({ _id: targetId });

    return res.json({ message: `Användaren ${u.username} togs bort ✅` });
  } catch {
    return res.status(500).json({ error: "Serverfel vid borttagning" });
  }
});

/* ===================== ✅ ADMIN: Categories manager ===================== */
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

/* ===================== ✅ ADMIN: KB Upload / List / Export ===================== */
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

    return res.json({
      message: `Text uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})`,
    });
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

    return res.json({
      message: `URL uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})`,
    });
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

    return res.json({
      message: `PDF uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})`,
    });
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

/* ===================== ✅ EXPORT ALL ===================== */
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password");
  const tickets = await Ticket.find({});
  const kb = await KBChunk.find({});
  const feedback = await Feedback.find({});
  const categories = await Category.find({});

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="export_all.json"`);

  return res.send(
    JSON.stringify(
      {
        users,
        tickets,
        kb,
        feedback,
        categories,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
});

/* ===================== ✅ TRAINING EXPORT ===================== */
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

/* ===================== ✅ SSE events ===================== */
app.get("/events", authenticate, requireAgentOrAdmin, async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const userId = String(req.user.id);

  const ping = setInterval(() => {
    try {
      res.write(`event: ping\ndata: {}\n\n`);
    } catch {}
  }, 25000);

  sseAddClient(userId, res);

  try {
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  } catch {}

  req.on("close", () => {
    clearInterval(ping);
    sseRemoveClient(userId, res);
  });
});



/* =====================
   ✅ SLA (MINIMAL) FIX ROUTES
===================== */
app.get("/admin/sla/overview", authenticate, requireAgentOrAdmin, async (req, res) => {
  try {
    const rangeDays = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

    const tickets = await Ticket.find({ createdAt: { $gte: since } }).limit(10000);

    // super basic KPI (så din frontend slutar klaga)
    const totalTickets = tickets.length;
    const open = tickets.filter(t => t.status === "open").length;
    const pending = tickets.filter(t => t.status === "pending").length;
    const solved = tickets.filter(t => t.status === "solved").length;

    return res.json({
      rangeDays,
      totalTickets,
      open,
      pending,
      solved,
      byPriority: { low: 0, normal: 0, high: 0 },
      firstResponse: { avgMs: null, medianMs: null, p90Ms: null, breaches: 0, compliancePct: null, atRisk: 0 },
      resolution: { avgMs: null, medianMs: null, p90Ms: null, breaches: 0, compliancePct: null, atRisk: 0 },
      trendWeeks: []
    });

  } catch (e) {
    console.error("❌ SLA overview error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid SLA overview" });
  }
});



/* ===================== ✅ JSON 404 for API routes ===================== */
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

/* ===================== ✅ START ===================== */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
console.log("✅ server.js reached end of file without crashing");
