const { cleanText, escapeRegExp } = require("../../utils/text");

function chunkText(raw, { maxChars = 900 } = {}) {
  const text = cleanText(raw);
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];

  for (const para of paragraphs.length ? paragraphs : [text]) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }
    let start = 0;
    while (start < para.length) {
      const end = Math.min(start + maxChars, para.length);
      let slice = para.slice(start, end);
      if (end < para.length) {
        const lastPunct = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
        if (lastPunct > 200) slice = slice.slice(0, lastPunct + 1);
      }
      chunks.push(slice.trim());
      start += slice.length;
    }
  }

  return chunks.filter(Boolean);
}

function approxTokens(str) {
  return Math.max(1, Math.ceil(String(str || "").length / 4));
}

function createKnowledgeService({ Knowledge, KnowledgeChunk, Readability, JSDOM, pdfParse }) {
  async function list({ companyId, limit = 100 }) {
    const query = companyId ? { companyId } : {};
    return Knowledge.find(query).sort({ createdAt: -1 }).limit(limit);
  }

  async function search({ companyId, q, limit = 50 }) {
    const query = {};
    if (companyId) query.companyId = String(companyId).trim();
    if (q && String(q).trim().length > 1) {
      const term = escapeRegExp(String(q).trim());
      query.$or = [{ title: { $regex: term, $options: "i" } }, { rawContent: { $regex: term, $options: "i" } }];
    }
    return Knowledge.find(query).sort({ createdAt: -1 }).limit(limit);
  }

  async function getChunks({ knowledgeId }) {
    const chunks = await KnowledgeChunk.find({ knowledgeId }).sort({ chunkIndex: 1 });
    return chunks || [];
  }

  async function remove({ knowledgeId }) {
    await KnowledgeChunk.deleteMany({ knowledgeId });
    await Knowledge.findByIdAndDelete(knowledgeId);
  }

  async function ingest({ companyId, title, rawContent, sourceType, sourceUrl = "", sourceMeta = {} }) {
    if (!companyId) throw Object.assign(new Error("Saknar companyId"), { status: 400 });
    if (!rawContent) throw Object.assign(new Error("Saknar content"), { status: 400 });
    const clean = cleanText(rawContent);
    if (!clean) throw Object.assign(new Error("Tomt content efter sanitering"), { status: 400 });

    const knowledge = await new Knowledge({
      companyId,
      title: title || "Knowledge",
      rawContent: clean,
      sourceType,
      sourceUrl,
      sourceMeta,
      embeddingStatus: "none"
    }).save();

    const chunks = chunkText(clean);
    if (chunks.length) {
      const docs = chunks.map((c, idx) => ({
        companyId,
        knowledgeId: knowledge._id,
        chunkIndex: idx,
        content: c,
        tokensApprox: approxTokens(c)
      }));
      await KnowledgeChunk.insertMany(docs);
    }

    knowledge.chunkCount = chunks.length;
    await knowledge.save();

    return { knowledge, chunkCount: chunks.length };
  }

  async function ingestText({ companyId, title, content }) {
    return ingest({ companyId, title: title || "Text", rawContent: content, sourceType: "text" });
  }

  async function ingestManual({ companyId, title, content, sourceMeta = {} }) {
    return ingest({ companyId, title: title || "Manual", rawContent: content, sourceType: "manual", sourceMeta });
  }

  async function updateManual({ knowledgeId, title, content, sourceMeta = {} }) {
    if (!knowledgeId) throw Object.assign(new Error("Saknar id"), { status: 400 });
    const knowledge = await Knowledge.findById(knowledgeId);
    if (!knowledge) throw Object.assign(new Error("Hittades ej"), { status: 404 });
    const clean = cleanText(content);
    if (!clean) throw Object.assign(new Error("Tomt content efter sanitering"), { status: 400 });

    knowledge.title = title || knowledge.title;
    knowledge.rawContent = clean;
    knowledge.sourceType = "manual";
    knowledge.sourceMeta = sourceMeta || {};
    knowledge.embeddingStatus = "none";

    await KnowledgeChunk.deleteMany({ knowledgeId: knowledge._id });
    const chunks = chunkText(clean);
    if (chunks.length) {
      const docs = chunks.map((c, idx) => ({
        companyId: knowledge.companyId,
        knowledgeId: knowledge._id,
        chunkIndex: idx,
        content: c,
        tokensApprox: approxTokens(c)
      }));
      await KnowledgeChunk.insertMany(docs);
    }

    knowledge.chunkCount = chunks.length;
    await knowledge.save();
    return { knowledge, chunkCount: chunks.length };
  }

  async function ingestUrl({ companyId, url }) {
    if (!url) throw Object.assign(new Error("Saknar URL"), { status: 400 });
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 8000 });
    if (!response.ok) throw Object.assign(new Error(`URL returnerade status ${response.status}`), { status: 400 });
    const html = await response.text();
    if (!html) throw Object.assign(new Error("Inget innehåll returnerades från webbsidan."), { status: 400 });

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article || !article.textContent) throw Object.assign(new Error("Kunde inte extrahera text från URL."), { status: 400 });

    return ingest({
      companyId,
      title: article.title || url,
      rawContent: article.textContent,
      sourceType: "url",
      sourceUrl: url,
      sourceMeta: { extractedTitle: article.title || "", length: (article.textContent || "").length }
    });
  }

  async function ingestPdf({ companyId, filename, buffer }) {
    if (!buffer) throw Object.assign(new Error("Ingen fil"), { status: 400 });
    const data = await pdfParse(buffer);
    return ingest({
      companyId,
      title: filename || "PDF",
      rawContent: data?.text || "",
      sourceType: "pdf",
      sourceMeta: { pages: data?.numpages || null }
    });
  }

  return { list, search, ingestText, ingestManual, updateManual, ingestUrl, ingestPdf, getChunks, remove, ingest };
}

module.exports = { createKnowledgeService };
