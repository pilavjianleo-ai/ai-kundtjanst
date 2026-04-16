const express = require("express");
const { createKnowledgeService } = require("../services/knowledge/knowledgeService");
const { createKnowledgeController } = require("../controllers/knowledgeController");

function createKnowledgeRoutes({ upload, Knowledge, KnowledgeChunk, Readability, JSDOM, pdfParse }) {
  const router = express.Router();
  const knowledgeService = createKnowledgeService({ Knowledge, KnowledgeChunk, Readability, JSDOM, pdfParse });
  const controller = createKnowledgeController({ knowledgeService });

  router.get("/", controller.list);
  router.get("/search", controller.search);
  router.get("/:id/chunks", controller.chunks);
  router.delete("/:id", controller.remove);

  router.post("/text", express.json({ limit: "5mb" }), controller.ingestText);
  router.post("/url", express.json({ limit: "1mb" }), controller.ingestUrl);
  router.post("/pdf", upload.single("pdf"), controller.ingestPdf);

  return router;
}

module.exports = { createKnowledgeRoutes };
