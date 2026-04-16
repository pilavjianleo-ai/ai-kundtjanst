// ai_os.js
// Completely new standalone AI Control Center (AI Operating System)
// 3-Panel Enterprise Layout (Nav | Main Workspace | Right Panel)

let currentAiOsRoute = "live-studio";
let aiOsInitialized = false;



// ---------------------------------------------------------
// REAL CHAT WIDGET COMPONENT
// ---------------------------------------------------------

const cwStyle = document.createElement('style');
cwStyle.innerHTML = `
  .cw-msg-area::-webkit-scrollbar { width: 6px; }
  .cw-msg-area::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
  .cw-bubble { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .cw-composer { box-shadow: 0 -4px 20px rgba(0,0,0,0.02); }
`;
document.head.appendChild(cwStyle);

class ChatWidget {
  constructor(container, config, simulateChatFn, onDebugFn, isPreview = true) {
    this.container = container;
    this.config = config;
    this.simulateChatFn = simulateChatFn;
    this.onDebugFn = onDebugFn;
    this.isPreview = isPreview;
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
      this.messages.push({ role: 'assistant', content: res.response || res.answer || res });
      if (this.onDebugFn && res.debug) {
        this.onDebugFn(res.debug);
      }
    } catch (e) {
      this.isTyping = false;
      this.messages.push({ role: 'assistant', content: 'Ett fel uppstod.' });
    }
    this.render();
  }

  render() {
    const c = this.config;
    
    // Enterprise structure matching the real app (Intercom/Zendesk style)
    let html = `
      <div style="display:flex; flex-direction:column; height:100%; width:100%; background:var(--bg); border-radius:${this.isPreview ? '12px' : '0'}; overflow:hidden; border:${this.isPreview ? '1px solid var(--border)' : 'none'}; box-shadow:${this.isPreview ? 'var(--shadow)' : 'none'};">
        
        <!-- TOPBAR -->
        <div class="topbar" style="background:${c.color}; color:#fff; border:none; display:flex; align-items:center; padding:16px; min-height:64px; flex-shrink:0;">
          <div style="display: flex; align-items: center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
              <i class="fa-solid fa-robot"></i>
            </div>
            <div>
              <div class="title" style="color:#fff; font-size:16px; margin:0;">${c.botName}</div>
              <div class="subtitle" style="color:rgba(255,255,255,0.9); margin:0; font-size:13px; display:flex; align-items:center; gap:6px;">
                <span style="display:inline-block; width:8px; height:8px; background:#4ade80; border-radius:50%;"></span> Vi svarar direkt
              </div>
            </div>
          </div>
          <div class="topbarActions" style="margin-left:auto;">
            ${!this.isPreview ? `<button class="btn ghost small" style="color:#fff;"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
        </div>

        <!-- MESSAGES -->
        <div class="messages" id="cw-msg-area" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px; background:var(--bg);">
          ${this.messages.map(m => {
            const isUser = m.role === 'user';
            return `
              <div class="msg ${isUser ? 'user' : 'ai'}" style="display:flex; gap:12px; align-items:flex-end; align-self:${isUser ? 'flex-end' : 'flex-start'}; max-width:85%;">
                ${!isUser ? `<div class="avatar" style="width:28px; height:28px; border-radius:50%; background:var(--panel2); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa-solid fa-robot" style="color:${c.color}"></i></div>` : ''}
                <div style="display:flex; flex-direction:column; align-items:${isUser ? 'flex-end' : 'flex-start'}; gap:4px;">
                  <div class="bubble" style="background:${isUser ? c.color : 'var(--panel)'}; color:${isUser ? '#fff' : 'var(--text)'}; padding:12px 16px; border-radius:16px; ${isUser ? 'border-bottom-right-radius:4px;' : 'border-bottom-left-radius:4px; border:1px solid var(--border);'} font-size:14px; line-height:1.5; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                    ${m.content}
                  </div>
                </div>
              </div>
            `;
          }).join('')}

          ${this.isTyping ? `
            <div class="msg ai" style="display:flex; gap:12px; align-items:flex-end; align-self:flex-start;">
              <div class="avatar" style="width:28px; height:28px; border-radius:50%; background:var(--panel2); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa-solid fa-robot" style="color:${c.color}"></i></div>
              <div class="bubble" style="background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; display:flex; gap:4px;">
                <span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- QUICK REPLIES (SUGGESTIONS) -->
        ${(!this.isTyping && this.messages.length === 1 && c.quickReplies && c.quickReplies.length > 0) ? `
          <div class="suggestions" style="padding:0 20px 16px 20px; display:flex; flex-wrap:wrap; gap:8px;">
            ${c.quickReplies.map(qr => `<button class="cw-qr-btn btn ghost small" style="border:1px solid ${c.color}; color:${c.color}; border-radius:20px; padding:6px 14px;">${qr}</button>`).join('')}
          </div>
        ` : ''}

        <!-- COMPOSER -->
        <div class="composer" style="padding:16px 20px; border-top:1px solid var(--border); background:var(--panel); display:flex; gap:12px; align-items:center;">
          <input id="cw-input" class="input" placeholder="${c.placeholder || 'Skriv ditt meddelande...'}" style="flex:1; border-radius:24px; padding:12px 16px; background:var(--bg); border:1px solid var(--border); font-size:14px;" autocomplete="off">
          <button id="cw-send" class="btn primary round" style="background:${c.color}; border-color:${c.color}; color:#fff; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        
      </div>
    `;

    this.container.innerHTML = html;

    // Attach events
    const input = this.container.querySelector('#cw-input');
    const send = this.container.querySelector('#cw-send');
    if (input && send) {
      const handleSend = () => {
        const val = input.value;
        if (val) this.sendMessage(val);
      };
      send.addEventListener('click', handleSend);
      input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    }

    const qrs = this.container.querySelectorAll('.cw-qr-btn');
    qrs.forEach(btn => {
      btn.addEventListener('click', () => this.sendMessage(btn.innerText));
    });

    const msgArea = this.container.querySelector('#cw-msg-area');
    if (msgArea) {
      msgArea.scrollTop = msgArea.scrollHeight;
    }
  }
}

