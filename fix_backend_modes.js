const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf-8');

// Update backend to handle conversation mode (AI vs HUMAN)
const backendChatRegex = /app\.post\("\/aios\/chat", \(req, res\) => \{[\s\S]*?\}\);/m;
const newBackendChat = `app.post("/aios/chat", (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  const config = aiOsConfigStore;
  
  if (!aiOsSessions.has(sessionId)) {
    aiOsSessions.set(sessionId, { id: sessionId, mode: 'AI', messages: [] });
  }
  const session = aiOsSessions.get(sessionId);

  // 1. Store user message
  const userMsg = {
    id: Date.now().toString(),
    conversationId: sessionId,
    role: "user",
    source: "chat",
    content: message,
    createdAt: new Date()
  };
  session.messages.push(userMsg);

  // Broadcast user message instantly
  if (io) {
    io.emit("aios_message", { message: userMsg });
  }

  // STOP HERE IF IN HUMAN MODE (Agent has taken over)
  if (session.mode === 'HUMAN') {
    return res.json({
      response: "",
      debug: { intent: "N/A", ruleTriggered: "Human Mode", flowTriggered: "None", persona: "N/A" }
    });
  }

  // 2. Intent Detection
  let intent = "unknown";
  const text = (message || "").toLowerCase();
  if (text.includes("refund") || text.includes("broken") || text.includes("return")) {
    intent = "refund_request";
  } else if (text.includes("price") || text.includes("cost") || text.includes("buy")) {
    intent = "pricing";
  } else if (text.includes("support") || text.includes("help") || text.includes("issue")) {
    intent = "support";
  }

  // 3. Rule Engine
  let ruleTriggered = null;
  let finalResponse = "";
  const activeRule = config.rules.find(r => r.active && r.intent === intent);
  if (activeRule) {
    ruleTriggered = activeRule.name;
    if (activeRule.action.includes("Escalate")) {
      finalResponse = \`I have escalated this to the \${activeRule.action.replace('Escalate to ', '')}.\`;
      session.mode = 'HUMAN'; // Auto-escalate switches to human mode
    }
  }

  // 4. Flow Engine
  let flowTriggered = null;
  if (!finalResponse) {
    const activeFlow = config.flows.find(f => f.trigger === intent);
    if (activeFlow) {
      flowTriggered = activeFlow.name;
      finalResponse = activeFlow.trueAction;
    }
  }

  // 5. Fallback AI
  if (!finalResponse) {
    if (intent === "unknown") {
      finalResponse = "I'm not sure I understand. Could you clarify?";
    } else {
      finalResponse = "I understand you need help with " + intent + ". Let me check.";
    }
  }

  // 6. Behavior System
  if (config.behavior.persona === "professional") {
    finalResponse = "Professional Assistant: " + finalResponse;
  } else if (config.behavior.persona === "friendly") {
    finalResponse = "😊 " + finalResponse + " Have a great day!";
  } else if (config.behavior.persona === "sales") {
    finalResponse = finalResponse + " Would you like to upgrade your plan?";
  }

  // 7. Store AI message
  const aiMsg = {
    id: (Date.now() + 1).toString(),
    conversationId: sessionId,
    role: "ai",
    source: "chat",
    content: finalResponse,
    createdAt: new Date()
  };
  session.messages.push(aiMsg);

  // 8. Log for analytics
  config.logs.unshift({
    id: Date.now(),
    sessionId,
    input: message,
    intent,
    rule: ruleTriggered,
    flow: flowTriggered,
    response: finalResponse,
    timestamp: new Date()
  });
  if (config.logs.length > 100) config.logs.pop();

  // Broadcast AI message
  if (io) {
    setTimeout(() => io.emit("aios_message", { message: aiMsg }), 100);
  }

  res.json({
    response: finalResponse,
    debug: { intent, ruleTriggered, flowTriggered, persona: config.behavior.persona }
  });
});`;

const agentReplyRegex = /app\.post\("\/aios\/agent\/reply", \(req, res\) => \{[\s\S]*?\}\);/m;
const newAgentReply = `app.post("/aios/agent/reply", (req, res) => {
  const { content, sessionId = 'default' } = req.body;
  
  if (!aiOsSessions.has(sessionId)) {
    aiOsSessions.set(sessionId, { id: sessionId, mode: 'HUMAN', messages: [] });
  }
  const session = aiOsSessions.get(sessionId);

  // Force human mode if an agent replies
  session.mode = 'HUMAN';

  // 1. Store agent message
  const agentMsg = {
    id: Date.now().toString(),
    conversationId: sessionId,
    role: "agent",
    source: "inbox",
    content: content,
    createdAt: new Date()
  };
  session.messages.push(agentMsg);

  // NO AI CALLS. NO FLOWS. NO RULES.

  // 2. Broadcast via WebSocket
  if (io) {
    io.emit("aios_message", { message: agentMsg });
    // Broadcast session update to sync the mode switch
    io.emit("aios_session_update", { sessionId, mode: session.mode });
  }

  res.json({ success: true, message: agentMsg });
});

// New endpoint to toggle mode manually
app.post("/aios/agent/mode", (req, res) => {
  const { sessionId, mode } = req.body;
  if (aiOsSessions.has(sessionId)) {
    const session = aiOsSessions.get(sessionId);
    session.mode = mode;
    if (io) io.emit("aios_session_update", { sessionId, mode });
    res.json({ success: true, mode });
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});
`;

if(content.match(backendChatRegex)) {
  content = content.replace(backendChatRegex, newBackendChat);
  content = content.replace(agentReplyRegex, newAgentReply);
  fs.writeFileSync(serverPath, content, 'utf-8');
  console.log('Backend updated with conversation modes.');
}
