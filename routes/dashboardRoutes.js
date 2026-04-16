const express = require("express");
const { validate, Joi } = require("../middleware/validate");
const { createDashboardController } = require("../controllers/dashboardController");

function createDashboardRoutes({ User, Ticket, UsageEvent }) {
  const router = express.Router();
  const controller = createDashboardController({ User, Ticket, UsageEvent });

  router.get(
    "/overview",
    validate({
      query: Joi.object({
        companyId: Joi.string().allow("").optional(),
        days: Joi.number().min(1).max(365).optional()
      })
    }),
    controller.overview
  );

  router.get(
    "/events",
    validate({
      query: Joi.object({
        companyId: Joi.string().allow("").optional(),
        days: Joi.number().min(1).max(365).optional(),
        limit: Joi.number().min(1).max(100).optional()
      })
    }),
    controller.events
  );

  return router;
}

module.exports = { createDashboardRoutes };
