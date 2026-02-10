
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

        const roleFilter = document.getElementById("adminRoleFilter")?.value || "all";
        const q = String(document.getElementById("adminUsersSearch")?.value || "").toLowerCase();
        const filtered = users.filter(u => {
          const roleOk = roleFilter === "all" ? true : u.role === roleFilter;
          const text = `${u.username || ""} ${u.email || ""} ${u._id || ""}`.toLowerCase();
          const searchOk = q ? text.includes(q) : true;
          return roleOk && searchOk;
        });

        list.innerHTML = filtered.map(u => {
          const roleClass =
            u.role === 'admin' ? 'badge-admin' :
            u.role === 'agent' ? 'badge-agent' : 'badge-user';
          return `
            <div class="listItem adminUserItem"
              data-id="${u._id}"
              onclick="selectAdminUser('${u._id}', this)"
              style="display:flex; justify-content:space-between; align-items:center; padding:12px; gap:10px; border:1px solid var(--border); border-radius:16px;">
              <div style="flex:1; min-width:0;">
                <div style="font-weight:800; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-user"></i>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${u.username}</span>
                  <span class="${roleClass}" style="display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; text-transform:lowercase; letter-spacing:0.5px;">${u.role}</span>
                </div>
                <div class="muted small" style="margin-top:4px;">
                  ${u.email || 'Ingen e-post'} • ID: ${u._id}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <select class="input smallInput" onchange="updateUserRole('${u._id}', this.value)">
                  <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                  <option value="agent" ${u.role === 'agent' ? 'selected' : ''}>agent</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                </select>
                ${(u.role !== 'admin' || (window.currentUser && window.currentUser.id !== u._id)) ? `
                  <button class="btn danger small" onclick="deleteUser('${u._id}')" title="Radera">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join("");

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

async function updateUserRole(id, role) {
    try {
        const valid = ["user", "agent", "admin"];
        if (!valid.includes(role)) return;
        await api(`/admin/users/${id}/role`, {
            method: "PATCH",
            body: JSON.stringify({ role })
        });
        toast("Uppdaterad", "Roll uppdaterad", "success");
        loadAdminUsers();
    } catch (e) {
        toast("Fel", "Kunde inte uppdatera roll: " + e.message, "error");
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
    const rf = document.getElementById("adminRoleFilter");
    if (rf) rf.addEventListener("change", loadAdminUsers);
    let searchDebounce = null;
    const si = document.getElementById("adminUsersSearch");
    if (si) si.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadAdminUsers, 250);
    });

    // Make deleteUser global
    window.deleteUser = deleteUser;
    window.updateUserRole = updateUserRole;
    window.selectAdminUser = function(id, el) {
      const list = document.getElementById("adminUsersList");
      list.querySelectorAll(".adminUserItem").forEach(item => {
        item.style.boxShadow = "";
        item.style.borderColor = "var(--border)";
      });
      if (el) {
        el.style.boxShadow = "0 0 0 2px var(--primary-fade)";
        el.style.borderColor = "var(--primary)";
      }
    };
});
