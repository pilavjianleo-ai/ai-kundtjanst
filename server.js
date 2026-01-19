/**
 * server.js (FULL)
 * ✅ Tickets + Auth + Categories + KB + SLA + Customer reply from "Mina ärenden"
 *
 * OBS:
 * - Kräver .env med:
 *   MONGO_URI=...
 *   JWT_SECRET=...
 *   (valfritt) PORT=3000
 *
 * Start:
 *   npm i express cors mongoose bcrypt jsonwebtoken multer pdf-parse node-fetch nodemailer
 *   node server.js
 */

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

/*************************************************
 * ✅ Mongo
 *************************************************/
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ Missing MONGO_URI in .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("✅ MongoDB connected");
}

/*************************************************
 * ✅ Schemas
 *************************************************/
const UserSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true },
    email: { type: String, default: "" },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "agent", "admin"], default: "user" },
  },
  { timestamps: true }
);

const TicketMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "agent"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InternalNoteSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const TicketSchema = new mongoose.Schema(
  {
    companyId: { type: String, default: "demo" },
    title: { type: String, default: "Ärende" },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    status: { type: String, enum: ["open", "pending", "solved"], default: "open" },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    messages: { type: [TicketMessageSchema], default: [] },
    internalNotes: { type: [InternalNoteSchema], default: [] },

    createdAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

/**
 * ✅ SLAStats (per ticket)
 * sparas i separat collection för snabb statistik
 */
const TicketSlaSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", unique: true, required: true },
    companyId: { type: String, default: "demo" },
    priority: { type: String, default: "normal" },
    status: { type: String, default: "open" },

    createdAt: { type: Date, required: true },
    firstResponseAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },

    firstResponseMs: { type: Number, default: null },
    resolutionMs: { type: Number, default: null },

    breachedFirstResponse: { type: Boolean, default: false },
    breachedResolution: { type: Boolean, default: false },

    // ✅ vem som tog första agent-svaret
    firstResponderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ✅ vem som löste ticket
    resolverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

/**
 * ✅ Category
 */
const CategorySchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },
    name: { type: String, required: true },
    prompt: { type: String, required: true },
  },
  { timestamps: true }
);

/**
 * ✅ Knowledge Base (KB)
 */
const KBItemSchema = new mongoose.Schema(
  {
    companyId: { type: String, default: "demo" },
    type: { type: String, enum: ["text", "url", "pdf"], default: "text" },
    title: { type: String, default: "" },
    content: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

const User = mongoose.model("User", UserSchema);
const Ticket = mongoose.model("Ticket", TicketSchema);
const TicketSLA = mongoose.model("TicketSLA", TicketSlaSchema);
const Category = mongoose.model("Category", CategorySchema);
const KBItem = mongoose.model("KBItem", KBItemSchema);

/*************************************************
 * ✅ Helpers
 *************************************************/
function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!roles.includes(role)) return res.status(403).json({ error: "Forbidden" });
    return next();
  };
}

