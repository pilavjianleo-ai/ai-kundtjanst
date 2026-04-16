const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update Training module
const trainRegex = /function renderOsTraining[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newTrain = `function renderOsTraining(main, right) {
  const s = window.AiOsEngine.state;
  const intents = s.training || [];
  const activeIntentIndex = 0;
  const activeIntent = intents[activeIntentIndex] || { intent: "N/A", examples: [], accuracy: 0 };
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Intent Training</div>
          <p class="muted" style="margin-top:8px;">Improve AI accuracy by mapping unrecognized inputs.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
        <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden; max-height:600px;">
          <div class="panelHead" style="padding:20px 24px; background:var(--panel2);">
            <div class="title" style="font-size:16px;">Active Intents</div>
          </div>
          <div style="padding:0; overflow-y:auto;">
            \${intents.map((intent, i) => \`
            <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s; \${i===activeIntentIndex ? 'background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);' : ''}">
              <div>
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">\${intent.intent}</div>
                <div class="muted small"><span style="font-weight:700; color:var(--text);">\${intent.examples.length}</span> examples • <span style="color:var(--success); font-weight:700;">\${intent.accuracy}%</span> accuracy</div>
              </div>
              <i class="fa-solid fa-chevron-right muted cursor-pointer" onclick="osToast('Training', 'Select intent to edit')"></i>
            </div>
            \`).join('')}
          </div>
        </div>
        
        <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden; max-height:600px; border:2px solid var(--warn);">
          <div class="panelHead" style="padding:20px 24px; background:color-mix(in srgb, var(--warn) 5%, transparent);">
            <div class="title" style="font-size:16px;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--warn); margin-right:8px;"></i> Needs Training</div>
          </div>
          <div style="padding:0; overflow-y:auto;">
            <div style="padding:24px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
              <div style="font-style:italic; font-size:16px; font-weight:500; color:var(--text); margin-bottom:16px; background:var(--bg); padding:16px; border-radius:8px; border:1px solid var(--border);">"How do I pause my subscription?"</div>
              <div style="display:flex; gap:10px;">
                <select class="input" style="flex:1; font-weight:600;"><option>Select Intent...</option><option>cancel_subscription</option></select>
                <button class="btn primary" onclick="osToast('Training', 'Example mapped to intent')">Map</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Intent Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      \${intents.length > 0 ? \`
      <div>
        <div style="font-size:20px; font-weight:900;">\${activeIntent.intent}</div>
        <div class="muted small" style="margin-top:4px; display:flex; gap:8px;">
          <span style="color:var(--success); font-weight:700;">\${activeIntent.accuracy}% Accuracy</span> • \${activeIntent.examples.length} Examples
        </div>
      </div>

      <div style="padding:16px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Training Examples</label>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          \${activeIntent.examples.map((ex, ei) => \`
          <div class="pill" style="justify-content:space-between; padding:8px 12px; font-size:13px; background:var(--panel); border:1px solid var(--border);">
            "\${ex}" 
            <i class="fa-solid fa-trash muted cursor-pointer" onclick="
              const newT = [...window.AiOsEngine.state.training];
              newT[0].examples.splice(\${ei}, 1);
              window.AiOsEngine.updateConfig({ training: newT });
            "></i>
          </div>
          \`).join('')}
        </div>
        <input type="text" class="input full" placeholder="Type new example and hit Enter..." onkeypress="
          if(event.key === 'Enter') {
            const val = this.value.trim();
            if(val) {
              const newT = [...window.AiOsEngine.state.training];
              newT[0].examples.push(val);
              window.AiOsEngine.updateConfig({ training: newT });
              this.value = '';
            }
          }
        ">
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Merge Intent</label>
        <select class="input full"><option>Merge with...</option></select>
      </div>
      \` : \`<div class="muted">No intents available.</div>\`}
    </div>
  \`;
}
`;

if(content.match(trainRegex)) {
  content = content.replace(trainRegex, newTrain + '\n/* REPLACE END */\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Training updated successfully.');
}
