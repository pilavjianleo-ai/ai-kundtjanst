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
const multer = require("multer");
const pdfParse = require("pdf-parse");
const cheerio = require("cheerio");

// --------------------
// ✅ App init
// --------------------
const app = express();
app.set("trust proxy", 1); // ✅ Fix for Render + rate-limit behind proxy

app.use(express.json({ limit: "2mb" }));
app.use(cors());
app.use(express.static(__dirname));

// --------------------
// ✅ ENV CHECK
// --------------------
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");

// Crash visibility in logs
process.on("uncaughtException", (err) => console.error("❌ Uncaught Exception:", err));
process.on("unhandledRejection", (err) => console.error("❌ Unhandled Rejection:", err));

// --------------------
// ✅ MongoDB
// --------------------
mongoose.set("strictQuery", true);

if (!mongoUri) {
  console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i Render Environment.");
} else {
  mongoose
    .connect(mongoUri)
    .then(() => console.log("✅ MongoDB ansluten"))
    .catch((err) => console.error("❌ MongoDB-fel:", err.message));
}

// --------------------
// ✅ OpenAI client
// --------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --------------------
// ✅ Rate limiting
// --------------------
const limiterChat = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "För många requests. Försök igen senare.",
});

const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "För många försök. Vänta en stund.",
});

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);

// --------------------
// ✅ Models
// --------------------
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" }, // user | admin
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyId: { type: String, required: true },
  messages: [
    {
      role: String,
      content: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});
const Chat = mongoose.model("Chat", chatSchema);

const feedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, required: true }, // positive|negative
  companyId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Feedback = mongoose.model("Feedback", feedbackSchema);

const trainingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  companyId: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const TrainingExample = mongoose.model("TrainingExample", trainingSchema);

// ✅ Knowledge Base
const kbSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  title: { type: String, default: "Untitled" },
  sourceType: { type: String, enum: ["text", "url", "pdf"], required: true },
  sourceRef: { type: String, default: "" }, // url or filename
  content: { type: String, required: true }, // full text
  chunks: [{ type: String }], // chunked text
  embeddings: [{ type: [Number] }], // parallel to chunks
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});
const KnowledgeItem = mongoose.model("KnowledgeItem", kbSchema);

// --------------------
// ✅ Helpers
// --------------------
function getSystemPrompt(companyId) {
  const base =
    "Du är en AI-kundtjänst på svenska. Var hjälpsam, tydlig och ganska kort. Om du är osäker, säg det och föreslå nästa steg.";

  if (companyId === "law") {
    return base + " Du hjälper med juridiska frågor och ger endast allmän information (ej juridisk rådgivning).";
  }
  if (companyId === "tech") {
    return base + " Du hjälper med tekniska frågor (IT/programmering) och ger konkreta steg och exempel.";
  }
  if (companyId === "cleaning") {
    return base + " Du hjälper med städservice och rengöring. Ge praktiska och säkra råd.";
  }
  return base + " Du hjälper med generella kundtjänstfrågor.";
}

function sanitize(text) {
  return sanitizeHtml(String(text || ""), { allowedTags: [], allowedAttributes: {} });
}

function chunkText(text, chunkSize = 900, overlap = 150) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];

  const chunks = [];
  let i = 0;
  while (i < t.length) {
    const end = Math.min(i + chunkSize, t.length);
    chunks.push(t.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
    if (end === t.length) break;
  }
  return chunks;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

// --------------------
// ✅ Auth middleware
// --------------------
function authenticate(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: "Ogiltig token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  return next();
}

// --------------------
// ✅ Multer for PDF uploads
// --------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// --------------------
// ✅ Health check
// --------------------
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "alive" });
});

// --------------------
// ✅ Routes: Serve frontend
// --------------------
app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/favicon.ico", (req, res) => res.status(204).end());

// --------------------
// ✅ AUTH
// --------------------
app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ First ever user becomes admin
    const count = await User.countDocuments();
    const role = count === 0 ? "admin" : "user";

    await new User({ username, password: hashedPassword, role }).save();
    return res.json({ message: "Registrering lyckades" });
  } catch {
    return res.status(400).json({ error: "Användarnamn upptaget" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const token = jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return res.json({
    token,
    user: { id: user._id, username: user.username, role: user.role },
  });
});

// --------------------
// ✅ KnowledgeBase: Upload TEXT
// --------------------
app.post("/kb/upload-text", authenticate, async (req, res) => {
  try {
    const { companyId, title, content } = req.body || {};
    if (!companyId || !content) return res.status(400).json({ error: "companyId och content krävs" });

    const clean = sanitize(content);
    const chunks = chunkText(clean);

    const embeddings = [];
    for (const c of chunks) {
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: c,
      });
      embeddings.push(emb.data[0].embedding);
    }

    const item = await new KnowledgeItem({
      companyId,
      title: title || "Text upload",
      sourceType: "text",
      sourceRef: "",
      content: clean,
      chunks,
      embeddings,
      createdBy: req.user.id,
    }).save();

    return res.json({ message: "Text sparad i kunskapsdatabas", id: item._id });
  } catch (e) {
    console.error("KB text error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte spara text" });
  }
});

