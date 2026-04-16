const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Update Live Studio (Timeline / Real-time Execution Trace)
const liveRegex = /function renderOsLiveStudio[\s\S]*?main\.innerHTML = `[\s\S]*?`;\n\}/m;
const newLive = `function renderOsLiveStudio(main, right) {
  const s = window.AiOsEngine.state;
  const cx = s.chatExperience;
  
  main.innerHTML = \`
    <div style="display:flex; height:100%; width:100%;">
      <div style="width:280px; border-right:1px solid var(--border); display:flex; flex-direction:column; background:var(--panel2);">
        <div style="padding:20px; border-bottom:1px solid var(--border);">
          <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Test Scenarios</div>
        </div>
        <div style="padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; flex:1;">
          <div class="listItem active" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('I need a refund for my broken item');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Refund Request</div>
            <div class="muted small" style="margin-top:4px;">Tests intent detection and flow execution</div>
          </div>
          <div class="listItem" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('How much does it cost? I love it!');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Pricing + Positive</div>
            <div class="muted small" style="margin-top:4px;">Tests sentiment rules and escalation</div>
          </div>
          <div class="listItem" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('I need support with my account');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Support Issue</div>
            <div class="muted small" style="margin-top:4px;">Tests knowledge retrieval</div>
          </div>
          <div class="listItem" style="padding:16px; border-radius:8px; cursor:pointer;" onclick="if(window.aiosLiveWidget) window.aiosLiveWidget.sendMessage('What is the weather today?');">
            <div style="font-weight:800; font-size:14px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Out of Scope</div>
            <div class="muted small" style="margin-top:4px;">Tests fallback handling</div>
          </div>
        </div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column; background:var(--bg); align-items:center; justify-content:center; padding:40px; position:relative;">
        <div style="position:absolute; top:24px; left:32px;">
          <div class="title" style="font-size:24px; font-weight:900;">Live Studio Simulator</div>
          <div class="muted">Test your AI configuration in real-time.</div>
        </div>
        <div id="aios-live-chat-container" style="width:400px; height:650px; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,0.1); border-radius:16px;"></div>
      </div>
    </div>
  \`;

  right.innerHTML = \`
    <div style="padding:20px; border-bottom:1px solid var(--border); background:var(--panel2); display:flex; justify-content:space-between; align-items:center;">
      <div class="title" style="font-size:14px; text-transform:uppercase; letter-spacing:0.05em; font-weight:800;">Execution Trace</div>
      <button class="btn ghost small icon" onclick="
        document.getElementById('debugTimeline').innerHTML = '<div class=\\'muted center\\' style=\\'padding:40px 0;\\'>Waiting for input...</div>';
      "><i class="fa-solid fa-trash-can"></i></button>
    </div>
    <div style="padding:24px; display:flex; flex-direction:column; gap:24px; overflow-y:auto; flex:1;" id="debugTimeline">
      <div class="muted center" style="padding:40px 0;">Waiting for input...</div>
    </div>
  \`;

  setTimeout(() => {
    const container = document.getElementById('aios-live-chat-container');
    if (container) {
      window.aiosLiveWidget = new ChatWidget(container, cx, window.AiOsEngine.simulateChat.bind(window.AiOsEngine), (debug) => {
        
        const timeline = document.getElementById('debugTimeline');
        
        // Build timeline HTML
        let html = \`
          <div style="display:flex; flex-direction:column; gap:16px; position:relative;">
            <div style="position:absolute; top:10px; bottom:10px; left:11px; width:2px; background:var(--border); z-index:0;"></div>
            
            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-magnifying-glass" style="font-size:10px; color:var(--text);"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:var(--text); margin-bottom:4px;">1. Intent Detection</div>
                <div class="pill" style="font-weight:700; background:var(--bg); border:1px solid var(--border); font-size:13px;">\${debug.intent || 'unknown'}</div>
              </div>
            </div>

            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid \${debug.ruleTriggered ? 'var(--warn)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-scale-balanced" style="font-size:10px; color:\${debug.ruleTriggered ? 'var(--warn)' : 'var(--text)'};"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:\${debug.ruleTriggered ? 'var(--warn)' : 'var(--text)'}; margin-bottom:4px;">2. Rule Engine</div>
                \${debug.ruleTriggered ? 
                  \`<div class="pill warn" style="font-weight:700; font-size:13px;">\${debug.ruleTriggered}</div>\` : 
                  \`<div class="muted small" style="font-style:italic;">No rules triggered</div>\`}
              </div>
            </div>

            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid \${debug.flowTriggered ? 'var(--primary)' : 'var(--border)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-network-wired" style="font-size:10px; color:\${debug.flowTriggered ? 'var(--primary)' : 'var(--text)'};"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:\${debug.flowTriggered ? 'var(--primary)' : 'var(--text)'}; margin-bottom:4px;">3. Flow Execution</div>
                \${debug.flowTriggered ? 
                  \`<div class="pill" style="font-weight:700; background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary); border:1px solid color-mix(in srgb, var(--primary) 30%, transparent); font-size:13px;">\${debug.flowTriggered}</div>\` : 
                  \`<div class="muted small" style="font-style:italic;">No flows matched</div>\`}
              </div>
            </div>

            <div style="display:flex; gap:16px; position:relative; z-index:1;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--panel2); border:2px solid var(--success); display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;"><i class="fa-solid fa-check" style="font-size:10px; color:var(--success);"></i></div>
              <div>
                <div style="font-weight:800; font-size:13px; text-transform:uppercase; color:var(--success); margin-bottom:4px;">4. Final Output</div>
                <div class="pill info" style="font-weight:700; font-size:13px;">Persona: \${debug.persona || 'Default'}</div>
              </div>
            </div>
          </div>
          <hr style="border:none; border-top:1px dashed var(--border); margin:24px 0;">
        \`;
        
        // Append to top, remove waiting message if there
        if(timeline.innerHTML.includes('Waiting for input')) {
          timeline.innerHTML = html;
        } else {
          timeline.innerHTML = html + timeline.innerHTML;
        }
      });
    }
  }, 50);
}
`;

if(content.match(liveRegex)) {
  content = content.replace(liveRegex, newLive);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Live Studio updated with Timeline.');
}
