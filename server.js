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

app.use(express.json({ limit: "18mb" }));
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

mongoose.connection.on("error", (err) => console.error("❌ MongoDB runtime error:", err));

/* =====================
   ✅ Models
===================== */
// roles: user | agent | admin
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
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

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // agent/admin
  agentNotes: { type: String, default: "" }, // internal notes

  messages: [messageSchema],

  // SLA tracking
  slaDueAt: { type: Date, default: null },     // deadline for reply
  firstResponseAt: { type: Date, default: null },

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
      input: text
    });
    return r.data?.[0]?.embedding || null;
  } catch (e) {
    console.error("❌ Embedding error:", e?.message || e);
    return null; // ✅ fail-safe
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

  if (!scored.length || scored[0].score < 0.20) return { used: false, context: "", sources: [] };

  const context = scored
    .map((s, i) => `KÄLLA ${i + 1}: ${s.c.title || s.c.sourceRef}\n${s.c.content}`)
    .join("\n\n");

  const sources = scored.map((s) => ({
    title: s.c.title || s.c.sourceRef || "KB",
    sourceType: s.c.sourceType,
    sourceRef: s.c.sourceRef
  }));

  return { used: true, context, sources };
}

function getSystemPrompt(companyId) {
  switch (companyId) {
    case "law":
      return "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmän vägledning och var tydlig att detta inte är juridisk rådgivning.";
    case "tech":
      return "Du är en AI-kundtjänst för teknisk support inom IT/programmering. Felsök steg-för-steg och var konkret.";
    case "cleaning":
      return "Du är en AI-kundtjänst för städservice. Hjälp med frågor om tjänster, upplägg och rutiner.";
    default:
      return "Du är en professionell och vänlig AI-kundtjänst på svenska. Svara kort, tydligt och hjälpsamt.";
  }
}

function slaMinutesForPriority(priority) {
  if (priority === "high") return 15;
  if (priority === "low") return 120;
  return 45;
}

async function createNewTicket(userId, companyId) {
  const t = new Ticket({ userId, companyId, messages: [] });

  // SLA due date based on default priority
  const mins = slaMinutesForPriority(t.priority);
  t.slaDueAt = new Date(Date.now() + mins * 60 * 1000);

  await t.save();
  return t;
}

/* =====================
   ✅ URL + PDF extraction
===================== */
async function fetchUrlText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (AI Kundtjanst Bot)",
      Accept: "text/html,application/xhtml+xml"
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

const requireAgent = async (req, res, next) => {
  const u = await User.findById(req.user?.id);
  if (!u || !["agent", "admin"].includes(u.role)) return res.status(403).json({ error: "Agent eller Admin krävs" });
  req.dbUser = u;
  next();
};

