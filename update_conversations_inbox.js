const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace renderOsConversations with a real inbox layout
const convRegex = /function renderOsConversations[\s\S]*?main\.innerHTML = `[\s\S]*?`;\n\}/m;
const newConv = `function renderOsConversations(main, right) {
  const s = window.AiOsEngine.state;
  const logs = s.logs || [];
  
  main.innerHTML = \`
    <div style="display:flex; height:100%; width:100%;">
      <!-- INBOX LIST -->
      <div style="width:340px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:16px 20px; border-bottom:1px solid var(--border); background:var(--panel);">
          <div style="font-weight:900; font-size:18px; margin-bottom:12px;">Inbox</div>
          <div style="display:flex; gap:8px;">
            <input type="text" class="input full smallInput" placeholder="Search conversations..." style="background:var(--bg);">
            <button class="btn ghost small icon"><i class="fa-solid fa-filter"></i></button>
          </div>
        </div>
        
        <div style="padding:12px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; flex:1;">
          \${logs.length > 0 ? logs.map((log, i) => \`
            <div class="listItem \${i===0 ? 'active' : ''}" style="padding:16px; border-radius:12px; cursor:pointer;" onclick="osToast('Inbox', 'Conversation loaded')">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;">
                  <div style="width:8px; height:8px; border-radius:50%; background:var(--primary);"></div>
                  Visitor #\${log.id.toString().slice(-4)}
                </div>
                <div class="muted small" style="font-size:11px;">Just now</div>
              </div>
              <div class="muted small" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;">
                \${log.input || 'Started a chat'}
              </div>
              <div style="display:flex; gap:6px; margin-top:10px;">
                <span class="pill" style="font-size:10px; padding:2px 6px; background:var(--bg); border:1px solid var(--border);">\${log.intent || 'support'}</span>
                \${log.rule ? \`<span class="pill warn" style="font-size:10px; padding:2px 6px;">Rule</span>\` : ''}
              </div>
            </div>
          \`).join('') : \`
            <div style="text-align:center; padding:40px 20px;" class="muted">
              <i class="fa-solid fa-inbox" style="font-size:32px; margin-bottom:12px; color:var(--border);"></i>
              <div>No conversations yet.</div>
            </div>
          \`}
        </div>
      </div>
      
      <!-- CHAT THREAD (Intercom Style) -->
      <div style="flex:1; display:flex; flex-direction:column; background:var(--bg);">
        \${logs.length > 0 ? \`
        <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:40px; height:40px; border-radius:50%; background:var(--primary-fade); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:bold;">V</div>
            <div>
              <div style="font-weight:800; font-size:16px;">Visitor #\${logs[0].id.toString().slice(-4)}</div>
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

        <div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; max-width:70%; font-size:14px; line-height:1.5;">
            \${s.chatExperience.greeting}
          </div>
          <div style="align-self:flex-end; background:var(--primary); color:#fff; padding:12px 16px; border-radius:16px; border-bottom-right-radius:4px; max-width:70%; font-size:14px; line-height:1.5;">
            \${logs[0].input}
          </div>
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; max-width:70%; font-size:14px; line-height:1.5;">
            \${logs[0].response}
          </div>
        </div>

        <div style="padding:16px 24px; border-top:1px solid var(--border); background:var(--panel);">
          <div style="display:flex; gap:12px; align-items:center; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 12px;">
            <button class="btn ghost small icon" style="color:var(--muted);"><i class="fa-solid fa-paperclip"></i></button>
            <input type="text" class="input full" placeholder="Reply as Agent..." style="border:none; background:transparent; padding:4px 0; outline:none; box-shadow:none;">
            <button class="btn primary small round" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; padding:0;" onclick="osToast('Agent', 'Message sent to user')"><i class="fa-solid fa-paper-plane"></i></button>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:8px;">
            <div class="muted small" style="display:flex; gap:12px;">
              <span class="cursor-pointer hover-text"><i class="fa-solid fa-note-sticky"></i> Internal Note</span>
              <span class="cursor-pointer hover-text"><i class="fa-solid fa-bolt"></i> Macros</span>
            </div>
            <div class="muted small">Press Enter to send</div>
          </div>
        </div>
        \` : \`
        <div style="margin:auto; text-align:center; color:var(--muted);">
          <i class="fa-solid fa-comments" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
          <div style="font-weight:600; font-size:16px;">Select a conversation</div>
        </div>
        \`}
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800; letter-spacing:0.05em;">AI Copilot Insights</div>
    </div>
    \${logs.length > 0 ? \`
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;">
      
      <div class="panel soft" style="padding:16px; border-color:var(--primary); background:color-mix(in srgb, var(--primary) 2%, transparent);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; font-weight:800; color:var(--primary); font-size:13px; text-transform:uppercase;">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Summary
        </div>
        <p style="font-size:14px; line-height:1.6; margin:0;">
          User inquired about <strong>\${logs[0].intent || 'support'}</strong>. The AI handled the request using the <strong>\${logs[0].flow || 'Default'}</strong> flow.
        </p>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Assigned To</label>
        <select class="input full" style="font-size:14px;">
          <option>AI Assistant (Active)</option>
          <option>Human Agent</option>
          <option>Sales Team</option>
        </select>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Conversation Tags</label>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <span class="pill" style="background:var(--bg); border:1px solid var(--border); font-weight:600; font-size:12px;">\${logs[0].intent || 'support'}</span>
          \${logs[0].rule ? \`<span class="pill warn" style="font-size:12px;">Escalated</span>\` : ''}
        </div>
        <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Tag</button>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">User Data</label>
        <div style="display:flex; flex-direction:column; gap:12px; font-size:14px;">
          <div style="display:flex; justify-content:space-between;"><span class="muted">Email</span> <span style="font-weight:600;">visitor@example.com</span></div>
          <div style="display:flex; justify-content:space-between;"><span class="muted">Location</span> <span style="font-weight:600;">Stockholm, SE</span></div>
          <div style="display:flex; justify-content:space-between;"><span class="muted">Device</span> <span style="font-weight:600;">Chrome / Mac OS</span></div>
        </div>
      </div>

    </div>
    \` : \`<div style="padding:24px;" class="muted">No data available.</div>\`}
  \`;
}
`;

if(content.match(convRegex)) {
  content = content.replace(convRegex, newConv);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Conversations updated to Inbox style.');
} else {
  console.log('Regex did not match.');
}
