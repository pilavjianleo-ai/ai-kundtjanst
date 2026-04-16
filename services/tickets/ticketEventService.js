function ensureEvents(ticket) {
  if (!ticket) return;
  if (!Array.isArray(ticket.events)) ticket.events = [];
}

function addTicketEvent(ticket, type, data = {}, timestamp = new Date()) {
  if (!ticket) return;
  ensureEvents(ticket);
  ticket.events.push({
    type: String(type || "").trim() || "event",
    timestamp: timestamp instanceof Date ? timestamp : new Date(),
    data: data && typeof data === "object" ? data : { value: data }
  });
}

function setFirstResponseTimeIfMissing(ticket, responseTimestamp = new Date()) {
  if (!ticket) return;
  if (ticket.firstResponseTime !== null && ticket.firstResponseTime !== undefined) return;
  const created = ticket.createdAt ? new Date(ticket.createdAt).getTime() : 0;
  const ts = responseTimestamp ? new Date(responseTimestamp).getTime() : Date.now();
  if (!created || !ts || ts < created) return;
  ticket.firstResponseTime = ts - created;
}

function setResolvedAt(ticket, resolvedTimestamp = new Date()) {
  if (!ticket) return;
  ticket.resolvedAt = resolvedTimestamp instanceof Date ? resolvedTimestamp : new Date();
}

module.exports = { addTicketEvent, setFirstResponseTimeIfMissing, setResolvedAt };
