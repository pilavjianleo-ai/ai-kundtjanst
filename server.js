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

// Node 18+ har fetch globalt
// Om du får "fetch is not defined" lokalt: npm i node-fetch och importera

const app = express();

// ✅ Render / proxy fix för rate-limit
app.set("trust proxy", 1);

app.use(express.json({ limit: "22mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* =====================
   ✅ ENV
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", process.env.MONGO_URI ? "OK" : "SAKNAS");
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");

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
  username: { type: String, unique: true, required: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" }, // user | admin
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

const internalNoteSchema = new mongoose.Schema({
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  byUsername: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
});

const messageSchema = new mongoose.Schema({
  role: String, // user | assistant | agent
  content: String,
  timestamp: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true },

  status: { type: String, default: "open" }, // open | pending | solved
  priority: { type: String, default: "normal" }, // low | normal | high

  title: { type: String, default: "" },

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  messages: [messageSchema],
  internalNotes: [internalNoteSchema],

  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const Ticket = mongoose.model("Ticket", ticketSchema);

const kbChunkSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  sourceType: { type: String, required: true }, // url | text | pdf
  sourceRef: { type: String, default: "" },
  title: { type: String, default: "" },
  chunkIndex: { type: Number, default: 0 },
  content: { type: String, default: "" },
  embedding: { type: [Number], default: [] },
  embeddingOk: { type: Boolean, default: false },
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

// ✅ Admin internal notes per kategori (din "notering per kategori")
const adminNoteSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  title: { type: String, default: "" },
  content: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdByUsername: String,
  createdAt: { type: Date, default: Date.now },
});
const AdminNote = mongoose.model("AdminNote", adminNoteSchema);

// ✅ Kategorier som admin kan skapa själv
const categorySchema = new mongoose.Schema({
  companyId: { type: String, unique: true, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  systemPrompt: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
const Category = mongoose.model("Category", categorySchema);

/* =====================
   ✅ OpenAI
===================== */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================
   ✅ Rate limit
===================== */
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

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

  const chunks = await KBChunk.find({ companyId, embeddingOk: true }).limit(1500);
  if (!chunks.length) return { used: false, context: "", sources: [] };

  const scored = chunks
    .filter((c) => c.embedding?.length)
    .map((c) => ({ score: cosineSim(qEmbed, c.embedding), c }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (!scored.length || scored[0].score < 0.20) {
    return { used: false, context: "", sources: [] };
  }

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

// ✅ Default prompts (om admin ej skapat kategori i DB)
function defaultSystemPrompt(companyId) {
  switch (companyId) {
    case "law":
      return "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmän vägledning men inte juridisk rådgivning. Svara tydligt och professionellt.";
    case "tech":
      return "Du är en AI-kundtjänst för teknisk support inom IT och programmering på svenska. Felsök steg-för-steg och ge konkreta lösningar.";
    case "cleaning":
      return "Du är en AI-kundtjänst för städservice på svenska. Hjälp med bokningar, priser, rutiner och tips.";
    default:
      return "Du är en professionell och vänlig AI-kundtjänst på svenska.";
  }
}

async function getSystemPrompt(companyId) {
  const cat = await Category.findOne({ companyId, enabled: true });
  if (cat?.systemPrompt) return cat.systemPrompt;
  return defaultSystemPrompt(companyId);
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
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) throw new Error(`Kunde inte hämta URL. Status: ${res.status}`);
  const html = await res.text();

  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside").remove();

  const main = $("main").text() || $("article").text() || $("body").text();
  const text = cleanText(main);

  if (!text || text.length < 200) {
    throw new Error("Ingen tillräcklig text kunde extraheras från URL.");
  }
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
   ✅ ROUTES BASIC
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

app.get("/me", authenticate, async (req, res) => {
  const u = await User.findById(req.user.id).select("-password");
  if (!u) return res.status(404).json({ error: "User saknas" });
  return res.json({ id: u._id, username: u.username, role: u.role });
});

/* =====================
   ✅ AUTH
===================== */
app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  // ✅ basic password rules
  if (String(password).length < 6) return res.status(400).json({ error: "Lösenord måste vara minst 6 tecken." });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await new User({ username, password: hashedPassword }).save();
    return res.json({
      message: "Registrering lyckades",
      user: { id: u._id, username: u.username, role: u.role },
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
  return res.json({ token, user: { id: u._id, username: u.username, role: u.role } });
});

/* =====================
   ✅ Categories (dynamic)
===================== */
app.get("/categories", authenticate, async (req, res) => {
  const cats = await Category.find({ enabled: true }).sort({ createdAt: -1 });
  // return fallback defaults too
  const defaults = [
    { companyId: "demo", title: "Demo", systemPrompt: "", enabled: true },
    { companyId: "law", title: "Juridik", systemPrompt: "", enabled: true },
    { companyId: "tech", title: "Teknisk support", systemPrompt: "", enabled: true },
    { companyId: "cleaning", title: "Städservice", systemPrompt: "", enabled: true },
  ];

  // merge unique by companyId
  const map = new Map();
  defaults.forEach((c) => map.set(c.companyId, c));
  cats.forEach((c) => map.set(c.companyId, { companyId: c.companyId, title: c.title, enabled: c.enabled }));

  return res.json(Array.from(map.values()));
});

// ✅ ADMIN create category
app.post("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  const { companyId, title, systemPrompt } = req.body || {};
  if (!companyId || !title || !systemPrompt) {
    return res.status(400).json({ error: "companyId, title och systemPrompt krävs" });
  }

  try {
    const saved = await new Category({
      companyId: String(companyId).trim().toLowerCase(),
      title: String(title).trim(),
      systemPrompt: String(systemPrompt).trim(),
      enabled: true,
    }).save();

    return res.json({ message: "Kategori skapad ✅", category: saved });
  } catch (e) {
    return res.status(400).json({ error: "companyId finns redan eller ogiltigt" });
  }
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
    const systemPrompt = await getSystemPrompt(companyId);

    const systemMessage = {
      role: "system",
      content:
        systemPrompt +
        (rag.used
          ? `\n\nIntern kunskapsdatabas (om relevant):\n${rag.context}\n\nSvara tydligt och konkret.`
          : ""),
    };

    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply = cleanText(response.choices?.[0]?.message?.content || "Inget svar från AI.");

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    ticket.status = "open";
    ticket.lastActivityAt = new Date();
    await ticket.save();

    return res.json({
      reply,
      ticketId: ticket._id,
      ragUsed: rag.used,
      sources: rag.sources,
    });
  } catch (e) {
    console.error("❌ Chat error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/* =====================
   ✅ USER tickets
===================== */
app.get("/tickets", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ lastActivityAt: -1 }).limit(50);
  return res.json(tickets);
});

app.get("/tickets/:ticketId", authenticate, async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.ticketId, userId: req.user.id });
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  // ✅ User should NOT see internalNotes
  const safe = {
    _id: t._id,
    companyId: t.companyId,
    status: t.status,
    priority: t.priority,
    title: t.title,
    messages: t.messages,
    lastActivityAt: t.lastActivityAt,
    createdAt: t.createdAt,
  };

  return res.json(safe);
});

/* =====================
   ✅ ADMIN: Tickets inbox
===================== */
app.get("/admin/tickets", authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, companyId, assigned } = req.query || {};

    const filter = {};
    if (status) filter.status = status;
    if (companyId) filter.companyId = companyId;

    if (assigned === "unassigned") filter.assignedTo = null;
    if (assigned === "me") filter.assignedTo = req.user.id;

    const tickets = await Ticket.find(filter).sort({ lastActivityAt: -1 }).limit(300);
    return res.json(tickets);
  } catch (e) {
    console.error("❌ /admin/tickets error:", e);
    return res.status(500).json({ error: "Serverfel vid hämtning av tickets" });
  }
});

app.get("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

app.post("/admin/tickets/:ticketId/status", authenticate, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["open", "pending", "solved"].includes(status)) {
    return res.status(400).json({ error: "Ogiltig status" });
  }

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.status = status;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Status uppdaterad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/priority", authenticate, requireAdmin, async (req, res) => {
  try {
    const { priority } = req.body || {};
    if (!["low", "normal", "high"].includes(priority)) {
      return res.status(400).json({ error: "Ogiltig prioritet" });
    }

    const t = await Ticket.findById(req.params.ticketId);
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    t.priority = priority;
    t.lastActivityAt = new Date();
    await t.save();

    return res.json({ message: "Prioritet uppdaterad ✅", ticket: t });
  } catch (e) {
    console.error("❌ Priority error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid prioritet" });
  }
});

