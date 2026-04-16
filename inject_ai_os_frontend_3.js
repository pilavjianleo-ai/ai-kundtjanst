const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// 4. Rule Engine
const rulesRegex = /function renderOsRules[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newRules = `function renderOsRules(main, right) {
  const s = window.AiOsEngine.state;
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Rule Engine</div>
          <p class="muted" style="margin-top:8px;">Global IF/THEN rules that override standard AI behavior.</p>
        </div>
        <button class="btn primary" onclick="osToast('Rules', 'New rule creation initialized')"><i class="fa-solid fa-plus"></i> Create Rule</button>
      </div>

      <div class="panel soft" style="overflow:hidden;">
        \${s.rules.map((r, index) => \`
          <div style="padding:24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:\${r.active ? 'var(--panel2)' : 'transparent'};">
            <div>
              <div class="title" style="font-size:16px; margin-bottom:8px;">\${r.name}</div>
              <div style="font-family:monospace; font-size:14px; background:var(--bg); padding:12px 16px; border-radius:8px; border:1px solid var(--border); color:var(--text); display:inline-block;">
                <span style="color:var(--primary); font-weight:800;">IF</span> intent = \${r.intent} <span style="color:var(--primary); font-weight:800;">AND</span> sentiment = \${r.sentiment} <br>
                <span style="color:var(--warn); font-weight:800; margin-top:8px; display:inline-block;">THEN</span> \${r.action}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:16px;">
              <div class="toggle"><input type="checkbox" \${r.active ? 'checked' : ''} style="width:48px; height:28px;" onchange="
                const newRules = [...window.AiOsEngine.state.rules];
                newRules[\${index}].active = this.checked;
                window.AiOsEngine.updateConfig({ rules: newRules });
              "></div>
            </div>
          </div>
        \`).join('')}
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Rule Editor</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      \${s.rules.length > 0 ? \`
        <div>
          <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Rule Name</label>
          <input type="text" class="input full" value="\${s.rules[0].name}" onchange="
            const newRules = [...window.AiOsEngine.state.rules];
            newRules[0].name = this.value;
            window.AiOsEngine.updateConfig({ rules: newRules });
          ">
        </div>
        
        <div style="padding:16px; background:var(--panel2); border:1px solid var(--border); border-radius:8px;">
          <label style="font-weight:900; display:block; margin-bottom:12px; font-size:14px; color:var(--primary);">IF (Conditions)</label>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <select class="input"><option>Intent</option></select>
            <select class="input"><option>Equals</option></select>
            <select class="input" style="flex:1;" onchange="
              const newRules = [...window.AiOsEngine.state.rules];
              newRules[0].intent = this.value;
              window.AiOsEngine.updateConfig({ rules: newRules });
            ">
              <option value="pricing" \${s.rules[0].intent === 'pricing' ? 'selected' : ''}>pricing</option>
              <option value="refund_request" \${s.rules[0].intent === 'refund_request' ? 'selected' : ''}>refund_request</option>
              <option value="support" \${s.rules[0].intent === 'support' ? 'selected' : ''}>support</option>
            </select>
          </div>
        </div>

        <div style="padding:16px; background:color-mix(in srgb, var(--warn) 5%, transparent); border:1px solid color-mix(in srgb, var(--warn) 30%, transparent); border-radius:8px;">
          <label style="font-weight:900; display:block; margin-bottom:12px; font-size:14px; color:var(--warn);">THEN (Actions)</label>
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <input type="text" class="input full" value="\${s.rules[0].action}" onchange="
              const newRules = [...window.AiOsEngine.state.rules];
              newRules[0].action = this.value;
              window.AiOsEngine.updateConfig({ rules: newRules });
            ">
          </div>
        </div>
      \` : \`<div class="muted">No rules available.</div>\`}
    </div>
  \`;
}
`;
if(content.match(rulesRegex)) {
  content = content.replace(rulesRegex, newRules + '\n/* REPLACE END */\n');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('AI OS frontend Rules injected successfully.');
