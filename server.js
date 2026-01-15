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
   ✅ ENV
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", process.env.MONGO_URI ? "OK" : "SAKNAS");
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "OK" : "SAKNAS");
console.log("SMTP_USER:", process.env.SMTP_USER ? "OK" : "SAKNAS");

if (!mongoUri) console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i Render env.");
if (!process.env.JWT_SECRET) console.error("❌ JWT_SECRET saknas!");
if (!process.env.OPENAI_API_KEY) console.error("❌ OPENAI_API_KEY saknas!");

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
  role: { type: String, default: "user" }, // user | admin

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
  type: String,
  companyId: String,
  createdAt: { type: Date, default: Date.now }
});
const Feedback = mongoose.model("Feedback", feedbackSchema);

/* =====================
   ✅ OpenAI
===================== */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================
   ✅ Rate limit
===================== */
const limiterChat = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const limiterAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

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

function getSystemPrompt(companyId) {
  switch (companyId) {
    case "law":
      return "Du är en AI-kundtjänst för juridiska frågor på svenska. Ge allmänna råd men inte juridisk rådgivning. Svara tydligt och professionellt.";
    case "tech":
      return "Du är en AI-kundtjänst för teknisk support inom IT och programmering på svenska. Felsök steg-för-steg och ge konkreta lösningar.";
    case "cleaning":
      return "Du är en AI-kundtjänst för städservice på svenska. Hjälp med bokningar, priser, rutiner och tips.";
    default:
      return "Du är en professionell och vänlig AI-kundtjänst på svenska.";
  }
}

async function ensureTicket(userId, companyId) {
  let t = await Ticket.findOne({ userId, companyId, status: { $ne: "solved" } }).sort({ lastActivityAt: -1 });
  if (!t) t = await new Ticket({ userId, companyId, messages: [] }).save();
  return t;
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
    return res.json({ message: "Registrering lyckades ✅", user: { id: u._id, username: u.username, email: u.email, role: u.role } });
  } catch (e) {
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
   ✅ Forgot password
===================== */
app.post("/auth/forgot-password", async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: "username krävs" });

    const u = await User.findOne({ username });

    // svara alltid ok även om user saknas (för säkerhet)
    if (!u) {
      return res.json({ message: "Om kontot finns skickas en återställningslänk ✅" });
    }

    if (!u.email) {
      return res.status(400).json({ error: "Kontot saknar email." });
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
   ✅ CHAT (basic)
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

    const systemMessage = { role: "system", content: getSystemPrompt(companyId) };
    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const reply = cleanText(response.choices?.[0]?.message?.content || "Inget svar från AI.");

    ticket.messages.push({ role: "assistant", content: reply, timestamp: new Date() });
    ticket.lastActivityAt = new Date();
    await ticket.save();

    return res.json({ reply, ticketId: ticket._id, ragUsed: false });
  } catch (e) {
    console.error("❌ Chat error:", e?.message || e);
    return res.status(500).json({ error: "Serverfel vid chat" });
  }
});

/* =====================
   ✅ Start
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
