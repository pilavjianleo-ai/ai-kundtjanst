const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update Flow Builder to interact with AiOsEngine.state.flows
const flowRegex = /function renderOsFlowBuilder[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newFlow = `function renderOsFlowBuilder(main, right) {
  const s = window.AiOsEngine.state;
  const flows = s.flows || [];
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:1200px; margin:0 auto; width:100%; display:flex; flex-direction:column; height:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Flow Builder</div>
          <p class="muted" style="margin-top:8px;">Design conversational paths and connect external logic.</p>
        </div>
        <button class="btn primary" onclick="osToast('Flows', 'New flow created')"><i class="fa-solid fa-plus"></i> New Flow</button>
      </div>

      <div style="flex:1; background:var(--panel2); border:1px solid var(--border); border-radius:16px; overflow:hidden; position:relative; box-shadow:inset 0 4px 20px rgba(0,0,0,0.05); background-image:radial-gradient(var(--border) 1px, transparent 1px); background-size:20px 20px;">
        
        <!-- Draggable Nodes (simulated visual for now, connected to first flow) -->
        \${flows.length > 0 ? \`
        <div class="panel soft" style="position:absolute; top:40px; left:50%; transform:translateX(-50%); width:300px; padding:16px; border-top:4px solid var(--primary); cursor:move; box-shadow:0 8px 30px rgba(0,0,0,0.1);" onmousedown="osToast('Drag', 'Drag to reposition node')">
          <div style="font-size:12px; font-weight:800; color:var(--primary); text-transform:uppercase; margin-bottom:8px;">Trigger</div>
          <div style="font-weight:700;">Intent: \${flows[0].trigger}</div>
        </div>

        <div style="position:absolute; top:130px; left:50%; width:2px; height:40px; background:var(--border);"></div>

        <div class="panel soft" style="position:absolute; top:170px; left:50%; transform:translateX(-50%); width:300px; padding:16px; border-top:4px solid var(--warn); cursor:move; box-shadow:0 8px 30px rgba(0,0,0,0.1);">
          <div style="font-size:12px; font-weight:800; color:var(--warn); text-transform:uppercase; margin-bottom:8px;">Condition</div>
          <div style="font-weight:700;">IF \${flows[0].logic}</div>
        </div>

        <div style="position:absolute; top:250px; left:50%; width:2px; height:40px; background:var(--border);"></div>

        <div class="panel soft" style="position:absolute; top:290px; left:50%; transform:translateX(-50%); width:300px; padding:16px; border-top:4px solid var(--success); cursor:move; box-shadow:0 8px 30px rgba(0,0,0,0.1);">
          <div style="font-size:12px; font-weight:800; color:var(--success); text-transform:uppercase; margin-bottom:8px;">Action (True)</div>
          <div style="font-weight:700;">\${flows[0].trueAction}</div>
        </div>
        \` : \`
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center;">
          <i class="fa-solid fa-network-wired" style="font-size:48px; color:var(--border); margin-bottom:16px;"></i>
          <div class="muted">No flows created. Click New Flow.</div>
        </div>
        \`}
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Node Settings</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      \${flows.length > 0 ? \`
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Flow Name</label>
        <input type="text" class="input full" value="\${flows[0].name}" onchange="
          const newF = [...window.AiOsEngine.state.flows];
          newF[0].name = this.value;
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Trigger Intent</label>
        <select class="input full" onchange="
          const newF = [...window.AiOsEngine.state.flows];
          newF[0].trigger = this.value;
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
          <option \${flows[0].trigger==='refund_request'?'selected':''}>refund_request</option>
          <option \${flows[0].trigger==='pricing'?'selected':''}>pricing</option>
          <option \${flows[0].trigger==='support'?'selected':''}>support</option>
        </select>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Condition Logic (IF)</label>
        <input type="text" class="input full" value="\${flows[0].logic}" style="font-family:monospace;" onchange="
          const newF = [...window.AiOsEngine.state.flows];
          newF[0].logic = this.value;
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Action (True)</label>
        <input type="text" class="input full" value="\${flows[0].trueAction}" onchange="
          const newF = [...window.AiOsEngine.state.flows];
          newF[0].trueAction = this.value;
          window.AiOsEngine.updateConfig({ flows: newF });
        ">
      </div>
      \` : \`<div class="muted">Select a node to edit settings.</div>\`}
    </div>
  \`;
}
`;

if(content.match(flowRegex)) {
  content = content.replace(flowRegex, newFlow + '\n/* REPLACE END */\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Flow Builder updated successfully.');
}
