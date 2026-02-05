require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sanitizeHtml = require("sanitize-html");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");
const pdf = require("pdf-parse");
const OpenAI = require("openai");

/* =====================
   Init & Config
===================== */
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "18mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend strictly from 'public'
app.use(express.static(path.join(__dirname, "public")));

app.use(
  cors({
    origin: process.env.APP_URL || true,
    credentials: true,
  })
);

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Stripe
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
   ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("STRIPE:", stripe ? "OK" : "SAKNAS");
console.log("PORT:", process.env.PORT || 3000);

/* =====================
   MongoDB
===================== */
mongoose.set("strictQuery", true);
mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB ansluten"))
  .catch((err) => console.error("❌ MongoDB-fel:", err.message));

/* =====================
   Multer (Uploads)
===================== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

// Company
const companySchema = new mongoose.Schema({
  companyId: { type: String, unique: true, required: true },
  displayName: { type: String, required: true },
  orgNumber: { type: String, default: "" },
  contactEmail: { type: String, default: "" },
  status: { type: String, enum: ["trial", "active", "past_due", "canceled"], default: "trial" },
  plan: { type: String, enum: ["bas", "pro"], default: "bas" },
  settings: {
    greeting: { type: String, default: "Hej! 👋 Hur kan jag hjälpa dig idag?" },
    tone: { type: String, default: "professional", enum: ["professional", "friendly", "strict"] },
    widgetColor: { type: String, default: "#0066cc" },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Company = mongoose.model("Company", companySchema);

// Knowledge Base Document
const documentSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true }, // The indexed text
  sourceType: { type: String, enum: ["text", "url", "pdf"], required: true },
  sourceUrl: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});
const Document = mongoose.model("Document", documentSchema);

// Ticket & Messages
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
  messages: [messageSchema],
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  csatRating: { type: Number, min: 1, max: 5, default: null },
});
const Ticket = mongoose.model("Ticket", ticketSchema);

/* =====================
   Auth Permissions
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
  next();
};

const requireAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

/* =====================
   Routes
===================== */

app.get("/health", (req, res) => res.json({ ok: true }));

// AUTH
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Användarnamn/lösenord krävs" });
    if (await User.findOne({ username })) return res.status(400).json({ error: "Upptaget användarnamn" });

    const user = await new User({
      username,
      email: email || "",
      password: await bcrypt.hash(password, 10),
      role: "user",
    }).save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Fel inloggningsuppgifter" });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/me", authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user || null);
});

// COMPANIES
app.get("/companies", authenticate, async (req, res) => {
  let count = await Company.countDocuments({});
  if (count === 0) {
    await new Company({ companyId: "demo", displayName: "Demo" }).save();
  }
  const companies = await Company.find({}).sort({ createdAt: -1 }).limit(50);
  res.json(companies);
});

// COMPANY SETTINGS (User/Public view)
app.get("/company/settings", authenticate, async (req, res) => {
  const company = await Company.findOne({ companyId: req.query.companyId });
  if (!company) return res.status(404).json({ error: "Hittades ej" });
  res.json(company.settings);
});

app.patch("/company/settings", authenticate, async (req, res) => {
  const { companyId, settings } = req.body;
  const company = await Company.findOne({ companyId });
  if (!company) return res.status(404).json({ error: "Hittades ej" });
  company.settings = { ...company.settings, ...settings };
  await company.save();
  res.json({ message: "Sparat", settings: company.settings });
});

/* =====================
   KNOWLEDGE BASE (KB)
   - Real implementations
===================== */

// List docs
app.get("/admin/kb", authenticate, requireAdmin, async (req, res) => {
  const { companyId } = req.query;
  const query = companyId ? { companyId } : {};
  const docs = await Document.find(query).sort({ createdAt: -1 }).limit(100);
  res.json(docs);
});

// Delete doc
app.delete("/admin/kb/:id", authenticate, requireAdmin, async (req, res) => {
  await Document.findByIdAndDelete(req.params.id);
  res.json({ message: "Borttagen" });
});

