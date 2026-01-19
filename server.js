/*************************************************
 * ✅ server.js – Full backend (Express + Mongo)
 * - Auth (login/register/me)
 * - Tickets (chat + my tickets + admin inbox)
 * - Knowledge Base (text/url/pdf)
 * - Categories (admin CRUD)
 * - Export (all / training / kb)
 * - ✅ SLA Dashboard (overview / agents / tickets)
 * - ✅ SLA Delete stats (own / all)
 * - ✅ Customer reply via "Mina ärenden"
 *************************************************/

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());

/*************************************************
 * ✅ ENV
 *************************************************/
const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/ai_support";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/*************************************************
 * ✅ Connect Mongo
 *************************************************/
mongoose
  .connect(MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((e) => console.error("❌ MongoDB error:", e));

/*************************************************
 * ✅ Models
 *************************************************/
const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true },
    passwordHash: String,
    email: { type: String, default: "" },
    role: { type: String, default: "user" }, // user | agent | admin
  },
  { timestamps: true }
);

const ticketMessageSchema = new mongoose.Schema(
  {
    role: { type: String, required: true }, // user | assistant | agent
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const internalNoteSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    companyId: { type: String, default: "demo" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, default: "" },
    status: { type: String, default: "open" }, // open | pending | solved
    priority: { type: String, default: "normal" }, // low | normal | high

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    messages: { type: [ticketMessageSchema], default: [] },
    internalNotes: { type: [internalNoteSchema], default: [] },

    lastActivityAt: { type: Date, default: Date.now },

    // ✅ SLA fields (timestamps used for stats)
    sla: {
      firstResponseAt: { type: Date, default: null },
      resolvedAt: { type: Date, default: null },

      breachedFirstResponse: { type: Boolean, default: false },
      breachedResolution: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// KB items
const kbSchema = new mongoose.Schema(
  {
    companyId: { type: String, default: "demo" },
    type: { type: String, default: "text" }, // text | url | pdf
    title: { type: String, default: "" },
    content: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  { timestamps: true }
);

// Categories
const categorySchema = new mongoose.Schema(
  {
    key: { type: String, unique: true },
    name: { type: String, default: "" },
    prompt: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Ticket = mongoose.model("Ticket", ticketSchema);
const KBItem = mongoose.model("KBItem", kbSchema);
const Category = mongoose.model("Category", categorySchema);

/*************************************************
 * ✅ Uploads (PDF)
 *************************************************/
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

/*************************************************
 * ✅ Helpers
 *************************************************/
function signToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function safeStr(x) {
  return String(x || "");
}

function now() {
  return new Date();
}

function clampDays(v, fallback = 30) {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  if (n < 1) return 1;
  if (n > 365) return 365;
  return Math.floor(n);
}

// ✅ SLA rules (ms)
// You can tweak these later
const SLA_RULES = {
  firstResponse: {
    low: 8 * 60 * 60 * 1000,
    normal: 4 * 60 * 60 * 1000,
    high: 60 * 60 * 1000,
  },
  resolution: {
    low: 7 * 24 * 60 * 60 * 1000,
    normal: 3 * 24 * 60 * 60 * 1000,
    high: 24 * 60 * 60 * 1000,
  },
};

function getSlaThreshold(priority = "normal") {
  const p = ["low", "normal", "high"].includes(priority) ? priority : "normal";
  return {
    firstMs: SLA_RULES.firstResponse[p],
    resMs: SLA_RULES.resolution[p],
  };
}

/*************************************************
 * ✅ Auth middleware
 *************************************************/
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Not authorized" });

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Not authorized" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  next();
}

function requireAgentOrAdmin(req, res, next) {
  if (!["admin", "agent"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/*************************************************
 * ✅ Seed default categories (if none exist)
 *************************************************/
async function seedDefaults() {
  const count = await Category.countDocuments();
  if (count > 0) return;

  await Category.insertMany([
    {
      key: "demo",
      name: "Demo AB",
      prompt: "Du är en hjälpsam kundtjänst-AI för Demo AB.",
    },
    {
      key: "law",
      name: "Juridik",
      prompt: "Du ger allmän vägledning. Inte juridisk rådgivning.",
    },
    {
      key: "tech",
      name: "Teknisk support",
      prompt: "Du hjälper till med felsökning och IT.",
    },
    {
      key: "cleaning",
      name: "Städservice",
      prompt: "Du hjälper kunder med städfrågor.",
    },
  ]);

  console.log("✅ Seeded default categories");
}
seedDefaults();

/*************************************************
 * ✅ Public ping
 *************************************************/
app.get("/", (req, res) => {
  res.send("✅ API OK");
});

/*************************************************
 * ✅ Auth endpoints
 *************************************************/
app.post("/register", async (req, res) => {
  try {
    const username = safeStr(req.body.username).trim();
    const password = safeStr(req.body.password).trim();
    const email = safeStr(req.body.email).trim();

    if (!username || !password) return res.status(400).json({ error: "username + password krävs" });

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: "Användarnamn finns redan" });

    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ username, passwordHash, email, role: "user" });

    return res.json({ message: "Registrering klar ✅ Logga in nu." });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid register" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const username = safeStr(req.body.username).trim();
    const password = safeStr(req.body.password).trim();

    if (!username || !password) return res.status(400).json({ error: "username + password krävs" });

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Fel login" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Fel login" });

    const token = signToken(user);
    res.json({ token });
  } catch {
    res.status(500).json({ error: "Serverfel vid login" });
  }
});

app.get("/me", requireAuth, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).lean();
    if (!u) return res.status(401).json({ error: "Not authorized" });

    res.json({ id: u._id, username: u.username, role: u.role, email: u.email || "" });
  } catch {
    res.status(401).json({ error: "Not authorized" });
  }
});

