const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Ensure AiOsEngine state defaults exist for new arrays
content = content.replace(/rules: \[\],/, 'rules: [],\n    knowledge: [],\n    training: [],\n    experiments: [],');

// Update Knowledge module
const knowRegex = /function renderOsKnowledge[\s\S]*?main\.innerHTML = `[\s\S]*?`;/m;
const newKnow = `function renderOsKnowledge(main, right) {
  const s = window.AiOsEngine.state;
  const docs = s.knowledge || [];
  const activeDocIndex = 0;
  const activeDoc = docs[activeDocIndex] || { name: "No documents", type: "N/A", priority: "Low", status: "None", tags: [], usage: 0, confidence: 0 };
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900;">Knowledge Control</div>
          <p class="muted" style="margin-top:8px;">Manage what the AI knows, prioritize sources, and resolve conflicts.</p>
        </div>
        <button class="btn primary" onclick="
          const newK = [...(window.AiOsEngine.state.knowledge || []), { id: Date.now(), name: 'New_Document.pdf', type: 'PDF', priority: 'Normal', status: 'Synced', tags: ['new'], usage: 0, confidence: 100 }];
          window.AiOsEngine.updateConfig({ knowledge: newK });
        "><i class="fa-solid fa-upload"></i> Upload Source</button>
      </div>

      <div class="panel soft" style="overflow:hidden;">
        <div class="panelHead" style="padding:16px 24px; background:var(--panel2);">
          <input class="input" placeholder="Search knowledge..." style="width:300px;">
        </div>
        <table class="table" style="width:100%;">
          <thead>
            <tr>
              <th style="padding-left:24px;">Document / Source</th>
              <th>Type</th>
              <th>Priority</th>
              <th class="taRight" style="padding-right:24px;">Status</th>
            </tr>
          </thead>
          <tbody>
            \${docs.map((doc, i) => \`
            <tr style="\${i === activeDocIndex ? 'background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);' : ''}">
              <td style="padding-left:24px; padding-top:16px; padding-bottom:16px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">\${doc.name}</div>
                <div class="muted small"><i class="fa-solid fa-tag"></i> \${doc.tags.join(', ')}</div>
              </td>
              <td><span class="pill" style="font-weight:700;">\${doc.type}</span></td>
              <td><span class="pill \${doc.priority==='High'?'warn':''}" style="font-weight:700;">\${doc.priority}</span></td>
              <td class="taRight" style="padding-right:24px;">
                <span class="pill \${doc.status==='Synced'?'ok':'warn'}">\${doc.status==='Synced'?'<i class="fa-solid fa-check"></i> ':'<i class="fa-solid fa-arrows-rotate"></i> '}\${doc.status}</span>
                <button class="btn ghost small icon" style="margin-left:8px;" onclick="
                  const newK = [...window.AiOsEngine.state.knowledge];
                  newK.splice(\${i}, 1);
                  window.AiOsEngine.updateConfig({ knowledge: newK });
                "><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
            \`).join('')}
            \${docs.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding:24px;" class="muted">No knowledge sources uploaded.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; font-weight:800;">Source Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      \${docs.length > 0 ? \`
      <div>
        <div style="font-size:18px; font-weight:900; word-break:break-all;">\${activeDoc.name}</div>
        <div class="muted small" style="margin-top:4px;">Live Synced</div>
      </div>

      <div class="grid2" style="gap:12px;">
        <div class="panel soft" style="padding:16px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:4px;">Usage (30d)</div>
          <div style="font-size:24px; font-weight:900;">\${activeDoc.usage}</div>
        </div>
        <div class="panel soft" style="padding:16px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:4px;">AI Confidence</div>
          <div style="font-size:24px; font-weight:900; color:var(--success);">\${activeDoc.confidence}%</div>
        </div>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Priority Level</label>
        <select class="input full" onchange="
            const newK = [...window.AiOsEngine.state.knowledge];
            newK[0].priority = this.value;
            window.AiOsEngine.updateConfig({ knowledge: newK });
        ">
          <option \${activeDoc.priority==='High'?'selected':''}>High</option>
          <option \${activeDoc.priority==='Normal'?'selected':''}>Normal</option>
          <option \${activeDoc.priority==='Low'?'selected':''}>Low</option>
        </select>
        <p class="muted small" style="margin-top:8px; line-height:1.4;">If two documents contradict each other, the AI will trust the one with higher priority.</p>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Assigned Intents (Tags)</label>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          \${activeDoc.tags.map((t, ti) => \`
            <span class="pill" style="background:var(--bg); border:1px solid var(--border); font-weight:600;">\${t} <i class="fa-solid fa-xmark muted cursor-pointer" style="margin-left:4px;" onclick="
              const newK = [...window.AiOsEngine.state.knowledge];
              newK[0].tags.splice(\${ti}, 1);
              window.AiOsEngine.updateConfig({ knowledge: newK });
            "></i></span>
          \`).join('')}
        </div>
        <button class="btn ghost small" onclick="
          const newK = [...window.AiOsEngine.state.knowledge];
          newK[0].tags.push('new_tag');
          window.AiOsEngine.updateConfig({ knowledge: newK });
        "><i class="fa-solid fa-plus"></i> Add Intent</button>
      </div>
      \` : \`<div class="muted">Upload a source to view details.</div>\`}
    </div>
  \`;
}
`;

if(content.match(knowRegex)) {
  content = content.replace(knowRegex, newKnow + '\n/* REPLACE END */\n');
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Knowledge updated successfully.');
}
