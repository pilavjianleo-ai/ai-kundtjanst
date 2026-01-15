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

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "25mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* =====================
   ✅ ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "OK" : "SAKNAS");
console.log("APP_URL:", process.env.APP_URL ? "OK" : "SAKNAS");

if (!mongoUri) console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i Render env.");

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
   ✅ Models
===================== */
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, default: "" }, // optional men används för reset
  password: { type: String, required: true },
  role: { type: String, default: "user" }, // user | admin
  resetTokenHash: { type: String, default: "" },
  resetTokenExp: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  role: String, // user | assistant | agent
  content: String,
  timestamp: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true }, // category key
  status: { type: String, default: "open" }, // open | pending | solved
  priority: { type: String, default: "normal" }, // low | normal | high
  title: { type: String, default: "" },
  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
const Ticket = mongoose.model("Ticket", ticketSchema);

// ✅ FIXAD category schema (key istället för companyId)
const categorySchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true }, // demo | law | tech | cleaning
  name: { type: String, required: true },
  systemPrompt: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const Category = mongoose.model("Category", categorySchema);

const kbChunkSchema = new mongoose.Schema({
  companyId: { type: String, required: true }, // category key
  sourceType: { type: String, required: true }, // url | text | pdf
  sourceRef: { type: String, default: "" },
  title: { type: String, default: "" },
  chunkIndex: { type: Number, default: 0 },
  content: { type: String, default: "" },
  embedding: { type: [Number], default: [] },
  embeddingOk: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const KBChunk = mongoose.model("KBChunk", kbChunkSchema);

const feedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String,
  companyId: String,
  createdAt: { type: Date, default: Date.now }
});
const Feedback = mongoose.model("Feedback", feedbackSchema);

/* =====================
   ✅ OpenAI
===================== */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================
   ✅ Rate limit
===================== */
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);

/* =====================
   ✅ Helpers
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
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

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}
function norm(a) { return Math.sqrt(dot(a, a)); }
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
      input: text
    });
    return r.data?.[0]?.embedding || null;
  } catch (e) {
    const msg = e?.message || "";
    console.error("❌ Embedding error:", msg);

    // Om quota är slut: return null => embeddingOk false
    return null;
  }
}

async function ragSearch(companyId, query, topK = 4) {
  const qEmbed = await createEmbedding(query);
  if (!qEmbed) return { used: false, context: "", sources: [] };

  const chunks = await KBChunk.find({ companyId, embeddingOk: true }).limit(1500);
  if (!chunks.length) return { used: false, context: "", sources: [] };

  const scored = chunks
    .filter(c => c.embedding?.length)
    .map(c => ({ score: cosineSim(qEmbed, c.embedding), c }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (!scored.length || scored[0].score < 0.20) return { used: false, context: "", sources: [] };

  const context = scored.map((s, i) => `KÄLLA ${i + 1}: ${s.c.title || s.c.sourceRef}\n${s.c.content}`).join("\n\n");
  const sources = scored.map(s => ({
    title: s.c.title || s.c.sourceRef || "KB",
    sourceType: s.c.sourceType,
    sourceRef: s.c.sourceRef
  }));

  return { used: true, context, sources };
}

async function getSystemPrompt(companyId) {
  // Hämta kategori från DB
  const cat = await Category.findOne({ key: companyId });
  if (cat?.systemPrompt) return cat.systemPrompt;

  // fallback
  switch (companyId) {
    case "law":
      return "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmän vägledning men inte juridisk rådgivning.";
    case "tech":
      return "Du är en AI-kundtjänst för teknisk support inom IT och programmering på svenska. Felsök steg-för-steg och ge konkreta lösningar.";
    case "cleaning":
      return "Du är en AI-kundtjänst för städservice på svenska. Hjälp med bokningar, priser, rutiner och tips.";
    default:
      return "Du är en professionell och vänlig AI-kundtjänst på svenska.";
  }
}

async function ensureTicket(userId, companyId) {
  let t = await Ticket.findOne({ userId, companyId, status: { $ne: "solved" } }).sort({ lastActivityAt: -1 });
  if (!t) t = await new Ticket({ userId, companyId, messages: [] }).save();
  return t;
}

/* =====================
   ✅ URL + PDF extraction
===================== */
async function fetchUrlText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (AI Kundtjanst Bot)",
      "Accept": "text/html,application/xhtml+xml"
    }
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
   ✅ Email (Nodemailer)
