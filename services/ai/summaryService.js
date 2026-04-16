const { cleanText } = require("../../utils/text");

function createSummaryService({ openai }) {
  async function summarizeConversation({ conversation = [], companyId = "demo" }) {
    const safeConv = Array.isArray(conversation) ? conversation.slice(-20) : [];
    const text = safeConv
      .map((m) => `${m.role}: ${cleanText(m.content || "")}`)
      .join("\n")
      .slice(0, 4000);

    if (process.env.NODE_ENV === "test" || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("INSERT")) {
      const sentences = text.split(/\.\s+/).slice(0, 6);
      const keyPoints = sentences.filter((s) => s && s.length > 0).slice(0, 4);
      let summary = keyPoints.map((s, i) => `${i + 1}. ${s.trim()}.`).join(" ");
      if (!summary) summary = "Kund och AI har inlett en dialog. Ingen ytterligare information.";
      return summary;
    }

    const prompt = `Sammanfatta följande dialog kort, tydligt och informativt på svenska.
Företag: ${companyId}
Max 120 ord. Inkludera:
- Syftet med konversationen
- Viktiga detaljer och beslut
- Nästa steg (om tydliga)

Dialog:
${text}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 300
    });
    return completion.choices?.[0]?.message?.content || "Kunde inte generera sammanfattning.";
  }

  async function summarizeTicketText({ publicTicketId, text }) {
    const safeText = String(text || "").slice(0, 4000);
    if (process.env.NODE_ENV === "test" || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes("INSERT")) {
      const items = safeText.split(/\n/).filter(Boolean).slice(-8);
      return items.map((s, i) => `${i + 1}. ${s}`).join(" ");
    }

    const prompt = `Sammanfatta ticket ${publicTicketId} kort (max 120 ord) på svenska med syfte, läge och nästa steg.

${safeText}`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 280
    });
    return completion.choices?.[0]?.message?.content || "Kunde inte generera sammanfattning.";
  }

  return { summarizeConversation, summarizeTicketText };
}

module.exports = { createSummaryService };
