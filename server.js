require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");
const pdf = require("pdf-parse");
const OpenAI = require("openai");
const http = require("http");
const { Server } = require("socket.io");
const { cleanText, escapeRegExp } = require("./utils/text");
const { genPublicId } = require("./utils/ids");
const { initModels } = require("./models");
const { createAuthMiddleware } = require("./middleware/auth");
const { enforceUserCompanyScope } = require("./middleware/companyScope");
const { requestLogger } = require("./middleware/requestLogger");
const { errorHandler } = require("./middleware/errorHandler");
const { createAiResponseService } = require("./services/ai/responseService");
const { createSummaryService } = require("./services/ai/summaryService");
const { createMemoryService } = require("./services/ai/memoryService");
const { inferDepartment } = require("./services/ai/promptBuilder");
const { createKnowledgeRoutes } = require("./routes/knowledgeRoutes");
const { createKnowledgePublicRoutes } = require("./routes/knowledgePublicRoutes");
const { createAuthRoutes } = require("./routes/authRoutes");
const { createAdminAnalyticsRoutes } = require("./routes/adminAnalyticsRoutes");
const { createAdminAuditRoutes } = require("./routes/adminAuditRoutes");
const { createAdminUsageRoutes } = require("./routes/adminUsageRoutes");
const { createDashboardRoutes } = require("./routes/dashboardRoutes");
const { createUsageService } = require("./services/usageService");
const { createAuditService } = require("./services/auditService");
const { addTicketEvent, setFirstResponseTimeIfMissing, setResolvedAt } = require("./services/tickets/ticketEventService");
const { computeTicketStats } = require("./services/tickets/ticketStatsService");

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

// Compression for all responses
app.use(compression());

app.use(requestLogger);

// Serve frontend strictly from 'public' with caching
app.use(express.static(path.join(__dirname, "public"), {
  etag: process.env.NODE_ENV === "production",
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  setHeaders: (res, filePath) => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const isProd = process.env.NODE_ENV === "production";
      if (ext === ".html") {
        res.setHeader("Cache-Control", "no-store");
        if (!isProd) {
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      } else if (ext === ".js" || ext === ".css") {
        if (isProd) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        } else {
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    } catch {}
  }
}));

app.use(
  cors({
    origin: process.env.APP_URL || true,
    credentials: true,
  })
);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

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
if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log("✅ MongoDB ansluten");
    })
    .catch((err) => console.error("❌ MongoDB-fel:", err));
} else {
  mongoose.connect = async () => {};
}

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
const {
  User,
  Company,
  Document,
  Knowledge,
  KnowledgeChunk,
  RefreshToken,
  AuditLog,
  UsageEvent,
  Ticket,
  Feedback,
  CrmCustomer,
  CrmDeal,
  CrmActivity
} = initModels(mongoose, { genPublicId });

const { authenticate, requireAgent, requireAdmin } = createAuthMiddleware({ User });
const audit = createAuditService({ AuditLog });