===================== */
function mailerEnabled() {
  return (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.APP_URL
  );
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/* =====================
   ✅ Auth middleware
===================== */
const authenticate = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
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

/* =====================
   ✅ Default categories (SAFE UPSERT)
===================== */
async function ensureDefaultCategories() {
  const defaults = [
    { key: "demo", name: "Demo AB", systemPrompt: "Du är en professionell och vänlig AI-kundtjänst på svenska." },
    { key: "law", name: "Juridik", systemPrompt: "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmän vägledning men inte juridisk rådgivning." },
    { key: "tech", name: "Teknisk Support", systemPrompt: "Du är en AI-kundtjänst för teknisk support inom IT och programmering på svenska. Felsök steg-för-steg och ge konkreta lösningar." },
    { key: "cleaning", name: "Städservice", systemPrompt: "Du är en AI-kundtjänst för städservice på svenska. Hjälp med bokningar, priser, rutiner och tips." }
  ];

  for (const c of defaults) {
    await Category.updateOne({ key: c.key }, { $setOnInsert: c }, { upsert: true });
  }

  console.log("✅ Default categories säkrade");
}

mongoose.connection.once("open", () => {
  ensureDefaultCategories().catch((e) => console.error("❌ ensureDefaultCategories error:", e.message));
});

/* =====================
   ✅ ROUTES
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

/* =====================
   ✅ ME
===================== */
app.get("/me", authenticate, async (req, res) => {
  const u = await User.findById(req.user.id).select("-password");
  if (!u) return res.status(404).json({ error: "User saknas" });
  return res.json({ id: u._id, username: u.username, role: u.role, email: u.email || "" });
});

/* =====================
   ✅ AUTH
===================== */
app.post("/register", async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await new User({
      username,
      email: (email || "").trim().toLowerCase(),
      password: hashedPassword
    }).save();

    return res.json({ message: "Registrering lyckades", user: { id: u._id, username: u.username, role: u.role } });
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
  return res.json({ token, user: { id: u._id, username: u.username, role: u.role } });
});

/* =====================
   ✅ Change password (logged in)
===================== */
app.post("/auth/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Saknar fält" });

  const u = await User.findById(req.user.id);
  if (!u) return res.status(404).json({ error: "User saknas" });

  const ok = await bcrypt.compare(currentPassword, u.password);
  if (!ok) return res.status(401).json({ error: "Fel nuvarande lösenord" });

  u.password = await bcrypt.hash(newPassword, 10);
  await u.save();

  return res.json({ message: "Lösenord uppdaterat ✅" });
});

/* =====================
   ✅ Change username (logged in)
===================== */
app.post("/auth/change-username", authenticate, async (req, res) => {
  const { newUsername } = req.body || {};
  if (!newUsername) return res.status(400).json({ error: "newUsername saknas" });

  const exists = await User.findOne({ username: newUsername });
  if (exists) return res.status(400).json({ error: "Användarnamn upptaget" });

  const u = await User.findById(req.user.id);
  if (!u) return res.status(404).json({ error: "User saknas" });

  u.username = newUsername;
  await u.save();

  return res.json({ message: "Användarnamn uppdaterat ✅", username: newUsername });
});

