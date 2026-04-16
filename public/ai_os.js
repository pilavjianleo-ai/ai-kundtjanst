// ai_os.js
// Completely new standalone AI Control Center (AI Operating System)
// 3-Panel Enterprise Layout (Nav | Main Workspace | Right Panel)

let currentAiOsRoute = "live-studio";
let aiOsInitialized = false;

window.gotoAiOs = function(route) {
  if (typeof ops !== 'undefined') ops.route = "ai-control-center";
  currentAiOsRoute = route || "live-studio";
  const aiOsView = document.getElementById("aiOsView");
  if (aiOsView) {
    aiOsView.style.display = "flex";
  }
  initAiOs();
};

window.closeAiOs = function() {
  const aiOsView = document.getElementById("aiOsView");
  if (aiOsView) aiOsView.style.display = "none";
  if (typeof setRoute === 'function') setRoute("overview");
};

function osToast(title, text) {
  if (!document.getElementById("osToastStyles")) {
    const style = document.createElement("style");
    style.id = "osToastStyles";
    style.innerHTML = `
      @keyframes osSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes osSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }
  let wrap = document.getElementById("osToastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "osToastWrap";
    wrap.style.cssText = "position:fixed; bottom:20px; right:20px; display:flex; flex-direction:column; gap:10px; z-index:10000;";
    document.body.appendChild(wrap);
  }
  const div = document.createElement("div");
  div.style.cssText = "background:var(--panel); border:1px solid var(--primary); border-left:4px solid var(--primary); padding:12px 16px; border-radius:8px; box-shadow:var(--shadow); min-width:250px; animation:osSlideIn 0.3s ease forwards; color:var(--text); font-family:system-ui, sans-serif;";
  div.innerHTML = `<div style="font-weight:800; font-size:14px; margin-bottom:4px;">${title}</div><div class="muted small" style="color:var(--muted);">${text}</div>`;
  wrap.appendChild(div);
  setTimeout(() => {
    div.style.animation = "osSlideOut 0.3s ease forwards";
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

function initAiOs() {
  if (aiOsInitialized) {
    renderAiOsModule();
    return;
  }

  const navHtml = `
    <div class="muted small" style="margin:12px 0 4px 12px; font-weight:800; letter-spacing:0.05em; text-transform:uppercase;">Core Engine</div>
    <button class="menuBtn" data-aios="live-studio"><i class="fa-solid fa-play-circle"></i> Live Studio</button>
    <button class="menuBtn" data-aios="chat-experience"><i class="fa-solid fa-message"></i> Chat Experience</button>
    <button class="menuBtn" data-aios="conversations"><i class="fa-solid fa-pen-to-square"></i> Conversations</button>
    <button class="menuBtn" data-aios="flows"><i class="fa-solid fa-diagram-project"></i> Flow Builder</button>
    <button class="menuBtn" data-aios="behavior"><i class="fa-solid fa-brain"></i> AI Behavior</button>
    
    <div class="muted small" style="margin:24px 0 4px 12px; font-weight:800; letter-spacing:0.05em; text-transform:uppercase;">Logic & Rules</div>
    <button class="menuBtn" data-aios="automations"><i class="fa-solid fa-bolt"></i> Rule Engine</button>
    <button class="menuBtn" data-aios="knowledge"><i class="fa-solid fa-book-bookmark"></i> Knowledge</button>
    <button class="menuBtn" data-aios="training"><i class="fa-solid fa-crosshairs"></i> Training</button>
    
    <div class="muted small" style="margin:24px 0 4px 12px; font-weight:800; letter-spacing:0.05em; text-transform:uppercase;">Optimization</div>
    <button class="menuBtn" data-aios="experiments"><i class="fa-solid fa-flask"></i> Experiments</button>
    <button class="menuBtn" data-aios="performance"><i class="fa-solid fa-chart-pie"></i> Performance</button>
    <button class="menuBtn" data-aios="logs"><i class="fa-solid fa-clipboard-list"></i> Logs & Replay</button>
  `;
  document.getElementById("aiOsNav").innerHTML = navHtml;

  const navButtons = document.querySelectorAll("#aiOsNav .menuBtn");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      currentAiOsRoute = btn.getAttribute("data-aios");
      renderAiOsModule();
    });
  });

  // Add global interaction handler for mock elements
  const aiOsView = document.getElementById("aiOsView");
  
  aiOsView.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
      if (btn && !btn.classList.contains("menuBtn") && !btn.hasAttribute("onclick")) {
        osToast("AI Control Center", "Action registered (UI Mockup)");
      }
      
      // Toggle switches
      const toggle = e.target.closest('input[type="checkbox"]');
      if (toggle && e.target.tagName !== "INPUT") {
        // let it naturally toggle
      }
      
      // Select lists
      const listItem = e.target.closest(".listItem, .panel.soft.cursor-pointer");
      if (listItem) {
        const siblings = listItem.parentElement.querySelectorAll(".listItem, .panel.soft.cursor-pointer");
        siblings.forEach(s => {
          s.classList.remove("active");
          s.style.borderColor = "transparent";
          s.style.boxShadow = "none";
          const check = s.querySelector(".fa-circle-check");
          if(check && s !== listItem) check.parentElement.remove();
        });
        listItem.classList.add("active");
        if (listItem.classList.contains("panel")) {
          listItem.style.borderColor = "var(--primary)";
          listItem.style.boxShadow = "0 8px 24px -8px color-mix(in srgb, var(--primary) 30%, transparent)";
        }
        osToast("Selection", "Context updated");
      }
  });

  // Flow Builder drag and drop
  let draggedNode = null;
  let offsetX = 0, offsetY = 0;
  
  aiOsView.addEventListener("mousedown", (e) => {
    const node = e.target.closest(".flow-node");
    if (node && !e.target.closest("button") && !e.target.closest("input")) {
      draggedNode = node;
      const rect = node.getBoundingClientRect();
      const parentRect = node.parentElement.getBoundingClientRect();
      offsetX = e.clientX - parseInt(node.style.left || 0);
      offsetY = e.clientY - parseInt(node.style.top || 0);
      node.style.cursor = "grabbing";
      node.style.zIndex = 100;
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (draggedNode) {
      draggedNode.style.left = (e.clientX - offsetX) + "px";
      draggedNode.style.top = (e.clientY - offsetY) + "px";
      
      // Update SVG paths roughly
      const paths = document.querySelectorAll("#aiOsMainWorkspace svg path");
      paths.forEach(p => p.setAttribute("opacity", "0.2"));
    }
  });

  document.addEventListener("mouseup", () => {
    if (draggedNode) {
      draggedNode.style.cursor = "grab";
      draggedNode.style.zIndex = 5;
      draggedNode = null;
      
      const paths = document.querySelectorAll("#aiOsMainWorkspace svg path");
      paths.forEach(p => p.setAttribute("opacity", "1"));
      osToast("Flow Builder", "Node position saved");
    }
  });

  renderAiOsModule();
  aiOsInitialized = true;
}

function renderAiOsModule() {
  document.querySelectorAll("#aiOsNav .menuBtn").forEach(b => b.classList.remove("active"));
  const activeBtn = document.querySelector(`#aiOsNav .menuBtn[data-aios="${currentAiOsRoute}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  const main = document.getElementById("aiOsMainWorkspace");
  const right = document.getElementById("aiOsRightPanel");
  
  if (!main || !right) return;

  main.innerHTML = "";
  right.innerHTML = "";
  right.style.display = "flex";
  main.style.flexDirection = "column";

  switch(currentAiOsRoute) {
    case "live-studio": renderOsLiveStudio(main, right); break;
    case "chat-experience": renderOsChatExperience(main, right); break;
    case "conversations": renderOsConversations(main, right); break;
    case "flows": renderOsFlows(main, right); break;
    case "behavior": renderOsBehavior(main, right); break;
    case "automations": renderOsRules(main, right); break;
    case "knowledge": renderOsKnowledge(main, right); break;
    case "training": renderOsTraining(main, right); break;
    case "experiments": renderOsExperiments(main, right); break;
    case "performance": renderOsPerformance(main, right); break;
    case "logs": renderOsLogs(main, right); break;
    default: main.innerHTML = `<div style="padding:40px;">Module not found</div>`;
  }
}

// ---------------------------------------------------------
// 1. LIVE STUDIO
// ---------------------------------------------------------
function renderOsLiveStudio(main, right) {
  main.innerHTML = `
    <div style="display:flex; height:100%; width:100%;">
      <div style="width:280px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border);">
          <div class="title" style="font-size:14px;">Scenarios</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          <div class="listItem active" style="padding:12px;"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Refund Request</div>
          <div class="listItem" style="padding:12px;"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Angry Customer</div>
          <div class="listItem" style="padding:12px;"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Lead Inquiry</div>
          <div class="listItem" style="padding:12px;"><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:8px;"></i> Support Issue</div>
        </div>
        <div style="padding:16px; border-top:1px solid var(--border); background:var(--panel);">
          <label class="muted small" style="font-weight:700; display:block; margin-bottom:8px;">Custom Input</label>
          <textarea class="input full" rows="2" placeholder="Type a scenario..."></textarea>
          <button class="btn primary full" style="margin-top:8px;">Test Custom</button>
        </div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column; background:var(--bg);">
        <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
          <div class="title" style="font-size:16px;">Live Chat Simulation</div>
          <div style="display:flex; gap:8px;">
            <button class="btn ghost small icon"><i class="fa-solid fa-rotate-right"></i></button>
            <button class="btn ghost small icon"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div style="flex:1; padding:24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
          <div style="align-self:flex-end; background:var(--primary); color:#fff; padding:12px 16px; border-radius:12px; max-width:80%; box-shadow:var(--shadow-sm); font-size:15px; line-height:1.5;">I need a refund for my last order! It arrived broken.</div>
          
          <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:80%; box-shadow:var(--shadow-sm); font-size:15px; line-height:1.5; position:relative; group;">
            I'm so sorry to hear that your order arrived broken. That's definitely not the experience we want you to have. I can help process a refund right away. Could you please provide your order number?
            
            <div style="position:absolute; top:-10px; right:-10px; display:flex; gap:4px; opacity:1; transition:opacity 0.2s;" class="hover-actions">
              <button class="btn small icon" style="background:var(--panel); border:1px solid var(--border); box-shadow:var(--shadow-sm);" title="Edit Response"><i class="fa-solid fa-pen"></i></button>
              <button class="btn small icon" style="background:var(--panel); border:1px solid var(--border); box-shadow:var(--shadow-sm);" title="Regenerate"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
          </div>
        </div>
        <div style="padding:16px 24px; border-top:1px solid var(--border); display:flex; gap:12px; background:var(--panel);">
          <input type="text" class="input full" placeholder="Test your AI..." style="font-size:15px;">
          <button class="btn primary icon"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">AI Reasoning</div>
    </div>
    <div style="padding:20px; display:flex; flex-direction:column; gap:24px;">
      
      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Intent Detected</div>
        <div class="listItem" style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg); border:1px solid var(--border); cursor:pointer;">
          <div style="font-weight:700; font-size:14px;"><i class="fa-solid fa-crosshairs" style="color:var(--primary); margin-right:8px;"></i> refund_request</div>
          <span class="pill ok">98% Match</span>
        </div>
      </div>

      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Rule Triggered</div>
        <div class="listItem" style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--bg); border:1px solid var(--border); cursor:pointer;">
          <div style="width:24px; height:24px; border-radius:4px; background:color-mix(in srgb, var(--warn) 15%, transparent); color:var(--warn); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-bolt"></i></div>
          <div style="font-weight:600; font-size:14px;">Broken Item Apology</div>
        </div>
      </div>

      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Knowledge Used</div>
        <div class="listItem" style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--bg); border:1px solid var(--border); cursor:pointer;">
          <div style="width:24px; height:24px; border-radius:4px; background:color-mix(in srgb, var(--danger) 15%, transparent); color:var(--danger); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-file-pdf"></i></div>
          <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Return_Policy_2025.pdf</div>
        </div>
      </div>

      <div>
        <div class="muted small" style="font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Decision Logic</div>
        <div style="background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:16px; font-family:monospace; font-size:13px; line-height:1.6; color:var(--text);">
          <div style="display:flex; gap:8px;"><span class="muted">1.</span> <span>Identified 'refund' + 'broken'</span></div>
          <div style="display:flex; gap:8px;"><span class="muted">2.</span> <span>Triggered 'Broken Item Apology' rule</span></div>
          <div style="display:flex; gap:8px;"><span class="muted">3.</span> <span>Checked policy (requires order #)</span></div>
          <div style="display:flex; gap:8px;"><span class="muted">4.</span> <span style="color:var(--primary); font-weight:bold;">Generated response</span></div>
        </div>
      </div>

    </div>
  `;
}

// ---------------------------------------------------------
// 2. CONVERSATIONS
// ---------------------------------------------------------
function renderOsConversations(main, right) {
  main.innerHTML = `
    <div style="display:flex; height:100%; width:100%;">
      <div style="width:280px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <div class="title" style="font-size:14px;">Responses</div>
          <button class="btn ghost small icon"><i class="fa-solid fa-plus"></i></button>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; flex:1;">
          <div class="listItem active" style="padding:12px;">
            <div style="font-weight:800; font-size:14px; margin-bottom:4px;">Default Greeting</div>
            <div class="muted small">First message</div>
          </div>
          <div class="listItem" style="padding:12px;">
            <div style="font-weight:800; font-size:14px; margin-bottom:4px;">Refund Policy FAQ</div>
            <div class="muted small">Exact text override</div>
          </div>
          <div class="listItem" style="padding:12px;">
            <div style="font-weight:800; font-size:14px; margin-bottom:4px;">Pricing Inquiry</div>
            <div class="muted small">Lead qualification</div>
          </div>
          <div class="listItem" style="padding:12px;">
            <div style="font-weight:800; font-size:14px; margin-bottom:4px;">Escalation Trigger</div>
            <div class="muted small">Handoff rules</div>
          </div>
        </div>
      </div>
      
      <div style="flex:1; padding:40px; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px;">
          <div>
            <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Default Greeting</div>
            <p class="muted" style="margin-top:8px; font-size:15px;">Context-aware opening message for new users.</p>
          </div>
          <div class="toggle"><input type="checkbox" checked style="width:48px; height:28px;"></div>
        </div>
        
        <div class="panel soft" style="padding:24px; margin-bottom:32px;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em;">Trigger</label>
          <div style="display:flex; gap:10px; align-items:center;">
            <div class="pill" style="font-size:14px; padding:8px 16px; background:var(--bg); border:1px solid var(--border); font-weight:600;"><i class="fa-solid fa-message" style="margin-right:8px; color:var(--muted);"></i> Any initial message</div>
            <button class="btn ghost small">Add Condition</button>
          </div>
        </div>

        <div class="panel soft" style="padding:24px; margin-bottom:32px;">
          <label style="font-weight:800; display:block; margin-bottom:12px; font-size:14px; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em;">AI Response</label>
          <textarea class="input full" rows="5" style="font-size:16px; line-height:1.6; padding:16px; border-radius:12px; background:var(--bg);">Hi! I'm the AI assistant. How can I help you today?</textarea>
          
          <div style="margin-top:20px; padding-top:20px; border-top:1px dashed var(--border);">
            <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px; color:var(--text);">Quick Replies (Buttons)</label>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <span class="pill" style="padding:6px 16px; font-weight:600; background:var(--bg); border:1px solid var(--border);">Pricing <i class="fa-solid fa-xmark" style="margin-left:8px; cursor:pointer;"></i></span>
              <span class="pill" style="padding:6px 16px; font-weight:600; background:var(--bg); border:1px solid var(--border);">Support <i class="fa-solid fa-xmark" style="margin-left:8px; cursor:pointer;"></i></span>
              <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Reply</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Settings</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Priority Level</label>
        <select class="input full">
          <option>High (Overrides AI completely)</option>
          <option>Normal (AI can modify contextually)</option>
        </select>
        <div class="muted small" style="margin-top:8px; line-height:1.4;">High priority forces the AI to use your exact phrasing without variations.</div>
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Channel Specific</label>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" checked> Web Chat</label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" checked> Email</label>
          <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox"> SMS</label>
        </div>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border);">
        <button class="btn ghost danger full taLeft"><i class="fa-solid fa-trash" style="margin-right:8px;"></i> Delete Flow</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------
// 3. FLOW BUILDER
// ---------------------------------------------------------
function renderOsFlows(main, right) {
  main.innerHTML = `
    <!-- Infinite Canvas Simulation -->
    <div style="width:100%; height:100%; position:relative; background: radial-gradient(circle, var(--border) 1.5px, transparent 1.5px); background-size: 24px 24px; background-color: var(--bg); overflow:hidden;">
      
      <!-- Toolbar Overlay -->
      <div style="position:absolute; top:20px; left:20px; display:flex; gap:12px; z-index:10;">
        <button class="btn primary shadow"><i class="fa-solid fa-plus"></i> Add Node</button>
        <div style="background:var(--panel); border:1px solid var(--border); border-radius:8px; display:flex; padding:4px; box-shadow:var(--shadow-sm);">
          <button class="btn ghost small icon"><i class="fa-solid fa-undo"></i></button>
          <button class="btn ghost small icon"><i class="fa-solid fa-redo"></i></button>
        </div>
      </div>

      <!-- Nodes -->
      <!-- Node 1: Start/Intent -->
      <div class="flow-node" style="position:absolute; top:120px; left:100px; width:280px; background:var(--panel); border:1px solid var(--border); border-top:4px solid var(--primary); border-radius:12px; box-shadow:var(--shadow); z-index:5; cursor:grab;">
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Trigger</div>
              <div style="font-weight:800; font-size:15px;">Intent Matches</div>
            </div>
            <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-tag"></i></div>
          </div>
          <div class="pill" style="font-weight:600; background:var(--bg); border:1px solid var(--border); width:100%; padding:8px;">refund_request</div>
        </div>
        <div style="width:14px; height:14px; border-radius:50%; background:var(--primary); position:absolute; right:-8px; top:50%; transform:translateY(-50%); border:3px solid var(--panel); cursor:crosshair;"></div>
      </div>

      <!-- Node 2: Condition -->
      <div class="flow-node" style="position:absolute; top:100px; left:480px; width:280px; background:var(--panel); border:2px solid var(--primary); border-top:4px solid var(--primary); border-radius:12px; box-shadow:0 0 0 4px color-mix(in srgb, var(--primary) 15%, transparent); z-index:6; cursor:grab;">
        <div style="width:14px; height:14px; border-radius:50%; background:var(--border); position:absolute; left:-8px; top:50%; transform:translateY(-50%); border:3px solid var(--panel);"></div>
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Condition</div>
              <div style="font-weight:800; font-size:15px;">Check Order Date</div>
            </div>
            <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--warn) 10%, transparent); color:var(--warn); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-code-branch"></i></div>
          </div>
          <div style="font-size:14px; font-family:monospace; background:var(--bg); padding:8px; border-radius:6px; border:1px solid var(--border);">order.days_ago < 30</div>
        </div>
        <!-- Outputs -->
        <div style="border-top:1px solid var(--border); padding:12px 16px; position:relative;">
          <div style="font-weight:700; font-size:13px; color:var(--success);">TRUE</div>
          <div style="width:14px; height:14px; border-radius:50%; background:var(--success); position:absolute; right:-8px; top:50%; transform:translateY(-50%); border:3px solid var(--panel); cursor:crosshair;"></div>
        </div>
        <div style="border-top:1px solid var(--border); padding:12px 16px; position:relative;">
          <div style="font-weight:700; font-size:13px; color:var(--danger);">FALSE</div>
          <div style="width:14px; height:14px; border-radius:50%; background:var(--danger); position:absolute; right:-8px; top:50%; transform:translateY(-50%); border:3px solid var(--panel); cursor:crosshair;"></div>
        </div>
      </div>

      <!-- Node 3: Action -->
      <div class="flow-node" style="position:absolute; top:280px; left:860px; width:280px; background:var(--panel); border:1px solid var(--border); border-top:4px solid var(--warn); border-radius:12px; box-shadow:var(--shadow); z-index:5; cursor:grab;">
        <div style="width:14px; height:14px; border-radius:50%; background:var(--border); position:absolute; left:-8px; top:50%; transform:translateY(-50%); border:3px solid var(--panel);"></div>
        <div style="padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Action</div>
              <div style="font-weight:800; font-size:15px;">Escalate to Agent</div>
            </div>
            <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--warn) 10%, transparent); color:var(--warn); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-user-headset"></i></div>
          </div>
          <div class="pill" style="font-weight:600; background:var(--bg); border:1px solid var(--border); width:100%; padding:8px;">Team: Billing</div>
        </div>
      </div>

      <!-- SVG Connections -->
      <svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:1;">
        <!-- Node 1 to Node 2 -->
        <path d="M 380 180 C 430 180, 430 160, 480 160" stroke="var(--primary)" stroke-width="3" fill="none" stroke-linecap="round" />
        <!-- Node 2 False to Node 3 -->
        <path d="M 760 215 C 810 215, 810 340, 860 340" stroke="var(--danger)" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="6,6" />
      </svg>

      <!-- Zoom / Minimap -->
      <div style="position:absolute; bottom:20px; left:20px; display:flex; gap:4px; background:var(--panel); padding:4px; border-radius:8px; border:1px solid var(--border); box-shadow:var(--shadow-sm); z-index:10;">
        <button class="btn ghost small icon"><i class="fa-solid fa-minus"></i></button>
        <button class="btn ghost small" style="font-weight:700; font-family:monospace;">100%</button>
        <button class="btn ghost small icon"><i class="fa-solid fa-plus"></i></button>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; align-items:center; gap:12px;">
      <div style="width:32px; height:32px; border-radius:8px; background:color-mix(in srgb, var(--warn) 10%, transparent); color:var(--warn); display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-code-branch"></i></div>
      <div>
        <div class="title" style="font-size:15px; font-weight:900;">Condition Node</div>
        <div class="muted small">Check Order Date</div>
      </div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Node Name</label>
        <input type="text" class="input full" value="Check Order Date">
      </div>
      
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Condition Logic</label>
        <div style="display:flex; flex-direction:column; gap:12px; background:var(--panel2); padding:16px; border-radius:8px; border:1px solid var(--border);">
          <div style="display:flex; gap:8px;">
            <select class="input" style="flex:1;"><option>order.days_ago</option></select>
            <select class="input" style="width:80px;"><option><</option><option>=</option><option>></option></select>
            <input type="text" class="input" style="width:80px;" value="30">
          </div>
          <button class="btn ghost small taLeft"><i class="fa-solid fa-plus"></i> Add AND / OR</button>
        </div>
      </div>

      <div style="margin-top:auto; padding-top:24px; border-top:1px solid var(--border); display:flex; gap:12px;">
        <button class="btn ghost danger full"><i class="fa-solid fa-trash"></i> Delete Node</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------
