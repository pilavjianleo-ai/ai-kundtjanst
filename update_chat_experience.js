const fs = require('fs');

let code = fs.readFileSync('public/ai_os.js', 'utf8');

// Find the start and end of renderOsChatExperience
const startIdx = code.indexOf('function renderOsChatExperience');
if (startIdx !== -1) {
  const newChatExperienceCode = `function renderOsChatExperience(main, right) {
  right.style.display = "none";
  main.style.flexDirection = "row";
  
  main.innerHTML = \`
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
  \`;
  
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
      span.style.cssText = \`background:var(--bg); border:1px solid \${primaryColor}; color:\${primaryColor}; font-weight:600;\`;
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
      row.innerHTML = \`
        <i class="fa-solid fa-grip-vertical muted cursor-pointer"></i>
        <input type="text" class="input full reply-input" data-idx="\${idx}" value="\${qr}">
        <button class="btn ghost small icon delete-reply-btn" data-idx="\${idx}"><i class="fa-solid fa-xmark"></i></button>
      \`;
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
    userMsg.style.cssText = \`align-self:flex-end; background:\${primaryColor}; color:#fff; padding:12px 16px; border-radius:12px; max-width:85%; font-size:14px; line-height:1.5; margin-top:16px; animation:osSlideIn 0.2s ease forwards;\`;
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
`;
  
  const endIdx = code.indexOf('\n// ---------------------------------------------------------', startIdx + 10);
  if (endIdx !== -1) {
    code = code.substring(0, startIdx) + newChatExperienceCode + code.substring(endIdx);
    fs.writeFileSync('public/ai_os.js', code);
    console.log('Successfully replaced renderOsChatExperience');
  } else {
    code = code.substring(0, startIdx) + newChatExperienceCode;
    fs.writeFileSync('public/ai_os.js', code);
    console.log('Replaced till end of file');
  }
} else {
  console.log('Function not found!');
}
