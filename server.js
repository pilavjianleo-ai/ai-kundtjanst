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

// Stripe – görs valfritt
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

// fetch fallback
let safeFetch = globalThis.fetch;
try {
  if (!safeFetch) safeFetch = require("node-fetch");
} catch {}

// Express
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "18mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* =====================
   ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("STRIPE_SECRET_KEY:", process.env.STRIPE_SECRET_KEY ? "OK (aktiverad)" : "SAKNAS – Stripe avstängd");
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
  role: { type: String, default: "user" },
  resetTokenHash: { type: String, default: "" },
  resetTokenExpiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

// Company (kund-CRM + inställningar)
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

// Ticket (med CSAT)
const messageSchema = new mongoose.Schema({
  role: String,
  content: String,
  timestamp: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  ticketPublicId: { type: String, unique: true, index: true, default: () => genPublicId("T") },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true, index: true },
  status: { type: String, default: "open" },
  priority: { type: String, default: "normal" },
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

// Lägg till dina andra modeller här (KBChunk, Feedback, Category, AISettings, SLAStat) om de inte redan finns

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

const requireAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

/* =====================
   ROUTES – Company
===================== */
app.get("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  const companies = await Company.find({}).sort({ createdAt: -1 });
  res.json(companies);
});

app.post("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  const { displayName, orgNumber, contactEmail } = req.body;
  if (!displayName || !contactEmail) return res.status(400).json({ error: "Namn och email krävs" });

  const companyId = displayName.toLowerCase().replace(/\s+/g, "-") + "-" + crypto.randomBytes(4).toString("hex");

  const company = await new Company({ companyId, displayName, orgNumber, contactEmail }).save();
  res.json(company);
});

/* =====================
   Kundinställningar
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
  await company.save();
  res.json({ message: "Sparat", settings: company.settings });
});

/* =====================
   Simulator
===================== */
app.post("/company/simulator", authenticate, async (req, res) => {
  const { companyId, message } = req.body;
  const company = await Company.findOne({ companyId });
  if (!company) return res.status(404).json({ error: "Företag saknas" });

  const toneExtra = company.settings.tone === "friendly"
    ? "Ton: varm, hjälpsam, enkel."
    : company.settings.tone === "strict"
    ? "Ton: saklig, kort, tydlig."
    : "Ton: professionell, tydlig, konkret.";

  res.json({
    preview: {
      greeting: company.settings.greeting,
      tone: company.settings.tone,
      widgetColor: company.settings.widgetColor,
      replyExample: `Simulerat svar till "${message}" med ton ${company.settings.tone}`
    }
  });
});

/* =====================
   CSAT
===================== */
app.post("/tickets/:ticketId/csat", authenticate, async (req, res) => {
  const { rating, comment } = req.body;
  if (rating < 1 || rating > 5) return res.status(400).json({ error: "Betyg 1–5" });

  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket || ticket.userId.toString() !== req.user.id) {
    return res.status(403).json({ error: "Ej ditt ärende" });
  }

  ticket.csatRating = rating;
  ticket.csatComment = comment || "";
  ticket.csatSubmittedAt = new Date();
  await ticket.save();

  res.json({ message: "Tack för betyget!" });
});

/* =====================
   Stripe – valfritt
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
   Din övriga kod här (chat, tickets, kb, sla, auth etc.)
   Lägg in allt du hade tidigare under denna kommentar
===================== */

// Exempel på /chat (anpassad med company)
app.post("/chat", authenticate, async (req, res) => {
  // ... din befintliga kod ...
  // Använd company.settings om du vill
  res.json({ reply: "Test-svar från server" });
});

// Starta servern
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server körs på http://localhost:${PORT}`);
});