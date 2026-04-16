const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

const chatWidgetCode = `
// ---------------------------------------------------------
// REAL CHAT WIDGET COMPONENT
// ---------------------------------------------------------
class ChatWidget {
  constructor(container, config, simulateChatFn) {
    this.container = container;
    this.config = config;
    this.simulateChatFn = simulateChatFn;
    this.messages = [];
    if (this.config.greeting) {
      this.messages.push({ role: 'assistant', content: this.config.greeting });
    }
    this.render();
  }

  updateConfig(newConfig) {
    const oldGreeting = this.config.greeting;
    this.config = { ...this.config, ...newConfig };
    
    // Update greeting if it changed and it's the first message
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
    } catch (e) {
      this.isTyping = false;
      this.messages.push({ role: 'assistant', content: 'An error occurred.' });
    }
    this.render();
  }

  render() {
    const c = this.config;
    
    let html = \`
      <div style="flex:1; width:340px; background:var(--panel); border:1px solid var(--border); border-radius:16px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,0.15); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <!-- Header -->
        <div style="background:\${c.color}; color:#fff; padding:16px 20px; display:flex; align-items:center; gap:12px; position:relative;">
          <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.1);"><i class="fa-solid fa-robot"></i></div>
          <div>
            <div style="font-weight:700; font-size:16px; line-height:1.2;">\${c.botName}</div>
            <div style="font-size:12px; opacity:0.9; margin-top:2px; display:flex; align-items:center;"><span style="display:inline-block; width:8px; height:8px; background:#4ade80; border-radius:50%; margin-right:6px; box-shadow:0 0 0 2px rgba(74, 222, 128, 0.3);"></span>We reply instantly</div>
          </div>
          <button class="btn ghost small icon" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); color:#fff; opacity:0.8;"><i class="fa-solid fa-xmark"></i></button>
        </div>
    \`;

    if (c.requireEmail && this.messages.length <= 1) {
      html += \`
        <div style="padding:32px 24px; text-align:center; background:var(--panel2); flex:1; display:flex; flex-direction:column; justify-content:center;">
           <i class="fa-solid fa-envelope" style="font-size:32px; color:var(--muted); margin-bottom:16px;"></i>
           <div style="font-weight:800; font-size:16px; margin-bottom:8px;">Welcome to \${c.botName}</div>
           <p class="muted small" style="margin-bottom:24px; line-height:1.5;">Please enter your email to start the conversation. We'll only use it to reply if you leave.</p>
           <input type="email" class="input full" placeholder="Email address..." style="margin-bottom:12px; padding:12px; border-radius:8px;">
           <button class="btn full" style="background:\${c.color}; color:#fff; font-weight:700; padding:12px; border-radius:8px;" onclick="osToast('Chat', 'Email submitted (Mock)')">Start Chat</button>
        </div>
      \`;
    } else {
      html += \`
        <!-- Messages Area -->
        <div id="cw-msg-area" style="flex:1; padding:20px 16px; background:var(--bg); display:flex; flex-direction:column; gap:16px; overflow-y:auto;">
          \${this.messages.map(m => {
            if (m.role === 'assistant') {
              return \`<div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; max-width:85%; font-size:14px; line-height:1.5; box-shadow:0 2px 8px rgba(0,0,0,0.02); color:var(--text);">\${m.content}</div>\`;
            } else {
              return \`<div style="align-self:flex-end; background:\${c.color}; color:#fff; padding:12px 16px; border-radius:16px; border-bottom-right-radius:4px; max-width:85%; font-size:14px; line-height:1.5; box-shadow:0 2px 8px rgba(0,0,0,0.05);">\${m.content}</div>\`;
            }
          }).join('')}
          
          \${this.isTyping ? \`<div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; font-size:14px; color:var(--muted); display:flex; gap:4px; align-items:center;"><span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span></div>\` : ''}

          \${(!this.isTyping && this.messages.length === 1 && c.quickReplies && c.quickReplies.length > 0) ? \`
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;">
              \${c.quickReplies.map(qr => \`<button class="cw-qr-btn" style="background:var(--panel); border:1px solid \${c.color}; color:\${c.color}; font-weight:600; font-size:13px; padding:8px 16px; border-radius:20px; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='\${c.color}'; this.style.color='#fff';" onmouseout="this.style.background='var(--panel)'; this.style.color='\${c.color}';">\${qr}</button>\`).join('')}
            </div>
          \` : ''}
        </div>
        
        <!-- Input Area -->
        <div style="padding:16px; border-top:1px solid var(--border); background:var(--panel); display:flex; gap:12px; align-items:center;">
          <input type="text" id="cw-input" class="input full" placeholder="\${c.placeholder || 'Type a message...'}" style="font-size:14px; border-radius:24px; background:var(--bg); padding:12px 16px; border:1px solid var(--border);">
          <button id="cw-send" class="btn icon" style="background:\${c.color}; color:#fff; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:transform 0.1s;"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      \`;
    }

    html += \`</div>\`;
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
    if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
  }
}
`;