// 4. BEHAVIOR
// ---------------------------------------------------------
function renderOsBehavior(main, right) {
  main.innerHTML = `
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%;">
      <div style="margin-bottom:32px;">
        <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Behavior Presets</div>
        <p class="muted" style="margin-top:8px; font-size:15px;">Instantly change how the AI communicates and solves problems.</p>
      </div>

      <div class="grid2" style="gap:24px; margin-bottom:40px;">
        <!-- Preset 1 -->
        <div class="panel soft cursor-pointer" style="border:2px solid var(--primary); box-shadow:0 8px 24px -8px color-mix(in srgb, var(--primary) 30%, transparent); transform:translateY(-2px); padding:24px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div style="width:48px; height:48px; border-radius:12px; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px;"><i class="fa-solid fa-briefcase"></i></div>
            <span class="pill ok" style="font-weight:700;"><i class="fa-solid fa-circle-check"></i> Active</span>
          </div>
          <div class="title" style="font-size:20px; font-weight:800; margin-bottom:8px;">Professional</div>
          <p class="muted small" style="line-height:1.6;">High trust, short answers, consistent tone. Solves problems directly without extra fluff.</p>
        </div>

        <!-- Preset 2 -->
        <div class="panel soft cursor-pointer hover-lift" style="padding:24px; transition:all 0.2s;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div style="width:48px; height:48px; border-radius:12px; background:color-mix(in srgb, var(--success) 15%, transparent); color:var(--success); display:flex; align-items:center; justify-content:center; font-size:20px;"><i class="fa-solid fa-heart"></i></div>
          </div>
          <div class="title" style="font-size:20px; font-weight:800; margin-bottom:8px;">Friendly & Empathetic</div>
          <p class="muted small" style="line-height:1.6;">Warm, conversational, and highly empathetic. Excellent for retention and difficult support tickets.</p>
        </div>

        <!-- Preset 3 -->
        <div class="panel soft cursor-pointer hover-lift" style="padding:24px; transition:all 0.2s;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div style="width:48px; height:48px; border-radius:12px; background:color-mix(in srgb, var(--warn) 15%, transparent); color:var(--warn); display:flex; align-items:center; justify-content:center; font-size:20px;"><i class="fa-solid fa-chart-line"></i></div>
          </div>
          <div class="title" style="font-size:20px; font-weight:800; margin-bottom:8px;">Sales-Driven</div>
          <p class="muted small" style="line-height:1.6;">Proactive, goal-oriented, always suggests next steps. Optimized for lead generation and pricing.</p>
        </div>

        <!-- Preset 4 -->
        <div class="panel soft cursor-pointer hover-lift" style="padding:24px; transition:all 0.2s;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div style="width:48px; height:48px; border-radius:12px; background:color-mix(in srgb, var(--info) 15%, transparent); color:var(--info); display:flex; align-items:center; justify-content:center; font-size:20px;"><i class="fa-solid fa-graduation-cap"></i></div>
          </div>
          <div class="title" style="font-size:20px; font-weight:800; margin-bottom:8px;">Expert Advisor</div>
          <p class="muted small" style="line-height:1.6;">Highly technical, precise, and detailed. Uses industry jargon. Great for B2B technical support.</p>
        </div>
      </div>
      
      <div class="panel soft" style="background:var(--panel2); padding:24px; border:1px solid var(--primary);">
        <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800; color:var(--primary); margin-bottom:16px;">Live Preview: Professional</div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="align-self:flex-end; background:var(--primary); color:#fff; padding:10px 16px; border-radius:12px; max-width:80%; font-size:15px;">I'm really upset, my delivery is 3 days late!</div>
          <div style="align-self:flex-start; background:var(--bg); border:1px solid var(--border); padding:10px 16px; border-radius:12px; max-width:80%; font-size:15px; line-height:1.5;">I apologize for the delay. Let me check the tracking status immediately. Please provide your tracking number.</div>
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Advanced Controls</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:32px;">
      
      <div>
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <label style="font-weight:800; font-size:13px;">Tone / Formality</label>
          <span class="pill" style="font-weight:700; font-family:monospace;">80%</span>
        </div>
        <input type="range" min="1" max="100" value="80" class="full" style="accent-color:var(--primary); height:6px; border-radius:3px;">
        <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Casual</span><span>Formal</span></div>
      </div>
      
      <div>
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <label style="font-weight:800; font-size:13px;">Risk Tolerance</label>
          <span class="pill" style="font-weight:700; font-family:monospace;">20%</span>
        </div>
        <input type="range" min="1" max="100" value="20" class="full" style="height:6px; border-radius:3px;">
        <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Escalate Fast</span><span>Try to Solve</span></div>
      </div>
      
      <div>
        <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
          <label style="font-weight:800; font-size:13px;">Empathy Level</label>
          <span class="pill" style="font-weight:700; font-family:monospace;">50%</span>
        </div>
        <input type="range" min="1" max="100" value="50" class="full" style="height:6px; border-radius:3px;">
        <div style="display:flex; justify-content:space-between;" class="muted small mt-10"><span>Direct</span><span>Highly Empathetic</span></div>
      </div>

      <div style="padding:16px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Forbidden Phrases (Guardrails)</label>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <span class="pill" style="background:var(--panel); border:1px solid var(--border);">"I don't know" <i class="fa-solid fa-xmark muted" style="margin-left:4px;"></i></span>
          <span class="pill" style="background:var(--panel); border:1px solid var(--border);">"Calm down" <i class="fa-solid fa-xmark muted" style="margin-left:4px;"></i></span>
        </div>
        <input type="text" class="input full smallInput" placeholder="Add phrase...">
      </div>

    </div>
  `;
}

