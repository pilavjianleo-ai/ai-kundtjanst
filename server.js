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
const helmet = require("helmet");
const { celebrate, Joi, Segments } = require("celebrate");

let safeFetch = globalThis.fetch;
try {
  if (!safeFetch) safeFetch = require("node-fetch");
} catch {}

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "18mb" }));
app.use(cors());
app.use(express.static(__dirname));

// Rate limiting
const limiterGlobal = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

app.use(limiterGlobal);
app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);
app.use("/auth", limiterAuth);

// ENV check
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");

// MongoDB
mongoose.set("strictQuery", true);
mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB ansluten"))
  .catch(err => console.error("MongoDB-fel:", err));

// MODELS
const userSchema = new mongoose.Schema({
  publicUserId: { type: String, unique: true, default: () => "U-" + crypto.randomBytes(5).toString("hex").toUpperCase() },
  username: { type: String, unique: true, required: true },
  email: { type: String, default: "" },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "agent", "admin"], default: "user" },
  resetTokenHash: String,
  resetTokenExpiresAt: Date,
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  role: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
});

const customerSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  orgNumber: { type: String, trim: true },
  address: String,
  contactPerson: String,
  email: { type: String, lowercase: true, trim: true },
  phone: String,
  status: { type: String, enum: ["active", "inactive", "prospect"], default: "active" },
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Customer = mongoose.model("Customer", customerSchema);

const ticketSchema = new mongoose.Schema({
  ticketPublicId: { type: String, unique: true, default: () => "T-" + crypto.randomBytes(5).toString("hex").toUpperCase() },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
  companyId: { type: String, required: true },
  status: { type: String, default: "open" },
  priority: { type: String, default: "normal" },
  title: String,
  assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  internalNotes: [{
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: String,
    createdAt: { type: Date, default: Date.now },
  }],
  firstAgentReplyAt: Date,
  solvedAt: Date,
  pendingStartedAt: Date,
  pendingTotalMs: { type: Number, default: 0 },
  escalated: { type: Boolean, default: false },
  sla: {
    type: Object,
    default: {}
  },
  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
const Ticket = mongoose.model("Ticket", ticketSchema);

// ... Lägg till dina övriga modeller här (KBChunk, Feedback, Category, AISettings, SLAStat) ...

// HELPERS (din befintliga kod + några tillägg)
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

// ... dina övriga helpers: avg, median, toCsv, msBetween, msToPretty, etc. ...

function computeSlaForTicket(t, now = new Date()) {
  const limits = slaLimitsForPriority(t.priority || "normal");
  const createdAt = t.createdAt || now;
  const firstAgentReplyAt = t.firstAgentReplyAt || null;
  const solvedAt = t.solvedAt || null;

  const firstResponseMs = firstAgentReplyAt ? msBetween(createdAt, firstAgentReplyAt) : null;
  const resolutionMs = solvedAt ? calcEffectiveMsFromCreated(t, solvedAt, now) : null;

  const firstResponseDueAt = new Date(createdAt.getTime() + limits.firstResponseLimitMs);
  const resolutionDueAt = new Date(createdAt.getTime() + limits.resolutionLimitMs);

  const nowMs = now.getTime();
  const firstResponseRemainingMs = firstAgentReplyAt ? 0 : Math.max(0, firstResponseDueAt.getTime() - nowMs);
  const resolutionRemainingMs = solvedAt ? 0 : Math.max(0, resolutionDueAt.getTime() - nowMs);

  const breachedFirstResponse = firstResponseMs !== null && firstResponseMs > limits.firstResponseLimitMs;
  const effectiveRunningMs = solvedAt ? resolutionMs : calcEffectiveMsFromCreated(t, now, now);
  const breachedResolution = effectiveRunningMs != null && effectiveRunningMs > limits.resolutionLimitMs;

  // Auto-eskalering vid resolution-brott
  if (breachedResolution && !t.escalated) {
    t.escalated = true;
    User.findOne({ role: "admin" })
      .then(admin => {
        if (admin) {
          t.assignedToUserId = admin._id;
          t.save().catch(console.error);
        }
      });
  }

  t.sla = {
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
    pretty: {
      firstResponse: msToPretty(firstResponseMs),
      resolution: msToPretty(resolutionMs),
      pendingTotal: msToPretty(calcPendingMs(t, now)),
      effectiveRunning: msToPretty(effectiveRunningMs),
      firstRemaining: msToPretty(firstResponseRemainingMs),
      resolutionRemaining: msToPretty(resolutionRemainingMs),
    }
  };

  return t;
}

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Email
function smtpReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendTicketAssignedEmail(ticket, agent) {
  if (!smtpReady() || !agent?.email) return;
  try {
    const transporter = createTransport();
    const link = `${process.env.APP_URL}/?ticket=${ticket.ticketPublicId}`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: agent.email,
      subject: `Ny ticket tilldelad: ${ticket.title}`,
      html: `
        <p>Hej ${agent.username},</p>
        <p>Du har fått en ny ticket:</p>
        <p><strong>${ticket.title}</strong><br>
        Kund: ${ticket.companyId}<br>
        Prioritet: ${ticket.priority}</p>
        <p><a href="${link}">Öppna ticket</a></p>
      `
    });
  } catch (e) {
    console.error("Email-fel:", e);
  }
}

