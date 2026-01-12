
require("dotenv").config()
const express = require("express")
const OpenAI = require("openai")

const app = express()
app.use(express.json())

const path = require("path")
app.use(express.static(__dirname))


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

app.get("/", (req, res) => {
  res.send("AI Kundtjänst körs")
})

app.post("/chat", async (req, res) => {
  try {
    const { companyId, message } = req.body

    if (!companyId) {
      return res.status(400).json({ error: "companyId saknas" })
    }

    if (!message) {
      return res.status(400).json({ error: "Meddelande saknas" })
    }

    let systemPrompt =
      "Du är en professionell, vänlig och hjälpsam AI-kundtjänst."

    if (companyId === "demo") {
      systemPrompt =
        "Du är kundtjänst för Demo AB. Du är vänlig, tydlig och hjälpsam."
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    })

    res.json({
      reply: response.choices[0].message.content
    })
  } catch (error) {
    console.error("AI-fel:", error)
    res.status(500).json({ error: "Fel vid AI-anrop" })
  }
})

app.listen(3000, () => {
  console.log("Servern körs på http://localhost:3000")
})
