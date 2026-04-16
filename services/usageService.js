function approxTokens(str) {
  return Math.max(1, Math.ceil(String(str || "").length / 4));
}

function createUsageService({ UsageEvent }) {
  async function recordAiEvent({ companyId, userId, ticketId, type, model, inputText, outputText, latencyMs, ok }) {
    try {
      const tokensApprox = approxTokens(inputText) + approxTokens(outputText);
      await new UsageEvent({
        companyId: companyId || null,
        userId: userId || null,
        ticketId: ticketId || null,
        type,
        model: String(model || ""),
        tokensApprox,
        latencyMs: Number(latencyMs || 0),
        ok: ok !== false
      }).save();
    } catch {}
  }

  return { recordAiEvent };
}

module.exports = { createUsageService };
