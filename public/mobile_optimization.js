
// --- MOBILE OPTIMIZATION ---
window.toggleSidebar = function () {
    const sb = document.querySelector('.sidebar');
    const ov = document.querySelector('.mobile-overlay');
    if (sb) sb.classList.toggle('active');
    if (ov) ov.classList.toggle('active');

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
            btn.type = 'button';
            btn.onclick = window.toggleSidebar;

            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.style.gap = '10px';

            titleContainer.insertBefore(btn, titleContainer.firstChild);
        }
    });

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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
    initMobileMenu();
}


/* === CHAT EMPTY STATE RENDERING === */
function renderEmptyChatState() {
    const container = document.getElementById("messages");
    if (!container) return;

    // Only render if seemingly empty (no real messages)
    if (container.querySelector(".msg")) return;

    // Determine Company Name dynamically
    let companyName = "Din AI Assistent";

    // Try to get from UI first (most accurate reflection of user selection)
    const categorySelect = document.getElementById("categorySelect");
    if (categorySelect && categorySelect.selectedOptions.length > 0) {
        let text = categorySelect.selectedOptions[0].text;
        // If format is "slug - Name", extract Name
        if (text.includes(" - ")) {
            const parts = text.split(" - ");
            if (parts.length > 1) text = parts.slice(1).join(" - ");
        }
        // If format is "Name (id)", extract Name
        if (text.includes(" (")) {
            text = text.split(" (")[0];
        }

        if (text && text.trim()) companyName = text.trim();
    } else if (typeof state !== 'undefined' && state.currentCompany) {
        // Fallback to internal state
        companyName = state.currentCompany.name || state.currentCompany.id;
    } else if (typeof state !== 'undefined' && state.companyId) {
        companyName = state.companyId === 'demo' ? 'EFFEKT Sverige AB' : state.companyId;
    }

    container.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center; color:var(--text); padding:20px;">
      <div style="width:72px; height:72px; background:linear-gradient(135deg, var(--primary), var(--primary2)); border-radius:24px; display:flex; align-items:center; justify-content:center; margin-bottom:24px; box-shadow:0 12px 30px var(--primary-fade); animation: float 6s ease-in-out infinite;">
        <i class="fa-solid fa-robot" style="font-size:36px; color:white;"></i>
      </div>
      <h2 style="margin:0 0 12px 0; font-size:24px; font-weight:800; color:var(--text);">Välkommen till ${companyName}</h2>
      <p style="max-width:420px; line-height:1.6; color:var(--muted); font-size:15px; margin-bottom:30px;">
        Jag är din intelligenta assistent för ${companyName}, redo att hjälpa dig dygnet runt. Hur kan jag underlätta för dig idag?
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

    // Check when clearing chat
    const clearBtn = document.getElementById("clearChatBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            setTimeout(renderEmptyChatState, 200);
        });
    }

    // Check when changing company
    const categorySelect = document.getElementById("categorySelect");
    if (categorySelect) {
        categorySelect.addEventListener("change", () => {
            // Wait for main script to potentially load new chat or clear it
            setTimeout(renderEmptyChatState, 500);
        });
    }
});
