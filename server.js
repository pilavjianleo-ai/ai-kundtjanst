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

const app = express();

/**
 * ✅ Render / proxies:
 * express-rate-limit kräver trust proxy när X-Forwarded-For finns
 */
app.set("trust proxy", 1);

app.use(express.json({ limit: "2mb" }));
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

if (!mongoUri) {
  console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i Render env.");
}

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
  role: { type: String, default: "user" }, // ✅ admin | user
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

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

  title: { type: String, default: "" }, // optional summary
  messages: [messageSchema],

  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const Ticket = mongoose.model("Ticket", ticketSchema);

/**
 * ✅ Knowledge Base (minimal)
 * Vi sparar content och metadata. (RAG kan byggas vidare)
 */
const kbItemSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  title: { type: String, default: "" },
  sourceType: { type: String, required: true }, // url | text | pdf
  sourceRef: { type: String, default: "" }, // url or filename
  content: { type: String, default: "" }, // extracted/cleaned text
  embeddingOk: { type: Boolean, default: false }, // placeholder
  createdAt: { type: Date, default: Date.now },
});
const KBItem = mongoose.model("KBItem", kbItemSchema);

const feedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String,
  companyId: String,
  createdAt: { type: Date, default: Date.now },
});
const Feedback = mongoose.model("Feedback", feedbackSchema);

/* =====================
   ✅ OpenAI
===================== */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================
   ✅ Auth middleware
===================== */
const authenticate = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Ogiltig token" });
  }
};

const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin krävs" });
    }
    next();
  } catch (e) {
    return res.status(403).json({ error: "Admin krävs" });
  }
};

/* =====================
   ✅ Rate limit
===================== */
const limiterChat = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "För många requests. Försök igen senare.",
});

const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "För många försök. Vänta en stund.",
});

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);

/* =====================
   ✅ System prompt
===================== */
function getSystemPrompt(companyId) {
  switch (companyId) {
    case "law":
      return "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmänna råd (inte juridisk rådgivning). Var tydlig, praktisk, och hänvisa att kontakta jurist vid tvekan.";
    case "tech":
      return "Du är en AI-kundtjänst för teknisk support inom IT och programmering på svenska. Felsök stegvis, förklara enkelt, ge tydliga instruktioner.";
    case "cleaning":
      return "Du är en AI-kundtjänst för städservice på svenska. Hjälp med bokningar, priser, rutiner, tips och säkerhet.";
    default:
      return "Du är en professionell och vänlig AI-kundtjänst på svenska. Var hjälpsam och konkret.";
  }
}

/* =====================
   ✅ Helpers
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureTicket(userId, companyId) {
  let t = await Ticket.findOne({ userId, companyId, status: { $ne: "solved" } }).sort({ lastActivityAt: -1 });
  if (!t) {
    t = new Ticket({
      userId,
      companyId,
      status: "open",
      priority: "normal",
      messages: [],
    });
    await t.save();
  }
  return t;
}

/**
 * ✅ Very simple "RAG-like" helper:
 * Här gör vi inte vector-sök ännu, men vi kan plocka fram senaste KBItem-text och lägga som context.
 * (Stabilt + utan extra kostnad)
 */
async function getKbContext(companyId) {
  const items = await KBItem.find({ companyId }).sort({ createdAt: -1 }).limit(3);
  if (!items.length) return { context: "", sources: [] };

  const sources = items.map((it) => ({
    id: it._id.toString(),
    title: it.title || it.sourceRef || "KB källa",
    sourceType: it.sourceType,
    sourceRef: it.sourceRef,
  }));

  const context = items
    .map((it, idx) => `KÄLLA ${idx + 1}: ${it.title || it.sourceRef || "KB"}\n${(it.content || "").slice(0, 1500)}`)
    .join("\n\n");

  return { context, sources };
}