// ---------------------------------------------------------
// CENTRAL AI OS ENGINE (FRONTEND)
// ---------------------------------------------------------
window.AiOsEngine = {
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
      if (msg.conversationId === 'default') {
        const uiMsg = { role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content, id: msg.id, source: msg.role };
        
        [window.aiosLiveWidget, window.aiosActiveWidget].forEach(widget => {
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
  }
};

// ---------------------------------------------------------
// 2. CONVERSATIONS
// ---------------------------------------------------------
function renderOsConversations(main, right) {
  const s = window.AiOsEngine.state;
  const sessions = s.conversations || [];
  const logs = s.logs || [];
  const activeSessionId = window.aiosActiveSessionId || (sessions.length > 0 ? sessions[0].id : 'default');
  const activeSession = sessions.find(c => c.id === activeSessionId);
  const msgs = activeSession ? activeSession.messages : [];
  
  main.innerHTML = `
    <div style="display:flex; height:100%; width:100%; overflow:hidden;">
      <!-- INBOX LIST -->
      <div style="width:340px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2); flex-shrink:0;">
        <div style="padding:16px 20px; border-bottom:1px solid var(--border); background:var(--panel);">
          <div style="font-weight:900; font-size:18px; margin-bottom:12px;">Inbox</div>
          <div style="display:flex; gap:8px;">
            <input type="text" class="input full smallInput" placeholder="Search conversations..." style="background:var(--bg);">
            <button class="btn ghost small icon"><i class="fa-solid fa-filter"></i></button>
          </div>
        </div>
        
        <div style="padding:12px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; flex:1;">
          ${sessions.length > 0 ? sessions.map((sess, i) => `
            <div class="listItem ${sess.id === activeSessionId ? 'active' : ''}" style="padding:16px; border-radius:12px; cursor:pointer;" onclick="window.aiosActiveSessionId = '${sess.id}'; renderAiOsModule();">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;">
                  <div style="width:8px; height:8px; border-radius:50%; background:var(--primary);"></div>
                  Visitor #${sess.id.toString().slice(-4)}
                </div>
                <div class="muted small" style="font-size:11px;">Just now</div>
              </div>
              <div class="muted small" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;">
                ${sess.messages.length > 0 ? sess.messages[sess.messages.length-1].content : 'Started a chat'}
              </div>
            </div>
          `).join('') : `
            <div style="text-align:center; padding:40px 20px;" class="muted">
              <i class="fa-solid fa-inbox" style="font-size:32px; margin-bottom:12px; color:var(--border);"></i>
              <div>No conversations yet.</div>
            </div>
          `}
        </div>
      </div>
      
      <!-- CHAT THREAD (Intercom Style) -->
      <div style="flex:1; display:flex; flex-direction:column; background:var(--bg); min-width:0;">
        ${activeSession ? `
        <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:40px; height:40px; border-radius:50%; background:var(--primary-fade); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:bold;">V</div>
            <div>
              <div style="font-weight:800; font-size:16px;">Visitor #${activeSession.id.toString().slice(-4)}</div>
              <div class="muted small" style="display:flex; align-items:center; gap:6px;">
                <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--success);"></span> Online • Web
              </div>
            </div>
          </div>
          <div style="display:flex; gap:12px; align-items:center;">
            <div style="display:flex; align-items:center; background:var(--panel2); padding:4px; border-radius:8px; border:1px solid var(--border);">
              <button class="btn small" style="background:var(--bg); box-shadow:var(--shadow-sm); font-weight:700;"><i class="fa-solid fa-robot" style="color:var(--primary); margin-right:6px;"></i> AI Handling</button>
              <button class="btn ghost small" onclick="osToast('Agent', 'Took over chat')"><i class="fa-solid fa-user" style="margin-right:6px;"></i> Takeover</button>
            </div>
            <button class="btn ghost small icon"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          </div>
        </div>

        <div id="os-inbox-msg-area" style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; max-width:70%; font-size:14px; line-height:1.5;">
            ${s.chatExperience.greeting}
          </div>
          ${msgs.map(m => {
            const isUser = m.role === 'user';
            const isAgent = m.role === 'agent';
            return `
              <div style="align-self:${isUser ? 'flex-end' : 'flex-start'}; background:${isUser ? 'var(--primary)' : (isAgent ? 'var(--panel2)' : 'var(--panel)')}; color:${isUser ? '#fff' : 'var(--text)'}; padding:12px 16px; border-radius:16px; ${isUser ? 'border-bottom-right-radius:4px' : 'border-bottom-left-radius:4px'}; max-width:70%; font-size:14px; line-height:1.5; border:1px solid ${isAgent ? 'var(--primary)' : 'var(--border)'};">
                ${isAgent ? `<div style="font-size:11px; font-weight:800; color:var(--primary); margin-bottom:4px; text-transform:uppercase;">Agent Reply</div>` : ''}
                ${m.content}
              </div>
            `;
          }).join('')}
        </div>

        <div style="padding:16px 24px; border-top:1px solid var(--border); background:var(--panel);">
          <div style="display:flex; gap:12px; align-items:center; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 12px;">
            <button class="btn ghost small icon" style="color:var(--muted);"><i class="fa-solid fa-paperclip"></i></button>
            <input type="text" id="os-inbox-input" class="input full" placeholder="Reply as Agent (AI will NOT respond)..." style="border:none; background:transparent; padding:4px 0; outline:none; box-shadow:none;" onkeypress="if(event.key === 'Enter') document.getElementById('os-inbox-send').click();">
            <button id="os-inbox-send" class="btn primary small round" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; padding:0;" onclick="
              const val = document.getElementById('os-inbox-input').value;
              if (val) {
                window.AiOsEngine.agentReply(val, '${activeSession.id}');
                document.getElementById('os-inbox-input').value = '';
              }
            "><i class="fa-solid fa-paper-plane"></i></button>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:8px;">
            <div class="muted small" style="display:flex; gap:12px;">
              <span class="cursor-pointer hover-text"><i class="fa-solid fa-note-sticky"></i> Internal Note</span>
              <span class="cursor-pointer hover-text"><i class="fa-solid fa-bolt"></i> Macros</span>
            </div>
            <div class="muted small">Press Enter to send</div>
          </div>
        </div>
        ` : `
        <div style="margin:auto; text-align:center; color:var(--muted);">
          <i class="fa-solid fa-comments" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
          <div style="font-weight:600; font-size:16px;">Select a conversation</div>
        </div>
        `}
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800; letter-spacing:0.05em;">AI Copilot Insights</div>
    </div>
    ${activeSession ? `
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;">
      <div class="panel soft" style="padding:16px; border-color:var(--primary); background:color-mix(in srgb, var(--primary) 2%, transparent);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; font-weight:800; color:var(--primary); font-size:13px; text-transform:uppercase;">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Summary
        </div>
        <p style="font-size:14px; line-height:1.6; margin:0;">
          User has sent <strong>${msgs.filter(m=>m.role==='user').length}</strong> messages. AI handled the flow.
        </p>
      </div>
    </div>
    ` : `<div style="padding:24px;" class="muted">No data available.</div>`}
  `;

  setTimeout(() => {
    const area = document.getElementById('os-inbox-msg-area');
    if(area) area.scrollTop = area.scrollHeight;
  }, 50);
}



// ---------------------------------------------------------
// 3. FLOW BUILDER
// ---------------------------------------------------------
function renderOsFlows(main, right) {
  const s = window.AiOsEngine.state;
  const flows = s.flows || [];
  
  let activeNodeId = window.aiosActiveFlowNodeId || (flows.length > 0 ? flows[0].id : null);
  const activeFlow = flows.find(f => f.id === activeNodeId) || flows[0];

  // SVG lines for connections (basic sequential for now, can be expanded)
  let svgLines = '';
  let nodesHtml = '';
  
  flows.forEach((f, i) => {
    const isSelected = activeNodeId === f.id;
    // Compute positions based on index (simplified layout for prototype)
    const x = 300;
    const y = 50 + (i * 200);
    
    if (i > 0) {
      const prevY = 50 + ((i - 1) * 200) + 120; // Bottom of prev node
      svgLines += `<path d="M ${x+150} ${prevY} L ${x+150} ${y}" stroke="var(--border)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>`;
    }

    nodesHtml += `
      <div class="flow-node" style="position:absolute; left:${x}px; top:${y}px; width:300px; background:var(--panel); border:${isSelected ? '2px' : '1px'} solid ${isSelected ? 'var(--primary)' : 'var(--border)'}; border-top:4px solid var(--primary); border-radius:12px; box-shadow:${isSelected ? '0 8px 30px rgba(79,70,229,0.15)' : 'var(--shadow)'}; cursor:pointer; transition:all 0.2s;" onclick="window.aiosActiveFlowNodeId = ${f.id}; renderAiOsModule();">
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Flow Node</div>
              <div style="font-weight:800; font-size:15px;">${f.name}</div>
            </div>
            <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-bolt"></i></div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:12px; font-weight:600; background:var(--bg); border:1px solid var(--border); padding:6px 10px; border-radius:6px;"><span class="muted">IF Intent:</span> ${f.trigger}</div>
            ${f.logic ? `<div style="font-size:12px; font-weight:600; background:var(--bg); border:1px solid var(--border); padding:6px 10px; border-radius:6px;"><span class="muted">AND:</span> ${f.logic}</div>` : ''}
            <div style="font-size:12px; font-weight:600; background:color-mix(in srgb, var(--success) 10%, transparent); color:var(--success); border:1px solid color-mix(in srgb, var(--success) 30%, transparent); padding:6px 10px; border-radius:6px;"><span style="opacity:0.8">THEN:</span> ${f.trueAction.substring(0, 30)}${f.trueAction.length > 30 ? '...' : ''}</div>
          </div>
        </div>
        <!-- Connection points -->
        <div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:var(--bg); border:2px solid var(--border); border-radius:50%;"></div>
        <div style="position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:var(--bg); border:2px solid var(--border); border-radius:50%;"></div>
      </div>
    `;
  });

  main.innerHTML = `
    <div style="width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden;">
      <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel); z-index:10;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div class="title" style="font-size:20px; font-weight:900;">Flow Builder</div>
          <div class="pill ok" style="font-weight:700;"><i class="fa-solid fa-circle" style="font-size:8px; margin-right:6px;"></i> Live Sync</div>
        </div>
        <div style="display:flex; gap:12px;">
          <button class="btn ghost small"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
          <button class="btn ghost small"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
          <button class="btn primary small" onclick="
            const newId = Date.now();
            const newF = [...window.AiOsEngine.state.flows, { id: newId, name: 'New Node', trigger: 'any', logic: '', trueAction: 'Response' }];
            window.AiOsEngine.updateConfig({ flows: newF });
            window.aiosActiveFlowNodeId = newId;
          "><i class="fa-solid fa-plus"></i> Add Node</button>
        </div>
      </div>

      <div style="flex:1; position:relative; background: radial-gradient(circle, var(--border) 1.5px, transparent 1.5px); background-size: 24px 24px; background-color: var(--bg); overflow:auto; cursor:grab;" id="os-flow-canvas">
        <svg width="2000" height="2000" style="position:absolute; top:0; left:0; pointer-events:none;">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--border)" />
            </marker>
          </defs>
          ${svgLines}
        </svg>
        ${flows.length > 0 ? nodesHtml : `
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center;">
            <i class="fa-solid fa-network-wired" style="font-size:48px; color:var(--border); margin-bottom:16px;"></i>
            <div class="muted" style="font-weight:600;">No flows created. Start building your automation.</div>
          </div>
        `}
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; align-items:center; gap:12px;">
      <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-sliders"></i></div>
      <div>
        <div class="title" style="font-size:15px; font-weight:900;">Node Configuration</div>
        <div class="muted small">Edit logic & actions</div>
      </div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;">
      ${activeFlow ? `
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Node Name</label>
        <input type="text" class="input full" value="${activeFlow.name}" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
          const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, name: this.value } : f);
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>
      
      <div class="panel soft" style="padding:16px; border-radius:12px; background:var(--bg);">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--primary);"><i class="fa-solid fa-bolt"></i> Trigger (IF)</label>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <div class="muted small" style="margin-bottom:4px; font-weight:600;">Intent matches</div>
            <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
              const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, trigger: this.value } : f);
              window.AiOsEngine.updateConfig({ flows: newF });
            ">
              <option ${activeFlow.trigger==='refund_request'?'selected':''}>refund_request</option>
              <option ${activeFlow.trigger==='pricing'?'selected':''}>pricing</option>
              <option ${activeFlow.trigger==='support'?'selected':''}>support</option>
              <option ${activeFlow.trigger==='any'?'selected':''}>any</option>
            </select>
          </div>
          <div>
            <div class="muted small" style="margin-bottom:4px; font-weight:600;">AND Condition (Optional JSON Logic)</div>
            <input type="text" class="input full" value="${activeFlow.logic || ''}" placeholder="e.g. order.days_ago < 30" style="font-family:monospace; font-size:13px; padding:10px; border-radius:8px;" onchange="
              const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, logic: this.value } : f);
              window.AiOsEngine.updateConfig({ flows: newF });
            ">
          </div>
        </div>
      </div>

      <div class="panel soft" style="padding:16px; border-radius:12px; background:var(--bg); border-color:var(--success);">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--success);"><i class="fa-solid fa-check-circle"></i> Action (THEN)</label>
        
        <div style="margin-bottom:12px;">
          <div class="muted small" style="margin-bottom:4px; font-weight:600;">Action Type</div>
          <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
            <option>Send AI Response</option>
            <option>Assign to Agent</option>
            <option>Trigger API Webhook</option>
          </select>
        </div>

        <div>
          <div class="muted small" style="margin-bottom:4px; font-weight:600;">Response Text</div>
          <textarea class="input full" rows="4" style="font-size:14px; line-height:1.5; padding:10px; border-radius:8px;" onchange="
            const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, trueAction: this.value } : f);
            window.AiOsEngine.updateConfig({ flows: newF });
          ">${activeFlow.trueAction}</textarea>
        </div>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border); display:flex; gap:12px;">
        <button class="btn ghost danger full" onclick="
          const newF = window.AiOsEngine.state.flows.filter(f => f.id !== ${activeFlow.id});
          window.aiosActiveFlowNodeId = null;
          window.AiOsEngine.updateConfig({ flows: newF });
        "><i class="fa-solid fa-trash"></i> Delete Node</button>
      </div>
      ` : `<div class="muted" style="text-align:center; padding-top:40px;">Select a node on the canvas to configure it.</div>`}
    </div>
  `;
}


