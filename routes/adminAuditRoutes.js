const express = require("express");

function createAdminAuditRoutes({ AuditLog }) {
  const router = express.Router();

  router.get("/", async (req, res, next) => {
    try {
      const { companyId, days = 30, limit = 200, action, actorUserId } = req.query || {};
      const since = new Date();
      since.setDate(since.getDate() - Number(days || 30));

      const q = { createdAt: { $gte: since } };
      if (companyId) q.companyId = String(companyId).trim();
      if (action) q.action = String(action).trim();
      if (actorUserId) q.actorUserId = actorUserId;

      const items = await AuditLog.find(q)
        .sort({ createdAt: -1 })
        .limit(Math.min(500, Number(limit || 200)))
        .populate("actorUserId", "username email role");

      res.json(items || []);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createAdminAuditRoutes };
