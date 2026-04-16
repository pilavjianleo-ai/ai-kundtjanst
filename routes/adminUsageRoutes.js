const express = require("express");

function createAdminUsageRoutes({ UsageEvent }) {
  const router = express.Router();

  router.get("/events", async (req, res, next) => {
    try {
      const { companyId, days = 30, limit = 100, type } = req.query || {};
      const since = new Date();
      since.setDate(since.getDate() - Number(days || 30));

      const q = { createdAt: { $gte: since } };
      if (companyId) q.companyId = String(companyId).trim();
      if (type) q.type = String(type).trim();

      const items = await UsageEvent.find(q)
        .sort({ createdAt: -1 })
        .limit(Math.min(300, Number(limit || 100)));

      res.json(items || []);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createAdminUsageRoutes };