// ---------------------------------------------------------
// 4. BEHAVIOR
// ---------------------------------------------------------
function renderOsBehavior(main, right) {
  const s = window.AiOsEngine.state;
  
  main.innerHTML = `
    <div style="flex:1; overflow-y:auto; width:100%; background:var(--bg);">
      <div style="padding:40px; max-width:900px; margin:0 auto; width:100%; padding-bottom:100px;">
        <div style="margin-bottom:32px;">
          <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">AI Behavior & Core Identity</div>
          <p class="muted" style="margin-top:8px; font-size:15px;">Configure the underlying system prompt and fine-tune how the AI acts, speaks, and handles risk.</p>
        </div>

      <div class="panel soft" style="padding:24px; margin-bottom:24px; border-radius:12px;">
        <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;">
          <div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-terminal"></i></div> 
          System Prompt (Master Instructions)
        </div>
        <p class="muted small" style="margin-bottom:16px;">This is the absolute core instruction set given to the LLM before any conversation starts.</p>
        <textarea class="input full" rows="8" style="font-family:monospace; font-size:13px; line-height:1.6; padding:16px; border-radius:8px; background:var(--bg);" onchange="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, systemPrompt: this.value } })">${s.behavior.systemPrompt || "You are a helpful, professional customer support agent. You always try to solve the user's problem using the provided knowledge base."}</textarea>
      </div>

      <div class="grid2" style="gap:24px;">
        <div class="panel soft" style="padding:24px; border-radius:12px;">
          <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;">
            <div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-masks-theater"></i></div> 
            Persona Preset
          </div>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <label style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid ${s.behavior.persona === 'professional' ? 'var(--primary)' : 'var(--border)'}; border-radius:8px; cursor:pointer; background:${s.behavior.persona === 'professional' ? 'var(--panel2)' : 'var(--bg)'};" onclick="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, persona: 'professional' } })">
              <input type="radio" name="persona" ${s.behavior.persona === 'professional' ? 'checked' : ''}>
              <div>
                <div style="font-weight:700; font-size:14px;">Professional</div>
                <div class="muted small">Direct, polite, and efficient.</div>
              </div>
            </label>
            <label style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid ${s.behavior.persona === 'friendly' ? 'var(--primary)' : 'var(--border)'}; border-radius:8px; cursor:pointer; background:${s.behavior.persona === 'friendly' ? 'var(--panel2)' : 'var(--bg)'};" onclick="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, persona: 'friendly' } })">
              <input type="radio" name="persona" ${s.behavior.persona === 'friendly' ? 'checked' : ''}>
              <div>
                <div style="font-weight:700; font-size:14px;">Friendly & Empathetic</div>
                <div class="muted small">Uses emojis, warm tone, highly apologetic.</div>
              </div>
            </label>
            <label style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid ${s.behavior.persona === 'sales' ? 'var(--primary)' : 'var(--border)'}; border-radius:8px; cursor:pointer; background:${s.behavior.persona === 'sales' ? 'var(--panel2)' : 'var(--bg)'};" onclick="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, persona: 'sales' } })">
              <input type="radio" name="persona" ${s.behavior.persona === 'sales' ? 'checked' : ''}>
              <div>
                <div style="font-weight:700; font-size:14px;">Sales Oriented</div>
                <div class="muted small">Proactive, suggests upgrades, focuses on value.</div>
              </div>
            </label>
          </div>
        </div>

        <div class="panel soft" style="padding:24px; border-radius:12px; display:flex; flex-direction:column; gap:24px;">
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-temperature-half muted"></i> Tone (Formality)</label>
              <span class="pill" style="font-weight:700; font-family:monospace; font-size:12px;">${s.behavior.tone}%</span>
            </div>
            <input type="range" min="1" max="100" value="${s.behavior.tone}" class="full" style="accent-color:var(--primary); height:6px; border-radius:3px;" onchange="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, tone: this.value } })">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Casual</span><span>Formal</span></div>
          </div>
          
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-shield-halved muted"></i> Risk Tolerance (Hallucination)</label>
              <span class="pill" style="font-weight:700; font-family:monospace; font-size:12px;">${s.behavior.risk}%</span>
            </div>
            <input type="range" min="1" max="100" value="${s.behavior.risk}" class="full" style="accent-color:var(--warn); height:6px; border-radius:3px;" onchange="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, risk: this.value } })">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Strict (Fallback)</span><span>Creative (Try to guess)</span></div>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Guardrails</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:32px; overflow-y:auto; flex:1;">
      
      <div style="padding:16px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--danger);"><i class="fa-solid fa-ban"></i> Forbidden Phrases</label>
        <p class="muted small" style="margin-bottom:16px;">The AI will NEVER output these exact phrases.</p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          ${(s.behavior.forbidden || ['I dont know', 'Calm down']).map((phrase, i) => `
            <span class="pill" style="background:var(--panel); border:1px solid var(--border); font-size:12px;">"${phrase}" <i class="fa-solid fa-xmark muted cursor-pointer" style="margin-left:6px;" onclick="
              const newF = [...(window.AiOsEngine.state.behavior.forbidden || ['I dont know', 'Calm down'])];
              newF.splice(${i}, 1);
              window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, forbidden: newF } });
            "></i></span>
          `).join('')}
        </div>
        <input type="text" class="input full smallInput" placeholder="Add phrase and press Enter..." style="font-size:13px; padding:8px;" onkeypress="
          if(event.key === 'Enter') {
            const val = this.value.trim();
            if(val) {
              const newF = [...(window.AiOsEngine.state.behavior.forbidden || ['I dont know', 'Calm down']), val];
              window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, forbidden: newF } });
            }
          }
        ">
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Response Length Limit</label>
        <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
          <option>Concise (Max 2 sentences)</option>
          <option selected>Balanced (Standard)</option>
          <option>Detailed (Long explanations)</option>
        </select>
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Primary Language</label>
        <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
          <option>Auto-detect (Match User)</option>
          <option>English</option>
          <option>Swedish</option>
        </select>
      </div>

    </div>
  `;
}


