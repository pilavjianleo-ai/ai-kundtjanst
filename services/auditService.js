function createAuditService({ AuditLog }) {
  async function log({ companyId, actorUserId, action, targetType, targetId, meta }) {
    try {
      await new AuditLog({
        companyId: companyId || null,
        actorUserId: actorUserId || null,
        action: String(action || ""),
        targetType: String(targetType || ""),
        targetId: String(targetId || ""),
        meta: meta || {}
      }).save();
    } catch {}
  }

  return { log };
}

module.exports = { createAuditService };
