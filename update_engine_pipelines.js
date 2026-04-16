const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update AiOsEngine to handle separated messaging and WebSockets
const engineRegex = /window\.AiOsEngine = \{[\s\S]*?async simulateChat\(message\) \{[\s\S]*?\}\n  \},/m;
const newEngine = `window.AiOsEngine = {
  state: {
    chatExperience: { greeting: "Hi! I'm the AI assistant.", botName: "AI Support", color: "#4F46E5", quickReplies: ["Pricing", "Support"], position: "right", requireEmail: false, placeholder: "Type a message..." },
    behavior: { persona: "professional", tone: 80, empathy: 50, risk: 20 },
    rules: [],
    knowledge: [],
    training: [],
    experiments: [],
    logs: [],
    conversations: [] // Added for the real-time inbox
  },
  listeners: [],
  socket: null,
  
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },

  notify() {
    this.listeners.forEach(fn => fn());
    if (aiOsInitialized) renderAiOsModule();
    if (window.aiosActiveWidget) {
      window.aiosActiveWidget.updateConfig(this.state.chatExperience);
    }
    if (window.aiosLiveWidget) {
      window.aiosLiveWidget.updateConfig(this.state.chatExperience);
    }
    if (window.aiosMainAppWidget) {
      window.aiosMainAppWidget.updateConfig(this.state.chatExperience);
    }
  },

  initSocket() {
    if (this.socket) return;
    if (typeof io !== 'undefined') {
      this.socket = io();
      this.socket.on("aios_config_update", (newConfig) => {
        this.state = { ...this.state, ...newConfig };
        this.notify();
      });
      this.socket.on("aios_message", (data) => {
        // Real-time message received
        this.handleIncomingMessage(data.message);
      });
    }
  },

  handleIncomingMessage(msg) {
    // Prevent duplicates
    let conv = this.state.conversations.find(c => c.id === msg.conversationId);
    if (!conv) {
      conv = { id: msg.conversationId, messages: [] };
      this.state.conversations.push(conv);
    }
    
    if (!conv.messages.find(m => m.id === msg.id)) {
      conv.messages.push(msg);
      
      // Update UI widgets if they match the conversation
      // We assume Live Studio and Main App use 'default' sessionId for now
      if (msg.conversationId === 'default') {
        const uiMsg = { role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content, id: msg.id };
        
        [window.aiosLiveWidget, window.aiosMainAppWidget, window.aiosActiveWidget].forEach(widget => {
          if (widget && !widget.messages.find(m => m.id === msg.id)) {
             // Don't duplicate if widget already optimistic added it
             if (widget._lastOptimisticText === msg.content) {
               widget._lastOptimisticText = null;
               // tag it with id
               const lastMsg = widget.messages[widget.messages.length - 1];
               if(lastMsg) lastMsg.id = msg.id;
             } else {
               widget.messages.push(uiMsg);
               widget.render();
             }
          }
        });
      }
      
      this.notify(); // Re-render inbox
    }
  },

  async loadConfig() {
    try {
      this.initSocket();
      const res = await fetch('/aios/config');
      if (res.ok) {
        const data = await res.json();
        this.state = { ...this.state, ...data };
      }
      const convRes = await fetch('/aios/conversations');
      if (convRes.ok) {
         this.state.conversations = await convRes.json();
      }
      this.notify();
    } catch (e) {
      console.error("Failed to load AI OS config", e);
    }
  },

  async updateConfig(partial) {
    this.state = { ...this.state, ...partial };
    this.notify();
    try {
      await fetch('/aios/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial)
      });
    } catch (e) {
      console.error("Failed to save config", e);
    }
  },

  // PIPELINE 1: USER CHAT
  async simulateChat(message) {
    try {
      // Optimistic update handled by widget, just mark it
      if (window.aiosLiveWidget) window.aiosLiveWidget._lastOptimisticText = message;
      if (window.aiosMainAppWidget) window.aiosMainAppWidget._lastOptimisticText = message;

      const res = await fetch('/aios/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId: 'default' })
      });
      return await res.json();
    } catch (e) {
      return { response: "Network error.", debug: {} };
    }
  },

  // PIPELINE 2: AGENT REPLY
  async agentReply(content, sessionId) {
    try {
      await fetch('/aios/agent/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sessionId })
      });
    } catch (e) {
      console.error("Agent reply failed", e);
    }
  },`;

if(content.match(engineRegex)) {
  content = content.replace(engineRegex, newEngine);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('AiOsEngine updated with separated pipelines and WS sync.');
} else {
  console.log('Regex did not match in ai_os.js for engine update');
}
