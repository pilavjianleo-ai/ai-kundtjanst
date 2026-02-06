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
const http = require("http");
const { Server } = require("socket.io");

/* =====================
   Init & Config
===================== */
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", credentials: true }
});

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
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (stripeKey && stripeKey !== "demo_key") {
  try {
    const Stripe = require("stripe");
    stripe = new Stripe(stripeKey);
    console.log("✅ Stripe aktiverad");
  } catch (err) {
    console.error("❌ Kunde inte initiera Stripe:", err.message);
  }
} else {
  console.log("⚠️ Stripe i DEMO-LÄGE (Ingen skarp nyckel hittades)");
}

/* =====================
   ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
console.log("---------------------------------------");
console.log("🚀 STARTING AI KUNDTJÄNST 4.0");
console.log("📍 MongoDB:", mongoUri ? "OK" : "MISSING");
console.log("📍 OpenAI:", process.env.OPENAI_API_KEY ? "OK" : "MISSING (Will use Mock AI)");
console.log("---------------------------------------");

/* =====================
   MongoDB
===================== */
mongoose.set("strictQuery", true);
mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("✅ MongoDB ansluten");
  })
  .catch((err) => console.error("❌ MongoDB-fel:", err));

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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  publicTicketId: { type: String, unique: true, index: true, default: () => genPublicId("T") },
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