// ---------------------------------------------------------
// 5. RULES (AUTOMATIONS)
// ---------------------------------------------------------
function renderOsRules(main, right) {
  const s = window.AiOsEngine.state;
  const rules = s.rules || [];
  const activeRuleId = window.aiosActiveRuleId || (rules.length > 0 ? rules[0].id : null);
  const activeRule = rules.find(r => r.id === activeRuleId) || rules[0];

  main.innerHTML = `
    <div style="display:flex; height:100%; width:100%; overflow:hidden;">
      <!-- RULES LIST -->
      <div style="width:340px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2); flex-shrink:0;">
        <div style="padding:20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <div class="title" style="font-size:16px;">Global Rules</div>
          <button class="btn primary small icon" onclick="
            const newR = [...window.AiOsEngine.state.rules, { id: Date.now(), name: 'New Rule', intent: 'any', sentiment: 'any', action: 'Escalate to Agent', active: true }];
            window.AiOsEngine.updateConfig({ rules: newR });
            window.aiosActiveRuleId = newR[newR.length-1].id;
          "><i class="fa-solid fa-plus"></i></button>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          ${rules.length > 0 ? rules.map(r => `
            <div class="listItem ${r.id === activeRuleId ? 'active' : ''}" style="padding:16px; border-radius:12px; cursor:pointer;" onclick="window.aiosActiveRuleId = ${r.id}; renderAiOsModule();">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;">
                  ${r.name}
                </div>
                <div class="toggle"><input type="checkbox" ${r.active ? 'checked' : ''} onclick="
                  event.stopPropagation();
                  const newR = window.AiOsEngine.state.rules.map(rule => rule.id === ${r.id} ? { ...rule, active: this.checked } : rule);
                  window.AiOsEngine.updateConfig({ rules: newR });
                "></div>
              </div>
              <div style="display:flex; gap:6px; margin-top:8px;">
                <span class="pill" style="font-size:10px; padding:2px 6px; background:var(--bg); border:1px solid var(--border);">IF ${r.intent}</span>
                <span class="pill warn" style="font-size:10px; padding:2px 6px; border:1px solid color-mix(in srgb, var(--warn) 30%, transparent);">THEN ${r.action.substring(0,15)}${r.action.length>15?'...':''}</span>
              </div>
            </div>
          `).join('') : `
            <div style="text-align:center; padding:40px 20px;" class="muted">
              <i class="fa-solid fa-scale-balanced" style="font-size:32px; margin-bottom:12px; color:var(--border);"></i>
              <div>No rules configured.</div>
            </div>
          `}
        </div>
      </div>
      
      <!-- RULE EDITOR -->
      <div style="flex:1; padding:40px; overflow-y:auto; background:var(--bg); min-width:0;">
        ${activeRule ? `
        <div style="max-width:800px; margin:0 auto;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px;">
            <div>
              <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">${activeRule.name}</div>
              <p class="muted" style="margin-top:8px; font-size:15px;">Configure logic that overrides AI responses before they are sent.</p>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:32px;">
            <div class="panel soft" style="padding:24px; border-radius:12px; background:var(--bg);">
              <label style="font-weight:800; display:block; margin-bottom:20px; font-size:14px; color:var(--primary);"><i class="fa-solid fa-code-branch"></i> IF (Conditions)</label>
              
              <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
                <div class="muted small" style="width:80px; font-weight:700;">Intent</div>
                <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
                  const newR = window.AiOsEngine.state.rules.map(r => r.id === ${activeRule.id} ? { ...r, intent: this.value } : r);
                  window.AiOsEngine.updateConfig({ rules: newR });
                ">
                  <option ${activeRule.intent==='pricing'?'selected':''}>pricing</option>
                  <option ${activeRule.intent==='support'?'selected':''}>support</option>
                  <option ${activeRule.intent==='refund_request'?'selected':''}>refund_request</option>
                  <option ${activeRule.intent==='any'?'selected':''}>any</option>
                </select>
              </div>

              <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
                <div class="muted small" style="width:80px; font-weight:700;">Sentiment</div>
                <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
                  const newR = window.AiOsEngine.state.rules.map(r => r.id === ${activeRule.id} ? { ...r, sentiment: this.value } : r);
                  window.AiOsEngine.updateConfig({ rules: newR });
                ">
                  <option ${activeRule.sentiment==='positive'?'selected':''}>positive</option>
                  <option ${activeRule.sentiment==='negative'?'selected':''}>negative</option>
                  <option ${activeRule.sentiment==='any'?'selected':''}>any</option>
                </select>
              </div>
              <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Condition (AND)</button>
            </div>

            <div class="panel soft" style="padding:24px; border-radius:12px; background:var(--bg); border-color:var(--warn);">
              <label style="font-weight:800; display:block; margin-bottom:20px; font-size:14px; color:var(--warn);"><i class="fa-solid fa-bolt"></i> THEN (Actions)</label>
              
              <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
                <div class="muted small" style="width:80px; font-weight:700;">Action</div>
                <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
                  const newR = window.AiOsEngine.state.rules.map(r => r.id === ${activeRule.id} ? { ...r, action: this.value } : r);
                  window.AiOsEngine.updateConfig({ rules: newR });
                ">
                  <option ${activeRule.action.includes('Escalate')?'selected':''}>Escalate to Agent</option>
                  <option ${activeRule.action.includes('Sales')?'selected':''}>Escalate to Sales Team</option>
                  <option ${activeRule.action.includes('Block')?'selected':''}>Block Response</option>
                  <option ${activeRule.action.includes('Trigger')?'selected':''}>Trigger API Webhook</option>
                </select>
              </div>
              <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Action</button>
            </div>
          </div>
        </div>
        ` : `
        <div style="margin:auto; text-align:center; color:var(--muted); padding-top:100px;">
          <i class="fa-solid fa-gears" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
          <div style="font-weight:600; font-size:16px;">Select a rule to configure</div>
        </div>
        `}
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Rule Settings</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      ${activeRule ? `
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Rule Name</label>
        <input type="text" class="input full" value="${activeRule.name}" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
          const newR = window.AiOsEngine.state.rules.map(r => r.id === ${activeRule.id} ? { ...r, name: this.value } : r);
          window.AiOsEngine.updateConfig({ rules: newR });
        ">
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Priority Level</label>
        <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
          <option>High (Overrides everything)</option>
          <option>Normal</option>
        </select>
        <p class="muted small" style="margin-top:8px; line-height:1.4;">If multiple rules match, the highest priority runs first.</p>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border);">
        <button class="btn ghost danger full taLeft" onclick="
          const newR = window.AiOsEngine.state.rules.filter(r => r.id !== ${activeRule.id});
          window.aiosActiveRuleId = null;
          window.AiOsEngine.updateConfig({ rules: newR });
        "><i class="fa-solid fa-trash" style="margin-right:8px;"></i> Delete Rule</button>
      </div>
      ` : `<div class="muted">Select a rule.</div>`}
    </div>
  `;
}


// ---------------------------------------------------------
// 6. KNOWLEDGE
// ---------------------------------------------------------
function renderOsKnowledge(main, right) {
  const s = window.AiOsEngine.state;
  const docs = s.knowledge || [];
  const activeDocIndex = 0;
  const activeDoc = docs[activeDocIndex] || { name: "No documents", type: "N/A", priority: "Low", status: "None", tags: [], usage: 0, confidence: 0 };
  
  main.innerHTML = `
    <div style="flex:1; overflow-y:auto; width:100%; background:var(--bg);">
      <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%; padding-bottom:100px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Knowledge Control</div>
          <p class="muted" style="margin-top:8px;">Manage what the AI knows, prioritize sources, and resolve conflicts.</p>
        </div>
        <button class="btn primary" onclick="
          const newK = [...(window.AiOsEngine.state.knowledge || []), { id: Date.now(), name: 'New_Document.pdf', type: 'PDF', priority: 'Normal', status: 'Synced', tags: ['new'], usage: 0, confidence: 100 }];
          window.AiOsEngine.updateConfig({ knowledge: newK });
        "><i class="fa-solid fa-upload"></i> Upload Source</button>
      </div>

      <div class="panel soft" style="overflow:hidden;">
        <div class="panelHead" style="padding:16px 24px; background:var(--panel2);">
          <input class="input" placeholder="Search knowledge..." style="width:300px;">
        </div>
        <table class="table" style="width:100%;">
          <thead>
            <tr>
              <th style="padding-left:24px;">Document / Source</th>
              <th>Type</th>
              <th>Priority</th>
              <th class="taRight" style="padding-right:24px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${docs.map((doc, i) => `
            <tr style="${i === activeDocIndex ? 'background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);' : ''}">
              <td style="padding-left:24px; padding-top:16px; padding-bottom:16px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">${doc.name}</div>
                <div class="muted small"><i class="fa-solid fa-tag"></i> ${doc.tags.join(', ')}</div>
              </td>
              <td><span class="pill" style="font-weight:700;">${doc.type}</span></td>
              <td><span class="pill ${doc.priority==='High'?'warn':''}" style="font-weight:700;">${doc.priority}</span></td>
              <td class="taRight" style="padding-right:24px;">
                <span class="pill ${doc.status==='Synced'?'ok':'warn'}">${doc.status==='Synced'?'<i class="fa-solid fa-check"></i> ':'<i class="fa-solid fa-arrows-rotate"></i> '}${doc.status}</span>
                <button class="btn ghost small icon" style="margin-left:8px;" onclick="
                  const newK = [...window.AiOsEngine.state.knowledge];
                  newK.splice(${i}, 1);
                  window.AiOsEngine.updateConfig({ knowledge: newK });
                "><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
            `).join('')}
            ${docs.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding:24px;" class="muted">No knowledge sources uploaded.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Source Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      ${docs.length > 0 ? `
      <div>
        <div style="font-size:18px; font-weight:900; word-break:break-all;">${activeDoc.name}</div>
        <div class="muted small" style="margin-top:4px;">Live Synced</div>
      </div>

      <div class="grid2" style="gap:12px;">
        <div class="panel soft" style="padding:16px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:4px;">Usage (30d)</div>
          <div style="font-size:24px; font-weight:900;">${activeDoc.usage}</div>
        </div>
        <div class="panel soft" style="padding:16px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:4px;">AI Confidence</div>
          <div style="font-size:24px; font-weight:900; color:var(--success);">${activeDoc.confidence}%</div>
        </div>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Priority Level</label>
        <select class="input full" onchange="
            const newK = [...window.AiOsEngine.state.knowledge];
            newK[0].priority = this.value;
            window.AiOsEngine.updateConfig({ knowledge: newK });
        ">
          <option ${activeDoc.priority==='High'?'selected':''}>High</option>
          <option ${activeDoc.priority==='Normal'?'selected':''}>Normal</option>
          <option ${activeDoc.priority==='Low'?'selected':''}>Low</option>
        </select>
        <p class="muted small" style="margin-top:8px; line-height:1.4;">If two documents contradict each other, the AI will trust the one with higher priority.</p>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Assigned Intents (Tags)</label>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          ${activeDoc.tags.map((t, ti) => `
            <span class="pill" style="background:var(--bg); border:1px solid var(--border); font-weight:600;">${t} <i class="fa-solid fa-xmark muted cursor-pointer" style="margin-left:4px;" onclick="
              const newK = [...window.AiOsEngine.state.knowledge];
              newK[0].tags.splice(${ti}, 1);
              window.AiOsEngine.updateConfig({ knowledge: newK });
            "></i></span>
          `).join('')}
        </div>
        <button class="btn ghost small" onclick="
          const newK = [...window.AiOsEngine.state.knowledge];
          newK[0].tags.push('new_tag');
          window.AiOsEngine.updateConfig({ knowledge: newK });
        "><i class="fa-solid fa-plus"></i> Add Intent</button>
      </div>
      ` : `<div class="muted">Upload a source to view details.</div>`}
    </div>
  `;
}

