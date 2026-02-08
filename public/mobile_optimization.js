
// --- MOBILE OPTIMIZATION ---
window.toggleSidebar = function () {
    const sb = document.querySelector('.sidebar');
    const ov = document.querySelector('.mobile-overlay');
    if (sb) sb.classList.toggle('active');
    if (ov) ov.classList.toggle('active');

    // Prevent background scrolling when menu represents overlay
    if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
    } else {
        document.body.style.overflow = 'hidden';
    }
};

function initMobileMenu() {
    const topbars = document.querySelectorAll('.topbar');
    topbars.forEach(tb => {
        const titleContainer = tb.firstElementChild;
        if (titleContainer && !titleContainer.querySelector('.mobile-menu-btn')) {
            const btn = document.createElement('button');
            btn.className = 'mobile-menu-btn';
            btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
            btn.type = 'button'; // Prevent form submission
            btn.onclick = window.toggleSidebar;

            // Style container to show button inline
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.gap = '10px';

            titleContainer.insertBefore(btn, titleContainer.firstChild);
        }
    });

    // Close menu on click (mobile)
    document.querySelectorAll('.menuBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 900) {
                document.querySelector('.sidebar')?.classList.remove('active');
                document.querySelector('.mobile-overlay')?.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
}

// Ensure init runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    // If loaded late, run immediately
    initMobileMenu();
}


/* === CHAT EMPTY STATE RENDERING === */
function renderEmptyChatState() {
    const container = document.getElementById("messages");
    if (!container) return;

    // Only render if seemingly empty (no real messages)
    // Check for .msg class children
    if (container.querySelector(".msg")) return;

    // Render the welcome screen styling matching user request
    container.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; color:var(--text); padding:20px;">
      <div style="width:72px; height:72px; background:linear-gradient(135deg, var(--primary), var(--primary2)); border-radius:24px; display:flex; align-items:center; justify-content:center; margin-bottom:24px; box-shadow:0 12px 30px var(--primary-fade); animation: float 6s ease-in-out infinite;">
        <i class="fa-solid fa-robot" style="font-size:36px; color:white;"></i>
      </div>
      <h2 style="margin:0 0 12px 0; font-size:24px; font-weight:800; color:var(--text);">Välkommen till EFFEKT Sverige AB</h2>
      <p style="max-width:420px; line-height:1.6; color:var(--muted); font-size:15px; margin-bottom:30px;">
        Jag är din intelligenta assistent för EFFEKT Sverige AB, redo att hjälpa dig dygnet runt. Hur kan jag underlätta för dig idag?
      </p>
      
      <div class="suggestionChips" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
        <button type="button" class="btn ghost small" style="background:var(--panel); border:1px solid var(--border); border-radius:100px; padding:10px 18px; font-size:13px;" onclick="setChatInput('Hur fungerar det?')">Hur fungerar det?</button>
        <button type="button" class="btn ghost small" style="background:var(--panel); border:1px solid var(--border); border-radius:100px; padding:10px 18px; font-size:13px;" onclick="setChatInput('Vilka priser har ni?')">Vilka priser har ni?</button>
        <button type="button" class="btn ghost small" style="background:var(--panel); border:1px solid var(--border); border-radius:100px; padding:10px 18px; font-size:13px;" onclick="setChatInput('Prata med person')">Prata med person</button>
      </div>

      <style>
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
          100% { transform: translateY(0px); }
        }
      </style>
    </div>
  `;
}

window.setChatInput = function (text) {
    const input = document.getElementById("messageInput");
    if (input) {
        input.value = text;
        input.focus();
    }
};

// Check empty state periodically or on load
document.addEventListener("DOMContentLoaded", () => {
    // Initial check
    setTimeout(renderEmptyChatState, 200);

    // Also check when clearing chat (if clear button exists)
    const clearBtn = document.getElementById("clearChatBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            setTimeout(renderEmptyChatState, 200);
        });
    }
});