const chatExpRegex = /function renderOsChatExperience[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newChatExp = `function renderOsChatExperience(main, right) {
  const s = window.AiOsEngine.state;
  const cx = s.chatExperience;
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%; padding-bottom:100px;">
      <div style="margin-bottom:32px;">
        <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Chat Experience Builder</div>
        <p class="muted" style="margin-top:8px; font-size:15px;">Configure the widget styling and initial interaction. Changes sync live to the preview and production.</p>
      </div>

      <div class="panel soft" style="padding:24px; margin-bottom:24px; border-radius:12px;">
        <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-message"></i></div> Opening Interaction</div>
        
        <div style="margin-bottom:20px;">
          <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px; color:var(--text);">Greeting Message</label>
          <textarea class="input full" rows="3" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, greeting: this.value } })">\${cx.greeting}</textarea>
        </div>
        
        <div>
          <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px; color:var(--text);">Input Placeholder</label>
          <input type="text" class="input full" value="\${cx.placeholder || 'Type a message...'}" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, placeholder: this.value } })">
        </div>
      </div>

      <div class="grid2" style="gap:24px; margin-bottom:24px;">
        <div class="panel soft" style="padding:24px; border-radius:12px;">
          <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-paintbrush"></i></div> Appearance</div>
          
          <div style="margin-bottom:20px;">
            <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px;">Bot Name</label>
            <input type="text" class="input full" value="\${cx.botName}" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, botName: this.value } })">
          </div>
          
          <div>
            <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px;">Primary Theme Color</label>
            <div style="display:flex; gap:12px; align-items:center;">
              <input type="color" value="\${cx.color}" style="width:44px; height:44px; border:none; border-radius:8px; cursor:pointer; padding:0; overflow:hidden;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, color: this.value } })">
              <input type="text" class="input" value="\${cx.color}" style="flex:1; font-family:monospace; font-size:14px; padding:12px; border-radius:8px;" readonly>
            </div>
          </div>
        </div>

        <div class="panel soft" style="padding:24px; border-radius:12px;">
          <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-sliders"></i></div> Layout & Settings</div>
          
          <div style="margin-bottom:24px;">
            <label style="font-weight:700; display:block; margin-bottom:8px; font-size:13px;">Widget Position</label>
            <select class="input full" style="font-size:14px; padding:12px; border-radius:8px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, position: this.value } })">
              <option value="right" \${cx.position !== 'left' ? 'selected' : ''}>Bottom Right (Default)</option>
              <option value="left" \${cx.position === 'left' ? 'selected' : ''}>Bottom Left</option>
            </select>
          </div>

          <label style="display:flex; align-items:center; justify-content:space-between; font-weight:700; font-size:14px; cursor:pointer; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
            Require Email Before Chat
            <div class="toggle"><input type="checkbox" \${cx.requireEmail ? 'checked' : ''} style="width:40px; height:24px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, requireEmail: this.checked } })"></div>
          </label>
        </div>
      </div>

      <div class="panel soft" style="padding:24px; border-radius:12px; margin-bottom:24px;">
        <div class="title" style="font-size:16px; margin-bottom:8px; display:flex; align-items:center;"><div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-bolt"></i></div> Quick Replies</div>
        <p class="muted small" style="margin-bottom:20px; line-height:1.5;">Buttons shown to users when they first open the chat. Helps guide the conversation.</p>
        
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;" id="qrListContainer">
          \${(cx.quickReplies || []).map((qr, i) => \`
            <div style="display:flex; gap:12px; align-items:center; background:var(--bg); padding:8px 12px; border-radius:8px; border:1px solid var(--border);">
              <i class="fa-solid fa-grip-vertical muted cursor-grab"></i>
              <input type="text" class="input full" value="\${qr}" style="border:none; background:transparent; padding:4px 0; font-size:14px; outline:none; box-shadow:none;" onchange="
                const newQr = [...window.AiOsEngine.state.chatExperience.quickReplies];
                newQr[\${i}] = this.value;
                window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
              ">
              <button class="btn ghost small icon" style="color:var(--danger);" onclick="
                const newQr = [...window.AiOsEngine.state.chatExperience.quickReplies];
                newQr.splice(\${i}, 1);
                window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
              "><i class="fa-solid fa-trash"></i></button>
            </div>
          \`).join('')}
        </div>
        <button class="btn secondary" style="border-radius:8px; font-weight:600;" onclick="
          const newQr = [...(window.AiOsEngine.state.chatExperience.quickReplies || []), 'New Option'];
          window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
        "><i class="fa-solid fa-plus"></i> Add Quick Reply</button>
      </div>

    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; justify-content:space-between; align-items:center;">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800; letter-spacing:0.05em;">Live Preview</div>
      <span class="pill ok small" style="font-size:11px; font-weight:700;"><i class="fa-solid fa-circle" style="font-size:8px; margin-right:4px;"></i> Synced</span>
    </div>
    <div style="padding:32px; display:flex; flex-direction:column; height:100%; background:var(--bg); align-items:\${cx.position === 'left' ? 'flex-start' : 'flex-end'}; position:relative;">
      
      <div id="aios-chat-widget-container" style="height:100%; display:flex; flex-direction:column;"></div>

    </div>
  \`;

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
`;

if(!content.includes('class ChatWidget')) {
  content = content.replace('// ---------------------------------------------------------', chatWidgetCode + '\n// ---------------------------------------------------------');
}
content = content.replace(chatExpRegex, newChatExp + '\n/* REPLACE END */\n');

// Also update the notify function to push config to the widget if it exists
const notifyRegex = /notify\(\) \{[\s\S]*?\}/m;
const newNotify = `notify() {
    this.listeners.forEach(fn => fn());
    if (aiOsInitialized) renderAiOsModule();
    if (window.aiosActiveWidget) {
      window.aiosActiveWidget.updateConfig(this.state.chatExperience);
    }
  }`;
content = content.replace(notifyRegex, newNotify);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Real ChatWidget injected and connected.');
