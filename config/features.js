function bool(value, def = false) {
  if (value === undefined || value === null || value === "") return def;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return def;
}

const features = {
  enableAuditUi: bool(process.env.FEATURE_AUDIT_UI, true),
  enableEnterpriseAnalyticsUi: bool(process.env.FEATURE_ANALYTICS_UI, true),
  enableKnowledgePublic: bool(process.env.FEATURE_KNOWLEDGE_PUBLIC, true),
  enableAiToolsUi: bool(process.env.FEATURE_AI_TOOLS_UI, true)
};

module.exports = { features };
