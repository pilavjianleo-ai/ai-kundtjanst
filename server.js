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
const axios = require("axios");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

// --------------------
// ✅ App init
// --------------------
const app = express();
app.set("trust proxy", 1);

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
// ✅ OpenAI
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
  role: { type: String, default: "user" }, // first user becomes admin
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
  type: { type: String, required: true },
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

const kbSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  title: { type: String, default: "Untitled" },
  sourceType: { type: String, enum: ["text", "url", "pdf"], required: true },
  sourceRef: { type: String, default: "" },
  content: { type: String, required: true },
  chunks: [{ type: String }],
  embeddings: [{ type: [Number] }],
  embeddingOk: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});
const KnowledgeItem = mongoose.model("KnowledgeItem", kbSchema);

// --------------------
// ✅ Helpers
// --------------------
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

async function safeEmbed(text) {
  try {
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return { ok: true, vector: emb.data[0].embedding };
  } catch (e) {
    const msg = e?.message || "Embedding error";
    console.error("⚠️ Embedding failed:", msg);
    return { ok: false, error: msg };
  }
}

async function embedChunks(chunks) {
  const embeddings = [];
  for (const c of chunks) {
    const r = await safeEmbed(c);
    if (!r.ok) return { embeddingOk: false, embeddings: [] };
    embeddings.push(r.vector);
  }
  return { embeddingOk: true, embeddings };
}

function getSystemPrompt(companyId) {
  const base =
    "Du är en AI-kundtjänst på svenska. Var hjälpsam, tydlig och ganska kort. Om du är osäker, säg det och föreslå nästa steg.";

  if (companyId === "law")
    return base + " Du hjälper med juridiska frågor och ger endast allmän information (ej juridisk rådgivning).";
  if (companyId === "tech")
    return base + " Du hjälper med tekniska frågor (IT/programmering) och ger konkreta steg och exempel.";
  if (companyId === "cleaning")
    return base + " Du hjälper med städservice och rengöring. Ge praktiska och säkra råd.";
  return base + " Du hjälper med generella kundtjänstfrågor.";
}

// --------------------
// ✅ Auth
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
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  return next();
}

// --------------------
// ✅ PDF upload
// --------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// --------------------
// ✅ URL extraction helper
// --------------------
function extractTextFromHtml(url, html) {
  // 1) Readability
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article?.textContent && article.textContent.trim().length > 200) {
      return sanitize(article.textContent).replace(/\s+/g, " ").trim();
    }
  } catch {}

  // 2) Cheerio fallback
  try {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, noscript, svg, iframe").remove();

    const candidates = [
      $("main").text(),
      $("article").text(),
      $('[role="main"]').text(),
      $("#content").text(),
      $(".content").text(),
      $("body").text(),
    ];

    let raw = candidates.find((t) => t && t.trim().length > 0) || "";
    raw = sanitize(raw).replace(/\s+/g, " ").trim();

    if (!raw || raw.length < 250) {
      const title = $("title").text() || "";
      const desc = $('meta[name="description"]').attr("content") || "";
      const og = $('meta[property="og:description"]').attr("content") || "";
      const combo = sanitize(`${title}\n${desc}\n${og}`).replace(/\s+/g, " ").trim();
      if (combo.length > raw.length) raw = combo;
    }

    return raw;
  } catch {
    return "";
  }
}

// --------------------
// ✅ Health + Frontend
// --------------------
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

// --------------------
// ✅ AUTH routes
// --------------------
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Användarnamn och lösenord krävs" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // first registered user becomes admin
    const count = await User.countDocuments();
    const role = count === 0 ? "admin" : "user";

    await new User({ username, password: hashedPassword, role }).save();
    return res.json({ message: "Registrering lyckades" });
  } catch (e) {
    console.error("Register error:", e?.message || e);
    return res.status(400).json({ error: "Användarnamn upptaget" });
  }
});