/* =====================
   ✅ Forgot password (email)
===================== */
app.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email saknas" });

  if (!mailerEnabled()) {
    return res.status(500).json({ error: "SMTP är inte konfigurerat" });
  }

  const e = String(email).trim().toLowerCase();
  const u = await User.findOne({ email: e });

  // svara alltid OK (säkerhet) även om user saknas
  if (!u) return res.json({ message: "Om kontot finns skickas ett mail ✅" });

  const rawToken = `${u._id}.${Date.now()}.${Math.random()}`;
  const tokenHash = await bcrypt.hash(rawToken, 10);

  u.resetTokenHash = tokenHash;
  u.resetTokenExp = new Date(Date.now() + 1000 * 60 * 30); // 30 min
  await u.save();

  const resetUrl = `${process.env.APP_URL.replace(/\/$/, "")}/?resetToken=${encodeURIComponent(rawToken)}`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: u.email,
    subject: "Återställ lösenord (AI Kundtjänst)",
    text: `Hej!\n\nKlicka här för att återställa lösenord:\n${resetUrl}\n\nLänken gäller i 30 minuter.`,
  });

  return res.json({ message: "Om kontot finns skickas ett mail ✅" });
});

/* =====================
   ✅ Reset password (email token)
===================== */
app.post("/auth/reset-password", async (req, res) => {
  const { resetToken, newPassword } = req.body || {};
  if (!resetToken || !newPassword) return res.status(400).json({ error: "Saknar fält" });

  const parts = String(resetToken).split(".");
  const userId = parts?.[0];
  if (!userId) return res.status(400).json({ error: "Ogiltig token" });

  const u = await User.findById(userId);
  if (!u || !u.resetTokenHash || !u.resetTokenExp) return res.status(400).json({ error: "Ogiltig token" });

  if (u.resetTokenExp < new Date()) return res.status(400).json({ error: "Token har gått ut" });

  const ok = await bcrypt.compare(resetToken, u.resetTokenHash);
  if (!ok) return res.status(400).json({ error: "Ogiltig token" });

  u.password = await bcrypt.hash(newPassword, 10);
  u.resetTokenHash = "";
  u.resetTokenExp = null;
  await u.save();

  return res.json({ message: "Lösenord återställt ✅ Du kan logga in nu." });
});