// Run database fixes and index cleanup after models are defined
(async () => {
  try {
    // Wait for connection to be stable
    setTimeout(async () => {
      if (mongoose.connection.readyState !== 1) return;

      console.log("🧹 DB CLEANUP: Rensar gamla index...");
      const collection = mongoose.connection.collection('tickets');

      // Drop any potentially conflicting old indexes
      await collection.dropIndex("publicId_1").catch(() => { });
      await collection.dropIndex("ticketPublicId_1").catch(() => { });
      await collection.dropIndex("publicTicketId_1").catch(() => { }); // Re-create fresh if needed

      // Find tickets needing ID
      const tickets = await Ticket.find({
        $or: [
          { publicTicketId: { $exists: false } },
          { publicTicketId: null }
        ]
      });

      if (tickets.length > 0) {
        console.log(`🛠 MIGRATION: Fixar ${tickets.length} tickets som saknar ID...`);
        for (const t of tickets) {
          t.publicTicketId = genPublicId("T");
          await t.save().catch(err => console.error(`Failed to fix ticket ${t._id}:`, err.message));
        }
        console.log("✅ MIGRATION: Färdig.");
      }
    }, 5000);
  } catch (e) { console.error("🔥 Critical Migration Error:", e); }
})();

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
app.get("/me/stats", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let stats = { role };

    if (role === "user") {
      stats.ticketsCreated = await Ticket.countDocuments({ createdByUserId: userId });
      stats.ticketsResolved = await Ticket.countDocuments({ createdByUserId: userId, status: "solved" });
    } else if (role === "agent" || role === "admin") {
      stats.ticketsHandled = await Ticket.countDocuments({ assignedToUserId: userId });
      stats.ticketsSolved = await Ticket.countDocuments({ assignedToUserId: userId, status: "solved" });
      if (role === "admin") {
        stats.totalSystemTickets = await Ticket.countDocuments();
        stats.totalUsers = await User.countDocuments();
      }
    }

    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
  try {
    const { companyId } = req.query;
    const query = companyId ? { companyId } : {};
    const docs = await Document.find(query).sort({ createdAt: -1 }).limit(100);
    res.json(docs || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete doc
app.delete("/admin/kb/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: "Borttagen" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  console.log(`🌐 KB URL Upload: ${url} för ${companyId}`);
  if (!url) return res.status(400).json({ error: "Saknar URL" });

  try {
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    if (!response.ok) throw new Error(`URL returnerade status ${response.status}`);

    const html = await response.text();
    if (!html) throw new Error("Inget innehåll returnerades från webbsidan.");

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      throw new Error("Kunde inte extrahera textinnehåll från denna URL. Sidan kan vara skyddad eller dynamisk.");
    }

    const doc = new Document({
      companyId: companyId || "demo",
      title: article.title || url,
      content: cleanText(article.textContent),
      sourceType: "url",
      sourceUrl: url,
    });

    await doc.save();
    console.log(`✅ URL sparad: ${article.title}`);
    res.json({ message: "URL tolkad och sparad", title: article.title });
  } catch (e) {
    console.error("❌ KB URL ERROR:", e.message);
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
  try {
    // 1. Fetch relevant KB docs
    const keywords = userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    let docs = [];
    if (keywords.length > 0) {
      console.log(`🔍 Söker KB med nyckelord: ${keywords.join(", ")}`);
      // Use $or with multiple regexes for better Mongoose compatibility
      const orConditions = keywords.flatMap(kw => [
        { title: { $regex: escapeRegExp(kw), $options: 'i' } },
        { content: { $regex: escapeRegExp(kw), $options: 'i' } }
      ]);

      docs = await Document.find({
        companyId,
        $or: orConditions
      }).limit(5);
    }

    if (docs.length === 0) {
      docs = await Document.find({ companyId }).sort({ createdAt: -1 }).limit(5);
    }

    const context = docs.map((d) => `[Fakta: ${d.title}]\n${d.content.slice(0, 1500)}`).join("\n\n");
    const company = await Company.findOne({ companyId });
    const tone = company?.settings?.tone || "professional";

    const systemPrompt = `
Du är en expert-AI-kundtjänstagent för företaget "${company?.displayName || "vår tjänst"}".
DIN ROLL: Hjälp kunden snabbt, vänligt och professionellt. Du är systemets ansikte utåt.
TONALITET: ${tone === 'friendly' ? 'Varm, glad och informell' : (tone === 'strict' ? 'Korrekt, formell och faktacentrerad' : 'Hjälpsam, lugn och professionell')}.
SPRÅK: Alltid svenska.

INSTRUKTIONER:
1. Använd endast tillhandahållen FAKTA nedan. Var källkritisk.
2. Om svaret inte finns i fakta, säg: "Jag hittar tyvärr ingen specifik information om det, men jag skapar en prioriterad ticket så att en expert kan återkomma till dig."
3. Om kunden verkar missnöjd eller ber om en "människa", svara: "Jag förstår, jag kopplar dig vidare till en av våra mänskliga agenter direkt så hjälper de dig vidare."
4. Var koncis men varm. Använd emojis sparsamt och proffsigt.

FAKTA/KONTEXT:
${context || "Ingen specifik fakta tillgänglig för tillfället. Svara generellt om ditt företag och be om kontaktuppgifter."}

Aktuell tid: ${new Date().toLocaleString('sv-SE')}
    `;

    // Fail-safe: Check if OpenAI is actually working
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("INSERT")) {
      throw new Error("Missing Key");
    }

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-6).map((m) => ({
        role: m.role === "assistant" || m.role === "agent" ? "assistant" : "user",
        content: m.content
      })),
      { role: "user", content: userMessage },
    ];

    console.log(`🧠 Skickar till OpenAI (${apiMessages.length} meddelanden)...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 800
    });

    const result = completion.choices[0]?.message?.content || "Jag kunde tyvärr inte generera ett svar just nu.";
    console.log("✅ AI-svar genererat.");
    return result;
  } catch (e) {
    console.log("AI FAILSAFE TRIGGERED:", e.message);
    // SMART FAILBACK: Local Response logic
    const input = userMessage.toLowerCase();

    // Check if it's a quota issue to give a better tip
    if (e.message.includes("quota") || e.message.includes("429")) {
      return "Tack för ditt meddelande! Systemet är för tillfället i begränsat läge (OpenAI Quota slut). En mänsklig agent har notifierats och kommer hjälpa dig så snart som möjligt. 😊";
    }

    if (input.includes("hej") || input.includes("tja")) return "Hej! 👋 Hur kan jag stå till tjänst idag? (AI i begränsat läge)";
    if (input.includes("pris") || input.includes("kosta")) return "Vi har olika prisplaner. Kontakta gärna vår säljavdelning för en offert! (AI i begränsat läge)";
    return "Tack för ditt meddelande. En av våra agenter kommer att titta på detta så snart som möjligt. (AI i begränsat läge)";
  }
}

/* =====================
   Endpoints: Chat & Tickets
===================== */

app.post("/chat", authenticate, async (req, res) => {
  const fs = require("fs");
  const log = (msg) => fs.appendFileSync("chat_debug.log", `[${new Date().toISOString()}] ${msg}\n`);

  try {
    const { companyId = "demo", conversation = [], ticketId } = req.body;
    log(`START: companyId=${companyId}, ticketId=${ticketId}, user=${req.user?.id}`);

    const lastMsgObj = conversation.length > 0 ? conversation[conversation.length - 1] : null;
    const lastUserMsg = lastMsgObj ? lastMsgObj.content : "";

    if (!lastUserMsg) {
      log("EMPTY MESSAGE");
      return res.json({ reply: "Hur kan jag hjälpa dig idag? 😊" });
    }

    let ticket = null;
    if (ticketId && mongoose.Types.ObjectId.isValid(ticketId)) {
      ticket = await Ticket.findById(ticketId);
    }

    if (!ticket) {
      log("CREATING NEW TICKET");
      ticket = new Ticket({
        userId: req.user.id,
        companyId: companyId || "demo",
        title: lastUserMsg.slice(0, 50),
        messages: [],
        priority: "normal"
      });
      await ticket.save(); // Save to generate publicTicketId
      console.log(`🆕 Ny ticket skapad: ${ticket.publicTicketId}`);
    } else {
      log("USING EXISTING TICKET");
    }

    // Safety check messages
    if (!Array.isArray(ticket.messages)) ticket.messages = [];
    ticket.messages.push({ role: "user", content: cleanText(lastUserMsg) });

    // AI Generation
    let reply = "";
    try {
      log("START AI GENERATION");
      if (io) io.emit("aiTyping", { ticketId: ticket._id, companyId });
      reply = await generateAIResponse(companyId, ticket.messages, lastUserMsg);
      log("FINISH AI GENERATION");
    } catch (aiErr) {
      log(`AI CRASH: ${aiErr.message}`);
      reply = "Tekniskt fel vid AI-generering. En agent har notifierats.";
    }

    // AI Intent & Handoff
    const msgLow = lastUserMsg.toLowerCase();
    const needsHuman = ["människa", "person", "agent", "riktig", "arg", "besviken"].some(w => msgLow.includes(w)) || (reply && reply.includes("koppla dig vidare"));

    if (needsHuman) {
      ticket.priority = "high";
      ticket.status = "open";
      if (io) io.emit("newImportantTicket", { id: ticket._id, title: "HUMAN REQUIRED: " + ticket.title });
    }

    const isUrgent = ["akut", "bråttom", "panik", "fungerar inte", "fel"].some(w => msgLow.includes(w));
    if (isUrgent) {
      ticket.priority = "high";
      if (io) io.emit("newImportantTicket", { id: ticket._id, title: ticket.title });
    }

    ticket.messages.push({ role: "assistant", content: reply });
    ticket.lastActivityAt = new Date();

    log("SAVING TICKET...");
    await ticket.save();
    log("TICKET SAVED");

    if (io) io.emit("ticketUpdate", { ticketId: ticket._id, companyId });

    log("SENDING JSON RESPONSE");

    res.json({
      reply,
      ticketId: ticket._id,
      publicTicketId: ticket.publicTicketId,
      priority: ticket.priority,
      needsHuman
    });
  } catch (e) {
    console.error("🚨 CRITICAL CHAT 500 ERROR:", e);
    const fs = require("fs");
    fs.appendFileSync("debug_crash.log", `[${new Date().toISOString()}] CHAT ERROR: ${e.stack}\n`);
    res.status(500).json({ error: "Internt fel i chat-tjänsten. Vänligen prova igen om en stund." });
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

app.patch("/inbox/tickets/:id/priority", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    t.priority = req.body.priority || "normal";
    await t.save();
    res.json({ message: "Prioritet uppdaterad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/inbox/tickets/:id/reply", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    t.messages.push({ role: "agent", content: req.body.message });
    t.agentUserId = req.user.id;
    if (!t.firstAgentReplyAt) t.firstAgentReplyAt = new Date();
    t.status = "pending"; // Auto-status change when agent replies
    t.lastActivityAt = new Date();
    await t.save();
    res.json({ message: "Svarat" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/inbox/tickets/:id/note", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    t.internalNotes.push({ createdBy: req.user.id, content: req.body.content, createdAt: new Date() });
    await t.save();
    res.json({ message: "Note sparad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/inbox/tickets/:id/notes", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    t.internalNotes = [];
    await t.save();
    res.json({ message: "Notes raderade" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/inbox/tickets/:id/assign", authenticate, requireAgent, async (req, res) => {
  try {
    const { userId } = req.body;
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    t.assignedToUserId = userId || null;
    await t.save();
    res.json({ message: "Ticket tilldelad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/inbox/tickets/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ message: "Ticket raderad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =====================
   Admin, CRM & SLA
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).select("-password");
    res.json(users || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/admin/users/:id/role", authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });
    await User.findByIdAndUpdate(req.params.id, { role });
    res.json({ message: "Roll uppdaterad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/inbox/tickets/solve-all", authenticate, requireAgent, async (req, res) => {
  try {
    await Ticket.updateMany({ status: { $ne: "solved" } }, { status: "solved", solvedAt: new Date() });
    io.emit("ticketUpdate", { message: "Bulk solve completed" });
    res.json({ message: "Alla ärenden markerade som lösta" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 });
    res.json(companies || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  try {
    const { displayName, companyId, contactEmail, plan, orgNumber } = req.body;
    if (!displayName) return res.status(400).json({ error: "Namn krävs" });

    // Generate simple ID if missing
    const cid = companyId || displayName.toLowerCase().replace(/[^a-z0-0]/g, "") + Math.floor(Math.random() * 1000);

    const company = new Company({
      companyId: cid,
      displayName,
      contactEmail: contactEmail || "",
      orgNumber: orgNumber || "",
      plan: plan || "bas",
      status: "trial"
    });
    await company.save();
    res.json({ message: "Skapat", company });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Billing */
app.get("/billing/details", authenticate, async (req, res) => {
  try {
    const company = await Company.findOne({ companyId: req.user.companyId || "demo" });
    const ticketCount = await Ticket.countDocuments({ companyId: company?.companyId });

    const plan = company?.plan || "bas";
    const limit = plan === "pro" ? 5000 : 500;
    const usagePercent = Math.min(100, Math.round((ticketCount / limit) * 100));

    // Plan metadata for the UI
    const planMeta = {
      bas: {
        name: "Bas-paketet",
        price: "Gratis / Demo",
        features: ["500 AI-meddelanden/mån", "1 Agent-konto", "Standard AI-modell", "E-postsupport"]
      },
      pro: {
        name: "PRO Professional",
        price: "499 kr/mån",
        features: ["5000 AI-meddelanden/mån", "Obegränsat med agenter", "GPT-4 Turbo Access", "Prioriterad support", "Anpassad branding", "SLA-garanti"]
      }
    };

    res.json({
      plan: plan,
      planInfo: planMeta[plan] || planMeta.bas,
      status: "Aktiv",
      usage: {
        percent: usagePercent,
        current: ticketCount,
        limit: limit
      },
      nextInvoice: "2026-03-24",
      allPlans: planMeta
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Billing History */
app.get("/billing/history", authenticate, async (req, res) => {
  try {
    // Return mock invoices for demo feel
    const invoices = [
      { id: "inv_1", date: "2026-02-01", amount: "499 kr", status: "Betald", url: "#" },
      { id: "inv_2", date: "2026-01-01", amount: "499 kr", status: "Betald", url: "#" },
      { id: "inv_3", date: "2025-12-01", amount: "499 kr", status: "Betald", url: "#" }
    ];
    res.json({ invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/billing/create-checkout", authenticate, async (req, res) => {
  try {
    const { plan, companyId } = req.body;
    if (!stripe) {
      // DEMO MODE SUCCESS
      return res.json({
        url: "/#billing",
        message: "DEMO: Betalning lyckades (Simulerat då Stripe saknas i .env)"
      });
    }
    // REAL STRIPE (Add real logic here if key exists)
    res.json({ url: "#", message: "Stripe checkout påbörjad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Ticket Summarization (AI Added Value) */
app.get("/tickets/:id/summary", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    const text = t.messages.map(m => m.content).join(" ");
    const summary = await generateAIResponse(t.companyId, [], `Sammanfatta detta ärende extremt kortfattat: ${text}`);
    res.json({ summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* SLA Metrics - Data Driven */
app.get("/sla/overview", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const tickets = await Ticket.find({ createdAt: { $gte: since } });

    // Basic Metrics
    const total = tickets.length;
    const solved = tickets.filter(t => t.status === "solved");
    const handoffs = tickets.filter(t => t.assignedToUserId).length;

    // AI Solve Rate Calculation
    // If a ticket is solved and no agent was ever assigned, we consider it AI solved
    const aiSolved = solved.filter(t => !t.assignedToUserId).length;
    const aiRate = total > 0 ? ((aiSolved / total) * 100).toFixed(1) : 0;

    // SLA Calculations (Hours)
    let totalResolveSum = 0;
    solved.forEach(t => {
      if (t.solvedAt && t.createdAt) {
        totalResolveSum += (t.solvedAt - t.createdAt) / (1000 * 60 * 60);
      }
    });
    const avgSolveHours = solved.length > 0 ? (totalResolveSum / solved.length).toFixed(1) : "0.0";

    // CSAT
    const ratings = solved.filter(t => t.csatRating).map(t => t.csatRating);
    const avgCsat = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "Ej beräknat";

    res.json({
      days: parseInt(days),
      counts: {
        total,
        solved: solved.length,
        open: tickets.filter(t => t.status === "open").length,
        pending: tickets.filter(t => t.status === "pending").length,
        handoffs
      },
      aiRate,
      avgFirstReplyHours: 0.8, // Simulation or real calc later
      avgSolveHours,
      avgCsat
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/sla/trend", authenticate, requireAgent, async (req, res) => {
  // Return last 4 weeks trend based on real data
  const trend = [];
  for (let i = 3; i >= 0; i--) {
    const start = new Date();
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date();
    end.setDate(end.getDate() - i * 7);

    const count = await Ticket.countDocuments({ createdAt: { $gte: start, $lte: end } });
    const solvedCount = await Ticket.countDocuments({ status: "solved", solvedAt: { $gte: start, $lte: end } });

    trend.push({ week: `V-${i}`, total: count, solved: solvedCount });
  }
  res.json(trend);
});

/* Diagnostics (SaaS Optimization) */
app.get("/admin/diagnostics", authenticate, requireAdmin, async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const ticketCount = await Ticket.countDocuments();
    const kbCount = await Document.countDocuments();

    const diagnostics = {
      timestamp: new Date(),
      status: "Operational",
      database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
      stats: {
        users: userCount,
        tickets: ticketCount,
        knowledgeDocs: kbCount
      },
      env: {
        openai: !!process.env.OPENAI_API_KEY,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        mongo: !!process.env.MONGO_URI || !!process.env.MONGODB_URI
      },
      server: {
        node_version: process.version,
        memory_usage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + " MB",
        uptime: Math.floor(process.uptime()) + "s"
      }
    };
    res.json(diagnostics);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Du kan inte radera dig själv" });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Användare borttagen" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/kb/bulk-delete", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "CompanyId krävs" });
    await Document.deleteMany({ companyId });
    res.json({ message: "KB rensad för valt bolag" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/sla/agents", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    // Aggregate tickets by assigned agent
    const stats = await Ticket.aggregate([
      { $match: { assignedToUserId: { $ne: null }, createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$assignedToUserId",
          handled: { $sum: 1 },
          solved: { $sum: { $cond: [{ $eq: ["$status", "solved"] }, 1, 0] } }
        }
      }
    ]);

    const agents = await User.find({ _id: { $in: stats.map(s => s._id) } });

    const results = stats.map(s => {
      const user = agents.find(u => u._id.toString() === s._id.toString());
      return {
        agentName: user ? user.username : "Okänd",
        handled: s.handled,
        solved: s.solved,
        efficiency: s.handled > 0 ? Math.round((s.solved / s.handled) * 100) : 0
      };
    });

    res.json(results || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/sla/top-topics", authenticate, requireAgent, async (req, res) => {
  // Very simple keyword extraction from titles
  try {
    const activeTickets = await Ticket.find({}).select("title").limit(100);
    const words = {};
    activeTickets.forEach(t => {
      const clean = t.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      clean.forEach(w => words[w] = (words[w] || 0) + 1);
    });
    const top = Object.entries(words)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ topic: word, count }));
    res.json(top);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =====================
   ADVANCED SLA ANALYTICS
===================== */

// Escalation Statistics (AI → Human handoff)
app.get("/sla/escalation", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const allTickets = await Ticket.find({ createdAt: { $gte: since } });
    const total = allTickets.length;

    // Escalated = tickets that got assigned to an agent (human handoff)
    const escalated = allTickets.filter(t => t.assignedToUserId != null);
    const escalatedCount = escalated.length;
    const escalationRate = total > 0 ? ((escalatedCount / total) * 100).toFixed(1) : 0;

    // AI-only solved (no human needed)
    const aiOnlySolved = allTickets.filter(t => t.status === "solved" && !t.assignedToUserId).length;
    const aiSolveRate = total > 0 ? ((aiOnlySolved / total) * 100).toFixed(1) : 0;

    // Analyze escalation reasons (keywords in messages before handoff)
    const escalationReasons = {};
    const triggerWords = ["människa", "person", "agent", "arg", "missnöjd", "fel", "fungerar inte", "hjälp"];

    escalated.forEach(t => {
      const allText = t.messages.map(m => m.content?.toLowerCase() || "").join(" ");
      triggerWords.forEach(word => {
        if (allText.includes(word)) {
          escalationReasons[word] = (escalationReasons[word] || 0) + 1;
        }
      });
    });

    const topReasons = Object.entries(escalationReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count, percentage: ((count / escalatedCount) * 100).toFixed(1) }));

    // Average time to escalation
    let avgTimeToEscalation = 0;
    const escalatedWithTime = escalated.filter(t => t.firstAgentReplyAt && t.createdAt);
    if (escalatedWithTime.length > 0) {
      const totalMinutes = escalatedWithTime.reduce((sum, t) => {
        return sum + (t.firstAgentReplyAt - t.createdAt) / (1000 * 60);
      }, 0);
      avgTimeToEscalation = (totalMinutes / escalatedWithTime.length).toFixed(1);
    }

    res.json({
      total,
      escalatedCount,
      escalationRate,
      aiOnlySolved,
      aiSolveRate,
      avgTimeToEscalation: avgTimeToEscalation + " min",
      topReasons
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Period Comparison Statistics
app.get("/sla/comparison", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysNum = parseInt(days);

    // Current period
    const currentStart = new Date();
    currentStart.setDate(currentStart.getDate() - daysNum);
    const currentEnd = new Date();

    // Previous period
    const prevStart = new Date();
    prevStart.setDate(prevStart.getDate() - daysNum * 2);
    const prevEnd = new Date();
    prevEnd.setDate(prevEnd.getDate() - daysNum);

    const currentTickets = await Ticket.find({ createdAt: { $gte: currentStart, $lte: currentEnd } });
    const prevTickets = await Ticket.find({ createdAt: { $gte: prevStart, $lte: prevEnd } });

    // Calculate metrics
    const calcMetrics = (tickets) => {
      const total = tickets.length;
      const solved = tickets.filter(t => t.status === "solved").length;
      const aiSolved = tickets.filter(t => t.status === "solved" && !t.assignedToUserId).length;
      const highPriority = tickets.filter(t => t.priority === "high").length;
      const avgMessages = total > 0 ? (tickets.reduce((sum, t) => sum + (t.messages?.length || 0), 0) / total).toFixed(1) : 0;
      return { total, solved, aiSolved, highPriority, avgMessages };
    };

    const current = calcMetrics(currentTickets);
    const previous = calcMetrics(prevTickets);

    // Calculate deltas (percentage change)
    const delta = (curr, prev) => {
      if (prev === 0) return curr > 0 ? "+100" : "0";
      return ((curr - prev) / prev * 100).toFixed(1);
    };

    res.json({
      period: `${daysNum} dagar`,
      current: {
        ...current,
        solveRate: current.total > 0 ? ((current.solved / current.total) * 100).toFixed(1) : 0,
        aiRate: current.total > 0 ? ((current.aiSolved / current.total) * 100).toFixed(1) : 0
      },
      previous: {
        ...previous,
        solveRate: previous.total > 0 ? ((previous.solved / previous.total) * 100).toFixed(1) : 0,
        aiRate: previous.total > 0 ? ((previous.aiSolved / previous.total) * 100).toFixed(1) : 0
      },
      deltas: {
        total: delta(current.total, previous.total),
        solved: delta(current.solved, previous.solved),
        aiSolved: delta(current.aiSolved, previous.aiSolved),
        highPriority: delta(current.highPriority, previous.highPriority)
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Question/Message Statistics
app.get("/sla/questions", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const tickets = await Ticket.find({ createdAt: { $gte: since } });

    let totalMessages = 0;
    let userMessages = 0;
    let aiMessages = 0;
    let agentMessages = 0;
    let avgConversationLength = 0;
    const questionTypes = {};

    tickets.forEach(t => {
      const msgs = t.messages || [];
      totalMessages += msgs.length;

      msgs.forEach(m => {
        if (m.role === "user") {
          userMessages++;
          // Classify question types
          const content = (m.content || "").toLowerCase();
          if (content.includes("pris") || content.includes("kosta")) {
            questionTypes["Prisfrågor"] = (questionTypes["Prisfrågor"] || 0) + 1;
          } else if (content.includes("hjälp") || content.includes("problem")) {
            questionTypes["Supportfrågor"] = (questionTypes["Supportfrågor"] || 0) + 1;
          } else if (content.includes("order") || content.includes("leverans")) {
            questionTypes["Order/Leverans"] = (questionTypes["Order/Leverans"] || 0) + 1;
          } else if (content.includes("retur") || content.includes("återbetalning")) {
            questionTypes["Returer"] = (questionTypes["Returer"] || 0) + 1;
          } else if (content.includes("konto") || content.includes("lösenord")) {
            questionTypes["Kontofrågor"] = (questionTypes["Kontofrågor"] || 0) + 1;
          } else {
            questionTypes["Övrigt"] = (questionTypes["Övrigt"] || 0) + 1;
          }
        } else if (m.role === "assistant") {
          aiMessages++;
        } else if (m.role === "agent") {
          agentMessages++;
        }
      });
    });

    avgConversationLength = tickets.length > 0 ? (totalMessages / tickets.length).toFixed(1) : 0;

    const typeBreakdown = Object.entries(questionTypes)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        count,
        percentage: userMessages > 0 ? ((count / userMessages) * 100).toFixed(1) : 0
      }));

    res.json({
      totalMessages,
      userMessages,
      aiMessages,
      agentMessages,
      avgConversationLength,
      responseRatio: userMessages > 0 ? ((aiMessages + agentMessages) / userMessages).toFixed(2) : 0,
      typeBreakdown
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Hourly Distribution (for traffic patterns)
app.get("/sla/hourly", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const tickets = await Ticket.find({ createdAt: { $gte: since } });

    // Initialize hourly buckets
    const hourly = Array(24).fill(0);
    const dailyDistribution = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    tickets.forEach(t => {
      const hour = new Date(t.createdAt).getHours();
      const dayIndex = new Date(t.createdAt).getDay();
      hourly[hour]++;
      dailyDistribution[dayNames[dayIndex]]++;
    });

    // Find peak hours
    const peakHour = hourly.indexOf(Math.max(...hourly));
    const quietHour = hourly.indexOf(Math.min(...hourly));

    res.json({
      hourly,
      dailyDistribution,
      peakHour: `${peakHour}:00 - ${peakHour + 1}:00`,
      quietHour: `${quietHour}:00 - ${quietHour + 1}:00`,
      totalAnalyzed: tickets.length
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI Insights & Tips
app.get("/sla/insights", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const tickets = await Ticket.find({ createdAt: { $gte: since } });
    const total = tickets.length;
    const solved = tickets.filter(t => t.status === "solved").length;
    const escalated = tickets.filter(t => t.assignedToUserId).length;
    const highPriority = tickets.filter(t => t.priority === "high").length;

    const insights = [];
    const tips = [];

    // Generate contextual insights
    if (total === 0) {
      insights.push({ type: "info", icon: "fa-circle-info", text: "Ingen data tillgänglig för den valda perioden." });
    } else {
      // Solve rate insight
      const solveRate = (solved / total) * 100;
      if (solveRate >= 80) {
        insights.push({ type: "success", icon: "fa-trophy", text: `Utmärkt! ${solveRate.toFixed(1)}% av ärenden löstes under perioden.` });
      } else if (solveRate >= 50) {
        insights.push({ type: "warning", icon: "fa-chart-line", text: `${solveRate.toFixed(1)}% lösningsgrad - det finns utrymme för förbättring.` });
      } else {
        insights.push({ type: "danger", icon: "fa-exclamation-triangle", text: `Endast ${solveRate.toFixed(1)}% lösningsgrad. Granska era processer.` });
      }

      // AI performance insight
      const aiHandled = tickets.filter(t => !t.assignedToUserId).length;
      const aiRate = (aiHandled / total) * 100;
      if (aiRate >= 70) {
        insights.push({ type: "success", icon: "fa-robot", text: `AI hanterar ${aiRate.toFixed(1)}% av alla ärenden självständigt. Stark automation!` });
      } else {
        tips.push({ icon: "fa-lightbulb", text: "Förbättra AI-kunskapsbasen för att minska eskaleringarna.", priority: "high" });
      }

      // Escalation insight
      const escRate = (escalated / total) * 100;
      if (escRate > 40) {
        insights.push({ type: "warning", icon: "fa-user-group", text: `${escRate.toFixed(1)}% av ärenden eskalerades till mänsklig agent.` });
        tips.push({ icon: "fa-book", text: "Lägg till fler FAQ-dokument i kunskapsbasen för vanliga frågor.", priority: "medium" });
      }

      // High priority insight
      if (highPriority > total * 0.2) {
        insights.push({ type: "danger", icon: "fa-fire", text: `${highPriority} ärenden (${((highPriority / total) * 100).toFixed(1)}%) markerades som hög prioritet.` });
        tips.push({ icon: "fa-bell", text: "Överväg att justera prioriteringsreglerna eller utöka supportteamet.", priority: "high" });
      }
    }

    // Always add some general tips
    tips.push({ icon: "fa-clock", text: "Svara inom 2 timmar på high-priority ärenden för bästa kundnöjdhet.", priority: "medium" });
    tips.push({ icon: "fa-star", text: "Be om feedback efter lösta ärenden för att förbättra CSAT.", priority: "low" });

    res.json({ insights, tips });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Extended Agent Performance
app.get("/sla/agents/detailed", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const stats = await Ticket.aggregate([
      { $match: { assignedToUserId: { $ne: null }, createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$assignedToUserId",
          handled: { $sum: 1 },
          solved: { $sum: { $cond: [{ $eq: ["$status", "solved"] }, 1, 0] } },
          highPriority: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
          totalMessages: { $sum: { $size: { $ifNull: ["$messages", []] } } },
          avgRating: { $avg: "$csatRating" }
        }
      }
    ]);

    const agents = await User.find({ _id: { $in: stats.map(s => s._id) } });

    const results = stats.map(s => {
      const user = agents.find(u => u._id.toString() === s._id.toString());
      return {
        agentId: s._id,
        agentName: user ? user.username : "Okänd",
        email: user?.email || "-",
        role: user?.role || "agent",
        handled: s.handled,
        solved: s.solved,
        highPriority: s.highPriority,
        avgMessagesPerTicket: s.handled > 0 ? (s.totalMessages / s.handled).toFixed(1) : 0,
        efficiency: s.handled > 0 ? Math.round((s.solved / s.handled) * 100) : 0,
        avgCsat: s.avgRating ? s.avgRating.toFixed(1) : "N/A",
        score: Math.round((s.solved * 10) + (s.highPriority * 5) + (s.avgRating || 3) * 2) // Gamification score
      };
    }).sort((a, b) => b.score - a.score); // Sort by score

    res.json(results || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/sla/clear/all", authenticate, requireAdmin, async (req, res) => {
  await Ticket.deleteMany({});
  res.json({ message: "All statistik raderad." });
});

app.delete("/sla/clear/my", authenticate, requireAgent, async (req, res) => {
  await Ticket.deleteMany({ agentUserId: req.user.id });
  res.json({ message: "Dina ärenden rensade." });
});

/* =====================
   Fallback
===================== */
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =====================
   Socket.io
===================== */
io.on("connection", (socket) => {
  console.log("⚡ Ny klient ansluten:", socket.id);
  socket.on("disconnect", () => console.log("🔌 Klient bortkopplad"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 AI KUNDTJÄNST 4.0: http://localhost:${PORT}`));