const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

const flowRegex = /function renderOsFlows[\s\S]*?main\.innerHTML = `[\s\S]*?`;\n\}/m;
const newFlow = `function renderOsFlows(main, right) {
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
      svgLines += \`<path d="M \${x+150} \${prevY} L \${x+150} \${y}" stroke="var(--border)" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>\`;
    }

    nodesHtml += \`
      <div class="flow-node" style="position:absolute; left:\${x}px; top:\${y}px; width:300px; background:var(--panel); border:\${isSelected ? '2px' : '1px'} solid \${isSelected ? 'var(--primary)' : 'var(--border)'}; border-top:4px solid var(--primary); border-radius:12px; box-shadow:\${isSelected ? '0 8px 30px rgba(79,70,229,0.15)' : 'var(--shadow)'}; cursor:pointer; transition:all 0.2s;" onclick="window.aiosActiveFlowNodeId = \${f.id}; renderAiOsModule();">
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Flow Node</div>
              <div style="font-weight:800; font-size:15px;">\${f.name}</div>
            </div>
            <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-bolt"></i></div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:12px; font-weight:600; background:var(--bg); border:1px solid var(--border); padding:6px 10px; border-radius:6px;"><span class="muted">IF Intent:</span> \${f.trigger}</div>
            \${f.logic ? \`<div style="font-size:12px; font-weight:600; background:var(--bg); border:1px solid var(--border); padding:6px 10px; border-radius:6px;"><span class="muted">AND:</span> \${f.logic}</div>\` : ''}
            <div style="font-size:12px; font-weight:600; background:color-mix(in srgb, var(--success) 10%, transparent); color:var(--success); border:1px solid color-mix(in srgb, var(--success) 30%, transparent); padding:6px 10px; border-radius:6px;"><span style="opacity:0.8">THEN:</span> \${f.trueAction.substring(0, 30)}\${f.trueAction.length > 30 ? '...' : ''}</div>
          </div>
        </div>
        <!-- Connection points -->
        <div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:var(--bg); border:2px solid var(--border); border-radius:50%;"></div>
        <div style="position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:12px; height:12px; background:var(--bg); border:2px solid var(--border); border-radius:50%;"></div>
      </div>
    \`;
  });

  main.innerHTML = \`
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
          \${svgLines}
        </svg>
        \${flows.length > 0 ? nodesHtml : \`
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center;">
            <i class="fa-solid fa-network-wired" style="font-size:48px; color:var(--border); margin-bottom:16px;"></i>
            <div class="muted" style="font-weight:600;">No flows created. Start building your automation.</div>
          </div>
        \`}
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; align-items:center; gap:12px;">
      <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-sliders"></i></div>
      <div>
        <div class="title" style="font-size:15px; font-weight:900;">Node Configuration</div>
        <div class="muted small">Edit logic & actions</div>
      </div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;">
      \${activeFlow ? \`
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Node Name</label>
        <input type="text" class="input full" value="\${activeFlow.name}" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
          const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, name: this.value } : f);
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>
      
      <div class="panel soft" style="padding:16px; border-radius:12px; background:var(--bg);">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--primary);"><i class="fa-solid fa-bolt"></i> Trigger (IF)</label>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <div class="muted small" style="margin-bottom:4px; font-weight:600;">Intent matches</div>
            <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
              const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, trigger: this.value } : f);
              window.AiOsEngine.updateConfig({ flows: newF });
            ">
              <option \${activeFlow.trigger==='refund_request'?'selected':''}>refund_request</option>
              <option \${activeFlow.trigger==='pricing'?'selected':''}>pricing</option>
              <option \${activeFlow.trigger==='support'?'selected':''}>support</option>
              <option \${activeFlow.trigger==='any'?'selected':''}>any</option>
            </select>
          </div>
          <div>
            <div class="muted small" style="margin-bottom:4px; font-weight:600;">AND Condition (Optional JSON Logic)</div>
            <input type="text" class="input full" value="\${activeFlow.logic || ''}" placeholder="e.g. order.days_ago < 30" style="font-family:monospace; font-size:13px; padding:10px; border-radius:8px;" onchange="
              const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, logic: this.value } : f);
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
            const newF = window.AiOsEngine.state.flows.map(f => f.id === \${activeFlow.id} ? { ...f, trueAction: this.value } : f);
            window.AiOsEngine.updateConfig({ flows: newF });
          ">\${activeFlow.trueAction}</textarea>
        </div>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border); display:flex; gap:12px;">
        <button class="btn ghost danger full" onclick="
          const newF = window.AiOsEngine.state.flows.filter(f => f.id !== \${activeFlow.id});
          window.aiosActiveFlowNodeId = null;
          window.AiOsEngine.updateConfig({ flows: newF });
        "><i class="fa-solid fa-trash"></i> Delete Node</button>
      </div>
      \` : \`<div class="muted" style="text-align:center; padding-top:40px;">Select a node on the canvas to configure it.</div>\`}
    </div>
  \`;
}
`;

if(content.match(flowRegex)) {
  content = content.replace(flowRegex, newFlow);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Flow Builder visually upgraded.');
}
