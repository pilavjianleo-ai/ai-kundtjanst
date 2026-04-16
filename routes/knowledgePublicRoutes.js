const express = require("express");
const { validate, Joi } = require("../middleware/validate");
const { createKnowledgeService } = require("../services/knowledge/knowledgeService");
const { createKnowledgePublicController } = require("../controllers/knowledgePublicController");

function createKnowledgePublicRoutes({ Knowledge, KnowledgeChunk }) {
  const router = express.Router();
  const knowledgeService = createKnowledgeService({ Knowledge, KnowledgeChunk });
  const controller = createKnowledgePublicController({ Knowledge, KnowledgeChunk, knowledgeService });

  router.get(
    "/",
    validate({
      query: Joi.object({
        companyId: Joi.string().allow("").optional(),
        q: Joi.string().allow("").max(120).optional(),
        category: Joi.string().allow("").max(80).optional()
      })
    }),
    controller.list
  );

  router.post(
    "/",
    validate({
      body: Joi.object({
        companyId: Joi.string().allow("").optional(),
        title: Joi.string().min(2).max(120).required(),
        content: Joi.string().min(2).max(20000).required(),
        category: Joi.string().allow("").max(80).optional(),
        tags: Joi.array().items(Joi.string().max(30)).max(20).optional()
      })
    }),
    controller.create
  );

  router.delete(
    "/:id",
    validate({ params: Joi.object({ id: Joi.string().required() }) }),
    controller.remove
  );

  router.patch(
    "/:id",
    validate({
      params: Joi.object({ id: Joi.string().required() }),
      body: Joi.object({
        title: Joi.string().min(2).max(120).required(),
        content: Joi.string().min(2).max(20000).required(),
        category: Joi.string().allow("").max(80).optional(),
        tags: Joi.array().items(Joi.string().max(30)).max(20).optional()
      })
    }),
    controller.update
  );

  return router;
}

module.exports = { createKnowledgePublicRoutes };