// Run database fixes and index cleanup after models are defined
(async () => {
  try {
    // Wait for connection to be stable
    if (process.env.NODE_ENV !== "test") setTimeout(async () => {
      if (!mongoose.connection || mongoose.connection.readyState !== 1) return;

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
 

/* =====================
   Routes
===================== */

app.get("/health", (req, res) => res.json({ ok: true }));

app.use(
  "/dashboard",
  authenticate,
  enforceUserCompanyScope((req) => req.query?.companyId),
  createDashboardRoutes({ User, Ticket, UsageEvent })
);

app.use(
  "/admin/analytics",
  authenticate,
  requireAdmin,
  createAdminAnalyticsRoutes({ User, Ticket, UsageEvent })
);

app.use(
  "/admin/audit",
  authenticate,
  requireAdmin,
  createAdminAuditRoutes({ AuditLog })
);

app.use(
  "/admin/usage",
  authenticate,
  requireAdmin,
  createAdminUsageRoutes({ UsageEvent })
);

app.use(
  "/knowledge",
  authenticate,
  createKnowledgePublicRoutes({ Knowledge, KnowledgeChunk })
);

// Rate limiters
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
const summaryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

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

app.use("/auth", createAuthRoutes({ User, RefreshToken }));

app.get("/me", authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user || null);
});

// Update username
app.patch("/me/username", authenticate, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ error: "Användarnamn måste vara minst 3 tecken" });
    }

    // Check if username is already taken
    const existing = await User.findOne({ username: username.trim(), _id: { $ne: req.user.id } });
    if (existing) {
      return res.status(400).json({ error: "Användarnamnet är redan taget" });
    }

    const user = await User.findById(req.user.id);
    user.username = username.trim();
    user.updatedAt = new Date();
    await user.save();

    res.json({ message: "Användarnamn uppdaterat", username: user.username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update password
app.patch("/me/password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Nytt lösenord måste vara minst 6 tecken" });
    }

    const user = await User.findById(req.user.id);

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Nuvarande lösenord är felaktigt" });
    }

    // Hash and save new password
    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();
    await user.save();

    res.json({ message: "Lösenord uppdaterat" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
app.get("/company/settings", authenticate, enforceUserCompanyScope((req) => req.query?.companyId), async (req, res) => {
  const company = await Company.findOne({ companyId: req.query.companyId });
  if (!company) return res.status(404).json({ error: "Hittades ej" });
  res.json(company.settings);
});

app.patch("/company/settings", authenticate, enforceUserCompanyScope((req) => req.body?.companyId), async (req, res) => {
  const { companyId, settings } = req.body;
  const company = await Company.findOne({ companyId });
  if (!company) return res.status(404).json({ error: "Hittades ej" });
  company.settings = { ...company.settings, ...settings };
  await company.save();
  await audit.log({
    companyId,
    actorUserId: req.user?.id,
    action: "company.settings.update",
    targetType: "company",
    targetId: String(companyId || ""),
    meta: { keys: Object.keys(settings || {}) }
  });
  res.json({ message: "Sparat", settings: company.settings });
});

// Delete a company (admin only)
app.delete("/companies/:companyId", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;

    if (companyId === "demo") {
      return res.status(400).json({ error: "Kan inte ta bort demo-företaget" });
    }

    // Delete the company
    const deleted = await Company.findOneAndDelete({ companyId });
    if (!deleted) {
      return res.status(404).json({ error: "Företaget hittades ej" });
    }

    // Also delete associated knowledge base documents
    const deletedDocs = await Document.deleteMany({ companyId });
    await audit.log({
      companyId,
      actorUserId: req.user?.id,
      action: "company.delete",
      targetType: "company",
      targetId: String(companyId || ""),
      meta: { deletedDocuments: deletedDocs.deletedCount }
    });

    res.json({
      message: "Företag borttaget",
      deletedCompany: deleted.displayName,
      deletedDocuments: deletedDocs.deletedCount
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =====================
   KNOWLEDGE BASE (KB)
   - Real implementations
===================== */

app.use(
  "/admin/knowledge",
  authenticate,
  requireAdmin,
  createKnowledgeRoutes({
    upload,
    Knowledge,
    KnowledgeChunk,
    Readability,
    JSDOM,
    pdfParse: pdf
  })
);

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
    const doc = await Document.findById(req.params.id);
    await Document.findByIdAndDelete(req.params.id);
    await audit.log({
      companyId: doc?.companyId || null,
      actorUserId: req.user?.id,
      action: "kb.doc.delete",
      targetType: "document",
      targetId: String(req.params.id || ""),
      meta: { title: doc?.title || "" }
    });
    res.json({ message: "Borttagen" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Search KB
app.get("/kb/search", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, q } = req.query;
    const query = {};
    if (companyId) query.companyId = String(companyId).trim();
    if (q && String(q).trim().length > 1) {
      const term = escapeRegExp(String(q).trim());
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { content: { $regex: term, $options: 'i' } }
      ];
    }
    const docs = await Document.find(query).sort({ createdAt: -1 }).limit(50);
    res.json(docs || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload Text
app.post("/admin/kb/text", authenticate, requireAdmin, async (req, res) => {
  const { companyId, title, content } = req.body;
  if (!companyId || !content) return res.status(400).json({ error: "Saknar data" });

  const doc = await new Document({
    companyId,
    title: title || "Text snippet",
    content: cleanText(content),
    sourceType: "text",
  }).save();
  await audit.log({
    companyId,
    actorUserId: req.user?.id,
    action: "kb.doc.create",
    targetType: "document",
    targetId: String(doc?._id || ""),
    meta: { sourceType: "text", title: doc?.title || "" }
  });

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
    await audit.log({
      companyId: doc.companyId,
      actorUserId: req.user?.id,
      action: "kb.doc.create",
      targetType: "document",
      targetId: String(doc?._id || ""),
      meta: { sourceType: "url", title: doc?.title || "", sourceUrl: url }
    });
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
    const doc = await new Document({
      companyId: companyId || "demo",
      title: req.file.originalname,
      content: cleanText(data.text),
      sourceType: "pdf",
    }).save();
    await audit.log({
      companyId: doc.companyId,
      actorUserId: req.user?.id,
      action: "kb.doc.create",
      targetType: "document",
      targetId: String(doc?._id || ""),
      meta: { sourceType: "pdf", title: doc?.title || "" }
    });
    res.json({ message: "PDF sparad" });
  } catch (e) {
    res.status(500).json({ error: "PDF-fel: " + e.message });
  }
});

// Generate KB article from ticket chat log
app.post("/admin/kb/generate-from-ticket", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, ticketId, title } = req.body;
    if (!companyId || !ticketId) return res.status(400).json({ error: "Saknar companyId eller ticketId" });
    const t = await Ticket.findById(ticketId);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    const text = (t.messages || []).map(m => `${m.role}: ${cleanText(m.content || "")}`).join("\n").slice(0, 4000);
    let article = "";
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("INSERT")) {
      const parts = text.split(/\n/).filter(Boolean).slice(0, 40);
      const header = "Sammanfattning och FAQ utifrån dialog:";
      article = [header, "", ...parts.map((p, i) => `- ${p}`)].join("\n");
    } else {
      const prompt = `Skapa en svensk kundtjänstartikel baserat på följande dialog. 
Format:
- Kort sammanfattning (2-4 meningar)
- Vanliga frågor (3-6 punkter) med tydliga svar
- Rekommenderad nästa steg om ärendet återkommer

Dialog:
${text}`;
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 700
      });
      article = completion.choices?.[0]?.message?.content || "Kunde inte generera artikel.";
    }
    const doc = await new Document({
      companyId,
      title: title || (`Artikel från ${t.publicTicketId}`),
      content: cleanText(article),
      sourceType: "generated",
    }).save();
    await audit.log({
      companyId,
      actorUserId: req.user?.id,
      action: "kb.doc.generate_from_ticket",
      targetType: "document",
      targetId: String(doc?._id || ""),
      meta: { ticketId: String(ticketId || ""), publicTicketId: String(t.publicTicketId || ""), title: doc?.title || "" }
    });
    res.json({ message: "Artikel genererad", id: doc._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =====================
   OpenAI Chat Functions
===================== */
const { summarizeConversation, summarizeTicketText } = createSummaryService({ openai });
const { getConversationSummary } = createMemoryService({ summarizeTicketText });
const { generateAIResponse } = createAiResponseService({ openai, Company, Document, Knowledge, KnowledgeChunk, getConversationSummary });
const { recordAiEvent } = createUsageService({ UsageEvent });

/* =====================
   Endpoints: Chat & Tickets
===================== */

app.delete("/inbox/tickets/solved", authenticate, requireAgent, async (req, res) => {
  try {
    const { companyId } = req.query;
    const q = { status: "solved" };
    if (companyId && companyId !== "undefined" && companyId !== "null") {
      q.companyId = String(companyId).trim();
    }
    const result = await Ticket.deleteMany(q);
    res.json({ message: `Rensade ${result.deletedCount} lösta ärenden` });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.post("/chat", authenticate, enforceUserCompanyScope((req) => req.body?.companyId), chatLimiter, async (req, res) => {
  const fs = require("fs");
  const log = (msg) => fs.appendFileSync("chat_debug.log", `[${new Date().toISOString()}] ${msg}\n`);

  try {
    const { companyId = "demo", conversation = [], ticketId, contactInfo, regenerate = false } = req.body;
    log(`START: companyId=${companyId}, ticketId=${ticketId}, user=${req.user?.id}`);

    const lastMsgObj = conversation.length > 0 ? conversation[conversation.length - 1] : null;
    let lastUserMsg = lastMsgObj ? lastMsgObj.content : "";

    if (!lastUserMsg && !regenerate) {
      log("EMPTY MESSAGE");
      return res.json({ reply: "Hur kan jag hjälpa dig idag? 😊" });
    }

    let ticket = null;
    if (ticketId && mongoose.Types.ObjectId.isValid(ticketId)) {
      ticket = await Ticket.findById(ticketId);
    }

    if (regenerate && !ticket) {
      return res.status(400).json({ error: "Regenerate kräver ticketId" });
    }

    if (!ticket) {
      log("CREATING NEW TICKET");
      ticket = new Ticket({
        userId: req.user.id,
        companyId: companyId || "demo",
        title: lastUserMsg.slice(0, 50),
        messages: [],
        priority: "normal",
        contactInfo: contactInfo || {}
      });
      await ticket.save(); // Save to generate publicTicketId
      addTicketEvent(ticket, "ticket_created", { channel: "chat", createdByUserId: req.user.id });
      console.log(`🆕 Ny ticket skapad: ${ticket.publicTicketId}`);
    } else {
      log("USING EXISTING TICKET");
      // Update contact info if provided later
      // Update contact info if provided later
      if (contactInfo && Object.keys(contactInfo).length > 0) {
        if (!ticket.contactInfo) ticket.contactInfo = {};

        // Explicitly update fields
        if (contactInfo.name) ticket.contactInfo.name = contactInfo.name;
        if (contactInfo.surname) ticket.contactInfo.surname = contactInfo.surname;
        if (contactInfo.email) ticket.contactInfo.email = contactInfo.email;
        if (contactInfo.phone) ticket.contactInfo.phone = contactInfo.phone;
        if (contactInfo.isCompany !== undefined) ticket.contactInfo.isCompany = contactInfo.isCompany;
        if (contactInfo.orgName) ticket.contactInfo.orgName = contactInfo.orgName;
        if (contactInfo.orgNr) ticket.contactInfo.orgNr = contactInfo.orgNr;
        if (contactInfo.ticketIdInput) ticket.contactInfo.ticketIdInput = contactInfo.ticketIdInput;

        ticket.markModified('contactInfo');
      }
    }

    // Safety check messages
    if (!Array.isArray(ticket.messages)) ticket.messages = [];
    if (regenerate) {
      if (ticket.messages.length && ticket.messages[ticket.messages.length - 1].role === "assistant") {
        ticket.messages.pop();
      }
      const lastUser = [...ticket.messages].reverse().find((m) => m.role === "user");
      lastUserMsg = lastUser ? lastUser.content : lastUserMsg;
      if (!lastUserMsg) return res.status(400).json({ error: "Inget tidigare user-meddelande att regenerera" });
      addTicketEvent(ticket, "ai_regenerate_requested", { by: req.user.id });
    } else {
      ticket.messages.push({ role: "user", content: cleanText(lastUserMsg) });
      addTicketEvent(ticket, "message_sent", { role: "user" });
    }

    const company = await Company.findOne({ companyId });
    const ai = company?.settings?.ai || {};
    const profiles = ai?.profiles || {};
    const activeName = ai?.activeProfile || Object.keys(profiles)[0] || "default";
    const now = new Date(); const h = now.getHours();
    const mappings = ai?.segmenting?.mappings || [];
    let profileName = activeName;
    const isCompany = !!(ticket.contactInfo?.isCompany);
    const custType = isCompany ? "b2b" : "b2c";
    const dept = inferDepartment(lastUserMsg, ticket);
    for (const m of mappings) {
      const langOk = (m.language || "sv") === "sv";
      let timeOk = true;
      if (m.schedule === "kontorstid") timeOk = h >= 9 && h < 17;
      else if (m.schedule === "kväll") timeOk = h >= 17 && h < 23;
      const custOk = (m.customerType || "b2c") === custType;
      const deptOk = !m.department || m.department === dept;
      if (langOk && timeOk && custOk && deptOk && profiles[m.profile]) { profileName = m.profile; break; }
    }
    const logic = (profiles[profileName]?.logic) || {};
    const maxReplies = Number(logic.max_replies ?? 3);
    const interpretation = profiles[profileName]?.interpretation || {};
    const rules = ai?.rules || [];
    const assistantCount = (ticket.messages || []).filter(m => m.role === "assistant").length;

    // Assign A/B variant if enabled and not already set
    try {
      const ab = ai?.ab || ai?.abTesting;
      if (ab && ab.active && Array.isArray(ab.variants) && ab.variants.length > 0 && !ticket.abVariant?.name) {
        const variant = ab.variants[Math.floor(Math.random() * ab.variants.length)];
        ticket.abVariant = {
          name: String(variant.name || ""),
          tone: String(variant.tone || ""),
          greeting: String(variant.greeting || "")
        };
      }
    } catch (e) {
      log(`AB ERROR: ${e.message}`);
    }

    // AI Generation
    let reply = "";
    try {
      log("START AI GENERATION");
      if (io) io.emit("aiTyping", { ticketId: ticket._id, companyId });
      const t0 = Date.now();
      reply = await generateAIResponse(companyId, ticket.messages, lastUserMsg, ticket.abVariant?.tone || undefined, { ticket });
      setFirstResponseTimeIfMissing(ticket);
      addTicketEvent(ticket, regenerate ? "ai_regenerated" : "ai_response", { model: "gpt-4o-mini" });
      await recordAiEvent({
        companyId,
        userId: req.user?.id,
        ticketId: ticket._id,
        type: "ai_chat",
        model: "gpt-4o-mini",
        inputText: lastUserMsg,
        outputText: reply,
        latencyMs: Date.now() - t0,
        ok: true
      });
      log("FINISH AI GENERATION");
    } catch (aiErr) {
      log(`AI CRASH: ${aiErr.message}`);
      reply = "Tekniskt fel vid AI-generering. En agent har notifierats.";
      addTicketEvent(ticket, "ai_error", { message: String(aiErr.message || "ai_error") });
      await recordAiEvent({
        companyId,
        userId: req.user?.id,
        ticketId: ticket._id,
        type: "ai_chat",
        model: "gpt-4o-mini",
        inputText: lastUserMsg,
        outputText: reply,
        latencyMs: 0,
        ok: false
      });
    }

    const msgLow = lastUserMsg.toLowerCase();
    const handoff = ["människa","person","medarbetare","riktig person","mänsklig","mänsklig agent","koppla","koppla vidare","vidarekoppla","eskalera","prata med människa","prata med en människa"].some(w => msgLow.includes(w));
    const needsHuman = handoff;

    if (needsHuman) {
      const beforePriority = ticket.priority;
      const beforeStatus = ticket.status;
      ticket.priority = "high";
      ticket.status = "open";
      if (beforePriority !== ticket.priority) addTicketEvent(ticket, "priority_changed", { from: beforePriority, to: ticket.priority, reason: "handoff" });
      if (beforeStatus !== ticket.status) addTicketEvent(ticket, "status_changed", { from: beforeStatus, to: ticket.status, reason: "handoff" });
      reply = "Självklart! Jag kopplar dig vidare till en mänsklig medarbetare nu. Ditt ärende har prioriterats. Vill du lämna e‑post eller telefon för snabb återkoppling?";
      if (io) io.emit("newImportantTicket", { id: ticket._id, title: "HUMAN REQUIRED: " + ticket.title });
    }

    const isUrgent = ["akut", "bråttom", "panik", "fungerar inte", "fel"].some(w => msgLow.includes(w));
    if (isUrgent) {
      const beforePriority = ticket.priority;
      ticket.priority = "high";
      if (beforePriority !== ticket.priority) addTicketEvent(ticket, "priority_changed", { from: beforePriority, to: ticket.priority, reason: "urgent" });
      if (io) io.emit("newImportantTicket", { id: ticket._id, title: ticket.title });
    }

    if (interpretation.ask_followup !== false && lastUserMsg.trim().length < 8) {
      const follow = " Kan du beskriva lite mer vad som inte fungerar?";
      if (!String(reply || "").includes(follow)) reply += follow;
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

// Chat summary (for current conversation)
app.post("/chat/summary", authenticate, enforceUserCompanyScope((req) => req.body?.companyId), summaryLimiter, async (req, res) => {
  try {
    const { conversation = [], companyId = "demo" } = req.body;
    const t0 = Date.now();
    const summary = await summarizeConversation({ conversation, companyId });
    const inputText = Array.isArray(conversation) ? conversation.map(m => `${m?.role}: ${m?.content || ""}`).join("\n") : "";
    await recordAiEvent({
      companyId,
      userId: req.user?.id,
      ticketId: null,
      type: "ai_summary",
      model: process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("INSERT") ? "gpt-4o-mini" : "local-fallback",
      inputText,
      outputText: summary,
      latencyMs: Date.now() - t0,
      ok: true
    });
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ticket summary
app.get("/tickets/:id/summary", authenticate, summaryLimiter, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    const isOwner = t.userId?.toString() === req.user.id;
    const isAgentOrAdmin = ["agent", "admin"].includes(req.user.role);
    if (!isOwner && !isAgentOrAdmin) return res.status(403).json({ error: "Ej behörig" });

    const text = (t.messages || []).map(m => `${m.role}: ${cleanText(m.content || "")}`).join("\n").slice(0, 4000);
    const t0 = Date.now();
    const summary = await summarizeTicketText({ publicTicketId: t.publicTicketId, text });
    await recordAiEvent({
      companyId: t.companyId,
      userId: req.user?.id,
      ticketId: t._id,
      type: "ai_ticket_summary",
      model: process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("INSERT") ? "gpt-4o-mini" : "local-fallback",
      inputText: text,
      outputText: summary,
      latencyMs: Date.now() - t0,
      ok: true
    });
    res.json({ summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/company/simulator", authenticate, enforceUserCompanyScope((req) => req.body?.companyId), async (req, res) => {
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
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket hittades ej" });

    const isOwner = ticket.userId.toString() === req.user.id;
    const isAgentOrAdmin = ["agent", "admin"].includes(req.user.role);

    if (!isOwner && !isAgentOrAdmin) {
      console.log(`[ACCESS DENIED] User: ${req.user.username} (${req.user.role}), TicketOwner: ${ticket.userId}`);
      return res.status(403).json({ error: `Ej behörig (Roll: ${req.user.role})` });
    }

    const payload = ticket.toObject ? ticket.toObject() : ticket;
    payload.stats = computeTicketStats(payload);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/admin/kb/optimize", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, content, title } = req.body || {};
    if (!companyId || !content) return res.status(400).json({ error: "Saknar companyId eller innehåll" });
    const text = cleanText(String(content || "")).slice(0, 8000);
    let optimized = text;
    const t0 = Date.now();
    let model = "local-fallback";
    if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("INSERT")) {
      model = "gpt-4o-mini";
      const messages = [
        {
          role: "system",
          content: "Du är en svensk kundtjänstcopywriter. Förbättra texter till tydliga, strukturerade kunskapsartiklar utan att ändra sanningshalt."
        },
        {
          role: "user",
          content: `Förbättra och optimera följande kunskapsartikel för en AI-driven kundtjänst.\n\nTitel: ${title || ""}\n\nText:\n${text}`
        }
      ];
      const completion = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.35,
        max_tokens: 1200
      });
      optimized = completion.choices?.[0]?.message?.content || text;
    }
    await recordAiEvent({
      companyId,
      userId: req.user?.id,
      ticketId: null,
      type: "kb_optimize",
      model,
      inputText: text.slice(0, 4000),
      outputText: String(optimized || "").slice(0, 4000),
      latencyMs: Date.now() - t0,
      ok: true
    });
    res.json({ optimized: cleanText(String(optimized || "")) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/ingest/email", async (req, res) => {
  try {
    const token = req.headers["x-webhook-token"];
    if (process.env.EMAIL_WEBHOOK_TOKEN && !process.env.EMAIL_WEBHOOK_TOKEN.includes("INSERT")) {
      if (!token || token !== process.env.EMAIL_WEBHOOK_TOKEN) return res.status(401).json({ error: "Fel token" });
    }
    const { from, subject, body, companyId } = req.body || {};
    const email = String(from || "").trim().toLowerCase();
    const comp = String(companyId || "demo").trim();
    const title = String(subject || "").trim() || "Email ticket";
    const text = cleanText(String(body || ""));
    if (!email || !text) return res.status(400).json({ error: "Saknar avsändare eller innehåll" });
    let user = await User.findOne({ email });
    if (!user) {
      const unameBase = email.replace(/[^a-z0-9]/g, "_").slice(0, 24) || "email_user";
      let uname = unameBase;
      let n = 0;
      while (await User.findOne({ username: uname })) { n++; uname = unameBase + "_" + n; }
      user = await new User({ username: uname, email, password: await bcrypt.hash(crypto.randomBytes(8).toString("hex"), 10), role: "user", companyId: comp }).save();
    }
    const t = new Ticket({ userId: user._id, companyId: comp, channel: "email", title, contactInfo: { email }, messages: [], priority: "normal" });
    t.messages.push({ role: "user", content: text });
    addTicketEvent(t, "ticket_created", { channel: "email", createdBy: "webhook" });
    addTicketEvent(t, "message_sent", { role: "user" });
    t.lastActivityAt = new Date();
    await t.save();
    try {
      const c = await Company.findOne({ companyId: comp });
      const auto = c?.settings?.ai?.autoReply || {};
      if (auto.email !== false) {
        const reply = await generateAIResponse(comp, t.messages, text);
        t.messages.push({ role: "assistant", content: reply });
        setFirstResponseTimeIfMissing(t);
        addTicketEvent(t, "ai_response", { model: "gpt-4o-mini" });
        t.lastActivityAt = new Date();
        await t.save();
      }
    } catch (aiErr) {
      console.log("EMAIL AI ERROR:", aiErr.message);
    }
    if (io) io.emit("ticketUpdate", { ticketId: t._id, companyId: comp, type: "created" });
    res.json({ ticketId: t._id, publicTicketId: t.publicTicketId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/ingest/sms", async (req, res) => {
  try {
    const token = req.headers["x-webhook-token"];
    if (process.env.SMS_WEBHOOK_TOKEN && !process.env.SMS_WEBHOOK_TOKEN.includes("INSERT")) {
      if (!token || token !== process.env.SMS_WEBHOOK_TOKEN) return res.status(401).json({ error: "Fel token" });
    }
    const { from, text, companyId } = req.body || {};
    const phone = String(from || "").trim();
    const comp = String(companyId || "demo").trim();
    const content = cleanText(String(text || ""));
    if (!phone || !content) return res.status(400).json({ error: "Saknar avsändare eller innehåll" });
    let user = await User.findOne({ username: phone });
    if (!user) {
      const uname = ("sms_" + phone.replace(/[^0-9]/g, "").slice(-12)) || ("sms_" + Date.now());
      user = await new User({ username: uname, email: "", password: await bcrypt.hash(crypto.randomBytes(8).toString("hex"), 10), role: "user", companyId: comp }).save();
    }
    const t = new Ticket({ userId: user._id, companyId: comp, channel: "sms", title: content.slice(0, 50), contactInfo: { phone }, messages: [], priority: "normal" });
    t.messages.push({ role: "user", content: content });
    addTicketEvent(t, "ticket_created", { channel: "sms", createdBy: "webhook" });
    addTicketEvent(t, "message_sent", { role: "user" });
    t.lastActivityAt = new Date();
    await t.save();
    try {
      const c = await Company.findOne({ companyId: comp });
      const auto = c?.settings?.ai?.autoReply || {};
      if (auto.sms !== false) {
        const reply = await generateAIResponse(comp, t.messages, content);
        t.messages.push({ role: "assistant", content: reply });
        setFirstResponseTimeIfMissing(t);
        addTicketEvent(t, "ai_response", { model: "gpt-4o-mini" });
        t.lastActivityAt = new Date();
        await t.save();
      }
    } catch (aiErr) {
      console.log("SMS AI ERROR:", aiErr.message);
    }
    if (io) io.emit("ticketUpdate", { ticketId: t._id, companyId: comp, type: "created" });
    res.json({ ticketId: t._id, publicTicketId: t.publicTicketId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/ingest/whatsapp", async (req, res) => {
  try {
    const token = req.headers["x-webhook-token"];
    if (process.env.WHATSAPP_WEBHOOK_TOKEN && !process.env.WHATSAPP_WEBHOOK_TOKEN.includes("INSERT")) {
      if (!token || token !== process.env.WHATSAPP_WEBHOOK_TOKEN) return res.status(401).json({ error: "Fel token" });
    }
    const { from, text, companyId } = req.body || {};
    const phone = String(from || "").trim();
    const comp = String(companyId || "demo").trim();
    const content = cleanText(String(text || ""));
    if (!phone || !content) return res.status(400).json({ error: "Saknar avsändare eller innehåll" });
    let user = await User.findOne({ username: "wa_" + phone });
    if (!user) {
      const uname = ("wa_" + phone.replace(/[^0-9]/g, "").slice(-12)) || ("wa_" + Date.now());
      user = await new User({ username: uname, email: "", password: await bcrypt.hash(crypto.randomBytes(8).toString("hex"), 10), role: "user", companyId: comp }).save();
    }
    const t = new Ticket({ userId: user._id, companyId: comp, channel: "whatsapp", title: content.slice(0, 50), contactInfo: { phone }, messages: [], priority: "normal" });
    t.messages.push({ role: "user", content: content });
    addTicketEvent(t, "ticket_created", { channel: "whatsapp", createdBy: "webhook" });
    addTicketEvent(t, "message_sent", { role: "user" });
    t.lastActivityAt = new Date();
    await t.save();
    try {
      const c = await Company.findOne({ companyId: comp });
      const auto = c?.settings?.ai?.autoReply || {};
      if (auto.whatsapp !== false) {
        const reply = await generateAIResponse(comp, t.messages, content);
        t.messages.push({ role: "assistant", content: reply });
        setFirstResponseTimeIfMissing(t);
        addTicketEvent(t, "ai_response", { model: "gpt-4o-mini" });
        t.lastActivityAt = new Date();
        await t.save();
      }
    } catch (aiErr) {
      console.log("WHATSAPP AI ERROR:", aiErr.message);
    }
    if (io) io.emit("ticketUpdate", { ticketId: t._id, companyId: comp, type: "created" });
    res.json({ ticketId: t._id, publicTicketId: t.publicTicketId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Facebook Messenger ingest
app.post("/ingest/facebook", async (req, res) => {
  try {
    const token = req.headers["x-webhook-token"];
    if (process.env.FACEBOOK_WEBHOOK_TOKEN && !process.env.FACEBOOK_WEBHOOK_TOKEN.includes("INSERT")) {
      if (!token || token !== process.env.FACEBOOK_WEBHOOK_TOKEN) return res.status(401).json({ error: "Fel token" });
    }
    const { senderId, text, companyId } = req.body || {};
    const sender = String(senderId || "").trim();
    const comp = String(companyId || "demo").trim();
    const content = cleanText(String(text || ""));
    if (!sender || !content) return res.status(400).json({ error: "Saknar avsändare eller innehåll" });
    let user = await User.findOne({ username: "fb_" + sender });
    if (!user) {
      const uname = ("fb_" + sender.replace(/[^a-zA-Z0-9]/g, "").slice(-24)) || ("fb_" + Date.now());
      user = await new User({ username: uname, email: "", password: await bcrypt.hash(crypto.randomBytes(8).toString("hex"), 10), role: "user", companyId: comp }).save();
    }
    const t = new Ticket({ userId: user._id, companyId: comp, channel: "facebook", title: content.slice(0, 50), contactInfo: { social: "facebook", senderId: sender }, messages: [], priority: "normal" });
    t.messages.push({ role: "user", content: content });
    addTicketEvent(t, "ticket_created", { channel: "facebook", createdBy: "webhook" });
    addTicketEvent(t, "message_sent", { role: "user" });
    t.lastActivityAt = new Date();
    await t.save();
    try {
      const c = await Company.findOne({ companyId: comp });
      const auto = c?.settings?.ai?.autoReply || {};
      if (auto.facebook !== false) {
        const reply = await generateAIResponse(comp, t.messages, content);
        t.messages.push({ role: "assistant", content: reply });
        setFirstResponseTimeIfMissing(t);
        addTicketEvent(t, "ai_response", { model: "gpt-4o-mini" });
        t.lastActivityAt = new Date();
        await t.save();
      }
    } catch (aiErr) {
      console.log("FACEBOOK AI ERROR:", aiErr.message);
    }
    if (io) io.emit("ticketUpdate", { ticketId: t._id, companyId: comp, type: "created" });
    res.json({ ticketId: t._id, publicTicketId: t.publicTicketId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/tickets/:id/reply", authenticate, async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (ticket.userId.toString() !== req.user.id) return res.status(403).json({ error: "Ej behörig" });

  const text = req.body.message;
  ticket.messages.push({ role: "user", content: text });
  addTicketEvent(ticket, "message_sent", { role: "user" });

  // Auto-AI reply if status is not 'solved'? Or always AI?
  // Usually if user replies, AI might answer again if no agent attached.
  if (!ticket.assignedToUserId) {
    const reply = await generateAIResponse(ticket.companyId, ticket.messages, text);
    ticket.messages.push({ role: "assistant", content: reply });
    setFirstResponseTimeIfMissing(ticket);
    addTicketEvent(ticket, "ai_response", { model: "gpt-4o-mini" });
  }

  ticket.lastActivityAt = new Date();
  await ticket.save();
  if (io) io.emit("ticketUpdate", { ticketId: ticket._id, companyId: ticket.companyId, type: "userReply" });

  const payload = ticket.toObject ? ticket.toObject() : ticket;
  payload.stats = computeTicketStats(payload);
  res.json({ message: "Skickat", ticket: payload });
});

/* =====================
   Inbox (Agent)
===================== */
app.get("/inbox/tickets", authenticate, requireAgent, async (req, res) => {
  const { status, companyId, channel } = req.query;
  const q = {};
  if (status) q.status = status;
  if (companyId) q.companyId = companyId;
  if (channel) q.channel = channel;
  const tickets = await Ticket.find(q).sort({ lastActivityAt: -1 }).limit(1000);
  const payload = (tickets || []).map((t) => {
    const o = t.toObject ? t.toObject() : t;
    o.stats = computeTicketStats(o);
    return o;
  });
  res.json(payload);
});

app.patch("/inbox/tickets/:id/status", authenticate, requireAgent, async (req, res) => {
  const t = await Ticket.findById(req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
  const before = t.status;
  t.status = req.body.status;
  addTicketEvent(t, "status_changed", { from: before, to: t.status });
  if (t.status === "solved") {
    t.solvedAt = new Date();
    setResolvedAt(t, t.solvedAt);
    addTicketEvent(t, "ticket_closed", { status: "solved" }, t.solvedAt);
  }
  t.lastActivityAt = new Date();
  await t.save();
  res.json({ message: "Uppdaterad" });
});

app.patch("/inbox/tickets/:id/priority", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    const before = t.priority;
    t.priority = req.body.priority || "normal";
    addTicketEvent(t, "priority_changed", { from: before, to: t.priority });
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
    setFirstResponseTimeIfMissing(t, t.firstAgentReplyAt);
    addTicketEvent(t, "agent_response", { agentUserId: req.user.id });
    t.status = "pending"; // Auto-status change when agent replies
    addTicketEvent(t, "status_changed", { to: "pending", reason: "agent_reply" });
    t.lastActivityAt = new Date();
    await t.save();
    if (io) io.emit("ticketUpdate", { ticketId: t._id, companyId: t.companyId, type: "agentReply" });
    res.json({ message: "Svarat" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/inbox/tickets/:id/note", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    t.internalNotes.push({ createdBy: req.user.id, content: cleanText(req.body.content), createdAt: new Date() });
    addTicketEvent(t, "internal_note_added", { createdBy: req.user.id });
    await t.save();
    if (io) io.emit("noteUpdate", { ticketId: t._id, companyId: t.companyId, action: "added" });
    res.json({ message: "Note sparad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/tickets/:id/assign", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ej hittad" });
    const before = t.assignedToUserId?.toString() || null;
    t.assignedToUserId = req.body.assignedToUserId;
    addTicketEvent(t, "ticket_assigned", { from: before, to: t.assignedToUserId?.toString() || null, by: req.user.id });
    await t.save();
    if (io) io.emit("assignmentUpdate", { ticketId: t._id, companyId: t.companyId, assignedToUserId: t.assignedToUserId });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/tickets/:id", authenticate, requireAgent, async (req, res) => {
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ message: "Raderad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/inbox/tickets/:id/notes", authenticate, requireAgent, async (req, res) => {
  try {
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    t.internalNotes = [];
    addTicketEvent(t, "internal_note_cleared", { by: req.user.id });
    await t.save();
    if (io) io.emit("noteUpdate", { ticketId: t._id, companyId: t.companyId, action: "cleared" });
    res.json({ message: "Notes raderade" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/inbox/tickets/:id/assign", authenticate, requireAgent, async (req, res) => {
  try {
    const { userId } = req.body;
    const t = await Ticket.findById(req.params.id);
    if (!t) return res.status(404).json({ error: "Ticket hittades ej" });
    const before = t.assignedToUserId?.toString() || null;
    t.assignedToUserId = userId || null;
    addTicketEvent(t, "ticket_assigned", { from: before, to: t.assignedToUserId?.toString() || null, by: req.user.id });
    await t.save();
    if (io) io.emit("assignmentUpdate", { ticketId: t._id, companyId: t.companyId, assignedToUserId: t.assignedToUserId });
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
    let role = req.body?.role;
    if (!role && typeof req.body === "string") {
      try { role = JSON.parse(req.body)?.role; } catch {}
    }
    role = String(role || "").trim().toLowerCase();
    if (!["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: `Ogiltig roll: ${role}. Tillåtna roller: user, agent, admin` });
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Ogiltigt användar-ID" });
    const u = await User.findById(id);
    if (!u) return res.status(404).json({ error: "Användare hittades ej" });
    await User.findByIdAndUpdate(id, { role });
    await audit.log({
      companyId: u.companyId || null,
      actorUserId: req.user?.id,
      action: "admin.user.role_update",
      targetType: "user",
      targetId: String(id || ""),
      meta: { from: String(u.role || ""), to: String(role || ""), username: String(u.username || "") }
    });
    res.json({ message: "Roll uppdaterad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/inbox/tickets/solve-all", authenticate, requireAgent, async (req, res) => {
  try {
    const { companyId } = req.body;
    const q = { status: { $ne: "solved" } };
    if (companyId) q.companyId = companyId;
    const ts = new Date();
    await Ticket.updateMany(q, {
      $set: { status: "solved", solvedAt: ts, resolvedAt: ts },
      $push: {
        events: {
          $each: [
            { type: "status_changed", timestamp: ts, data: { to: "solved", reason: "bulk_solve", by: req.user.id } },
            { type: "ticket_closed", timestamp: ts, data: { status: "solved", bulk: true, by: req.user.id } }
          ]
        }
      }
    });
    io.emit("ticketUpdate", { message: "Bulk solve completed" });
    res.json({ message: "Alla markerade ärenden lösta" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/inbox/tickets/solved", authenticate, requireAgent, async (req, res) => {
  try {
    const { companyId } = req.query;
    console.log(`[DELETE /inbox/tickets/solved] Payload:`, req.query);

    const q = { status: "solved" };
    // Handle specific company ID logic, exclude "undefined"/"null" strings
    if (companyId && companyId !== "undefined" && companyId !== "null") {
      q.companyId = String(companyId).trim();
    }

    console.log(`[DELETE] Query:`, q);
    const result = await Ticket.deleteMany(q);
    console.log(`[DELETE] Removed ${result.deletedCount} tickets.`);

    res.json({ message: `Rensade ${result.deletedCount} lösta ärenden` });
  } catch (e) {
    console.error("[DELETE FAILED]", e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.get("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 });
    res.json(companies || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  try {
    const { displayName, companyId: reqCompId, contactEmail, plan, status, orgNr, contactName, phone, notes } = req.body;
    if (!displayName) return res.status(400).json({ error: "Namn krävs" });

    // Generate ID (use provided or generate)
    let companyId = reqCompId ? String(reqCompId).trim().toLowerCase() : "";
    if (!companyId) companyId = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);

    const existing = await Company.findOne({ companyId });
    if (existing) return res.status(400).json({ error: "Bolag med liknande ID finns redan (" + companyId + ")" });

    const company = new Company({
      companyId,
      displayName,
      contactEmail: contactEmail || "",
      orgNr: orgNr || "",
      contactName: contactName || "",
      phone: phone || "",
      notes: notes || "",
      plan: plan || "bas",
      status: status || "active",
      createdAt: new Date()
    });
    await company.save();
    await audit.log({
      companyId,
      actorUserId: req.user?.id,
      action: "admin.company.create",
      targetType: "company",
      targetId: String(companyId || ""),
      meta: { displayName: String(displayName || ""), plan: String(company.plan || ""), status: String(company.status || "") }
    });
    if (io) io.emit("crmUpdate", { companyId });
    res.json({ message: "Skapat", company });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =====================
   Feedback System
===================== */

// POST /feedback - Submit feedback
app.post("/feedback", authenticate, async (req, res) => {
  try {
    const { ticketId, companyId, rating, comment, targetType, targetAgentId, category } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Betyg måste vara mellan 1-5" });
    }

    const feedback = new Feedback({
      ticketId: ticketId || null,
      companyId: companyId || "demo",
      userId: req.user.id,
      targetType: targetType || "ai",
      targetAgentId: targetAgentId || null,
      rating,
      comment: cleanText(comment) || "",
      category: category || "overall"
    });

    await feedback.save();
    io.emit("newFeedback", { id: feedback._id, rating, targetType });
    res.json({ message: "Tack för din feedback!", feedback });
  } catch (e) {
    console.error("[Feedback POST Error]", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /feedback - Get feedback (Admin: all, Agent: own)
app.get("/feedback", authenticate, requireAgent, async (req, res) => {
  try {
    const { startDate, endDate, targetType, agentId, companyId, limit = 100 } = req.query;
    const q = {};

    if (startDate || endDate) {
      q.createdAt = {};
      if (startDate) q.createdAt.$gte = new Date(startDate);
      if (endDate) q.createdAt.$lte = new Date(endDate);
    }
    if (targetType) q.targetType = targetType;
    if (companyId) q.companyId = companyId;

    // Access control: Agent sees own, Admin sees all
    if (req.user.role === "agent") {
      q.targetAgentId = req.user._id;
    } else if (req.user.role === "admin" && agentId) {
      q.targetAgentId = agentId;
    }

    const feedback = await Feedback.find(q)
      .populate("userId", "username email")
      .populate("targetAgentId", "username")
      .populate("ticketId", "publicTicketId title")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const allForStats = await Feedback.find(q);
    const totalCount = allForStats.length;
    const avgRating = totalCount > 0
      ? (allForStats.reduce((sum, f) => sum + f.rating, 0) / totalCount).toFixed(1)
      : 0;

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    allForStats.forEach(f => { ratingDistribution[f.rating]++; });

    res.json({
      feedback,
      stats: {
        totalCount,
        avgRating: parseFloat(avgRating),
        ratingDistribution,
        agentCount: new Set(allForStats.filter(f => f.targetAgentId).map(f => f.targetAgentId.toString())).size,
        aiCount: allForStats.filter(f => f.targetType === "ai").length,
      }
    });
  } catch (e) {
    console.error("[Feedback GET Error]", e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /feedback/clear - Clear feedback bulk (must be before :id route)
app.delete("/feedback/clear", authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, targetType } = req.query;
    const q = {};
    if (startDate || endDate) {
      q.createdAt = {};
      if (startDate) q.createdAt.$gte = new Date(startDate);
      if (endDate) q.createdAt.$lte = new Date(endDate);
    }
    if (targetType) q.targetType = targetType;
    const result = await Feedback.deleteMany(q);
    res.json({ message: `Raderade ${result.deletedCount} feedback-poster` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /feedback/:id - Delete single feedback
app.delete("/feedback/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ message: "Feedback raderad" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /feedback/ai-analysis - AI tips based on feedback
app.get("/feedback/ai-analysis", authenticate, requireAgent, async (req, res) => {
  try {
    const { days = 30, agentId } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const q = { createdAt: { $gte: startDate } };
    if (req.user.role === "agent") {
      q.targetAgentId = req.user._id;
    } else if (agentId) {
      q.targetAgentId = agentId;
    }

    const recentFeedback = await Feedback.find(q).sort({ createdAt: -1 }).limit(50);

    if (recentFeedback.length === 0) {
      return res.json({
        analysis: "Ingen feedback hittades för den valda perioden. Fortsätt samla in feedback för att få AI-analys! 🌟",
        sentiment: "neutral",
        tips: []
      });
    }

    const avgRating = recentFeedback.reduce((sum, f) => sum + f.rating, 0) / recentFeedback.length;
    const comments = recentFeedback.filter(f => f.comment).map(f => `${f.rating}★: "${f.comment}"`).slice(0, 20);

    const prompt = `Analysera följande kundfeedback för en supporttjänst. Ge konkreta tips och beröm på svenska.

Genomsnittligt betyg: ${avgRating.toFixed(1)}/5
Antal svar: ${recentFeedback.length}

Senaste kommentarer:
${comments.join("\\n") || "Inga skriftliga kommentarer."}

Ge ett kort, uppmuntrande svar med:
1. En sammanfattning av kundens upplevelse
2. 2-3 konkreta förbättringstips (om betyget är under 4)
3. Beröm för det som fungerar bra

Håll svaret kort och professionellt (max 150 ord).`;

    let analysis = "";
    let sentiment = avgRating >= 4 ? "positive" : avgRating >= 3 ? "neutral" : "negative";
    let tips = [];

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      });
      analysis = completion.choices[0].message.content;
      const tipMatches = analysis.match(/\\d\\.\\s*([^\\n]+)/g);
      if (tipMatches) tips = tipMatches.map(t => t.replace(/^\\d\\.\\s*/, '').trim());
    } catch (aiErr) {
      console.error("AI Analysis Error:", aiErr.message);
      if (avgRating >= 4.5) {
        analysis = `Fantastiskt! Genomsnittligt betyg på ${avgRating.toFixed(1)}/5 baserat på ${recentFeedback.length} svar. 🌟`;
        tips = ["Fortsätt med det goda arbetet!", "Dela framgångarna med teamet"];
      } else if (avgRating >= 3) {
        analysis = `Genomsnittligt betyg: ${avgRating.toFixed(1)}/5. Det finns utrymme för förbättring.`;
        tips = ["Fokusera på snabbare svarstider", "Följ upp med missnöjda kunder"];
      } else {
        analysis = `Betyget ${avgRating.toFixed(1)}/5 indikerar att det finns förbättringsområden.`;
        tips = ["Granska negativ feedback noggrant", "Identifiera återkommande problem"];
      }
    }

    res.json({ analysis, sentiment, tips, stats: { avgRating: parseFloat(avgRating.toFixed(1)), totalCount: recentFeedback.length, period: parseInt(days) } });
  } catch (e) {
    console.error("[AI Analysis Error]", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /feedback/agents - Agent leaderboard (Admin only)
app.get("/feedback/agents", authenticate, requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const agentStats = await Feedback.aggregate([
      { $match: { targetType: "agent", targetAgentId: { $ne: null }, createdAt: { $gte: startDate } } },
      { $group: { _id: "$targetAgentId", avgRating: { $avg: "$rating" }, count: { $sum: 1 }, fiveStars: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } } } },
      { $sort: { avgRating: -1 } }
    ]);

    const populatedStats = await Promise.all(agentStats.map(async (stat) => {
      const agent = await User.findById(stat._id).select("username");
      return { agentId: stat._id, agentName: agent?.username || "Okänd", avgRating: parseFloat(stat.avgRating.toFixed(1)), feedbackCount: stat.count, fiveStarCount: stat.fiveStars };
    }));

    res.json({ agents: populatedStats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

app.post("/billing/create-checkout", authenticate, enforceUserCompanyScope((req) => req.body?.companyId), async (req, res) => {
  try {
    const { plan, companyId } = req.body;
    await audit.log({
      companyId: companyId || req.user?.companyId || null,
      actorUserId: req.user?.id,
      action: "billing.checkout.create",
      targetType: "company",
      targetId: String(companyId || req.user?.companyId || ""),
      meta: { plan: String(plan || ""), stripeEnabled: !!stripe }
    });
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
    const u = await User.findById(req.params.id);
    await User.findByIdAndDelete(req.params.id);
    await audit.log({
      companyId: u?.companyId || null,
      actorUserId: req.user?.id,
      action: "admin.user.delete",
      targetType: "user",
      targetId: String(req.params.id || ""),
      meta: { username: String(u?.username || "") }
    });
    res.json({ message: "Användare borttagen" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ==================
   Company Admin (CRM)
   ================== */
app.get("/admin/companies", authenticate, requireAgent, async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 });
    res.json(companies);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/companies", authenticate, requireAdmin, async (req, res) => {
  try {
    const { displayName, companyId: reqCompId, contactEmail, plan, status, orgNr, contactName, phone, notes } = req.body;
    if (!displayName) return res.status(400).json({ error: "Namn krävs" });

    // Generate ID (use provided or generate)
    let companyId = reqCompId ? String(reqCompId).trim().toLowerCase() : "";
    if (!companyId) companyId = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);

    const existing = await Company.findOne({ companyId });
    if (existing) return res.status(400).json({ error: "Bolag med liknande ID finns redan" });

    const c = new Company({
      companyId,
      displayName,
      contactEmail: contactEmail || "",
      plan: plan || "bas",
      status: status || "active",
      orgNr: orgNr || "",
      contactName: contactName || "",
      phone: phone || "",
      notes: notes || "",
      createdAt: new Date()
    });
    await c.save();
    await audit.log({
      companyId,
      actorUserId: req.user?.id,
      action: "admin.company.create",
      targetType: "company",
      targetId: String(companyId || ""),
      meta: { displayName: String(displayName || ""), plan: String(c.plan || ""), status: String(c.status || "") }
    });
    if (io) io.emit("crmUpdate", { companyId });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/admin/companies/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { displayName, contactEmail, plan, status, orgNr, contactName, phone, notes } = req.body;
    const companyId = req.params.id;
    const before = await Company.findOne({ companyId });
    const c = await Company.findOneAndUpdate(
      { companyId },
      { displayName, contactEmail, plan, status, orgNr, contactName, phone, notes },
      { new: true }
    );
    if (!c) return res.status(404).json({ error: "Bolag hittades ej" });
    await audit.log({
      companyId,
      actorUserId: req.user?.id,
      action: "admin.company.update",
      targetType: "company",
      targetId: String(companyId || ""),
      meta: {
        before: before ? { displayName: before.displayName, plan: before.plan, status: before.status } : null,
        after: { displayName: c.displayName, plan: c.plan, status: c.status }
      }
    });
    if (io) io.emit("crmUpdate", { companyId });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/companies/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const companyId = req.params.id;
    const deletedCompany = await Company.findOneAndDelete({ companyId });
    // await User.deleteMany({ companyId }); // REMOVED: DANGEROUS! Users might not have companyId set yet, leading to empty filter {} delete
    const tRes = await Ticket.deleteMany({ companyId });
    const dRes = await Document.deleteMany({ companyId });
    await audit.log({
      companyId,
      actorUserId: req.user?.id,
      action: "admin.company.delete",
      targetType: "company",
      targetId: String(companyId || ""),
      meta: {
        displayName: String(deletedCompany?.displayName || ""),
        deletedTickets: tRes.deletedCount,
        deletedDocuments: dRes.deletedCount
      }
    });
    if (io) io.emit("crmUpdate", { companyId });
    res.json({ message: "Bolag och all data raderad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/company/settings", authenticate, async (req, res) => {
  const { companyId } = req.query;
  if (companyId && (req.user.role === 'admin' || req.user.role === 'agent')) {
    const c = await Company.findOne({ companyId });
    return res.json(c?.settings || {});
  }
  res.json({});
});

app.patch("/company/settings", authenticate, requireAgent, async (req, res) => {
  try {
    const { companyId, settings } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId saknas" });

    const c = await Company.findOne({ companyId: String(companyId).trim() });
    if (!c) {
      console.log(`[PATCH /company/settings] 404 Not Found: '${companyId}'`);
      return res.status(404).json({ error: `Bolag '${companyId}' hittades ej` });
    }

    // Settings sub-object
    if (settings.greeting) c.settings.greeting = settings.greeting;
    if (settings.tone) c.settings.tone = settings.tone;
    if (settings.widgetColor) c.settings.widgetColor = settings.widgetColor;
    if (settings.ai) {
      c.settings.ai = { ...(c.settings.ai || {}), ...settings.ai };
    }

    // Root fields
    if (settings.displayName) c.displayName = settings.displayName;
    if (settings.contactName) c.contactName = settings.contactName;
    if (settings.contactEmail) c.contactEmail = settings.contactEmail;
    if (settings.phone) c.phone = settings.phone;
    if (settings.plan) c.plan = settings.plan;
    if (settings.status) c.status = settings.status;
    if (settings.orgNr) c.orgNr = settings.orgNr;
    if (settings.notes) c.notes = settings.notes;

    c.markModified('settings');
    await c.save();
    await audit.log({
      companyId: String(companyId || "").trim(),
      actorUserId: req.user?.id,
      action: "company.settings.update",
      targetType: "company",
      targetId: String(companyId || ""),
      meta: { keys: Object.keys(settings || {}) }
    });
    if (io) io.emit("crmUpdate", { companyId });
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/kb/bulk-delete", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "CompanyId krävs" });
    const r = await Document.deleteMany({ companyId });
    await audit.log({
      companyId,
      actorUserId: req.user?.id,
      action: "kb.doc.bulk_delete",
      targetType: "document",
      targetId: String(companyId || ""),
      meta: { deletedCount: r.deletedCount }
    });
    res.json({ message: "KB rensad för valt bolag" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =====================
   ADMIN: USER MANAGEMENT
===================== */

// List Users
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create User (Admin)
app.post("/admin/users", authenticate, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, companyId, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Användarnamn/lösenord krävs" });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: "Användarnamnet upptaget" });

    const user = new User({
      username,
      password: await bcrypt.hash(password, 10),
      role: role || "user",
      companyId: companyId || null,
      email: email || ""
    });

    await user.save();
    await audit.log({
      companyId: user.companyId || null,
      actorUserId: req.user?.id,
      action: "admin.user.create",
      targetType: "user",
      targetId: String(user?._id || ""),
      meta: { username: String(user.username || ""), role: String(user.role || "") }
    });
    res.json({ message: "Användare skapad", user: { id: user._id, username: user.username } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete User
app.delete("/admin/users/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: "Du kan inte radera dig själv" });

    const u = await User.findById(id);
    await User.findByIdAndDelete(id);
    await audit.log({
      companyId: u?.companyId || null,
      actorUserId: req.user?.id,
      action: "admin.user.delete",
      targetType: "user",
      targetId: String(id || ""),
      meta: { username: String(u?.username || "") }
    });
    // Optionally delete tickets assigned to this user?? No, keep history.
    res.json({ message: "Användare raderad" });
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

// AI Analytics (non-KB, behavior-focused)
app.get("/ai/analytics", authenticate, requireAgent, async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = companyId ? { companyId } : {};
    const tickets = await Ticket.find(filter);
    const total = tickets.length;
    const solved = tickets.filter(t => t.status === "solved");
    const escalated = tickets.filter(t => t.assignedToUserId);
    const ratings = solved.filter(t => t.csatRating).map(t => t.csatRating);
    const avgCsat = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "Ej beräknat";
    const escalationRate = total > 0 ? ((escalated.length / total) * 100).toFixed(1) : "0.0";
    const misunderstandings = tickets.filter(t => (t.messages?.length || 0) >= 8 && (t.status !== "solved"));
    const misunderstandingRate = total > 0 ? ((misunderstandings.length / total) * 100).toFixed(1) : "0.0";
    const suggestions = [];
    if (Number(escalationRate) > 40) suggestions.push("Minska eskaleringar genom att stärka AI:s svarsmallar för vanliga frågor.");
    if (avgCsat !== "Ej beräknat" && Number(avgCsat) < 3.5) suggestions.push("Fokusera på empatisk ton och kortare lösningssteg för att höja CSAT.");
    if (Number(misunderstandingRate) > 20) suggestions.push("Inför följdfrågor vid oklar input och förtydliga policyer.");
    if (suggestions.length === 0) suggestions.push("Fortsätt som nu, mät regelbundet och iterera flöden/regler.");
    res.json({ avgCsat, escalationRate, misunderstandingRate, suggestions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// A/B Testing analytics
app.get("/ai/ab-stats", authenticate, requireAgent, async (req, res) => {
  try {
    const { companyId } = req.query;
    const filter = companyId ? { companyId } : {};
    const tickets = await Ticket.find(filter);
    const groups = {};
    tickets.forEach(t => {
      const key = t.abVariant?.name || "unknown";
      if (!groups[key]) groups[key] = { total: 0, solved: 0, escalated: 0, ratings: [] };
      groups[key].total += 1;
      if (t.status === "solved") {
        groups[key].solved += 1;
        if (t.csatRating) groups[key].ratings.push(t.csatRating);
      }
      if (t.assignedToUserId) groups[key].escalated += 1;
    });
    const stats = Object.entries(groups).map(([name, g]) => ({
      name,
      total: g.total,
      solvedRate: g.total > 0 ? ((g.solved / g.total) * 100).toFixed(1) : "0.0",
      escalationRate: g.total > 0 ? ((g.escalated / g.total) * 100).toFixed(1) : "0.0",
      avgCsat: g.ratings.length ? (g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length).toFixed(1) : "Ej beräknat"
    }));
    res.json({ variants: stats });
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

// Agent Personal Stats
app.get("/sla/my-stats", authenticate, requireAgent, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await Ticket.aggregate([
      { $match: { assignedToUserId: new mongoose.Types.ObjectId(userId) } }, // Only my tickets
      {
        $group: {
          _id: null,
          handled: { $sum: 1 },
          solved: { $sum: { $cond: [{ $eq: ["$status", "solved"] }, 1, 0] } },
          highPriority: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
          totalMessages: { $sum: { $size: { $ifNull: ["$messages", []] } } },
          avgRating: { $avg: "$csatRating" }
        }
      }
    ]);

    const s = stats[0] || { handled: 0, solved: 0, highPriority: 0, totalMessages: 0, avgRating: 0 };

    res.json({
      handled: s.handled,
      solved: s.solved,
      highPriority: s.highPriority,
      avgCsat: s.avgRating ? s.avgRating.toFixed(1) : "N/A",
      efficiency: s.handled > 0 ? Math.round((s.solved / s.handled) * 100) : 0,
      role: "Agent"
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =====================
   PRODUCT SIMULATOR
===================== */

// Simulation History Schema (in-memory for now, could be MongoDB)
const simHistory = new Map(); // userId -> array of simulations

// Generate product visualization
app.post("/simulator/generate", authenticate, async (req, res) => {
  try {
    const {
      productName,
      productCategory,
      productImage, // base64 or URL
      roomType,      // 'custom' or 'ai'
      roomImage,     // base64 for custom room
      roomDescription,
      roomStyle,
      roomTypeSelect,
      placement,
      lighting,
      angle
    } = req.body;

    if (!productName) {
      return res.status(400).json({ error: "Produktnamn krävs" });
    }

    // Build the prompt for DALL-E
    const categoryLabels = {
      furniture: "möbel",
      lighting: "lampa/belysning",
      decor: "heminredningsprodukt",
      electronics: "elektronikprodukt",
      art: "konstföremål/tavla",
      appliances: "vitvara/apparat",
      outdoor: "utemöbel",
      other: "produkt"
    };

    const placementLabels = {
      center: "placerad centralt i rummet",
      corner: "placerad i ett hörn",
      wall: "placerad mot väggen",
      ceiling: "hängande från taket",
      floor: "stående på golvet",
      table: "placerad på ett bord"
    };

    const lightingLabels = {
      daylight: "med naturligt dagsljus",
      warm: "med varmt kvällsljus",
      cool: "med kallt modernt ljus",
      dramatic: "med dramatisk spotbelysning"
    };

    const angleLabels = {
      front: "fotograferad rakt framifrån",
      angle: "fotograferad i 45 graders vinkel",
      wide: "fotograferad med vidvinkel som visar hela rummet",
      close: "närbild fokuserad på produkten"
    };

    const roomTypeLabels = {
      living_room: "vardagsrum",
      bedroom: "sovrum",
      kitchen: "kök",
      bathroom: "badrum",
      office: "hemmakontor",
      outdoor: "utomhusterrass"
    };

    const styleLabels = {
      modern: "modern minimalistisk",
      scandinavian: "skandinavisk",
      industrial: "industriell",
      classic: "klassisk traditionell",
      bohemian: "bohemisk",
      rustic: "rustik lantlig"
    };

    let prompt = "";

    if (roomType === "ai") {
      // AI-generated room
      const roomDesc = roomDescription || `Ett ${styleLabels[roomStyle] || "modernt"} ${roomTypeLabels[roomTypeSelect] || "vardagsrum"}`;
      prompt = `Fotorealistisk inredningsbild: ${roomDesc}. I rummet finns en ${productName} (${categoryLabels[productCategory] || "produkt"}) ${placementLabels[placement] || "centralt i rummet"}. Bilden är tagen ${angleLabels[angle] || "framifrån"} ${lightingLabels[lighting] || "med naturligt ljus"}. Professionell inredningsfotografi, hög kvalitet, 8K, detaljerad.`;
    } else {
      // Custom room image - describe inserting product
      prompt = `Fotorealistisk produktvisualisering: En ${productName} (${categoryLabels[productCategory] || "produkt"}) ${placementLabels[placement] || "centralt i rummet"} i ett modernt rum. Produkten är ${angleLabels[angle] || "framifrån"} ${lightingLabels[lighting] || "med naturligt ljus"}. Professionell inredningsfotografi, sömlös integration, fotorealistisk, 8K kvalitet.`;
    }

    console.log("🎨 Simulator prompt:", prompt);

    // define mock generator function
    const runMockMode = async () => {
      console.log("⚠️ Genererar Mock-bild...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      const mockImages = [
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=1024",
        "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&q=80&w=1024",
        "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&q=80&w=1024",
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4f9d?auto=format&fit=crop&q=80&w=1024"
      ];
      const randomImage = mockImages[Math.floor(Math.random() * mockImages.length)];

      const simulation = {
        id: Date.now().toString(),
        productName,
        productCategory,
        roomType,
        imageUrl: randomImage,
        prompt: "[MOCK] " + prompt,
        createdAt: new Date()
      };

      const userId = req.user.id;
      if (!simHistory.has(userId)) simHistory.set(userId, []);
      simHistory.get(userId).unshift(simulation);

      return res.json({
        success: true,
        imageUrl: randomImage,
        revisedPrompt: "AI-visualisering (Mock Mode - Fallback)",
        simulation
      });
    };

    // Check if OpenAI is configured, otherwise use Mock Mode
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("INSERT")) {
      return await runMockMode();
    }

    // Generate image with DALL-E 3
    let imageResponse;
    try {
      imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "hd",
        style: "natural"
      });
    } catch (openaiError) {
      console.error("OpenAI DALL-E Error:", openaiError);
      // Fallback to mock on any error (auth, billing, etc)
      return await runMockMode();
    }

    if (!imageResponse?.data?.[0]?.url) {
      return await runMockMode();
    }

    const generatedImageUrl = imageResponse.data[0].url;
    const revisedPrompt = imageResponse.data[0].revised_prompt;

    // Store in history
    const userId = req.user.id;
    if (!simHistory.has(userId)) {
      simHistory.set(userId, []);
    }

    const simulation = {
      id: Date.now().toString(),
      productName,
      productCategory,
      roomType,
      imageUrl: generatedImageUrl,
      prompt: revisedPrompt || prompt,
      createdAt: new Date()
    };

    simHistory.get(userId).unshift(simulation);
    // Keep only last 10
    if (simHistory.get(userId).length > 10) {
      simHistory.get(userId).pop();
    }

    res.json({
      success: true,
      imageUrl: generatedImageUrl,
      revisedPrompt,
      simulation
    });

  } catch (e) {
    console.error("Simulator error:", e);
    // Even on generic error, try mock if not already sent
    if (!res.headersSent) {
      res.status(500).json({ error: "Kunde inte generera visualisering" });
    }
  }
});

// Get simulation history
app.get("/simulator/history", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const history = simHistory.get(userId) || [];
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear simulation history
app.delete("/simulator/history", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    simHistory.set(userId, []);
    res.json({ message: "Historik rensad" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =====================
   CRM SYNC ENDPOINTS
===================== */

// Fetch all CRM data for a company
app.get("/crm/sync", authenticate, async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "Saknar companyId" });

    const customers = await CrmCustomer.find({ companyId }).lean();
    const deals = await CrmDeal.find({ companyId }).lean();
    const activities = await CrmActivity.find({ companyId }).sort({ created: -1 }).limit(100).lean();

    res.json({ customers, deals, activities });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk upsert customers
app.post("/crm/customers/sync", authenticate, async (req, res) => {
  try {
    const { companyId, customers } = req.body;
    if (!companyId || !Array.isArray(customers)) return res.status(400).json({ error: "Invalid data" });

    const ops = customers.map(c => ({
      updateOne: {
        filter: { companyId, id: c.id },
        update: { ...c, companyId },
        upsert: true
      }
    }));

    if (ops.length > 0) await CrmCustomer.bulkWrite(ops);
    if (io) io.emit("crmUpdate", { companyId });
    res.json({ message: "Kunder synkade" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk upsert deals
app.post("/crm/deals/sync", authenticate, async (req, res) => {
  try {
    const { companyId, deals } = req.body;
    if (!companyId || !Array.isArray(deals)) return res.status(400).json({ error: "Invalid data" });

    const ops = deals.map(d => ({
      updateOne: {
        filter: { companyId, id: d.id },
        update: { ...d, companyId },
        upsert: true
      }
    }));

    if (ops.length > 0) await CrmDeal.bulkWrite(ops);
    if (io) io.emit("crmUpdate", { companyId });
    res.json({ message: "Pipeline synkad" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync activities (replace top 100)
app.post("/crm/activities/sync", authenticate, async (req, res) => {
  try {
    const { companyId, activities } = req.body;
    if (!companyId || !Array.isArray(activities)) return res.status(400).json({ error: "Invalid data" });

    const ops = activities.map(a => ({
      updateOne: {
        filter: { companyId, id: a.id },
        update: { ...a, companyId },
        upsert: true
      }
    }));

    if (ops.length > 0) await CrmActivity.bulkWrite(ops);
    if (io) io.emit("crmUpdate", { companyId });
    res.json({ message: "Aktiviteter synkade" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* =====================
   AI OS - REAL BACKEND ENGINE
===================== */

// In-memory config store for prototype (would be DB in production)
let aiOsConfigStore = {
  chatExperience: { greeting: "Hi! I'm the AI assistant. How can I help you today?", botName: "AI Support", color: "#4F46E5", quickReplies: ["Pricing", "Support"], position: "right", requireEmail: false, placeholder: "Type a message..." },
  behavior: { persona: "professional", tone: 80, empathy: 50, risk: 20 },
  rules: [
    { id: 1, name: "High-Value Lead Escalation", intent: "pricing", sentiment: "positive", action: "Escalate to Sales Team", active: true }
  ],
  flows: [
    { id: 1, name: "Refund Flow", trigger: "refund_request", logic: "order.days_ago < 30", trueAction: "Process Refund", falseAction: "Deny Refund" }
  ],
  knowledge: [
    { id: 1, name: "Return_Policy_2025.pdf", type: "PDF", priority: "High", status: "Synced", tags: ["refunds", "policy"], usage: 1240, confidence: 98 },
    { id: 2, name: "Pricing FAQs", type: "Text", priority: "Normal", status: "Synced", tags: ["sales", "pricing"], usage: 450, confidence: 92 },
    { id: 3, name: "https://example.com/help", type: "URL", priority: "Low", status: "Syncing...", tags: ["general"], usage: 12, confidence: 60 }
  ],
  training: [
    { id: 1, intent: "refund_request", examples: ["I need a refund", "Give me my money back", "Return order 1234"], accuracy: 98 },
    { id: 2, intent: "pricing_inquiry", examples: ["How much does it cost", "What is the price"], accuracy: 92 }
  ],
  experiments: [
    { id: 1, name: "Greeting Optimization", desc: "Testing conversion impact of opening line", status: "Running", varA: { name: "Friendly", conv: 45.2 }, varB: { name: "Professional", conv: 52.1 } }
  ],
  logs: []
};

// GET /aios/config
app.get("/aios/config", (req, res) => {
  res.json(aiOsConfigStore);
});

// PATCH /aios/config
app.patch("/aios/config", (req, res) => {
  aiOsConfigStore = { ...aiOsConfigStore, ...req.body };
  
  // Broadcast change instantly
  if (io) {
    io.emit("aios_config_update", aiOsConfigStore);
  }
  
  res.json(aiOsConfigStore);
});

// ---------------------------------------------------------
// SESSION MANAGER (In-memory for prototype)
// ---------------------------------------------------------
const aiOsSessions = new Map();

// ---------------------------------------------------------
// PIPELINE 1: USER CHAT (AI ENABLED)
// ---------------------------------------------------------
app.post("/aios/chat", (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  const config = aiOsConfigStore;
  
  if (!aiOsSessions.has(sessionId)) {
    aiOsSessions.set(sessionId, { id: sessionId, mode: 'AI', messages: [] });
  }
  const session = aiOsSessions.get(sessionId);

  // 1. Store user message
  const userMsg = {
    id: Date.now().toString(),
    conversationId: sessionId,
    role: "user",
    source: "chat",
    content: message,
    createdAt: new Date()
  };
  session.messages.push(userMsg);

  // Broadcast user message instantly
  if (io) {
    io.emit("aios_message", { message: userMsg });
  }

  // STOP HERE IF IN HUMAN MODE (Agent has taken over)
  if (session.mode === 'HUMAN') {
    return res.json({
      response: "",
      debug: { intent: "N/A", ruleTriggered: "Human Mode", flowTriggered: "None", persona: "N/A" }
    });
  }

  // 2. Intent Detection
  let intent = "unknown";
  const text = (message || "").toLowerCase();
  if (text.includes("refund") || text.includes("broken") || text.includes("return")) {
    intent = "refund_request";
  } else if (text.includes("price") || text.includes("cost") || text.includes("buy")) {
    intent = "pricing";
  } else if (text.includes("support") || text.includes("help") || text.includes("issue")) {
    intent = "support";
  }

  // 3. Rule Engine
  let ruleTriggered = null;
  let finalResponse = "";
  const activeRule = config.rules.find(r => r.active && r.intent === intent);
  if (activeRule) {
    ruleTriggered = activeRule.name;
    if (activeRule.action.includes("Escalate")) {
      finalResponse = `I have escalated this to the ${activeRule.action.replace('Escalate to ', '')}.`;
      session.mode = 'HUMAN'; // Auto-escalate switches to human mode
    }
  }

  // 4. Flow Engine
  let flowTriggered = null;
  if (!finalResponse) {
    const activeFlow = config.flows.find(f => f.trigger === intent);
    if (activeFlow) {
      flowTriggered = activeFlow.name;
      finalResponse = activeFlow.trueAction;
    }
  }

  // 5. Fallback AI
  if (!finalResponse) {
    if (intent === "unknown") {
      finalResponse = "I'm not sure I understand. Could you clarify?";
    } else {
      finalResponse = "I understand you need help with " + intent + ". Let me check.";
    }
  }

  // 6. Behavior System
  if (config.behavior.persona === "professional") {
    finalResponse = "Professional Assistant: " + finalResponse;
  } else if (config.behavior.persona === "friendly") {
    finalResponse = "😊 " + finalResponse + " Have a great day!";
  } else if (config.behavior.persona === "sales") {
    finalResponse = finalResponse + " Would you like to upgrade your plan?";
  }

  // 7. Store AI message
  const aiMsg = {
    id: (Date.now() + 1).toString(),
    conversationId: sessionId,
    role: "ai",
    source: "chat",
    content: finalResponse,
    createdAt: new Date()
  };
  session.messages.push(aiMsg);

  // 8. Log for analytics
  config.logs.unshift({
    id: Date.now(),
    sessionId,
    input: message,
    intent,
    rule: ruleTriggered,
    flow: flowTriggered,
    response: finalResponse,
    timestamp: new Date()
  });
  if (config.logs.length > 100) config.logs.pop();

  // Broadcast AI message
  if (io) {
    setTimeout(() => io.emit("aios_message", { message: aiMsg }), 100);
  }

  res.json({
    response: finalResponse,
    debug: { intent, ruleTriggered, flowTriggered, persona: config.behavior.persona }
  });
});
// ---------------------------------------------------------
// PIPELINE 2: AGENT INBOX (AI DISABLED)
// ---------------------------------------------------------
app.post("/aios/agent/reply", (req, res) => {
  const { content, sessionId = 'default' } = req.body;
  
  if (!aiOsSessions.has(sessionId)) {
    aiOsSessions.set(sessionId, { id: sessionId, mode: 'HUMAN', messages: [] });
  }
  const session = aiOsSessions.get(sessionId);

  // Force human mode if an agent replies
  session.mode = 'HUMAN';

  // 1. Store agent message
  const agentMsg = {
    id: Date.now().toString(),
    conversationId: sessionId,
    role: "agent",
    source: "inbox",
    content: content,
    createdAt: new Date()
  };
  session.messages.push(agentMsg);

  // NO AI CALLS. NO FLOWS. NO RULES.

  // 2. Broadcast via WebSocket
  if (io) {
    io.emit("aios_message", { message: agentMsg });
    // Broadcast session update to sync the mode switch
    io.emit("aios_session_update", { sessionId, mode: session.mode });
  }

  res.json({ success: true, message: agentMsg });
});

// New endpoint to toggle mode manually
app.post("/aios/agent/mode", (req, res) => {
  const { sessionId, mode } = req.body;
  if (aiOsSessions.has(sessionId)) {
    const session = aiOsSessions.get(sessionId);
    session.mode = mode;
    if (io) io.emit("aios_session_update", { sessionId, mode });
    res.json({ success: true, mode });
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

// GET /aios/conversations
app.get("/aios/conversations", (req, res) => {
  res.json(Array.from(aiOsSessions.values()));
});

app.use(errorHandler);

/* =====================
   Fallback
===================== */
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =====================
   Socket.io
===================== */
const onlineAgents = new Map();
io.on("connection", (socket) => {
  console.log("⚡ Ny klient ansluten:", socket.id);
  socket.on("agentOnline", (data) => {
    onlineAgents.set(socket.id, { username: String(data?.username || "okänd"), role: String(data?.role || "agent") });
    io.emit("presenceUpdate", Array.from(onlineAgents.values()));
  });
  socket.on("disconnect", () => {
    console.log("🔌 Klient bortkopplad");
    onlineAgents.delete(socket.id);
    io.emit("presenceUpdate", Array.from(onlineAgents.values()));
  });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => console.log(`🚀 AI KUNDTJÄNST 4.0: http://localhost:${PORT}`));
}

module.exports = {
  app,
  server,
  models: { User, Company, Ticket, Document, Feedback }
};
// Force redeploy trigger