function average(nums) {
  const arr = (nums || []).filter((n) => typeof n === "number" && isFinite(n));
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function pct(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

/**
 * ✅ SLA Thresholds
 * justera om du vill
 */
const SLA_THRESHOLDS = {
  firstResponse: {
    low: 48 * 60 * 60 * 1000,
    normal: 24 * 60 * 60 * 1000,
    high: 2 * 60 * 60 * 1000,
  },
  resolution: {
    low: 7 * 24 * 60 * 60 * 1000,
    normal: 3 * 24 * 60 * 60 * 1000,
    high: 24 * 60 * 60 * 1000,
  },
};

/*************************************************
 * ✅ Seed categories if empty
 *************************************************/
async function seedCategories() {
  const count = await Category.countDocuments();
  if (count > 0) return;

  await Category.create([
    {
      key: "demo",
      name: "Demo AB",
      prompt: "Du är en hjälpsam AI kundtjänst för Demo AB. Svara tydligt och trevligt på svenska.",
    },
    {
      key: "tech",
      name: "Teknisk support",
      prompt: "Du är en teknisk AI-support. Hjälp kunden felsöka IT-problem.",
    },
    {
      key: "law",
      name: "Juridik",
      prompt: "Du ger allmän juridisk vägledning, inte juridisk rådgivning. Svara tydligt.",
    },
    {
      key: "cleaning",
      name: "Städservice",
      prompt: "Du hjälper till med frågor om städning och rutiner.",
    },
  ]);

  console.log("✅ Categories seeded");
}

/*************************************************
 * ✅ Ensure admin user exists
 *************************************************/
async function seedAdmin() {
  const adminExists = await User.findOne({ role: "admin" });
  if (adminExists) return;

  const passwordHash = await bcrypt.hash("admin123", 10);
  await User.create({
    username: "admin",
    email: "admin@demo.se",
    passwordHash,
    role: "admin",
  });

  console.log("✅ Admin seeded: username=admin password=admin123");
}

/*************************************************
 * ✅ SLA tracking functions
 *************************************************/
async function ensureSlaRecord(ticket) {
  const exists = await TicketSLA.findOne({ ticketId: ticket._id });
  if (exists) return exists;

  const rec = await TicketSLA.create({
    ticketId: ticket._id,
    companyId: ticket.companyId,
    priority: ticket.priority || "normal",
    status: ticket.status || "open",
    createdAt: ticket.createdAt || new Date(),
  });

  return rec;
}

async function updateSlaOnAgentReply(ticket, agentUserId) {
  const sla = await ensureSlaRecord(ticket);
  if (!sla.firstResponseAt) {
    const firstResponseAt = new Date(ticket.lastActivityAt || Date.now());
    sla.firstResponseAt = firstResponseAt;
    sla.firstResponseMs = firstResponseAt.getTime() - new Date(sla.createdAt).getTime();
    sla.firstResponderId = agentUserId ? new mongoose.Types.ObjectId(agentUserId) : null;

    const pr = sla.priority || "normal";
    const limit = SLA_THRESHOLDS.firstResponse[pr] ?? SLA_THRESHOLDS.firstResponse.normal;
    sla.breachedFirstResponse = sla.firstResponseMs > limit;
  }
  sla.status = ticket.status;
  sla.priority = ticket.priority;
  await sla.save();
}

async function updateSlaOnSolved(ticket, resolverUserId) {
  const sla = await ensureSlaRecord(ticket);
  if (!sla.resolvedAt) {
    const resolvedAt = new Date(ticket.lastActivityAt || Date.now());
    sla.resolvedAt = resolvedAt;
    sla.resolutionMs = resolvedAt.getTime() - new Date(sla.createdAt).getTime();
    sla.resolverId = resolverUserId ? new mongoose.Types.ObjectId(resolverUserId) : null;

    const pr = sla.priority || "normal";
    const limit = SLA_THRESHOLDS.resolution[pr] ?? SLA_THRESHOLDS.resolution.normal;
    sla.breachedResolution = sla.resolutionMs > limit;
  }
  sla.status = ticket.status;
  sla.priority = ticket.priority;
  await sla.save();
}

/*************************************************
 * ✅ AUTH
 *************************************************/
app.post("/register", async (req, res) => {
  try {
    const { username, password, email = "" } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: "Username already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ username, passwordHash, email, role: "user" });

    return res.json({ message: "Registrering klar ✅" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Fel användarnamn/lösenord" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Fel användarnamn/lösenord" });

    const token = signToken(user);
    return res.json({ token });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/me", authRequired, async (req, res) => {
  const u = await User.findById(req.user.id);
  if (!u) return res.status(404).json({ error: "User not found" });

  return res.json({
    id: u._id,
    username: u.username,
    email: u.email,
    role: u.role,
  });
});

/*************************************************
 * ✅ SETTINGS
 *************************************************/
app.post("/auth/change-username", authRequired, async (req, res) => {
  try {
    const { newUsername } = req.body || {};
    if (!newUsername) return res.status(400).json({ error: "Missing newUsername" });

    const exists = await User.findOne({ username: newUsername });
    if (exists) return res.status(400).json({ error: "Username already exists" });

    await User.findByIdAndUpdate(req.user.id, { username: newUsername });
    return res.json({ message: "Användarnamn uppdaterat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/auth/change-password", authRequired, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "Missing fields" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Nuvarande lösenord är fel" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.user.id, { passwordHash });
    return res.json({ message: "Lösenord uppdaterat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ FORGOT/RESET (demo placeholder)
 * (Du hade UI, men detta kräver mail-lösning)
 *************************************************/
app.post("/auth/forgot-password", async (req, res) => {
  return res.json({
    message:
      "Demo: Forgot password är aktiverat men saknar mail-server i detta exempel. ✅",
  });
});

app.post("/auth/reset-password", async (req, res) => {
  return res.json({
    message:
      "Demo: Reset password är aktiverat men reset-token valideras inte i detta exempel. ✅",
  });
});

/*************************************************
 * ✅ CATEGORIES (public list)
 *************************************************/
app.get("/categories", async (req, res) => {
  const cats = await Category.find().sort({ createdAt: 1 });
  return res.json(
    cats.map((c) => ({
      key: c.key,
      name: c.name,
      prompt: c.prompt,
    }))
  );
});

/*************************************************
 * ✅ ADMIN: Categories CRUD
 *************************************************/
app.post("/admin/categories", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const { key, name, prompt } = req.body || {};
    if (!key || !name || !prompt) return res.status(400).json({ error: "Missing fields" });

    const exists = await Category.findOne({ key });
    if (exists) return res.status(400).json({ error: "Category exists" });

    await Category.create({ key, name, prompt });
    return res.json({ message: "Kategori skapad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.delete("/admin/categories/:key", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const key = req.params.key;
    await Category.deleteOne({ key });
    return res.json({ message: "Kategori borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ CHAT (creates ticket + appends message)
 * (minimal AI demo: echo with category)
 *************************************************/
app.post("/chat", authRequired, async (req, res) => {
  try {
    const { companyId = "demo", conversation = [], ticketId } = req.body || {};

    // Find existing ticket or create new
    let ticket = null;
    if (ticketId) {
      ticket = await Ticket.findById(ticketId);
      if (!ticket) return res.status(400).json({ error: "Ticket hittades inte" });
      if (String(ticket.userId) !== String(req.user.id))
        return res.status(403).json({ error: "Forbidden" });
    } else {
      ticket = await Ticket.create({
        companyId,
        title: "Ärende",
        userId: req.user.id,
        status: "open",
        priority: "normal",
        messages: [],
        internalNotes: [],
        createdAt: new Date(),
        lastActivityAt: new Date(),
      });

      // ✅ create SLA record
      await ensureSlaRecord(ticket);
    }

    const lastUserMsg = conversation?.slice(-1)?.[0]?.content || "";

    // Save user message
    ticket.messages.push({
      role: "user",
      content: lastUserMsg,
      timestamp: new Date(),
    });
    ticket.lastActivityAt = new Date();
    await ticket.save();

    // Demo AI reply
    const reply = `✅ Jag förstår! (Kategori: ${companyId})\n\nDu skrev: "${lastUserMsg}"\n\nEn agent kan också svara i Inbox om det behövs.`;

    ticket.messages.push({
      role: "assistant",
      content: reply,
      timestamp: new Date(),
    });
    ticket.lastActivityAt = new Date();
    await ticket.save();

    return res.json({
      ticketId: ticket._id,
      reply,
      ragUsed: false,
    });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ FEEDBACK (demo)
 *************************************************/
app.post("/feedback", authRequired, async (req, res) => {
  return res.json({ message: "Feedback sparad ✅" });
});

/*************************************************
 * ✅ MY TICKETS (customer)
 *************************************************/
app.get("/my/tickets", authRequired, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ lastActivityAt: -1 });
  return res.json(tickets);
});

app.get("/my/tickets/:id", authRequired, async (req, res) => {
  const t = await Ticket.findById(req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });
  if (String(t.userId) !== String(req.user.id))
    return res.status(403).json({ error: "Forbidden" });
  return res.json(t);
});

/**
 * ✅ NEW: Customer reply in existing ticket (from Mina ärenden)
 */
app.post("/my/tickets/:id/reply", authRequired, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "Skriv ett meddelande" });

    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });
    if (String(t.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });

    t.messages.push({
      role: "user",
      content,
      timestamp: new Date(),
    });
    t.lastActivityAt = new Date();
    if (t.status === "solved") t.status = "open"; // reopen on customer message
    await t.save();

    // SLA record already exists, nothing special required here.
    await ensureSlaRecord(t);

    return res.json({ message: "Svar skickat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ ADMIN USERS
 *************************************************/
app.get("/admin/users", authRequired, requireRole("admin", "agent"), async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  return res.json(users);
});

app.post("/admin/users/:id/role", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!["user", "agent", "admin"].includes(role))
      return res.status(400).json({ error: "Invalid role" });

    if (String(req.params.id) === String(req.user.id))
      return res.status(400).json({ error: "Du kan inte ändra din egen roll" });

    await User.findByIdAndUpdate(req.params.id, { role });
    return res.json({ message: "Roll uppdaterad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.delete("/admin/users/:id", authRequired, requireRole("admin"), async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id))
      return res.status(400).json({ error: "Du kan inte ta bort dig själv" });

    await User.findByIdAndDelete(req.params.id);
    return res.json({ message: "User borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ ADMIN TICKETS
 *************************************************/
app.get("/admin/tickets", authRequired, requireRole("admin", "agent"), async (req, res) => {
  const { status, companyId } = req.query || {};

  const q = {};
  if (status) q.status = status;
  if (companyId) q.companyId = companyId;

  // ✅ agent ser ALLA tickets (som inbox) i detta demo
  // vill du att agent bara ser assignade? byt till:
  // if (req.user.role === "agent") q.assignedTo = req.user.id;

  const tickets = await Ticket.find(q).sort({ lastActivityAt: -1 });
  return res.json(tickets);
});

app.get("/admin/tickets/:id", authRequired, requireRole("admin", "agent"), async (req, res) => {
  const t = await Ticket.findById(req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });
  return res.json(t);
});

app.post("/admin/tickets/:id/status", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["open", "pending", "solved"].includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    t.status = status;
    t.lastActivityAt = new Date();
    await t.save();

    // ✅ SLA update when solved
    if (status === "solved") {
      await updateSlaOnSolved(t, req.user.id);
    } else {
      // keep record synced
      const sla = await ensureSlaRecord(t);
      sla.status = t.status;
      sla.priority = t.priority;
      await sla.save();
    }

    return res.json({ message: "Status uppdaterad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/admin/tickets/:id/priority", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const { priority } = req.body || {};
    if (!["low", "normal", "high"].includes(priority))
      return res.status(400).json({ error: "Invalid priority" });

    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    t.priority = priority;
    t.lastActivityAt = new Date();
    await t.save();

    // sync SLA record
    const sla = await ensureSlaRecord(t);
    sla.priority = priority;
    sla.status = t.status;
    await sla.save();

    return res.json({ message: "Prioritet uppdaterad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/admin/tickets/:id/agent-reply", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "Missing content" });

    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    t.messages.push({
      role: "agent",
      content,
      timestamp: new Date(),
    });
    t.lastActivityAt = new Date();
    if (t.status === "open") t.status = "pending";
    await t.save();

    // ✅ SLA first response tracking
    await updateSlaOnAgentReply(t, req.user.id);

    return res.json({ message: "Agent-svar skickat ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/admin/tickets/:id/internal-note", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "Missing content" });

    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    t.internalNotes.push({ content, createdAt: new Date() });
    t.lastActivityAt = new Date();
    await t.save();

    return res.json({ message: "Intern notering sparad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.delete(
  "/admin/tickets/:ticketId/internal-note/:noteId",
  authRequired,
  requireRole("admin", "agent"),
  async (req, res) => {
    try {
      const { ticketId, noteId } = req.params;
      const t = await Ticket.findById(ticketId);
      if (!t) return res.status(404).json({ error: "Ticket not found" });

      t.internalNotes = (t.internalNotes || []).filter((n) => String(n._id) !== String(noteId));
      t.lastActivityAt = new Date();
      await t.save();

      return res.json({ message: "Notering borttagen ✅" });
    } catch {
      return res.status(500).json({ error: "Serverfel" });
    }
  }
);

app.delete("/admin/tickets/:id/internal-notes", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    t.internalNotes = [];
    t.lastActivityAt = new Date();
    await t.save();

    return res.json({ message: "Alla notes rensade ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/admin/tickets/:id/assign", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const u = await User.findById(userId);
    if (!u) return res.status(404).json({ error: "User not found" });
    if (!["admin", "agent"].includes(u.role))
      return res.status(400).json({ error: "User is not agent/admin" });

    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket not found" });

    t.assignedTo = userId;
    t.lastActivityAt = new Date();
    await t.save();

    return res.json({ message: "Ticket assignad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.delete("/admin/tickets/:id", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    await TicketSLA.deleteOne({ ticketId: req.params.id });
    return res.json({ message: "Ticket borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ BULK actions
 *************************************************/
app.post("/admin/tickets/solve-all", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const tickets = await Ticket.find({ status: { $in: ["open", "pending"] } });
    for (const t of tickets) {
      t.status = "solved";
      t.lastActivityAt = new Date();
      await t.save();
      await updateSlaOnSolved(t, req.user.id);
    }
    return res.json({ message: "Alla open/pending ärenden markerades som solved ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/admin/tickets/remove-solved", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const solved = await Ticket.find({ status: "solved" });
    const ids = solved.map((t) => t._id);

    await Ticket.deleteMany({ _id: { $in: ids } });
    await TicketSLA.deleteMany({ ticketId: { $in: ids } });

    return res.json({ message: "Alla solved tickets borttagna ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ EXPORT (demo)
 *************************************************/
app.get("/admin/export/all", authRequired, requireRole("admin"), async (req, res) => {
  const users = await User.find();
  const tickets = await Ticket.find();
  return res.json({ users, tickets });
});

app.get("/admin/export/training", authRequired, requireRole("admin"), async (req, res) => {
  const tickets = await Ticket.find();
  return res.json({ tickets });
});

/*************************************************
 * ✅ KB
 *************************************************/
app.get("/kb/list/:companyId", authRequired, requireRole("admin", "agent"), async (req, res) => {
  const companyId = req.params.companyId;
  const items = await KBItem.find({ companyId }).sort({ createdAt: -1 });
  return res.json(items);
});

app.post("/kb/upload-text", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const { companyId, title, content } = req.body || {};
    if (!companyId || !title || !content) return res.status(400).json({ error: "Missing fields" });

    await KBItem.create({ companyId, type: "text", title, content });
    return res.json({ message: "Text uppladdad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/kb/upload-url", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const { companyId, url } = req.body || {};
    if (!companyId || !url) return res.status(400).json({ error: "Missing fields" });

    await KBItem.create({ companyId, type: "url", title: url, sourceUrl: url, content: "" });
    return res.json({ message: "URL uppladdad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

const upload = multer({ storage: multer.memoryStorage() });
app.post("/kb/upload-pdf", authRequired, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    const companyId = req.body.companyId;
    if (!companyId) return res.status(400).json({ error: "Missing companyId" });
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const data = await pdfParse(req.file.buffer);
    const text = String(data.text || "").slice(0, 200000);

    await KBItem.create({
      companyId,
      type: "pdf",
      title: req.file.originalname || "PDF",
      content: text,
    });

    return res.json({ message: "PDF uppladdad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.get("/export/kb/:companyId", authRequired, requireRole("admin", "agent"), async (req, res) => {
  const companyId = req.params.companyId;
  const items = await KBItem.find({ companyId });
  return res.json(items);
});

/*************************************************
 * ✅ SLA ENDPOINTS
 * Admin: all data
 * Agent: only own responder/resolver stats
 *************************************************/
function agentScopeFilter(req) {
  // Admin ser allt
  if (req.user.role === "admin") return {};

  // Agent ser bara sina tickets som first responder/resolver
  const userId = req.user.id;
  return {
    $or: [
      { firstResponderId: userId },
      { resolverId: userId },
    ],
  };
}

// ✅ Overview (cards)
app.get("/admin/sla/overview", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const scope = agentScopeFilter(req);

    const rows = await TicketSLA.find({
      createdAt: { $gte: since },
      ...scope,
    });

    const totalTickets = rows.length;

    const byPriority = {
      low: rows.filter((r) => r.priority === "low").length,
      normal: rows.filter((r) => r.priority === "normal").length,
      high: rows.filter((r) => r.priority === "high").length,
    };

    const firstVals = rows.map((r) => r.firstResponseMs).filter((x) => typeof x === "number");
    const resVals = rows.map((r) => r.resolutionMs).filter((x) => typeof x === "number");

    const firstBreaches = rows.filter((r) => r.breachedFirstResponse).length;
    const resBreaches = rows.filter((r) => r.breachedResolution).length;

    const firstCompliance = pct(totalTickets - firstBreaches, totalTickets);
    const resCompliance = pct(totalTickets - resBreaches, totalTickets);

    return res.json({
      totalTickets,
      byPriority,
      firstResponse: {
        avgMs: average(firstVals),
        breaches: firstBreaches,
        compliancePct: firstCompliance,
      },
      resolution: {
        avgMs: average(resVals),
        breaches: resBreaches,
        compliancePct: resCompliance,
      },
    });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

// ✅ Agents table
app.get("/admin/sla/agents", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Admin = list all agents/admin
    // Agent = list only self
    let users = [];
    if (req.user.role === "admin") {
      users = await User.find({ role: { $in: ["admin", "agent"] } });
    } else {
      users = await User.find({ _id: req.user.id });
    }

    const rowsOut = [];

    for (const u of users) {
      const r = await TicketSLA.find({
        createdAt: { $gte: since },
        $or: [{ firstResponderId: u._id }, { resolverId: u._id }],
      });

      const total = r.length;
      const firstVals = r.map((x) => x.firstResponseMs).filter((n) => typeof n === "number");
      const resVals = r.map((x) => x.resolutionMs).filter((n) => typeof n === "number");

      const firstBreaches = r.filter((x) => x.breachedFirstResponse).length;
      const resBreaches = r.filter((x) => x.breachedResolution).length;

      rowsOut.push({
        userId: u._id,
        username: u.username,
        role: u.role,
        tickets: total,
        firstResponse: {
          avgMs: average(firstVals),
          compliancePct: pct(total - firstBreaches, total),
        },
        resolution: {
          avgMs: average(resVals),
          compliancePct: pct(total - resBreaches, total),
        },
      });
    }

    return res.json({ rows: rowsOut });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

// ✅ Tickets table
app.get("/admin/sla/tickets", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const scope = agentScopeFilter(req);

    const rows = await TicketSLA.find({
      createdAt: { $gte: since },
      ...scope,
    }).sort({ createdAt: -1 });

    return res.json({
      rows: rows.map((r) => ({
        ticketId: r.ticketId,
        companyId: r.companyId,
        status: r.status,
        priority: r.priority,
        sla: {
          firstResponseMs: r.firstResponseMs,
          resolutionMs: r.resolutionMs,
          breachedFirstResponse: r.breachedFirstResponse,
          breachedResolution: r.breachedResolution,
        },
      })),
    });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ SLA CLEAR / RESET
 * - Agent kan rensa sin egna statistik
 * - Admin kan rensa ALLA
 *************************************************/
app.post("/admin/sla/clear-own", authRequired, requireRole("admin", "agent"), async (req, res) => {
  try {
    const userId = req.user.id;

    // admin: får också rensa own, men det blir deras egna
    await TicketSLA.deleteMany({
      $or: [{ firstResponderId: userId }, { resolverId: userId }],
    });

    return res.json({ message: "Din SLA-statistik rensades ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/admin/sla/clear-all", authRequired, requireRole("admin"), async (req, res) => {
  try {
    await TicketSLA.deleteMany({});
    return res.json({ message: "ALL SLA-statistik rensad ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel" });
  }
});

/*************************************************
 * ✅ HEALTH
 *************************************************/
app.get("/", (req, res) => res.send("✅ API up and running"));

/*************************************************
 * ✅ Start
 *************************************************/
(async () => {
  await connectDB();
  await seedCategories();
  await seedAdmin();

  app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
})();
