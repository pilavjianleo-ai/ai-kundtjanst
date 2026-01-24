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
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// fetch fallback for Node/Render
let safeFetch = globalThis.fetch;
try {
  if (!safeFetch) safeFetch = require("node-fetch");
} catch {
  // ignore
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "18mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* =====================
   ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
function envOk(name) {
  return process.env[name] ? "OK" : "SAKNAS";
}
console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", envOk("JWT_SECRET"));
console.log("OPENAI_API_KEY:", envOk("OPENAI_API_KEY"));
console.log("OPENAI_MODEL:", process.env.OPENAI_MODEL || "gpt-4o-mini (default)");
console.log("STRIPE_SECRET_KEY:", envOk("STRIPE_SECRET_KEY"));
console.log("STRIPE_WEBHOOK_SECRET:", envOk("STRIPE_WEBHOOK_SECRET"));
console.log("SMTP_HOST:", envOk("SMTP_HOST"));
console.log("APP_URL:", envOk("APP_URL"));

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
   Helpers (oförändrade + små förbättringar)
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

function avg(arr) {
  const a = (arr || []).filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!a.length) return null;
  return Math.round(a.reduce((s, n) => s + n, 0) / a.length);
}

function median(arr) {
  const a = (arr || [])
    .filter((x) => typeof x === "number" && Number.isFinite(x))
    .slice()
    .sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 0) return Math.round((a[mid - 1] + a[mid]) / 2);
  return Math.round(a[mid]);
}

