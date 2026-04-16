const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Ensure state has the new fields
const ensureStateScript = `
    chatExperience: { greeting: "Hi! I'm the AI assistant.", botName: "AI Support", color: "#4F46E5", quickReplies: ["Pricing", "Support"], position: "right", requireEmail: false, placeholder: "Type a message..." },
`;
content = content.replace(/chatExperience: \{.*?\}/, ensureStateScript.trim());

// Rewrite renderOsChatExperience completely
const chatExpRegex = /function renderOsChatExperience[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newChatExp = `function renderOsChatExperience(main, right) {
  const s = window.AiOsEngine.state;
  const cx = s.chatExperience;
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%; padding-bottom:100px;">
      <div style="margin-bottom:32px;">
        <div class="title" style="font-size:28px; font-weight:900;">Chat Experience Builder</div>
        <p class="muted" style="margin-top:8px;">Control the look, feel, and first impression of your AI widget.</p>
      </div>

      <div class="panel soft" style="padding:24px; margin-bottom:24px;">
        <div class="title" style="font-size:16px; margin-bottom:16px;"><i class="fa-solid fa-message" style="color:var(--primary); margin-right:8px;"></i> Opening Interaction</div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px;">Greeting Message</label>
        <textarea class="input full" rows="3" style="font-size:15px; padding:16px; margin-bottom:16px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, greeting: this.value } })">\${cx.greeting}</textarea>
        
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px;">Input Placeholder</label>
        <input type="text" class="input full" value="\${cx.placeholder || 'Type a message...'}" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, placeholder: this.value } })">
      </div>

      <div class="grid2" style="gap:24px; margin-bottom:24px;">
        <div class="panel soft" style="padding:24px;">
          <div class="title" style="font-size:16px; margin-bottom:16px;"><i class="fa-solid fa-paintbrush" style="color:var(--primary); margin-right:8px;"></i> Appearance</div>
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Bot Name</label>
          <input type="text" class="input full" value="\${cx.botName}" style="margin-bottom:16px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, botName: this.value } })">
          
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Primary Theme Color</label>
          <div style="display:flex; gap:12px; align-items:center;">
            <input type="color" value="\${cx.color}" style="width:40px; height:40px; border:none; border-radius:8px; cursor:pointer;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, color: this.value } })">
            <input type="text" class="input" value="\${cx.color}" style="flex:1; font-family:monospace;" readonly>
          </div>
        </div>

        <div class="panel soft" style="padding:24px;">
          <div class="title" style="font-size:16px; margin-bottom:16px;"><i class="fa-solid fa-sliders" style="color:var(--primary); margin-right:8px;"></i> Layout & Settings</div>
          
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Widget Position</label>
          <select class="input full" style="margin-bottom:20px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, position: this.value } })">
            <option value="right" \${cx.position !== 'left' ? 'selected' : ''}>Bottom Right (Default)</option>
            <option value="left" \${cx.position === 'left' ? 'selected' : ''}>Bottom Left</option>
          </select>

          <label style="display:flex; align-items:center; justify-content:space-between; font-weight:800; font-size:13px; cursor:pointer;">
            Require Email Before Chat
            <div class="toggle"><input type="checkbox" \${cx.requireEmail ? 'checked' : ''} style="width:40px; height:24px;" onchange="window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, requireEmail: this.checked } })"></div>
          </label>
        </div>
      </div>

      <div class="panel soft" style="padding:24px; margin-bottom:24px;">
        <div class="title" style="font-size:16px; margin-bottom:16px;"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Quick Replies</div>
        <p class="muted small" style="margin-bottom:16px;">Buttons shown to users when they first open the chat.</p>
        
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;" id="qrListContainer">
          \${(cx.quickReplies || []).map((qr, i) => \`
            <div style="display:flex; gap:8px; align-items:center;">
              <i class="fa-solid fa-grip-vertical muted cursor-pointer"></i>
              <input type="text" class="input full" value="\${qr}" onchange="
                const newQr = [...window.AiOsEngine.state.chatExperience.quickReplies];
                newQr[\${i}] = this.value;
                window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
              ">
              <button class="btn ghost small icon" onclick="
                const newQr = [...window.AiOsEngine.state.chatExperience.quickReplies];
                newQr.splice(\${i}, 1);
                window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
              "><i class="fa-solid fa-xmark"></i></button>
            </div>
          \`).join('')}
        </div>
        <button class="btn ghost small" onclick="
          const newQr = [...(window.AiOsEngine.state.chatExperience.quickReplies || []), 'New Option'];
          window.AiOsEngine.updateConfig({ chatExperience: { ...window.AiOsEngine.state.chatExperience, quickReplies: newQr } });
        "><i class="fa-solid fa-plus"></i> Add Quick Reply</button>
      </div>

    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; justify-content:space-between; align-items:center;">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Live Preview</div>
      <span class="pill ok small" style="font-size:11px;">\${cx.position === 'left' ? 'Left' : 'Right'}</span>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; height:100%; background:var(--bg); align-items:\${cx.position === 'left' ? 'flex-start' : 'flex-end'};">
      
      <!-- Mock Chat Widget -->
      <div style="flex:1; width:340px; background:var(--panel); border:1px solid var(--border); border-radius:16px; display:flex; flex-direction:column; overflow:hidden; box-shadow:var(--shadow);">
        <!-- Header -->
        <div style="background:\${cx.color}; color:#fff; padding:16px; display:flex; align-items:center; gap:12px; position:relative;">
          <div style="width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-robot"></i></div>
          <div>
            <div style="font-weight:800; font-size:15px;">\${cx.botName}</div>
            <div style="font-size:12px; opacity:0.8;"><span style="display:inline-block; width:8px; height:8px; background:#4ade80; border-radius:50%; margin-right:4px;"></span>Always online</div>
          </div>
          <button class="btn ghost small icon" style="position:absolute; right:12px; top:16px; color:#fff;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        
        \${cx.requireEmail ? \`
        <div style="padding:24px; text-align:center; background:var(--panel2); flex:1; display:flex; flex-direction:column; justify-content:center;">
           <i class="fa-solid fa-envelope" style="font-size:32px; color:var(--muted); margin-bottom:16px;"></i>
           <div style="font-weight:800; font-size:15px; margin-bottom:8px;">Welcome to \${cx.botName}</div>
           <p class="muted small" style="margin-bottom:16px;">Please enter your email to start the chat.</p>
           <input type="email" class="input full" placeholder="Email address..." style="margin-bottom:12px;">
           <button class="btn full" style="background:\${cx.color}; color:#fff; font-weight:700;">Start Chat</button>
        </div>
        \` : \`
        <!-- Messages -->
        <div id="previewChatArea" style="flex:1; padding:16px; background:var(--bg); display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:12px; border-bottom-left-radius:4px; max-width:85%; font-size:14px; line-height:1.5; box-shadow:var(--shadow-sm);">
            \${cx.greeting}
          </div>
          
          \${(cx.quickReplies || []).length > 0 ? \`
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
              \${cx.quickReplies.map(qr => \`<span class="pill cursor-pointer" style="background:var(--bg); border:1px solid \${cx.color}; color:\${cx.color}; font-weight:600; font-size:13px;" onclick="document.getElementById('previewInput').value='\${qr}'">\${qr}</span>\`).join('')}
            </div>
          \` : ''}
        </div>
        
        <!-- Input -->
        <div style="padding:12px; border-top:1px solid var(--border); background:var(--panel); display:flex; gap:8px; align-items:center;">
          <input type="text" id="previewInput" class="input full" placeholder="\${cx.placeholder || 'Type a message...'}" style="font-size:14px; border-radius:20px; background:var(--bg);">
          <button class="btn icon" style="background:\${cx.color}; color:#fff; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center;" onclick="osToast('Chat Preview', 'Testing real-time input...')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        \`}
      </div>
    </div>
  \`;
}
`;
if(content.match(chatExpRegex)) {
  content = content.replace(chatExpRegex, newChatExp + '\n/* REPLACE END */\n');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Chat Experience updated successfully.');
