// ai_os.js
// Completely new standalone AI Control Center (AI Operating System)

let currentAiOsRoute = "live-studio";
let aiOsInitialized = false;

function initAiOs() {
  if (aiOsInitialized) {
    renderAiOsModule(currentAiOsRoute);
    return;
  }

  const navButtons = document.querySelectorAll("#aiOsNav .menuBtn");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentAiOsRoute = btn.getAttribute("data-aios");
      renderAiOsModule(currentAiOsRoute);
    });
  });
  
  renderAiOsModule(currentAiOsRoute);
  aiOsInitialized = true;
}

function setAiOsHeader(title, subtitle, actionHtml = "") {
  const t = document.getElementById("aiOsHeaderTitle");
  const s = document.getElementById("aiOsHeaderSub");
  const a = document.getElementById("aiOsHeaderActions");
  if (t) t.innerText = title;
  if (s) s.innerText = subtitle;
  if (a) a.innerHTML = actionHtml;
}

function getAiOsContentEl() {
  return document.getElementById("aiOsContent");
}

function renderAiOsModule(route) {
  const content = getAiOsContentEl();
  if (!content) return;
  
  switch(route) {
    case "live-studio":
      renderAiOsLiveStudio(content);
      break;
    case "conversations":
      renderAiOsConversations(content);
      break;
    case "behavior":
      renderAiOsBehavior(content);
      break;
    case "flows":
      renderAiOsFlows(content);
      break;
    case "knowledge":
      renderAiOsKnowledge(content);
      break;
    case "training":
      renderAiOsTraining(content);
      break;
    case "performance":
      renderAiOsPerformance(content);
      break;
    case "experiments":
      renderAiOsExperiments(content);
      break;
    case "automations":
      renderAiOsAutomations(content);
      break;
    case "logs":
      renderAiOsLogs(content);
      break;
    default:
      content.innerHTML = `<div class="muted">Module not found</div>`;
  }
}

