require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sanitizeHtml = require("sanitize-html");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const crypto = require("crypto");

// Stripe – valfritt
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const Stripe = require("stripe");
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("✅ Stripe aktiverad");
  } catch (err) {
    console.error("❌ Kunde inte initiera Stripe:", err.message);
  }
} else {
  console.log("⚠️ Stripe ej konfigurerad – betalningar avstängda");
}

/* =====================
   Express
===================== */
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "18mb" }));

app.use(
  cors({
    origin: process.env.APP_URL || true,
    credentials: true,
  })
);

// ✅ Servera frontend från samma mapp som server.js
app.use(express.static(__dirname));

/* =====================
   ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log(
  "STRIPE_SECRET_KEY:",
  process.env.STRIPE_SECRET_KEY ? "OK (aktiverad)" : "SAKNAS – Stripe avstängd"
);
console.log("APP_URL:", process.env.APP_URL || "http://localhost:3000");

/* =====================
   MongoDB
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
   Helpers
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

function genPublicId(prefix = "T") {
  const rnd = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${rnd}`;
}

/* =====================
   MODELS
===================== */

// User
const userSchema = new mongoose.Schema({
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

// Company
const companySchema = new mongoose.Schema({
  companyId: { type: String, unique: true, required: true },
  displayName: { type: String, required: true },
  orgNumber: { type: String, default: "" },
  address: { type: String, default: "" },
  zipCode: { type: String, default: "" },
  city: { type: String, default: "" },
  contactPerson: { type: String, default: "" },
  contactEmail: { type: String, default: "" },
  contactPhone: { type: String, default: "" },
  status: { type: String, enum: ["trial", "active", "past_due", "canceled"], default: "trial" },
  plan: { type: String, enum: ["bas", "pro"], default: "bas" },
  stripeCustomerId: { type: String, default: "" },
  stripeSubscriptionId: { type: String, default: "" },
  trialEndsAt: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  settings: {
    greeting: { type: String, default: "Hej! 👋 Hur kan jag hjälpa dig idag?" },
    tone: { type: String, default: "professional", enum: ["professional", "friendly", "strict"] },
    language: { type: String, default: "sv" },
    widgetColor: { type: String, default: "#0066cc" },
    widgetPos: { type: String, default: "bottom-right" },
    allowEmojis: { type: Boolean, default: true },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Company = mongoose.model("Company", companySchema);

// Ticket
const messageSchema = new mongoose.Schema({
  role: String, // user | assistant | agent
  content: String,
  timestamp: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  ticketPublicId: { type: String, unique: true, index: true, default: () => genPublicId("T") },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true, index: true },
  status: { type: String, enum: ["open", "pending", "solved"], default: "open" },
  priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
  title: { type: String, default: "" },
  assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  internalNotes: [{ createdBy: mongoose.Schema.Types.ObjectId, content: String, createdAt: Date }],
  firstAgentReplyAt: { type: Date, default: null },
  solvedAt: { type: Date, default: null },

  pendingStartedAt: { type: Date, default: null },
  pendingTotalMs: { type: Number, default: 0 },

  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },

  createdAt: { type: Date, default: Date.now },

  csatRating: { type: Number, min: 1, max: 5, default: null },
  csatComment: { type: String, default: "" },
  csatSubmittedAt: { type: Date, default: null },
});
const Ticket = mongoose.model("Ticket", ticketSchema);

/* =====================
   Auth middleware
===================== */
const authenticate = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Ogiltig token" });
  }
};

const requireAgent = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || (user.role !== "agent" && user.role !== "admin")) {
    return res.status(403).json({ error: "Agent/Admin krävs" });
  }
  req.roleUser = user;
  next();
};

const requireAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  req.roleUser = user;
  next();
};

/* =====================
   HEALTH
===================== */
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

