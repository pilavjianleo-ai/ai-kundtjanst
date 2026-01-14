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

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

/* ========= ENV CHECK ========= */
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
});

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", process.env.MONGO_URI ? "OK" : "SAKNAS");
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");

/* ========= MongoDB ========= */
mongoose.set("strictQuery", true);

if (!mongoUri) {
  console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i .env eller i Render Environment.");
} else {
  mongoose
    .connect(mongoUri)
    .then(() => console.log("✅ MongoDB ansluten"))
    .catch((err) => console.error("❌ MongoDB-fel:", err.message));
}

/* ========= Models ========= */
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
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

/* ========= OpenAI ========= */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ========= Auth middleware ========= */
function authenticate(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Ogiltig token" });
  }
}

/* ========= Rate limiting ========= */
const limiterChat = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "För många requests. Försök igen senare.",
});

const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "För många försök. Vänta en stund.",
});

app.use("/chat", limiterChat);
app.use("/login", limiterAuth);
app.use("/register", limiterAuth);

/* ========= Systemprompt ========= */
function getSystemPrompt(companyId) {
  if (companyId === "law") {
    return "Du är en AI-assistent för juridiska frågor på svenska. Ge allmänna råd baserat på svensk lag, men var tydlig: 'Detta är inte juridisk rådgivning; konsultera en advokat för specifika fall.'";
  }
  if (companyId === "tech") {
    return "Du är en AI-assistent för tekniska frågor inom IT och programmering på svenska. Förklara enkelt, ge kodexempel och fokusera på bästa praxis.";
  }
  if (companyId === "cleaning") {
    return "Du är en AI-assistent för städ- och rengöringsfrågor på svenska. Ge praktiska råd om teknik, produkter och säkerhet.";
  }
  return "Du är en hjälpsam AI-assistent på svenska.";
}

/* ========= Routes ========= */
app.get("/", (req, res) => {
  return res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/favicon.ico", (req, res) => res.status(204).end());

/* ========= AUTH ========= */
app.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Användarnamn och lösenord krävs" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await new User({ username, password: hashedPassword }).save();
    return res.json({ message: "Registrering lyckades" });
  } catch {
    return res.status(400).json({ error: "Användarnamn upptaget" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Användarnamn och lösenord krävs" });
  }

  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const token = jwt.sign({ id: user._id, username }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  return res.json({ token, user: { id: user._id, username } });
});

/* ========= CHAT ========= */
app.post("/chat", authenticate, async (req, res) => {
  try {
    const { companyId, conversation } = req.body || {};

    if (!companyId || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "companyId eller konversation saknas" });
    }

    const systemMessage = { role: "system", content: getSystemPrompt(companyId) };
    const messages = [systemMessage, ...conversation];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const replyRaw = response.choices?.[0]?.message?.content || "Inget svar från AI.";
    const reply = sanitizeHtml(replyRaw, { allowedTags: [], allowedAttributes: {} });

    let chat = await Chat.findOne({ userId: req.user.id, companyId });
    if (!chat) chat = new Chat({ userId: req.user.id, companyId, messages: [] });

    const formattedConversation = conversation.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(),
    }));

    chat.messages.push(...formattedConversation);
    chat.messages.push({ role: "assistant", content: reply, timestamp: new Date() });

    await chat.save();

    return res.json({ reply });
  } catch (error) {
    console.error("❌ AI-fel:", error?.message || error);
    return res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

/* ========= HISTORY ========= */
app.get("/history/:companyId", authenticate, async (req, res) => {
  const chat = await Chat.findOne({ userId: req.user.id, companyId: req.params.companyId });
  return res.json(chat ? chat.messages : []);
});

app.delete("/history/:companyId", authenticate, async (req, res) => {
  await Chat.deleteOne({ userId: req.user.id, companyId: req.params.companyId });
  return res.json({ message: "Historik rensad" });
});

/* ========= FEEDBACK ========= */
app.post("/feedback", authenticate, async (req, res) => {
  const { type, companyId } = req.body || {};
  if (!type || !companyId) return res.status(400).json({ error: "type eller companyId saknas" });

  await new Feedback({ userId: req.user.id, type, companyId }).save();
  return res.json({ message: "Tack för feedback!" });
});

/* ========= EXPORT KNOWLEDGE BASE ========= */
app.get("/export/knowledgebase", authenticate, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.user.id }).lean();
    const feedback = await Feedback.find({ userId: req.user.id }).lean();

    const payload = {
      exportedAt: new Date().toISOString(),
      userId: req.user.id,
      chats,
      feedback,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="knowledge_base_${Date.now()}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch {
    return res.status(500).json({ error: "Kunde inte exportera kunskapsdatabas" });
  }
});

/* ========= 404 JSON ========= */
app.use((req, res) => {
  return res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

/* ========= START SERVER ========= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servern körs på http://localhost:${PORT}`));