// 1. LIVE AI STUDIO
function renderAiOsLiveStudio(el) {
  setAiOsHeader("Live Studio", "Test AI in real-time and understand behavior.", \`<button class="btn primary"><i class="fa-solid fa-plus"></i> New Scenario</button>\`);
  
  el.innerHTML = \`
    <div style="display: grid; grid-template-columns: 280px 1fr 320px; gap: 16px; height: calc(100vh - 160px);">
      <!-- Left: Scenario selector -->
      <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden;">
        <div class="panelHead">
          <div class="title" style="font-size:14px;">Quick Scenarios</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto;">
          <button class="btn secondary full taLeft"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Refund Request</button>
          <button class="btn secondary full taLeft"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Angry Customer</button>
          <button class="btn secondary full taLeft"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Lead Inquiry</button>
          <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:12px;">
            <label class="muted small" style="font-weight:600; display:block; margin-bottom:4px;">Custom Input</label>
            <textarea class="input full" rows="3" placeholder="Type custom message..."></textarea>
            <button class="btn primary full" style="margin-top:8px;">Run Test</button>
          </div>
        </div>
      </div>
      
      <!-- Center: Chat interface -->
      <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden;">
        <div class="panelHead" style="justify-content:space-between;">
          <div class="title" style="font-size:14px;">Conversation</div>
          <div class="pill warn">Test Mode</div>
        </div>
        <div style="flex:1; background:var(--bg); padding:16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
          <div style="align-self:flex-end; background:var(--primary); color:#fff; padding:10px 14px; border-radius:12px; max-width:80%; box-shadow:var(--shadow-sm);">I need a refund for my last order!</div>
          
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:10px 14px; border-radius:12px; max-width:80%; cursor:pointer; box-shadow:var(--shadow-sm); transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'" title="Click to edit response">
            I understand you'd like a refund. Could you please provide your order number so I can look into this for you?
            <div style="margin-top:8px; display:flex; gap:6px; border-top:1px dashed var(--border); padding-top:8px;">
              <button class="btn ghost small icon" title="Edit Message"><i class="fa-solid fa-pen"></i></button>
              <button class="btn ghost small icon" title="Regenerate Response"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
          </div>
        </div>
        <div style="padding:12px; border-top:1px solid var(--border); display:flex; gap:8px; background:var(--panel);">
          <input type="text" class="input full" placeholder="Type a reply...">
          <button class="btn primary icon"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>

      <!-- Right: AI reasoning -->
      <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden;">
        <div class="panelHead">
          <div class="title" style="font-size:14px;">AI Reasoning</div>
        </div>
        <div style="padding:16px; display:flex; flex-direction:column; gap:20px; overflow-y:auto;">
          <div>
            <div class="muted small" style="font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Intent Detected</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="pill ok">refund_request</span>
              <span class="muted small">98% confidence</span>
            </div>
          </div>
          <div>
            <div class="muted small" style="font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Knowledge Used</div>
            <div style="font-size:13px; border:1px solid var(--border); border-radius:8px; padding:10px; background:var(--bg); display:flex; align-items:center; gap:8px;">
              <i class="fa-solid fa-file-pdf" style="color:var(--danger);"></i> 
              <span style="font-weight:500;">Return_Policy_2025.pdf</span>
            </div>
          </div>
          <div>
            <div class="muted small" style="font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Decision Logic</div>
            <div style="font-size:13px; color:var(--text); line-height:1.6; background:var(--panel2); padding:12px; border-radius:8px; border:1px solid var(--border);">
              <div style="display:flex; gap:8px;"><span class="muted">1.</span> <span>Identified refund intent</span></div>
              <div style="display:flex; gap:8px;"><span class="muted">2.</span> <span>Checked policy (requires order number)</span></div>
              <div style="display:flex; gap:8px;"><span class="muted">3.</span> <span>Generated empathetic request for order number</span></div>
            </div>
          </div>
          <div style="margin-top:auto; padding-top:16px; border-top:1px solid var(--border);">
            <div class="title" style="font-size:13px; margin-bottom:10px;">First-Response Control</div>
            <button class="btn secondary full taLeft"><i class="fa-solid fa-sliders" style="margin-right:8px; color:var(--muted);"></i> Edit Greeting & Tone</button>
          </div>
        </div>
      </div>
    </div>
  \`;
}

// 2. CONVERSATION EDITOR
function renderAiOsConversations(el) {
  setAiOsHeader("Conversation Editor", "Full control over how conversations behave.", \`<button class="btn primary"><i class="fa-solid fa-plus"></i> New Flow</button>\`);
  
  el.innerHTML = \`
    <div style="display: grid; grid-template-columns: 320px 1fr; gap: 20px; height: calc(100vh - 160px);">
      <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden;">
        <div class="panelHead">
          <div class="title" style="font-size:14px;">Flows & FAQs</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          <div class="listItem active" style="padding:12px 14px;">
            <div style="font-weight:700; margin-bottom:2px;">Default Greeting</div>
            <div class="muted small">First response logic</div>
          </div>
          <div class="listItem" style="padding:12px 14px;">
            <div style="font-weight:700; margin-bottom:2px;">Refund Policy FAQ</div>
            <div class="muted small">Overrides AI with exact text</div>
          </div>
          <div class="listItem" style="padding:12px 14px;">
            <div style="font-weight:700; margin-bottom:2px;">Pricing Inquiry Flow</div>
            <div class="muted small">Lead qualification</div>
          </div>
          <div class="listItem" style="padding:12px 14px;">
            <div style="font-weight:700; margin-bottom:2px;">Escalation Trigger</div>
            <div class="muted small">Handoff rules</div>
          </div>
        </div>
        <div style="padding:16px; border-top:1px solid var(--border); background:var(--panel2);">
          <button class="btn secondary full"><i class="fa-solid fa-plus"></i> Add Quick Question</button>
        </div>
      </div>
      
      <div class="panel soft" style="padding:32px; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
          <div>
            <div class="title" style="font-size:24px; font-weight:900; letter-spacing:-0.02em;">Default Greeting</div>
            <p class="muted" style="margin-top:4px;">Context-aware opening message for new users.</p>
          </div>
          <span class="pill ok">Active</span>
        </div>
        
        <div style="margin-bottom:28px; background:var(--panel2); padding:20px; border-radius:12px; border:1px solid var(--border);">
          <label style="font-weight:700; display:block; margin-bottom:10px; font-size:14px;">If user says:</label>
          <div style="display:flex; gap:10px; align-items:center;">
            <div class="pill" style="font-size:13px; padding:6px 12px; background:var(--bg); border:1px solid var(--border);">Any initial message</div>
            <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
          </div>
        </div>

        <div style="margin-bottom:28px;">
          <label style="font-weight:700; display:block; margin-bottom:10px; font-size:14px;">Respond with (Exact phrasing):</label>
          <textarea class="input full" rows="5" style="font-size:15px; line-height:1.5; padding:16px;">Hi! I'm the AI assistant. How can I help you today?</textarea>
          <div class="muted small" style="margin-top:8px; display:flex; justify-content:flex-end;">Press Ctrl+S to save</div>
        </div>

        <div style="margin-bottom:32px;">
          <label style="font-weight:700; display:block; margin-bottom:10px; font-size:14px;">Priority Level:</label>
          <select class="input" style="max-width:300px;">
            <option>High (Overrides AI completely)</option>
            <option>Normal (AI can modify based on context)</option>
          </select>
        </div>

        <div style="display:flex; gap:12px; border-top:1px solid var(--border); padding-top:24px;">
          <button class="btn primary"><i class="fa-solid fa-check"></i> Save Changes</button>
          <button class="btn ghost">Cancel</button>
          <button class="btn ghost danger" style="margin-left:auto;"><i class="fa-solid fa-trash"></i> Delete Flow</button>
        </div>
      </div>
    </div>
  \`;
}

// 3. BEHAVIOR ENGINE
function renderAiOsBehavior(el) {
  setAiOsHeader("AI Behavior Engine", "Simple strategies with advanced controls under the hood.");
  
  el.innerHTML = \`
    <div style="max-width: 1000px; margin: 0 auto;">
      <div class="grid3" style="margin-bottom: 24px;">
        <div class="panel soft" style="border-color:var(--primary); box-shadow:inset 0 0 0 1px var(--primary); transform:translateY(-2px);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="title" style="font-size:16px;">Professional</div>
            <span class="pill ok">Active</span>
          </div>
          <p class="muted small" style="min-height:48px; line-height:1.5;">High trust, short answers, consistent tone. Recommended default.</p>
          <button class="btn ghost full mt-10">Edit Parameters</button>
        </div>
        <div class="panel soft cursor-pointer" style="transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="title" style="font-size:16px;">Friendly</div>
          </div>
          <p class="muted small" style="min-height:48px; line-height:1.5;">Warm and empathetic while staying concise. Great for retention.</p>
          <button class="btn secondary full mt-10">Activate</button>
        </div>
        <div class="panel soft cursor-pointer" style="transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="title" style="font-size:16px;">Sales-driven</div>
          </div>
          <p class="muted small" style="min-height:48px; line-height:1.5;">Proactive next steps. Optimized for pricing and conversions.</p>
          <button class="btn secondary full mt-10">Activate</button>
        </div>
      </div>

      <div class="panel soft" style="padding:32px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; border-bottom:1px solid var(--border); padding-bottom:16px;">
          <div class="title" style="font-size:20px; font-weight:800;">Advanced Parameters <span class="muted" style="font-weight:400; font-size:16px;">(Professional)</span></div>
          <button class="btn ghost small"><i class="fa-solid fa-rotate-left"></i> Reset to Default</button>
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px 32px;">
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:14px;">Tone / Formality</label>
              <span class="pill" style="font-weight:700; font-family:monospace;">80%</span>
            </div>
            <input type="range" min="1" max="100" value="80" class="full" style="accent-color:var(--primary); height:6px; border-radius:3px;">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Casual</span><span>Formal</span></div>
          </div>
          
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:14px;">Risk Tolerance (Escalation)</label>
              <span class="pill" style="font-weight:700; font-family:monospace;">20%</span>
            </div>
            <input type="range" min="1" max="100" value="20" class="full" style="height:6px; border-radius:3px;">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Escalate fast</span><span>Try to solve</span></div>
          </div>
          
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:14px;">Empathy Level</label>
              <span class="pill" style="font-weight:700; font-family:monospace;">50%</span>
            </div>
            <input type="range" min="1" max="100" value="50" class="full" style="height:6px; border-radius:3px;">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Direct</span><span>Highly Empathetic</span></div>
          </div>
          
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
              <label style="font-weight:700; font-size:14px;">Aggression (Sales push)</label>
              <span class="pill" style="font-weight:700; font-family:monospace;">10%</span>
            </div>
            <input type="range" min="1" max="100" value="10" class="full" style="height:6px; border-radius:3px;">
            <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Passive</span><span>Always Closing</span></div>
          </div>
        </div>
        
        <div style="margin-top:40px; text-align:right;">
          <button class="btn primary"><i class="fa-solid fa-save"></i> Save Configuration</button>
        </div>
      </div>
    </div>
  \`;
}

// 4. FLOW BUILDER
function renderAiOsFlows(el) {
  setAiOsHeader("Flow Builder", "Visual drag & drop conversation logic.", \`<button class="btn primary"><i class="fa-solid fa-rocket"></i> Deploy Flow</button>\`);
  
  el.innerHTML = \`
    <div style="display: grid; grid-template-columns: 260px 1fr; gap: 20px; height: calc(100vh - 160px);">
      <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden;">
        <div class="panelHead">
          <div class="title" style="font-size:14px;">Nodes</div>
        </div>
        <div style="padding:16px; overflow-y:auto; flex:1; background:var(--panel2);">
          <div class="title" style="font-size:11px; margin-bottom:12px; text-transform:uppercase; color:var(--muted); letter-spacing:0.05em; font-weight:800;">Triggers</div>
          <div class="panel" style="margin-bottom:10px; padding:12px; font-size:13px; cursor:grab; box-shadow:var(--shadow-sm); font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-message" style="color:var(--primary);"></i> User says...</div>
          <div class="panel" style="margin-bottom:10px; padding:12px; font-size:13px; cursor:grab; box-shadow:var(--shadow-sm); font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-tag" style="color:var(--primary);"></i> Intent matches...</div>
          
          <div class="title" style="font-size:11px; margin:24px 0 12px 0; text-transform:uppercase; color:var(--muted); letter-spacing:0.05em; font-weight:800;">Actions</div>
          <div class="panel" style="margin-bottom:10px; padding:12px; font-size:13px; cursor:grab; box-shadow:var(--shadow-sm); font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-comment-dots" style="color:var(--success);"></i> AI Response</div>
          <div class="panel" style="margin-bottom:10px; padding:12px; font-size:13px; cursor:grab; box-shadow:var(--shadow-sm); font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-user-headset" style="color:var(--warn);"></i> Escalate</div>
          <div class="panel" style="margin-bottom:10px; padding:12px; font-size:13px; cursor:grab; box-shadow:var(--shadow-sm); font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-code" style="color:var(--danger);"></i> API Webhook</div>
        </div>
      </div>
      
      <!-- Canvas -->
      <div class="panel soft" style="position:relative; overflow:hidden; background: radial-gradient(circle, var(--border) 1px, transparent 1px); background-size: 20px 20px; background-color: var(--bg);">
        
        <!-- Node 1 -->
        <div style="position:absolute; top:60px; left:80px; width:280px; background:var(--panel); border:1px solid var(--primary); border-radius:12px; padding:16px; box-shadow:var(--shadow);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="title" style="font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em;"><i class="fa-solid fa-tag" style="margin-right:6px;"></i> IF Intent</div>
            <button class="btn ghost tiny icon"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          </div>
          <select class="input full"><option>refund_request</option><option>pricing_inquiry</option></select>
          <div style="width:12px; height:12px; border-radius:50%; background:var(--primary); position:absolute; right:-6px; top:50%; transform:translateY(-50%); border:2px solid var(--panel);"></div>
        </div>
        
        <!-- Node 2 -->
        <div style="position:absolute; top:180px; left:220px; width:280px; background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px; box-shadow:var(--shadow);">
          <div style="width:12px; height:12px; border-radius:50%; background:var(--border); position:absolute; left:-6px; top:50%; transform:translateY(-50%); border:2px solid var(--panel);"></div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="title" style="font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em;"><i class="fa-solid fa-user-headset" style="margin-right:6px; color:var(--warn);"></i> THEN Escalate</div>
            <button class="btn ghost tiny icon"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          </div>
          <select class="input full"><option>Billing Team</option><option>Sales Team</option></select>
        </div>
        
        <!-- SVG Connection -->
        <svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:-1;">
          <path d="M 360 115 C 390 115, 190 235, 220 235" stroke="var(--primary)" stroke-width="3" fill="none" stroke-linecap="round" />
        </svg>
        
        <!-- Zoom Controls -->
        <div style="position:absolute; bottom:20px; right:20px; display:flex; gap:4px; background:var(--panel); padding:4px; border-radius:8px; border:1px solid var(--border); box-shadow:var(--shadow-sm);">
          <button class="btn ghost small icon"><i class="fa-solid fa-minus"></i></button>
          <button class="btn ghost small icon"><i class="fa-solid fa-plus"></i></button>
          <button class="btn ghost small icon"><i class="fa-solid fa-expand"></i></button>
        </div>
      </div>
    </div>
  \`;
}

// 5. KNOWLEDGE
function renderAiOsKnowledge(el) {
  setAiOsHeader("Knowledge System", "Manage what the AI knows and how it uses it.", \`<button class="btn primary"><i class="fa-solid fa-upload"></i> Upload Content</button>\`);
  
  el.innerHTML = \`
    <div class="panel soft" style="overflow:hidden;">
      <div class="panelHead" style="padding:16px 20px;">
        <div class="searchInputs" style="width:300px;">
          <input class="input full" placeholder="Search knowledge base...">
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn secondary"><i class="fa-solid fa-filter"></i> Filter</button>
        </div>
      </div>
      <table class="table" style="width:100%;">
        <thead>
          <tr>
            <th style="padding-left:20px;">Source Document</th>
            <th>Type</th>
            <th>Usage (30d)</th>
            <th>Priority</th>
            <th class="taRight" style="padding-right:20px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding-left:20px;">
              <div style="font-weight:700; font-size:14px; margin-bottom:4px;">Return_Policy_2025.pdf</div>
              <div class="muted small"><i class="fa-solid fa-tag" style="margin-right:4px;"></i> refunds, policy</div>
            </td>
            <td><span class="pill" style="font-weight:600;">PDF</span></td>
            <td><span style="font-weight:600;">1,240</span> <span class="muted small">times</span></td>
            <td><span class="pill warn" style="font-weight:600;">High</span></td>
            <td class="taRight" style="padding-right:20px;">
              <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>
          <tr>
            <td style="padding-left:20px;">
              <div style="font-weight:700; font-size:14px; margin-bottom:4px;">Pricing FAQs</div>
              <div class="muted small"><i class="fa-solid fa-tag" style="margin-right:4px;"></i> sales, pricing</div>
            </td>
            <td><span class="pill" style="font-weight:600;">Text</span></td>
            <td><span style="font-weight:600;">850</span> <span class="muted small">times</span></td>
            <td><span class="pill" style="font-weight:600;">Normal</span></td>
            <td class="taRight" style="padding-right:20px;">
              <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>
          <tr>
            <td style="padding-left:20px;">
              <div style="font-weight:700; font-size:14px; margin-bottom:4px;">https://example.com/help</div>
              <div class="muted small"><i class="fa-solid fa-rotate" style="margin-right:4px;"></i> Auto-sync</div>
            </td>
            <td><span class="pill" style="font-weight:600;">URL</span></td>
            <td><span style="font-weight:600;">320</span> <span class="muted small">times</span></td>
            <td><span class="pill muted" style="font-weight:600;">Low</span></td>
            <td class="taRight" style="padding-right:20px;">
              <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  \`;
}

// 6. TRAINING
function renderAiOsTraining(el) {
  setAiOsHeader("Intent & Training", "Teach the AI to understand user goals.", \`<button class="btn primary"><i class="fa-solid fa-plus"></i> New Intent</button>\`);
  
  el.innerHTML = \`
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:24px;">
      <div class="panel soft" style="padding:20px;">
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Detection Accuracy</div>
        <div style="font-size:28px; font-weight:900; margin-bottom:4px;">94.2%</div>
        <div class="muted small" style="display:flex; justify-content:space-between;"><span>Last 7 days</span> <span style="color:var(--success); font-weight:700;">+1.2%</span></div>
      </div>
      <div class="panel soft" style="padding:20px;">
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Unrecognized Inputs</div>
        <div style="font-size:28px; font-weight:900; margin-bottom:4px;">142</div>
        <div class="muted small" style="display:flex; justify-content:space-between;"><span>Needs training</span> <span style="color:var(--success); font-weight:700;">-5%</span></div>
      </div>
      <div class="panel soft" style="padding:20px;">
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Active Intents</div>
        <div style="font-size:28px; font-weight:900; margin-bottom:4px;">28</div>
        <div class="muted small" style="display:flex; justify-content:space-between;"><span>Total mapped</span> <span>--</span></div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden; max-height:600px;">
        <div class="panelHead" style="padding:16px 20px;">
          <div class="title" style="font-size:16px;">Active Intents</div>
          <input type="text" class="input smallInput" placeholder="Search...">
        </div>
        <div style="padding:0; overflow-y:auto;">
          <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
            <div>
              <div style="font-weight:800; font-size:15px; margin-bottom:4px;">refund_request</div>
              <div class="muted small"><span style="font-weight:600;">45</span> examples • <span style="color:var(--success); font-weight:600;">98%</span> accuracy</div>
            </div>
            <button class="btn secondary small">Edit</button>
          </div>
          <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
            <div>
              <div style="font-weight:800; font-size:15px; margin-bottom:4px;">pricing_inquiry</div>
              <div class="muted small"><span style="font-weight:600;">32</span> examples • <span style="color:var(--success); font-weight:600;">92%</span> accuracy</div>
            </div>
            <button class="btn secondary small">Edit</button>
          </div>
          <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
            <div>
              <div style="font-weight:800; font-size:15px; margin-bottom:4px;">technical_issue</div>
              <div class="muted small"><span style="font-weight:600;">80</span> examples • <span style="color:var(--warn); font-weight:600;">85%</span> accuracy</div>
            </div>
            <button class="btn secondary small">Edit</button>
          </div>
        </div>
      </div>
      
      <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden; max-height:600px; border-color:var(--warn);">
        <div class="panelHead" style="padding:16px 20px; background:color-mix(in srgb, var(--warn) 5%, transparent);">
          <div class="title" style="font-size:16px;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--warn); margin-right:8px;"></i> Needs Training (Unrecognized)</div>
        </div>
        <div style="padding:0; overflow-y:auto;">
          <div style="padding:20px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
            <div style="font-style:italic; font-size:15px; color:var(--text); margin-bottom:12px; background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">"How do I pause my subscription?"</div>
            <div style="display:flex; gap:10px;">
              <select class="input smallInput" style="flex:1;"><option>Select Intent...</option><option>billing_issue</option><option>cancel_subscription</option></select>
              <button class="btn primary small">Map</button>
            </div>
          </div>
          <div style="padding:20px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
            <div style="font-style:italic; font-size:15px; color:var(--text); margin-bottom:12px; background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border);">"Can you send an invoice for last month?"</div>
            <div style="display:flex; gap:10px;">
              <select class="input smallInput" style="flex:1;"><option>Select Intent...</option><option>billing_issue</option><option>refund_request</option></select>
              <button class="btn primary small">Map</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  \`;
}

// 7. PERFORMANCE
function renderAiOsPerformance(el) {
  setAiOsHeader("Performance & Analytics", "Simple, actionable metrics.", \`<button class="btn secondary"><i class="fa-solid fa-download"></i> Export Report</button>\`);
  
  el.innerHTML = \`
    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-bottom:24px;">
      <div class="panel soft" style="padding:20px;">
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">AI Resolution Rate</div>
        <div style="font-size:28px; font-weight:900; margin-bottom:4px;">68%</div>
        <div class="muted small" style="display:flex; justify-content:space-between;"><span>Resolved without human</span> <span style="color:var(--success); font-weight:700;">+4.2%</span></div>
      </div>
      <div class="panel soft" style="padding:20px;">
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Conversion Rate</div>
        <div style="font-size:28px; font-weight:900; margin-bottom:4px;">12.4%</div>
        <div class="muted small" style="display:flex; justify-content:space-between;"><span>Sales inquiries</span> <span style="color:var(--success); font-weight:700;">+1.8%</span></div>
      </div>
      <div class="panel soft" style="padding:20px;">
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Escalation Rate</div>
        <div style="font-size:28px; font-weight:900; margin-bottom:4px;">32%</div>
        <div class="muted small" style="display:flex; justify-content:space-between;"><span>Handed to humans</span> <span style="color:var(--danger); font-weight:700;">-2.1%</span></div>
      </div>
      <div class="panel soft" style="padding:20px;">
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Avg Response Time</div>
        <div style="font-size:28px; font-weight:900; margin-bottom:4px;">1.2s</div>
        <div class="muted small" style="display:flex; justify-content:space-between;"><span>AI latency</span> <span>--</span></div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
      <div class="panel soft" style="border-color:var(--danger);">
        <div class="panelHead" style="background:color-mix(in srgb, var(--danger) 5%, transparent); padding:16px 20px;">
          <div class="title" style="font-size:16px;"><i class="fa-solid fa-fire" style="color:var(--danger); margin-right:8px;"></i> Top Problems</div>
        </div>
        <div style="padding:24px;">
          <div style="font-weight:800; font-size:16px; margin-bottom:8px;">Technical Issues (Escalation: 85%)</div>
          <p class="muted" style="line-height:1.5; margin-bottom:16px;">High escalation rate detected for technical issues. The AI lacks deep troubleshooting knowledge.</p>
          <button class="btn secondary small">Add Knowledge</button>
        </div>
      </div>
      
      <div class="panel soft" style="border-color:var(--success);">
        <div class="panelHead" style="background:color-mix(in srgb, var(--success) 5%, transparent); padding:16px 20px;">
          <div class="title" style="font-size:16px;"><i class="fa-solid fa-arrow-trend-up" style="color:var(--success); margin-right:8px;"></i> Top Opportunities</div>
        </div>
        <div style="padding:24px;">
          <div style="font-weight:800; font-size:16px; margin-bottom:8px;">Pricing Intents (Drop-off: 40%)</div>
          <p class="muted" style="line-height:1.5; margin-bottom:16px;">Users asking about pricing drop off after the first response. Try switching to the 'Sales-driven' AI behavior.</p>
          <button class="btn primary small">Change Behavior</button>
        </div>
      </div>
    </div>
  \`;
}

// 8. EXPERIMENTS
function renderAiOsExperiments(el) {
  setAiOsHeader("Experimentation", "A/B test AI behaviors and responses.", \`<button class="btn primary"><i class="fa-solid fa-flask"></i> New Experiment</button>\`);
  
  el.innerHTML = \`
    <div class="panel soft" style="overflow:hidden;">
      <table class="table" style="width:100%;">
        <thead>
          <tr>
            <th style="padding:16px 20px;">Experiment Name</th>
            <th>Status</th>
            <th>Variant A</th>
            <th>Variant B</th>
            <th class="taRight" style="padding-right:20px;">Winner</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:16px 20px;">
              <div style="font-weight:800; font-size:15px; margin-bottom:4px;">Greeting Optimization</div>
              <div class="muted small">Testing conversion impact of opening line</div>
            </td>
            <td><span class="pill ok">Running</span></td>
            <td><div style="font-weight:600;">Friendly</div><div class="muted small">45% conv.</div></td>
            <td><div style="font-weight:600;">Professional</div><div class="muted small">52% conv.</div></td>
            <td class="taRight" style="padding-right:20px;">
              <span class="muted small" style="font-style:italic;">Gathering data...</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;">
              <div style="font-weight:800; font-size:15px; margin-bottom:4px;">Sales vs Advisor Profile</div>
              <div class="muted small">Behavior engine comparison</div>
            </td>
            <td><span class="pill">Ended</span></td>
            <td><div style="font-weight:600; color:var(--muted);">Sales-driven</div><div class="muted small">18% conv.</div></td>
            <td><div style="font-weight:600; color:var(--muted);">Advisor</div><div class="muted small">12% conv.</div></td>
            <td class="taRight" style="padding-right:20px;">
              <span class="pill success" style="font-weight:700;"><i class="fa-solid fa-trophy" style="margin-right:4px;"></i> Sales-driven</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  \`;
}

// 9. AUTOMATIONS
function renderAiOsAutomations(el) {
  setAiOsHeader("Automation Engine", "Multi-step automations and failover logic.", \`<button class="btn primary"><i class="fa-solid fa-plus"></i> Create Rule</button>\`);
  
  el.innerHTML = \`
    <div class="panel soft" style="overflow:hidden;">
      <div style="padding:0;">
        <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
          <div>
            <div class="title" style="font-size:16px; margin-bottom:8px;">High-Value Lead Escalation</div>
            <div style="font-family:monospace; font-size:13px; background:var(--bg); padding:8px 12px; border-radius:6px; border:1px solid var(--border); color:var(--text);">
              <span style="color:var(--primary); font-weight:700;">IF</span> intent = pricing <span style="color:var(--primary); font-weight:700;">AND</span> sentiment = positive <span style="color:var(--primary); font-weight:700;">THEN</span> escalate to Sales Team
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
            <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            <div class="toggle"><input type="checkbox" checked style="width:40px; height:24px;"></div>
          </div>
        </div>
        
        <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
          <div>
            <div class="title" style="font-size:16px; margin-bottom:8px;">Off-hours Failover</div>
            <div style="font-family:monospace; font-size:13px; background:var(--bg); padding:8px 12px; border-radius:6px; border:1px solid var(--border); color:var(--text);">
              <span style="color:var(--primary); font-weight:700;">IF</span> time > 17:00 <span style="color:var(--primary); font-weight:700;">AND</span> intent = support <span style="color:var(--primary); font-weight:700;">THEN</span> switch AI Behavior to 'Advisor'
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
            <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            <div class="toggle"><input type="checkbox" checked style="width:40px; height:24px;"></div>
          </div>
        </div>
      </div>
    </div>
  \`;
}

// 10. LOGS
function renderAiOsLogs(el) {
  setAiOsHeader("Activity & Logs", "Full transparency of all AI actions.", \`<button class="btn secondary"><i class="fa-solid fa-download"></i> Export CSV</button>\`);
  
  el.innerHTML = \`
    <div class="panel soft" style="overflow:hidden;">
      <div class="panelHead" style="gap:12px; padding:16px 20px; background:var(--panel2);">
        <div style="position:relative; width:300px;">
          <i class="fa-solid fa-search muted" style="position:absolute; left:12px; top:50%; transform:translateY(-50%);"></i>
          <input class="input full" placeholder="Search logs..." style="padding-left:36px;">
        </div>
        <select class="input"><option>All Intents</option></select>
        <select class="input"><option>All Outcomes</option><option>Escalated</option><option>Resolved</option></select>
      </div>
      <table class="table" style="width:100%;">
        <thead>
          <tr>
            <th style="padding-left:20px;">Time</th>
            <th>User</th>
            <th>Intent</th>
            <th>Action Taken</th>
            <th class="taRight" style="padding-right:20px;">Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="muted small" style="padding-left:20px; font-weight:600;">Today 14:22</td>
            <td style="font-weight:500;">john@example.com</td>
            <td><span class="pill">refund_request</span></td>
            <td style="font-weight:500;">AI Responded (Policy)</td>
            <td class="taRight" style="padding-right:20px;"><button class="btn ghost small"><i class="fa-solid fa-play" style="margin-right:6px;"></i> Replay</button></td>
          </tr>
          <tr>
            <td class="muted small" style="padding-left:20px; font-weight:600;">Today 14:15</td>
            <td style="font-weight:500;">+46701234567</td>
            <td><span class="pill warn">technical_issue</span></td>
            <td style="font-weight:500;">Escalated to Support</td>
            <td class="taRight" style="padding-right:20px;"><button class="btn ghost small"><i class="fa-solid fa-play" style="margin-right:6px;"></i> Replay</button></td>
          </tr>
          <tr>
            <td class="muted small" style="padding-left:20px; font-weight:600;">Today 13:50</td>
            <td style="font-weight:500;" class="muted">Unknown</td>
            <td><span class="pill danger">unrecognized</span></td>
            <td style="font-weight:500;">Fallback Response</td>
            <td class="taRight" style="padding-right:20px;"><button class="btn ghost small"><i class="fa-solid fa-play" style="margin-right:6px;"></i> Replay</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  \`;
}