/* =====================
   AUTH
===================== */
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username och password krävs" });
    }

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: "Användarnamn finns redan" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await new User({
      username,
      email: email || "",
      password: hashed,
      role: "user",
    }).save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user._id, publicUserId: user.publicUserId, username: user.username, role: user.role, email: user.email || "" },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Serverfel vid registrering" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username och password krävs" });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "Fel användarnamn eller lösenord" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Fel användarnamn eller lösenord" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user._id, publicUserId: user.publicUserId, username: user.username, role: user.role, email: user.email || "" },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Serverfel vid inloggning" });
  }
});

/* =====================
   /ME
===================== */
app.get("/me", authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return res.status(404).json({ error: "Användare hittades inte" });

  res.json({
    id: user._id,
    publicUserId: user.publicUserId,
    username: user.username,
    role: user.role,
    email: user.email || "",
  });
});

/* =====================
   COMPANIES
===================== */

// ✅ för alla inloggade (dropdown)
app.get("/companies", authenticate, async (req, res) => {
  const count = await Company.countDocuments({});
  if (count === 0) {
    const demo = await new Company({
      companyId: "demo",
      displayName: "Demo",
      contactEmail: "demo@demo.se",
    }).save();
    return res.json([demo]);
  }
  const companies = await Company.find({}).sort({ createdAt: -1 }).limit(50);
  res.json(companies);
});

// Admin endpoints (som du redan hade)
app.get("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  const companies = await Company.find({}).sort({ createdAt: -1 });
  res.json(companies);
});

app.post("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  const { displayName, orgNumber, contactEmail, plan } = req.body;
  if (!displayName || !contactEmail) return res.status(400).json({ error: "Namn och email krävs" });

  const companyId =
    displayName.toLowerCase().replace(/\s+/g, "-") + "-" + crypto.randomBytes(4).toString("hex");

  const company = await new Company({
    companyId,
    displayName,
    orgNumber,
    contactEmail,
    plan: plan || "bas",
  }).save();

  res.json(company);
});

/* =====================
   COMPANY SETTINGS + SIMULATOR
===================== */
app.get("/company/settings", authenticate, async (req, res) => {
  const companyId = req.query.companyId;
  const company = await Company.findOne({ companyId });
  if (!company) return res.status(404).json({ error: "Företag saknas" });
  res.json(company.settings);
});

app.patch("/company/settings", authenticate, async (req, res) => {
  const { companyId, settings } = req.body;
  const company = await Company.findOne({ companyId });
  if (!company) return res.status(404).json({ error: "Företag saknas" });

  company.settings = { ...company.settings, ...settings };
  company.updatedAt = new Date();
  await company.save();
  res.json({ message: "Sparat", settings: company.settings });
});

app.post("/company/simulator", authenticate, async (req, res) => {
  const { companyId, message } = req.body;
  const company = await Company.findOne({ companyId });
  if (!company) return res.status(404).json({ error: "Företag saknas" });

  res.json({
    preview: {
      greeting: company.settings.greeting,
      tone: company.settings.tone,
      widgetColor: company.settings.widgetColor,
      replyExample: `Simulerat svar till "${message}" med ton ${company.settings.tone}`,
    },
  });
});

/* =====================
   CHAT (ticket + messages)
===================== */
app.post("/chat", authenticate, async (req, res) => {
  try {
    const companyId = cleanText(req.body?.companyId || "demo");
    const conversation = Array.isArray(req.body?.conversation) ? req.body.conversation : [];
    const ticketId = req.body?.ticketId || null;

    let company = await Company.findOne({ companyId });
    if (!company) {
      company = await new Company({
        companyId,
        displayName: companyId.toUpperCase(),
        contactEmail: "auto@company.se",
      }).save();
    }

    const lastUserMsg =
      [...conversation].reverse().find((m) => m?.role === "user")?.content || "";

    let ticket = null;
    if (ticketId) ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      ticket = await new Ticket({
        userId: req.user.id,
        companyId,
        status: "open",
        priority: "normal",
        title: lastUserMsg ? cleanText(lastUserMsg).slice(0, 60) : "Nytt ärende",
        messages: [],
      }).save();
    }

    if (lastUserMsg) {
      ticket.messages.push({ role: "user", content: cleanText(lastUserMsg) });
    }

    // ✅ Svar (du kan koppla OpenAI här senare)
    const reply = `✅ Jag har tagit emot: "${cleanText(lastUserMsg)}"`;

    ticket.messages.push({ role: "assistant", content: reply });
    ticket.lastActivityAt = new Date();
    await ticket.save();

    res.json({
      reply,
      ticketId: ticket._id,
      ticketPublicId: ticket.ticketPublicId,
      ragUsed: false,
      ticket: { status: ticket.status },
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Chat serverfel" });
  }
});

/* =====================
   TICKETS (customer)
===================== */
app.get("/tickets/my", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(250);
  res.json(tickets);
});

