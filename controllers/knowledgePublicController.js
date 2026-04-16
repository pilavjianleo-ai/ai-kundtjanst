function createKnowledgePublicController({ Knowledge, KnowledgeChunk, knowledgeService }) {
  async function list(req, res, next) {
    try {
      const user = req.user;
      const companyId = user?.role === "user" && user.companyId ? user.companyId : (req.query.companyId || user?.companyId || "demo");
      const q = { companyId: String(companyId).trim() };
      const term = String(req.query.q || "").trim();
      const category = String(req.query.category || "").trim();
      if (category) q.category = category;
      if (term) {
        q.$or = [
          { title: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { rawContent: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
          { tags: { $elemMatch: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } }
        ];
      }
      const items = await Knowledge.find(q)
        .sort({ createdAt: -1 })
        .limit(200);
      res.json(items || []);
    } catch (e) {
      next(e);
    }
  }

  async function create(req, res, next) {
    try {
      const user = req.user;
      const companyId = user?.role === "user" && user.companyId ? user.companyId : (req.body.companyId || user?.companyId || "demo");
      const { title, content, category = "", tags = [] } = req.body;

      const r = await knowledgeService.ingestManual({
        companyId: String(companyId).trim(),
        title,
        content,
        sourceMeta: { category, tags }
      });

      await Knowledge.findByIdAndUpdate(r.knowledge._id, {
        category: String(category || ""),
        tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [],
        createdBy: user?._id || null
      });

      res.json({ message: "Sparad", id: r.knowledge._id, chunkCount: r.chunkCount });
    } catch (e) {
      next(e);
    }
  }

  async function remove(req, res, next) {
    try {
      const id = req.params.id;
      const k = await Knowledge.findById(id);
      if (!k) return res.status(404).json({ error: "Hittades ej" });
      const user = req.user;
      if (user?.role === "user" && user.companyId && String(k.companyId) !== String(user.companyId)) {
        return res.status(403).json({ error: "Ej behörig" });
      }
      await KnowledgeChunk.deleteMany({ knowledgeId: id });
      await Knowledge.findByIdAndDelete(id);
      res.json({ message: "Borttagen" });
    } catch (e) {
      next(e);
    }
  }

  async function update(req, res, next) {
    try {
      const id = req.params.id;
      const existing = await Knowledge.findById(id);
      if (!existing) return res.status(404).json({ error: "Hittades ej" });
      const user = req.user;
      if (user?.role === "user" && user.companyId && String(existing.companyId) !== String(user.companyId)) {
        return res.status(403).json({ error: "Ej behörig" });
      }

      const { title, content, category = "", tags = [] } = req.body;
      const r = await knowledgeService.updateManual({
        knowledgeId: id,
        title: title || existing.title,
        content,
        sourceMeta: { category, tags }
      });

      await Knowledge.findByIdAndUpdate(id, {
        category: String(category || ""),
        tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20) : [],
        createdBy: existing.createdBy || user?._id || null
      });

      res.json({ message: "Uppdaterad", id: r.knowledge._id, chunkCount: r.chunkCount });
    } catch (e) {
      next(e);
    }
  }

  return { list, create, update, remove };
}

module.exports = { createKnowledgePublicController };