// Upload Text
app.post("/admin/kb/text", authenticate, requireAdmin, async (req, res) => {
  const { companyId, title, content } = req.body;
  if (!companyId || !content) return res.status(400).json({ error: "Saknar data" });

  await new Document({
    companyId,
    title: title || "Text snippet",
    content: cleanText(content),
    sourceType: "text",
  }).save();

  res.json({ message: "Sparad" });
});

// Upload URL
app.post("/admin/kb/url", authenticate, requireAdmin, async (req, res) => {
  const { companyId, url } = req.body;
  if (!url) return res.status(400).json({ error: "Saknar URL" });

  try {
    const fetch = (await import("node-fetch")).default;
    const r = await fetch(url);
    const html = await r.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) throw new Error("Kunde inte läsa innehåll");

    await new Document({
      companyId,
      title: article.title || url,
      content: cleanText(article.textContent),
      sourceType: "url",
      sourceUrl: url,
    }).save();

    res.json({ message: "URL tolkad och sparad" });
  } catch (e) {
    res.status(500).json({ error: "URL-fel: " + e.message });
  }
});

// Upload PDF
app.post("/admin/kb/pdf", authenticate, requireAdmin, upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Ingen fil" });
  const { companyId } = req.body;

  try {
    const data = await pdf(req.file.buffer);
    await new Document({
      companyId: companyId || "demo",
      title: req.file.originalname,
      content: cleanText(data.text),
      sourceType: "pdf",
    }).save();
    res.json({ message: "PDF sparad" });
  } catch (e) {
    res.status(500).json({ error: "PDF-fel: " + e.message });
  }
});

/* =====================
   OpenAI Chat Functions
===================== */
async function generateAIResponse(companyId, messages, userMessage) {
  // 1. Fetch relevant KB docs (Simple Keyword Search for now, or just all for this company if small)
  // Simple optimization: Get last 5 docs. Ideally: Vector Search.
  const docs = await Document.find({ companyId }).limit(10);
  const context = docs.map((d) => `[Info: ${d.title}]\n${d.content.slice(0, 1000)}`).join("\n\n");

  const company = await Company.findOne({ companyId });
  const tone = company?.settings?.tone || "professional";

  const systemPrompt = `
Du är en AI-kundtjänstagent.${company ? " För företaget " + company.displayName + "." : ""}
Ton: ${tone}.
Språk: Svenska.

Här är kunskapsbasen (Fakta):
${context}

Använd informationen ovan för att svara. Om svaret inte finns, be kunden kontakta support via email.
Hitta inte på information.
  `;

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role === "assistant" || m.role === "agent" ? "assistant" : "user", content: m.content })),
    { role: "user", content: userMessage },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cost effective
      messages: apiMessages,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content || "Jag förstod inte riktigt.";
  } catch (e) {
    console.error("OpenAI Error:", e);
    return "Förlåt, jag har tekniska problem just nu.";
  }
}

/* =====================
   Endpoints: Chat & Tickets
===================== */

app.post("/chat", authenticate, async (req, res) => {
  try {
    const { companyId = "demo", conversation = [], ticketId } = req.body;
    const lastUserMsg = conversation.length > 0 ? conversation[conversation.length - 1].content : "";
    if (!lastUserMsg) return res.json({ reply: "Hej?" });

    // Ticket mgmt
    let ticket = null;
    if (ticketId) ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      ticket = await new Ticket({
        userId: req.user.id,
        companyId,
        title: lastUserMsg.slice(0, 60),
        messages: [],
      }).save();
    }

    ticket.messages.push({ role: "user", content: cleanText(lastUserMsg) });

    // REAL AI GENERATION
    const reply = await generateAIResponse(companyId, ticket.messages, lastUserMsg);

    ticket.messages.push({ role: "assistant", content: reply });
    ticket.lastActivityAt = new Date();
    await ticket.save();

    res.json({
      reply,
      ticketId: ticket._id,
      ticketPublicId: ticket.ticketPublicId,
    });
  } catch (e) {
    console.error("Chat error:", e);
    res.status(500).json({ error: "Serverfel" });
  }
});

