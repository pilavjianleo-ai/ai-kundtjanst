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

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "12mb" }));
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

/* =====================
   ✅ Models
===================== */
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" }, // user | admin
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
  companyId: { type: String, required: true },
  status: { type: String, default: "open" }, // open | pending | solved
  priority: { type: String, default: "normal" }, // low | normal | high
  title: { type: String, default: "" },
  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
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

function getSystemPrompt(companyId) {
  switch (companyId) {
    case "law":
      return "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmänna råd (inte juridisk rådgivning). Var professionell och tydlig.";
    case "tech":
      return "Du är en AI-kundtjänst för teknisk support inom IT och programmering på svenska. Felsök steg för steg med tydliga instruktioner.";
    case "cleaning":
      return "Du är en AI-kundtjänst för städservice på svenska. Hjälp med bokning, rutiner, priser, och tips.";
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

/**
 * ✅ ADMIN FIX:
 * Vi litar INTE på token role, vi kollar DB varje gång.
 */
const requireAdmin = async (req, res, next) => {
  const dbUser = await User.findById(req.user?.id);
  if (!dbUser || dbUser.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

/* =====================
   ✅ Rate limit
===================== */
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);

/* =====================
   ✅ Routes
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

/**
 * ✅ ME endpoint: frontend kan alltid hämta aktuell roll
 */
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

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await new User({ username, password: hashedPassword }).save();
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
   ✅ Tickets
===================== */
app.get("/tickets", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ lastActivityAt: -1 }).limit(50);
  return res.json(tickets);
});

app.get("/tickets/:ticketId", authenticate, async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.ticketId, userId: req.user.id });
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

/* =====================
   ✅ Chat (with RAG)
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
        getSystemPrompt(companyId) +
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
   ✅ Admin Tickets + Agent takeover
===================== */
app.get("/admin/tickets", authenticate, requireAdmin, async (req, res) => {
  const tickets = await Ticket.find({}).sort({ lastActivityAt: -1 }).limit(200);
  return res.json(tickets);
});

app.get("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

app.post("/admin/tickets/:ticketId/agent-reply", authenticate, requireAdmin, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content saknas" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.messages.push({ role: "agent", content: cleanText(content), timestamp: new Date() });
  t.status = "pending";
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Agent-svar sparat", ticket: t });
});

/* =====================
   ✅ Admin Users
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(500);
  return res.json(users);
});

/* =====================
   ✅ KB Upload
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 }).limit(300);
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

/* =====================
   ✅ Export
===================== */
app.get("/export/kb/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="kb_${req.params.companyId}.json"`);
  return res.send(JSON.stringify(items, null, 2));
});

app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password");
  const tickets = await Ticket.find({});
  const kb = await KBChunk.find({});
  const feedback = await Feedback.find({});

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="export_all.json"`);
  return res.send(JSON.stringify({ users, tickets, kb, feedback, exportedAt: new Date().toISOString() }, null, 2));
});

/* =====================
   ✅ Start
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