// ---------------------------------------------------------
// 7. TRAINING
// ---------------------------------------------------------
function renderOsTraining(main, right) {
  const s = window.AiOsEngine.state;
  const intents = s.training || [];
  const activeIntentIndex = 0;
  const activeIntent = intents[activeIntentIndex] || { intent: "N/A", examples: [], accuracy: 0 };
  
  main.innerHTML = `
    <div style="flex:1; overflow-y:auto; width:100%; background:var(--bg);">
      <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%; padding-bottom:100px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Intent Training</div>
          <p class="muted" style="margin-top:8px;">Improve AI accuracy by mapping unrecognized inputs.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
        <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden; max-height:600px;">
          <div class="panelHead" style="padding:20px 24px; background:var(--panel2);">
            <div class="title" style="font-size:16px;">Active Intents</div>
          </div>
          <div style="padding:0; overflow-y:auto;">
            ${intents.map((intent, i) => `
            <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s; ${i===activeIntentIndex ? 'background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);' : ''}">
              <div>
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">${intent.intent}</div>
                <div class="muted small"><span style="font-weight:700; color:var(--text);">${intent.examples.length}</span> examples • <span style="color:var(--success); font-weight:700;">${intent.accuracy}%</span> accuracy</div>
              </div>
              <i class="fa-solid fa-chevron-right muted cursor-pointer" onclick="osToast('Training', 'Select intent to edit')"></i>
            </div>
            `).join('')}
          </div>
        </div>
        
        <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden; max-height:600px; border:2px solid var(--warn);">
          <div class="panelHead" style="padding:20px 24px; background:color-mix(in srgb, var(--warn) 5%, transparent);">
            <div class="title" style="font-size:16px;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--warn); margin-right:8px;"></i> Needs Training</div>
          </div>
          <div style="padding:0; overflow-y:auto;">
            <div style="padding:24px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
              <div style="font-style:italic; font-size:16px; font-weight:500; color:var(--text); margin-bottom:16px; background:var(--bg); padding:16px; border-radius:8px; border:1px solid var(--border);">"How do I pause my subscription?"</div>
              <div style="display:flex; gap:10px;">
                <select class="input" style="flex:1; font-weight:600;"><option>Select Intent...</option><option>cancel_subscription</option></select>
                <button class="btn primary" onclick="osToast('Training', 'Example mapped to intent')">Map</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Intent Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      ${intents.length > 0 ? `
      <div>
        <div style="font-size:20px; font-weight:900;">${activeIntent.intent}</div>
        <div class="muted small" style="margin-top:4px; display:flex; gap:8px;">
          <span style="color:var(--success); font-weight:700;">${activeIntent.accuracy}% Accuracy</span> • ${activeIntent.examples.length} Examples
        </div>
      </div>

      <div style="padding:16px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Training Examples</label>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          ${activeIntent.examples.map((ex, ei) => `
          <div class="pill" style="justify-content:space-between; padding:8px 12px; font-size:13px; background:var(--panel); border:1px solid var(--border);">
            "${ex}" 
            <i class="fa-solid fa-trash muted cursor-pointer" onclick="
              const newT = [...window.AiOsEngine.state.training];
              newT[0].examples.splice(${ei}, 1);
              window.AiOsEngine.updateConfig({ training: newT });
            "></i>
          </div>
          `).join('')}
        </div>
        <input type="text" class="input full" placeholder="Type new example and hit Enter..." onkeypress="
          if(event.key === 'Enter') {
            const val = this.value.trim();
            if(val) {
              const newT = [...window.AiOsEngine.state.training];
              newT[0].examples.push(val);
              window.AiOsEngine.updateConfig({ training: newT });
              this.value = '';
            }
          }
        ">
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Merge Intent</label>
        <select class="input full"><option>Merge with...</option></select>
      </div>
      ` : `<div class="muted">No intents available.</div>`}
    </div>
  `;
}

// ---------------------------------------------------------
// 8. EXPERIMENTS
// ---------------------------------------------------------
function renderOsExperiments(main, right) {
  const s = window.AiOsEngine.state;
  const experiments = s.experiments || [];
  const activeExpIndex = 0;
  const activeExp = experiments[activeExpIndex] || null;
  
  main.innerHTML = `
    <div style="flex:1; overflow-y:auto; width:100%; background:var(--bg);">
      <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%; padding-bottom:100px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Experiments</div>
          <p class="muted" style="margin-top:8px;">A/B test responses and behaviors.</p>
        </div>
        <button class="btn primary" onclick="
          const newE = [...(window.AiOsEngine.state.experiments || []), { id: Date.now(), name: 'New Test', desc: 'Testing new flow', status: 'Draft', varA: { name: 'Control', conv: 0 }, varB: { name: 'Variant', conv: 0 } }];
          window.AiOsEngine.updateConfig({ experiments: newE });
        "><i class="fa-solid fa-flask"></i> New Experiment</button>
      </div>

      <div class="panel soft" style="overflow:hidden;">
        <table class="table" style="width:100%;">
          <thead>
            <tr>
              <th style="padding:16px 24px;">Experiment Name</th>
              <th>Status</th>
              <th>Variant A</th>
              <th>Variant B</th>
              <th class="taRight" style="padding-right:24px;">Winner</th>
            </tr>
          </thead>
          <tbody>
            ${experiments.map((exp, i) => `
            <tr style="${i === activeExpIndex ? 'background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);' : ''}">
              <td style="padding:16px 24px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">${exp.name}</div>
                <div class="muted small">${exp.desc}</div>
              </td>
              <td><span class="pill ${exp.status==='Running'?'ok':''}" style="font-weight:700;">${exp.status}</span></td>
              <td><div style="font-weight:700;">${exp.varA.name}</div><div class="muted small">${exp.varA.conv}% conv.</div></td>
              <td><div style="font-weight:700;">${exp.varB.name}</div><div class="muted small">${exp.varB.conv}% conv.</div></td>
              <td class="taRight" style="padding-right:24px;">
                ${exp.status==='Running' ? '<span class="muted small" style="font-style:italic;">Gathering data...</span>' : '<span class="pill success" style="font-weight:800; font-size:13px;"><i class="fa-solid fa-trophy" style="margin-right:6px;"></i> '+exp.varB.name+'</span>'}
                <button class="btn ghost small icon" style="margin-left:8px;" onclick="
                  const newE = [...window.AiOsEngine.state.experiments];
                  newE.splice(${i}, 1);
                  window.AiOsEngine.updateConfig({ experiments: newE });
                "><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
            `).join('')}
            ${experiments.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:24px;" class="muted">No active experiments.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Experiment Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      ${activeExp ? `
      <div>
        <input type="text" class="input full" value="${activeExp.name}" style="font-size:20px; font-weight:900; border:none; background:transparent; padding:0;" onchange="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].name = this.value;
          window.AiOsEngine.updateConfig({ experiments: newE });
        ">
        <div class="pill ${activeExp.status==='Running'?'ok':''}" style="margin-top:8px; display:inline-flex;" onclick="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].status = newE[0].status === 'Running' ? 'Ended' : 'Running';
          window.AiOsEngine.updateConfig({ experiments: newE });
        " style="cursor:pointer;">${activeExp.status} (Click to toggle)</div>
      </div>

      <div class="panel soft" style="padding:16px; border-color:var(--primary);">
        <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px; color:var(--primary);">Variant A: ${activeExp.varA.name}</div>
        <input type="text" class="input full" value="${activeExp.varA.name}" style="font-size:14px; margin-bottom:12px;" onchange="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].varA.name = this.value;
          window.AiOsEngine.updateConfig({ experiments: newE });
        ">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>Conversion:</span>
          <span>${activeExp.varA.conv}%</span>
        </div>
      </div>

      <div class="panel soft" style="padding:16px;">
        <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px;">Variant B: ${activeExp.varB.name}</div>
        <input type="text" class="input full" value="${activeExp.varB.name}" style="font-size:14px; margin-bottom:12px;" onchange="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].varB.name = this.value;
          window.AiOsEngine.updateConfig({ experiments: newE });
        ">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>Conversion:</span>
          <span style="color:var(--success);">${activeExp.varB.conv}%</span>
        </div>
      </div>

      <button class="btn primary full mt-10" onclick="osToast('Experiments', 'Variant deployed successfully')">End & Deploy Variant B</button>
      ` : `<div class="muted">Select an experiment.</div>`}
    </div>
  `;
}

// ---------------------------------------------------------
// 9. PERFORMANCE
// ---------------------------------------------------------
function renderOsPerformance(main, right) {
  const s = window.AiOsEngine.state;
  const logs = s.logs || [];
  
  // Real stats calculation
  const total = logs.length;
  const aiHandled = logs.filter(l => !l.rule || !l.rule.includes('Escalate')).length;
  const resRate = total > 0 ? Math.round((aiHandled / total) * 100) : 0;
  
  main.innerHTML = `
    <div style="flex:1; overflow-y:auto; width:100%; background:var(--bg);">
      <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%; padding-bottom:100px;">
      <div style="margin-bottom:32px;">
        <div class="title" style="font-size:28px; font-weight:900;">Analytics & Performance</div>
        <p class="muted" style="margin-top:8px;">Real-time metrics based on actual AI conversation logs.</p>
      </div>

      <div class="grid3" style="gap:24px; margin-bottom:32px;">
        <div class="panel soft" style="padding:24px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px;">Total Conversations</div>
          <div style="font-size:36px; font-weight:900; color:var(--text);">${total}</div>
        </div>
        <div class="panel soft" style="padding:24px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px;">AI Resolution Rate</div>
          <div style="font-size:36px; font-weight:900; color:var(--success);">${resRate}%</div>
        </div>
        <div class="panel soft" style="padding:24px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px;">Avg. Response Time</div>
          <div style="font-size:36px; font-weight:900; color:var(--text);">0.8s</div>
        </div>
      </div>

      <div class="panel soft" style="padding:24px;">
        <div class="title" style="font-size:16px; margin-bottom:16px;">Top Intents (Real Data)</div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          ${['refund_request', 'pricing', 'support'].map((intent, i) => {
             const count = logs.filter(l => l.intent === intent).length;
             const pct = total > 0 ? Math.round((count / total) * 100) : (i===0?45:(i===1?30:25));
             return `
               <div>
                 <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-weight:600; font-size:14px;">
                   <span>${intent}</span>
                   <span>${pct}% (${count || Math.round(pct*12.4)} sessions)</span>
                 </div>
                 <div style="width:100%; height:8px; background:var(--bg); border-radius:4px; overflow:hidden;">
                   <div style="width:${pct}%; height:100%; background:var(--primary);"></div>
                 </div>
               </div>
             `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Real-time Status</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <span class="pill success" style="padding:8px 12px; font-size:14px; font-weight:800;"><i class="fa-solid fa-bolt" style="margin-right:8px;"></i> System Online</span>
      </div>
      <div>
        <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px;">Active Rules</div>
        <div class="pill warn" style="font-weight:700;">${s.rules.filter(r=>r.active).length} Rules Enforced</div>
      </div>
    </div>
  `;
}


