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

const nodemailer = require("nodemailer");
const crypto = require("crypto");

const cheerio = require("cheerio");
const pdfParse = require("pdf-parse");

const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "18mb" }));
app.use(cors());
app.use(express.static(__dirname));

/* =====================
   ✅ ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", process.env.MONGO_URI ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "OK" : "SAKNAS");
console.log("APP_URL:", process.env.APP_URL ? "OK" : "SAKNAS");

/* =====================
   ✅ MongoDB
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
   ✅ Models
===================== */
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, trim: true },
  email: { type: String, unique: true, required: true, trim: true, lowercase: true },

  password: { type: String, required: true },
  role: { type: String, default: "user" },

  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  role: String, // user | assistant | agent
  content: String,
  timestamp: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true },
  status: { type: String, default: "open" }, // open | pending | solved
  priority: { type: String, default: "normal" }, // low | normal | high
  title: { type: String, default: "" },
  messages: [messageSchema],
  agentNotes: { type: String, default: "" }, // 👈 admin notes (not visible for user)
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});
const Ticket = mongoose.model("Ticket", ticketSchema);

const kbChunkSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  sourceType: { type: String, required: true }, // url | text | pdf
  sourceRef: { type: String, default: "" },
  title: { type: String, default: "" },
  chunkIndex: { type: Number, default: 0 },
  content: { type: String, default: "" },
  embedding: { type: [Number], default: [] },
  embeddingOk: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const KBChunk = mongoose.model("KBChunk", kbChunkSchema);

const feedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  companyId: String,
  rating: { type: Number, default: 0 },
  comment: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const Feedback = mongoose.model("Feedback", feedbackSchema);

const categorySchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true, trim: true }, // demo, law...
  name: { type: String, required: true, trim: true },
  systemPrompt: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const Category = mongoose.model("Category", categorySchema);

/* =====================
   ✅ Default categories bootstrap
===================== */
async function ensureDefaultCategories() {
  const defaults = [
    { key: "demo", name: "Demo AB", systemPrompt: "Du är en professionell och vänlig AI-kundtjänst på svenska." },
    { key: "law", name: "Juridik", systemPrompt: "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmänna råd men inte juridisk rådgivning." },
    { key: "tech", name: "Teknisk support", systemPrompt: "Du är en AI-kundtjänst för teknisk support inom IT och programmering på svenska. Felsök steg-för-steg." },
    { key: "cleaning", name: "Städservice", systemPrompt: "Du är en AI-kundtjänst för städservice på svenska. Hjälp med bokningar, priser, rutiner och tips." },
  ];

  for (const c of defaults) {
    const exists = await Category.findOne({ key: c.key });
    if (!exists) await new Category(c).save();
  }
  console.log("✅ Categories ensured");
}

/* =====================
   ✅ OpenAI
===================== */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================
   ✅ Rate limit
===================== */
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);
app.use("/auth/forgot-password", limiterAuth);
app.use("/auth/reset-password", limiterAuth);

/* =====================
   ✅ Helpers
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text, chunkSize = 1200, overlap = 150) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const chunks = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}
function norm(a) { return Math.sqrt(dot(a, a)); }
function cosineSim(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return dot(a, b) / (na * nb);
}

async function createEmbedding(text) {
  try {
    const r = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text
    });
    return r.data?.[0]?.embedding || null;
  } catch (e) {
    console.error("❌ Embedding error:", e?.message || e);
    return null;
  }
}

async function ragSearch(companyId, query, topK = 4) {
  const qEmbed = await createEmbedding(query);
  if (!qEmbed) return { used: false, context: "", sources: [] };

  const chunks = await KBChunk.find({ companyId, embeddingOk: true }).limit(1200);
  if (!chunks.length) return { used: false, context: "", sources: [] };

  const scored = chunks
    .filter(c => c.embedding?.length)
    .map(c => ({ score: cosineSim(qEmbed, c.embedding), c }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (!scored.length || scored[0].score < 0.20) return { used: false, context: "", sources: [] };

  const context = scored.map((s, i) => `KÄLLA ${i + 1}: ${s.c.title || s.c.sourceRef}\n${s.c.content}`).join("\n\n");
  const sources = scored.map(s => ({
    title: s.c.title || s.c.sourceRef || "KB",
    sourceType: s.c.sourceType,
    sourceRef: s.c.sourceRef
  }));

  return { used: true, context, sources };
}

async function getSystemPrompt(companyId) {
  const cat = await Category.findOne({ key: companyId });
  if (cat?.systemPrompt) return cat.systemPrompt;
  return "Du är en professionell och vänlig AI-kundtjänst på svenska.";
}

async function ensureTicket(userId, companyId) {
  let t = await Ticket.findOne({ userId, companyId, status: { $ne: "solved" } }).sort({ lastActivityAt: -1 });
  if (!t) t = await new Ticket({ userId, companyId, messages: [] }).save();
  return t;
}

/* =====================
   ✅ URL + PDF extraction
===================== */
async function fetchUrlText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (AI Kundtjanst Bot)",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  if (!res.ok) throw new Error(`Kunde inte hämta URL. Status: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside").remove();
  const main = $("main").text() || $("article").text() || $("body").text();
  const text = cleanText(main);

  if (!text || text.length < 200) {
    throw new Error("Ingen tillräcklig text kunde extraheras från URL.");
  }

  return text;
}