app.get("/tickets/:ticketId", authenticate, async (req, res) => {
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });
  if (ticket.userId.toString() !== req.user.id) return res.status(403).json({ error: "Ej ditt ärende" });
  res.json(ticket);
});

app.post("/tickets/:ticketId/reply", authenticate, async (req, res) => {
  const text = cleanText(req.body?.message || "");
  if (!text) return res.status(400).json({ error: "Meddelande saknas" });

  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });
  if (ticket.userId.toString() !== req.user.id) return res.status(403).json({ error: "Ej ditt ärende" });

  ticket.messages.push({ role: "user", content: text });
  ticket.lastActivityAt = new Date();
  await ticket.save();
  res.json({ message: "Skickat", ticket });
});

/* =====================
   INBOX (agent/admin) ✅
===================== */

// List inbox tickets
app.get("/inbox/tickets", authenticate, requireAgent, async (req, res) => {
  const { status = "", companyId = "" } = req.query;

  const q = {};
  if (status) q.status = status;
  if (companyId) q.companyId = companyId;

  const tickets = await Ticket.find(q).sort({ lastActivityAt: -1 }).limit(1200);
  res.json(tickets);
});

// Set status
app.patch("/inbox/tickets/:ticketId/status", authenticate, requireAgent, async (req, res) => {
  const { status } = req.body;
  if (!["open", "pending", "solved"].includes(status)) {
    return res.status(400).json({ error: "Ogiltig status" });
  }

  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });

  // pending tid
  if (ticket.status !== "pending" && status === "pending") {
    ticket.pendingStartedAt = new Date();
  }
  if (ticket.status === "pending" && status !== "pending" && ticket.pendingStartedAt) {
    ticket.pendingTotalMs += Date.now() - ticket.pendingStartedAt.getTime();
    ticket.pendingStartedAt = null;
  }

  ticket.status = status;

  if (status === "solved") {
    ticket.solvedAt = new Date();
  }

  ticket.lastActivityAt = new Date();
  await ticket.save();
  res.json({ message: "Status uppdaterad", ticket });
});

// Set priority
app.patch("/inbox/tickets/:ticketId/priority", authenticate, requireAgent, async (req, res) => {
  const { priority } = req.body;
  if (!["low", "normal", "high"].includes(priority)) {
    return res.status(400).json({ error: "Ogiltig prioritet" });
  }

  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });

  ticket.priority = priority;
  ticket.lastActivityAt = new Date();
  await ticket.save();
  res.json({ message: "Prioritet uppdaterad", ticket });
});

// Agent reply
app.post("/inbox/tickets/:ticketId/reply", authenticate, requireAgent, async (req, res) => {
  const text = cleanText(req.body?.message || "");
  if (!text) return res.status(400).json({ error: "Meddelande saknas" });

  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });

  // sätt firstAgentReplyAt vid första svaret
  if (!ticket.firstAgentReplyAt) ticket.firstAgentReplyAt = new Date();

  ticket.messages.push({ role: "agent", content: text });
  ticket.agentUserId = req.user.id;
  ticket.lastActivityAt = new Date();
  await ticket.save();

  res.json({ message: "Svar skickat", ticket });
});

// Internal note
app.post("/inbox/tickets/:ticketId/internal-note", authenticate, requireAgent, async (req, res) => {
  const text = cleanText(req.body?.note || "");
  if (!text) return res.status(400).json({ error: "Note saknas" });

  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });

  ticket.internalNotes.push({ createdBy: req.user.id, content: text, createdAt: new Date() });
  ticket.lastActivityAt = new Date();
  await ticket.save();

  res.json({ message: "Note sparad", ticket });
});