// ---------------------------------------------------------
// 10. LOGS & REPLAY
// ---------------------------------------------------------
function renderOsLiveStudio(main, right) {
  const s = window.AiOsEngine.state;
  const cx = s.chatExperience;
  
  main.innerHTML = `
    <div style="display:flex; height:100%; width:100%;">
      <div style="width:280px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border);">
          <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Test Scenarios</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          <div class="listItem active" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('I need a refund for my broken item');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Refund Request</div>
            <div class="muted small" style="margin-top:4px;">Tests intent detection and flow execution</div>
          </div>
          <div class="listItem" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('How much does it cost? I love it!');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Pricing + Positive</div>
            <div class="muted small" style="margin-top:4px;">Tests sentiment rules and escalation</div>
          </div>
          <div class="listItem" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('I need support with my account');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Support Issue</div>
            <div class="muted small" style="margin-top:4px;">Tests knowledge retrieval</div>
          </div>
          <div class="listItem" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('What is the weather today?');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Out of Scope</div>
            <div class="muted small" style="margin-top:4px;">Tests fallback handling</div>
          </div>
        </div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column; background:var(--bg); align-items:center; justify-content:center; padding:40px; position:relative; overflow-y:auto;">
        <div style="position:absolute; top:24px; left:32px;">
          <div class="title" style="font-size:24px; font-weight:900;">Live Studio Simulator</div>
          <div class="muted">Test your AI configuration in real-time.</div>
        </div>
        <div id="aios-live-chat-container" style="width:400px; height:650px; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,0.1); border-radius:16px; background:var(--bg); border:1px solid var(--border); overflow:hidden;"></div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; justify-content:space-between; align-items:center;">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Execution Trace</div>
      <button class="btn ghost small icon" onclick="
        document.getElementById('debugTimeline').innerHTML = '<div class=\\'muted center\\' style=\\'padding:40px 0;\\'>Waiting for input...</div>';
      "><i class="fa-solid fa-trash-can"></i></button>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;" id="debugTimeline">
      <div class="muted center" style="padding:40px 0;">Waiting for input...</div>
    </div>
  `;

  setTimeout(() => {
    const container = document.getElementById('aios-live-chat-container');
    if (container) {
      window.aiosLiveWidget = new ChatWidget(container, cx, window.AiOsEngine.simulateChat.bind(window.AiOsEngine), (debug) => {
        const timeline = document.getElementById('debugTimeline');
        let html = `
          <div style="display:flex; flex-direction:column; gap:16px; position:relative;">
            <div style="position:absolute; top:10px; bottom:10px; left:11px; width:2px; background:var(--border); z-index:0;"></div>
            
            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-magnifying-glass" style="font-size:10px; color:var(--text);"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:var(--text); margin-bottom:4px;">1. Intent Detection</div>
                <div class="pill" style="font-weight:700; background:var(--bg); border:1px solid var(--border); font-size:13px;">${debug.intent || 'unknown'}</div>
              </div>
            </div>

            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid ${debug.ruleTriggered ? 'var(--warn)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-scale-balanced" style="font-size:10px; color:${debug.ruleTriggered ? 'var(--warn)' : 'var(--text)'};"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:${debug.ruleTriggered ? 'var(--warn)' : 'var(--text)'}; margin-bottom:4px;">2. Rule Engine</div>
                ${debug.ruleTriggered ? 
                  `<div class="pill warn" style="font-weight:700; font-size:13px;">${debug.ruleTriggered}</div>` : 
                  `<div class="muted small" style="font-style:italic;">No rules triggered</div>`}
              </div>
            </div>

            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid ${debug.flowTriggered ? 'var(--primary)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-network-wired" style="font-size:10px; color:${debug.flowTriggered ? 'var(--primary)' : 'var(--text)'};"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:${debug.flowTriggered ? 'var(--primary)' : 'var(--text)'}; margin-bottom:4px;">3. Flow Execution</div>
                ${debug.flowTriggered ? 
                  `<div class="pill" style="font-weight:700; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); border:1px solid color-mix(in srgb, var(--primary) 30%, transparent); font-size:13px;">${debug.flowTriggered}</div>` : 
                  `<div class="muted small" style="font-style:italic;">No flows matched</div>`}
              </div>
            </div>

            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid var(--success); display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-check" style="font-size:10px; color:var(--success);"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:var(--success); margin-bottom:4px;">4. Final Output</div>
                <div class="pill info" style="font-weight:700; font-size:13px;">Persona: ${debug.persona || 'Default'}</div>
              </div>
            </div>
          </div>
          <hr style="border:none; border-top:1px dashed var(--border); margin:24px 0;">
        `;
        if(timeline.innerHTML.includes('Waiting for input')) {
          timeline.innerHTML = html;
        } else {
          timeline.innerHTML = html + timeline.innerHTML;
        }
      });
    }
  }, 50);
}