// ✅ agent reply (syns för user i ticket messages)
app.post("/admin/tickets/:ticketId/agent-reply", authenticate, requireAdmin, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content saknas" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  const safe = cleanText(content);

  t.messages.push({ role: "agent", content: safe, timestamp: new Date() });
  t.status = "pending";
  t.assignedTo = t.assignedTo || req.user.id;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Agent-svar skickat ✅", ticket: t });
});

// ✅ internal notes
app.post("/admin/tickets/:ticketId/notes", authenticate, requireAdmin, async (req, res) => {
  const { content } = req.body || {};
  if (!content || String(content).trim().length < 2) {
    return res.status(400).json({ error: "Anteckning saknas" });
  }

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  const me = await User.findById(req.user.id);

  t.internalNotes.push({
    byUserId: req.user.id,
    byUsername: me?.username || "admin",
    content: cleanText(content),
    timestamp: new Date(),
  });

  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Note sparad ✅", ticket: t });
});

// ✅ admin delete ticket manually
app.delete("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  await Ticket.deleteOne({ _id: req.params.ticketId });
  return res.json({ message: "Ticket borttagen ✅" });
});

// ✅ admin bulk delete solved
app.delete("/admin/tickets-solved", authenticate, requireAdmin, async (req, res) => {
  const r = await Ticket.deleteMany({ status: "solved" });
  return res.json({ message: `Rensade solved tickets ✅ (${r.deletedCount})` });
});

