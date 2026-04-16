const fs = require('fs');
let code = fs.readFileSync('public/ops.js', 'utf8');

const newRenderPage = `async function renderPage() {
  const { tickets } = await fetchTicketsForOps().catch(() => ({ tickets: [] }));
  const events = await fetchUsageEvents(30);

  if (ops.route === "live-ai") return renderLiveAiStudio({ tickets });
  if (ops.route === "conversation-editor") return renderConversationEditor();
  if (ops.route === "ai-behavior") return renderAiBehavior();
  if (ops.route === "flow-builder") return renderFlowBuilder();
  if (ops.route === "knowledge-system") return renderKnowledgeSystem();
  if (ops.route === "intent-training") return renderIntentTraining();
  if (ops.route === "analytics") return renderAnalytics({ tickets, events });
  if (ops.route === "experimentation") return renderExperimentation();
  if (ops.route === "automation") return renderAutomationEngine();
  if (ops.route === "logs") return renderLogs();
  if (ops.route === "integrations") return renderIntegrations();

  return renderGeneric({ title: "Module not found", subtitle: "Please select a module from the sidebar.", ctaLabel: "Go to Live AI Studio", ctaRoute: "live-ai" });
}`;

code = code.replace(/async function renderPage\(\) \{[\s\S]*?return renderGeneric[\s\S]*?\}/, newRenderPage);