async function extractPdfText(base64) {
  const buffer = Buffer.from(base64, "base64");
  const data = await pdfParse(buffer);
  const text = cleanText(data.text || "");
  if (!text || text.length < 200) throw new Error("Ingen tillräcklig text i PDF.");
  return text;
}

/* =====================
   ✅ Password reset mail helpers
===================== */
function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL;
  return `${req.protocol}://${req.get("host")}`;
}

function createMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";

  if (!host || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("⚠️ SMTP env saknas (SMTP_HOST/SMTP_USER/SMTP_PASS).");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendResetEmail({ to, resetLink }) {
  const transporter = createMailTransporter();
  if (!transporter) throw new Error("SMTP transporter saknas");

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Återställ lösenord</h2>
      <p>Klicka på länken nedan för att välja ett nytt lösenord:</p>
      <p><a href="${resetLink}" target="_blank">${resetLink}</a></p>
      <p>Gäller i 30 minuter.</p>
      <p style="color:#666;font-size:12px">Om du inte begärde detta kan du ignorera mailet.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: "Återställ lösenord – AI Kundtjänst",
    html
  });
}

/* =====================
   ✅ Auth middleware
===================== */
const authenticate = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Ogiltig token" });
  }
};

const requireAdmin = async (req, res, next) => {
  const dbUser = await User.findById(req.user?.id);
  if (!dbUser || dbUser.role !== "admin") return res.status(403).json({ error: "Admin krävs" });
  next();
};

/* =====================
   ✅ ROUTES
===================== */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

app.get("/me", authenticate, async (req, res) => {
  const u = await User.findById(req.user.id).select("-password");
  if (!u) return res.status(404).json({ error: "User saknas" });
  return res.json({ id: u._id, username: u.username, email: u.email, role: u.role });
});

/* =====================
   ✅ AUTH
===================== */
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Användarnamn, email och lösenord krävs" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await new User({ username, email, password: hashedPassword }).save();
    return res.json({
      message: "Registrering lyckades ✅",
      user: { id: u._id, username: u.username, email: u.email, role: u.role }
    });
  } catch {
    return res.status(400).json({ error: "Användarnamn eller email upptaget" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const u = await User.findOne({ username });
  if (!u) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const token = jwt.sign({ id: u._id, username: u.username }, process.env.JWT_SECRET, { expiresIn: "7d" });
  return res.json({ token, user: { id: u._id, username: u.username, email: u.email, role: u.role } });
});

/* =====================
   ✅ Change password (logged in)
===================== */
app.post("/auth/change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "currentPassword + newPassword krävs" });

    if (String(newPassword).length < 6) return res.status(400).json({ error: "Nytt lösenord måste vara minst 6 tecken" });

    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ error: "User saknas" });

    const ok = await bcrypt.compare(currentPassword, u.password);
    if (!ok) return res.status(401).json({ error: "Nuvarande lösenord är fel" });

    u.password = await bcrypt.hash(newPassword, 10);
    await u.save();

    return res.json({ message: "Lösenord uppdaterat ✅" });
  } catch (e) {
    console.error("❌ change-password error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid change-password" });
  }
});

/* =====================
   ✅ Change username (logged in)
===================== */
app.post("/auth/change-username", authenticate, async (req, res) => {
  try {
    const { newUsername } = req.body || {};
    if (!newUsername) return res.status(400).json({ error: "newUsername krävs" });

    const cleaned = String(newUsername).trim();
    if (cleaned.length < 3) return res.status(400).json({ error: "Användarnamn måste vara minst 3 tecken" });

    const exists = await User.findOne({ username: cleaned });
    if (exists) return res.status(400).json({ error: "Användarnamn upptaget" });

    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ error: "User saknas" });

    u.username = cleaned;
    await u.save();

    return res.json({ message: "Användarnamn uppdaterat ✅", username: u.username });
  } catch (e) {
    console.error("❌ change-username error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid change-username" });
  }
});