function toCsv(rows) {
  if (!rows || !rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [];
  lines.push(headers.join(","));
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}

function asObjectIdString(v) {
  try {
    return String(v || "");
  } catch {
    return "";
  }
}

function genPublicId(prefix = "T") {
  const rnd = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${rnd}`;
}

/* =====================
   MODELS
===================== */

// User (oförändrad)
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

// NY: Company (kund-CRM + inställningar)
const companySchema = new mongoose.Schema({
  companyId: { type: String, unique: true, required: true },
  displayName: { type: String, required: true },
  orgNumber: { type: String, default: "" },
  address: { type: String, default: "" },
  zipCode: { type: String, default: "" },
  city: { type: String, default: "" },
  contactPerson: { type: String, default: "" },
  contactEmail: { type: String, default: "", index: true },
  contactPhone: { type: String, default: "" },
  status: { 
    type: String, 
    enum: ["trial", "active", "past_due", "canceled", "suspended"],
    default: "trial" 
  },
  plan: { 
    type: String, 
    enum: ["bas", "pro"],
    default: "bas" 
  },
  stripeCustomerId: { type: String, default: "" },
  stripeSubscriptionId: { type: String, default: "" },
  trialEndsAt: { type: Date, default: () => new Date(Date.now() + 14*24*60*60*1000) },
  settings: {
    greeting: { type: String, default: "Hej! 👋 Hur kan jag hjälpa dig idag?" },
    tone: { type: String, default: "professional", enum: ["professional", "friendly", "strict"] },
    language: { type: String, default: "sv" },
    widgetColor: { type: String, default: "#0066cc" },
    widgetPos: { type: String, default: "bottom-right", enum: ["bottom-right", "bottom-left"] },
    allowEmojis: { type: Boolean, default: true },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Company = mongoose.model("Company", companySchema);

// Ticket – utökad med CSAT
const messageSchema = new mongoose.Schema({
  role: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  ticketPublicId: { type: String, unique: true, index: true, default: () => genPublicId("T") },
  publicTicketId: { type: String, unique: true, index: true, default: "" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true, index: true },
  status: { type: String, default: "open" },
  priority: { type: String, default: "normal" },
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
  sla: { /* din befintliga SLA-struktur */ },
  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  // NY: CSAT
  csatRating: { type: Number, min: 1, max: 5, default: null },
  csatComment: { type: String, default: "" },
  csatSubmittedAt: { type: Date, default: null },
});

ticketSchema.pre("save", function (next) {
  if (!this.ticketPublicId) this.ticketPublicId = genPublicId("T");
  if (!this.publicTicketId) this.publicTicketId = this.ticketPublicId;
  next();
});

ticketSchema.index({ lastActivityAt: -1 });
ticketSchema.index({ companyId: 1, status: 1, lastActivityAt: -1 });
ticketSchema.index({ assignedToUserId: 1, lastActivityAt: -1 });

const Ticket = mongoose.model("Ticket", ticketSchema);

// Övriga modeller (KBChunk, Feedback, Category, AISettings, SLAStat) – antas oförändrade från din tidigare kod

/* =====================
   Stripe Webhook
===================== */
app.post("/stripe/webhook", express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Hantera events
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const companyId = session.metadata?.companyId;
      if (companyId) {
        const company = await Company.findOne({ companyId });
        if (company) {
          company.stripeCustomerId = session.customer;
          company.stripeSubscriptionId = session.subscription;
          company.status = 'active';
          company.plan = session.metadata?.plan || 'bas';
          await company.save();
          console.log(`Aktiverade abonnemang för ${companyId}`);
        }
      }
      break;

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      const company = await Company.findOne({ stripeSubscriptionId: subscription.id });
      if (company) {
        company.status = subscription.status;
        await company.save();
        console.log(`Prenumeration ${subscription.status} för ${company.companyId}`);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

/* =====================
   Auth middleware
===================== */
const authenticate = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "Ogiltig token" });
  }
};

const requireAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

const requireAgentOrAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || !["agent", "admin"].includes(user.role)) {
    return res.status(403).json({ error: "Agent eller admin krävs" });
  }
  next();
};

/* =====================
   Company access middleware (enkel version)
===================== */
const requireCompanyAccess = async (req, res, next) => {
  const companyId = req.body.companyId || req.query.companyId || req.params.companyId;
  if (!companyId) return next(); // vissa routes behöver inte companyId

  const user = await User.findById(req.user.id);
  if (user.role === "admin") return next();

  // Enkel check – utöka senare med user → company-relation
  const company = await Company.findOne({ companyId, contactEmail: user.email });
  if (!company) {
    return res.status(403).json({ error: "Du har inte åtkomst till detta företag" });
  }

  req.company = company; // spara för senare användning
  next();
};

/* =====================
   ROUTES – Company CRUD (admin)
===================== */
app.get("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 }).limit(500);
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  const { displayName, orgNumber, address, zipCode, city, contactPerson, contactEmail, contactPhone, plan = "bas" } = req.body;

  if (!displayName || !contactEmail) {
    return res.status(400).json({ error: "Företagsnamn och kontakt-email krävs" });
  }

  try {
    const companyId = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + "-" + crypto.randomBytes(4).toString("hex");

    const company = await new Company({
      companyId,
      displayName,
      orgNumber,
      address,
      zipCode,
      city,
      contactPerson,
      contactEmail,
      contactPhone,
      plan,
    }).save();

    res.json({ message: "Kund skapad", company });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/admin/companies/:companyId", authenticate, requireAdmin, async (req, res) => {
  try {
    const company = await Company.findOne({ companyId: req.params.companyId });
    if (!company) return res.status(404).json({ error: "Kund hittades inte" });

    Object.assign(company, req.body);
    company.updatedAt = new Date();
    await company.save();

    res.json({ message: "Kund uppdaterad", company });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   Kundspecifika inställningar
===================== */
app.get("/company/settings", authenticate, requireCompanyAccess, async (req, res) => {
  try {
    const companyId = req.query.companyId || req.company?.companyId;
    const company = await Company.findOne({ companyId });
    if (!company) return res.status(404).json({ error: "Företag saknas" });

    res.json(company.settings || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/company/settings", authenticate, requireCompanyAccess, async (req, res) => {
  try {
    const companyId = req.body.companyId || req.company?.companyId;
    const company = await Company.findOne({ companyId });
    if (!company) return res.status(404).json({ error: "Företag saknas" });

    if (req.body.settings && typeof req.body.settings === "object") {
      company.settings = { ...company.settings, ...req.body.settings };
    }

    company.updatedAt = new Date();
    await company.save();

    res.json({ message: "Inställningar sparade", settings: company.settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   Simulator / Förhandsvisning
===================== */
app.post("/company/simulator", authenticate, requireCompanyAccess, async (req, res) => {
  try {
    const { companyId, message = "Hej, hur fungerar er tjänst?" } = req.body;

    const company = await Company.findOne({ companyId });
    if (!company) return res.status(404).json({ error: "Företag saknas" });

    const toneExtra =
      company.settings.tone === "friendly"
        ? "Ton: varm, hjälpsam, enkel."
        : company.settings.tone === "strict"
        ? "Ton: saklig, kort, tydlig. Undvik spekulation."
        : "Ton: professionell, tydlig, konkret.";

    const systemMsg = {
      role: "system",
      content: `Du är en kundtjänst för ${company.displayName}. ${toneExtra} Svara på svenska. Hälsningsfras: ${company.settings.greeting}`,
    };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [systemMsg, { role: "user", content: message }],
      temperature: 0.5,
    });

    const previewReply = completion.choices[0]?.message?.content || "Inget svar.";

    res.json({
      preview: {
        greeting: company.settings.greeting,
        tone: company.settings.tone,
        widgetColor: company.settings.widgetColor,
        widgetPos: company.settings.widgetPos,
        replyExample: previewReply,
      }
    });
  } catch (err) {
    console.error("Simulator error:", err);
    res.status(500).json({ error: "Kunde inte generera förhandsvisning" });
  }
});

/* =====================
   Billing – Stripe Checkout
===================== */
app.post("/billing/create-checkout", authenticate, requireCompanyAccess, async (req, res) => {
  try {
    const { plan = "pro", companyId } = req.body;

    const company = await Company.findOne({ companyId });
    if (!company) return res.status(404).json({ error: "Företag saknas" });

    const session = await stripe.checkout.sessions.create({
      customer: company.stripeCustomerId || undefined,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env[`STRIPE_${plan.toUpperCase()}_PRICE_ID`],
          quantity: 1,
        },
      ],
      success_url: `${process.env.APP_URL || "http://localhost:3000"}/?success=true`,
      cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/?canceled=true`,
      metadata: { companyId: company.companyId, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/billing/history", authenticate, requireCompanyAccess, async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const company = await Company.findOne({ companyId });
    if (!company || !company.stripeCustomerId) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: company.stripeCustomerId,
      limit: 12,
    });

    res.json({ invoices: invoices.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   CSAT endpoint
===================== */
app.post("/tickets/:ticketId/csat", authenticate, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Betyg måste vara mellan 1 och 5" });
    }

    const ticket = await Ticket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ error: "Ärende hittades inte" });

    if (ticket.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Detta är inte ditt ärende" });
    }

    if (ticket.status !== "solved") {
      return res.status(400).json({ error: "Kan bara betygsätta lösta ärenden" });
    }

    ticket.csatRating = rating;
    ticket.csatComment = comment || "";
    ticket.csatSubmittedAt = new Date();
    await ticket.save();

    res.json({ message: "Tack för ditt betyg!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   Din befintliga kod fortsätter här...
   (lägg in all din tidigare kod för /chat, /my/tickets, /admin/tickets, KB, SLA etc.)
===================== */

// Exempel – din /chat-route (uppdaterad med company-inställningar)
app.post("/chat", authenticate, requireCompanyAccess, async (req, res) => {
  try {
    const { companyId, conversation, ticketId } = req.body || {};
    if (!companyId || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "companyId eller konversation saknas" });
    }

    // ... din befintliga ticket-logik ...

    const company = await Company.findOne({ companyId });

    const tone = company?.settings?.tone || "professional";
    const toneExtra =
      tone === "friendly"
        ? "Ton: varm, hjälpsam, enkel."
        : tone === "strict"
        ? "Ton: saklig, kort, tydlig. Undvik spekulation."
        : "Ton: professionell, tydlig, konkret.";

    const allowEmojis = company?.settings?.allowEmojis !== false;
    const greeting = company?.settings?.greeting || "Hej! 👋 Hur kan jag hjälpa dig idag?";

    // ... fortsätt med din ragSearch, systemPrompt, openai.create etc. ...

    // När du skickar svar, inkludera ticket så frontend kan kolla om solved
    return res.json({
      reply,
      ticketId: ticket._id,
      ticketPublicId: ticket.ticketPublicId,
      ragUsed: rag.used,
      sources: rag.sources,
      ticket: { status: ticket.status } // minimal info för CSAT-trigger
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Serverfel vid chat" });
  }
});

// ... resten av dina routes (auth, tickets, kb, sla, categories etc.) ...

/* =====================
   Start server
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servern körs på http://localhost:${PORT}`);
});