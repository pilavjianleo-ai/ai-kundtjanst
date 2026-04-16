function createDashboardController({ User, Ticket, UsageEvent }) {
  async function overview(req, res, next) {
    try {
      const user = req.user;
      const companyId = user?.role === "user" && user.companyId ? user.companyId : (req.query.companyId || user?.companyId || "");
      const days = Number(req.query.days || 30);
      const since = new Date();
      since.setDate(since.getDate() - (days || 30));

      const companyFilter = companyId ? { companyId: String(companyId).trim() } : {};

      const [users, tickets, aiEventsAgg] = await Promise.all([
        companyId ? User.countDocuments({ companyId: String(companyId).trim() }) : User.countDocuments(),
        companyId ? Ticket.countDocuments({ companyId: String(companyId).trim() }) : Ticket.countDocuments(),
        UsageEvent.aggregate([
          { $match: { ...companyFilter, createdAt: { $gte: since } } },
          { $group: { _id: "$type", count: { $sum: 1 }, tokens: { $sum: "$tokensApprox" } } }
        ])
      ]);

      const ai = {};
      for (const row of aiEventsAgg || []) {
        ai[row._id] = { count: row.count || 0, tokensApprox: row.tokens || 0 };
      }

      res.json({
        scope: { companyId: companyId || null, days: days || 30 },
        users,
        tickets,
        ai
      });
    } catch (e) {
      next(e);
    }
  }

  async function events(req, res, next) {
    try {
      const user = req.user;
      const companyId = user?.role === "user" && user.companyId ? user.companyId : (req.query.companyId || user?.companyId || "");
      const days = Number(req.query.days || 30);
      const limit = Math.min(100, Number(req.query.limit || 20));
      const since = new Date();
      since.setDate(since.getDate() - (days || 30));

      const companyFilter = companyId ? { companyId: String(companyId).trim() } : {};
      const items = await UsageEvent.find({ ...companyFilter, createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(limit);

      res.json(items || []);
    } catch (e) {
      next(e);
    }
  }

  return { overview, events };
}

module.exports = { createDashboardController };