// Clear internal notes
app.delete("/inbox/tickets/:ticketId/internal-notes", authenticate, requireAgent, async (req, res) => {
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });

  ticket.internalNotes = [];
  ticket.lastActivityAt = new Date();
  await ticket.save();

  res.json({ message: "Notes raderade", ticket });
});

// Delete ticket
app.delete("/inbox/tickets/:ticketId", authenticate, requireAgent, async (req, res) => {
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });

  await ticket.deleteOne();
  res.json({ message: "Ticket borttagen" });
});

// Assign ticket to agent
app.post("/inbox/tickets/:ticketId/assign", authenticate, requireAgent, async (req, res) => {
  const { assignedToUserId } = req.body;
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket saknas" });

  if (assignedToUserId) {
    const agent = await User.findById(assignedToUserId);
    if (!agent) return res.status(404).json({ error: "Agent saknas" });
    ticket.assignedToUserId = assignedToUserId;
  } else {
    ticket.assignedToUserId = null;
  }

  ticket.lastActivityAt = new Date();
  await ticket.save();

  res.json({ message: "Tilldelning sparad", ticket });
});

/* =====================
   ADMIN PANEL ✅
===================== */

// Users list (admin)
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(3000);
  res.json(users);
});

// Set user role (admin)
app.patch("/admin/users/:userId/role", authenticate, requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!["user", "agent", "admin"].includes(role)) {
    return res.status(400).json({ error: "Ogiltig roll" });
  }
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ error: "User saknas" });

  user.role = role;
  await user.save();
  res.json({ message: "Roll uppdaterad", user: { id: user._id, username: user.username, role: user.role } });
});

// Export all (admin)
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password");
  const companies = await Company.find({});
  const tickets = await Ticket.find({});
  res.json({ users, companies, tickets });
});

// Training export placeholder (admin)
app.get("/admin/export/training", authenticate, requireAdmin, async (req, res) => {
  const tickets = await Ticket.find({}).limit(2000);
  res.json({
    count: tickets.length,
    tickets,
  });
});

/* =====================
   SLA/KPI ✅
   Returnerar KPI baserat på tickets i DB
===================== */

function calcMsToHours(ms) {
  return Math.round((ms / 3600000) * 10) / 10;
}

