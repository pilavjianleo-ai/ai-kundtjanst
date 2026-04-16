const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// 3. Chat Experience
const chatExpRegex = /function renderOsChatExperience[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newChatExp = `function renderOsChatExperience(main, right) {
  const s = window.AiOsEngine.state;
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%;">
      <div style="margin-bottom:32px;">
        <div class="title" style="font-size:28px; font-weight:900;">Chat Experience Builder</div>
        <p class="muted" style="margin-top:8px;">Control the look, feel, and first impression of your AI.</p>
      </div>

      <div class="panel soft" style="padding:24px; margin-bottom:24px;">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px; color:var(--primary);">Greeting Message</label>
        <textarea class="input full" rows="3" style="font-size:16px; padding:16px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, greeting: this.value } })">\${s.chatExperience.greeting}</textarea>
      </div>

      <div class="grid2" style="gap:24px; margin-bottom:24px;">
        <div class="panel soft" style="padding:24px;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px;">Bot Name</label>
          <input type="text" class="input full" value="\${s.chatExperience.botName}" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, botName: this.value } })">
        </div>
        <div class="panel soft" style="padding:24px;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px;">Primary Color</label>
          <div style="display:flex; gap:12px; align-items:center;">
            <input type="color" value="\${s.chatExperience.color}" style="width:40px; height:40px; border:none; border-radius:8px; cursor:pointer;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, color: this.value } })">
            <input type="text" class="input" value="\${s.chatExperience.color}" style="flex:1; font-family:monospace;" readonly>
          </div>
        </div>
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Live Preview</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; height:100%; background:var(--bg);">
      
      <!-- Mock Chat Widget -->
      <div style="flex:1; background:var(--panel); border:1px solid var(--border); border-radius:16px; display:flex; flex-direction:column; overflow:hidden; box-shadow:var(--shadow);">
        <!-- Header -->
        <div style="background:\${s.chatExperience.color}; color:#fff; padding:16px; display:flex; align-items:center; gap:12px;">
          <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-robot"></i></div>
          <div>
            <div style="font-weight:800; font-size:15px;">\${s.chatExperience.botName}</div>
            <div style="font-size:12px; opacity:0.8;">Always online</div>
          </div>
        </div>
        <!-- Messages -->
        <div style="flex:1; padding:16px; background:var(--bg); display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5;">
            \${s.chatExperience.greeting}
          </div>
        </div>
        <!-- Input -->
        <div style="padding:12px; border-top:1px solid var(--border); background:var(--panel); display:flex; gap:8px;">
          <input type="text" class="input full" placeholder="Type a message..." style="font-size:14px; border-radius:20px;" readonly>
          <button class="btn icon" style="background:\${s.chatExperience.color}; color:#fff; border-radius:50%;"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>
  \`;
}
`;
if(content.match(chatExpRegex)) {
  content = content.replace(chatExpRegex, newChatExp + '\n/* REPLACE END */\n');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('AI OS frontend Chat Experience injected successfully.');
