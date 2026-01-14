require("dotenv").config()
const express = require("express")
const OpenAI = require("openai")
const cors = require("cors")
const rateLimit = require("express-rate-limit")
const sanitizeHtml = require("sanitize-html")

const app = express()
app.use(express.json())
app.use(cors()) // Tillåt cross-origin requests

// Rate limiting för att förhindra missbruk
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuter
  max: 100, // Max 100 requests per IP
  message: "För många requests, försök igen senare."
})
app.use("/chat", limiter)

const path = require("path")
app.use(express.static(__dirname))

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Funktion för att hämta systemprompt baserat på companyId
function getSystemPrompt(companyId) {
  switch (companyId) {
    case 'law':
      return "Du är en AI-assistent för juridiska frågor. Ge råd baserat på allmän svensk lag, men rekommendera alltid att konsultera en professionell jurist för specifika fall. Var hjälpsam, korrekt och tydlig."
    case 'tech':
      return "Du är en AI-assistent för tekniska frågor inom IT och programmering. Förklara begrepp enkelt, ge kodexempel när möjligt och fokusera på bästa praxis. Var pedagogisk och uppmuntrande."
    case 'cleaning':
      return "Du är en AI-assistent för städ- och rengöringsfrågor. Ge praktiska råd om rengöringstekniker, produkter och säkerhet. Var vänlig och användbar för både hem och professionella miljöer."
    default:
      return "Du är en allmän AI-assistent. Ge hjälpsamma och korrekta svar på frågor."
  }
}

app.get("/", (req, res) => {
  res.send("AI Kundtjänst körs")
})

app.get("/favicon.ico", (req, res) => {
  res.status(204).end(); // Hantera favicon utan fel
})

app.post("/chat", async (req, res) => {
  try {
    const { companyId, conversation } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "companyId saknas" });
    }

    if (!conversation || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "Konversation saknas" });
    }

    // Lägg till systemprompt baserat på companyId
    const systemMessage = { role: 'system', content: getSystemPrompt(companyId) };
    const messages = [systemMessage, ...conversation];

    // Använd hela konversationen inklusive systemprompt som skickades från klienten
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages, // Hela chatten som kontext med systemprompt
    });

    const reply = sanitizeHtml(response.choices[0].message.content, { allowedTags: [], allowedAttributes: {} });

    res.json({
      reply: reply
    });
  } catch (error) {
    console.error("AI-fel:", error);
    res.status(500).json({ error: "Fel vid AI-anrop" });
  }
});

app.listen(3000, () => {
  console.log("Servern körs på http://localhost:3000")
})