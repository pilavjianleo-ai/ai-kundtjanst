function createKnowledgeController({ knowledgeService }) {
  async function list(req, res) {
    const { companyId } = req.query;
    const items = await knowledgeService.list({ companyId });
    res.json(items || []);
  }

  async function search(req, res) {
    const { companyId, q } = req.query;
    const items = await knowledgeService.search({ companyId, q });
    res.json(items || []);
  }

  async function chunks(req, res) {
    const knowledgeId = req.params.id;
    const items = await knowledgeService.getChunks({ knowledgeId });
    res.json(items || []);
  }

  async function remove(req, res) {
    const knowledgeId = req.params.id;
    await knowledgeService.remove({ knowledgeId });
    res.json({ message: "Borttagen" });
  }

  async function ingestText(req, res) {
    const { companyId, title, content } = req.body || {};
    const { knowledge, chunkCount } = await knowledgeService.ingestText({ companyId, title, content });
    res.json({ message: "Sparad", id: knowledge._id, chunkCount });
  }

  async function ingestUrl(req, res) {
    const { companyId, url } = req.body || {};
    const { knowledge, chunkCount } = await knowledgeService.ingestUrl({ companyId, url });
    res.json({ message: "URL tolkad och sparad", id: knowledge._id, chunkCount, title: knowledge.title });
  }

  async function ingestPdf(req, res) {
    const { companyId } = req.body || {};
    const file = req.file;
    const { knowledge, chunkCount } = await knowledgeService.ingestPdf({
      companyId,
      filename: file?.originalname,
      buffer: file?.buffer
    });
    res.json({ message: "PDF sparad", id: knowledge._id, chunkCount });
  }

  return { list, search, chunks, remove, ingestText, ingestUrl, ingestPdf };
}

module.exports = { createKnowledgeController };
