const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update Experiments module
const expRegex = /function renderOsExperiments[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newExp = `function renderOsExperiments(main, right) {
  const s = window.AiOsEngine.state;
  const experiments = s.experiments || [];
  const activeExpIndex = 0;
  const activeExp = experiments[activeExpIndex] || null;
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Experiments</div>
          <p class="muted" style="margin-top:8px;">A/B test responses and behaviors.</p>
        </div>
        <button class="btn primary" onclick="
          const newE = [...(window.AiOsEngine.state.experiments || []), { id: Date.now(), name: 'New Test', desc: 'Testing new flow', status: 'Draft', varA: { name: 'Control', conv: 0 }, varB: { name: 'Variant', conv: 0 } }];
          window.AiOsEngine.updateConfig({ experiments: newE });
        "><i class="fa-solid fa-flask"></i> New Experiment</button>
      </div>

      <div class="panel soft" style="overflow:hidden;">
        <table class="table" style="width:100%;">
          <thead>
            <tr>
              <th style="padding:16px 24px;">Experiment Name</th>
              <th>Status</th>
              <th>Variant A</th>
              <th>Variant B</th>
              <th class="taRight" style="padding-right:24px;">Winner</th>
            </tr>
          </thead>
          <tbody>
            \${experiments.map((exp, i) => \`
            <tr style="\${i === activeExpIndex ? 'background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);' : ''}">
              <td style="padding:16px 24px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">\${exp.name}</div>
                <div class="muted small">\${exp.desc}</div>
              </td>
              <td><span class="pill \${exp.status==='Running'?'ok':''}" style="font-weight:700;">\${exp.status}</span></td>
              <td><div style="font-weight:700;">\${exp.varA.name}</div><div class="muted small">\${exp.varA.conv}% conv.</div></td>
              <td><div style="font-weight:700;">\${exp.varB.name}</div><div class="muted small">\${exp.varB.conv}% conv.</div></td>
              <td class="taRight" style="padding-right:24px;">
                \${exp.status==='Running' ? '<span class="muted small" style="font-style:italic;">Gathering data...</span>' : '<span class="pill success" style="font-weight:800; font-size:13px;"><i class="fa-solid fa-trophy" style="margin-right:6px;"></i> '+exp.varB.name+'</span>'}
                <button class="btn ghost small icon" style="margin-left:8px;" onclick="
                  const newE = [...window.AiOsEngine.state.experiments];
                  newE.splice(\${i}, 1);
                  window.AiOsEngine.updateConfig({ experiments: newE });
                "><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
            \`).join('')}
            \${experiments.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding:24px;" class="muted">No active experiments.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Experiment Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      \${activeExp ? \`
      <div>
        <input type="text" class="input full" value="\${activeExp.name}" style="font-size:20px; font-weight:900; border:none; background:transparent; padding:0;" onchange="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].name = this.value;
          window.AiOsEngine.updateConfig({ experiments: newE });
        ">
        <div class="pill \${activeExp.status==='Running'?'ok':''}" style="margin-top:8px; display:inline-flex;" onclick="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].status = newE[0].status === 'Running' ? 'Ended' : 'Running';
          window.AiOsEngine.updateConfig({ experiments: newE });
        " style="cursor:pointer;">\${activeExp.status} (Click to toggle)</div>
      </div>

      <div class="panel soft" style="padding:16px; border-color:var(--primary);">
        <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px; color:var(--primary);">Variant A: \${activeExp.varA.name}</div>
        <input type="text" class="input full" value="\${activeExp.varA.name}" style="font-size:14px; margin-bottom:12px;" onchange="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].varA.name = this.value;
          window.AiOsEngine.updateConfig({ experiments: newE });
        ">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>Conversion:</span>
          <span>\${activeExp.varA.conv}%</span>
        </div>
      </div>

      <div class="panel soft" style="padding:16px;">
        <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px;">Variant B: \${activeExp.varB.name}</div>
        <input type="text" class="input full" value="\${activeExp.varB.name}" style="font-size:14px; margin-bottom:12px;" onchange="
          const newE = [...window.AiOsEngine.state.experiments];
          newE[0].varB.name = this.value;
          window.AiOsEngine.updateConfig({ experiments: newE });
        ">
        <div style="display:flex; justify-content:space-between; font-weight:700;">
          <span>Conversion:</span>
          <span style="color:var(--success);">\${activeExp.varB.conv}%</span>
        </div>
      </div>

      <button class="btn primary full mt-10" onclick="osToast('Experiments', 'Variant deployed successfully')">End & Deploy Variant B</button>
      \` : \`<div class="muted">Select an experiment.</div>\`}
    </div>
  \`;
}
`;

if(content.match(expRegex)) {
  content = content.replace(expRegex, newExp + '\n/* REPLACE END */\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Experiments updated successfully.');
}