app.post("/auth/change-username", requireAuth, async (req, res) => {
  try {
    const newUsername = safeStr(req.body.newUsername).trim();
    if (!newUsername) return res.status(400).json({ error: "Skriv nytt användarnamn" });

    const exists = await User.findOne({ username: newUsername });
    if (exists) return res.status(400).json({ error: "Användarnamn finns redan" });

    await User.findByIdAndUpdate(req.user.id, { username: newUsername });
    return res.json({ message: "Användarnamn uppdaterat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/auth/change-password", requireAuth, async (req, res) => {
  try {
    const currentPassword = safeStr(req.body.currentPassword).trim();
    const newPassword = safeStr(req.body.newPassword).trim();

    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Fyll i båda" });

    const u = await User.findById(req.user.id);
    if (!u) return res.status(400).json({ error: "User finns ej" });

    const ok = await bcrypt.compare(currentPassword, u.passwordHash);
    if (!ok) return res.status(400).json({ error: "Fel nuvarande lösenord" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.user.id, { passwordHash });

    return res.json({ message: "Lösenord uppdaterat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ Forgot/Reset (demo-simple)
 * - In production: send mail + secure token storage
 *************************************************/
app.post("/auth/forgot-password", async (req, res) => {
  try {
    const email = safeStr(req.body.email).trim();
    if (!email) return res.status(400).json({ error: "Email saknas" });

    // Demo: pretend we sent email
    return res.json({ message: "Återställningslänk skickad ✅ (demo)" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/auth/reset-password", async (req, res) => {
  try {
    const resetToken = safeStr(req.body.resetToken).trim();
    const newPassword = safeStr(req.body.newPassword).trim();
    if (!resetToken || !newPassword) return res.status(400).json({ error: "Saknar token/lösen" });

    // Demo: pretend reset works
    return res.json({ message: "Reset klar ✅ (demo)" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ Categories
 *************************************************/
app.get("/categories", async (req, res) => {
  const cats = await Category.find().sort({ key: 1 }).lean();
  res.json(cats.map((c) => ({ key: c.key, name: c.name, prompt: c.prompt })));
});

app.post("/admin/categories", requireAuth, requireAdmin, async (req, res) => {
  try {
    const key = safeStr(req.body.key).trim();
    const name = safeStr(req.body.name).trim();
    const prompt = safeStr(req.body.prompt).trim();

    if (!key || !name || !prompt) return res.status(400).json({ error: "key + name + prompt krävs" });

    const exists = await Category.findOne({ key });
    if (exists) return res.status(400).json({ error: "Kategori finns redan" });

    await Category.create({ key, name, prompt });
    return res.json({ message: "Kategori skapad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid kategori" });
  }
});

app.delete("/admin/categories/:key", requireAuth, requireAdmin, async (req, res) => {
  try {
    const key = safeStr(req.params.key).trim();
    if (!key) return res.status(400).json({ error: "Key saknas" });

    await Category.deleteOne({ key });
    return res.json({ message: "Kategori borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ Knowledge Base
 *************************************************/
app.get("/kb/list/:companyId", requireAuth, requireAdmin, async (req, res) => {
  const companyId = safeStr(req.params.companyId || "demo");
  const items = await KBItem.find({ companyId }).sort({ createdAt: -1 }).lean();
  res.json(items);
});

app.post("/kb/upload-text", requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = safeStr(req.body.companyId || "demo");
    const title = safeStr(req.body.title).trim();
    const content = safeStr(req.body.content).trim();

    if (!title || !content) return res.status(400).json({ error: "Titel + text krävs" });

    await KBItem.create({ companyId, type: "text", title, content });
    return res.json({ message: "Text uppladdad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/kb/upload-url", requireAuth, requireAdmin, async (req, res) => {
  try {
    const companyId = safeStr(req.body.companyId || "demo");
    const url = safeStr(req.body.url).trim();
    if (!url) return res.status(400).json({ error: "URL saknas" });

    await KBItem.create({ companyId, type: "url", title: url, url });
    return res.json({ message: "URL uppladdad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/kb/upload-pdf", requireAuth, requireAdmin, upload.single("file"), async (req, res) => {
  try {
    const companyId = safeStr(req.body.companyId || "demo");
    const file = req.file;

    if (!file) return res.status(400).json({ error: "Ingen fil" });

    await KBItem.create({
      companyId,
      type: "pdf",
      title: file.originalname || "PDF",
      content: `PDF uploaded: ${file.filename}`,
    });

    return res.json({ message: "PDF uppladdad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid PDF" });
  }
});

/*************************************************
 * ✅ Export endpoints (simple JSON export)
 *************************************************/
app.get("/admin/export/all", requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find().lean();
  const tickets = await Ticket.find().lean();
  const categories = await Category.find().lean();
  const kb = await KBItem.find().lean();

  res.json({ users, tickets, categories, kb });
});

app.get("/admin/export/training", requireAuth, requireAdmin, async (req, res) => {
  const tickets = await Ticket.find().lean();
  const training = tickets.map((t) => ({
    companyId: t.companyId,
    title: t.title,
    messages: t.messages,
  }));

  res.json({ training });
});

app.get("/export/kb/:companyId", requireAuth, requireAdmin, async (req, res) => {
  const companyId = safeStr(req.params.companyId || "demo");
  const kb = await KBItem.find({ companyId }).lean();
  res.json({ companyId, kb });
});

/*************************************************
 * ✅ Feedback
 *************************************************/
app.post("/feedback", requireAuth, async (req, res) => {
  // demo placeholder
  res.json({ message: "Feedback skickad ✅" });
});

/*************************************************
 * ✅ Tickets
 *************************************************/
app.get("/my/tickets", requireAuth, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id })
    .sort({ lastActivityAt: -1 })
    .lean();

  res.json(
    tickets.map((t) => ({
      _id: t._id,
      companyId: t.companyId,
      title: t.title,
      status: t.status,
      priority: t.priority,
      lastActivityAt: t.lastActivityAt,
    }))
  );
});

app.get("/my/tickets/:id", requireAuth, async (req, res) => {
  const id = safeStr(req.params.id);

  const t = await Ticket.findOne({ _id: id, userId: req.user.id }).lean();
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  res.json(t);
});

/*************************************************
 * ✅ Customer reply from "Mina ärenden"
 * - This allows continuing conversation
 *************************************************/
app.post("/my/tickets/:id/reply", requireAuth, async (req, res) => {
  try {
    const id = safeStr(req.params.id);
    const content = safeStr(req.body.content).trim();
    if (!content) return res.status(400).json({ error: "Tomt meddelande" });

    const t = await Ticket.findOne({ _id: id, userId: req.user.id });
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    t.messages.push({ role: "user", content, timestamp: now() });
    t.lastActivityAt = now();
    if (!t.title) t.title = content.slice(0, 48);

    await t.save();

    // Optional: could trigger AI response immediately
    // But we keep it simple: user message saved
    res.json({ message: "Meddelande skickat ✅" });
  } catch {
    res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ Admin tickets inbox
 *************************************************/
app.get("/admin/tickets", requireAuth, requireAgentOrAdmin, async (req, res) => {
  const { status, companyId } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (companyId) filter.companyId = companyId;

  // ✅ Agent should only see assigned-to tickets if they are agent (not admin)
  if (req.user.role === "agent") {
    filter.assignedTo = req.user.id;
  }

  const tickets = await Ticket.find(filter).sort({ lastActivityAt: -1 }).lean();
  res.json(tickets);
});

app.get("/admin/tickets/:id", requireAuth, requireAgentOrAdmin, async (req, res) => {
  const id = safeStr(req.params.id);

  const filter = { _id: id };

  // Agent can only open tickets assigned to them
  if (req.user.role === "agent") filter.assignedTo = req.user.id;

  const t = await Ticket.findOne(filter).lean();
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  res.json(t);
});

app.post("/admin/tickets/:id/status", requireAuth, requireAgentOrAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  const status = safeStr(req.body.status || "open");

  const filter = { _id: id };
  if (req.user.role === "agent") filter.assignedTo = req.user.id;

  const t = await Ticket.findOne(filter);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.status = status;
  t.lastActivityAt = now();

  // ✅ Set resolvedAt when solved
  if (status === "solved") {
    if (!t.sla.resolvedAt) t.sla.resolvedAt = now();
  }

  await t.save();
  res.json({ message: "Status sparad ✅" });
});

app.post("/admin/tickets/:id/priority", requireAuth, requireAgentOrAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  const priority = safeStr(req.body.priority || "normal");

  const filter = { _id: id };
  if (req.user.role === "agent") filter.assignedTo = req.user.id;

  const t = await Ticket.findOne(filter);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.priority = priority;
  t.lastActivityAt = now();
  await t.save();
  res.json({ message: "Prioritet sparad ✅" });
});

app.post("/admin/tickets/:id/agent-reply", requireAuth, requireAgentOrAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  const content = safeStr(req.body.content).trim();
  if (!content) return res.status(400).json({ error: "Tomt svar" });

  const filter = { _id: id };
  if (req.user.role === "agent") filter.assignedTo = req.user.id;

  const t = await Ticket.findOne(filter);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.messages.push({ role: "agent", content, timestamp: now() });
  t.lastActivityAt = now();

  // ✅ SLA: first response time set when agent replies first time
  if (!t.sla.firstResponseAt) t.sla.firstResponseAt = now();

  await updateSlaFlags(t);
  await t.save();

  res.json({ message: "Svar skickat ✅" });
});

app.post("/admin/tickets/:id/internal-note", requireAuth, requireAgentOrAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  const content = safeStr(req.body.content).trim();
  if (!content) return res.status(400).json({ error: "Tom note" });

  const filter = { _id: id };
  if (req.user.role === "agent") filter.assignedTo = req.user.id;

  const t = await Ticket.findOne(filter);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.internalNotes.push({ content, createdAt: now(), createdBy: req.user.id });
  t.lastActivityAt = now();
  await t.save();

  res.json({ message: "Intern note sparad ✅" });
});

app.delete(
  "/admin/tickets/:ticketId/internal-note/:noteId",
  requireAuth,
  requireAgentOrAdmin,
  async (req, res) => {
    const ticketId = safeStr(req.params.ticketId);
    const noteId = safeStr(req.params.noteId);

    const filter = { _id: ticketId };
    if (req.user.role === "agent") filter.assignedTo = req.user.id;

    const t = await Ticket.findOne(filter);
    if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

    t.internalNotes = (t.internalNotes || []).filter((n) => String(n._id) !== String(noteId));
    await t.save();

    res.json({ message: "Notering borttagen ✅" });
  }
);

app.delete("/admin/tickets/:ticketId/internal-notes", requireAuth, requireAgentOrAdmin, async (req, res) => {
  const ticketId = safeStr(req.params.ticketId);

  const filter = { _id: ticketId };
  if (req.user.role === "agent") filter.assignedTo = req.user.id;

  const t = await Ticket.findOne(filter);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.internalNotes = [];
  await t.save();

  res.json({ message: "Alla notes borttagna ✅" });
});

app.post("/admin/tickets/:id/assign", requireAuth, requireAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  const userId = safeStr(req.body.userId);

  const t = await Ticket.findById(id);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.assignedTo = userId || null;
  await t.save();

  res.json({ message: "Ticket assignad ✅" });
});

app.delete("/admin/tickets/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  await Ticket.deleteOne({ _id: id });
  res.json({ message: "Ticket borttagen ✅" });
});

app.post("/admin/tickets/solve-all", requireAuth, requireAdmin, async (req, res) => {
  await Ticket.updateMany({ status: { $in: ["open", "pending"] } }, { status: "solved", "sla.resolvedAt": now() });
  res.json({ message: "Alla tickets markerade som solved ✅" });
});

app.post("/admin/tickets/remove-solved", requireAuth, requireAdmin, async (req, res) => {
  await Ticket.deleteMany({ status: "solved" });
  res.json({ message: "Alla solved tickets borttagna ✅" });
});

/*************************************************
 * ✅ Chat endpoint (AI simulation)
 * - Creates ticket if needed
 *************************************************/
app.post("/chat", requireAuth, async (req, res) => {
  try {
    const companyId = safeStr(req.body.companyId || "demo");
    const conversation = Array.isArray(req.body.conversation) ? req.body.conversation : [];
    const incomingTicketId = req.body.ticketId ? safeStr(req.body.ticketId) : null;

    let ticket = null;

    if (incomingTicketId) {
      ticket = await Ticket.findOne({ _id: incomingTicketId, userId: req.user.id });
      if (!ticket) return res.status(404).json({ error: "Ticket hittades inte" });
    }

    // Create ticket if new
    if (!ticket) {
      const firstUserMsg = conversation.find((m) => m.role === "user")?.content || "Ärende";
      ticket = await Ticket.create({
        companyId,
        userId: req.user.id,
        title: safeStr(firstUserMsg).slice(0, 48),
        status: "open",
        priority: "normal",
        messages: [],
        lastActivityAt: now(),
      });
    }

    // Save user messages
    const last = conversation[conversation.length - 1];
    if (last && last.role === "user") {
      ticket.messages.push({ role: "user", content: safeStr(last.content), timestamp: now() });
      ticket.lastActivityAt = now();
    }

    // Simulated AI reply
    const reply = `✅ Jag tog emot ditt meddelande:\n"${safeStr(last?.content)}"\n\nVill du att en agent ska svara eller ska jag hjälpa direkt?`;

    ticket.messages.push({ role: "assistant", content: reply, timestamp: now() });
    ticket.lastActivityAt = now();

    // ✅ SLA: if assistant "answers", count as first response
    if (!ticket.sla.firstResponseAt) ticket.sla.firstResponseAt = now();

    await updateSlaFlags(ticket);
    await ticket.save();

    res.json({
      ticketId: ticket._id,
      reply,
      ragUsed: false,
    });
  } catch (e) {
    res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/*************************************************
 * ✅ SLA helpers + endpoints
 *************************************************/
async function updateSlaFlags(ticketDoc) {
  const t = ticketDoc;
  const createdAt = t.createdAt ? new Date(t.createdAt).getTime() : Date.now();
  const prio = t.priority || "normal";
  const { firstMs, resMs } = getSlaThreshold(prio);

  // First response SLA
  if (t.sla?.firstResponseAt) {
    const firstAt = new Date(t.sla.firstResponseAt).getTime();
    const diff = firstAt - createdAt;
    t.sla.breachedFirstResponse = diff > firstMs;
  }

  // Resolution SLA
  if (t.sla?.resolvedAt) {
    const resAt = new Date(t.sla.resolvedAt).getTime();
    const diff = resAt - createdAt;
    t.sla.breachedResolution = diff > resMs;
  }
}

// ✅ ADMIN + AGENT – overview
app.get("/admin/sla/overview", requireAuth, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = clampDays(req.query.days, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const filter = { createdAt: { $gte: since } };

    // Agent sees only assigned tickets
    if (req.user.role === "agent") {
      filter.assignedTo = req.user.id;
    }

    const tickets = await Ticket.find(filter).lean();

    const totalTickets = tickets.length;
    const byPriority = { low: 0, normal: 0, high: 0 };

    const firstRespMsArr = [];
    const resMsArr = [];

    let firstBreaches = 0;
    let resBreaches = 0;

    tickets.forEach((t) => {
      const pr = t.priority || "normal";
      if (byPriority[pr] != null) byPriority[pr]++;

      const created = new Date(t.createdAt).getTime();

      // first response
      if (t.sla?.firstResponseAt) {
        const ms = new Date(t.sla.firstResponseAt).getTime() - created;
        firstRespMsArr.push(ms);

        if (t.sla.breachedFirstResponse) firstBreaches++;
      }

      // resolution
      if (t.sla?.resolvedAt) {
        const ms = new Date(t.sla.resolvedAt).getTime() - created;
        resMsArr.push(ms);

        if (t.sla.breachedResolution) resBreaches++;
      }
    });

    const avg = (arr) => {
      if (!arr.length) return null;
      return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    };

    const firstAvg = avg(firstRespMsArr);
    const resAvg = avg(resMsArr);

    const firstCompliancePct =
      totalTickets === 0 ? null : Math.round(((totalTickets - firstBreaches) / totalTickets) * 100);

    const resCompliancePct =
      totalTickets === 0 ? null : Math.round(((totalTickets - resBreaches) / totalTickets) * 100);

    return res.json({
      totalTickets,
      byPriority,
      firstResponse: {
        avgMs: firstAvg,
        breaches: firstBreaches,
        compliancePct: firstCompliancePct,
      },
      resolution: {
        avgMs: resAvg,
        breaches: resBreaches,
        compliancePct: resCompliancePct,
      },
    });
  } catch {
    res.status(500).json({ error: "SLA overview error" });
  }
});

// ✅ Admin: agent stats (agents list)
app.get("/admin/sla/agents", requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = clampDays(req.query.days, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const agents = await User.find({ role: { $in: ["admin", "agent"] } }).lean();

    const rows = [];

    for (const a of agents) {
      const tickets = await Ticket.find({
        createdAt: { $gte: since },
        assignedTo: a._id,
      }).lean();

      const total = tickets.length;
      let firstBreaches = 0;
      let resBreaches = 0;

      const firstArr = [];
      const resArr = [];

      tickets.forEach((t) => {
        const created = new Date(t.createdAt).getTime();
        if (t.sla?.firstResponseAt) {
          firstArr.push(new Date(t.sla.firstResponseAt).getTime() - created);
          if (t.sla.breachedFirstResponse) firstBreaches++;
        }
        if (t.sla?.resolvedAt) {
          resArr.push(new Date(t.sla.resolvedAt).getTime() - created);
          if (t.sla.breachedResolution) resBreaches++;
        }
      });

      const avg = (arr) => (arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null);

      rows.push({
        userId: a._id,
        username: a.username,
        role: a.role,
        tickets: total,
        firstResponse: {
          avgMs: avg(firstArr),
          compliancePct: total ? Math.round(((total - firstBreaches) / total) * 100) : null,
        },
        resolution: {
          avgMs: avg(resArr),
          compliancePct: total ? Math.round(((total - resBreaches) / total) * 100) : null,
        },
      });
    }

    res.json({ rows });
  } catch {
    res.status(500).json({ error: "SLA agents error" });
  }
});

// ✅ Tickets SLA table (admin = all, agent = own)
app.get("/admin/sla/tickets", requireAuth, requireAgentOrAdmin, async (req, res) => {
  try {
    const days = clampDays(req.query.days, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const filter = { createdAt: { $gte: since } };
    if (req.user.role === "agent") filter.assignedTo = req.user.id;

    const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).lean();

    const rows = tickets.map((t) => {
      const created = new Date(t.createdAt).getTime();
      const first = t.sla?.firstResponseAt ? new Date(t.sla.firstResponseAt).getTime() - created : null;
      const reso = t.sla?.resolvedAt ? new Date(t.sla.resolvedAt).getTime() - created : null;

      return {
        ticketId: t._id,
        companyId: t.companyId,
        status: t.status,
        priority: t.priority,
        sla: {
          firstResponseMs: first,
          resolutionMs: reso,
          breachedFirstResponse: !!t.sla?.breachedFirstResponse,
          breachedResolution: !!t.sla?.breachedResolution,
        },
      };
    });

    res.json({ rows });
  } catch {
    res.status(500).json({ error: "SLA tickets error" });
  }
});

/*************************************************
 * ✅ SLA Delete statistics
 * - Individual (agent own)
 * - All (admin only)
 *************************************************/

// Agent/Admin: delete OWN SLA stamps for tickets assigned to them
app.delete("/admin/sla/clear-own", requireAuth, requireAgentOrAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === "agent") {
      filter.assignedTo = req.user.id;
    } else {
      // admin "own" means tickets assigned to admin user
      filter.assignedTo = req.user.id;
    }

    const result = await Ticket.updateMany(filter, {
      $set: {
        "sla.firstResponseAt": null,
        "sla.resolvedAt": null,
        "sla.breachedFirstResponse": false,
        "sla.breachedResolution": false,
      },
    });

    res.json({ message: "Din SLA-statistik raderad ✅", modified: result.modifiedCount || 0 });
  } catch {
    res.status(500).json({ error: "Kunde inte radera egen statistik" });
  }
});

// Admin: delete ALL SLA stamps for all tickets
app.delete("/admin/sla/clear-all", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await Ticket.updateMany(
      {},
      {
        $set: {
          "sla.firstResponseAt": null,
          "sla.resolvedAt": null,
          "sla.breachedFirstResponse": false,
          "sla.breachedResolution": false,
        },
      }
    );

    res.json({ message: "ALL SLA-statistik raderad ✅", modified: result.modifiedCount || 0 });
  } catch {
    res.status(500).json({ error: "Kunde inte radera ALL statistik" });
  }
});

/*************************************************
 * ✅ Admin Users
 *************************************************/
app.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  res.json(users.map((u) => ({ _id: u._id, username: u.username, role: u.role, email: u.email || "" })));
});

app.post("/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  const role = safeStr(req.body.role || "user");

  if (!["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

  await User.findByIdAndUpdate(id, { role });
  res.json({ message: "Roll uppdaterad ✅" });
});

app.delete("/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = safeStr(req.params.id);
  await User.deleteOne({ _id: id });
  res.json({ message: "User borttagen ✅" });
});

/*************************************************
 * ✅ Start server
 *************************************************/
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