app.get("/sla/overview", authenticate, requireAgent, async (req, res) => {
  const days = Number(req.query.days || "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tickets = await Ticket.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(2000);

  const total = tickets.length;
  const solved = tickets.filter(t => t.status === "solved").length;
  const open = tickets.filter(t => t.status === "open").length;
  const pending = tickets.filter(t => t.status === "pending").length;

  // First reply time (om firstAgentReplyAt finns)
  const replyTimesMs = tickets
    .filter(t => t.firstAgentReplyAt && t.createdAt)
    .map(t => t.firstAgentReplyAt.getTime() - t.createdAt.getTime())
    .filter(ms => ms >= 0);

  const avgFirstReplyMs = replyTimesMs.length ? Math.round(replyTimesMs.reduce((a,b)=>a+b,0)/replyTimesMs.length) : 0;

  // Solve time
  const solveTimesMs = tickets
    .filter(t => t.solvedAt && t.createdAt)
    .map(t => t.solvedAt.getTime() - t.createdAt.getTime())
    .filter(ms => ms >= 0);

  const avgSolveMs = solveTimesMs.length ? Math.round(solveTimesMs.reduce((a,b)=>a+b,0)/solveTimesMs.length) : 0;

  // CSAT
  const csatVals = tickets.filter(t => t.csatRating).map(t => t.csatRating);
  const avgCsat = csatVals.length ? Math.round((csatVals.reduce((a,b)=>a+b,0)/csatVals.length)*10)/10 : null;

  res.json({
    days,
    counts: { total, solved, open, pending },
    avgFirstReplyHours: avgFirstReplyMs ? calcMsToHours(avgFirstReplyMs) : null,
    avgSolveHours: avgSolveMs ? calcMsToHours(avgSolveMs) : null,
    avgCsat,
  });
});

// Trend (veckovis)
app.get("/sla/trend", authenticate, requireAgent, async (req, res) => {
  const days = Number(req.query.days || "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tickets = await Ticket.find({ createdAt: { $gte: since } }).select("createdAt status csatRating").limit(3000);

  // gruppera per ISO-week (enkel)
  const map = new Map();
  for (const t of tickets) {
    const d = new Date(t.createdAt);
    const key = `${d.getFullYear()}-${String(Math.ceil(((d - new Date(d.getFullYear(),0,1))/86400000 + new Date(d.getFullYear(),0,1).getDay()+1)/7)).padStart(2,"0")}`;
    if (!map.has(key)) map.set(key, { week: key, total: 0, solved: 0, csatSum: 0, csatN: 0 });
    const row = map.get(key);
    row.total++;
    if (t.status === "solved") row.solved++;
    if (t.csatRating) {
      row.csatSum += t.csatRating;
      row.csatN++;
    }
  }

  const rows = Array.from(map.values()).sort((a,b)=>a.week.localeCompare(b.week)).map(r => ({
    week: r.week,
    total: r.total,
    solved: r.solved,
    csatAvg: r.csatN ? Math.round((r.csatSum / r.csatN)*10)/10 : null,
  }));

  res.json(rows);
});

// Agents KPI (enkel)
app.get("/sla/agents", authenticate, requireAgent, async (req, res) => {
  const days = Number(req.query.days || "30");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tickets = await Ticket.find({ createdAt: { $gte: since } }).select("agentUserId firstAgentReplyAt solvedAt createdAt status");
  const map = new Map();

  for (const t of tickets) {
    const agentId = t.agentUserId ? String(t.agentUserId) : "unassigned";
    if (!map.has(agentId)) map.set(agentId, { agentId, handled: 0, solved: 0 });
    const row = map.get(agentId);
    row.handled++;
    if (t.status === "solved") row.solved++;
  }

  // Lägg namn för riktiga users
  const agentIds = Array.from(map.keys()).filter(id => id !== "unassigned");
  const users = await User.find({ _id: { $in: agentIds } }).select("username role");

  const rows = Array.from(map.values()).map(r => {
    const u = users.find(x => String(x._id) === r.agentId);
    return {
      agentId: r.agentId,
      agentName: u ? u.username : "Unassigned",
      handled: r.handled,
      solved: r.solved,
    };
  });

  res.json(rows);
});

// Clear stats (placeholder – påverkar ej tickets)
app.delete("/sla/clear/my", authenticate, requireAgent, async (req, res) => {
  res.json({ message: "Din statistik är rensad (placeholder)" });
});

app.delete("/sla/clear/all", authenticate, requireAdmin, async (req, res) => {
  res.json({ message: "All statistik är rensad (placeholder)" });
});

/* =====================
   BILLING HISTORY ✅
===================== */
app.get("/billing/history", authenticate, async (req, res) => {
  res.json({ invoices: [] });
});

/* =====================
   Stripe Checkout (som du hade)
===================== */
if (stripe) {
  app.post("/billing/create-checkout", authenticate, async (req, res) => {
    try {
      const { plan = "pro", companyId } = req.body;
      const company = await Company.findOne({ companyId });
      if (!company) return res.status(404).json({ error: "Företag saknas" });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: process.env[`STRIPE_${plan.toUpperCase()}_PRICE_ID`], quantity: 1 }],
        success_url: `${process.env.APP_URL}/?success=true`,
        cancel_url: `${process.env.APP_URL}/?canceled=true`,
        metadata: { companyId, plan },
      });

      res.json({ url: session.url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
} else {
  app.post("/billing/create-checkout", (req, res) => {
    res.status(503).json({ error: "Stripe är inte konfigurerad på servern" });
  });
}

/* =====================
   Root + fallback (utan app.get("*"))
===================== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =====================
   Starta servern
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server körs på http://localhost:${PORT}`);
});
