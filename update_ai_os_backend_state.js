const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let serverContent = fs.readFileSync(serverPath, 'utf-8');

// Lägg till knowledge och training i state på servern
const configInjectionRegex = /let aiOsConfigStore = \{[\s\S]*?logs: \[\]\n\};/m;
const newConfigStore = `let aiOsConfigStore = {
  chatExperience: { greeting: "Hi! I'm the AI assistant. How can I help you today?", botName: "AI Support", color: "#4F46E5", quickReplies: ["Pricing", "Support"], position: "right", requireEmail: false, placeholder: "Type a message..." },
  behavior: { persona: "professional", tone: 80, empathy: 50, risk: 20 },
  rules: [
    { id: 1, name: "High-Value Lead Escalation", intent: "pricing", sentiment: "positive", action: "Escalate to Sales Team", active: true }
  ],
  flows: [
    { id: 1, name: "Refund Flow", trigger: "refund_request", logic: "order.days_ago < 30", trueAction: "Process Refund", falseAction: "Deny Refund" }
  ],
  knowledge: [
    { id: 1, name: "Return_Policy_2025.pdf", type: "PDF", priority: "High", status: "Synced", tags: ["refunds", "policy"], usage: 1240, confidence: 98 },
    { id: 2, name: "Pricing FAQs", type: "Text", priority: "Normal", status: "Synced", tags: ["sales", "pricing"], usage: 450, confidence: 92 },
    { id: 3, name: "https://example.com/help", type: "URL", priority: "Low", status: "Syncing...", tags: ["general"], usage: 12, confidence: 60 }
  ],
  training: [
    { id: 1, intent: "refund_request", examples: ["I need a refund", "Give me my money back", "Return order 1234"], accuracy: 98 },
    { id: 2, intent: "pricing_inquiry", examples: ["How much does it cost", "What is the price"], accuracy: 92 }
  ],
  experiments: [
    { id: 1, name: "Greeting Optimization", desc: "Testing conversion impact of opening line", status: "Running", varA: { name: "Friendly", conv: 45.2 }, varB: { name: "Professional", conv: 52.1 } }
  ],
  logs: []
};`;

if (serverContent.match(configInjectionRegex)) {
  serverContent = serverContent.replace(configInjectionRegex, newConfigStore);
  fs.writeFileSync(serverPath, serverContent, 'utf-8');
  console.log('AI OS backend state extended with Knowledge, Training & Experiments');
}
