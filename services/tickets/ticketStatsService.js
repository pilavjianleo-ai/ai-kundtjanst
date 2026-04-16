function computeTicketStats(ticket) {
  const createdAt = ticket?.createdAt ? new Date(ticket.createdAt).getTime() : 0;
  const resolvedAt = ticket?.resolvedAt ? new Date(ticket.resolvedAt).getTime() : 0;
  const solvedAt = ticket?.solvedAt ? new Date(ticket.solvedAt).getTime() : 0;
  const effectiveResolvedAt = resolvedAt || solvedAt || 0;

  const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
  const userCount = messages.filter((m) => m?.role === "user").length;
  const aiCount = messages.filter((m) => m?.role === "assistant").length;
  const agentCount = messages.filter((m) => m?.role === "agent").length;
  const totalMessages = messages.length;

  const firstResponseTimeMs = ticket?.firstResponseTime ?? null;
  const totalResolutionTimeMs = createdAt && effectiveResolvedAt && effectiveResolvedAt >= createdAt
    ? effectiveResolvedAt - createdAt
    : null;

  const aiVsUserRatio = userCount > 0 ? (aiCount / userCount) : null;
  const agentVsUserRatio = userCount > 0 ? (agentCount / userCount) : null;

  return {
    totalMessages,
    userCount,
    aiCount,
    agentCount,
    aiVsUserRatio,
    agentVsUserRatio,
    firstResponseTimeMs,
    totalResolutionTimeMs
  };
}

module.exports = { computeTicketStats };