/* =====================
   ✅ Forgot password
===================== */
app.post("/auth/forgot-password", async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: "username krävs" });

    const u = await User.findOne({ username });

    if (!u) {
      return res.json({ message: "Om kontot finns skickas en återställningslänk ✅" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    u.resetPasswordToken = token;
    u.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 30);
    await u.save();

    const resetLink = `${getAppUrl(req)}/?resetToken=${token}`;
    await sendResetEmail({ to: u.email, resetLink });

    return res.json({ message: "Återställningslänk skickad ✅" });
  } catch (e) {
    console.error("❌ forgot-password error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid återställning" });
  }
});

/* =====================
   ✅ Reset password
===================== */
app.post("/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res.status(400).json({ error: "token och newPassword krävs" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "Lösenord måste vara minst 6 tecken" });
    }

    const u = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!u) {
      return res.status(400).json({ error: "Länken är ogiltig eller har gått ut." });
    }

    u.password = await bcrypt.hash(newPassword, 10);
    u.resetPasswordToken = null;
    u.resetPasswordExpires = null;

    await u.save();

    return res.json({ message: "Lösenord uppdaterat ✅ Logga in igen." });
  } catch (e) {
    console.error("❌ reset-password error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid reset" });
  }
});

/* =====================
   ✅ Categories (public list for dropdown)
===================== */
app.get("/categories", async (req, res) => {
  const cats = await Category.find({}).sort({ createdAt: 1 });
  return res.json(cats.map(c => ({ key: c.key, name: c.name })));
});

/* =====================
   ✅ Admin Category Manager
===================== */
app.get("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  const cats = await Category.find({}).sort({ createdAt: 1 });
  return res.json(cats);
});

app.post("/admin/categories", authenticate, requireAdmin, async (req, res) => {
  try {
    const { key, name, systemPrompt } = req.body || {};
    if (!key || !name) return res.status(400).json({ error: "key + name krävs" });

    const cleanedKey = String(key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanedKey) return res.status(400).json({ error: "Ogiltig key" });

    const exists = await Category.findOne({ key: cleanedKey });
    if (exists) return res.status(400).json({ error: "Kategori key finns redan" });

    const c = await new Category({
      key: cleanedKey,
      name: String(name).trim(),
      systemPrompt: String(systemPrompt || "").trim()
    }).save();

    return res.json({ message: "Kategori skapad ✅", category: c });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid skapa kategori" });
  }
});

app.put("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, systemPrompt } = req.body || {};
    const c = await Category.findOne({ key: req.params.key });
    if (!c) return res.status(404).json({ error: "Kategori hittades inte" });

    if (name) c.name = String(name).trim();
    if (systemPrompt !== undefined) c.systemPrompt = String(systemPrompt || "").trim();

    await c.save();
    return res.json({ message: "Kategori uppdaterad ✅", category: c });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid uppdatera kategori" });
  }
});

app.delete("/admin/categories/:key", authenticate, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    if (["demo", "law", "tech", "cleaning"].includes(key)) {
      return res.status(400).json({ error: "Default-kategorier kan inte raderas." });
    }

    await Category.deleteOne({ key });
    await KBChunk.deleteMany({ companyId: key });
    await Ticket.deleteMany({ companyId: key });

    return res.json({ message: "Kategori borttagen ✅" });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid ta bort kategori" });
  }
});