/* =====================
   ✅ Routes
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

/* =====================
   ✅ AUTH
===================== */
app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await new User({ username, password: hashedPassword }).save();
    return res.json({ message: "Registrering lyckades", user: { id: user._id, username: user.username, role: user.role } });
  } catch {
    return res.status(400).json({ error: "Användarnamn upptaget" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const token = jwt.sign({ id: user._id, username, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  return res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
});

/* =====================
   ✅ Ticket endpoints
===================== */

/**
 * ✅ List my tickets
 */
app.get("/tickets", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ lastActivityAt: -1 }).limit(50);
  return res.json(tickets);
});

/**
 * ✅ Get ticket messages
 */
app.get("/tickets/:ticketId", authenticate, async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.ticketId, userId: req.user.id });
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

/**
 * ✅ Create new ticket (manual)
 */
app.post("/tickets", authenticate, async (req, res) => {
  const { companyId, title } = req.body || {};
  if (!companyId) return res.status(400).json({ error: "companyId saknas" });

  const t = await new Ticket({
    userId: req.user.id,
    companyId,
    title: title || "",
    status: "open",
    priority: "normal",
    messages: [],
    lastActivityAt: new Date(),
  }).save();

  return res.json({ message: "Ticket skapad", ticket: t });
});

/**
 * ✅ Update ticket status (owner)
 */