app.post("/company/simulator", authenticate, async (req, res) => {
  const { companyId, message } = req.body;
  const reply = await generateAIResponse(companyId || "demo", [], message || "Hej");

  const company = await Company.findOne({ companyId });
  res.json({
    preview: {
      greeting: company?.settings?.greeting || "Hej",
      tone: company?.settings?.tone || "ok",
      replyExample: reply,
      widgetColor: company?.settings?.widgetColor,
    },
  });
});

app.get("/tickets/my", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(tickets);
});

app.get("/tickets/:id", authenticate, async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (ticket.userId.toString() !== req.user.id) return res.status(403).json({ error: "Ej behörig" });
  res.json(ticket);
});

app.post("/tickets/:id/reply", authenticate, async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (ticket.userId.toString() !== req.user.id) return res.status(403).json({ error: "Ej behörig" });

  const text = req.body.message;
  ticket.messages.push({ role: "user", content: text });

  // Auto-AI reply if status is not 'solved'? Or always AI?
  // Usually if user replies, AI might answer again if no agent attached.
  if (!ticket.assignedToUserId) {
    const reply = await generateAIResponse(ticket.companyId, ticket.messages, text);
    ticket.messages.push({ role: "assistant", content: reply });
  }

  ticket.lastActivityAt = new Date();
  await ticket.save();
  res.json({ message: "Skickat", ticket });
});

/* =====================
   Inbox (Agent)
===================== */
app.get("/inbox/tickets", authenticate, requireAgent, async (req, res) => {
  const { status, companyId } = req.query;
  const q = {};
  if (status) q.status = status;
  if (companyId) q.companyId = companyId;
  const tickets = await Ticket.find(q).sort({ lastActivityAt: -1 }).limit(1000);
  res.json(tickets);
});

app.patch("/inbox/tickets/:id/status", authenticate, requireAgent, async (req, res) => {
  const t = await Ticket.findById(req.params.id);
  t.status = req.body.status;
  if (t.status === "solved") t.solvedAt = new Date();
  t.lastActivityAt = new Date();
  await t.save();
  res.json({ message: "Uppdaterad" });
});

app.post("/inbox/tickets/:id/reply", authenticate, requireAgent, async (req, res) => {
  const t = await Ticket.findById(req.params.id);
  t.messages.push({ role: "agent", content: req.body.message });
  t.agentUserId = req.user.id;
  if (!t.firstAgentReplyAt) t.firstAgentReplyAt = new Date();
  t.lastActivityAt = new Date();
  await t.save();
  res.json({ message: "Svarat" });
});

/* =====================
   Admin & Stats
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  res.json(await User.find({}).sort({ createdAt: -1 }));
});

app.delete("/sla/clear/all", authenticate, requireAdmin, async (req, res) => {
  await Ticket.deleteMany({});
  res.json({ message: "All statistik raderad." });
});

app.delete("/sla/clear/my", authenticate, requireAgent, async (req, res) => {
  // Not really logic to delete "my" stats without deleting tickets involving me. 
  // Let's just clear tickets assigned to me.
  await Ticket.deleteMany({ agentUserId: req.user.id });
  res.json({ message: "Dina ärenden rensade." });
});

app.get("/sla/overview", authenticate, requireAgent, async (req, res) => {
  // Basic implementation re-added
  const tickets = await Ticket.find({});
  res.json({
    days: 30,
    counts: {
      total: tickets.length,
      solved: tickets.filter(t => t.status === "solved").length,
      open: tickets.filter(t => t.status === "open").length,
      pending: tickets.filter(t => t.status === "pending").length
    }
  });
});

/* =====================
   Fallback
===================== */
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server körs: http://localhost:${PORT}`));