const newModules = `
/* =========================================================================================
   NEW AI CONTROL CENTER MODULES (10 Modules)
   ========================================================================================= */

function renderLiveAiStudio({ tickets }) {
  setHeader("Live AI Studio", "Test AI in real-time and understand behavior.", { label: "New Scenario", primary: true, icon: "fa-plus" });
  setKpis([]);
  setInsights([]);
  const html = \`
    <div style="display: grid; grid-template-columns: 280px 1fr 320px; gap: 16px; height: 600px;">
      <!-- Left: Scenario selector -->
      <div class="panel soft" style="display:flex; flex-direction:column;">
        <div class="panelHead">
          <div class="title" style="font-size:14px;">Quick Scenarios</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow:auto;">
          <button class="btn secondary full taLeft"><i class="fa-solid fa-bolt"></i> Refund Request</button>
          <button class="btn secondary full taLeft"><i class="fa-solid fa-bolt"></i> Angry Customer</button>
          <button class="btn secondary full taLeft"><i class="fa-solid fa-bolt"></i> Lead Inquiry</button>
          <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:12px;">
            <label class="muted small">Custom Input</label>
            <textarea class="input full" rows="3" style="margin-top:4px;" placeholder="Type custom message..."></textarea>
            <button class="btn primary full mt-10">Run Test</button>
          </div>
        </div>
      </div>
      
      <!-- Center: Chat interface -->
      <div class="panel soft" style="display:flex; flex-direction:column;">
        <div class="panelHead" style="justify-content:space-between;">
          <div class="title" style="font-size:14px;">Conversation</div>
          <div class="pill">Test Mode</div>
        </div>
        <div style="flex:1; background:var(--bg); padding:16px; overflow:auto; display:flex; flex-direction:column; gap:12px;">
          <div style="align-self:flex-end; background:var(--primary); color:#fff; padding:10px 14px; border-radius:12px; max-width:80%;">I need a refund for my last order!</div>
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:10px 14px; border-radius:12px; max-width:80%; cursor:pointer;" title="Click to edit response">
            I understand you'd like a refund. Could you please provide your order number so I can look into this for you?
            <div style="margin-top:8px; display:flex; gap:6px;">
              <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
              <button class="btn ghost small icon"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
          </div>
        </div>
        <div style="padding:12px; border-top:1px solid var(--border); display:flex; gap:8px;">
          <input type="text" class="input full" placeholder="Type a reply...">
          <button class="btn primary icon"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>

      <!-- Right: AI reasoning -->
      <div class="panel soft" style="display:flex; flex-direction:column;">
        <div class="panelHead">
          <div class="title" style="font-size:14px;">AI Reasoning</div>
        </div>
        <div style="padding:16px; display:flex; flex-direction:column; gap:16px; overflow:auto;">
          <div>
            <div class="muted small">Intent Detected</div>
            <div style="margin-top:4px; display:flex; gap:8px; align-items:center;">
              <span class="pill ok">refund_request</span>
              <span class="muted small">98% confidence</span>
            </div>
          </div>
          <div>
            <div class="muted small">Knowledge Used</div>
            <div style="margin-top:4px; font-size:13px; border:1px solid var(--border); border-radius:8px; padding:8px; background:var(--bg);">
              <i class="fa-solid fa-file-pdf muted"></i> Return_Policy_2025.pdf
            </div>
          </div>
          <div>
            <div class="muted small">Decision Logic</div>
            <div style="margin-top:4px; font-size:13px; color:var(--muted); line-height:1.4;">
              1. Identified refund intent<br>
              2. Checked policy (requires order number)<br>
              3. Generated empathetic request for order number
            </div>
          </div>
          <div style="margin-top:auto; padding-top:16px; border-top:1px solid var(--border);">
            <div class="title" style="font-size:13px; margin-bottom:8px;">First-Response Control</div>
            <button class="btn secondary full taLeft"><i class="fa-solid fa-sliders"></i> Edit Greeting & Tone</button>
          </div>
        </div>
      </div>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderConversationEditor() {
  setHeader("Conversation Editor", "Full control over how conversations behave.", { label: "New Flow", primary: true });
  setKpis([]);
  setInsights([]);
  const html = \`
    <div style="display: grid; grid-template-columns: 300px 1fr; gap: 16px;">
      <div class="panel soft">
        <div class="panelHead">
          <div class="title" style="font-size:14px;">Flows & FAQs</div>
        </div>
        <div class="list" style="padding:8px;">
          <div class="listItem active">Default Greeting</div>
          <div class="listItem">Refund Policy FAQ</div>
          <div class="listItem">Pricing Inquiry Flow</div>
          <div class="listItem">Escalation Trigger</div>
        </div>
        <div style="padding:12px; border-top:1px solid var(--border);">
          <button class="btn secondary full"><i class="fa-solid fa-plus"></i> Add Quick Question</button>
        </div>
      </div>
      <div class="panel soft" style="padding:24px;">
        <div class="title" style="font-size:20px; margin-bottom:8px;">Default Greeting</div>
        <p class="muted small" style="margin-bottom:24px;">Context-aware opening message for new users.</p>
        
        <div style="margin-bottom:20px;">
          <label style="font-weight:600; display:block; margin-bottom:8px;">If user says:</label>
          <div class="pill">Any initial message</div>
        </div>

        <div style="margin-bottom:20px;">
          <label style="font-weight:600; display:block; margin-bottom:8px;">Respond with (Exact phrasing):</label>
          <textarea class="input full" rows="4">Hi! I'm the AI assistant. How can I help you today?</textarea>
        </div>

        <div style="margin-bottom:24px;">
          <label style="font-weight:600; display:block; margin-bottom:8px;">Priority:</label>
          <select class="input">
            <option>High (Overrides AI)</option>
            <option>Normal (AI can modify)</option>
          </select>
        </div>

        <button class="btn primary">Save Changes</button>
      </div>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderAiBehavior() {
  setHeader("AI Behavior Engine", "Simple strategies with advanced controls under the hood.");
  setKpis([]);
  setInsights([]);
  const html = \`
    <div class="grid3" style="margin-bottom: 20px;">
      <div class="panel soft" style="border-color:var(--primary); box-shadow:inset 0 0 0 1px var(--primary);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div class="title" style="font-size:16px;">Professional</div>
          <span class="pill ok">Active</span>
        </div>
        <p class="muted small" style="min-height:40px;">High trust, short answers, consistent tone. Recommended default.</p>
        <button class="btn ghost full mt-10">Edit Parameters</button>
      </div>
      <div class="panel soft cursor-pointer">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div class="title" style="font-size:16px;">Friendly</div>
        </div>
        <p class="muted small" style="min-height:40px;">Warm and empathetic while staying concise. Great for retention.</p>
        <button class="btn secondary full mt-10">Activate</button>
      </div>
      <div class="panel soft cursor-pointer">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div class="title" style="font-size:16px;">Sales-driven</div>
        </div>
        <p class="muted small" style="min-height:40px;">Proactive next steps. Optimized for pricing and conversions.</p>
        <button class="btn secondary full mt-10">Activate</button>
      </div>
    </div>

    <div class="panel soft" style="padding:24px;">
      <div class="title" style="font-size:18px; margin-bottom:16px;">Advanced Parameters (Professional)</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Tone / Formality</label>
          <input type="range" min="1" max="100" value="80" class="full" style="accent-color:var(--primary);">
          <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Casual</span><span>Formal</span></div>
        </div>
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Risk Tolerance (Escalation)</label>
          <input type="range" min="1" max="100" value="20" class="full">
          <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Escalate fast</span><span>Try to solve</span></div>
        </div>
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Empathy Level</label>
          <input type="range" min="1" max="100" value="50" class="full">
          <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Direct</span><span>Highly Empathetic</span></div>
        </div>
        <div>
          <label style="font-weight:600; display:block; margin-bottom:8px;">Aggression (Sales push)</label>
          <input type="range" min="1" max="100" value="10" class="full">
          <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Passive</span><span>Always Closing</span></div>
        </div>
      </div>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderFlowBuilder() {
  setHeader("Flow Builder", "Drag & drop conversation logic.", { label: "Deploy Flow", primary: true });
  setKpis([]);
  setInsights([]);
  // Same as old Automation rules roughly, but restyled
  const html = \`
    <div style="display: grid; grid-template-columns: 240px 1fr; gap: 16px;">
      <div class="panel soft" style="padding:12px;">
        <div class="title" style="font-size:13px; margin-bottom:12px; text-transform:uppercase; color:var(--muted);">Triggers</div>
        <div class="listItem" style="margin-bottom:8px; font-size:13px; cursor:grab;"><i class="fa-solid fa-message"></i> User says...</div>
        <div class="listItem" style="margin-bottom:8px; font-size:13px; cursor:grab;"><i class="fa-solid fa-tag"></i> Intent matches...</div>
        
        <div class="title" style="font-size:13px; margin:20px 0 12px 0; text-transform:uppercase; color:var(--muted);">Actions</div>
        <div class="listItem" style="margin-bottom:8px; font-size:13px; cursor:grab;"><i class="fa-solid fa-comment-dots"></i> AI Response</div>
        <div class="listItem" style="margin-bottom:8px; font-size:13px; cursor:grab;"><i class="fa-solid fa-user-headset"></i> Escalate</div>
        <div class="listItem" style="margin-bottom:8px; font-size:13px; cursor:grab;"><i class="fa-solid fa-code"></i> API Webhook</div>
      </div>
      <div class="panel soft" style="min-height:500px; background:var(--bg); position:relative; overflow:hidden;">
        <div style="position:absolute; top:50px; left:50px; width:260px; background:var(--panel); border:1px solid var(--primary); border-radius:12px; padding:12px; box-shadow:var(--shadow);">
          <div class="title" style="font-size:13px; margin-bottom:8px;">IF Intent matches</div>
          <select class="input full smallInput"><option>refund_request</option></select>
        </div>
        <div style="position:absolute; top:160px; left:160px; width:260px; background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px; box-shadow:var(--shadow);">
          <div class="title" style="font-size:13px; margin-bottom:8px;">THEN Escalate</div>
          <select class="input full smallInput"><option>Billing Team</option></select>
        </div>
        <svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;">
          <path d="M 180 120 C 180 140, 290 140, 290 160" stroke="var(--primary)" stroke-width="2" fill="none" />
        </svg>
      </div>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderKnowledgeSystem() {
  setHeader("Knowledge System", "Manage what the AI knows and how it uses it.", { label: "Upload Content", primary: true });
  setKpis([]);
  setInsights([]);
  const html = \`
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Knowledge Sources</div>
        <div class="searchInputs">
          <input class="input smallInput" placeholder="Search knowledge...">
        </div>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Type</th>
            <th>Usage (30d)</th>
            <th>Priority</th>
            <th class="taRight">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Return_Policy_2025.pdf</b><br><span class="muted small">Tag: refunds, policy</span></td>
            <td><span class="pill">PDF</span></td>
            <td>1,240 times</td>
            <td>High</td>
            <td class="taRight">
              <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>
          <tr>
            <td><b>Pricing FAQs</b><br><span class="muted small">Tag: sales, pricing</span></td>
            <td><span class="pill">Text</span></td>
            <td>850 times</td>
            <td>Normal</td>
            <td class="taRight">
              <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>
          <tr>
            <td><b>https://example.com/help</b><br><span class="muted small">Auto-sync</span></td>
            <td><span class="pill">URL</span></td>
            <td>320 times</td>
            <td>Low</td>
            <td class="taRight">
              <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderIntentTraining() {
  setHeader("Intent & Training", "Teach the AI to understand user goals.", { label: "New Intent", primary: true });
  setKpis([
    { label: "Detection Accuracy", value: "94.2%", meta: "Last 7 days", trend: 1.2 },
    { label: "Unrecognized", value: "142", meta: "Needs training", trend: -5 },
    { label: "Total Intents", value: "28", meta: "Active", trend: 0 }
  ]);
  setInsights([]);
  const html = \`
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px;">
      <div class="panel soft">
        <div class="panelHead"><div class="title" style="font-size:14px;">Active Intents</div></div>
        <div class="list" style="padding:12px;">
          <div class="listItem" style="display:flex; justify-content:space-between; align-items:center;">
            <div><b>refund_request</b><br><span class="muted small">45 examples • 98% accuracy</span></div>
            <button class="btn ghost small">Edit</button>
          </div>
          <div class="listItem" style="display:flex; justify-content:space-between; align-items:center;">
            <div><b>pricing_inquiry</b><br><span class="muted small">32 examples • 92% accuracy</span></div>
            <button class="btn ghost small">Edit</button>
          </div>
          <div class="listItem" style="display:flex; justify-content:space-between; align-items:center;">
            <div><b>technical_issue</b><br><span class="muted small">80 examples • 85% accuracy</span></div>
            <button class="btn ghost small">Edit</button>
          </div>
        </div>
      </div>
      <div class="panel soft">
        <div class="panelHead"><div class="title" style="font-size:14px;">Needs Training (Unrecognized)</div></div>
        <div class="list" style="padding:12px;">
          <div class="listItem" style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-style:italic;">"How do I pause my subscription?"</div>
            <button class="btn secondary small">Map Intent</button>
          </div>
          <div class="listItem" style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-style:italic;">"Can you send an invoice for last month?"</div>
            <button class="btn secondary small">Map Intent</button>
          </div>
        </div>
      </div>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderAnalytics({ tickets }) {
  setHeader("Performance & Analytics", "Simple, actionable metrics.");
  setKpis([
    { label: "AI Resolution Rate", value: "68%", meta: "Resolved without human", trend: 4.2 },
    { label: "Conversion Rate", value: "12.4%", meta: "Sales inquiries", trend: 1.8 },
    { label: "Escalation Rate", value: "32%", meta: "Handed to humans", trend: -2.1 },
    { label: "Avg Response Time", value: "1.2s", meta: "AI latency", trend: 0 }
  ]);
  
  setInsights([
    { title: "Top Problem: Technical Issues", body: "Escalation rate for technical issues is 85%. Consider adding more troubleshooting docs to Knowledge.", impact: 0.8 },
    { title: "Top Opportunity: Pricing Intents", body: "Users asking about pricing drop off after the first response. Try switching to the 'Sales-driven' AI behavior.", impact: 0.6 }
  ]);

  $("opsContent").innerHTML = "";
  $("opsContent").style.display = "none";
}

function renderExperimentation() {
  setHeader("Experimentation", "A/B test AI behaviors and responses.", { label: "New Test", primary: true });
  setKpis([]);
  setInsights([]);
  const html = \`
    <div class="panel soft">
      <table class="table">
        <thead>
          <tr>
            <th>Test Name</th>
            <th>Status</th>
            <th>Variant A</th>
            <th>Variant B</th>
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Greeting Optimization</b></td>
            <td><span class="pill ok">Running</span></td>
            <td>Friendly (45% conv)</td>
            <td>Professional (52% conv)</td>
            <td>Pending</td>
          </tr>
          <tr>
            <td><b>Sales vs Advisor Profile</b></td>
            <td><span class="pill">Ended</span></td>
            <td>Sales-driven</td>
            <td>Advisor</td>
            <td><span class="pill ok">Sales-driven</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderAutomationEngine() {
  setHeader("Automation Engine", "Multi-step automations and failover logic.", { label: "Create Rule", primary: true });
  setKpis([]);
  setInsights([]);
  const html = \`
    <div class="panel soft">
      <div class="list" style="padding:16px;">
        <div class="listItem" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="title" style="font-size:15px;">High-Value Lead Escalation</div>
            <div class="muted small" style="margin-top:4px;">IF intent = pricing AND sentiment = positive THEN escalate to Sales Team</div>
          </div>
          <div class="toggle"><input type="checkbox" checked></div>
        </div>
        <div class="listItem" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="title" style="font-size:15px;">Off-hours Failover</div>
            <div class="muted small" style="margin-top:4px;">IF time > 17:00 AND intent = support THEN switch AI Behavior to 'Advisor'</div>
          </div>
          <div class="toggle"><input type="checkbox" checked></div>
        </div>
      </div>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}

function renderLogs() {
  setHeader("Activity & Logs", "Full transparency of all AI actions.", { label: "Export", primary: false });
  setKpis([]);
  setInsights([]);
  const html = \`
    <div class="panel soft">
      <div class="panelHead" style="gap:12px;">
        <input class="input" placeholder="Search logs...">
        <select class="input"><option>All Intents</option></select>
        <select class="input"><option>All Outcomes</option><option>Escalated</option><option>Resolved</option></select>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>User</th>
            <th>Intent</th>
            <th>Action Taken</th>
            <th class="taRight">Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="muted small">Today 14:22</td>
            <td>john@example.com</td>
            <td><span class="pill">refund_request</span></td>
            <td>AI Responded (Policy)</td>
            <td class="taRight"><button class="btn ghost small">Replay</button></td>
          </tr>
          <tr>
            <td class="muted small">Today 14:15</td>
            <td>+46701234567</td>
            <td><span class="pill warn">technical_issue</span></td>
            <td>Escalated to Support</td>
            <td class="taRight"><button class="btn ghost small">Replay</button></td>
          </tr>
          <tr>
            <td class="muted small">Today 13:50</td>
            <td>Unknown</td>
            <td><span class="pill danger">unrecognized</span></td>
            <td>Fallback Response</td>
            <td class="taRight"><button class="btn ghost small">Replay</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  \`;
  $("opsContent").innerHTML = html;
  $("opsContent").style.display = "block";
}
`;

fs.writeFileSync('public/ops.js', code + "\n" + newModules);
console.log('Modules injected!');