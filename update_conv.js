const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update renderOsConversations to use real state (s.flows)
const convRegex = /function renderOsConversations[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newConv = `function renderOsConversations(main, right) {
  const s = window.AiOsEngine.state;
  const activeFlowIndex = 0; // In a full app, this would be selected via state
  const activeFlow = s.flows[activeFlowIndex] || { name: 'Default Flow', trigger: 'any', logic: '', trueAction: '', falseAction: '' };
  
  main.innerHTML = \`
    <div style="display:flex; height:100%; width:100%;">
      <div style="width:280px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <div class="title" style="font-size:14px;">Responses</div>
          <button class="btn ghost small icon" onclick="
            const newFlows = [...window.AiOsEngine.state.flows, { id: Date.now(), name: 'New Response', trigger: 'unknown', logic: '', trueAction: 'Custom text' }];
            window.AiOsEngine.updateConfig({ flows: newFlows });
          "><i class="fa-solid fa-plus"></i></button>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; flex:1;">
          \${s.flows.map((f, i) => \`
            <div class="listItem \${i === activeFlowIndex ? 'active' : ''}" style="padding:12px;" onclick="osToast('Conversations', 'Flow selection is mocked in this view')">
              <div style="font-weight:800; font-size:14px; margin-bottom:4px;">\${f.name}</div>
              <div class="muted small">\${f.trigger === 'any' ? 'First message' : 'Trigger: ' + f.trigger}</div>
            </div>
          \`).join('')}
        </div>
      </div>
      
      <div style="flex:1; padding:40px; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px;">
          <div>
            <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">\${activeFlow.name}</div>
            <p class="muted" style="margin-top:8px; font-size:15px;">Define how the AI responds when this context is triggered.</p>
          </div>
          <div class="toggle"><input type="checkbox" checked style="width:48px; height:28px;"></div>
        </div>
        
        <div class="panel soft" style="padding:24px; margin-bottom:32px;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em;">Trigger</label>
          <div style="display:flex; gap:10px; align-items:center;">
            <div class="pill" style="font-size:14px; padding:8px 16px; background:var(--bg); border:1px solid var(--border); font-weight:600;"><i class="fa-solid fa-message" style="margin-right:8px; color:var(--muted);"></i> \${activeFlow.trigger}</div>
            <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Condition</button>
          </div>
        </div>

        <div class="panel soft" style="padding:24px; margin-bottom:32px;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em;">AI Response Strategy</label>
          <textarea class="input full" rows="5" style="font-size:16px; line-height:1.6; padding:16px; border-radius:12px; background:var(--bg);" onchange="
            const newFlows = [...window.AiOsEngine.state.flows];
            if(newFlows[0]) newFlows[0].trueAction = this.value;
            window.AiOsEngine.updateConfig({ flows: newFlows });
          ">\${activeFlow.trueAction}</textarea>
        </div>
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Settings</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Priority Level</label>
        <select class="input full">
          <option>High (Overrides AI completely)</option>
          <option>Normal (AI can modify contextually)</option>
        </select>
        <div class="muted small" style="margin-top:8px; line-height:1.4;">High priority forces the AI to use your exact phrasing without variations.</div>
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Channel Specific</label>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" checked> Web Chat</label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" checked> Email</label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox"> SMS</label>
        </div>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border);">
        <button class="btn ghost danger full taLeft" onclick="
          const newFlows = [...window.AiOsEngine.state.flows];
          newFlows.shift();
          window.AiOsEngine.updateConfig({ flows: newFlows });
        "><i class="fa-solid fa-trash" style="margin-right:8px;"></i> Delete Response</button>
      </div>
    </div>
  \`;
}
`;

if(content.match(convRegex)) {
  content = content.replace(convRegex, newConv + '\n/* REPLACE END */\n');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Conversations updated successfully.');
