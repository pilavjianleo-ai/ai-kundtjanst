
/* ========================
   ADMIN: USER MANAGEMENT
======================== */
async function loadAdminUsers() {
    const list = $("adminUsersList");
    const msg = $("adminUsersMsg");
    if (!list) return;

    list.innerHTML = `<div class="muted center" style="padding:20px;">Laddar användare...</div>`;
    if (msg) msg.style.display = "none";

    try {
        const users = await api("/admin/users");
        if (!users || users.length === 0) {
            list.innerHTML = `<div class="muted center" style="padding:20px;">Inga användare hittades.</div>`;
            return;
        }

        list.innerHTML = users.map(u => `
      <div class="listItem" style="display:flex; justify-content:space-between; align-items:center; padding:10px;">
        <div>
          <div style="font-weight:600; display:flex; align-items:center; gap:8px;">
            <i class="fa-solid fa-user"></i> ${u.username} 
            <span class="badge ${u.role === 'admin' ? 'highlight' : 'soft'}">${u.role}</span>
          </div>
          <div class="muted small" style="margin-top:4px;">
            ${u.email || 'Ingen e-post'} • Skapad: ${new Date(u.createdAt).toLocaleDateString()}
            ${u.companyId ? `• Bolag: ${u.companyId}` : ''}
          </div>
        </div>
        ${u.role !== 'admin' || (window.currentUser && window.currentUser.id !== u._id) ?
                `<button class="btn danger small" onclick="deleteUser('${u._id}')" title="Radera">
             <i class="fa-solid fa-trash"></i>
           </button>`
                : ''}
      </div>
    `).join("");

    } catch (e) {
        if (msg) {
            msg.textContent = "Kunde inte ladda användare: " + e.message;
            msg.style.display = "block";
        }
        list.innerHTML = `<div class="alert error">Fel vid laddning</div>`;
    }
}

async function deleteUser(id) {
    if (!confirm("Är du säker på att du vill radera denna användare? Detta kan inte ångras.")) return;
    try {
        await api(`/admin/users/${id}`, { method: "DELETE" });
        toast("Klart", "Användare raderad", "success");
        loadAdminUsers();
    } catch (e) {
        toast("Fel", "Kunde inte radera: " + e.message, "error");
    }
}

/* ========================
   ADMIN: TAB SWITCHING
======================== */
window.setAdminTab = function (tabName) {
    // Hide all panels
    const panels = ["tabUsers", "tabKB", "tabAI", "tabWidget"];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    // Show selected
    let targetId = "";
    if (tabName === 'users') targetId = "tabUsers";
    if (tabName === 'kb') targetId = "tabKB";
    if (tabName === 'ai') targetId = "tabAI";
    if (tabName === 'widget') targetId = "tabWidget";

    const target = document.getElementById(targetId);
    if (target) {
        target.style.display = "block";

        // Load data if needed
        if (tabName === 'users') loadAdminUsers();
    }

    // Update buttons state (optional, if buttons have IDs like btn_tab_users)
    document.querySelectorAll('.adminTabBtn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('btn_tab_' + tabName);
    if (activeBtn) activeBtn.classList.add('active');
};

// Initialize listeners
document.addEventListener("DOMContentLoaded", () => {
    const btnRefresh = document.getElementById("adminUsersRefreshBtn");
    if (btnRefresh) {
        btnRefresh.addEventListener("click", loadAdminUsers);
    }

    // Make deleteUser global
    window.deleteUser = deleteUser;
});