/* =====================
   ✅ ADMIN: Users
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(1000);
  return res.json(users);
});

app.post("/admin/users/:userId/role", authenticate, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

  const u = await User.findById(req.params.userId);
  if (!u) return res.status(404).json({ error: "User hittades inte" });

  // skydda att admin inte råkar ta bort admin från sig själv
  if (String(u._id) === String(req.user.id) && role !== "admin") {
    return res.status(400).json({ error: "Du kan inte ta bort admin från dig själv." });
  }

  u.role = role;
  await u.save();

  return res.json({ message: "Roll uppdaterad ✅", user: { id: u._id, username: u.username, role: u.role } });
});

app.delete("/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.userId;

    if (String(targetId) === String(req.user.id)) {
      return res.status(400).json({ error: "Du kan inte ta bort dig själv." });
    }

    const u = await User.findById(targetId);
    if (!u) return res.status(404).json({ error: "User hittades inte" });

    // skydda att admin inte råkar delete annan admin
    if (u.role === "admin") {
      return res.status(400).json({ error: "Du kan inte ta bort en admin-user här." });
    }

    await Ticket.deleteMany({ userId: targetId });
    await Feedback.deleteMany({ userId: targetId });
    await User.deleteOne({ _id: targetId });

    return res.json({ message: `Användaren ${u.username} togs bort ✅` });
  } catch (e) {
    console.error("❌ Delete user error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid borttagning" });
  }
});

/* =====================
   ✅ ADMIN: Observations / Notes per kategori
===================== */
app.get("/admin/notes/:companyId", authenticate, requireAdmin, async (req, res) => {
  const notes = await AdminNote.find({ companyId: req.params.companyId }).sort({ createdAt: -1 }).limit(200);
  return res.json(notes);
});

app.post("/admin/notes", authenticate, requireAdmin, async (req, res) => {
  const { companyId, title, content } = req.body || {};
  if (!companyId || !content) return res.status(400).json({ error: "companyId och content krävs" });

  const me = await User.findById(req.user.id);

  const note = await new AdminNote({
    companyId,
    title: title || "",
    content: cleanText(content),
    createdBy: req.user.id,
    createdByUsername: me?.username || "admin",
  }).save();

  return res.json({ message: "Notering sparad ✅", note });
});

/* =====================
   ✅ ADMIN: KB Upload / List / Export
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 }).limit(400);
  return res.json(items);
});

app.delete("/kb/clear/:companyId", authenticate, requireAdmin, async (req, res) => {
  const r = await KBChunk.deleteMany({ companyId: req.params.companyId });
  return res.json({ message: `Rensade KB för ${req.params.companyId} ✅ (${r.deletedCount})` });
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
   ✅ EXPORTS
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

app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password");
  const tickets = await Ticket.find({});
  const kb = await KBChunk.find({});
  const feedback = await Feedback.find({});
  const categories = await Category.find({});
  const notes = await AdminNote.find({});

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="export_all.json"`);
  return res.send(JSON.stringify({ users, tickets, kb, feedback, categories, notes, exportedAt: new Date().toISOString() }, null, 2));
});

/* =====================
   ✅ DASHBOARD
===================== */
app.get("/admin/dashboard", authenticate, requireAdmin, async (req, res) => {
  const totalUsers = await User.countDocuments({});
  const totalTickets = await Ticket.countDocuments({});
  const open = await Ticket.countDocuments({ status: "open" });
  const pending = await Ticket.countDocuments({ status: "pending" });
  const solved = await Ticket.countDocuments({ status: "solved" });

  const byCompany = await Ticket.aggregate([
    { $group: { _id: "$companyId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const latest = await Ticket.find({}).sort({ lastActivityAt: -1 }).limit(10);

  return res.json({
    totalUsers,
    totalTickets,
    open,
    pending,
    solved,
    byCompany,
    latest,
  });
});

/* =====================
   ✅ Start
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