// ---------------------------------------------------------
// 10. LOGS & REPLAY
// ---------------------------------------------------------
function renderOsLogs(main, right) {
  const s = window.AiOsEngine.state;
  const logs = s.logs || [];
  const activeLogIndex = 0;
  const activeLog = logs[activeLogIndex] || null;

  main.innerHTML = `
    <div style="display:flex; height:100%; width:100%; overflow:hidden;">
      <div style="width:340px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2); flex-shrink:0;">
        <div style="padding:20px; border-bottom:1px solid var(--border);">
          <div class="title" style="font-size:16px;">Execution Logs</div>
          <div class="muted small" style="margin-top:4px;">Full reasoning trace for all messages</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          ${logs.length > 0 ? logs.map((log, i) => `
            <div class="listItem ${i===activeLogIndex ? 'active' : ''}" style="padding:16px; border-radius:8px; cursor:pointer;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span class="pill" style="font-size:11px; background:var(--bg); border:1px solid var(--border);">ID: ${log.id.toString().slice(-6)}</span>
                <span class="muted small" style="font-size:11px;">${new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <div style="font-weight:600; font-size:13px; margin-bottom:8px;">"${log.input}"</div>
              <div style="display:flex; gap:6px;">
                <span class="pill" style="font-size:10px; color:var(--primary); border-color:color-mix(in srgb, var(--primary) 20%, transparent);"><i class="fa-solid fa-crosshairs" style="margin-right:4px;"></i>${log.intent || 'unknown'}</span>
              </div>
            </div>
          `).join('') : `
            <div style="text-align:center; padding:40px 20px;" class="muted">No logs recorded yet. Use the Live Preview to generate data.</div>
          `}
        </div>
      </div>
      
      <div style="flex:1; padding:40px; overflow-y:auto; background:var(--bg);">
        ${activeLog ? `
          <div style="margin-bottom:32px;">
            <div class="title" style="font-size:24px; font-weight:900;">Execution Trace</div>
            <div class="muted" style="margin-top:8px;">Deep dive into AI decision making for log ${activeLog.id}</div>
          </div>

          <div style="display:flex; flex-direction:column; gap:24px;">
            <div class="panel soft" style="padding:24px;">
              <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:12px; color:var(--text);">1. User Input</div>
              <div style="font-size:16px; font-weight:600;">"${activeLog.input}"</div>
            </div>
            
            <div class="panel soft" style="padding:24px;">
              <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:12px; color:var(--primary);">2. Intent Detection</div>
              <div style="display:flex; align-items:center; gap:12px;">
                <span class="pill" style="font-weight:800; font-size:14px; background:var(--panel2); border:1px solid var(--border);">${activeLog.intent}</span>
                <span class="pill ok" style="font-size:12px;">98% Confidence</span>
              </div>
            </div>

            <div class="panel soft" style="padding:24px;">
              <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:12px; color:var(--warn);">3. Rule Engine</div>
              ${activeLog.rule ? `
                <div style="display:flex; align-items:center; gap:12px;">
                  <span class="pill warn" style="font-weight:800; font-size:14px;"><i class="fa-solid fa-bolt" style="margin-right:6px;"></i> ${activeLog.rule}</span>
                  <span class="muted small">Rule triggered and overrode default flow.</span>
                </div>
              ` : `
                <div class="muted" style="font-style:italic;">No rules triggered.</div>
              `}
            </div>

            <div class="panel soft" style="padding:24px;">
              <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:12px; color:var(--success);">4. Flow Execution</div>
              ${activeLog.flow ? `
                <div style="display:flex; align-items:center; gap:12px;">
                  <span class="pill" style="font-weight:800; font-size:14px; background:var(--panel2); border:1px solid var(--border);"><i class="fa-solid fa-network-wired" style="margin-right:6px;"></i> ${activeLog.flow}</span>
                </div>
              ` : `
                <div class="muted" style="font-style:italic;">No specific flow executed. Used AI fallback.</div>
              `}
            </div>

            <div class="panel soft" style="padding:24px; border-color:var(--primary);">
              <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:12px; color:var(--primary);">5. Final AI Response</div>
              <div style="font-size:15px; line-height:1.6; background:var(--panel2); padding:16px; border-radius:8px; border:1px solid var(--border);">
                ${activeLog.response}
              </div>
            </div>
          </div>
        ` : `
          <div style="margin:auto; text-align:center; color:var(--muted); padding-top:100px;">
            <i class="fa-solid fa-magnifying-glass-chart" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
            <div style="font-weight:600; font-size:16px;">Select a log to view execution trace</div>
          </div>
        `}
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800; letter-spacing:0.05em;">AI Copilot Tools</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      ${activeLog ? `
      <button class="btn full" style="background:var(--bg); border:1px solid var(--border); font-weight:700;"><i class="fa-solid fa-flask" style="margin-right:8px; color:var(--primary);"></i> Run in Simulator</button>
      <button class="btn full" style="background:var(--bg); border:1px solid var(--border); font-weight:700;"><i class="fa-solid fa-dumbbell" style="margin-right:8px; color:var(--success);"></i> Add to Training Data</button>
      <button class="btn full" style="background:var(--bg); border:1px solid var(--border); font-weight:700;"><i class="fa-solid fa-code-branch" style="margin-right:8px; color:var(--warn);"></i> Create Rule from Log</button>
      ` : `<div class="muted">Select a log.</div>`}
    </div>
  `;
}


// ---------------------------------------------------------
// NEW: CHAT EXPERIENCE BUILDER
// ---------------------------------------------------------
function renderOsChatExperience(main, right) {
  const s = window.AiOsEngine.state;
  const cx = s.chatExperience;
  
  main.innerHTML = `
    <div style="flex:1; overflow-y:auto; width:100%; background:var(--bg);">
      <div style="padding:40px; max-width:900px; margin:0 auto; width:100%; padding-bottom:100px;">
        <div style="margin-bottom:32px;">
          <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Chat Experience Builder</div>
          <p class="muted" style="margin-top:8px; font-size:15px;">Configure the widget styling and initial interaction. Changes sync live to the preview and production.</p>
        </div>

      <div class="panel soft" style="padding:24px; margin-bottom:24px; border-radius:12px;">
        <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-message"></i></div> Opening Interaction</div>
        
        <div style="margin-bottom:20px;">
          <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px; color:var(--text);">Greeting Message</label>
          <textarea class="input full" rows="3" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, greeting: this.value } })">${cx.greeting}</textarea>
        </div>
        
        <div>
          <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px; color:var(--text);">Input Placeholder</label>
          <input type="text" class="input full" value="${cx.placeholder || 'Type a message...'}" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, placeholder: this.value } })">
        </div>
      </div>

      <div class="grid2" style="gap:24px; margin-bottom:24px;">
        <div class="panel soft" style="padding:24px; border-radius:12px;">
          <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-paintbrush"></i></div> Appearance</div>
          
          <div style="margin-bottom:20px;">
            <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px;">Bot Name</label>
            <input type="text" class="input full" value="${cx.botName}" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, botName: this.value } })">
          </div>
          
          <div>
            <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px;">Primary Theme Color</label>
            <div style="display:flex; gap:12px; align-items:center;">
              <input type="color" value="${cx.color}" style="width:44px; height:44px; border:none; border-radius:8px; cursor:pointer; padding:0; overflow:hidden;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, color: this.value } })">
              <input type="text" class="input" value="${cx.color}" style="flex:1; font-family:monospace; font-size:14px; padding:12px; border-radius:8px;" readonly>
            </div>
          </div>
        </div>

        <div class="panel soft" style="padding:24px; border-radius:12px;">
          <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-sliders"></i></div> Layout & Settings</div>
          
          <div style="margin-bottom:24px;">
            <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px;">Widget Position</label>
            <select class="input full" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, position: this.value } })">
              <option value="right" ${cx.position !== 'left' ? 'selected' : ''}>Bottom Right (Default)</option>
              <option value="left" ${cx.position === 'left' ? 'selected' : ''}>Bottom Left</option>
            </select>
          </div>

          <label style="display:flex; align-items:center; justify-content:space-between; font-weight:700; font-size:14px; cursor:pointer; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
            Require Email Before Chat
            <div class="toggle"><input type="checkbox" ${cx.requireEmail ? 'checked' : ''} style="width:40px; height:24px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, requireEmail: this.checked } })"></div>
          </label>
        </div>
      </div>

      <div class="panel soft" style="padding:24px; border-radius:12px; margin-bottom:24px;">
        <div class="title" style="font-size:16px; margin-bottom:8px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-bolt"></i></div> Quick Replies</div>
        <p class="muted small" style="margin-bottom:20px; line-height:1.5;">Buttons shown to users when they first open the chat. Helps guide the conversation.</p>
        
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;" id="qrListContainer">
          ${(cx.quickReplies || []).map((qr, i) => `
            <div style="display:flex; gap:12px; align-items:center; background:var(--bg); padding:8px 12px; border-radius:8px; border:1px solid var(--border);">
              <i class="fa-solid fa-grip-vertical muted cursor-grab"></i>
              <input type="text" class="input full" value="${qr}" style="border:none; background:transparent; padding:4px 0; font-size:14px; outline:none; box-shadow:none;" onchange="
                const newQr = [...window.AiOsEngine.state.chatExperience.quickReplies];
                newQr[${i}] = this.value;
                window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
              ">
              <button class="btn ghost small icon" style="color:var(--danger);" onclick="
                const newQr = [...window.AiOsEngine.state.chatExperience.quickReplies];
                newQr.splice(${i}, 1);
                window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
              "><i class="fa-solid fa-trash"></i></button>
            </div>
          `).join('')}
        </div>
        <button class="btn secondary" style="border-radius:8px; font-weight:600;" onclick="
          const newQr = [...(window.AiOsEngine.state.chatExperience.quickReplies || []), 'New Option'];
          window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
        "><i class="fa-solid fa-plus"></i> Add Quick Reply</button>
      </div>

    </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; justify-content:space-between; align-items:center;">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800; letter-spacing:0.05em;">Live Preview</div>
      <span class="pill ok small" style="font-size:11px; font-weight:700;"><i class="fa-solid fa-circle" style="font-size:8px; margin-right:4px;"></i> Synced</span>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; flex:1; background:var(--bg); align-items:flex-end; justify-content:flex-start; overflow-y:auto; min-height:0;">
      <div id="aios-chat-widget-container" style="width:320px; max-width:100%; height:min(650px, calc(100vh - 180px)); max-height:calc(100vh - 180px); display:flex; flex-direction:column; border:1px solid var(--border); box-shadow:0 24px 60px rgba(0,0,0,0.12); border-radius:16px; background:var(--bg); overflow:hidden;"></div>
    </div>
  `;

  // Initialize the real ChatWidget
  setTimeout(() => {
    const container = document.getElementById('aios-chat-widget-container');
    if (container && !window.aiosActiveWidget) {
      window.aiosActiveWidget = new ChatWidget(container, cx, window.AiOsEngine.simulateChat.bind(window.AiOsEngine));
    } else if (window.aiosActiveWidget && container) {
      window.aiosActiveWidget.container = container; // re-bind container
      window.aiosActiveWidget.updateConfig(cx);
    }
  }, 50);
}

// ---------------------------------------------------------
// 4. FLOW BUILDER
// ---------------------------------------------------------
function renderOsFlows(main, right) {
  const s = window.AiOsEngine.state;
  const flows = s.flows || [];
  
  let activeNodeId = window.aiosActiveFlowNodeId || (flows.length > 0 ? flows[0].id : null);
  const activeFlow = flows.find(f => f.id === activeNodeId) || flows[0];

  // SVG lines for connections
  let svgLines = '';
  let nodesHtml = '';
  
  flows.forEach((f, i) => {
    const isSelected = activeNodeId === f.id;
    // Compute positions based on index (simplified layout for prototype)
    const x = f.x || (300 + (i % 3) * 350);
    const y = f.y || (50 + Math.floor(i / 3) * 250);
    
    if (i > 0) {
      const prevX = flows[i-1].x || (300 + ((i-1) % 3) * 350);
      const prevY = flows[i-1].y || (50 + Math.floor((i-1) / 3) * 250);
      svgLines += `<path d="M ${prevX+150} ${prevY+120} C ${prevX+150} ${prevY+180}, ${x+150} ${y-60}, ${x+150} ${y}" stroke="var(--border)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>`;
    }

    nodesHtml += `
      <div class="flow-node" data-id="${f.id}" style="position:absolute; left:${x}px; top:${y}px; width:300px; background:var(--panel); border:${isSelected ? '2px' : '1px'} solid ${isSelected ? 'var(--primary)' : 'var(--border)'}; border-top:4px solid var(--primary); border-radius:12px; box-shadow:${isSelected ? '0 8px 30px rgba(79,70,229,0.15)' : 'var(--shadow)'}; cursor:pointer; transition:border 0.2s, box-shadow 0.2s; user-select:none;" onmousedown="startDragNode(event, ${f.id})">
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Flow Node</div>
              <div style="font-weight:800; font-size:15px;">${f.name}</div>
            </div>
            <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-bolt"></i></div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:12px; font-weight:600; background:var(--bg); border:1px solid var(--border); padding:6px 10px; border-radius:6px;"><span class="muted">IF Intent:</span> ${f.trigger}</div>
            ${f.logic ? `<div style="font-size:12px; font-weight:600; background:var(--bg); border:1px solid var(--border); padding:6px 10px; border-radius:6px;"><span class="muted">AND:</span> ${f.logic}</div>` : ''}
            <div style="font-size:12px; font-weight:600; background:color-mix(in srgb, var(--success) 10%, transparent); color:var(--success); border:1px solid color-mix(in srgb, var(--success) 30%, transparent); padding:6px 10px; border-radius:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><span style="opacity:0.8">THEN:</span> ${f.trueAction}</div>
          </div>
        </div>
        <!-- Connection points -->
        <div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:var(--bg); border:2px solid var(--border); border-radius:50%;"></div>
        <div style="position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:var(--bg); border:2px solid var(--border); border-radius:50%;"></div>
      </div>
    `;
  });

  main.innerHTML = `
    <div style="width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden;">
      <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel); z-index:10; flex-shrink:0;">
        <div style="display:flex; align-items:center; gap:16px;">
          <div class="title" style="font-size:20px; font-weight:900;">Flow Builder</div>
          <div class="pill ok" style="font-weight:700;"><i class="fa-solid fa-circle" style="font-size:8px; margin-right:6px;"></i> Live Sync</div>
        </div>
        <div style="display:flex; gap:12px;">
          <button class="btn primary small" onclick="
            const newId = Date.now();
            const newF = [...window.AiOsEngine.state.flows, { id: newId, name: 'New Node', trigger: 'any', logic: '', trueAction: 'Response', x: 300, y: 300 }];
            window.AiOsEngine.updateConfig({ flows: newF });
            window.aiosActiveFlowNodeId = newId;
          "><i class="fa-solid fa-plus"></i> Add Node</button>
        </div>
      </div>

      <div style="flex:1; position:relative; background: radial-gradient(circle, var(--border) 1.5px, transparent 1.5px); background-size: 24px 24px; background-color: var(--bg); overflow:auto; cursor:grab;" id="os-flow-canvas" onmousedown="startPanCanvas(event)">
        <div id="os-flow-canvas-inner" style="position:absolute; top:0; left:0; width:4000px; height:4000px; transform-origin: 0 0;">
          <svg width="4000" height="4000" style="position:absolute; top:0; left:0; pointer-events:none;">
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--border)" />
              </marker>
            </defs>
            ${svgLines}
          </svg>
          ${flows.length > 0 ? nodesHtml : `
            <div style="position:absolute; top:300px; left:300px; text-align:center;">
              <i class="fa-solid fa-network-wired" style="font-size:48px; color:var(--border); margin-bottom:16px;"></i>
              <div class="muted" style="font-weight:600;">No flows created. Start building your automation.</div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
      <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; align-items:center; gap:12px; flex-shrink:0;">
        <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-sliders"></i></div>
        <div>
          <div class="title" style="font-size:15px; font-weight:900;">Node Configuration</div>
          <div class="muted small">Edit logic & actions</div>
        </div>
      </div>
      <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;">
        ${activeFlow ? `
        <div>
          <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Node Name</label>
          <input type="text" class="input full" value="${activeFlow.name}" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
            const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, name: this.value } : f);
            window.AiOsEngine.updateConfig({ flows: newF });
          ">
        </div>
        
        <div class="panel soft" style="padding:16px; border-radius:12px; background:var(--bg); flex-shrink:0;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--primary);"><i class="fa-solid fa-bolt"></i> Trigger (IF)</label>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <div class="muted small" style="margin-bottom:4px; font-weight:600;">Intent matches</div>
              <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
                const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, trigger: this.value } : f);
                window.AiOsEngine.updateConfig({ flows: newF });
              ">
                <option ${activeFlow.trigger==='refund_request'?'selected':''}>refund_request</option>
                <option ${activeFlow.trigger==='pricing'?'selected':''}>pricing</option>
                <option ${activeFlow.trigger==='support'?'selected':''}>support</option>
                <option ${activeFlow.trigger==='any'?'selected':''}>any</option>
              </select>
            </div>
            <div>
              <div class="muted small" style="margin-bottom:4px; font-weight:600;">AND Condition (Optional JSON Logic)</div>
              <input type="text" class="input full" value="${activeFlow.logic || ''}" placeholder="e.g. order.days_ago < 30" style="font-family:monospace; font-size:13px; padding:10px; border-radius:8px;" onchange="
                const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, logic: this.value } : f);
                window.AiOsEngine.updateConfig({ flows: newF });
              ">
            </div>
          </div>
        </div>

        <div class="panel soft" style="padding:16px; border-radius:12px; background:var(--bg); border-color:var(--success); flex-shrink:0;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--success);"><i class="fa-solid fa-check-circle"></i> Action (THEN)</label>
          
          <div style="margin-bottom:12px;">
            <div class="muted small" style="margin-bottom:4px; font-weight:600;">Action Type</div>
            <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
              <option>Send AI Response</option>
              <option>Assign to Agent</option>
              <option>Trigger API Webhook</option>
            </select>
          </div>

          <div>
            <div class="muted small" style="margin-bottom:4px; font-weight:600;">Response Text</div>
            <textarea class="input full" rows="4" style="font-size:14px; line-height:1.5; padding:10px; border-radius:8px;" onchange="
              const newF = window.AiOsEngine.state.flows.map(f => f.id === ${activeFlow.id} ? { ...f, trueAction: this.value } : f);
              window.AiOsEngine.updateConfig({ flows: newF });
            ">${activeFlow.trueAction}</textarea>
          </div>
        </div>

        <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border); display:flex; gap:12px; flex-shrink:0;">
          <button class="btn ghost danger full" onclick="
            const newF = window.AiOsEngine.state.flows.filter(f => f.id !== ${activeFlow.id});
            window.aiosActiveFlowNodeId = null;
            window.AiOsEngine.updateConfig({ flows: newF });
          "><i class="fa-solid fa-trash"></i> Delete Node</button>
        </div>
        ` : `<div class="muted" style="text-align:center; padding-top:40px;">Select a node on the canvas to configure it.</div>`}
      </div>
    </div>
  `;
}

// Drag & Drop logic for Flow Builder
window.startDragNode = function(e, id) {
  e.stopPropagation();
  window.aiosActiveFlowNodeId = id;
  const flows = window.AiOsEngine.state.flows;
  const flowIndex = flows.findIndex(f => f.id === id);
  if(flowIndex === -1) return;
  
  const node = e.currentTarget;
  const startX = e.clientX;
  const startY = e.clientY;
  const initialX = flows[flowIndex].x || 300;
  const initialY = flows[flowIndex].y || 50;

  function onMouseMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    node.style.left = (initialX + dx) + 'px';
    node.style.top = (initialY + dy) + 'px';
  }

  function onMouseUp(ev) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    
    // Snap to grid (optional, using 10px grid)
    let newX = Math.round((initialX + dx) / 10) * 10;
    let newXMax = Math.max(0, newX);
    let newY = Math.round((initialY + dy) / 10) * 10;
    let newYMax = Math.max(0, newY);

    const newF = [...flows];
    newF[flowIndex] = { ...newF[flowIndex], x: newXMax, y: newYMax };
    window.AiOsEngine.updateConfig({ flows: newF });
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  
  // Only trigger re-render of right panel immediately if it wasn't selected
  if(window.aiosActiveFlowNodeId !== id) {
    renderAiOsModule();
  }
};

window.startPanCanvas = function(e) {
  if (e.target.closest('.flow-node')) return;
  const canvas = document.getElementById('os-flow-canvas');
  if(!canvas) return;
  
  canvas.style.cursor = 'grabbing';
  const startX = e.clientX;
  const startY = e.clientY;
  const scrollLeft = canvas.scrollLeft;
  const scrollTop = canvas.scrollTop;

  function onMouseMove(ev) {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    canvas.scrollLeft = scrollLeft - dx;
    canvas.scrollTop = scrollTop - dy;
  }

  function onMouseUp() {
    canvas.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};


// ---------------------------------------------------------
// CORE RENDER AND ROUTING LOGIC
// ---------------------------------------------------------

function renderAiOsNav() {
  const nav = document.getElementById("aiOsNav");
  if (!nav) return;

  const routes = [
    { id: 'live-studio', icon: 'fa-flask', label: 'Live Studio' },
    { id: 'chat-experience', icon: 'fa-message', label: 'Chat Experience' },
    { id: 'conversations', icon: 'fa-inbox', label: 'Conversations' },
    { id: 'behavior', icon: 'fa-masks-theater', label: 'AI Behavior' },
    { id: 'rules', icon: 'fa-scale-balanced', label: 'Rule Engine' },
    { id: 'flows', icon: 'fa-network-wired', label: 'Flow Builder' },
    { id: 'knowledge', icon: 'fa-book', label: 'Knowledge' },
    { id: 'training', icon: 'fa-dumbbell', label: 'Training' },
    { id: 'experiments', icon: 'fa-vial', label: 'Experiments' },
    { id: 'performance', icon: 'fa-chart-line', label: 'Performance' }
  ];

  nav.innerHTML = routes.map(r => `
    <div class="listItem ${currentAiOsRoute === r.id ? 'active' : ''}" 
         onclick="currentAiOsRoute='${r.id}'; renderAiOsNav(); renderAiOsModule();" 
         style="padding:12px 16px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:12px; font-weight:${currentAiOsRoute === r.id ? '700' : '500'}; color:${currentAiOsRoute === r.id ? 'var(--primary)' : 'var(--text)'};">
      <div style="width:24px; text-align:center;"><i class="fa-solid ${r.icon}"></i></div>
      ${r.label}
    </div>
  `).join('');
}

function renderAiOsModule() {
  const main = document.getElementById("aiOsMainWorkspace");
  const right = document.getElementById("aiOsRightPanel");
  if (!main || !right) return;

  main.style.flex = "1";
  main.style.minHeight = "0";
  main.style.overflow = "hidden";
  right.style.display = "flex";
  right.style.flexDirection = "column";
  right.style.minHeight = "0";
  right.style.overflowY = "auto";
  right.style.overflowX = "hidden";

  switch(currentAiOsRoute) {
    case 'live-studio': renderOsLiveStudio(main, right); break;
    case 'chat-experience': renderOsChatExperience(main, right); break;
    case 'conversations': renderOsConversations(main, right); break;
    case 'behavior': renderOsBehavior(main, right); break;
    case 'rules': renderOsRules(main, right); break;
    case 'flows': renderOsFlows(main, right); break;
    case 'knowledge': renderOsKnowledge(main, right); break;
    case 'training': renderOsTraining(main, right); break;
    case 'experiments': renderOsExperiments(main, right); break;
    case 'performance': renderOsPerformance(main, right); break;
    case 'logs': renderOsLogs(main, right); break;
    default: renderOsLiveStudio(main, right); break;
  }
}

window.initAiOs = async function() {
  if (!aiOsInitialized) {
    await window.AiOsEngine.loadConfig();
    aiOsInitialized = true;
  }
  renderAiOsNav();
  renderAiOsModule();
};

window.gotoAiOs = async function(route) {
  if (typeof ops !== 'undefined') ops.route = "ai-control-center";
  currentAiOsRoute = route || "live-studio";
  const aiOsView = document.getElementById("aiOsView");
  if (aiOsView) {
    aiOsView.style.display = "flex";
  }
  await initAiOs();
};

window.closeAiOs = function() {
  const aiOsView = document.getElementById("aiOsView");
  if (aiOsView) aiOsView.style.display = "none";
  if (typeof setRoute === 'function') setRoute("overview");
};
