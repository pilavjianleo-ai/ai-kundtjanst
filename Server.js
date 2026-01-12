require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   Middleware
========================= */
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* =========================
   Rate limit (skydd)
========================= */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minut
  max: 20, // max 20 requests/min
  standardHeaders: true,
  legacyHeaders: false,
});

/* =========================
   Root – visa index.html
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   OpenAI client
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =========================
   In-memory session store
========================= */
const conversations = {};
const SESSION_TTL = 30 * 60 * 1000; // 30 min
const MAX_MESSAGES_PER_SESSION = 12;

/* =========================
   Chat endpoint
========================= */
app.post("/chat", chatLimiter, async (req, res) => {
  try {
    let { companyId, sessionId, message } = req.body;

    /* ---------- Validering ---------- */
    if (!sessionId) {
      return res.status(400).json({ reply: "Session saknas." });
    }

    if (!companyId) {
      return res.status(400).json({ reply: "companyId saknas." });
    }

    if (!message || message.trim().length < 2) {
      return res.status(400).json({ reply: "Meddelandet är för kort." });
    }

    message = message.trim();

    /* ---------- Skapa session ---------- */
    if (!conversations[sessionId]) {
      conversations[sessionId] = {
        messages: [],
        lastActive: Date.now(),
      };
    }

    conversations[sessionId].lastActive = Date.now();

    /* ---------- System prompt ---------- */
    let systemPrompt =
      "Du är en professionell, vänlig och hjälpsam AI-kundtjänst.";

    if (companyId === "demo") {
      systemPrompt =
        "Du är kundtjänst för Demo AB. Du svarar vänligt, tydligt och på svenska.";
    }

    if (companyId === "law") {
      systemPrompt =
        "Du är en juridisk rådgivare. Du svarar formellt, försiktigt och tydligt. Du ger inga definitiva juridiska råd utan informerar pedagogiskt.";
    }

    if (companyId === "tech") {
      systemPrompt =
        "Du är teknisk support. Du svarar tekniskt, strukturerat och steg-för-steg.";
    }

    if (companyId === "cleaning") {
      systemPrompt =
        "Du är kundtjänst för ett städföretag. Du svarar trevligt, enkelt och kundorienterat.";
    }

    /* ---------- Bygg meddelanden ---------- */
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversations[sessionId].messages,
      { role: "user", content: message },
    ];

    /* ---------- OpenAI ---------- */
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages,
    });

    const aiReply = response.choices[0].message.content;

    /* ---------- Spara i minnet ---------- */
    conversations[sessionId].messages.push(
      { role: "user", content: message },
      { role: "assistant", content: aiReply }
    );

    if (
      conversations[sessionId].messages.length >
      MAX_MESSAGES_PER_SESSION
    ) {
      conversations[sessionId].messages.splice(0, 2);
    }

    /* ---------- Skicka svar ---------- */
    res.json({ reply: aiReply });
  } catch (err) {
    console.error("AI-fel:", err);
    res.status(500).json({
      reply: "Tekniskt fel. Försök igen om en stund.",
    });
  }
});

/* =========================
   Rensa gamla sessioner
========================= */
setInterval(() => {
  const now = Date.now();
  for (const id in conversations) {
    if (now - conversations[id].lastActive > SESSION_TTL) {
      delete conversations[id];
    }
  }
}, 5 * 60 * 1000);

/* =========================
   Start server
========================= */
app.listen(PORT, () => {
  console.log(`Servern körs på http://localhost:${PORT}`);
});
