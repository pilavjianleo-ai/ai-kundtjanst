const express = require("express");

function createAdminAnalyticsRoutes({ User, Ticket, UsageEvent }) {
  const router = express.Router();

  router.get("/overview", async (req, res, next) => {
    try {
      const { companyId, days = 30 } = req.query || {};
      const since = new Date();
      since.setDate(since.getDate() - Number(days || 30));

      const companyFilter = companyId ? { companyId: String(companyId).trim() } : {};

      const [totalUsers, totalTickets, usageCount, usageTokensAgg] = await Promise.all([
        companyId ? User.countDocuments({ companyId: String(companyId).trim() }) : User.countDocuments(),
        companyId ? Ticket.countDocuments({ companyId: String(companyId).trim() }) : Ticket.countDocuments(),
        UsageEvent.countDocuments({ ...companyFilter, createdAt: { $gte: since } }),
        UsageEvent.aggregate([
          { $match: { ...companyFilter, createdAt: { $gte: since } } },
          { $group: { _id: null, tokens: { $sum: "$tokensApprox" }, latencyMs: { $avg: "$latencyMs" } } }
        ])
      ]);

      const tokens = usageTokensAgg?.[0]?.tokens || 0;
      const avgLatencyMs = usageTokensAgg?.[0]?.latencyMs || 0;

      res.json({
        scope: { companyId: companyId ? String(companyId).trim() : null, days: Number(days || 30) },
        users: { total: totalUsers },
        tickets: { total: totalTickets },
        ai: { events: usageCount, tokensApprox: tokens, avgLatencyMs: Math.round(avgLatencyMs) }
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

module.exports = { createAdminAnalyticsRoutes };