// --------------------
// ✅ KnowledgeBase: Upload URL (improved)
// --------------------
app.post("/kb/upload-url", authenticate, async (req, res) => {
  try {
    const { companyId, url } = req.body || {};
    if (!companyId || !url) return res.status(400).json({ error: "companyId och url krävs" });

    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!r.ok) return res.status(400).json({ error: `Kunde inte hämta URL (HTTP ${r.status})` });

    const html = await r.text();
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, noscript, svg").remove();

    let raw =
      $("main").text() ||
      $("article").text() ||
      $('[role="main"]').text() ||
      $("#content").text() ||
      $("body").text();

    raw = sanitize(raw || "").replace(/\s+/g, " ").trim();

    // fallback: meta description
    if (!raw || raw.length < 200) {
      const title = $("title").text() || "";
      const desc = $('meta[name="description"]').attr("content") || "";
      const og = $('meta[property="og:description"]').attr("content") || "";
      const combo = sanitize(`${title}\n${desc}\n${og}`).replace(/\s+/g, " ").trim();
      if (combo.length > raw.length) raw = combo;
    }

    if (!raw || raw.length < 80) {
      return res.status(400).json({
        error:
          "Ingen läsbar text hittades. Sidan kan vara dynamisk (React) eller blockerar bots. Tips: kopiera texten och använd 'Text upload'.",
      });
    }

    const chunks = chunkText(raw);

    const embeddings = [];
    for (const c of chunks) {
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: c,
      });
      embeddings.push(emb.data[0].embedding);
    }

    const item = await new KnowledgeItem({
      companyId,
      title: `URL: ${url}`,
      sourceType: "url",
      sourceRef: url,
      content: raw,
      chunks,
      embeddings,
      createdBy: req.user.id,
    }).save();

    return res.json({ message: "URL sparad i kunskapsdatabas", id: item._id, chars: raw.length });
  } catch (e) {
    console.error("KB url error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte spara URL" });
  }
});

// --------------------
// ✅ KnowledgeBase: Upload PDF
// --------------------
app.post("/kb/upload-pdf", authenticate, upload.single("pdf"), async (req, res) => {
  try {
    const companyId = req.body?.companyId;
    if (!companyId) return res.status(400).json({ error: "companyId krävs" });
    if (!req.file) return res.status(400).json({ error: "Ingen PDF uppladdad" });

    const data = await pdfParse(req.file.buffer);
    const clean = sanitize(data.text || "").replace(/\s+/g, " ").trim();
    if (!clean) return res.status(400).json({ error: "Kunde inte läsa text från PDF" });

    const chunks = chunkText(clean);

    const embeddings = [];
    for (const c of chunks) {
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: c,
      });
      embeddings.push(emb.data[0].embedding);
    }

    const item = await new KnowledgeItem({
      companyId,
      title: `PDF: ${req.file.originalname}`,
      sourceType: "pdf",
      sourceRef: req.file.originalname,
      content: clean,
      chunks,
      embeddings,
      createdBy: req.user.id,
    }).save();

    return res.json({ message: "PDF sparad i kunskapsdatabas", id: item._id });
  } catch (e) {
    console.error("KB pdf error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte spara PDF" });
  }
});

// --------------------
// ✅ KnowledgeBase: List per category
// --------------------
app.get("/kb/list/:companyId", authenticate, async (req, res) => {
  const items = await KnowledgeItem.find({
    companyId: req.params.companyId,
    createdBy: req.user.id,
  })
    .select("_id companyId title sourceType sourceRef createdAt")
    .sort({ createdAt: -1 });

  return res.json(items);
});

// --------------------
// ✅ KnowledgeBase: Delete item
// --------------------
app.delete("/kb/item/:id", authenticate, async (req, res) => {
  const item = await KnowledgeItem.findOne({ _id: req.params.id, createdBy: req.user.id });
  if (!item) return res.status(404).json({ error: "Hittade inte item" });

  await KnowledgeItem.deleteOne({ _id: req.params.id });
  return res.json({ message: "Borttaget" });
});