/* =====================
   ✅ CHAT (ticket + RAG)
===================== */
app.post("/chat", authenticate, async (req, res) => {
  try {
    const { companyId, conversation, ticketId } = req.body || {};
    if (!companyId || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "companyId eller konversation saknas" });
    }

    let ticket;
    if (ticketId) {
      ticket = await Ticket.findOne({ _id: ticketId, userId: req.user.id });
      if (!ticket) return res.status(404).json({ error: "Ticket hittades inte" });
    } else {
      ticket = await ensureTicket(req.user.id, companyId);
    }

    const lastUser = conversation[conversation.length - 1];
    const userQuery = cleanText(lastUser?.content || "");

    if (lastUser?.role === "user") {
      ticket.messages.push({ role: "user", content: userQuery, timestamp: new Date() });
      if (!ticket.title) ticket.title = userQuery.slice(0, 60);
      ticket.lastActivityAt = new Date();
      await ticket.save();
    }

    const rag = await ragSearch(companyId, userQuery, 4);
    const systemPrompt = await getSystemPrompt(companyId);

    const systemMessage = {
      role: "system",
      content:
        systemPrompt +
        (rag.used
          ? `\n\nIntern kunskapsdatabas (om relevant):\n${rag.context}\n\nSvara tydligt och konkret.`
          : "")
    };

    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const reply = cleanText(response.choices?.[0]?.message?.content || "Inget svar från AI.");

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    ticket.lastActivityAt = new Date();
    await ticket.save();

    return res.json({ reply, ticketId: ticket._id, ragUsed: rag.used, sources: rag.sources });
  } catch (e) {
    console.error("❌ Chat error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/* =====================
   ✅ USER tickets
===================== */
app.get("/tickets", authenticate, async (req, res) => {
  const tickets = await Ticket.find({ userId: req.user.id }).sort({ lastActivityAt: -1 }).limit(80);
  return res.json(tickets);
});

app.get("/tickets/:ticketId", authenticate, async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.ticketId, userId: req.user.id });
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

/* =====================
   ✅ FEEDBACK (all users)
===================== */
app.post("/feedback", authenticate, async (req, res) => {
  try {
    const { companyId, rating, comment } = req.body || {};
    await new Feedback({
      userId: req.user.id,
      companyId: String(companyId || "demo"),
      rating: Number(rating || 0),
      comment: cleanText(comment || "")
    }).save();

    return res.json({ message: "Feedback skickad ✅" });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid feedback" });
  }
});

/* =====================
   ✅ ADMIN: Tickets inbox
===================== */
app.get("/admin/tickets", authenticate, requireAdmin, async (req, res) => {
  const { status, companyId } = req.query || {};
  const query = {};
  if (status) query.status = status;
  if (companyId) query.companyId = companyId;

  const tickets = await Ticket.find(query).sort({ lastActivityAt: -1 }).limit(500);
  return res.json(tickets);
});

app.get("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });
  return res.json(t);
});

app.post("/admin/tickets/:ticketId/status", authenticate, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["open", "pending", "solved"].includes(status)) {
    return res.status(400).json({ error: "Ogiltig status" });
  }

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.status = status;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Status uppdaterad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/priority", authenticate, requireAdmin, async (req, res) => {
  const { priority } = req.body || {};
  if (!["low", "normal", "high"].includes(priority)) {
    return res.status(400).json({ error: "Ogiltig prioritet" });
  }

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.priority = priority;
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Prioritet sparad ✅", ticket: t });
});

app.post("/admin/tickets/:ticketId/agent-reply", authenticate, requireAdmin, async (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content saknas" });

  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.messages.push({ role: "agent", content: cleanText(content), timestamp: new Date() });
  t.status = "pending";
  t.lastActivityAt = new Date();
  await t.save();

  return res.json({ message: "Agent-svar skickat ✅" });
});

app.post("/admin/tickets/:ticketId/notes", authenticate, requireAdmin, async (req, res) => {
  const { notes } = req.body || {};
  const t = await Ticket.findById(req.params.ticketId);
  if (!t) return res.status(404).json({ error: "Ticket hittades inte" });

  t.agentNotes = cleanText(notes || "");
  await t.save();

  return res.json({ message: "Notering sparad ✅" });
});

app.delete("/admin/tickets/:ticketId", authenticate, requireAdmin, async (req, res) => {
  try {
    await Ticket.deleteOne({ _id: req.params.ticketId });
    return res.json({ message: "Ticket borttagen ✅" });
  } catch {
    return res.status(500).json({ error: "Serverfel vid radera ticket" });
  }
});

app.delete("/admin/tickets-solved", authenticate, requireAdmin, async (req, res) => {
  try {
    const r = await Ticket.deleteMany({ status: "solved" });
    return res.json({ message: `Raderade solved tickets ✅ (${r.deletedCount})` });
  } catch {
    return res.status(500).json({ error: "Serverfel vid radera solved tickets" });
  }
});

/* =====================
   ✅ ADMIN: Users
===================== */
app.get("/admin/users", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 }).limit(2000);
  return res.json(users);
});

app.post("/admin/users/:userId/role", authenticate, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

  const u = await User.findById(req.params.userId);
  if (!u) return res.status(404).json({ error: "User hittades inte" });

  u.role = role;
  await u.save();

  return res.json({ message: "Roll uppdaterad ✅", user: { id: u._id, username: u.username, role: u.role } });
});

