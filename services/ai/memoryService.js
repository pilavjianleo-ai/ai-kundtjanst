const { cleanText } = require("../../utils/text");

function createMemoryService({ summarizeTicketText }) {
  async function getConversationSummary({ ticket }) {
    try {
      if (!ticket) return "";
      const msgs = Array.isArray(ticket.messages) ? ticket.messages : [];
      const lastUpdated = ticket.summaryUpdatedAt ? new Date(ticket.summaryUpdatedAt).getTime() : 0;
      const lastMsgTs = msgs.length ? new Date(msgs[msgs.length - 1].timestamp || Date.now()).getTime() : Date.now();
      const hasRecentSummary = ticket.conversationSummary && lastUpdated && lastUpdated >= lastMsgTs;
      if (hasRecentSummary) return String(ticket.conversationSummary || "");

      const text = msgs
        .slice(-20)
        .map((m) => `${m.role}: ${cleanText(m.content || "")}`)
        .join("\n")
        .slice(0, 4000);

      const summary = await summarizeTicketText({
        publicTicketId: ticket.publicTicketId || "",
        text
      });

      ticket.conversationSummary = String(summary || "");
      ticket.summaryUpdatedAt = new Date();
      await ticket.save().catch(() => {});

      return String(summary || "");
    } catch {
      return "";
    }
  }

  return { getConversationSummary };
}

module.exports = { createMemoryService };