// --------------------
// ✅ RAG retrieval
// --------------------
async function retrieveContext(companyId, query) {
  const count = await KnowledgeItem.countDocuments({ companyId });
  if (count === 0) return ""; // ✅ don't waste tokens if KB empty

  const qEmb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const q = qEmb.data[0].embedding;

  const items = await KnowledgeItem.find({ companyId }).lean();
  const scored = [];

  for (const item of items) {
    const ch = item.chunks || [];
    const embs = item.embeddings || [];
    for (let i = 0; i < Math.min(ch.length, embs.length); i++) {
      scored.push({
        score: dot(q, embs[i]),
        text: ch[i],
        title: item.title || "Doc",
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 6);

  const context = top.map((t, idx) => `Källa ${idx + 1} (${t.title}): ${t.text}`).join("\n\n");
  return context;
}

// --------------------
// ✅ CHAT (with RAG)
// --------------------
app.post("/chat", authenticate, async (req, res) => {
  try {
    const { companyId, conversation } = req.body || {};
    if (!companyId || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "companyId eller konversation saknas" });
    }

    const lastUser = [...conversation].reverse().find((m) => m.role === "user");
    const query = lastUser?.content || "";

    let kbContext = "";
    try {
      kbContext = query ? await retrieveContext(companyId, query) : "";
    } catch (e) {
      console.log("RAG context error (ignored):", e?.message || e);
    }

    const system = getSystemPrompt(companyId);
    const systemMessage = {
      role: "system",
      content:
        system +
        (kbContext
          ? `\n\nHär är relevant information från företagets kunskapsdatabas. Använd detta som primär källa:\n\n${kbContext}`
          : ""),
    };

    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const replyRaw = response.choices?.[0]?.message?.content || "Inget svar från AI.";
    const reply = sanitize(replyRaw);

    let chat = await Chat.findOne({ userId: req.user.id, companyId });
    if (!chat) chat = new Chat({ userId: req.user.id, companyId, messages: [] });

    const formattedConversation = conversation.map((m) => ({
      role: m.role,
      content: sanitize(m.content),
      timestamp: new Date(),
    }));

    chat.messages.push(...formattedConversation);
    chat.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    await chat.save();

    if (query) {
      await new TrainingExample({
        userId: req.user.id,
        companyId,
        question: sanitize(query),
        answer: reply,
      }).save();
    }

    return res.json({ reply, ragUsed: Boolean(kbContext) });
  } catch (error) {
    console.error("❌ AI-fel:", error?.message || error);
    return res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

// --------------------
// ✅ HISTORY
// --------------------
app.get("/history/:companyId", authenticate, async (req, res) => {
  const chat = await Chat.findOne({ userId: req.user.id, companyId: req.params.companyId });
  return res.json(chat ? chat.messages : []);
});

app.delete("/history/:companyId", authenticate, async (req, res) => {
  await Chat.deleteOne({ userId: req.user.id, companyId: req.params.companyId });
  return res.json({ message: "Historik rensad" });
});

// --------------------
// ✅ FEEDBACK
// --------------------
app.post("/feedback", authenticate, async (req, res) => {
  const { type, companyId } = req.body || {};
  if (!type || !companyId) return res.status(400).json({ error: "type eller companyId saknas" });

  await new Feedback({ userId: req.user.id, type, companyId }).save();
  return res.json({ message: "Tack för feedback!" });
});

// --------------------
// ✅ EXPORTS (user)
// --------------------
app.get("/export/knowledgebase", authenticate, async (req, res) => {
  const chats = await Chat.find({ userId: req.user.id }).lean();
  const kb = await KnowledgeItem.find({ createdBy: req.user.id }).lean();
  const feedback = await Feedback.find({ userId: req.user.id }).lean();
  const training = await TrainingExample.find({ userId: req.user.id }).lean();

  const payload = {
    exportedAt: new Date().toISOString(),
    userId: req.user.id,
    chats,
    knowledgeBase: kb,
    feedback,
    trainingData: training,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="my_export_${Date.now()}.json"`);
  return res.send(JSON.stringify(payload, null, 2));
});

app.get("/export/knowledgebase/:companyId", authenticate, async (req, res) => {
  const companyId = req.params.companyId;

  const chats = await Chat.find({ userId: req.user.id, companyId }).lean();
  const kb = await KnowledgeItem.find({ createdBy: req.user.id, companyId }).lean();
  const feedback = await Feedback.find({ userId: req.user.id, companyId }).lean();
  const training = await TrainingExample.find({ userId: req.user.id, companyId }).lean();

  const payload = {
    exportedAt: new Date().toISOString(),
    userId: req.user.id,
    companyId,
    chats,
    knowledgeBase: kb,
    feedback,
    trainingData: training,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="my_export_${companyId}_${Date.now()}.json"`);
  return res.send(JSON.stringify(payload, null, 2));
});

// --------------------
// ✅ ADMIN EXPORT ALL USERS
// --------------------
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("_id username role createdAt").lean();
  const chats = await Chat.find({}).lean();
  const kb = await KnowledgeItem.find({}).lean();
  const feedback = await Feedback.find({}).lean();
  const training = await TrainingExample.find({}).lean();

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: { id: req.user.id, username: req.user.username, role: req.user.role },
    users,
    chats,
    knowledgeBase: kb,
    feedback,
    trainingData: training,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="ADMIN_EXPORT_ALL_${Date.now()}.json"`);
  return res.send(JSON.stringify(payload, null, 2));
});

// --------------------
// ✅ 404 JSON fallback
// --------------------
app.use((req, res) => {
  return res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// --------------------
// ✅ Start server
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