// ---------------------------------------------------------
// 5. RULES (AUTOMATIONS)
// ---------------------------------------------------------
function renderOsRules(main, right) {
  main.innerHTML = `
    <div style="padding:40px; max-width:900px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Rule Engine</div>
          <p class="muted" style="margin-top:8px; font-size:15px;">Global IF/THEN rules that override standard AI behavior.</p>
        </div>
        <button class="btn primary"><i class="fa-solid fa-plus"></i> Create Rule</button>
      </div>

      <div class="panel soft" style="overflow:hidden;">
        <div style="padding:24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel2);">
          <div>
            <div class="title" style="font-size:16px; margin-bottom:8px;">High-Value Lead Escalation</div>
            <div style="font-family:monospace; font-size:14px; background:var(--bg); padding:12px 16px; border-radius:8px; border:1px solid var(--border); color:var(--text); display:inline-block;">
              <span style="color:var(--primary); font-weight:800;">IF</span> intent = pricing <span style="color:var(--primary); font-weight:800;">AND</span> sentiment = positive <br>
              <span style="color:var(--warn); font-weight:800; margin-top:8px; display:inline-block;">THEN</span> escalate to Sales Team
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
            <div class="toggle"><input type="checkbox" checked style="width:48px; height:28px;"></div>
          </div>
        </div>
        
        <div style="padding:24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
          <div>
            <div class="title" style="font-size:16px; margin-bottom:8px;">Off-hours Failover</div>
            <div style="font-family:monospace; font-size:14px; background:var(--bg); padding:12px 16px; border-radius:8px; border:1px solid var(--border); color:var(--text); display:inline-block;">
              <span style="color:var(--primary); font-weight:800;">IF</span> time > 17:00 <span style="color:var(--primary); font-weight:800;">AND</span> intent = support <br>
              <span style="color:var(--warn); font-weight:800; margin-top:8px; display:inline-block;">THEN</span> switch AI Behavior to 'Advisor'
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
            <div class="toggle"><input type="checkbox" checked style="width:48px; height:28px;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Rule Editor</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Rule Name</label>
        <input type="text" class="input full" value="High-Value Lead Escalation">
      </div>
      
      <div style="padding:16px; background:var(--panel2); border:1px solid var(--border); border-radius:8px;">
        <label style="font-weight:900; display:block; margin-bottom:12px; font-size:14px; color:var(--primary);">IF (Conditions)</label>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <select class="input"><option>Intent</option></select>
          <select class="input"><option>Equals</option></select>
          <select class="input" style="flex:1;"><option>pricing</option></select>
        </div>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <select class="input"><option>Sentiment</option></select>
          <select class="input"><option>Equals</option></select>
          <select class="input" style="flex:1;"><option>Positive</option></select>
        </div>
        <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Condition</button>
      </div>

      <div style="padding:16px; background:color-mix(in srgb, var(--warn) 5%, transparent); border:1px solid color-mix(in srgb, var(--warn) 30%, transparent); border-radius:8px;">
        <label style="font-weight:900; display:block; margin-bottom:12px; font-size:14px; color:var(--warn);">THEN (Actions)</label>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <select class="input full"><option>Escalate to Team</option></select>
        </div>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <select class="input full"><option>Sales Team</option></select>
        </div>
        <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Action</button>
      </div>

      <button class="btn primary full mt-10">Save Rule</button>
    </div>
  `;
}

