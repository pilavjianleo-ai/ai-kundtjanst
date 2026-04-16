function enforceUserCompanyScope(readCompanyId) {
  const reader = typeof readCompanyId === "function"
    ? readCompanyId
    : (req) => req.body?.companyId ?? req.query?.companyId;

  return (req, res, next) => {
    const user = req.user;
    if (!user || user.role !== "user") return next();

    const claimed = reader(req);
    const userCompanyId = user.companyId;
    if (!userCompanyId) return next();

    if (claimed && String(claimed).trim() !== String(userCompanyId).trim()) {
      return res.status(403).json({ error: "Fel companyId" });
    }

    next();
  };
}

module.exports = { enforceUserCompanyScope };