app.post("/login", async (req, res) => {
  try {
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

    return res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (e) {
    console.error("Login error:", e?.message || e);
    return res.status(500).json({ error: "Login error" });
  }
});

// --------------------
// ✅ KB Upload TEXT (works without embeddings)
// --------------------
app.post("/kb/upload-text", authenticate, async (req, res) => {
  try {
    const { companyId, title, content } = req.body || {};
    if (!companyId || !content) return res.status(400).json({ error: "companyId och content krävs" });

    const clean = sanitize(content);
    const chunks = chunkText(clean);

    const { embeddingOk, embeddings } = await embedChunks(chunks);

    const item = await new KnowledgeItem({
      companyId,
      title: title || "Text upload",
      sourceType: "text",
      sourceRef: "",
      content: clean,
      chunks,
      embeddings: embeddingOk ? embeddings : [],
      embeddingOk,
      createdBy: req.user.id,
    }).save();

    return res.json({
      message: embeddingOk
        ? "✅ Text sparad (med embeddings)"
        : "✅ Text sparad (utan embeddings pga quota/billing)",
      id: item._id,
      embeddingOk,
    });
  } catch (e) {
    console.error("KB text error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte spara text" });
  }
});

// --------------------
// ✅ KB Upload PDF (works without embeddings)
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
    const { embeddingOk, embeddings } = await embedChunks(chunks);

    const item = await new KnowledgeItem({
      companyId,
      title: `PDF: ${req.file.originalname}`,
      sourceType: "pdf",
      sourceRef: req.file.originalname,
      content: clean,
      chunks,
      embeddings: embeddingOk ? embeddings : [],
      embeddingOk,
      createdBy: req.user.id,
    }).save();

    return res.json({
      message: embeddingOk
        ? "✅ PDF sparad (med embeddings)"
        : "✅ PDF sparad (utan embeddings pga quota/billing)",
      id: item._id,
      embeddingOk,
    });
  } catch (e) {
    console.error("KB pdf error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte spara PDF" });
  }
});

// --------------------
// ✅ KB Upload URL (works without embeddings)
// --------------------
app.post("/kb/upload-url", authenticate, async (req, res) => {
  try {
    const { companyId, url } = req.body || {};
    if (!companyId || !url) return res.status(400).json({ error: "companyId och url krävs" });

    const resp = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
      },
      validateStatus: () => true,
    });

    const status = resp.status;
    const contentType = resp.headers?.["content-type"] || "";
    const len = typeof resp.data === "string" ? resp.data.length : 0;

    if (status >= 400) {
      return res.status(400).json({
        error: `Kunde inte hämta URL (HTTP ${status}). Sidan kan blockera bots.`,
        debug: { status, contentType, length: len },
      });
    }

    if (!contentType.includes("text/html")) {
      return res.status(400).json({
        error: `URL är inte HTML (content-type: ${contentType}).`,
        debug: { status, contentType, length: len },
      });
    }

    if (typeof resp.data !== "string") {
      return res.status(400).json({
        error: "Kunde inte läsa HTML från URL (fel format).",
        debug: { status, contentType },
      });
    }

    const html = resp.data;
    let raw = extractTextFromHtml(url, html);
    raw = sanitize(raw).replace(/\s+/g, " ").trim();

    if (!raw || raw.length < 120) {
      return res.status(400).json({
        error:
          "Ingen läsbar text hittades. Sidan kan vara dynamisk (React/SPA) eller blockerar automatiska hämtningar.",
        debug: { status, contentType, htmlLength: html.length, extractedLength: raw.length },
      });
    }

    const chunks = chunkText(raw);
    const { embeddingOk, embeddings } = await embedChunks(chunks);

    const item = await new KnowledgeItem({
      companyId,
      title: `URL: ${url}`,
      sourceType: "url",
      sourceRef: url,
      content: raw,
      chunks,
      embeddings: embeddingOk ? embeddings : [],
      embeddingOk,
      createdBy: req.user.id,
    }).save();

    return res.json({
      message: embeddingOk
        ? "✅ URL sparad i KB (med embeddings)"
        : "✅ URL sparad i KB (utan embeddings pga quota/billing)",
      id: item._id,
      chars: raw.length,
      embeddingOk,
    });
  } catch (e) {
    console.error("❌ KB upload-url crash:", e?.message || e);
    return res.status(500).json({
      error: `Serverfel vid URL-upload: ${e?.message || "okänt fel"}`,
    });
  }
});

// --------------------
// ✅ KB List/Delete (for current admin user)
// --------------------
app.get("/kb/list/:companyId", authenticate, async (req, res) => {
  try {
    const items = await KnowledgeItem.find({
      companyId: req.params.companyId,
      createdBy: req.user.id,
    })
      .select("_id title sourceType sourceRef createdAt embeddingOk")
      .sort({ createdAt: -1 });

    return res.json(items);
  } catch (e) {
    console.error("KB list error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte hämta KB" });
  }
});

