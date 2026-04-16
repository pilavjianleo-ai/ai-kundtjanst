const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Inject the AiOsEngine
const engineCode = `
// ---------------------------------------------------------
// CENTRAL AI OS ENGINE (FRONTEND)
// ---------------------------------------------------------
window.AiOsEngine = {
  state: {
    chatExperience: { greeting: "Hi! I'm the AI assistant.", botName: "AI Support", color: "#4F46E5", quickReplies: [] },
    behavior: { persona: "professional", tone: 80, empathy: 50, risk: 20 },
    rules: [],
    flows: [],
    logs: []
  },
  listeners: [],
  subscribe(fn) {
    this.listeners.push(fn);
  },
  notify() {
    this.listeners.forEach(fn => fn());
    if (aiOsInitialized) renderAiOsModule();
  },
  async loadConfig() {
    try {
      const res = await fetch('/aios/config');
      if (res.ok) {
        this.state = await res.json();
        this.notify();
      }
    } catch (e) {
      console.error('Error loading AI OS config:', e);
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
      console.error('Error updating config:', e);
    }
  },
  async simulateChat(message) {
    try {
      const res = await fetch('/aios/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId: "preview-123" })
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {
      console.error('Error simulating chat:', e);
    }
    return { response: "Error reaching AI Engine.", debug: {} };
  }
};

// Initialize WebSocket connection if available
if (typeof io !== 'undefined') {
  const socket = io();
  socket.on('aios_config_update', (newConfig) => {
    window.AiOsEngine.state = newConfig;
    window.AiOsEngine.notify();
    osToast('AI Engine', 'Configuration synced remotely');
  });
}

// Ensure initAiOs loads config first
const originalInitAiOs = initAiOs;
window.initAiOs = async function() {
  if (!aiOsInitialized) {
    await window.AiOsEngine.loadConfig();
  }
  originalInitAiOs();
};
`;

// Insert after the first few variable declarations
if (!content.includes('window.AiOsEngine')) {
  content = content.replace('let aiOsInitialized = false;', 'let aiOsInitialized = false;\n\n' + engineCode);
}

// Modify the render functions to use AiOsEngine.state

// 1. Live Studio
const liveStudioRegex = /function renderOsLiveStudio[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newLiveStudio = `function renderOsLiveStudio(main, right) {
  const s = window.AiOsEngine.state;
  
  main.innerHTML = \`
    <div style="display:flex; height:100%; width:100%;">
      <div style="width:280px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border);">
          <div class="title" style="font-size:14px;">Scenarios</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          <div class="listItem active" style="padding:12px;" onclick="document.getElementById('aiosTestInput').value='I need a refund for my broken item';"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Refund Request</div>
          <div class="listItem" style="padding:12px;" onclick="document.getElementById('aiosTestInput').value='How much does it cost?';"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Pricing Inquiry</div>
          <div class="listItem" style="padding:12px;" onclick="document.getElementById('aiosTestInput').value='I need support with my account';"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Support Issue</div>
        </div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column; background:var(--bg);">
        <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
          <div class="title" style="font-size:16px;">Live Chat Simulation</div>
          <div style="display:flex; gap:8px;">
            <button class="btn ghost small icon" onclick="renderAiOsModule()"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div id="aiosChatHistory" style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:80%; font-size:15px;">\${s.chatExperience.greeting}</div>
        </div>
        <div style="padding:16px 24px; border-top:1px solid var(--border); display:flex; gap:12px; background:var(--panel);">
          <input type="text" id="aiosTestInput" class="input full" placeholder="Test your AI..." style="font-size:15px;" onkeypress="if(event.key==='Enter') document.getElementById('aiosSendBtn').click()">
          <button id="aiosSendBtn" class="btn primary icon"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>
  \`;

  setTimeout(() => {
    document.getElementById('aiosSendBtn').addEventListener('click', async () => {
      const input = document.getElementById('aiosTestInput');
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      
      const history = document.getElementById('aiosChatHistory');
      history.innerHTML += \`<div style="align-self:flex-end; background:var(--primary); color:#fff; padding:12px 16px; border-radius:12px; max-width:80%;">\${val}</div>\`;
      history.scrollTop = history.scrollHeight;
      
      const res = await window.AiOsEngine.simulateChat(val);
      
      history.innerHTML += \`<div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:80%;">\${res.response}</div>\`;
      history.scrollTop = history.scrollHeight;
      
      // Update Debug Panel
      document.getElementById('debugIntent').innerText = res.debug.intent || 'N/A';
      document.getElementById('debugRule').innerText = res.debug.ruleTriggered || 'None';
      document.getElementById('debugFlow').innerText = res.debug.flowTriggered || 'None';
      document.getElementById('debugPersona').innerText = res.debug.persona || 'Default';
    });
  }, 100);

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
}
`;
content = content.replace(liveStudioRegex, newLiveStudio + '\n/* REPLACE END */\n');

// 2. Behavior
const behaviorRegex = /function renderOsBehavior[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newBehavior = `function renderOsBehavior(main, right) {
  const s = window.AiOsEngine.state;
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%;">
      <div style="margin-bottom:32px;">
        <div class="title" style="font-size:28px; font-weight:900;">Behavior Presets</div>
        <p class="muted" style="margin-top:8px;">Instantly change how the AI communicates.</p>
      </div>

      <div class="grid2" style="gap:24px; margin-bottom:40px;">
        \${['professional', 'friendly', 'sales', 'expert'].map(p => \`
          <div class="panel soft cursor-pointer \${s.behavior.persona === p ? 'active' : ''}" style="\${s.behavior.persona === p ? 'border-color:var(--primary); box-shadow:0 8px 24px -8px color-mix(in srgb, var(--primary) 30%, transparent);' : ''} padding:24px;" onclick="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, persona: '\${p}' } })">
            <div class="title" style="font-size:20px; font-weight:800; margin-bottom:8px; text-transform:capitalize;">\${p}</div>
            <p class="muted small">\${p} behavior profile.</p>
          </div>
        \`).join('')}
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Advanced Controls</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:32px;">
      <div>
        <label style="font-weight:800; font-size:13px;">Tone / Formality (\${s.behavior.tone}%)</label>
        <input type="range" min="1" max="100" value="\${s.behavior.tone}" class="full" onchange="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, tone: this.value } })">
      </div>
    </div>
  \`;
}
`;
content = content.replace(behaviorRegex, newBehavior + '\n/* REPLACE END */\n');

// Write back
fs.writeFileSync(filePath, content, 'utf-8');
console.log('AI OS frontend injected successfully.');
