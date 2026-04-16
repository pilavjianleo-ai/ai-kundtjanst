const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update AI Behavior (System Prompt & Advanced Controls)
const behaviorRegex = /function renderOsBehavior[\s\S]*?main\.innerHTML = `[\s\S]*?`;\n\}/m;
const newBehavior = `function renderOsBehavior(main, right) {
  const s = window.AiOsEngine.state;
  
  main.innerHTML = \`
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%;">
      <div style="margin-bottom:32px;">
        <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">AI Behavior & Core Identity</div>
        <p class="muted" style="margin-top:8px; font-size:15px;">Configure the underlying system prompt and fine-tune how the AI acts, speaks, and handles risk.</p>
      </div>

      <div class="panel soft" style="padding:24px; margin-bottom:24px; border-radius:12px;">
        <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;">
          <div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-terminal"></i></div> 
          System Prompt (Master Instructions)
        </div>
        <p class="muted small" style="margin-bottom:16px;">This is the absolute core instruction set given to the LLM before any conversation starts.</p>
        <textarea class="input full" rows="8" style="font-family:monospace; font-size:13px; line-height:1.6; padding:16px; border-radius:8px; background:var(--bg);" onchange="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, systemPrompt: this.value } })">\${s.behavior.systemPrompt || "You are a helpful, professional customer support agent. You always try to solve the user's problem using the provided knowledge base."}</textarea>
      </div>

      <div class="grid2" style="gap:24px;">
        <div class="panel soft" style="padding:24px; border-radius:12px;">
          <div class="title" style="font-size:16px; margin-bottom:20px; display:flex; align-items:center;">
            <div style="width:24px; height:24px; border-radius:6px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center; margin-right:12px;"><i class="fa-solid fa-masks-theater"></i></div> 
            Persona Preset
          </div>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <label style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid \${s.behavior.persona === 'professional' ? 'var(--primary)' : 'var(--border)'}; border-radius:8px; cursor:pointer; background:\${s.behavior.persona === 'professional' ? 'var(--panel2)' : 'var(--bg)'};" onclick="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, persona: 'professional' } })">
              <input type="radio" name="persona" \${s.behavior.persona === 'professional' ? 'checked' : ''}>
              <div>
                <div style="font-weight:700; font-size:14px;">Professional</div>
                <div class="muted small">Direct, polite, and efficient.</div>
              </div>
            </label>
            <label style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid \${s.behavior.persona === 'friendly' ? 'var(--primary)' : 'var(--border)'}; border-radius:8px; cursor:pointer; background:\${s.behavior.persona === 'friendly' ? 'var(--panel2)' : 'var(--bg)'};" onclick="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, persona: 'friendly' } })">
              <input type="radio" name="persona" \${s.behavior.persona === 'friendly' ? 'checked' : ''}>
              <div>
                <div style="font-weight:700; font-size:14px;">Friendly & Empathetic</div>
                <div class="muted small">Uses emojis, warm tone, highly apologetic.</div>
              </div>
            </label>
            <label style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid \${s.behavior.persona === 'sales' ? 'var(--primary)' : 'var(--border)'}; border-radius:8px; cursor:pointer; background:\${s.behavior.persona === 'sales' ? 'var(--panel2)' : 'var(--bg)'};" onclick="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, persona: 'sales' } })">
              <input type="radio" name="persona" \${s.behavior.persona === 'sales' ? 'checked' : ''}>
              <div>
                <div style="font-weight:700; font-size:14px;">Sales Oriented</div>
                <div class="muted small">Proactive, suggests upgrades, focuses on value.</div>
              </div>
            </label>
          </div>
        </div>

        <div class="panel soft" style="padding:24px; border-radius:12px; display:flex; flex-direction:column; gap:24px;">
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-temperature-half muted"></i> Tone (Formality)</label>
              <span class="pill" style="font-weight:700; font-family:monospace; font-size:12px;">\${s.behavior.tone}%</span>
            </div>
            <input type="range" min="1" max="100" value="\${s.behavior.tone}" class="full" style="accent-color:var(--primary); height:6px; border-radius:3px;" onchange="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, tone: this.value } })">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Casual</span><span>Formal</span></div>
          </div>
          
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:13px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-shield-halved muted"></i> Risk Tolerance (Hallucination)</label>
              <span class="pill" style="font-weight:700; font-family:monospace; font-size:12px;">\${s.behavior.risk}%</span>
            </div>
            <input type="range" min="1" max="100" value="\${s.behavior.risk}" class="full" style="accent-color:var(--warn); height:6px; border-radius:3px;" onchange="window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, risk: this.value } })">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Strict (Fallback)</span><span>Creative (Try to guess)</span></div>
          </div>
        </div>
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Guardrails</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:32px;">
      
      <div style="padding:16px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--danger);"><i class="fa-solid fa-ban"></i> Forbidden Phrases</label>
        <p class="muted small" style="margin-bottom:16px;">The AI will NEVER output these exact phrases.</p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          \${(s.behavior.forbidden || ['I dont know', 'Calm down']).map((phrase, i) => \`
            <span class="pill" style="background:var(--panel); border:1px solid var(--border); font-size:12px;">"\${phrase}" <i class="fa-solid fa-xmark muted cursor-pointer" style="margin-left:6px;" onclick="
              const newF = [...(window.AiOsEngine.state.behavior.forbidden || ['I dont know', 'Calm down'])];
              newF.splice(\${i}, 1);
              window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, forbidden: newF } });
            "></i></span>
          \`).join('')}
        </div>
        <input type="text" class="input full smallInput" placeholder="Add phrase and press Enter..." style="font-size:13px; padding:8px;" onkeypress="
          if(event.key === 'Enter') {
            const val = this.value.trim();
            if(val) {
              const newF = [...(window.AiOsEngine.state.behavior.forbidden || ['I dont know', 'Calm down']), val];
              window.AiOsEngine.updateConfig({ behavior: { ...window.AiOsEngine.state.behavior, forbidden: newF } });
            }
          }
        ">
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Response Length Limit</label>
        <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
          <option>Concise (Max 2 sentences)</option>
          <option selected>Balanced (Standard)</option>
          <option>Detailed (Long explanations)</option>
        </select>
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Primary Language</label>
        <select class="input full" style="font-size:14px; padding:10px; border-radius:8px;">
          <option>Auto-detect (Match User)</option>
          <option>English</option>
          <option>Swedish</option>
        </select>
      </div>

    </div>
  \`;
}
`;

if(content.match(behaviorRegex)) {
  content = content.replace(behaviorRegex, newBehavior);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('AI Behavior visually upgraded.');
}
