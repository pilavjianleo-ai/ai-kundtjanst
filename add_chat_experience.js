const fs = require('fs');

let code = fs.readFileSync('public/ai_os.js', 'utf8');

// Add navigation
code = code.replace(
  '<button class="menuBtn" data-aios="live-studio"><i class="fa-solid fa-play-circle"></i> Live Studio</button>',
  '<button class="menuBtn" data-aios="live-studio"><i class="fa-solid fa-play-circle"></i> Live Studio</button>\n    <button class="menuBtn" data-aios="chat-experience"><i class="fa-solid fa-message"></i> Chat Experience</button>'
);

// Add switch case
code = code.replace(
  'case "live-studio": renderOsLiveStudio(main, right); break;',
  'case "live-studio": renderOsLiveStudio(main, right); break;\n    case "chat-experience": renderOsChatExperience(main, right); break;'
);

// Add the new function
const chatExperienceCode = `
// ---------------------------------------------------------
// NEW: CHAT EXPERIENCE BUILDER
// ---------------------------------------------------------
function renderOsChatExperience(main, right) {
  // Hide the global right panel because this module uses a full-width internal layout
  right.style.display = "none";
  main.style.flexDirection = "row";
  
  main.innerHTML = \\\`
    <div style="flex:1; display:flex; flex-direction:column; background:var(--bg); border-right:1px solid var(--border);">
      <div style="padding:16px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--panel);">
        <div class="title" style="font-size:16px;"><i class="fa-solid fa-mobile-screen" style="margin-right:8px; color:var(--primary);"></i> Live Chat Preview</div>
        <div style="display:flex; gap:8px;">
          <button class="btn ghost small icon"><i class="fa-solid fa-rotate-right"></i></button>
          <button class="btn ghost small icon"><i class="fa-solid fa-expand"></i></button>
        </div>
      </div>
      
      <div style="flex:1; display:flex; justify-content:center; align-items:center; padding:40px; background:radial-gradient(circle, var(--border) 1px, transparent 1px); background-size:20px 20px;">
        <!-- Mobile Phone Mockup -->
        <div style="width:360px; height:640px; background:var(--panel); border:8px solid #222; border-radius:32px; box-shadow:0 24px 48px rgba(0,0,0,0.2); display:flex; flex-direction:column; overflow:hidden; position:relative;">
          
          <!-- Header -->
          <div style="background:var(--primary); color:#fff; padding:16px; display:flex; align-items:center; gap:12px; cursor:pointer;" class="hover-outline" onclick="osToast('Editor', 'Opened Header Settings')">
            <div style="width:36px; height:36px; background:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--primary); font-weight:bold;">AI</div>
            <div>
              <div style="font-weight:700; font-size:15px;">AI Support</div>
              <div style="font-size:12px; opacity:0.8;">Typically replies instantly</div>
            </div>
          </div>
          
          <!-- Chat Area -->
          <div style="flex:1; background:var(--bg); padding:16px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
            
            <div style="align-self:flex-start; background:var(--panel2); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5; cursor:pointer; position:relative;" class="hover-outline" onclick="osToast('Editor', 'Opened Greeting Settings')">
              Hi! I'm the AI assistant. How can I help you today?
              <div class="edit-badge" style="position:absolute; top:-10px; right:-10px; background:var(--primary); color:#fff; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; opacity:0;"><i class="fa-solid fa-pen"></i></div>
            </div>
            
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
              <span class="pill cursor-pointer hover-outline" style="background:var(--bg); border:1px solid var(--primary); color:var(--primary); font-weight:600;" onclick="osToast('Editor', 'Opened Quick Reply Settings')">Pricing</span>
              <span class="pill cursor-pointer hover-outline" style="background:var(--bg); border:1px solid var(--primary); color:var(--primary); font-weight:600;" onclick="osToast('Editor', 'Opened Quick Reply Settings')">Support</span>
            </div>
            
            <div style="align-self:flex-end; background:var(--primary); color:#fff; padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5; margin-top:16px;">I need help with my recent order.</div>
            
            <div style="align-self:flex-start; background:var(--panel2); border:1px solid var(--border); padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5; cursor:pointer; position:relative;" class="hover-outline" onclick="osToast('Editor', 'Opened Response Settings')">
              I can help with that. Could you please provide your order number? It usually starts with #ORD.
              <div class="edit-badge" style="position:absolute; top:-10px; right:-10px; background:var(--primary); color:#fff; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; opacity:0;"><i class="fa-solid fa-pen"></i></div>
            </div>
            
          </div>
          
          <!-- Input Area -->
          <div style="padding:12px 16px; background:var(--panel); border-top:1px solid var(--border); display:flex; gap:12px; align-items:center; cursor:pointer;" class="hover-outline" onclick="osToast('Editor', 'Opened Input Settings')">
            <div style="flex:1; background:var(--bg); border:1px solid var(--border); padding:10px 16px; border-radius:20px; font-size:14px; color:var(--muted);">Reply...</div>
            <div style="color:var(--primary);"><i class="fa-solid fa-paper-plane"></i></div>
          </div>
          
        </div>
      </div>
    </div>
    
    <!-- Editor Panel (Right Side, 400px) -->
    <div style="width:400px; background:var(--panel); display:flex; flex-direction:column; overflow-y:auto;">
      <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); position:sticky; top:0; z-index:10;">
        <div class="title" style="font-size:16px; font-weight:900;">Chat Experience Builder</div>
        <p class="muted small" style="margin-top:4px;">Click any element in the preview to edit it instantly.</p>
      </div>
      
      <div style="padding:24px; display:flex; flex-direction:column; gap:32px;">
        
        <!-- Section 1 -->
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="width:24px; height:24px; border-radius:6px; background:var(--primary-fade); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-hand-wave"></i></div>
            <div style="font-weight:800; font-size:15px;">Greeting Flow</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label class="muted small" style="font-weight:700; margin-bottom:4px; display:block;">Initial Message</label>
              <textarea class="input full" rows="3">Hi! I'm the AI assistant. How can I help you today?</textarea>
            </div>
            <div style="display:flex; gap:12px;">
              <div style="flex:1;">
                <label class="muted small" style="font-weight:700; margin-bottom:4px; display:block;">Delay (ms)</label>
                <input type="number" class="input full" value="1000">
              </div>
              <div style="flex:1;">
                <label class="muted small" style="font-weight:700; margin-bottom:4px; display:block;">Personalization</label>
                <select class="input full"><option>First Name</option><option>None</option></select>
              </div>
            </div>
          </div>
        </div>
        
        <hr style="border:0; border-top:1px solid var(--border);">
        
        <!-- Section 2 -->
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="width:24px; height:24px; border-radius:6px; background:var(--success-fade); color:var(--success); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-palette"></i></div>
            <div style="font-weight:800; font-size:15px;">UI & Branding</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label class="muted small" style="font-weight:700;">Primary Color</label>
              <div style="display:flex; gap:8px; align-items:center;">
                <div style="width:24px; height:24px; border-radius:4px; background:var(--primary); cursor:pointer;"></div>
                <span class="pill" style="font-family:monospace;">#4F46E5</span>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label class="muted small" style="font-weight:700;">Bot Avatar</label>
              <button class="btn ghost small">Upload Image</button>
            </div>
          </div>
        </div>

        <hr style="border:0; border-top:1px solid var(--border);">
        
        <!-- Section 3 -->
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border-radius:6px; background:var(--info-fade); color:var(--info); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-reply"></i></div>
              <div style="font-weight:800; font-size:15px;">Quick Replies</div>
            </div>
            <button class="btn ghost small icon"><i class="fa-solid fa-plus"></i></button>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; gap:8px; align-items:center;">
              <i class="fa-solid fa-grip-vertical muted cursor-pointer"></i>
              <input type="text" class="input full" value="Pricing">
              <button class="btn ghost small icon"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <i class="fa-solid fa-grip-vertical muted cursor-pointer"></i>
              <input type="text" class="input full" value="Support">
              <button class="btn ghost small icon"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>
        </div>

        <hr style="border:0; border-top:1px solid var(--border);">

        <!-- Section 4 -->
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <div style="width:24px; height:24px; border-radius:6px; background:var(--warn-fade); color:var(--warn); display:flex; align-items:center; justify-content:center; font-size:12px;"><i class="fa-solid fa-shield-halved"></i></div>
            <div style="font-weight:800; font-size:15px;">Guardrails & Escalation</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div>
              <label class="muted small" style="font-weight:700; margin-bottom:4px; display:block;">Escalate When...</label>
              <select class="input full"><option>Confidence < 70%</option><option>User asks for human</option><option>Negative sentiment</option></select>
            </div>
            <div>
              <label class="muted small" style="font-weight:700; margin-bottom:4px; display:block;">Escalate To</label>
              <select class="input full"><option>General Queue</option><option>Sales Team</option><option>Support Tier 2</option></select>
            </div>
          </div>
        </div>

      </div>
      
      <div style="padding:20px; border-top:1px solid var(--border); background:var(--panel2); position:sticky; bottom:0; z-index:10;">
        <button class="btn primary full" onclick="osToast('Success', 'Chat Experience changes deployed instantly!')"><i class="fa-solid fa-rocket"></i> Deploy Experience</button>
      </div>
    </div>
  \\\`;
  
  // Add inline styles for hover effects
  if (!document.getElementById("chatExperienceStyles")) {
    const style = document.createElement("style");
    style.id = "chatExperienceStyles";
    style.innerHTML = \\\`
      .hover-outline { transition: all 0.2s ease; }
      .hover-outline:hover { outline: 2px dashed var(--primary); outline-offset: 2px; border-radius: 8px; }
      .hover-outline:hover .edit-badge { opacity: 1 !important; }
    \\\`;
    document.head.appendChild(style);
  }
}
\n`;

code += chatExperienceCode;

// Update global switch logic to handle restoring right panel
code = code.replace(
  '  right.innerHTML = "";\n\n  switch(currentAiOsRoute)',
  '  right.innerHTML = "";\n  right.style.display = "flex";\n  main.style.flexDirection = "column";\n\n  switch(currentAiOsRoute)'
);

fs.writeFileSync('public/ai_os.js', code);
console.log('Done!');
