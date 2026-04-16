const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace ChatWidget class
const chatWidgetRegex = /class ChatWidget \{[\s\S]*?\}\n\}\n/m;
const newChatWidget = `class ChatWidget {
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
    let html = \`
      <div style="display:flex; flex-direction:column; height:100%; width:100%; background:var(--bg); border-radius:\${this.isPreview ? '12px' : '0'}; overflow:hidden; border:\${this.isPreview ? '1px solid var(--border)' : 'none'}; box-shadow:\${this.isPreview ? 'var(--shadow)' : 'none'};">
        
        <!-- TOPBAR -->
        <div class="topbar" style="background:\${c.color}; color:#fff; border:none; display:flex; align-items:center; padding:16px; min-height:64px; flex-shrink:0;">
          <div style="display: flex; align-items: center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
              <i class="fa-solid fa-robot"></i>
            </div>
            <div>
              <div class="title" style="color:#fff; font-size:16px; margin:0;">\${c.botName}</div>
              <div class="subtitle" style="color:rgba(255,255,255,0.9); margin:0; font-size:13px; display:flex; align-items:center; gap:6px;">
                <span style="display:inline-block; width:8px; height:8px; background:#4ade80; border-radius:50%;"></span> Vi svarar direkt
              </div>
            </div>
          </div>
          <div class="topbarActions" style="margin-left:auto;">
            \${!this.isPreview ? \`<button class="btn ghost small" style="color:#fff;"><i class="fa-solid fa-trash"></i></button>\` : ''}
          </div>
        </div>

        <!-- MESSAGES -->
        <div class="messages" id="cw-msg-area" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px; background:var(--bg);">
          \${this.messages.map(m => {
            const isUser = m.role === 'user';
            return \`
              <div class="msg \${isUser ? 'user' : 'ai'}" style="display:flex; gap:12px; align-items:flex-end; align-self:\${isUser ? 'flex-end' : 'flex-start'}; max-width:85%;">
                \${!isUser ? \`<div class="avatar" style="width:28px; height:28px; border-radius:50%; background:var(--panel2); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa-solid fa-robot" style="color:\${c.color}"></i></div>\` : ''}
                <div style="display:flex; flex-direction:column; align-items:\${isUser ? 'flex-end' : 'flex-start'}; gap:4px;">
                  <div class="bubble" style="background:\${isUser ? c.color : 'var(--panel)'}; color:\${isUser ? '#fff' : 'var(--text)'}; padding:12px 16px; border-radius:16px; \${isUser ? 'border-bottom-right-radius:4px;' : 'border-bottom-left-radius:4px; border:1px solid var(--border);'} font-size:14px; line-height:1.5; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                    \${m.content}
                  </div>
                </div>
              </div>
            \`;
          }).join('')}

          \${this.isTyping ? \`
            <div class="msg ai" style="display:flex; gap:12px; align-items:flex-end; align-self:flex-start;">
              <div class="avatar" style="width:28px; height:28px; border-radius:50%; background:var(--panel2); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa-solid fa-robot" style="color:\${c.color}"></i></div>
              <div class="bubble" style="background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; display:flex; gap:4px;">
                <span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span>
              </div>
            </div>
          \` : ''}
        </div>

        <!-- QUICK REPLIES (SUGGESTIONS) -->
        \${(!this.isTyping && this.messages.length === 1 && c.quickReplies && c.quickReplies.length > 0) ? \`
          <div class="suggestions" style="padding:0 20px 16px 20px; display:flex; flex-wrap:wrap; gap:8px;">
            \${c.quickReplies.map(qr => \`<button class="cw-qr-btn btn ghost small" style="border:1px solid \${c.color}; color:\${c.color}; border-radius:20px; padding:6px 14px;">\${qr}</button>\`).join('')}
          </div>
        \` : ''}

        <!-- COMPOSER -->
        <div class="composer" style="padding:16px 20px; border-top:1px solid var(--border); background:var(--panel); display:flex; gap:12px; align-items:center;">
          <input id="cw-input" class="input" placeholder="\${c.placeholder || 'Skriv ditt meddelande...'}" style="flex:1; border-radius:24px; padding:12px 16px; background:var(--bg); border:1px solid var(--border); font-size:14px;" autocomplete="off">
          <button id="cw-send" class="btn primary round" style="background:\${c.color}; border-color:\${c.color}; color:#fff; width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        
      </div>
    \`;

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
`;

content = content.replace(chatWidgetRegex, newChatWidget);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('ChatWidget unified to match exact app style.');
