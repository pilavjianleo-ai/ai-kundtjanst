const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update Rule Engine (Rules / Automations)
const ruleRegex = /function renderOsRules[\s\S]*?main\.innerHTML = `[\s\S]*?`;\n\}/m;
const newRules = `function renderOsRules(main, right) {
  const s = window.AiOsEngine.state;
  const rules = s.rules || [];
  const activeRuleId = window.aiosActiveRuleId || (rules.length > 0 ? rules[0].id : null);
  const activeRule = rules.find(r => r.id === activeRuleId) || rules[0];

  main.innerHTML = \`
    <div style="display:flex; height:100%; width:100%;">
      <!-- RULES LIST -->
      <div style="width:340px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <div class="title" style="font-size:16px;">Global Rules</div>
          <button class="btn primary small icon" onclick="
            const newR = [...window.AiOsEngine.state.rules, { id: Date.now(), name: 'New Rule', intent: 'any', sentiment: 'any', action: 'Escalate to Agent', active: true }];
            window.AiOsEngine.updateConfig({ rules: newR });
            window.aiosActiveRuleId = newR[newR.length-1].id;
          "><i class="fa-solid fa-plus"></i></button>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          \${rules.length > 0 ? rules.map(r => \`
            <div class="listItem \${r.id === activeRuleId ? 'active' : ''}" style="padding:16px; border-radius:12px; cursor:pointer;" onclick="window.aiosActiveRuleId = \${r.id}; renderAiOsModule();">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;">
                  \${r.name}
                </div>
                <div class="toggle"><input type="checkbox" \${r.active ? 'checked' : ''} onclick="
                  event.stopPropagation();
                  const newR = window.AiOsEngine.state.rules.map(rule => rule.id === \${r.id} ? { ...rule, active: this.checked } : rule);
                  window.AiOsEngine.updateConfig({ rules: newR });
                "></div>
              </div>
              <div style="display:flex; gap:6px; margin-top:8px;">
                <span class="pill" style="font-size:10px; padding:2px 6px; background:var(--bg); border:1px solid var(--border);">IF \${r.intent}</span>
                <span class="pill warn" style="font-size:10px; padding:2px 6px; border:1px solid color-mix(in srgb, var(--warn) 30%, transparent);">THEN \${r.action.substring(0,15)}\${r.action.length>15?'...':''}</span>
              </div>
            </div>
          \`).join('') : \`
            <div style="text-align:center; padding:40px 20px;" class="muted">
              <i class="fa-solid fa-scale-balanced" style="font-size:32px; margin-bottom:12px; color:var(--border);"></i>
              <div>No rules configured.</div>
            </div>
          \`}
        </div>
      </div>
      
      <!-- RULE EDITOR -->
      <div style="flex:1; padding:40px; overflow-y:auto; background:var(--bg);">
        \${activeRule ? \`
        <div style="max-width:800px; margin:0 auto;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px;">
            <div>
              <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">\${activeRule.name}</div>
              <p class="muted" style="margin-top:8px; font-size:15px;">Configure logic that overrides AI responses before they are sent.</p>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:32px;">
            <div class="panel soft" style="padding:24px; border-radius:12px; background:var(--bg);">
              <label style="font-weight:800; display:block; margin-bottom:20px; font-size:14px; color:var(--primary);"><i class="fa-solid fa-code-branch"></i> IF (Conditions)</label>
              
              <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
                <div class="muted small" style="width:80px; font-weight:700;">Intent</div>
                <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
                  const newR = window.AiOsEngine.state.rules.map(r => r.id === \${activeRule.id} ? { ...r, intent: this.value } : r);
                  window.AiOsEngine.updateConfig({ rules: newR });
                ">
                  <option \${activeRule.intent==='pricing'?'selected':''}>pricing</option>
                  <option \${activeRule.intent==='support'?'selected':''}>support</option>
                  <option \${activeRule.intent==='refund_request'?'selected':''}>refund_request</option>
                  <option \${activeRule.intent==='any'?'selected':''}>any</option>
                </select>
              </div>

              <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
                <div class="muted small" style="width:80px; font-weight:700;">Sentiment</div>
                <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
                  const newR = window.AiOsEngine.state.rules.map(r => r.id === \${activeRule.id} ? { ...r, sentiment: this.value } : r);
                  window.AiOsEngine.updateConfig({ rules: newR });
                ">
                  <option \${activeRule.sentiment==='positive'?'selected':''}>positive</option>
                  <option \${activeRule.sentiment==='negative'?'selected':''}>negative</option>
                  <option \${activeRule.sentiment==='any'?'selected':''}>any</option>
                </select>
              </div>
              <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Condition (AND)</button>
            </div>

            <div class="panel soft" style="padding:24px; border-radius:12px; background:var(--bg); border-color:var(--warn);">
              <label style="font-weight:800; display:block; margin-bottom:20px; font-size:14px; color:var(--warn);"><i class="fa-solid fa-bolt"></i> THEN (Actions)</label>
              
              <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px;">
                <div class="muted small" style="width:80px; font-weight:700;">Action</div>
                <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
                  const newR = window.AiOsEngine.state.rules.map(r => r.id === \${activeRule.id} ? { ...r, action: this.value } : r);
                  window.AiOsEngine.updateConfig({ rules: newR });
                ">
                  <option \${activeRule.action.includes('Escalate')?'selected':''}>Escalate to Agent</option>
                  <option \${activeRule.action.includes('Sales')?'selected':''}>Escalate to Sales Team</option>
                  <option \${activeRule.action.includes('Block')?'selected':''}>Block Response</option>
                  <option \${activeRule.action.includes('Trigger')?'selected':''}>Trigger API Webhook</option>
                </select>
              </div>
              <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Action</button>
            </div>
          </div>
        </div>
        \` : \`
        <div style="margin:auto; text-align:center; color:var(--muted); padding-top:100px;">
          <i class="fa-solid fa-gears" style="font-size:48px; margin-bottom:16px; opacity:0.5;"></i>
          <div style="font-weight:600; font-size:16px;">Select a rule to configure</div>
        </div>
        \`}
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Rule Settings</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      \${activeRule ? \`
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Rule Name</label>
        <input type="text" class="input full" value="\${activeRule.name}" style="font-size:14px; padding:10px; border-radius:8px;" onchange="
          const newR = window.AiOsEngine.state.rules.map(r => r.id === \${activeRule.id} ? { ...r, name: this.value } : r);
          window.AiOsEngine.updateConfig({ rules: newR });
        ">
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Priority Level</label>
        <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
          <option>High (Overrides everything)</option>
          <option>Normal</option>
        </select>
        <p class="muted small" style="margin-top:8px; line-height:1.4;">If multiple rules match, the highest priority runs first.</p>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border);">
        <button class="btn ghost danger full taLeft" onclick="
          const newR = window.AiOsEngine.state.rules.filter(r => r.id !== \${activeRule.id});
          window.aiosActiveRuleId = null;
          window.AiOsEngine.updateConfig({ rules: newR });
        "><i class="fa-solid fa-trash" style="margin-right:8px;"></i> Delete Rule</button>
      </div>
      \` : \`<div class="muted">Select a rule.</div>\`}
    </div>
  \`;
}
`;

if(content.match(ruleRegex)) {
  content = content.replace(ruleRegex, newRules);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Rule Engine visually upgraded.');
}