// Auth middleware
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

async function getDbUser(req) {
  return await User.findById(req.user?.id);
}

const requireAdmin = async (req, res, next) => {
  const user = await getDbUser(req);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

const requireAgentOrAdmin = async (req, res, next) => {
  const user = await getDbUser(req);
  if (!user || !["agent", "admin"].includes(user.role)) return res.status(403).json({ error: "Agent eller admin krävs" });
  next();
};

// RAG och övriga helpers (din befintliga kod här)

// ROUTES
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (req, res) => res.json({ ok: true }));

// Auth routes (din befintliga kod här)

// Chat
app.post("/chat", authenticate, async (req, res) => {
  // ... din befintliga chat-logik ...

  // Lägg till kundkoppling
  if (req.body.customerId) {
    ticket.customerId = req.body.customerId;
  }

  // ... fortsätt med OpenAI-anrop ...

  // Logga kostnad
  if (response?.usage) {
    const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
    const cost = (prompt_tokens / 1000 * 0.00015) + (completion_tokens / 1000 * 0.0006);
    console.log(`[OpenAI kostnad] ${total_tokens} tokens ≈ $${cost.toFixed(6)}`);
  }

  // ... spara ticket ...
});

// Customer routes (full CRUD)
app.get("/admin/customers", authenticate, requireAgentOrAdmin, async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const query = search ? {
    $or: [
      { companyName: { $regex: search, $options: "i" } },
      { orgNumber: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } }
    ]
  } : {};

  try {
    const customers = await Customer.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Customer.countDocuments(query);

    res.json({
      customers,
      pagination: { page: Number(page), limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: "Kunde inte hämta kunder" });
  }
});

app.post("/admin/customers",
  authenticate,
  requireAgentOrAdmin,
  celebrate({
    [Segments.BODY]: Joi.object({
      companyName: Joi.string().min(2).required(),
      orgNumber: Joi.string().pattern(/^\d{6}-\d{4}$|^\d{10}$/).optional(),
      address: Joi.string().optional(),
      contactPerson: Joi.string().optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().optional(),
      status: Joi.string().valid("active", "inactive", "prospect").default("active")
    })
  }),
  async (req, res) => {
    try {
      const customer = new Customer(req.body);
      await customer.save();
      res.status(201).json({ message: "Kund skapad", customer });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.patch("/admin/customers/:id",
  authenticate,
  requireAgentOrAdmin,
  celebrate({
    [Segments.BODY]: Joi.object({
      companyName: Joi.string().min(2).optional(),
      orgNumber: Joi.string().optional(),
      address: Joi.string().optional(),
      contactPerson: Joi.string().optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().optional(),
      status: Joi.string().valid("active", "inactive", "prospect").optional()
    })
  }),
  async (req, res) => {
    try {
      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        { $set: req.body, updatedAt: new Date() },
        { new: true, runValidators: true }
      );
      if (!customer) return res.status(404).json({ error: "Kund hittades inte" });
      res.json({ message: "Kund uppdaterad", customer });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

app.delete("/admin/customers/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Kund hittades inte" });

    const activeTickets = await Ticket.countDocuments({ customerId: customer._id, status: { $ne: "solved" } });
    if (activeTickets > 0) {
      return res.status(400).json({ error: "Kan inte ta bort kund med aktiva ärenden" });
    }

    await Customer.deleteOne({ _id: customer._id });
    res.json({ message: "Kund borttagen" });
  } catch (err) {
    res.status(500).json({ error: "Kunde inte ta bort kund" });
  }
});

// ... dina övriga routes (tickets, kb, sla, admin, etc.) ...

// Central error handler
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.stack || err);
  if (err.isJoi) {
    return res.status(400).json({ error: err.details.map(d => d.message).join(", ") });
  }
  res.status(500).json({ error: "Internt serverfel" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server körs på http://localhost:${PORT}`);
});