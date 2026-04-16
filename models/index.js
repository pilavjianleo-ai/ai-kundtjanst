function initModels(mongoose, { genPublicId }) {
  const getModel = (name, schema) => (mongoose.models && mongoose.models[name]) || mongoose.model(name, schema);
  const userSchema = new mongoose.Schema({
    publicUserId: { type: String, unique: true, index: true, default: () => genPublicId("U") },
    username: { type: String, unique: true, required: true, index: true },
    email: { type: String, default: "", index: true },
    password: { type: String, required: true },
    role: { type: String, default: "user" },
    companyId: { type: String, default: null, index: true },
    createdAt: { type: Date, default: Date.now }
  });
  const User = getModel("User", userSchema);

  const companySchema = new mongoose.Schema({
    companyId: { type: String, unique: true, required: true },
    displayName: { type: String, required: true },
    orgNr: { type: String, default: "" },
    contactName: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    phone: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["trial", "active", "pending", "inactive", "past_due", "canceled"], default: "active" },
    plan: { type: String, enum: ["trial", "bas", "pro", "enterprise"], default: "bas" },
    settings: {
      greeting: { type: String, default: "Hej! 👋 Hur kan jag hjälpa dig idag?" },
      tone: { type: String, default: "professional", enum: ["professional", "friendly", "strict"] },
      widgetColor: { type: String, default: "#0066cc" }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
  const Company = getModel("Company", companySchema);

  const documentSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    sourceType: { type: String, enum: ["text", "url", "pdf", "generated"], required: true },
    sourceUrl: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  });
  const Document = getModel("Document", documentSchema);

  const knowledgeSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    rawContent: { type: String, required: true },
    category: { type: String, default: "", index: true },
    tags: { type: [String], default: [], index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    sourceType: { type: String, enum: ["text", "url", "pdf", "generated", "manual"], required: true },
    sourceUrl: { type: String, default: "" },
    sourceMeta: { type: Object, default: {} },
    chunkCount: { type: Number, default: 0 },
    embeddingStatus: { type: String, enum: ["none", "pending", "ready"], default: "none" },
    createdAt: { type: Date, default: Date.now }
  });
  const Knowledge = getModel("Knowledge", knowledgeSchema);

  const knowledgeChunkSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    knowledgeId: { type: mongoose.Schema.Types.ObjectId, ref: "Knowledge", required: true, index: true },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    tokensApprox: { type: Number, default: 0 },
    embedding: { type: [Number], default: undefined },
    createdAt: { type: Date, default: Date.now }
  });
  knowledgeChunkSchema.index({ companyId: 1, knowledgeId: 1, chunkIndex: 1 }, { unique: true });
  const KnowledgeChunk = getModel("KnowledgeChunk", knowledgeChunkSchema);

  const refreshTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    companyId: { type: String, default: null, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: "" },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" }
  });
  const RefreshToken = getModel("RefreshToken", refreshTokenSchema);

  const auditLogSchema = new mongoose.Schema({
    companyId: { type: String, default: null, index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    meta: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now, index: true }
  });
  const AuditLog = getModel("AuditLog", auditLogSchema);

  const usageEventSchema = new mongoose.Schema({
    companyId: { type: String, default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", default: null, index: true },
    type: { type: String, enum: ["ai_chat", "ai_summary", "ai_ticket_summary"], required: true, index: true },
    model: { type: String, default: "" },
    tokensApprox: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now, index: true }
  });
  const UsageEvent = getModel("UsageEvent", usageEventSchema);

  const messageSchema = new mongoose.Schema({
    role: String,
    content: String,
    timestamp: { type: Date, default: Date.now }
  });
  const ticketSchema = new mongoose.Schema({
    publicTicketId: { type: String, unique: true, index: true, default: () => genPublicId("T") },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    companyId: { type: String, required: true, index: true },
    channel: { type: String, enum: ["chat", "email", "sms", "whatsapp", "facebook"], default: "chat" },
    status: { type: String, enum: ["open", "pending", "solved"], default: "open" },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    ticketIdInput: { type: String, default: "" },
    contactInfo: {
      name: { type: String, default: "" },
      surname: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      isCompany: { type: Boolean, default: false },
      orgName: { type: String, default: "" },
      orgNr: { type: String, default: "" },
      ticketIdInput: { type: String, default: "" }
    },
    title: { type: String, default: "" },
    assignedToUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    internalNotes: [{ createdBy: mongoose.Schema.Types.ObjectId, content: String, createdAt: Date }],
    firstAgentReplyAt: { type: Date, default: null },
    solvedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    firstResponseTime: { type: Number, default: null },
    events: [{
      type: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      data: { type: Object, default: {} }
    }],
    messages: [messageSchema],
    conversationSummary: { type: String, default: "" },
    summaryUpdatedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    abVariant: {
      name: { type: String, default: "" },
      tone: { type: String, default: "" },
      greeting: { type: String, default: "" }
    },
    csatRating: { type: Number, min: 1, max: 5, default: null }
  });
  const Ticket = getModel("Ticket", ticketSchema);

  const feedbackSchema = new mongoose.Schema({
    publicFeedbackId: { type: String, unique: true, index: true, default: () => genPublicId("FB") },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "Ticket", default: null },
    companyId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    targetType: { type: String, enum: ["agent", "ai"], required: true },
    targetAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },
    category: { type: String, enum: ["support", "response_time", "helpfulness", "overall"], default: "overall" },
    createdAt: { type: Date, default: Date.now }
  });
  const Feedback = getModel("Feedback", feedbackSchema);

  const crmCustomerSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    value: { type: Number, default: 0 },
    status: { type: String, default: "Kund" },
    industry: { type: String, default: "" },
    orgNr: { type: String, default: "" },
    notes: { type: String, default: "" },
    aiConfig: {
      status: { type: String, default: "inactive" },
      model: { type: String, default: "GPT-5-mini" },
      lang: { type: String, default: "Svenska" }
    },
    address: {
      zip: { type: String, default: "" },
      city: { type: String, default: "" },
      country: { type: String, default: "Sverige" }
    },
    contactName: { type: String, default: "" },
    role: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  });
  crmCustomerSchema.index({ companyId: 1, id: 1 }, { unique: true });
  const CrmCustomer = getModel("CrmCustomer", crmCustomerSchema);

  const crmDealSchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    id: { type: String, required: true },
    name: { type: String, default: "" },
    company: { type: String, required: true },
    value: { type: Number, default: 0 },
    stage: { type: String, default: "new" },
    probability: { type: Number, default: 50 },
    closeDate: { type: String, default: "" },
    type: { type: String, default: "ny" },
    owner: { type: String, default: "me" },
    description: { type: String, default: "" },
    nextStep: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  });
  crmDealSchema.index({ companyId: 1, id: 1 }, { unique: true });
  const CrmDeal = getModel("CrmDeal", crmDealSchema);

  const crmActivitySchema = new mongoose.Schema({
    companyId: { type: String, required: true, index: true },
    id: { type: String, required: true },
    type: { type: String, default: "info" },
    subject: { type: String, required: true },
    description: { type: String, default: "" },
    date: { type: String, default: "" },
    status: { type: String, default: "done" },
    targetId: { type: String, default: "" },
    created: { type: Date, default: Date.now }
  });
  crmActivitySchema.index({ companyId: 1, id: 1 }, { unique: true });
  const CrmActivity = getModel("CrmActivity", crmActivitySchema);

  return { User, Company, Document, Knowledge, KnowledgeChunk, RefreshToken, AuditLog, UsageEvent, Ticket, Feedback, CrmCustomer, CrmDeal, CrmActivity };
}

module.exports = { initModels };