// ---------------------------------------------------------
// 6. KNOWLEDGE
// ---------------------------------------------------------
function renderOsKnowledge(main, right) {
  main.innerHTML = `
    <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Knowledge Control</div>
          <p class="muted" style="margin-top:8px; font-size:15px;">Manage what the AI knows, prioritize sources, and resolve conflicts.</p>
        </div>
        <button class="btn primary"><i class="fa-solid fa-upload"></i> Upload Source</button>
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
            <tr style="background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);">
              <td style="padding-left:24px; padding-top:16px; padding-bottom:16px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">Return_Policy_2025.pdf</div>
                <div class="muted small"><i class="fa-solid fa-tag"></i> refunds, policy</div>
              </td>
              <td><span class="pill" style="font-weight:700;">PDF</span></td>
              <td><span class="pill warn" style="font-weight:700;">High</span></td>
              <td class="taRight" style="padding-right:24px;"><span class="pill ok"><i class="fa-solid fa-check"></i> Synced</span></td>
            </tr>
            <tr>
              <td style="padding-left:24px; padding-top:16px; padding-bottom:16px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">Pricing FAQs</div>
                <div class="muted small"><i class="fa-solid fa-tag"></i> sales, pricing</div>
              </td>
              <td><span class="pill" style="font-weight:700;">Text</span></td>
              <td><span class="pill" style="font-weight:700;">Normal</span></td>
              <td class="taRight" style="padding-right:24px;"><span class="pill ok"><i class="fa-solid fa-check"></i> Synced</span></td>
            </tr>
            <tr>
              <td style="padding-left:24px; padding-top:16px; padding-bottom:16px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">https://example.com/help</div>
                <div class="muted small"><i class="fa-solid fa-rotate"></i> Auto-sync</div>
              </td>
              <td><span class="pill" style="font-weight:700;">URL</span></td>
              <td><span class="pill muted" style="font-weight:700;">Low</span></td>
              <td class="taRight" style="padding-right:24px;"><span class="pill warn"><i class="fa-solid fa-arrows-rotate"></i> Syncing...</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Source Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      
      <div>
        <div style="font-size:18px; font-weight:900; word-break:break-all;">Return_Policy_2025.pdf</div>
        <div class="muted small" style="margin-top:4px;">Uploaded 2 days ago</div>
      </div>

      <div class="grid2" style="gap:12px;">
        <div class="panel soft" style="padding:16px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:4px;">Usage (30d)</div>
          <div style="font-size:24px; font-weight:900;">1,240</div>
        </div>
        <div class="panel soft" style="padding:16px; text-align:center;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:4px;">AI Confidence</div>
          <div style="font-size:24px; font-weight:900; color:var(--success);">98%</div>
        </div>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Priority Level</label>
        <select class="input full">
          <option>High (Overrides conflicts)</option>
          <option>Normal</option>
          <option>Low (Fallback only)</option>
        </select>
        <p class="muted small" style="margin-top:8px; line-height:1.4;">If two documents contradict each other, the AI will trust the one with higher priority.</p>
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Assigned Intents (Tags)</label>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
          <span class="pill" style="background:var(--bg); border:1px solid var(--border); font-weight:600;">refunds <i class="fa-solid fa-xmark muted" style="margin-left:4px;"></i></span>
          <span class="pill" style="background:var(--bg); border:1px solid var(--border); font-weight:600;">policy <i class="fa-solid fa-xmark muted" style="margin-left:4px;"></i></span>
        </div>
        <button class="btn ghost small"><i class="fa-solid fa-plus"></i> Add Intent</button>
      </div>

    </div>
  `;
}

