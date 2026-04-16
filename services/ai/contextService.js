const { escapeRegExp } = require("../../utils/text");

async function fetchRelevantKnowledge({ companyId, userMessage, Document, Knowledge, KnowledgeChunk, limit = 5 }) {
  const keywords = String(userMessage || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3);

  let docs = [];
  if (keywords.length > 0) {
    const orConditions = keywords.flatMap((kw) => [
      { title: { $regex: escapeRegExp(kw), $options: "i" } },
      { content: { $regex: escapeRegExp(kw), $options: "i" } }
    ]);
    docs = await Document.find({ companyId, $or: orConditions }).limit(limit);
  }

  if (docs.length === 0) {
    docs = await Document.find({ companyId }).sort({ createdAt: -1 }).limit(limit);
  }

  let kbText = docs
    .map((d) => `[KB: ${d.title}]\n${String(d.content || "").slice(0, 1500)}`)
    .join("\n\n");

  let knowledgeText = "";
  try {
    if (KnowledgeChunk && keywords.length > 0) {
      const or = keywords.map((kw) => ({ content: { $regex: escapeRegExp(kw), $options: "i" } }));
      const chunks = await KnowledgeChunk.find({ companyId, $or: or }).sort({ createdAt: -1 }).limit(6);
      if (chunks && chunks.length) {
        knowledgeText = chunks
          .map((c) => `[Knowledge chunk]\n${String(c.content || "").slice(0, 1200)}`)
          .join("\n\n");
      }
    }
    if (!knowledgeText && Knowledge) {
      const items = await Knowledge.find({ companyId }).sort({ createdAt: -1 }).limit(3);
      if (items && items.length) {
        knowledgeText = items
          .map((k) => `[Knowledge: ${k.title}]\n${String(k.rawContent || "").slice(0, 1200)}`)
          .join("\n\n");
      }
    }
  } catch {}

  const contextText = [kbText, knowledgeText].filter(Boolean).join("\n\n");

  return { docs, contextText };
}

module.exports = { fetchRelevantKnowledge };