/* =====================
   ✅ CHAT (ticket + RAG)
===================== */
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
      await ticket.save();
    }

    const rag = await ragSearch(companyId, userQuery, 4);

    const systemMessage = {
      role: "system",
      content:
        (await getSystemPrompt(companyId)) +
        (rag.used
          ? `\n\nIntern kunskapsdatabas (om relevant):\n${rag.context}\n\nSvara tydligt och konkret.`
          : "")
    };

    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const reply = cleanText(response.choices?.[0]?.message?.content || "Inget svar från AI.");

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    ticket.lastActivityAt = new Date();
    await ticket.save();

    return res.json({ reply, ticketId: ticket._id, ragUsed: rag.used, sources: rag.sources });
  } catch (e) {
    console.error("❌ Chat error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/* =====================
   ✅ Feedback (alla users)
===================== */
app.post("/feedback", authenticate, async (req, res) => {
  const { type, companyId } = req.body || {};
  if (!type) return res.status(400).json({ error: "type saknas" });

  await new Feedback({ userId: req.user.id, type, companyId }).save();
  return res.json({ message: "Tack för feedback ✅" });
});

/* =====================
   ✅ ADMIN: Tickets inbox
===================== */
app.get("/admin/tickets", authenticate, requireAdmin, async (req, res) => {
  const { status, companyId } = req.query || {};
  const query = {};
  if (status) query.status = status;
  if (companyId) query.companyId = companyId;

  const tickets = await Ticket.find(query).sort({ lastActivityAt: -1 }).limit(300);
  return res.json(tickets);
});

app.get("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

app.post("/admin/tickets/:ticketId/status", authenticate, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["open", "pending", "solved"].includes(status)) return res.status(400).json({ error: "Ogiltig status" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.status = status;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Status uppdaterad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/priority", authenticate, requireAdmin, async (req, res) => {
  const { priority } = req.body || {};
  if (!["low", "normal", "high"].includes(priority)) return res.status(400).json({ error: "Ogiltig prioritet" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.priority = priority;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Prioritet uppdaterad ✅", ticket: t });
});

// ✅ Agent reply (syns för kunden som nästa meddelande)
app.post("/admin/tickets/:ticketId/agent-reply", authenticate, requireAdmin, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content saknas" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.messages.push({ role: "agent", content: cleanText(content), timestamp: new Date() });
  t.status = "pending";
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Agent-svar skickat ✅", ticket: t });
});

// ✅ Delete ONE ticket
app.delete("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  await Ticket.deleteOne({ _id: req.params.ticketId });
  return res.json({ message: "Ticket borttagen ✅" });
});

// ✅ Delete all solved tickets
app.post("/admin/tickets/cleanup-solved", authenticate, requireAdmin, async (req, res) => {
  const r = await Ticket.deleteMany({ status: "solved" });
  return res.json({ message: `Rensade ${r.deletedCount} lösta tickets ✅` });
});

/* =====================
   ✅ ADMIN: Users
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(2000);
  return res.json(users);
});

app.post("/admin/users/:userId/role", authenticate, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

  const u = await User.findById(req.params.userId);
  if (!u) return res.status(404).json({ error: "User hittades inte" });

  u.role = role;
  await u.save();

  return res.json({ message: "Roll uppdaterad ✅", user: { id: u._id, username: u.username, role: u.role } });
});

app.delete("/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  const targetId = req.params.userId;
  if (String(targetId) === String(req.user.id)) return res.status(400).json({ error: "Du kan inte ta bort dig själv." });

  const u = await User.findById(targetId);
  if (!u) return res.status(404).json({ error: "User hittades inte" });

  await Ticket.deleteMany({ userId: targetId });
  await Feedback.deleteMany({ userId: targetId });
  await User.deleteOne({ _id: targetId });

  return res.json({ message: `Användaren ${u.username} togs bort ✅` });
});

/* =====================
   ✅ ADMIN: Category manager
===================== */
app.get("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  const cats = await Category.find({}).sort({ createdAt: 1 });
  return res.json(cats);
});

app.post("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  const { key, name, systemPrompt } = req.body || {};
  if (!key || !name) return res.status(400).json({ error: "key + name krävs" });

  const exists = await Category.findOne({ key });
  if (exists) return res.status(400).json({ error: "Key finns redan" });

  const c = await new Category({ key, name, systemPrompt: systemPrompt || "" }).save();
  return res.json({ message: "Kategori skapad ✅", category: c });
});

app.put("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  const { name, systemPrompt } = req.body || {};
  const c = await Category.findOne({ key: req.params.key });
  if (!c) return res.status(404).json({ error: "Kategori hittades inte" });

  if (name) c.name = name;
  if (systemPrompt !== undefined) c.systemPrompt = systemPrompt;
  await c.save();

  return res.json({ message: "Kategori uppdaterad ✅", category: c });
});

app.delete("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  const key = req.params.key;

  // skydda default
  if (["demo", "law", "tech", "cleaning"].includes(key)) {
    return res.status(400).json({ error: "Du kan inte ta bort default-kategorier." });
  }

  await Category.deleteOne({ key });
  await KBChunk.deleteMany({ companyId: key });
  await Ticket.deleteMany({ companyId: key });

  return res.json({ message: "Kategori borttagen ✅" });
});

/* =====================
   ✅ ADMIN: KB Upload / List / Export
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 }).limit(400);
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
        embeddingOk
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
        embeddingOk
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
        embeddingOk
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
   ✅ TRAINING EXPORT (Q/A)
===================== */
app.get("/admin/export/training", authenticate, requireAdmin, async (req, res) => {
  const { companyId } = req.query || {};
  const query = {};
  if (companyId) query.companyId = companyId;

  const tickets = await Ticket.find(query).sort({ createdAt: -1 }).limit(2000);

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
          timestamp: b.timestamp
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
   ✅ ADMIN EXPORT ALL
===================== */
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password");
  const tickets = await Ticket.find({});
  const kb = await KBChunk.find({});
  const feedback = await Feedback.find({});
  const categories = await Category.find({});

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="export_all.json"`);
  return res.send(JSON.stringify({ users, tickets, kb, feedback, categories, exportedAt: new Date().toISOString() }, null, 2));
});

/* =====================
   ✅ Start
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