// ---------------------------------------------------------
// 7. TRAINING
// ---------------------------------------------------------
function renderOsTraining(main, right) {
  main.innerHTML = `
    <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Intent Training</div>
          <p class="muted" style="margin-top:8px; font-size:15px;">Improve AI accuracy by mapping unrecognized inputs.</p>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
        <div class="panel soft" style="display:flex; flex-direction:column; overflow:hidden; max-height:600px;">
          <div class="panelHead" style="padding:20px 24px; background:var(--panel2);">
            <div class="title" style="font-size:16px;">Active Intents</div>
          </div>
          <div style="padding:0; overflow-y:auto;">
            <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);">
              <div>
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">refund_request</div>
                <div class="muted small"><span style="font-weight:700; color:var(--text);">45</span> examples • <span style="color:var(--success); font-weight:700;">98%</span> accuracy</div>
              </div>
              <i class="fa-solid fa-chevron-right muted"></i>
            </div>
            <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
              <div>
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">pricing_inquiry</div>
                <div class="muted small"><span style="font-weight:700; color:var(--text);">32</span> examples • <span style="color:var(--success); font-weight:700;">92%</span> accuracy</div>
              </div>
              <i class="fa-solid fa-chevron-right muted"></i>
            </div>
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
                <button class="btn primary">Map</button>
              </div>
            </div>
            <div style="padding:24px; border-bottom:1px solid var(--border); transition:background 0.2s;" onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
              <div style="font-style:italic; font-size:16px; font-weight:500; color:var(--text); margin-bottom:16px; background:var(--bg); padding:16px; border-radius:8px; border:1px solid var(--border);">"Can you send an invoice for last month?"</div>
              <div style="display:flex; gap:10px;">
                <select class="input" style="flex:1; font-weight:600;"><option>Select Intent...</option><option>billing_issue</option></select>
                <button class="btn primary">Map</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Intent Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      
      <div>
        <div style="font-size:20px; font-weight:900;">refund_request</div>
        <div class="muted small" style="margin-top:4px; display:flex; gap:8px;">
          <span style="color:var(--success); font-weight:700;">98% Accuracy</span> • 45 Examples
        </div>
      </div>

      <div style="padding:16px; background:var(--bg); border:1px solid var(--border); border-radius:8px;">
        <label style="font-weight:800; display:block; margin-bottom:12px; font-size:13px;">Training Examples</label>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
          <div class="pill" style="justify-content:space-between; padding:8px 12px; font-size:13px; background:var(--panel); border:1px solid var(--border);">"I need a refund" <i class="fa-solid fa-trash muted"></i></div>
          <div class="pill" style="justify-content:space-between; padding:8px 12px; font-size:13px; background:var(--panel); border:1px solid var(--border);">"Give me my money back" <i class="fa-solid fa-trash muted"></i></div>
          <div class="pill" style="justify-content:space-between; padding:8px 12px; font-size:13px; background:var(--panel); border:1px solid var(--border);">"Return order 1234" <i class="fa-solid fa-trash muted"></i></div>
        </div>
        <input type="text" class="input full" placeholder="Type new example and hit Enter...">
      </div>

      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Merge Intent</label>
        <select class="input full"><option>Merge with...</option></select>
      </div>

    </div>
  `;
}

