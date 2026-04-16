const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update Flow Builder to be fully dynamic
const flowRegex = /function renderOsFlows[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newFlow = `function renderOsFlows(main, right) {
  const s = window.AiOsEngine.state;
  const flows = s.flows || [];
  
  // Render Dynamic Graph
  let nodesHtml = '';
  let activeNodeId = window.aiosActiveFlowNodeId || (flows.length > 0 ? flows[0].id : null);
  const activeFlow = flows.find(f => f.id === activeNodeId) || flows[0];

  flows.forEach((f, i) => {
    const isSelected = activeNodeId === f.id;
    nodesHtml += \`
      <div class="flow-node" style="position:relative; width:300px; background:var(--panel); border:\${isSelected ? '2px' : '1px'} solid \${isSelected ? 'var(--primary)' : 'var(--border)'}; border-top:4px solid var(--primary); border-radius:12px; box-shadow:var(--shadow); cursor:pointer; margin-bottom:24px; transition:all 0.2s;" onclick="window.aiosActiveFlowNodeId = \${f.id}; renderAiOsModule();">
        \${i > 0 ? '<div style="position:absolute; top:-24px; left:50%; width:2px; height:24px; background:var(--border);"></div>' : ''}
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Flow Node</div>
              <div style="font-weight:800; font-size:15px;">\${f.name}</div>
            </div>
            <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-code-branch"></i></div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div class="pill" style="font-weight:600; background:var(--bg); border:1px solid var(--border); width:100%; padding:8px;"><span class="muted small">Trigger:</span> \${f.trigger}</div>
            <div class="pill" style="font-weight:600; background:var(--bg); border:1px solid var(--border); width:100%; padding:8px;"><span class="muted small">Logic:</span> \${f.logic || 'None'}</div>
          </div>
        </div>
      </div>
    \`;
  });

  main.innerHTML = \`
    <div style="width:100%; height:100%; display:flex; flex-direction:column;">
      <div style="padding:24px 32px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
        <div class="title" style="font-size:24px; font-weight:900;">Flow Builder</div>
        <button class="btn primary" onclick="
          const newF = [...window.AiOsEngine.state.flows, { id: Date.now(), name: 'New Node', trigger: 'any', logic: '', trueAction: 'Response' }];
          window.AiOsEngine.updateConfig({ flows: newF });
          window.aiosActiveFlowNodeId = newF[newF.length-1].id;
        "><i class="fa-solid fa-plus"></i> Add Node</button>
      </div>

      <div style="flex:1; position:relative; background: radial-gradient(circle, var(--border) 1.5px, transparent 1.5px); background-size: 24px 24px; background-color: var(--bg); overflow:auto; display:flex; flex-direction:column; align-items:center; padding:40px;">
        \${flows.length > 0 ? nodesHtml : \`
          <div style="margin:auto; text-align:center;">
            <i class="fa-solid fa-network-wired" style="font-size:48px; color:var(--border); margin-bottom:16px;"></i>
            <div class="muted">No flows created. Click Add Node.</div>
          </div>
        \`}
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; align-items:center; gap:12px;">
      <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-sliders"></i></div>
      <div>
        <div class="title" style="font-size:15px; font-weight:900;">Node Settings</div>
        <div class="muted small">Configure logic & response</div>
      </div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;">
      \${activeFlow ? \`
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Node Name</label>
        <input type="text" class="input full" value="\${activeFlow.name}" onchange="
          const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, name: this.value } : f);
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Trigger Intent</label>
        <input type="text" class="input full" value="\${activeFlow.trigger}" onchange="
          const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, trigger: this.value } : f);
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>

      <div style="background:var(--panel2); padding:16px; border-radius:8px; border:1px solid var(--border);">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Condition Logic (IF)</label>
        <input type="text" class="input full" value="\${activeFlow.logic}" placeholder="e.g. order.days_ago < 30" style="font-family:monospace; font-size:13px;" onchange="
          const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, logic: this.value } : f);
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Action / AI Response (THEN)</label>
        <textarea class="input full" rows="4" style="font-size:14px; line-height:1.5;" onchange="
          const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, trueAction: this.value } : f);
          window.AiOsEngine.updateConfig({ flows: newF });
        ">\${activeFlow.trueAction}</textarea>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border); display:flex; gap:12px;">
        <button class="btn ghost danger full" onclick="
          const newF = window.AiOsEngine.state.flows.filter(f => f.id !== \${activeFlow.id});
          window.aiosActiveFlowNodeId = null;
          window.AiOsEngine.updateConfig({ flows: newF });
        "><i class="fa-solid fa-trash"></i> Delete Node</button>
      </div>
      \` : \`<div class="muted">Select a node to edit settings.</div>\`}
    </div>
  \`;
}
`;

if(content.match(flowRegex)) {
  content = content.replace(flowRegex, newFlow + '\n/* REPLACE END */\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Dynamic Flow Builder updated successfully.');
}
