const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update ai_os.js to handle DOM updates efficiently (append instead of full render)
const inboxRegex = /function renderOsConversations[\s\S]*?<\/div>\n    <\/div>\n  \`;\n\n  setTimeout\(\(\) => \{[\s\S]*?\}\n\}/m;
const newInbox = `function renderOsConversations(main, right) {
  const s = window.AiOsEngine.state;
  const sessions = s.conversations || [];
  const logs = s.logs || [];
  const activeSessionId = window.aiosActiveSessionId || (sessions.length > 0 ? sessions[0].id : 'default');
  const activeSession = sessions.find(c => c.id === activeSessionId);
  const msgs = activeSession ? activeSession.messages : [];
  
  // Only re-render full layout if it doesn't exist to prevent scroll jumps
  if (!document.getElementById('os-inbox-msg-area')) {
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
          
          <div id="os-inbox-list" style="padding:12px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; flex:1;">
            <!-- list items injected here -->
          </div>
        </div>
        
        <!-- CHAT THREAD (Intercom Style) -->
        <div style="flex:1; display:flex; flex-direction:column; background:var(--bg);">
          <div id="os-inbox-header"></div>
          <div id="os-inbox-msg-area" style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
            <!-- messages injected here -->
          </div>
          <div id="os-inbox-footer"></div>
        </div>
      </div>
    \`;

    right.innerHTML = \`
      <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
        <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800; letter-spacing:0.05em;">AI Copilot Insights</div>
      </div>
      <div id="os-inbox-insights" style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;"></div>
    \`;
  }

  // Update list
  const listEl = document.getElementById('os-inbox-list');
  if (listEl) {
    listEl.innerHTML = sessions.length > 0 ? sessions.map((sess, i) => \`
      <div class="listItem \${sess.id === activeSessionId ? 'active' : ''}" style="padding:16px; border-radius:12px; cursor:pointer;" onclick="window.aiosActiveSessionId = '\${sess.id}'; renderAiOsModule();">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;">
            <div style="width:8px; height:8px; border-radius:50%; background:var(--primary);"></div>
            Visitor #\${sess.id.toString().slice(-4)}
          </div>
          <div class="muted small" style="font-size:11px;">Just now</div>
        </div>
        <div class="muted small" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;">
          \${sess.messages.length > 0 ? sess.messages[sess.messages.length-1].content : 'Started a chat'}
        </div>
      </div>
    \`).join('') : \`
      <div style="text-align:center; padding:40px 20px;" class="muted">
        <i class="fa-solid fa-inbox" style="font-size:32px; margin-bottom:12px; color:var(--border);"></i>
        <div>No conversations yet.</div>
      </div>
    \`;
  }

  if (activeSession) {
    document.getElementById('os-inbox-header').innerHTML = \`
      <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:40px; height:40px; border-radius:50%; background:var(--primary-fade); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:bold;">V</div>
          <div>
            <div style="font-weight:800; font-size:16px;">Visitor #\${activeSession.id.toString().slice(-4)}</div>
            <div class="muted small" style="display:flex; align-items:center; gap:6px;">
              <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--success);"></span> Online • \${activeSession.mode === 'HUMAN' ? 'Human Mode' : 'AI Mode'}
            </div>
          </div>
        </div>
        <div style="display:flex; gap:12px; align-items:center;">
          <div style="display:flex; align-items:center; background:var(--panel2); padding:4px; border-radius:8px; border:1px solid var(--border);">
            <button class="btn small \${activeSession.mode !== 'HUMAN' ? '' : 'ghost'}" style="\${activeSession.mode !== 'HUMAN' ? 'background:var(--bg); box-shadow:var(--shadow-sm); font-weight:700;' : ''}" onclick="window.AiOsEngine.setConversationMode('\${activeSession.id}', 'AI');"><i class="fa-solid fa-robot" style="color:\${activeSession.mode !== 'HUMAN' ? 'var(--primary)' : 'inherit'}; margin-right:6px;"></i> AI Handling</button>
            <button class="btn small \${activeSession.mode === 'HUMAN' ? '' : 'ghost'}" style="\${activeSession.mode === 'HUMAN' ? 'background:var(--bg); box-shadow:var(--shadow-sm); font-weight:700;' : ''}" onclick="window.AiOsEngine.setConversationMode('\${activeSession.id}', 'HUMAN'); osToast('Agent', 'Took over chat');"><i class="fa-solid fa-user" style="margin-right:6px;"></i> Takeover</button>
          </div>
        </div>
      </div>
    \`;

    const msgArea = document.getElementById('os-inbox-msg-area');
    // Only update if message count changed or different session to prevent scroll jumping
    if (msgArea.dataset.sessionId !== activeSession.id || msgArea.children.length !== msgs.length + 1) {
      msgArea.dataset.sessionId = activeSession.id;
      let msgHtml = \`
        <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:16px; border-bottom-left-radius:4px; max-width:70%; font-size:14px; line-height:1.5;">
          \${s.chatExperience.greeting}
        </div>
      \`;
      
      msgHtml += msgs.map(m => {
        const isUser = m.role === 'user';
        const isAgent = m.role === 'agent';
        return \`
          <div style="align-self:\${isUser ? 'flex-end' : 'flex-start'}; background:\${isUser ? 'var(--primary)' : (isAgent ? 'var(--panel2)' : 'var(--panel)')}; color:\${isUser ? '#fff' : 'var(--text)'}; padding:12px 16px; border-radius:16px; \${isUser ? 'border-bottom-right-radius:4px' : 'border-bottom-left-radius:4px'}; max-width:70%; font-size:14px; line-height:1.5; border:1px solid \${isAgent ? 'var(--primary)' : 'var(--border)'};">
            \${isAgent ? \`<div style="font-size:11px; font-weight:800; color:var(--primary); margin-bottom:4px; text-transform:uppercase;">Agent Reply</div>\` : ''}
            \${m.content}
          </div>
        \`;
      }).join('');
      
      msgArea.innerHTML = msgHtml;
      
      // Auto-scroll
      setTimeout(() => { msgArea.scrollTop = msgArea.scrollHeight; }, 10);
    }

    document.getElementById('os-inbox-footer').innerHTML = \`
      <div style="padding:16px 24px; border-top:1px solid var(--border); background:var(--panel);">
        <div style="display:flex; gap:12px; align-items:center; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:8px 12px;">
          <button class="btn ghost small icon" style="color:var(--muted);"><i class="fa-solid fa-paperclip"></i></button>
          <input type="text" id="os-inbox-input" class="input full" placeholder="Reply as Agent (Automatically switches to Human Mode)..." style="border:none; background:transparent; padding:4px 0; outline:none; box-shadow:none;" onkeypress="if(event.key === 'Enter') document.getElementById('os-inbox-send').click();">
          <button id="os-inbox-send" class="btn primary small round" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; padding:0;" onclick="
            const val = document.getElementById('os-inbox-input').value;
            if (val) {
              window.AiOsEngine.agentReply(val, '\${activeSession.id}');
              document.getElementById('os-inbox-input').value = '';
            }
          "><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    \`;

    document.getElementById('os-inbox-insights').innerHTML = \`
      <div class="panel soft" style="padding:16px; border-color:var(--primary); background:color-mix(in srgb, var(--primary) 2%, transparent);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; font-weight:800; color:var(--primary); font-size:13px; text-transform:uppercase;">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Summary
        </div>
        <p style="font-size:14px; line-height:1.6; margin:0;">
          User has sent <strong>\${msgs.filter(m=>m.role==='user').length}</strong> messages. Currently in <strong>\${activeSession.mode === 'HUMAN' ? 'Human' : 'AI'}</strong> mode.
        </p>
      </div>
    \`;
  } else {
    document.getElementById('os-inbox-header').innerHTML = '';
    document.getElementById('os-inbox-msg-area').innerHTML = \`
      <div style="margin:auto; text-align:center; color:var(--muted);">
        <i class="fa-solid fa-comments" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
        <div style="font-weight:600; font-size:16px;">Select a conversation</div>
      </div>
    \`;
    document.getElementById('os-inbox-footer').innerHTML = '';
    document.getElementById('os-inbox-insights').innerHTML = '<div class="muted">No data available.</div>';
  }
}`;

if(content.match(inboxRegex)) {
  content = content.replace(inboxRegex, newInbox);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Inbox rendering updated for stable scrolling.');
} else {
  console.log('Regex did not match in ai_os.js for inbox rendering');
}