// ---------------------------------------------------------
// 8. EXPERIMENTS
// ---------------------------------------------------------
function renderOsExperiments(main, right) {
  main.innerHTML = `
    <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Experiments</div>
          <p class="muted" style="margin-top:8px; font-size:15px;">A/B test responses and behaviors.</p>
        </div>
        <button class="btn primary"><i class="fa-solid fa-flask"></i> New Experiment</button>
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
            <tr style="background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary);">
              <td style="padding:16px 24px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">Greeting Optimization</div>
                <div class="muted small">Testing conversion impact of opening line</div>
              </td>
              <td><span class="pill ok" style="font-weight:700;">Running</span></td>
              <td><div style="font-weight:700;">Friendly</div><div class="muted small">45% conv.</div></td>
              <td><div style="font-weight:700;">Professional</div><div class="muted small">52% conv.</div></td>
              <td class="taRight" style="padding-right:24px;">
                <span class="muted small" style="font-style:italic;">Gathering data...</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;">
                <div style="font-weight:800; font-size:15px; margin-bottom:4px;">Sales vs Advisor Profile</div>
                <div class="muted small">Behavior engine comparison</div>
              </td>
              <td><span class="pill" style="font-weight:700;">Ended</span></td>
              <td><div style="font-weight:700; color:var(--muted);">Sales-driven</div><div class="muted small">18% conv.</div></td>
              <td><div style="font-weight:700; color:var(--muted);">Advisor</div><div class="muted small">12% conv.</div></td>
              <td class="taRight" style="padding-right:24px;">
                <span class="pill success" style="font-weight:800; font-size:13px;"><i class="fa-solid fa-trophy" style="margin-right:6px;"></i> Sales-driven</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Experiment Details</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      
      <div>
        <div style="font-size:20px; font-weight:900;">Greeting Optimization</div>
        <div class="pill ok" style="margin-top:8px; display:inline-flex;">Running (14 days left)</div>
      </div>

      <div class="panel soft" style="padding:16px; border-color:var(--primary);">
        <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px; color:var(--primary);">Variant A: Friendly</div>
        <div style="font-size:14px; font-style:italic; background:var(--bg); padding:12px; border-radius:6px; border:1px solid var(--border);">"Hi there! 😊 I'm so happy to help you today. What can I do for you?"</div>
        <div style="margin-top:12px; display:flex; justify-content:space-between; font-weight:700;">
          <span>Conversion:</span>
          <span>45.2%</span>
        </div>
      </div>

      <div class="panel soft" style="padding:16px;">
        <div class="muted small" style="font-weight:800; text-transform:uppercase; margin-bottom:8px;">Variant B: Professional</div>
        <div style="font-size:14px; font-style:italic; background:var(--bg); padding:12px; border-radius:6px; border:1px solid var(--border);">"Hello. I am the AI assistant. How may I assist you?"</div>
        <div style="margin-top:12px; display:flex; justify-content:space-between; font-weight:700;">
          <span>Conversion:</span>
          <span style="color:var(--success);">52.1%</span>
        </div>
      </div>

      <button class="btn primary full mt-10">End & Deploy Variant B</button>
    </div>
  `;
}