const requireAdmin = async (req, res, next) => {
  const u = await User.findById(req.user?.id);
  if (!u || u.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  req.dbUser = u;
  next();
};

/* =====================
   ✅ ROUTES
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
   ✅ CHAT
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
      ticket = await createNewTicket(req.user.id, companyId);
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
        (rag.used ? `\n\nIntern kunskapsdatabas:\n${rag.context}\n\nSvara tydligt och konkret.` : "")
    };

    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const reply = cleanText(response.choices?.[0]?.message?.content || "Inget svar från AI.");

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });

    if (!ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date();
    }

    ticket.lastActivityAt = new Date();
    await ticket.save();

    return res.json({
      reply,
      ticketId: ticket._id,
      ragUsed: rag.used,
      sources: rag.sources
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

/* =====================
   ✅ AGENT/ADMIN Inbox
===================== */
app.get("/admin/tickets", authenticate, requireAgent, async (req, res) => {
  try {
    const { status, companyId, assigned } = req.query || {};
    const query = {};

    if (status) query.status = status;
    if (companyId) query.companyId = companyId;

    // assigned = "me" | "unassigned"
    if (assigned === "me") query.assignedTo = req.user.id;
    if (assigned === "unassigned") query.assignedTo = null;

    const tickets = await Ticket.find(query).sort({ lastActivityAt: -1 }).limit(400).lean();

    const userIds = [...new Set(tickets.map((t) => String(t.userId)))];
    const users = await User.find({ _id: { $in: userIds } }).select("username").lean();
    const map = new Map(users.map((u) => [String(u._id), u.username]));

    const output = tickets.map((t) => ({
      ...t,
      username: map.get(String(t.userId)) || "okänd"
    }));

    return res.json(output);
  } catch (e) {
    console.error("❌ /admin/tickets error:", e);
    return res.status(500).json({ error: "Serverfel vid inbox" });
  }
});

app.get("/admin/tickets/:ticketId", authenticate, requireAgent, async (req, res) => {
  const t = await Ticket.findById(req.params.ticketId).lean();
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  const customer = await User.findById(t.userId).select("username").lean();
  const assigned = t.assignedTo ? await User.findById(t.assignedTo).select("username").lean() : null;

  return res.json({
    ...t,
    customerUsername: customer?.username || "okänd",
    assignedUsername: assigned?.username || ""
  });
});

app.post("/admin/tickets/:ticketId/status", authenticate, requireAgent, async (req, res) => {
  const { status } = req.body || {};
  if (!["open", "pending", "solved"].includes(status)) return res.status(400).json({ error: "Ogiltig status" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.status = status;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Status uppdaterad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/priority", authenticate, requireAgent, async (req, res) => {
  const { priority } = req.body || {};
  if (!["low", "normal", "high"].includes(priority)) return res.status(400).json({ error: "Ogiltig prioritet" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.priority = priority;

  // refresh SLA due date when priority changes
  const mins = slaMinutesForPriority(priority);
  t.slaDueAt = new Date(Date.now() + mins * 60 * 1000);

  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Prioritet sparad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/agent-reply", authenticate, requireAgent, async (req, res) => {
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

// ✅ Assign ticket to agent/admin
app.post("/admin/tickets/:ticketId/assign", authenticate, requireAgent, async (req, res) => {
  const { userId } = req.body || {}; // null = unassign
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  if (userId) {
    const u = await User.findById(userId);
    if (!u || !["agent", "admin"].includes(u.role)) return res.status(400).json({ error: "Kan bara assigna agent/admin" });
    t.assignedTo = u._id;
  } else {
    t.assignedTo = null;
  }

  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Assignment sparad ✅", ticket: t });
});

// ✅ Agent notes (internal)
app.post("/admin/tickets/:ticketId/notes", authenticate, requireAgent, async (req, res) => {
  const { notes } = req.body || {};
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.agentNotes = cleanText(notes || "");
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Notes sparade ✅", ticket: t });
});

/* =====================
   ✅ ADMIN: Dashboard
===================== */
app.get("/admin/dashboard", authenticate, requireAdmin, async (req, res) => {
  try {
    const [
      usersCount,
      ticketsCount,
      openCount,
      pendingCount,
      solvedCount,
      kbCount
    ] = await Promise.all([
      User.countDocuments({}),
      Ticket.countDocuments({}),
      Ticket.countDocuments({ status: "open" }),
      Ticket.countDocuments({ status: "pending" }),
      Ticket.countDocuments({ status: "solved" }),
      KBChunk.countDocuments({})
    ]);

    const byCompanyAgg = await Ticket.aggregate([
      { $group: { _id: "$companyId", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const byCompany = byCompanyAgg.map((x) => ({ companyId: x._id, count: x.count }));

    const latestTicketsRaw = await Ticket.find({}).sort({ lastActivityAt: -1 }).limit(12).lean();
    const latestUserIds = [...new Set(latestTicketsRaw.map((t) => String(t.userId)))];
    const latestUsers = await User.find({ _id: { $in: latestUserIds } }).select("username").lean();
    const map = new Map(latestUsers.map((u) => [String(u._id), u.username]));

    const latestTickets = latestTicketsRaw.map((t) => ({
      _id: t._id,
      title: t.title || "Inget ämne",
      companyId: t.companyId,
      status: t.status,
      priority: t.priority,
      lastActivityAt: t.lastActivityAt,
      username: map.get(String(t.userId)) || "okänd"
    }));

    // SLA overdue
    const overdueCount = await Ticket.countDocuments({
      status: { $in: ["open", "pending"] },
      slaDueAt: { $ne: null, $lt: new Date() }
    });

    return res.json({
      counts: {
        users: usersCount,
        tickets: ticketsCount,
        open: openCount,
        pending: pendingCount,
        solved: solvedCount,
        kbChunks: kbCount,
        slaOverdue: overdueCount
      },
      byCompany,
      latestTickets
    });
  } catch (e) {
    console.error("❌ Dashboard error:", e);
    return res.status(500).json({ error: "Serverfel vid dashboard" });
  }
});

/* =====================
   ✅ ADMIN: Users/roles/delete
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(2000);
  return res.json(users);
});

app.post("/admin/users/:userId/role", authenticate, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

  const targetId = req.params.userId;

  if (String(targetId) === String(req.user.id)) {
    return res.status(400).json({ error: "Du kan inte ändra din egen roll här." });
  }

  const u = await User.findById(targetId);
  if (!u) return res.status(404).json({ error: "User hittades inte" });

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

    if (u.role === "admin") {
      return res.status(400).json({ error: "Du kan inte ta bort en admin-användare." });
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
   ✅ KB
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 }).limit(500);
  return res.json(items);
});

app.delete("/kb/delete/:chunkId", authenticate, requireAdmin, async (req, res) => {
  await KBChunk.deleteOne({ _id: req.params.chunkId });
  return res.json({ message: "KB-rad borttagen ✅" });
});

app.delete("/kb/clear/:companyId", authenticate, requireAdmin, async (req, res) => {
  await KBChunk.deleteMany({ companyId: req.params.companyId });
  return res.json({ message: `KB rensad för ${req.params.companyId} ✅` });
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
   ✅ Export
===================== */
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