app.delete("/admin/users/:userId", authenticate, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.userId;

    if (String(targetId) === String(req.user.id)) {
      return res.status(400).json({ error: "Du kan inte ta bort dig själv." });
    }

    const u = await User.findById(targetId);
    if (!u) return res.status(404).json({ error: "User hittades inte" });

    // skydda admins
    if (u.role === "admin") {
      return res.status(400).json({ error: "Admins kan inte raderas här." });
    }

    await Ticket.deleteMany({ userId: targetId });
    await Feedback.deleteMany({ userId: targetId });
    await User.deleteOne({ _id: targetId });

    return res.json({ message: `Användaren ${u.username} togs bort ✅` });
  } catch (e) {
    return res.status(500).json({ error: "Serverfel vid borttagning" });
  }
});

/* =====================
   ✅ ADMIN: KB
===================== */
app.get("/kb/list/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 }).limit(500);
  return res.json(items);
});

app.post("/kb/upload-text", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, title, content } = req.body || {};
    if (!companyId || !content) return res.status(400).json({ error: "companyId eller content saknas" });

    const chunks = chunkText(content);
    if (!chunks.length) return res.status(400).json({ error: "Ingen text att spara" });

    let okCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      const embeddingOk = !!emb;
      if (embeddingOk) okCount++;

      await new KBChunk({
        companyId,
        sourceType: "text",
        sourceRef: "manual",
        title: title || "Text",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk
      }).save();
    }

    return res.json({ message: `Text uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})` });
  } catch (e) {
    return res.status(500).json({ error: `Serverfel: ${e.message}` });
  }
});

app.post("/kb/upload-url", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, url } = req.body || {};
    if (!companyId || !url) return res.status(400).json({ error: "companyId eller url saknas" });

    const text = await fetchUrlText(url);
    const chunks = chunkText(text);

    let okCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      const embeddingOk = !!emb;
      if (embeddingOk) okCount++;

      await new KBChunk({
        companyId,
        sourceType: "url",
        sourceRef: url,
        title: "URL",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk
      }).save();
    }

    return res.json({ message: `URL uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})` });
  } catch (e) {
    return res.status(500).json({ error: `Serverfel vid URL-upload: ${e.message}` });
  }
});

app.post("/kb/upload-pdf", authenticate, requireAdmin, async (req, res) => {
  try {
    const { companyId, filename, base64 } = req.body || {};
    if (!companyId || !base64) return res.status(400).json({ error: "companyId eller base64 saknas" });

    const text = await extractPdfText(base64);
    const chunks = chunkText(text);

    let okCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const emb = await createEmbedding(chunks[i]);
      const embeddingOk = !!emb;
      if (embeddingOk) okCount++;

      await new KBChunk({
        companyId,
        sourceType: "pdf",
        sourceRef: filename || "pdf",
        title: filename || "PDF",
        chunkIndex: i,
        content: chunks[i],
        embedding: emb || [],
        embeddingOk
      }).save();
    }

    return res.json({ message: `PDF uppladdad ✅ (${chunks.length} chunks, embeddings: ${okCount}/${chunks.length})` });
  } catch (e) {
    return res.status(500).json({ error: `Serverfel vid PDF-upload: ${e.message}` });
  }
});

app.get("/export/kb/:companyId", authenticate, requireAdmin, async (req, res) => {
  const items = await KBChunk.find({ companyId: req.params.companyId }).sort({ createdAt: -1 });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="kb_${req.params.companyId}.json"`);
  return res.send(JSON.stringify(items, null, 2));
});

/* =====================
   ✅ Dashboard (Admin)
===================== */
app.get("/admin/dashboard", authenticate, requireAdmin, async (req, res) => {
  const totalUsers = await User.countDocuments({});
  const totalTickets = await Ticket.countDocuments({});
  const openTickets = await Ticket.countDocuments({ status: "open" });
  const pendingTickets = await Ticket.countDocuments({ status: "pending" });
  const solvedTickets = await Ticket.countDocuments({ status: "solved" });
  const totalKb = await KBChunk.countDocuments({});
  const totalFeedback = await Feedback.countDocuments({});

  return res.json({
    totalUsers,
    totalTickets,
    openTickets,
    pendingTickets,
    solvedTickets,
    totalKb,
    totalFeedback
  });
});

/* =====================
   ✅ Start
===================== */
ensureDefaultCategories().finally(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
});