// ---------------------------------------------------------
// 9. PERFORMANCE
// ---------------------------------------------------------
function renderOsPerformance(main, right) {
  main.innerHTML = `
    <div style="padding:40px; max-width:1000px; margin:0 auto; width:100%;">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
        <div>
          <div class="title" style="font-size:28px; font-weight:900; letter-spacing:-0.02em;">Performance Analytics</div>
        </div>
        <button class="btn secondary"><i class="fa-solid fa-download"></i> Export</button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; margin-bottom:32px;">
        <div class="panel soft" style="padding:24px;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Resolution Rate</div>
          <div style="font-size:32px; font-weight:900; margin-bottom:8px;">68%</div>
          <div class="muted small" style="display:flex; justify-content:space-between;"><span>No human needed</span> <span style="color:var(--success); font-weight:800;">+4.2%</span></div>
        </div>
        <div class="panel soft" style="padding:24px;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Conversion</div>
          <div style="font-size:32px; font-weight:900; margin-bottom:8px;">12.4%</div>
          <div class="muted small" style="display:flex; justify-content:space-between;"><span>Sales intents</span> <span style="color:var(--success); font-weight:800;">+1.8%</span></div>
        </div>
        <div class="panel soft" style="padding:24px;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Escalation Rate</div>
          <div style="font-size:32px; font-weight:900; margin-bottom:8px;">32%</div>
          <div class="muted small" style="display:flex; justify-content:space-between;"><span>Handed off</span> <span style="color:var(--danger); font-weight:800;">-2.1%</span></div>
        </div>
        <div class="panel soft" style="padding:24px;">
          <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Response Time</div>
          <div style="font-size:32px; font-weight:900; margin-bottom:8px;">1.2s</div>
          <div class="muted small" style="display:flex; justify-content:space-between;"><span>Avg latency</span> <span>--</span></div>
        </div>
      </div>

      <div class="panel soft" style="border-color:var(--danger); margin-bottom:24px;">
        <div class="panelHead" style="background:color-mix(in srgb, var(--danger) 5%, transparent); padding:20px 24px;">
          <div class="title" style="font-size:16px;"><i class="fa-solid fa-fire" style="color:var(--danger); margin-right:8px;"></i> Top Issue: Technical Troubleshooting</div>
        </div>
        <div style="padding:24px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:800; font-size:16px; margin-bottom:8px;">Escalation rate is 85% for technical intents.</div>
            <p class="muted">The AI lacks deep troubleshooting knowledge. Adding API documentation will reduce escalations.</p>
          </div>
          <button class="btn primary" onclick="gotoAiOs('knowledge')">Add Knowledge</button>
        </div>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Filters</div>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px;">
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Date Range</label>
        <select class="input full"><option>Last 30 Days</option><option>Last 7 Days</option></select>
      </div>
      <div>
        <label style="font-weight:800; display:block; margin-bottom:8px; font-size:13px;">Channel</label>
        <select class="input full"><option>All Channels</option><option>Web Chat</option></select>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------
// 10. LOGS & REPLAY
// ---------------------------------------------------------
function renderOsLogs(main, right) {
  main.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%;">
      <div style="padding:24px 32px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
        <div class="title" style="font-size:20px; font-weight:900;">Activity Logs</div>
        <div style="display:flex; gap:12px;">
          <input class="input" placeholder="Search logs..." style="width:250px;">
          <select class="input"><option>All Intents</option></select>
        </div>
      </div>
      
      <div style="flex:1; overflow-y:auto; padding:24px 32px;">
        <table class="table" style="width:100%;">
          <thead>
            <tr>
              <th style="padding-left:16px;">Time</th>
              <th>User</th>
              <th>Intent</th>
              <th>Outcome</th>
              <th class="taRight" style="padding-right:16px;">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background:var(--panel2); box-shadow:inset 2px 0 0 0 var(--primary); cursor:pointer;">
              <td class="muted small" style="padding-left:16px; font-weight:700;">14:22:05</td>
              <td style="font-weight:600;">john@example.com</td>
              <td><span class="pill" style="font-weight:600;">refund_request</span></td>
              <td><span class="pill ok" style="font-weight:600;">Resolved</span></td>
              <td class="taRight" style="padding-right:16px;"><button class="btn ghost small"><i class="fa-solid fa-play"></i> Replay</button></td>
            </tr>
            <tr style="cursor:pointer;">
              <td class="muted small" style="padding-left:16px; font-weight:700;">14:15:33</td>
              <td style="font-weight:600;">+46701234567</td>
              <td><span class="pill warn" style="font-weight:600;">technical_issue</span></td>
              <td><span class="pill warn" style="font-weight:600;">Escalated</span></td>
              <td class="taRight" style="padding-right:16px;"><button class="btn ghost small"><i class="fa-solid fa-play"></i> Replay</button></td>
            </tr>
            <tr style="cursor:pointer;">
              <td class="muted small" style="padding-left:16px; font-weight:700;">13:50:12</td>
              <td style="font-weight:600;" class="muted">Unknown</td>
              <td><span class="pill danger" style="font-weight:600;">unrecognized</span></td>
              <td><span class="pill danger" style="font-weight:600;">Fallback</span></td>
              <td class="taRight" style="padding-right:16px;"><button class="btn ghost small"><i class="fa-solid fa-play"></i> Replay</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  right.innerHTML = `
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2);">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Playback & Reasoning</div>
    </div>
    
    <!-- Chat playback -->
    <div style="padding:20px; display:flex; flex-direction:column; gap:16px; background:var(--bg); border-bottom:1px solid var(--border);">
      <div style="align-self:flex-end; background:var(--primary); color:#fff; padding:12px 16px; border-radius:12px; max-width:90%; font-size:14px; box-shadow:var(--shadow-sm);">I need a refund for my last order!</div>
      <div style="align-self:flex-start; background:var(--panel); border:1px solid var(--primary); padding:12px 16px; border-radius:12px; max-width:90%; font-size:14px; box-shadow:var(--shadow-sm);">I can help process a refund right away. Could you please provide your order number?</div>
    </div>

    <!-- Timeline / Reasoning -->
    <div style="padding:24px; display:flex; flex-direction:column; gap:20px; overflow-y:auto; flex:1;">
      <div style="position:relative; padding-left:24px; border-left:2px solid var(--border);">
        <div style="position:absolute; left:-7px; top:0; width:12px; height:12px; border-radius:50%; background:var(--primary); border:2px solid var(--panel);"></div>
        <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">14:22:05 - Intent Detected</div>
        <div style="font-weight:700; font-size:14px;">refund_request (98%)</div>
      </div>
      
      <div style="position:relative; padding-left:24px; border-left:2px solid var(--border);">
        <div style="position:absolute; left:-7px; top:0; width:12px; height:12px; border-radius:50%; background:var(--warn); border:2px solid var(--panel);"></div>
        <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">14:22:06 - Knowledge Searched</div>
        <div style="font-weight:700; font-size:14px;">Return_Policy_2025.pdf</div>
      </div>

      <div style="position:relative; padding-left:24px; border-left:2px solid transparent;">
        <div style="position:absolute; left:-7px; top:0; width:12px; height:12px; border-radius:50%; background:var(--success); border:2px solid var(--panel);"></div>
        <div class="muted small" style="font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">14:22:07 - Action</div>
        <div style="font-weight:700; font-size:14px;">AI Responded</div>
        <button class="btn secondary small mt-10" onclick="gotoAiOs('training')">Edit Training Data</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------
