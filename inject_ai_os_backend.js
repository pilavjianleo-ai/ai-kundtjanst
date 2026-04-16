const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf-8');

const injectionCode = `
/* =====================
   AI OS - REAL BACKEND ENGINE
===================== */

// In-memory config store for prototype (would be DB in production)
let aiOsConfigStore = {
  chatExperience: { greeting: "Hi! I'm the AI assistant. How can I help you today?", botName: "AI Support", color: "#4F46E5", quickReplies: ["Pricing", "Support"] },
  behavior: { persona: "professional", tone: 80, empathy: 50, risk: 20 },
  rules: [
    { id: 1, name: "High-Value Lead Escalation", intent: "pricing", sentiment: "positive", action: "Escalate to Sales Team", active: true }
  ],
  flows: [
    { id: 1, name: "Refund Flow", trigger: "refund_request", logic: "order.days_ago < 30", trueAction: "Process Refund", falseAction: "Deny Refund" }
  ],
  logs: []
};

// GET /aios/config
app.get("/aios/config", (req, res) => {
  res.json(aiOsConfigStore);
});

// PATCH /aios/config
app.patch("/aios/config", (req, res) => {
  aiOsConfigStore = { ...aiOsConfigStore, ...req.body };
  
  // Broadcast change instantly
  if (io) {
    io.emit("aios_config_update", aiOsConfigStore);
  }
  
  res.json(aiOsConfigStore);
});

// POST /aios/chat - Real AI Pipeline
app.post("/aios/chat", (req, res) => {
  const { message, sessionId } = req.body;
  const config = aiOsConfigStore;
  
  let intent = "unknown";
  let ruleTriggered = null;
  let flowTriggered = null;
  let finalResponse = "";
  
  const text = (message || "").toLowerCase();

  // 1. Intent Detection
  if (text.includes("refund") || text.includes("broken") || text.includes("return")) {
    intent = "refund_request";
  } else if (text.includes("price") || text.includes("cost") || text.includes("buy")) {
    intent = "pricing";
    if (text.includes("love") || text.includes("want") || text.includes("need")) {
      // Simulate positive sentiment
    }
  } else if (text.includes("support") || text.includes("help") || text.includes("issue")) {
    intent = "support";
  }

  // 2. Rule Engine
  const activeRule = config.rules.find(r => r.active && r.intent === intent);
  if (activeRule) {
    ruleTriggered = activeRule.name;
    if (activeRule.action.includes("Escalate")) {
      finalResponse = \`I have escalated this to the \${activeRule.action.replace('Escalate to ', '')}.\`;
    }
  }

  // 3. Flow Engine (if no rule override)
  if (!finalResponse) {
    const activeFlow = config.flows.find(f => f.trigger === intent);
    if (activeFlow) {
      flowTriggered = activeFlow.name;
      // Simulate flow execution
      finalResponse = "Flow executed: " + activeFlow.name + " -> " + activeFlow.trueAction;
    }
  }

  // 4. Fallback / AI Engine Generation
  if (!finalResponse) {
    if (intent === "unknown") {
      finalResponse = "I'm not sure I understand. Could you clarify?";
    } else {
      finalResponse = "I understand you need help with " + intent + ". Let me check.";
    }
  }

  // 5. Behavior System Modification
  if (config.behavior.persona === "professional") {
    finalResponse = "Professional Assistant: " + finalResponse;
  } else if (config.behavior.persona === "friendly") {
    finalResponse = "😊 " + finalResponse + " Have a great day!";
  } else if (config.behavior.persona === "sales") {
    finalResponse = finalResponse + " Would you like to upgrade your plan?";
  }

  // 6. Logging
  const logEntry = {
    id: Date.now(),
    input: message,
    intent,
    rule: ruleTriggered,
    flow: flowTriggered,
    response: finalResponse,
    timestamp: new Date()
  };
  config.logs.unshift(logEntry);
  if (config.logs.length > 50) config.logs.pop();

  res.json({
    response: finalResponse,
    debug: { intent, ruleTriggered, flowTriggered, persona: config.behavior.persona }
  });
});
`;

if (!serverContent.includes('/aios/config')) {
  serverContent = serverContent.replace('app.use(errorHandler);', injectionCode + '\napp.use(errorHandler);');
  fs.writeFileSync(serverPath, serverContent, 'utf-8');
  console.log('AI OS backend endpoints injected successfully into server.js');
} else {
  console.log('Endpoints already exist.');
}
