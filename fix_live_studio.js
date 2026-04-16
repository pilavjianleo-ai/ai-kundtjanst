const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update ChatWidget to handle debug events
const chatWidgetRegex = /class ChatWidget \{[\s\S]*?render\(\) \{/m;
const updatedChatWidget = `class ChatWidget {
  constructor(container, config, simulateChatFn, onDebugFn) {
    this.container = container;
    this.config = config;
    this.simulateChatFn = simulateChatFn;
    this.onDebugFn = onDebugFn;
    this.messages = [];
    if (this.config.greeting) {
      this.messages.push({ role: 'assistant', content: this.config.greeting });
    }
    this.render();
  }

  updateConfig(newConfig) {
    const oldGreeting = this.config.greeting;
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.greeting !== oldGreeting && this.messages.length > 0 && this.messages[0].role === 'assistant') {
      this.messages[0].content = this.config.greeting;
    }
    this.render();
  }

  async sendMessage(text) {
    if (!text.trim()) return;
    this.messages.push({ role: 'user', content: text });
    this.render();
    
    this.isTyping = true;
    this.render();

    try {
      const res = await this.simulateChatFn(text);
      this.isTyping = false;
      this.messages.push({ role: 'assistant', content: res.response });
      if (this.onDebugFn && res.debug) {
        this.onDebugFn(res.debug);
      }
    } catch (e) {
      this.isTyping = false;
      this.messages.push({ role: 'assistant', content: 'An error occurred.' });
    }
    this.render();
  }

  render() {`;

content = content.replace(chatWidgetRegex, updatedChatWidget);

// Update renderOsLiveStudio
const liveStudioRegex = /function renderOsLiveStudio[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newLiveStudio = `function renderOsLiveStudio(main, right) {
  const s = window.AiOsEngine.state;
  const cx = s.chatExperience;
  
  main.innerHTML = \`
    <div style="display:flex; height:100%; width:100%;">
      <div style="width:280px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border);">
          <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">Scenarios</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          <div class="listItem active" style="padding:12px;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('I need a refund for my broken item');"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Refund Request</div>
          <div class="listItem" style="padding:12px;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('How much does it cost?');"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Pricing Inquiry</div>
          <div class="listItem" style="padding:12px;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('I need support with my account');"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Support Issue</div>
        </div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column; background:var(--bg); align-items:center; justify-content:center; padding:40px;">
        
        <div id="aios-live-chat-container" style="width:400px; height:600px; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,0.1); border-radius:16px;"></div>

      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">AI Reasoning</div>
    </div>
    <div style="padding:20px; display:flex; flex-direction:column; gap:24px;">
      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; margin-bottom:8px;">Intent Detected</div>
        <div class="pill" id="debugIntent" style="font-weight:700; background:var(--bg); border:1px solid var(--border);">Waiting...</div>
      </div>
      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; margin-bottom:8px;">Rule Triggered</div>
        <div class="pill warn" id="debugRule" style="font-weight:700;">Waiting...</div>
      </div>
      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; margin-bottom:8px;">Flow Path</div>
        <div class="pill ok" id="debugFlow" style="font-weight:700;">Waiting...</div>
      </div>
      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; margin-bottom:8px;">Persona Applied</div>
        <div class="pill info" id="debugPersona" style="font-weight:700;">\${s.behavior.persona}</div>
      </div>
    </div>
  \`;

  setTimeout(() => {
    const container = document.getElementById('aios-live-chat-container');
    if (container) {
      window.aiosLiveWidget = new ChatWidget(container, cx, window.AiOsEngine.simulateChat.bind(window.AiOsEngine), (debug) => {
        document.getElementById('debugIntent').innerText = debug.intent || 'N/A';
        document.getElementById('debugRule').innerText = debug.ruleTriggered || 'None';
        document.getElementById('debugFlow').innerText = debug.flowTriggered || 'None';
        document.getElementById('debugPersona').innerText = debug.persona || 'Default';
      });
    }
  }, 50);
}
`;

content = content.replace(liveStudioRegex, newLiveStudio + '\n/* REPLACE END */\n');

// Also ensure notify() updates aiosLiveWidget
const notifyRegex2 = /notify\(\) \{[\s\S]*?\}/m;
const newNotify2 = `notify() {
    this.listeners.forEach(fn => fn());
    if (aiOsInitialized) renderAiOsModule();
    if (window.aiosActiveWidget) {
      window.aiosActiveWidget.updateConfig(this.state.chatExperience);
    }
    if (window.aiosLiveWidget) {
      window.aiosLiveWidget.updateConfig(this.state.chatExperience);
    }
  }`;
content = content.replace(notifyRegex2, newNotify2);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Live Studio updated to use ChatWidget');
