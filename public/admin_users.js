
/* ========================
   ADMIN USER MANAGEMENT
   Handles user listing, creation and deletion
======================== */

async function loadAdminUsers() {
    const list = document.getElementById("adminUsersList");
    if (!list) return;

    list.innerHTML = `<div class="muted center" style="padding:20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Laddar användare...</div>`;

    try {
        const users = await api("/admin/users");
        if (!users || users.length === 0) {
            list.innerHTML = `<div class="muted center" style="padding:20px;">Inga användare hittades</div>`;
            return;
        }

        list.innerHTML = users.map(u => `
            <div class="listItem" style="display:flex; justify-content:space-between; align-items:center; padding:12px;">
                <div>
                    <div style="font-weight:600;">${u.username} <span class="pill ${u.role === 'admin' ? 'danger' : 'info'} small">${u.role}</span></div>
                    <div class="muted small">${u.email || 'Ingen e-post'} • ${u.companyId || 'Inget bolag'}</div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn ghost small icon" onclick="deleteUser('${u._id}')" title="Radera">
                        <i class="fa-solid fa-trash" style="color:var(--danger)"></i>
                    </button>
                </div>
            </div>
        `).join("");
    } catch (e) {
        list.innerHTML = `<div class="alert error">${e.message}</div>`;
    }
}

async function deleteUser(userId) {
    if (!confirm("Är du säker på att du vill radera denna användare?")) return;

    try {
        await api(`/admin/users/${userId}`, { method: "DELETE" });
        toast("Raderad", "Användaren har raderats", "info");
        loadAdminUsers();
    } catch (e) {
        toast("Fel", e.message, "error");
    }
}

// Tab Switching inside Admin
function setAdminTab(tabId, btn) {
    const panels = document.querySelectorAll("#adminView .tabPanel");
    panels.forEach(p => p.style.display = "none");

    const target = document.getElementById(tabId);
    if (target) target.style.display = "block";

    const btns = document.querySelectorAll("#adminView .tabs button");
    btns.forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    if (tabId === "tabUsers") loadAdminUsers();
}

// Hook into the global init
document.addEventListener("DOMContentLoaded", () => {
    const refreshBtn = document.getElementById("adminUsersRefreshBtn");
    if (refreshBtn) refreshBtn.onclick = loadAdminUsers;

    // Add event listeners to admin tabs if they exist
    const adminTabs = document.querySelectorAll("#adminView .tabs button");
    adminTabs.forEach(btn => {
        const tabId = btn.getAttribute("onclick")?.match(/'([^']+)'/)?.[1];
        if (tabId) {
            // Already handled by inline onclick in HTML usually, but let's ensure consistency
        }
    });
});