app.patch("/tickets/:ticketId/status", authenticate, async (req, res) => {
  const { status } = req.body || {};
  const allowed = ["open", "pending", "solved"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Ogiltig status" });

  const t = await Ticket.findOne({ _id: req.params.ticketId, userId: req.user.id });
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.status = status;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Uppdaterad", ticket: t });
});

/* =====================
   ✅ Chat with tickets
===================== */
app.post("/chat", authenticate, async (req, res) => {
  try {
    const { companyId, conversation, ticketId } = req.body || {};
    if (!companyId || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "companyId eller konversation saknas" });
    }

    // ✅ Ticket handling:
    let ticket;
    if (ticketId) {
      ticket = await Ticket.findOne({ _id: ticketId, userId: req.user.id });
      if (!ticket) return res.status(404).json({ error: "Ticket hittades inte" });
    } else {
      ticket = await ensureTicket(req.user.id, companyId);
    }

    // ✅ Add user message into ticket
    const lastUser = conversation[conversation.length - 1];
    if (lastUser?.role === "user") {
      ticket.messages.push({ role: "user", content: cleanText(lastUser.content), timestamp: new Date() });
      ticket.lastActivityAt = new Date();
      await ticket.save();
    }

    // ✅ KB context (cheap/simple)
    const { context: kbContext, sources } = await getKbContext(companyId);

    const systemMessage = {
      role: "system",
      content:
        getSystemPrompt(companyId) +
        (kbContext
          ? `\n\nHär är intern kunskapsdatabas (använd som fakta om relevant):\n${kbContext}\n\nOm källorna inte hjälper, svara normalt.`
          : ""),
    };

    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const replyRaw = response.choices?.[0]?.message?.content || "Inget svar från AI.";
    const reply = cleanText(replyRaw);

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    ticket.lastActivityAt = new Date();

    // optional: auto-title from first message
    if (!ticket.title && ticket.messages.length >= 2) {
      const first = ticket.messages.find((m) => m.role === "user")?.content || "";
      ticket.title = first.slice(0, 60);
    }

    await ticket.save();

    return res.json({
      reply,
      ticketId: ticket._id,
      ragUsed: sources.length > 0,
      sources,
    });
  } catch (error) {
    console.error("❌ AI-fel:", error?.message || error);
    return res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

/* =====================
   ✅ History (per category)
===================== */
app.get("/history/:companyId", authenticate, async (req, res) => {
  // legacy support: return the latest open ticket messages for this category
  const t = await Ticket.findOne({ userId: req.user.id, companyId: req.params.companyId, status: { $ne: "solved" } }).sort({ lastActivityAt: -1 });
  return res.json(t ? t.messages : []);
});

/* =====================
   ✅ Feedback
===================== */
app.post("/feedback", authenticate, async (req, res) => {
  const { type, companyId } = req.body || {};
  await new Feedback({ userId: req.user.id, type, companyId }).save();
  return res.json({ message: "Tack för feedback!" });
});

/* =====================
   ✅ ADMIN: Tickets
===================== */
app.get("/admin/tickets", authenticate, requireAdmin, async (req, res) => {
  const tickets = await Ticket.find({}).sort({ lastActivityAt: -1 }).limit(100);
  return res.json(tickets);
});

app.get("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

/**
 * ✅ Agent takeover: Admin skriver ett meddelande som agent
 */
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

/**
 * ✅ Admin: Update ticket status/priority
 */
app.patch("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  const { status, priority } = req.body || {};
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  if (status && ["open", "pending", "solved"].includes(status)) t.status = status;
  if (priority && ["low", "normal", "high"].includes(priority)) t.priority = priority;

  t.lastActivityAt = new Date();
  await t.save();
  return res.json({ message: "Uppdaterad", ticket: t });
});

/* =====================
   ✅ KB endpoints (Admin)
   (OBS: URL/PDF parsing hålls enkel här för stabilitet)
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBItem.find({ companyId: req.params.companyId }).sort({ createdAt: -1 }).limit(200);
  return res.json(items);
});

app.delete("/kb/item/:id", authenticate, requireAdmin, async (req, res) => {
  await KBItem.deleteOne({ _id: req.params.id });
  return res.json({ message: "Borttagen" });
});

app.post("/kb/upload-text", authenticate, requireAdmin, async (req, res) => {
  const { companyId, title, content } = req.body || {};
  if (!companyId || !content) return res.status(400).json({ error: "companyId eller content saknas" });

  await new KBItem({
    companyId,
    title: title || "Text",
    sourceType: "text",
    sourceRef: "manual",
    content: cleanText(content),
    embeddingOk: true,
  }).save();

  return res.json({ message: "Text sparad i kunskapsdatabasen ✅" });
});

/**
 * ✅ URL upload (safe fallback)
 * Vi försöker INTE hämta URL på servern just nu (kan kräva extra lib + CORS/robots/etc).
 * Istället sparar vi själva URL:en och ber admin klistra in text om behövs.
 */
app.post("/kb/upload-url", authenticate, requireAdmin, async (req, res) => {
  const { companyId, url } = req.body || {};
  if (!companyId || !url) return res.status(400).json({ error: "companyId eller url saknas" });

  await new KBItem({
    companyId,
    title: "URL",
    sourceType: "url",
    sourceRef: url,
    content: `URL sparad: ${url}\n\nTips: Om du vill ha bättre RAG, klistra in texten från sidan som 'Text'.`,
    embeddingOk: false,
  }).save();

  return res.json({
    message: "URL sparad ✅ (tips: klistra in text för bästa RAG)",
  });
});

/**
 * ✅ PDF upload stub:
 * För att hålla allt stabilt utan extra PDF-parser i Render,
 * sparar vi en placeholder. (Du kan senare lägga till pdf-parse.)
 */
app.post("/kb/upload-pdf", authenticate, requireAdmin, async (req, res) => {
  return res.status(501).json({
    error: "PDF-upload är avstängd i denna version (för stabilitet). Använd Text istället tills vi kopplar pdf-parse.",
  });
});

/* =====================
   ✅ Export endpoints (Admin)
===================== */
app.get("/export/kb/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBItem.find({ companyId: req.params.companyId }).sort({ createdAt: -1 });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="kb_${req.params.companyId}.json"`);
  return res.send(JSON.stringify(items, null, 2));
});

app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password");
  const tickets = await Ticket.find({});
  const kb = await KBItem.find({});
  const feedback = await Feedback.find({});

  const payload = { users, tickets, kb, feedback, exportedAt: new Date().toISOString() };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="export_all.json"`);
  return res.send(JSON.stringify(payload, null, 2));
});

/* =====================
   ✅ Start
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