app.delete("/kb/item/:id", authenticate, async (req, res) => {
  try {
    const item = await KnowledgeItem.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!item) return res.status(404).json({ error: "Hittade inte item" });
    await KnowledgeItem.deleteOne({ _id: req.params.id });
    return res.json({ message: "Borttaget" });
  } catch (e) {
    console.error("KB delete error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte ta bort" });
  }
});

// --------------------
// ✅ RAG retrieval (only uses docs with embeddings)
// --------------------
async function retrieveContext(companyId, query) {
  const items = await KnowledgeItem.find({ companyId, embeddingOk: true }).lean();
  if (!items.length) return "";

  const qEmb = await safeEmbed(query);
  if (!qEmb.ok) return ""; // no quota -> no RAG
  const q = qEmb.vector;

  const scored = [];
  for (const item of items) {
    const ch = item.chunks || [];
    const embs = item.embeddings || [];
    for (let i = 0; i < Math.min(ch.length, embs.length); i++) {
      scored.push({ score: dot(q, embs[i]), text: ch[i], title: item.title || "Doc" });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 6);

  return top.map((t, idx) => `Källa ${idx + 1} (${t.title}): ${t.text}`).join("\n\n");
}

// --------------------
// ✅ CHAT (works even without RAG)
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
    if (query) {
      try {
        kbContext = await retrieveContext(companyId, query);
      } catch (e) {
        console.log("RAG ignored:", e?.message || e);
      }
    }

    const systemMessage = {
      role: "system",
      content:
        getSystemPrompt(companyId) +
        (kbContext ? `\n\nAnvänd detta som primär källa:\n\n${kbContext}` : ""),
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
  } catch (e) {
    console.error("CHAT error:", e?.message || e);
    return res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

// --------------------
// ✅ HISTORY
// --------------------
app.get("/history/:companyId", authenticate, async (req, res) => {
  try {
    const chat = await Chat.findOne({ userId: req.user.id, companyId: req.params.companyId });
    return res.json(chat ? chat.messages : []);
  } catch (e) {
    console.error("History error:", e?.message || e);
    return res.status(500).json({ error: "Kunde inte hämta historik" });
  }
});

// --------------------
// ✅ Export: user (all my data)
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
  res.send(JSON.stringify(payload, null, 2));
});

// --------------------
// ✅ Export: KB per kategori (my data)
// --------------------
app.get("/export/kb/:companyId", authenticate, async (req, res) => {
  try {
    const companyId = req.params.companyId;

    const kb = await KnowledgeItem.find({
      createdBy: req.user.id,
      companyId,
    }).lean();

    const payload = {
      exportedAt: new Date().toISOString(),
      userId: req.user.id,
      companyId,
      knowledgeBase: kb,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="kb_${companyId}_${Date.now()}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error("Export KB per category error:", e?.message || e);
    res.status(500).json({ error: "Kunde inte exportera kategori" });
  }
});

// --------------------
// ✅ Admin export ALLT
// --------------------
app.get("/admin/export/all", authenticate, requireAdmin, async (req, res) => {
  const users = await User.find({}).select("_id username role createdAt").lean();
  const chats = await Chat.find({}).lean();
  const kb = await KnowledgeItem.find({}).lean();
  const feedback = await Feedback.find({}).lean();
  const training = await TrainingExample.find({}).lean();

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="ADMIN_EXPORT_ALL_${Date.now()}.json"`);
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), users, chats, kb, feedback, training }, null, 2));
});

// --------------------
// ✅ FEEDBACK
// --------------------
app.post("/feedback", authenticate, async (req, res) => {
  try {
    const { type, companyId } = req.body || {};
    if (!type || !companyId) return res.status(400).json({ error: "type eller companyId saknas" });

    await new Feedback({ userId: req.user.id, type, companyId }).save();
    return res.json({ message: "Tack!" });
  } catch (e) {
    console.error("Feedback error:", e?.message || e);
    return res.status(500).json({ error: "Feedback error" });
  }
});

// --------------------
// ✅ 404 JSON
// --------------------
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` }));

// --------------------
// ✅ Start
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
