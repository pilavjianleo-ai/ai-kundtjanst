const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

const newAiOsHtml = `      <!-- AI CONTROL CENTER (Standalone Enterprise OS) -->
      <section id="aiOsView" class="view" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; background:var(--bg); flex-direction:column; overflow:hidden; font-family:system-ui, sans-serif;">
        <!-- TOP BAR -->
        <header style="height:56px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; padding:0 20px; background:var(--panel); flex-shrink:0;">
          <div style="display:flex; align-items:center; gap:20px;">
            <div style="font-weight:900; font-size:16px; display:flex; align-items:center; gap:8px; letter-spacing:-0.02em;">
              <div style="width:28px; height:28px; background:var(--primary); color:#fff; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:14px;"><i class="fa-solid fa-microchip"></i></div>
              AI Operating System
            </div>
            <div style="display:flex; background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:3px;">
              <button class="btn small" style="background:var(--panel); color:var(--text); border:1px solid var(--border); padding:4px 12px; border-radius:4px; height:auto; font-weight:600; box-shadow:var(--shadow-sm);">Test</button>
              <button class="btn small ghost" style="padding:4px 12px; border-radius:4px; height:auto; color:var(--muted); font-weight:600;">Live</button>
            </div>
            <span class="pill ok" style="font-weight:600;"><i class="fa-solid fa-circle-check" style="margin-right:4px;"></i> System Healthy</span>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
            <button class="btn ghost small" onclick="closeAiOs()"><i class="fa-solid fa-arrow-left"></i> Back to App</button>
            <button class="btn primary small"><i class="fa-solid fa-rocket"></i> Deploy Changes</button>
            <div style="width:28px; height:28px; border-radius:50%; background:var(--primary-fade); color:var(--primary); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px;">U</div>
          </div>
        </header>

        <!-- BODY -->
        <div style="display:flex; flex:1; overflow:hidden;">
          <!-- LEFT SIDEBAR -->
          <aside style="width:240px; background:var(--panel2); border-right:1px solid var(--border); display:flex; flex-direction:column; padding:16px 0; z-index:10; flex-shrink:0;">
            <div id="aiOsNav" style="display:flex; flex-direction:column; gap:2px; padding:0 12px; overflow-y:auto;">
              <!-- Nav Items Injected by JS -->
            </div>
          </aside>

          <!-- MAIN WORKSPACE -->
          <main id="aiOsMainWorkspace" style="flex:1; display:flex; flex-direction:column; position:relative; overflow:hidden; background:var(--bg);">
            <!-- Rendered content -->
          </main>

          <!-- RIGHT PANEL -->
          <aside id="aiOsRightPanel" style="width:360px; background:var(--panel); border-left:1px solid var(--border); display:flex; flex-direction:column; overflow-y:auto; z-index:10; flex-shrink:0;">
            <!-- Context aware properties -->
          </aside>
        </div>
      </section>`;

// Extract the exact section string from the old HTML using regex
const regex = /<section id="aiOsView" class="view" style="display:none; padding:0; height:calc\(100vh - 0px\); overflow:hidden;">[\s\S]*?<\/section>/m;

if (html.match(regex)) {
  html = html.replace(regex, newAiOsHtml);
  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('Fixed index.html aiOsView structure');
} else {
  console.log('Regex did not match.');
}