// NEW: CHAT EXPERIENCE BUILDER
// ---------------------------------------------------------
function renderOsChatExperience(main, right) {
  right.style.display = "none";
  main.style.flexDirection = "row";
  
  main.innerHTML = `
    <div style="flex:1; display:flex; flex-direction:column; background:var(--bg); border-right:1px solid var(--border);">
      <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
        <div class="title" style="font-size:16px;"><i class="fa-solid fa-mobile-screen" style="margin-right:8px; color:var(--primary);"></i> Live Chat Preview</div>
        <div style="display:flex; gap:8px;">
          <button class="btn ghost small icon" onclick="renderOsChatExperience(document.getElementById('aiOsMainWorkspace'), document.getElementById('aiOsRightPanel'))"><i class="fa-solid fa-rotate-right"></i></button>
          <button class="btn ghost small icon"><i class="fa-solid fa-expand"></i></button>
        </div>
      </div>
      
      <div style="flex:1; display:flex; justify-content:center; align-items:center; padding:40px; background:radial-gradient(circle, var(--border) 1px, transparent 1px); background-size:20px 20px;">
        <!-- Mobile Phone Mockup -->
        <div style="width:360px; height:640px; background:var(--panel); border:8px solid #222; border-radius:32px; box-shadow:0 24px 48px rgba(0,0,0,0.2); display:flex; flex-direction:column; overflow:hidden; position:relative;">
          
          <!-- Header -->
          <div id="chatPreviewHeader" style="background:var(--primary); color:#fff; padding:16px; display:flex; align-items:center; gap:12px; cursor:pointer; transition:background 0.3s;" class="hover-outline">
            <div style="width:36px; height:36px; background:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--primary); font-weight:bold; transition:color 0.3s;" id="chatPreviewAvatar">AI</div>
            <div>
              <div style="font-weight:700; font-size:15px;" id="chatPreviewName">AI Support</div>
              <div style="font-size:12px; opacity:0.8;">Typically replies instantly</div>
            </div>
          </div>
          
          <!-- Chat Area -->
          <div id="chatPreviewArea" style="flex:1; background:var(--bg); padding:16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto; scroll-behavior: smooth;">
            
            <div style="align-self:flex-start; background:var(--panel2); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5; cursor:pointer; position:relative;" class="hover-outline">
              <span id="chatPreviewGreeting">Hi! I'm the AI assistant. How can I help you today?</span>
            </div>
            
            <div id="chatPreviewQuickReplies" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
              <!-- Quick replies will be injected here -->
            </div>
            
          </div>
          
          <!-- Input Area -->
          <div style="padding:12px 16px; background:var(--panel); border-top:1px solid var(--border); display:flex; gap:12px; align-items:center;">
            <input type="text" id="chatPreviewInput" style="flex:1; background:var(--bg); border:1px solid var(--border); padding:10px 16px; border-radius:20px; font-size:14px; outline:none;" placeholder="Reply...">
            <button id="chatPreviewSendBtn" style="background:transparent; border:none; color:var(--primary); cursor:pointer; font-size:18px; transition:color 0.3s;"><i class="fa-solid fa-paper-plane"></i></button>
          </div>
          
        </div>
      </div>
    </div>
    
    <!-- Editor Panel (Right Side, 400px) -->
    <div style="width:400px; background:var(--panel); display:flex; flex-direction:column; overflow-y:auto;">
      <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); position:sticky; top:0; z-index:10;">
        <div class="title" style="font-size:16px; font-weight:900;">Chat Experience Builder</div>
        <p class="muted small" style="margin-top:4px;">Changes apply instantly to the live preview.</p>
      </div>
      
      <div style="padding:24px; display:flex; flex-direction:column; gap:32px;">
        
        <!-- Section 1: Greeting -->
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="width:24px; height:24px; border-radius:6px; background:var(--primary-fade); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-hand-wave"></i></div>
            <div style="font-weight:800; font-size:15px;">Greeting Flow</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label class="muted small" style="font-weight:700; margin-bottom:4px; display:block;">Initial Message</label>
              <textarea id="editorGreeting" class="input full" rows="3">Hi! I'm the AI assistant. How can I help you today?</textarea>
            </div>
          </div>
        </div>
        
        <hr style="border:0; border-top:1px solid var(--border);">
        
        <!-- Section 2: UI & Branding -->
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="width:24px; height:24px; border-radius:6px; background:var(--success-fade); color:var(--success); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-palette"></i></div>
            <div style="font-weight:800; font-size:15px;">UI & Branding</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label class="muted small" style="font-weight:700;">Primary Color</label>
              <input type="color" id="editorColor" value="#4F46E5" style="width:40px; height:30px; border:none; cursor:pointer; background:none;">
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label class="muted small" style="font-weight:700;">Bot Name</label>
              <input type="text" id="editorBotName" class="input" value="AI Support" style="width:180px;">
            </div>
          </div>
        </div>

        <hr style="border:0; border-top:1px solid var(--border);">
        
        <!-- Section 3: Quick Replies -->
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border-radius:6px; background:var(--info-fade); color:var(--info); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-reply"></i></div>
              <div style="font-weight:800; font-size:15px;">Quick Replies</div>
            </div>
            <button id="editorAddReplyBtn" class="btn ghost small icon"><i class="fa-solid fa-plus"></i></button>
          </div>
          <div id="editorRepliesList" style="display:flex; flex-direction:column; gap:8px;">
            <!-- Rendered by JS -->
          </div>
        </div>

        <hr style="border:0; border-top:1px solid var(--border);">

        <!-- Section 4: Behavior Preset -->
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="width:24px; height:24px; border-radius:6px; background:var(--warn-fade); color:var(--warn); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-brain"></i></div>
            <div style="font-weight:800; font-size:15px;">AI Persona</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <select id="editorPersona" class="input full">
              <option value="professional">Professional & Direct</option>
              <option value="friendly">Friendly & Empathetic</option>
              <option value="sales">Sales-driven</option>
            </select>
          </div>
        </div>

      </div>
      
      <div style="padding:20px; border-top:1px solid var(--border); background:var(--panel2); position:sticky; bottom:0; z-index:10;">
        <button class="btn primary full" onclick="osToast('Deployed', 'Chat Experience is now live in production.')"><i class="fa-solid fa-rocket"></i> Deploy Experience</button>
      </div>
    </div>
  `;
  
  // STATE & LOGIC
  let primaryColor = "#4F46E5";
  let quickReplies = ["Pricing", "Support", "Talk to human"];
  
  const updatePreviewUI = () => {
    // Colors
    document.getElementById("chatPreviewHeader").style.background = primaryColor;
    document.getElementById("chatPreviewSendBtn").style.color = primaryColor;
    document.getElementById("chatPreviewAvatar").style.color = primaryColor;
    
    // Update all user bubbles
    document.querySelectorAll(".user-bubble").forEach(el => {
      el.style.background = primaryColor;
    });
    
    // Update all quick replies
    const qrContainer = document.getElementById("chatPreviewQuickReplies");
    qrContainer.innerHTML = "";
    quickReplies.forEach(qr => {
      const span = document.createElement("span");
      span.className = "pill cursor-pointer hover-outline";
      span.style.cssText = `background:var(--bg); border:1px solid ${primaryColor}; color:${primaryColor}; font-weight:600;`;
      span.innerText = qr;
      span.onclick = () => {
        sendUserMessage(qr);
      };
      qrContainer.appendChild(span);
    });
    
    // Update Editor List
    const listContainer = document.getElementById("editorRepliesList");
    listContainer.innerHTML = "";
    quickReplies.forEach((qr, idx) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex; gap:8px; align-items:center;";
      row.innerHTML = `
        <i class="fa-solid fa-grip-vertical muted cursor-pointer"></i>
        <input type="text" class="input full reply-input" data-idx="${idx}" value="${qr}">
        <button class="btn ghost small icon delete-reply-btn" data-idx="${idx}"><i class="fa-solid fa-xmark"></i></button>
      `;
      listContainer.appendChild(row);
    });
    
    // Bind reply inputs
    document.querySelectorAll(".reply-input").forEach(inp => {
      inp.addEventListener("input", (e) => {
        quickReplies[e.target.getAttribute("data-idx")] = e.target.value;
        updatePreviewUI();
      });
    });
    
    // Bind delete buttons
    document.querySelectorAll(".delete-reply-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = e.currentTarget.getAttribute("data-idx");
        quickReplies.splice(idx, 1);
        updatePreviewUI();
      });
    });
  };
  
  // BINDINGS
  document.getElementById("editorGreeting").addEventListener("input", (e) => {
    document.getElementById("chatPreviewGreeting").innerText = e.target.value;
  });
  
  document.getElementById("editorBotName").addEventListener("input", (e) => {
    document.getElementById("chatPreviewName").innerText = e.target.value;
  });
  
  document.getElementById("editorColor").addEventListener("input", (e) => {
    primaryColor = e.target.value;
    updatePreviewUI();
  });
  
  document.getElementById("editorAddReplyBtn").addEventListener("click", () => {
    quickReplies.push("New Option");
    updatePreviewUI();
  });
  
  // CHAT SIMULATION LOGIC
  const chatArea = document.getElementById("chatPreviewArea");
  const inputEl = document.getElementById("chatPreviewInput");
  const sendBtn = document.getElementById("chatPreviewSendBtn");
  
  const sendUserMessage = (text) => {
    if (!text.trim()) return;
    
    // Hide quick replies
    document.getElementById("chatPreviewQuickReplies").style.display = "none";
    
    // Add user bubble
    const userMsg = document.createElement("div");
    userMsg.className = "user-bubble";
    userMsg.style.cssText = `align-self:flex-end; background:${primaryColor}; color:#fff; padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5; margin-top:16px; animation:osSlideIn 0.2s ease forwards;`;
    userMsg.innerText = text;
    chatArea.appendChild(userMsg);
    
    inputEl.value = "";
    chatArea.scrollTop = chatArea.scrollHeight;
    
    // Simulate AI thinking
    const typingMsg = document.createElement("div");
    typingMsg.style.cssText = "align-self:flex-start; background:var(--panel2); border:1px solid var(--border); padding:12px 16px; border-radius:12px; font-size:14px; color:var(--muted); margin-top:8px;";
    typingMsg.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> AI is typing...';
    chatArea.appendChild(typingMsg);
    chatArea.scrollTop = chatArea.scrollHeight;
    
    setTimeout(() => {
      typingMsg.remove();
      
      const aiMsg = document.createElement("div");
      aiMsg.style.cssText = "align-self:flex-start; background:var(--panel2); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5; margin-top:8px; animation:osSlideIn 0.2s ease forwards;";
      
      const persona = document.getElementById("editorPersona").value;
      if (persona === "professional") {
        aiMsg.innerText = "I understand. I will assist you with this matter immediately. Please provide your order ID.";
      } else if (persona === "friendly") {
        aiMsg.innerText = "Oh, I'm so sorry to hear you need help with that! 😔 Don't worry at all, I'm here for you! Could you share your order number so we can look into it together?";
      } else {
        aiMsg.innerText = "Absolutely. Let's get this resolved fast so you can get back to business. What's your order number?";
      }
      
      chatArea.appendChild(aiMsg);
      chatArea.scrollTop = chatArea.scrollHeight;
    }, 1200);
  };
  
  sendBtn.addEventListener("click", () => sendUserMessage(inputEl.value));
  inputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendUserMessage(inputEl.value);
  });
  
  // Initial render
  updatePreviewUI();
}
