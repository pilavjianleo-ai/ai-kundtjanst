/* =========================================================
   AI Kundtjänst - script.js (FULL STABLE VERSION)
   ✅ Behåller layouten exakt
   ✅ Matchar server.js endpoints 100%
   ✅ Chat + tickets + inbox + admin + SLA + KB funkar
   ✅ Inbox highlight + liten toast-notis
   ✅ Agent ser INTE Admin-knappen
   ✅ Agent ser SLA (sin statistik speglas automatiskt i backend)
   ========================================================= */

/* =========================
   CONFIG
========================= */
const API_BASE = ""; // same origin

const LS = {
  token: "ai_token",
  user: "ai_user",
  theme: "ai_theme",
  debug: "ai_debug",
  chatConversation: "ai_chat_conversation",
  currentCompanyId: "ai_company_id",
  lastTicketId: "ai_last_ticket_id",
  lastInboxOpenCount: "ai_last_inbox_open_count",
  lastMyTicketsCount: "ai_last_my_tickets_count",
};

let state = {
  token: localStorage.getItem(LS.token) || "",
  user: safeJsonParse(localStorage.getItem(LS.user)) || null,
  companyId: localStorage.getItem(LS.currentCompanyId) || "demo",

  conversation: safeJsonParse(localStorage.getItem(LS.chatConversation)) || [],
  lastTicketId: localStorage.getItem(LS.lastTicketId) || "",

  selectedMyTicketId: null,
  selectedInboxTicketId: null,

  debug: localStorage.getItem(LS.debug) === "1",

  chartTrend: null,
  pollingTimer: null,
  inboxOpenCount: Number(localStorage.getItem(LS.lastInboxOpenCount) || 0),
  myTicketsCount: Number(localStorage.getItem(LS.lastMyTicketsCount) || 0),
};

/* =========================
   DOM helpers
========================= */
const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function setLS(key, value) {
  if (value === null || value === undefined || value === "") localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function show(el, on = true) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setActiveMenu(btnId) {
  const ids = ["openChatView", "openMyTicketsView", "openInboxView", "openSlaView", "openAdminView", "openSettingsView"];
  ids.forEach((id) => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle("active", id === btnId);
  });
}

function switchView(viewId) {
  const views = ["authView", "chatView", "myTicketsView", "inboxView", "slaView", "adminView", "settingsView"];
  views.forEach((id) => show($(id), id === viewId));
}

/* =========================
   API helper
========================= */
async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!headers["Content-Type"] && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";

  let res, data;
  try {
    res = await fetch(API_BASE + path, { ...opts, headers });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) data = await res.json().catch(() => null);
    else data = await res.text().catch(() => null);
  } catch (e) {
    toast("Nätverksfel. Kontrollera din anslutning.");
    throw new Error("Nätverksfel");
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    toast(msg);
    throw new Error(msg);
  }
  return data;
}

async function safeApi(path, opts = {}) {
  try {
    return await api(path, opts);
  } catch (e) {
    // toast already shown in api()
    return null;
  }
}

/* =========================
   UI helpers
========================= */
// Set alert message for accessibility and feedback
function setAlert(el, msg, type = "") {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error");
  if (type === "error") el.classList.add("error");
  show(el, !!msg);
  if (msg) {
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "assertive");
  } else {
    el.removeAttribute("role");
    el.removeAttribute("aria-live");
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleString("sv-SE");
  } catch {
    return "";
  }
}

function msToPretty(ms) {
  if (ms == null || !Number.isFinite(ms)) return "-";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const hh = h % 24;
  const mm = m % 60;

  if (d > 0) return `${d}d ${hh}h ${mm}m`;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function pct(v) {
  if (v == null) return "-";
  return `${v}%`;
}

function pill(label, kind = "") {
  const cls =
    kind === "ok"
      ? "pill ok"
      : kind === "warn"
      ? "pill warn"
      : kind === "danger"
      ? "pill danger"
      : "pill";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

/* =========================
   Toast (liten notis)
========================= */
// Show toast notification (accessible)
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toastMsg";
  t.textContent = msg;
  t.setAttribute("role", "status");
  t.setAttribute("aria-live", "polite");
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 30);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Anpassad för nya chat-komponenten
  const savedTheme = localStorage.getItem(LS.theme);
  if (savedTheme) document.body.setAttribute("data-theme", savedTheme);

  // Tema-toggle (mörk/ljust)
  const themeBtn = document.querySelector('.fa-moon');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = document.body.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem(LS.theme, next);
    });
  }

  // Visa debugpanel om debug är aktivt
  const debugPanel = document.getElementById("debugPanel");
  if (debugPanel) debugPanel.style.display = state.debug ? "block" : "none";

  // Chat-form hantering
  const chatForm = document.getElementById("chatForm");
  if (chatForm) {
    chatForm.addEventListener("submit", function(e) {
      e.preventDefault();
      sendChat();
    });
  }

  // Enter i input skickar också
  const messageInput = document.getElementById("messageInput");
  if (messageInput) {
    messageInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
  }

  // Rendera ev. sparad konversation
  renderConversation();

  // SLA/KPI-dashboard: ladda och rendera direkt
  if (document.getElementById("slaStatsBox")) {
    renderSlaDashboard();
    // Bind filter och export
    const daysSelect = document.getElementById("slaDaysSelect");
    if (daysSelect) daysSelect.addEventListener("change", renderSlaDashboard);
    const exportBtn = document.getElementById("slaExportCsvBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportSlaCsvDashboard);
  }
// === SLA/KPI-dashboard-funktioner ===
async function renderSlaDashboard() {
  const statsBox = document.getElementById("slaStatsBox");
  const tableBox = document.getElementById("slaTableBox");
  const chartEl = document.getElementById("slaChart");
  const days = Number(document.getElementById("slaDaysSelect")?.value || 30);
  if (statsBox) statsBox.innerHTML = "<div class='muted small'>Laddar statistik...</div>";
  if (tableBox) tableBox.innerHTML = "<div class='muted small'>Laddar tabell...</div>";
  if (!statsBox || !tableBox || !chartEl) return;
  // Hämta statistik från backend
  const overview = await safeApi(`/admin/sla/overview?days=${days}`);
  const trend = await safeApi(`/admin/sla/trend/weekly?days=${days}`);
  const tickets = await safeApi(`/admin/sla/tickets?days=${days}`);
  // Rendera statistik
  if (overview && statsBox) {
    statsBox.innerHTML = `
      <div><b>Totalt antal tickets:</b> ${overview.totalTickets ?? '-'}</div>
      <div><b>First compliance:</b> ${overview.firstResponse?.compliancePct ?? '-'}%</div>
      <div><b>Resolution compliance:</b> ${overview.resolution?.compliancePct ?? '-'}%</div>
      <div><b>Brutna SLA (first):</b> ${overview.firstResponse?.breaches ?? '-'}</div>
      <div><b>Brutna SLA (resolution):</b> ${overview.resolution?.breaches ?? '-'}</div>
    `;
  } else if (statsBox) {
    statsBox.innerHTML = "<div class='alert error'>Kunde inte ladda statistik.</div>";
  }
  // Rendera graf
  if (trend && window.Chart && chartEl) {
    if (window._slaChart) window._slaChart.destroy();
    window._slaChart = new Chart(chartEl.getContext('2d'), {
      type: 'line',
      data: {
        labels: trend.labels,
        datasets: [
          { label: 'Tickets', data: trend.tickets, borderColor: '#5b8cff', backgroundColor: 'rgba(91,140,255,0.12)', fill: true },
          { label: 'Brutna SLA', data: trend.breaches, borderColor: '#ff4d6d', backgroundColor: 'rgba(255,77,109,0.10)', fill: true }
        ]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#f4f6fa' } } }, scales: { x: { ticks: { color: '#a6abc6' } }, y: { ticks: { color: '#a6abc6' } } } }
    });
  } else if (chartEl && chartEl.getContext) {
    chartEl.getContext('2d').clearRect(0,0,chartEl.width,chartEl.height);
  }
  // Rendera tabell
  if (tickets && Array.isArray(tickets.rows) && tableBox) {
    tableBox.innerHTML = `
      <table><thead><tr><th>ID</th><th>Kategori</th><th>Status</th><th>Prio</th><th>Skapad</th><th>First</th><th>Res</th></tr></thead><tbody>
      ${tickets.rows.slice(0, 100).map(r => `
        <tr>
          <td><span class='muted small'>${String(r.ticketId || r._id || '').slice(-8)}</span></td>
          <td>${r.companyId || ''}</td>
          <td>${r.status || ''}</td>
          <td>${r.priority || ''}</td>
          <td>${fmtDate(r.createdAt)}</td>
          <td>${r.sla?.firstResponseMs != null ? msToPretty(r.sla.firstResponseMs) : '—'}</td>
          <td>${r.sla?.resolutionMs != null ? msToPretty(r.sla.resolutionMs) : '—'}</td>
        </tr>
      `).join('')}</tbody></table>
    `;
  } else if (tableBox) {
    tableBox.innerHTML = "<div class='alert error'>Kunde inte ladda tabell.</div>";
  }
  // Mer och tydligare statistik, nollställ och radera
  function renderExtraStats() {
    safeApi("/admin/sla/extra-stats").then((stats) => {
      if (!stats) return;
      const box = document.getElementById("slaStatsBox");
      if (!box) return;
      box.innerHTML += `
        <div class="sla-stat"><b>Genomsnittlig svarstid:</b> ${stats.avgResponse} min</div>
        <div class="sla-stat"><b>Max svarstid:</b> ${stats.maxResponse} min</div>
        <div class="sla-stat"><b>Min svarstid:</b> ${stats.minResponse} min</div>
        <div class="sla-stat"><b>Antal agentbyten:</b> ${stats.agentSwitches}</div>
        <div class="sla-stat"><b>Antal borttagna tickets:</b> ${stats.removedTickets}</div>
      `;
    });

    // Radera/nollställ specifik statistik
    window.deleteStat = function(statKey) {
      if (confirm("Radera/nollställ statistik?")) {
        safeApi(`/admin/sla/stat/${statKey}`, { method: "DELETE" }).then(() => renderSlaDashboard());
      }
    };
  }

  // Kör renderExtraStats vid start
  renderExtraStats();
}

function exportSlaCsvDashboard() {
  const days = Number(document.getElementById("slaDaysSelect")?.value || 30);
  const url = `/admin/sla/export/csv?days=${days}`;
  fetch(url, { headers: { Authorization: `Bearer ${state.token}` } })
    .then(r => { if (!r.ok) throw new Error("Kunde inte exportera CSV"); return r.blob(); })
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sla_export_${days}d.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => alert("❌ Export misslyckades"));
}

  bindEvents();
  boot();
});

async function boot() {
  await loadCategories().catch(() => {});

  if ($("categorySelect")) $("categorySelect").value = state.companyId;
  if ($("kbCategorySelect")) $("kbCategorySelect").value = state.companyId;

  if (state.token) {
    const me = await safeApi("/me");
    if (me) {
      state.user = me;
      setLS(LS.user, JSON.stringify(me));
      onLoggedIn();
    } else {
      doLogout(false);
    }
  } else {
    onLoggedOut();
  }

  updateDebug();
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("openChatView");
    switchView("chatView");
    scrollMessagesToBottom();
  });

  $("openMyTicketsView")?.addEventListener("click", async () => {
    setActiveMenu("openMyTicketsView");
    switchView("myTicketsView");
    await loadMyTickets();
  });

  $("openInboxView")?.addEventListener("click", async () => {
    setActiveMenu("openInboxView");
    switchView("inboxView");
    $("openInboxView")?.classList.remove("hasNotif");
    show($("inboxNotifDot"), false);
    await loadInboxTickets();
  });

  $("openSlaView")?.addEventListener("click", async () => {
    setActiveMenu("openSlaView");
    switchView("slaView");
    await refreshSlaAll();
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("openAdminView");
    switchView("adminView");
    await refreshAdminAll();
  });

  $("openSettingsView")?.addEventListener("click", () => {
    setActiveMenu("openSettingsView");
    switchView("settingsView");
  });

  $("categorySelect")?.addEventListener("change", async (e) => {
    state.companyId = e.target.value || "demo";
    setLS(LS.currentCompanyId, state.companyId);
    // Rensa chatten och visa AI-hälsning vid kategori-byte
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    $("messages").innerHTML = "";
    maybeWelcomeMessage(true);
    await updateCategoryUiHints();
    await loadInboxCategoryFilter();
    updateDebug();
  });

  $("themeToggle")?.addEventListener("click", () => {
    const cur = document.body.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(LS.theme, next);
  });

  // Enkel toggling av debugpanel
  const toggleBtn = document.getElementById("toggleDebugBtn");
  if (toggleBtn && debugPanel) {
    toggleBtn.onclick = () => {
      state.debug = false;
      localStorage.setItem(LS.debug, "0");
      debugPanel.style.display = "none";
    };
  }

  $("loginBtn")?.addEventListener("click", doLogin);
  $("registerBtn")?.addEventListener("click", doRegister);
  $("logoutBtn")?.addEventListener("click", () => doLogout(true));

  $("togglePassBtn")?.addEventListener("click", () => togglePass("password", "togglePassBtn"));
  $("toggleResetPassBtn")?.addEventListener("click", () => togglePass("resetNewPass", "toggleResetPassBtn"));

  $("openForgotBtn")?.addEventListener("click", () => openForgot(true));
  $("closeForgotBtn")?.addEventListener("click", () => openForgot(false));
  $("sendForgotBtn")?.addEventListener("click", sendForgotEmail);
  $("resetSaveBtn")?.addEventListener("click", doResetPassword);

  // Chat
  $("sendBtn")?.addEventListener("click", sendChat);
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  $("clearChatBtn")?.addEventListener("click", () => {
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    $("messages").innerHTML = "";
    addSystemMessage("Chat rensad ✅");
    maybeWelcomeMessage();
  });

  $("exportChatBtn")?.addEventListener("click", exportChat);

  $("newTicketBtn")?.addEventListener("click", () => {
    state.lastTicketId = "";
    setLS(LS.lastTicketId, "");
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    $("messages").innerHTML = "";
    addSystemMessage("✅ Nytt ärende startat.");
    maybeWelcomeMessage(true);
  });

  $("fbUp")?.addEventListener("click", () => sendFeedback("up"));
  $("fbDown")?.addEventListener("click", () => sendFeedback("down"));

  // My tickets
  $("myTicketsRefreshBtn")?.addEventListener("click", loadMyTickets);
  $("myTicketReplyBtn")?.addEventListener("click", myTicketReply);

  // Inbox
  $("inboxRefreshBtn")?.addEventListener("click", loadInboxTickets);
  $("solveAllBtn")?.addEventListener("click", solveAllTickets);
  $("removeSolvedBtn")?.addEventListener("click", removeSolvedTickets);

  $("inboxStatusFilter")?.addEventListener("change", loadInboxTickets);
  $("inboxCategoryFilter")?.addEventListener("change", loadInboxTickets);
  $("inboxSearchInput")?.addEventListener("input", debounce(loadInboxTickets, 250));

  $("setStatusOpen")?.addEventListener("click", () => setInboxTicketStatus("open"));
  $("setStatusPending")?.addEventListener("click", () => setInboxTicketStatus("pending"));
  $("setStatusSolved")?.addEventListener("click", () => setInboxTicketStatus("solved"));
  $("setPriorityBtn")?.addEventListener("click", setInboxPriority);

  $("sendAgentReplyInboxBtn")?.addEventListener("click", sendInboxAgentReply);
  $("saveInternalNoteBtn")?.addEventListener("click", saveInternalNote);
  $("clearInternalNotesBtn")?.addEventListener("click", clearInternalNotes);
  $("assignTicketBtn")?.addEventListener("click", assignTicketToAgent);
  $("deleteTicketBtn")?.addEventListener("click", deleteSelectedInboxTicket);

  // SLA
  $("slaRefreshBtn")?.addEventListener("click", refreshSlaAll);
  $("slaExportCsvBtn")?.addEventListener("click", exportSlaCsv);
  $("slaDaysSelect")?.addEventListener("change", refreshSlaAll);

  // Admin tabs
  qsa(".tabBtn").forEach((b) => {
    b.addEventListener("click", () => {
      qsa(".tabBtn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const tab = b.getAttribute("data-tab");
      qsa(".tabPanel").forEach((p) => show(p, p.id === tab));
    });
  });

  $("adminUsersRefreshBtn")?.addEventListener("click", loadAdminUsers);
  $("adminExportAllBtn")?.addEventListener("click", exportAll);
  $("trainingExportBtn")?.addEventListener("click", exportTraining);

  // KB
  $("kbRefreshBtn")?.addEventListener("click", loadKbList);
  $("kbExportBtn")?.addEventListener("click", exportKb);
  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);
  $("kbCategorySelect")?.addEventListener("change", loadKbList);

  // Categories admin
  $("catsRefreshBtn")?.addEventListener("click", loadCategoriesAdmin);
  $("createCatBtn")?.addEventListener("click", createCategory);

  // Settings
  $("changeUsernameBtn")?.addEventListener("click", changeUsername);
  $("changePasswordBtn")?.addEventListener("click", changePassword);

  // Agentfunktioner: tilldela ärenden, highlight och notifiering
  window.assignTicket = async function(ticketId, agentId) {
    const res = await safeApi(`/admin/tickets/${ticketId}/assign`, { method: "POST", body: JSON.stringify({ agentId }) });
    if (res && res.success) {
      showToast("Ärende tilldelat agent!", 2000);
      // Highlight agent och ärende
      const inboxBtn = $("openInboxView");
      if (inboxBtn) {
        inboxBtn.classList.add("highlight");
        setTimeout(() => inboxBtn.classList.remove("highlight"), 3000);
      }
    } else {
      alert("Kunde inte tilldela ärende.");
    }
  };
  // Hantera agentbyten och notifiering
  window.switchAgent = async function(ticketId, newAgentId) {
    const res = await safeApi(`/admin/tickets/${ticketId}/switch-agent`, { method: "POST", body: JSON.stringify({ newAgentId }) });
    if (res && res.success) showToast("Agentbytet lyckades!", 2000);
    else alert("Kunde inte byta agent.");
  };

  handleResetTokenFromUrl();
}

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* =========================
   AUTH
========================= */
async function doLogin() {
  setAlert($("authMessage"), "");
  try {
    const username = $("username")?.value?.trim();
    const password = $("password")?.value || "";
    if (!username || !password) throw new Error("Fyll i användarnamn och lösenord");

    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    state.token = data.token;
    state.user = data.user;

    setLS(LS.token, state.token);
    setLS(LS.user, JSON.stringify(state.user));

    onLoggedIn();
  } catch (e) {
    setAlert($("authMessage"), e.message, "error");
  }
}

async function doRegister() {
  setAlert($("authMessage"), "");
  try {
    const username = $("username")?.value?.trim();
    const password = $("password")?.value || "";
    const email = $("email")?.value?.trim() || "";

    if (!username || username.length < 3) throw new Error("Användarnamn måste vara minst 3 tecken.");
    if (!password || password.length < 6) throw new Error("Lösenord måste vara minst 6 tecken.");

    await api("/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email }),
    });

    setAlert($("authMessage"), "Registrering lyckades ✅ Logga in nu.", "");
  } catch (e) {
    setAlert($("authMessage"), e.message, "error");
  }
}

function doLogout(showMsg = true) {
  state.token = "";
  state.user = null;
  setLS(LS.token, "");
  setLS(LS.user, "");
  setLS(LS.lastTicketId, "");
  state.lastTicketId = "";

  stopPolling();
  onLoggedOut();

  if (showMsg) addSystemMessage("Du är utloggad ✅");
}

function onLoggedOut() {
  $("roleBadge").textContent = "Inte inloggad";
  // Visa alltid alla sidebar-knappar
  $("logoutBtn").style.display = "";
  $("openSettingsView").style.display = "";
  qsa(".adminOnly").forEach((x) => (x.style.display = ""));

  switchView("authView");
  setActiveMenu("openChatView");

  $("messages").innerHTML = "";
  state.conversation = [];
  setLS(LS.chatConversation, JSON.stringify(state.conversation));

  updateDebug();
}

async function onLoggedIn() {
    // Visa mer info under inställningar
    if ($("settingsUserInfo")) {
      const u = state.user || {};
      $("settingsUserInfo").innerHTML = `
        <div><b>Användarnamn:</b> ${escapeHtml(u.username || "-")}</div>
        <div><b>Email:</b> ${escapeHtml(u.email || "-")}</div>
        <div><b>Roll:</b> ${escapeHtml(u.role || "-")}</div>
        <div><b>ID:</b> ${escapeHtml(String(u.id || u._id || "").slice(-8))}</div>
        <div><b>Skapad:</b> ${fmtDate(u.createdAt)}</div>
      `;
    }
  show($("logoutBtn"), true);
  show($("openSettingsView"), true);

  // Rollstyrd navigation och vyer
  const role = state.user?.role || "user";
  // Dölj adminpanel och admin-knapp för agenter och vanliga användare
  if (role === "agent" || role === "user") {
    show($("openAdminView"), false);
    // Dölj admin i sidebar om den finns
    document.querySelectorAll('.sidebar-link').forEach(btn => {
      if (btn.textContent?.toLowerCase().includes('admin')) btn.style.display = 'none';
    });
  } else {
    show($("openAdminView"), true);
    document.querySelectorAll('.sidebar-link').forEach(btn => {
      if (btn.textContent?.toLowerCase().includes('admin')) btn.style.display = '';
    });
  }
  // Agent ser bara sin statistik i SLA
  if (role === "agent") {
    show($("openSlaView"), true);
    show($("openInboxView"), true);
    // Visa endast agentens statistik i SLA-dashboard (handled i renderSlaDashboard)
  } else if (role === "admin") {
    show($("openSlaView"), true);
    show($("openInboxView"), true);
  } else {
    // Vanlig användare ser inte SLA eller Inbox
    show($("openSlaView"), false);
    show($("openInboxView"), false);
  }

  $("roleBadge").textContent =
    state.user?.username
      ? `Inloggad: ${state.user.username} • ID: ${String(state.user.id || state.user._id || "").slice(-6)} • Roll: ${state.user.role || "user"}`
      : "Inte inloggad";

  // Visa/dölj vyer beroende på roll
  const userRole = state.user?.role || "user";
  $("openAdminView").style.display = (userRole === "admin") ? "" : "none";
  $("openSlaView").style.display = (userRole === "admin" || userRole === "agent") ? "" : "none";
  $("openInboxView").style.display = (userRole === "admin" || userRole === "agent") ? "" : "none";
  $("openMyTicketsView").style.display = (userRole === "user") ? "" : "none";

  switchView(userRole === "admin" ? "adminView" : "chatView");
  setActiveMenu(userRole === "admin" ? "openAdminView" : "openChatView");

  renderConversation();
  scrollMessagesToBottom();

  await updateCategoryUiHints();
  await loadInboxCategoryFilter();
  updateDebug();

  maybeWelcomeMessage();

  startPolling();
}

/* =========================
   Polling (Inbox highlight)
========================= */
function startPolling() {
  stopPolling();
  pollUpdates().catch(() => {});
  state.pollingTimer = setInterval(() => pollUpdates().catch(() => {}), 5000);
}

function stopPolling() {
  if (state.pollingTimer) clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

async function pollUpdates() {
  if (!state.token || !state.user) return;
  const role = state.user.role || "user";

  // My tickets count
  const my = await safeApi("/my/tickets");
  if (my && Array.isArray(my)) {
    const count = my.length || 0;
    if (count !== state.myTicketsCount) {
      state.myTicketsCount = count;
      setLS(LS.lastMyTicketsCount, String(count));
    }
  }

  if (role === "agent" || role === "admin") {
    const tickets = await safeApi("/admin/tickets?status=open");
    if (!tickets || !Array.isArray(tickets)) return;

    const openCount = tickets.length || 0;
    const prevCount = state.inboxOpenCount;

    if (openCount > prevCount) {
      $("openInboxView")?.classList.add("hasNotif");
      show($("inboxNotifDot"), true);
      // Visa tydlig men liten notis
      toast(`📩 Nytt ärende inkom! (${openCount} öppna)`);
      // Highlighta även kategori om relevant
      if ($("categorySelect") && tickets.some(t => t.companyId === state.companyId)) {
        $("categorySelect").classList.add("categoryNotif");
        setTimeout(() => $("categorySelect").classList.remove("categoryNotif"), 3000);
      }
    }

    state.inboxOpenCount = openCount;
    setLS(LS.lastInboxOpenCount, String(openCount));
    show($("inboxNotifDot"), openCount > 0);
  }
}

/* =========================
   Password toggles
========================= */
function togglePass(inputId, btnId) {
  const inp = $(inputId);
  const btn = $(btnId);
  if (!inp || !btn) return;
  const isPass = inp.getAttribute("type") === "password";
  inp.setAttribute("type", isPass ? "text" : "password");
  const icon = btn.querySelector("i");
  if (icon) icon.className = isPass ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
}

/* =========================
   Forgot/Reset password UI
========================= */
function openForgot(on) {
  show($("forgotCard"), on);
  show($("resetCard"), false);
  show($("authMessage"), false);
}

async function sendForgotEmail() {
  setAlert($("forgotMsg"), "");
  try {
    const email = $("forgotEmail")?.value?.trim();
    if (!email) throw new Error("Skriv en email");

    const data = await api("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    setAlert($("forgotMsg"), data.message || "Skickat ✅", "");
  } catch (e) {
    setAlert($("forgotMsg"), e.message, "error");
  }
}

function handleResetTokenFromUrl() {
  const url = new URL(window.location.href);
  const resetToken = url.searchParams.get("resetToken");
  if (!resetToken) return;

  show($("resetCard"), true);
  show($("forgotCard"), false);
  show($("authMessage"), false);

  window.__resetToken = resetToken;
}

async function doResetPassword() {
  setAlert($("resetMsg"), "");
  try {
    const token = window.__resetToken;
    const newPassword = $("resetNewPass")?.value || "";
    if (!token) throw new Error("Reset token saknas i URL");
    if (!newPassword || newPassword.length < 6) throw new Error("Lösenord måste vara minst 6 tecken");

    const data = await api("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ resetToken: token, newPassword }),
    });

    setAlert($("resetMsg"), data.message || "Lösenord uppdaterat ✅", "");
  } catch (e) {
    setAlert($("resetMsg"), e.message, "error");
  }
}

/* =========================
   CATEGORIES
========================= */
async function loadCategories() {
  const cats = await safeApi("/categories");
  if (!cats || !Array.isArray(cats)) return;

  const sel = $("categorySelect");
  const selKb = $("kbCategorySelect");
  const selInbox = $("inboxCategoryFilter");

  function fill(selectEl, includeAll = false) {
    if (!selectEl) return;
    const cur = selectEl.value || state.companyId || "demo";
    selectEl.innerHTML = "";
    if (includeAll) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "Alla kategorier";
      selectEl.appendChild(o);
    }
    for (const c of cats) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      selectEl.appendChild(opt);
    }
    selectEl.value = cur || "demo";
  }

  fill(sel, false);
  fill(selKb, false);
  fill(selInbox, true);
}

async function loadInboxCategoryFilter() {
  await loadCategories();
}

async function updateCategoryUiHints() {
  const title = $("chatTitle");
  const sub = $("chatSubtitle");
  if (!title || !sub) return;

  title.textContent = "AI Kundtjänst";
  sub.textContent = `Kategori: ${state.companyId} • Skriv ditt ärende så hjälper jag dig direkt.`;
}

/* =========================
   CHAT
========================= */
function maybeWelcomeMessage(force = false) {
  if (!force && state.conversation.length > 0) return;

  const name = state.user?.username || "vän";
  const cat = state.companyId || "demo";
  const intro = `<b>👋 Hej ${escapeHtml(name)}!</b><br><br>✅ Du är nu kopplad till <b>AI-kundtjänst</b> <span class='pill'>${escapeHtml(cat)}</span>.<br>Skriv ditt ärende så hjälper jag dig direkt.<br><br><span class='muted'>Tips: Beskriv problemet tydligt så ger jag dig snabbaste lösningen.</span>`;
  state.conversation.push({ role: "assistant", content: intro });
  setLS(LS.chatConversation, JSON.stringify(state.conversation));
  renderConversation();
  scrollMessagesToBottom();
}

function addSystemMessage(text) {
  addMessageToUI("assistant", text);
}

function addMessageToUI(role, content) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + (role === "user" ? "user" : "assistant");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  if (role === "user") {
    avatar.innerHTML = `<i class="fa-solid fa-user"></i>`;
  } else {
    avatar.innerHTML = `<i class="fa-solid fa-robot" style="color:#3a8ee6;"></i>`;
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  // FIX: Render AI/system messages as HTML, not plain text
  if (role !== "user") {
    bubble.innerHTML = content || "";
  } else {
    bubble.textContent = content || "";
  }

  const bubbleWrap = document.createElement("div");
  bubbleWrap.appendChild(bubble);

  if (role !== "user") {
    const actions = document.createElement("div");
    actions.className = "bubbleActions";
    actions.innerHTML = `<button class="actionBtn" type="button"><i class="fa-solid fa-copy"></i> Kopiera</button>`;
    actions.querySelector("button")?.addEventListener("click", () => {
      navigator.clipboard.writeText(content || "").catch(() => {});
      toast("📋 Kopierat");
    });
    bubbleWrap.appendChild(actions);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubbleWrap);
  $("messages")?.appendChild(wrap);
  // Autoskrolla till botten när nytt meddelande läggs till
  setTimeout(scrollMessagesToBottom, 50);
}

function renderConversation() {
  if (!$("messages")) return;
  $("messages").innerHTML = "";
  for (const m of state.conversation) addMessageToUI(m.role, m.content || "");
}

function scrollMessagesToBottom() {
  const el = $("messages");
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

async function sendChat() {
  const inp = $("messageInput");
  if (!inp) return;

  const text = inp.value.trim();
  if (!text) return;

  inp.value = "";

  state.conversation.push({ role: "user", content: text });
  setLS(LS.chatConversation, JSON.stringify(state.conversation));
  addMessageToUI("user", text);
  scrollMessagesToBottom();

  // Visa "AI skriver..." indikator
  let aiTyping = document.createElement("div");
  aiTyping.className = "msg assistant";
  aiTyping.id = "aiTypingMsg";
  aiTyping.innerHTML = `<div class="avatar"><i class="fa-solid fa-robot"></i></div><div><div class="bubble">AI skriver...</div></div>`;
  $("messages")?.appendChild(aiTyping);
  scrollMessagesToBottom();

  try {
    const payload = { companyId: state.companyId, conversation: state.conversation };
    if (state.lastTicketId) payload.ticketId = state.lastTicketId;

    const data = await api("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    // Ta bort "AI skriver..."
    $("aiTypingMsg")?.remove();

    const reply = data.reply || "Inget svar.";
    state.lastTicketId = data.ticketId || state.lastTicketId || "";
    setLS(LS.lastTicketId, state.lastTicketId);

    state.conversation.push({ role: "assistant", content: reply });
    setLS(LS.chatConversation, JSON.stringify(state.conversation));

    addMessageToUI("assistant", reply);

    updateDebug({ ragUsed: !!data.ragUsed, ticketId: state.lastTicketId });
    scrollMessagesToBottom();
  } catch (e) {
    $("aiTypingMsg")?.remove();
    addMessageToUI("assistant", `❌ Fel: ${e.message}`);
    scrollMessagesToBottom();
  }
}

function exportChat() {
  const rows = state.conversation.map((m) => `${m.role.toUpperCase()}: ${m.content}`);
  const blob = new Blob([rows.join("\n\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat_export_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function sendFeedback(type) {
  const res = await safeApi("/feedback", {
    method: "POST",
    body: JSON.stringify({ type, companyId: state.companyId }),
  });

  if (res) {
    $("fbMsg").textContent = "Tack! ✅";
  } else {
    $("fbMsg").textContent = "Kunde ej skicka feedback.";
  }
  setTimeout(() => ($("fbMsg").textContent = ""), 1200);
}

/* =========================
   MY TICKETS
========================= */
async function loadMyTickets() {
  setAlert($("myTicketsHint"), "");
  const list = $("myTicketsList");
  const details = $("myTicketDetails");
  if (list) list.innerHTML = "";
  if (details) details.innerHTML = `<span class="muted small">Laddar...</span>`;

  const tickets = await safeApi("/my/tickets");
  if (!tickets || !Array.isArray(tickets)) {
    setAlert($("myTicketsHint"), "Kunde inte ladda tickets.", "error");
    if (details) details.innerHTML = `<span class="muted small">Kunde inte ladda.</span>`;
    return;
  }

  state.myTicketsCount = tickets.length || 0;
  setLS(LS.lastMyTicketsCount, String(state.myTicketsCount));

  if (!tickets.length) {
    if (list) list.innerHTML = `<div class="muted small">Inga ärenden ännu.</div>`;
    if (details) details.innerHTML = `<span class="muted small">Skapa en ny konversation i Chat.</span>`;
    return;
  }

  list.innerHTML = tickets
    .map((t) => {
      const status = t.status || "open";
      const prio = t.priority || "normal";
      const title = t.title || "(utan titel)";
      return `
        <div class="listItem" data-id="${t._id}">
          <div class="listItemTitle">
            ${escapeHtml(title)}
            ${pill(status, status === "solved" ? "ok" : status === "pending" ? "warn" : "")}
            ${pill(prio)}
          </div>
          <div class="muted small">${escapeHtml(String(t._id).slice(-8))} • ${fmtDate(t.lastActivityAt || t.createdAt)}</div>
        </div>
      `;
    })
    .join("");

  qsa("#myTicketsList .listItem").forEach((item) => {
    item.addEventListener("click", async () => {
      qsa("#myTicketsList .listItem").forEach((x) => x.classList.remove("selected"));
      item.classList.add("selected");
      const id = item.getAttribute("data-id");
      state.selectedMyTicketId = id;
      await loadMyTicketDetails(id);
    });
  });

  const firstId = tickets[0]._id;
  state.selectedMyTicketId = firstId;
  qs(`#myTicketsList .listItem[data-id="${firstId}"]`)?.classList.add("selected");
  await loadMyTicketDetails(firstId);
}

async function loadMyTicketDetails(ticketId) {
  const details = $("myTicketDetails");
  if (!details) return;
  details.innerHTML = `<span class="muted small">Laddar...</span>`;

  const t = await safeApi(`/my/tickets/${ticketId}`);
  if (!t) {
    details.innerHTML = `<span class="muted small">Fel: Kunde inte ladda ticket.</span>`;
    return;
  }

  const msgs = t.messages || [];
  const header = `
    <div style="margin-bottom:10px;">
      <div><b>${escapeHtml(t.title || "Ärende")}</b></div>
      <div class="muted small">
        Status: ${escapeHtml(t.status)} • Prio: ${escapeHtml(t.priority)} • Skapad: ${fmtDate(t.createdAt)}
      </div>
    </div>
  `;

  const body = msgs
    .map((m) => {
      const r = m.role;
      const cls = r === "user" ? "ticketMsg user" : r === "agent" ? "ticketMsg agent" : "ticketMsg ai";
      return `
        <div class="${cls}">
          <div class="ticketMsgHead">
            <span>${escapeHtml(r)}</span>
            <span>${fmtDate(m.timestamp)}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
        </div>
      `;
    })
    .join("");

  details.innerHTML = header + body;
}

async function myTicketReply() {
  setAlert($("myTicketReplyMsg"), "");
  try {
    const ticketId = state.selectedMyTicketId;
    if (!ticketId) throw new Error("Välj ett ärende först.");

    const text = $("myTicketReplyText")?.value?.trim();
    if (!text) throw new Error("Skriv ett meddelande.");

    const data = await api(`/my/tickets/${ticketId}/reply`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });

    $("myTicketReplyText").value = "";
    setAlert($("myTicketReplyMsg"), data.message || "Skickat ✅", "");
    await loadMyTicketDetails(ticketId);
    await loadMyTickets();
  } catch (e) {
    setAlert($("myTicketReplyMsg"), e.message, "error");
  }
}
/* =========================
   INBOX
========================= */
async function loadInboxTickets() {
  setAlert($("inboxMsg"), "");
  const list = $("inboxTicketsList");
  if (!list) return;

  list.innerHTML = `<div class="muted small">Laddar...</div>`;

  const status = $("inboxStatusFilter")?.value || "";
  const companyId = $("inboxCategoryFilter")?.value || "";
  const search = $("inboxSearchInput")?.value?.trim().toLowerCase() || "";

  const url = new URL(location.origin + "/admin/tickets");
  if (status) url.searchParams.set("status", status);
  if (companyId) url.searchParams.set("companyId", companyId);

  let tickets = await safeApi(url.pathname + url.search);
  if (!tickets || !Array.isArray(tickets)) {
    setAlert($("inboxMsg"), "Kunde inte ladda inbox (saknar behörighet eller endpoint).", "error");
    list.innerHTML = `<div class="muted small">Kunde inte ladda tickets.</div>`;
    return;
  }

  if (search) {
    tickets = tickets.filter((t) => {
      const id = String(t._id || "").toLowerCase();
      const title = String(t.title || "").toLowerCase();
      const cat = String(t.companyId || "").toLowerCase();
      return id.includes(search) || title.includes(search) || cat.includes(search);
    });
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  show($("inboxNotifDot"), openCount > 0);

  list.innerHTML = tickets
    .map((t) => {
      const statusPill =
        t.status === "solved"
          ? pill("solved", "ok")
          : t.status === "pending"
          ? pill("pending", "warn")
          : pill("open");

      const prioPill =
        t.priority === "high" ? pill("high", "danger") : t.priority === "low" ? pill("low") : pill("normal");

      return `
        <div class="listItem ${t.status === "open" ? "newTicketPulse" : ""}" data-id="${t._id}">
          <div class="listItemTitle">
            ${escapeHtml(t.title || "(utan titel)")}
            ${statusPill}
            ${prioPill}
          </div>
          <div class="muted small">
            ${escapeHtml(String(t.companyId || ""))} • ${escapeHtml(String(t._id).slice(-8))} • ${fmtDate(
        t.lastActivityAt || t.createdAt
      )}
          </div>
        </div>
      `;
    })
    .join("");

  qsa("#inboxTicketsList .listItem").forEach((item) => {
    item.addEventListener("click", async () => {
      qsa("#inboxTicketsList .listItem").forEach((x) => x.classList.remove("selected"));
      item.classList.add("selected");
      const id = item.getAttribute("data-id");
      state.selectedInboxTicketId = id;
      await loadInboxTicketDetails(id);
    });
  });

  if (!state.selectedInboxTicketId && tickets[0]) {
    state.selectedInboxTicketId = tickets[0]._id;
    qs(`#inboxTicketsList .listItem[data-id="${tickets[0]._id}"]`)?.classList.add("selected");
    await loadInboxTicketDetails(tickets[0]._id);
  }
}

async function loadInboxTicketDetails(ticketId) {
  const box = $("ticketDetails");
  const msg = $("inboxTicketMsg");
  if (!box) return;

  setAlert(msg, "");
  box.innerHTML = `<div class="muted small">Laddar...</div>`;
  if ($("internalNotesList")) $("internalNotesList").innerHTML = "";

  const t = await safeApi(`/admin/tickets/${ticketId}`);
  if (!t) {
    setAlert(msg, "Kunde inte ladda ticket (saknar endpoint/behörighet).", "error");
    box.innerHTML = `<div class="muted small">Kunde inte visa ticket.</div>`;
    return;
  }

  if ($("ticketPrioritySelect")) $("ticketPrioritySelect").value = t.priority || "normal";
  await fillAssignUsers(t.assignedToUserId);

  const top = `
    <div style="margin-bottom:10px;">
      <div><b>${escapeHtml(t.title || "Ticket")}</b></div>
      <div class="muted small">
        ${escapeHtml(t.companyId)} • ${escapeHtml(String(t._id))} • Skapad ${fmtDate(t.createdAt)}
      </div>
      <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
        ${pill(t.status, t.status === "solved" ? "ok" : t.status === "pending" ? "warn" : "")}
        ${pill(t.priority, t.priority === "high" ? "danger" : "")}
      </div>
    </div>
    <div class="divider"></div>
  `;

  const msgs = (t.messages || [])
    .map((m) => {
      const r = m.role;
      const cls = r === "user" ? "ticketMsg user" : r === "agent" ? "ticketMsg agent" : "ticketMsg ai";
      return `
        <div class="${cls}">
          <div class="ticketMsgHead">
            <span>${escapeHtml(r)}</span>
            <span>${fmtDate(m.timestamp)}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
        </div>
      `;
    })
    .join("");

  box.innerHTML = top + msgs;

  renderInternalNotes(t.internalNotes || []);
}

async function setInboxTicketStatus(status) {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");
  const ok = await safeApi(`/admin/tickets/${state.selectedInboxTicketId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  if (!ok) {
    setAlert($("inboxTicketMsg"), "Kunde inte ändra status (saknar endpoint).", "error");
    return;
  }
  await loadInboxTicketDetails(state.selectedInboxTicketId);
  await loadInboxTickets();
}

async function setInboxPriority() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");
  const priority = $("ticketPrioritySelect")?.value || "normal";

  const ok = await safeApi(`/admin/tickets/${state.selectedInboxTicketId}/priority`, {
    method: "POST",
    body: JSON.stringify({ priority }),
  });

  if (!ok) {
    setAlert($("inboxTicketMsg"), "Kunde inte ändra prioritet (saknar endpoint).", "error");
    return;
  }

  await loadInboxTicketDetails(state.selectedInboxTicketId);
  await loadInboxTickets();
}

async function sendInboxAgentReply() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  const content = $("agentReplyTextInbox")?.value?.trim();
  if (!content) {
    setAlert($("inboxTicketMsg"), "Skriv ett svar.", "error");
    return;
  }

  const ok = await safeApi(`/admin/tickets/${state.selectedInboxTicketId}/agent-reply`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

  if (!ok) {
    setAlert($("inboxTicketMsg"), "Kunde inte skicka svar (saknar endpoint).", "error");
    return;
  }

  $("agentReplyTextInbox").value = "";
  await loadInboxTicketDetails(state.selectedInboxTicketId);
  await loadInboxTickets();
}

async function saveInternalNote() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  const content = $("internalNoteText")?.value?.trim();
  if (!content) {
    setAlert($("inboxTicketMsg"), "Skriv en intern notering.", "error");
    return;
  }

  const data = await safeApi(`/admin/tickets/${state.selectedInboxTicketId}/internal-note`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

  if (!data) {
    setAlert($("inboxTicketMsg"), "Kunde inte spara note (saknar endpoint).", "error");
    return;
  }

  $("internalNoteText").value = "";
  renderInternalNotes(data.ticket?.internalNotes || []);
}

async function clearInternalNotes() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  const ok = await safeApi(`/admin/tickets/${state.selectedInboxTicketId}/internal-notes`, {
    method: "DELETE",
  });

  if (!ok) {
    setAlert($("inboxTicketMsg"), "Kunde inte rensa notes (saknar endpoint).", "error");
    return;
  }

  renderInternalNotes([]);
}

function renderInternalNotes(notes) {
  const box = $("internalNotesList");
  if (!box) return;

  if (!notes.length) {
    box.innerHTML = `<div class="muted small">Inga interna notes.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="noteList">
      ${notes
        .slice()
        .reverse()
        .map(
          (n) => `
        <div class="noteItem">
          <div class="noteMeta">${fmtDate(n.createdAt)} • ${escapeHtml(String(n.createdBy || ""))}</div>
          <div class="noteText">${escapeHtml(n.content)}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

async function fillAssignUsers(selectedId) {
  const sel = $("assignUserSelect");
  if (!sel) return;

  const users = await safeApi("/admin/users");
  if (!users || !Array.isArray(users)) return;

  const agents = users.filter((u) => u.role === "agent" || u.role === "admin");

  sel.innerHTML =
    `<option value="">Välj agent...</option>` +
    agents
      .map((u) => {
        const short = String(u._id || u.id || "").slice(-6);
        return `<option value="${u._id || u.id}">${escapeHtml(u.username)} (${u.role}) • ID:${short}</option>`;
      })
      .join("");
  sel.value = selectedId || "";
}

async function assignTicketToAgent() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  const userId = $("assignUserSelect")?.value;
  if (!userId) {
    setAlert($("inboxTicketMsg"), "Välj en agent att assigna.", "error");
    return;
  }

  const ok = await safeApi(`/admin/tickets/${state.selectedInboxTicketId}/assign`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });

  if (!ok) {
    setAlert($("inboxTicketMsg"), "Kunde inte assigna (saknar endpoint).", "error");
    return;
  }

  await loadInboxTicketDetails(state.selectedInboxTicketId);
  await loadInboxTickets();
}

async function deleteSelectedInboxTicket() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");
  if (!confirm("Ta bort ticket?")) return;

  const ok = await safeApi(`/admin/tickets/${state.selectedInboxTicketId}`, { method: "DELETE" });
  if (!ok) {
    setAlert($("inboxTicketMsg"), "Kunde inte ta bort (saknar endpoint).", "error");
    return;
  }

  state.selectedInboxTicketId = null;
  $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
  renderInternalNotes([]);
  await loadInboxTickets();
}

async function solveAllTickets() {
  setAlert($("inboxMsg"), "");
  if (!confirm("Solve ALL? (Admin)")) return;

  const ok = await safeApi("/admin/tickets/solve-all", { method: "POST" });
  if (!ok) {
    setAlert($("inboxMsg"), "Kunde inte köra Solve All (saknar endpoint).", "error");
    return;
  }
  setAlert($("inboxMsg"), "Klart ✅", "");
  await loadInboxTickets();
}

async function removeSolvedTickets() {
  setAlert($("inboxMsg"), "");
  if (!confirm("Remove solved? (Admin)")) return;

  const ok = await safeApi("/admin/tickets/remove-solved", { method: "POST" });
  if (!ok) {
    setAlert($("inboxMsg"), "Kunde inte köra Remove solved (saknar endpoint).", "error");
    return;
  }
  setAlert($("inboxMsg"), "Klart ✅", "");
  await loadInboxTickets();
}

/* =========================
   SLA DASHBOARD
========================= */
async function refreshSlaAll() {
    // Avancerad statistikpanel
    if ($("slaAdvancedBox")) {
      $("slaAdvancedBox").innerHTML = `<div class='muted small'>Laddar avancerad statistik...</div>`;
      // Hämta statistik per kategori, agent, dag
      const catStats = await safeApi(`/admin/sla/stats/categories?days=${days}`);
      const agentStats = await safeApi(`/admin/sla/stats/agents?days=${days}`);
      const volStats = await safeApi(`/admin/sla/stats/volume?days=${days}`);

      let html = "";
      // Topp 5 agenter
      if (agentStats?.rows?.length) {
        html += `<h4>Topp 5 agenter (antal lösta):</h4><ol>`;
        agentStats.rows.slice(0,5).forEach(a => {
          html += `<li><b>${escapeHtml(a.username)}</b> (${a.solved} lösta, ${a.open} öppna)</li>`;
        });
        html += `</ol>`;
      }
      // Volym per dag
      if (volStats?.rows?.length) {
        html += `<h4>Ärendevolym per dag:</h4><div style='display:flex;gap:6px;flex-wrap:wrap;'>`;
        volStats.rows.forEach(v => {
          html += `<div style='padding:4px 8px;background:#2222;border-radius:6px;'>${escapeHtml(v.day)}: <b>${v.count}</b></div>`;
        });
        html += `</div>`;
      }
      // Per kategori
      if (catStats?.rows?.length) {
        html += `<h4>Per kategori:</h4><ul>`;
        catStats.rows.forEach(c => {
          html += `<li><b>${escapeHtml(c.category)}</b>: ${c.count} tickets</li>`;
        });
        html += `</ul>`;
      }
      // Export-knapp
      html += `<button class='btn small' id='exportStatsCsvBtn'>Exportera statistik (CSV)</button>`;
      $("slaAdvancedBox").innerHTML = html;
      $("exportStatsCsvBtn")?.addEventListener("click", exportAdvancedStatsCsv);
    }
  // Exportera avancerad statistik till CSV
  async function exportAdvancedStatsCsv() {
    const days = Number($("slaDaysSelect")?.value || 30);
    const url = `/admin/sla/export/advanced-csv?days=${days}`;
    fetch(API_BASE + url, { headers: { Authorization: `Bearer ${state.token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Kunde inte exportera CSV");
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `sla_advanced_export_${days}d.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("❌ Export misslyckades"));
  }
  destroyTrendChart();

  const days = Number($("slaDaysSelect")?.value || 30);

  $("slaOverviewBox").innerHTML = `<div class="muted small">Laddar...</div>`;
  $("slaAgentsBox").innerHTML = `<div class="muted small">Laddar...</div>`;
  $("slaTicketsBox").innerHTML = `<div class="muted small">Laddar...</div>`;
  $("slaTrendHint").textContent = "";

  // Agent ser bara sin egen statistik, admin ser allt
  let overview, trend, agents, tickets;
  if (state.user?.role === "agent") {
    overview = await safeApi(`/admin/sla/overview?days=${days}&self=1`);
    trend = await safeApi(`/admin/sla/trend/weekly?days=${days}&self=1`);
    agents = await safeApi(`/admin/sla/agents?days=${days}&self=1`);
    tickets = await safeApi(`/admin/sla/tickets?days=${days}&self=1`);
  } else {
    overview = await safeApi(`/admin/sla/overview?days=${days}`);
    trend = await safeApi(`/admin/sla/trend/weekly?days=${days}`);
    agents = await safeApi(`/admin/sla/agents?days=${days}`);
    tickets = await safeApi(`/admin/sla/tickets?days=${days}`);
  }
  if (!overview) {
    $("slaOverviewBox").innerHTML = `<div class="alert error">❌ SLA saknas/behörighet.</div>`;
    return;
  }
  renderSlaOverview(overview);

  if (trend) renderSlaTrendChart(trend);
  else $("slaTrendHint").textContent = "Trend endpoint saknas (ok).";

  if (agents) renderSlaAgents(agents);
  else $("slaAgentsBox").innerHTML = `<div class="muted small">Agent-data saknas.</div>`;

  if (tickets) renderSlaTickets(tickets);
  else $("slaTicketsBox").innerHTML = `<div class="muted small">Ticket-data saknas.</div>`;

  // Admin kan nollställa statistik
  if (state.user?.role === "admin") {
    if (!$("resetSlaBtn")) {
      const btn = document.createElement("button");
      btn.id = "resetSlaBtn";
      btn.className = "btn danger small";
      btn.textContent = "Nollställ statistik";
      btn.onclick = async () => {
        if (!confirm("Nollställ all SLA/KPI-statistik? Detta kan inte ångras.")) return;
        await safeApi("/admin/sla/reset", { method: "POST" });
        toast("Statistik nollställd");
        await refreshSlaAll();
      };
      $("slaOverviewBox").appendChild(btn);
    }
  }
}

function renderSlaOverview(o) {
  const total = o.totalTickets ?? 0;
  const byP = o.byPriority || { low: 0, normal: 0, high: 0 };

  const frAvg = o.firstResponse?.avgMs;
  const frMed = o.firstResponse?.medianMs;
  const frP90 = o.firstResponse?.p90Ms;
  const frBr = o.firstResponse?.breaches ?? 0;
  const frComp = o.firstResponse?.compliancePct;

  const rsAvg = o.resolution?.avgMs;
  const rsMed = o.resolution?.medianMs;
  const rsP90 = o.resolution?.p90Ms;
  const rsBr = o.resolution?.breaches ?? 0;
  const rsComp = o.resolution?.compliancePct;

  $("slaOverviewBox").innerHTML = `
    <div class="slaGrid">
      <div class="slaCard">
        <div class="slaLabel">Tickets</div>
        <div class="slaValue">${escapeHtml(String(total))}</div>
        <div class="slaSubValue">Low: <b>${byP.low}</b> • Normal: <b>${byP.normal}</b> • High: <b>${byP.high}</b></div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">First compliance</div>
        <div class="slaValue">${escapeHtml(pct(frComp))}</div>
        <div class="slaSubValue">
          Avg: <b>${escapeHtml(msToPretty(frAvg))}</b> • Median: <b>${escapeHtml(msToPretty(frMed))}</b> • P90: <b>${escapeHtml(
    msToPretty(frP90)
  )}</b><br/>
          Breaches: <b>${escapeHtml(String(frBr))}</b>
        </div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">Resolution compliance</div>
        <div class="slaValue">${escapeHtml(pct(rsComp))}</div>
        <div class="slaSubValue">
          Avg: <b>${escapeHtml(msToPretty(rsAvg))}</b> • Median: <b>${escapeHtml(msToPretty(rsMed))}</b> • P90: <b>${escapeHtml(
    msToPretty(rsP90)
  )}</b><br/>
          Breaches: <b>${escapeHtml(String(rsBr))}</b>
        </div>
      </div>
    </div>
  `;
}

function destroyTrendChart() {
  if (state.chartTrend) {
    try {
      state.chartTrend.destroy();
    } catch {}
    state.chartTrend = null;
  }
}

function renderSlaTrendChart(tr) {
  const canvas = $("slaTrendChart");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    const hint = $("slaTrendHint");
    if (hint) hint.textContent = "❌ Chart.js saknas (kolla att CDN script ligger före script.js).";
    return;
  }

  destroyTrendChart();

  const rows = tr?.rows || [];
  const hint = $("slaTrendHint");

  if (!rows.length) {
    if (hint) hint.textContent = "Ingen trend-data ännu.";
    return;
  }

  const labels = rows.map((r, i) => r.week || `V${i + 1}`);
  const firstPct = rows.map((r) => Number(r.firstCompliancePct || 0));
  const resPct = rows.map((r) => Number(r.resolutionCompliancePct || 0));

  const ctx = canvas.getContext("2d");


  state.chartTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "First response compliance (%)", data: firstPct, tension: 0.35, borderWidth: 2, pointRadius: 4, backgroundColor: "rgba(58,142,230,0.08)", borderColor: "#3a8ee6", fill: true },
        { label: "Resolution compliance (%)", data: resPct, tension: 0.35, borderWidth: 2, pointRadius: 4, backgroundColor: "rgba(40,200,120,0.08)", borderColor: "#28c878", fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: true, position: "top" },
        tooltip: { enabled: true, mode: "index", intersect: false },
        title: { display: true, text: "SLA/KPI Trend", font: { size: 18 } },
        zoom: {
          pan: { enabled: true, mode: "xy" },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "xy" }
        }
      },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } },
        x: { title: { display: true, text: "Vecka" } }
      },
      animation: { duration: 800, easing: "easeOutQuart" },
      hover: { mode: "nearest", intersect: false },
    },
    plugins: [window.ChartZoomPlugin || {}],
  });

  if (hint) hint.textContent = "Trend visar compliance vecka för vecka.";
}

function renderSlaAgents(a) {
  const box = $("slaAgentsBox");
  if (!box) return;

  const rows = a?.rows || [];
  if (!rows.length) {
    box.innerHTML = `<div class="muted small">Inga agent-data.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Tickets</th>
            <th>Open</th>
            <th>Pending</th>
            <th>Solved</th>
            <th>First avg</th>
            <th>First compliance</th>
            <th>Res avg</th>
            <th>Res compliance</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const fr = r.firstResponse || {};
              const rs = r.resolution || {};
              return `
                <tr>
                  <td>${escapeHtml(r.username)} <span class="muted small">(${escapeHtml(r.role)})</span></td>
                  <td>${escapeHtml(String(r.tickets || 0))}</td>
                  <td>${escapeHtml(String(r.open || 0))}</td>
                  <td>${escapeHtml(String(r.pending || 0))}</td>
                  <td>${escapeHtml(String(r.solved || 0))}</td>
                  <td>${escapeHtml(msToPretty(fr.avgMs))}</td>
                  <td>${escapeHtml(pct(fr.compliancePct))}</td>
                  <td>${escapeHtml(msToPretty(rs.avgMs))}</td>
                  <td>${escapeHtml(pct(rs.compliancePct))}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSlaTickets(data) {
  const box = $("slaTicketsBox");
  if (!box) return;

  let rows = data.rows || [];
  if (!rows.length) {
    box.innerHTML = `<div class="muted small">Inga tickets i perioden.</div>`;
    return;
  }

  // Filter och sortering
  rows = applySlaTicketsFilters(rows);

  box.innerHTML = `
    <div class="row gap" style="margin-bottom:8px;flex-wrap:wrap;">
      <select id="slaBreachedFilter" class="input smallInput">
        <option value="all">Alla</option>
        <option value="breachedOnly">Endast brutna SLA</option>
        <option value="okOnly">Endast OK</option>
      </select>
      <select id="slaBreachTypeFilter" class="input smallInput">
        <option value="any">Alla typer</option>
        <option value="first">Endast First</option>
        <option value="resolution">Endast Resolution</option>
      </select>
      <select id="slaSortTickets" class="input smallInput">
        <option value="newest">Nyast först</option>
        <option value="oldest">Äldst först</option>
        <option value="worstFirst">Värst först</option>
      </select>
    </div>
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Kategori</th>
            <th>Status</th>
            <th>Prio</th>
            <th>Skapad</th>
            <th>First</th>
            <th>Res</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 300)
            .map((r) => {
              const sla = r.sla || {};
              const first = sla.firstResponseMs != null ? msToPretty(sla.firstResponseMs) : "—";
              const res = sla.resolutionMs != null ? msToPretty(sla.resolutionMs) : "—";
              return `
                <tr>
                  <td><span class="muted small">${escapeHtml(String(r.ticketId || r._id || "").slice(-8))}</span></td>
                  <td>${escapeHtml(r.companyId || "")}</td>
                  <td>${escapeHtml(r.status || "")}</td>
                  <td>${escapeHtml(r.priority || "")}</td>
                  <td>${escapeHtml(fmtDate(r.createdAt))}</td>
                  <td>${escapeHtml(first)}</td>
                  <td>${escapeHtml(res)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // Bind filter/sort
  $("slaBreachedFilter")?.addEventListener("change", () => renderSlaTickets(data));
  $("slaBreachTypeFilter")?.addEventListener("change", () => renderSlaTickets(data));
  $("slaSortTickets")?.addEventListener("change", () => renderSlaTickets(data));
}

function exportSlaCsv() {
  const days = Number($("slaDaysSelect")?.value || 30);
  const url = `/admin/sla/export/csv?days=${days}`;

  fetch(API_BASE + url, { headers: { Authorization: `Bearer ${state.token}` } })
    .then((r) => {
      if (!r.ok) throw new Error("Kunde inte exportera CSV");
      return r.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sla_export_${days}d.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => alert("❌ Export misslyckades"));
}

/* =========================
   ADMIN DASHBOARD
========================= */
async function refreshAdminAll() {
  await loadAdminUsers();
  await loadKbList();
  await loadCategoriesAdmin();
}

async function loadAdminUsers() {
  const box = $("adminUsersList");
  setAlert($("adminUsersMsg"), "");
  if (!box) return;
  box.innerHTML = `<div class="muted small">Laddar...</div>`;

  const users = await safeApi("/admin/users");
  if (!users || !Array.isArray(users)) {
    setAlert($("adminUsersMsg"), "Kunde inte ladda users (saknar endpoint/behörighet).", "error");
    box.innerHTML = `<div class="muted small">Kunde inte ladda users.</div>`;
    return;
  }

  box.innerHTML = users
    .map((u) => {
      const rolePill = u.role === "admin" ? pill("admin", "ok") : u.role === "agent" ? pill("agent", "warn") : pill("user");
      const shortId = String(u._id || u.id || "").slice(-8);
      return `
        <div class="listItem" data-id="${escapeHtml(u._id || u.id)}">
          <div class="listItemTitle">
            <input class="input smallInput" value="${escapeHtml(u.username)}" data-edit-username />
            ${rolePill}
            <select class="input smallInput" data-edit-role>
              <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
              <option value="agent" ${u.role === "agent" ? "selected" : ""}>agent</option>
              <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
            </select>
            <button class="btn secondary small" data-save-user>💾 Spara</button>
            <button class="btn danger small" data-del-user>🗑 Ta bort</button>
            <span class="muted small" style="margin-left:auto;">${escapeHtml(shortId)}</span>
          </div>
          <div class="muted small">${escapeHtml(u.email || "")} • ${fmtDate(u.createdAt)}</div>
        </div>
      `;
    })
    .join("");

  // Bind save/delete with robust feedback
  qsa("#adminUsersList .listItem").forEach((item) => {
    const id = item.getAttribute("data-id");
    item.querySelector("[data-save-user]")?.addEventListener("click", async () => {
      const username = item.querySelector("[data-edit-username]")?.value?.trim();
      const role = item.querySelector("[data-edit-role]")?.value;
      if (!username) return setAlert($("adminUsersMsg"), "Användarnamn krävs", "error");
      try {
        await api(`/admin/users/${encodeURIComponent(id)}/role`, {
          method: "POST",
          body: JSON.stringify({ role, username }),
        });
        setAlert($("adminUsersMsg"), "Uppdaterad ✅", "");
        toast("Användare uppdaterad");
        await loadAdminUsers();
      } catch (e) {
        setAlert($("adminUsersMsg"), e.message, "error");
        toast("Fel: " + e.message);
      }
    });
    item.querySelector("[data-del-user]")?.addEventListener("click", async () => {
      if (!confirm("Ta bort användare?")) return;
      try {
        await api(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
        setAlert($("adminUsersMsg"), "Användare borttagen ✅", "");
        toast("Användare borttagen");
        await loadAdminUsers();
      } catch (e) {
        setAlert($("adminUsersMsg"), e.message, "error");
        toast("Fel: " + e.message);
      }
    });
  });
}

/* =========================
   EXPORTS
========================= */
function exportAll() {
  fetch(API_BASE + "/admin/export/all", {
    headers: { Authorization: `Bearer ${state.token}` },
  })
    .then((r) => {
      if (!r.ok) throw new Error("Export misslyckades");
      return r.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `export_all_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => alert("❌ Export misslyckades"));
}

function exportTraining() {
  const url = `/admin/export/training?companyId=${encodeURIComponent(state.companyId)}`;
  fetch(API_BASE + url, { headers: { Authorization: `Bearer ${state.token}` } })
    .then((r) => {
      if (!r.ok) throw new Error("Export misslyckades");
      return r.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `training_export_${state.companyId}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => alert("❌ Training export misslyckades"));
}

/* =========================
   KB Manager
========================= */
async function loadKbList() {
  const box = $("kbList");
  const msg = $("kbMsg");
  if (!box) return;
  setAlert(msg, "");
  box.innerHTML = `<div class="muted small">Laddar KB...</div>`;

  const companyId = $("kbCategorySelect")?.value || "demo";
  const items = await safeApi(`/kb/list/${companyId}`);

  if (!items || !Array.isArray(items)) {
    setAlert(msg, "Kunde inte ladda KB (saknar endpoint/behörighet).", "error");
    box.innerHTML = `<div class="muted small">Kunde inte ladda KB.</div>`;
    return;
  }

  if (!items.length) {
    box.innerHTML = `<div class="muted small">Inga KB chunks ännu.</div>`;
    return;
  }

  box.innerHTML = items
    .map((c) => {
      return `
        <div class="listItem" data-id="${escapeHtml(c._id)}">
          <div class="listItemTitle">
            ${escapeHtml(c.title || c.sourceRef || "KB")}
            <span class="muted small" style="margin-left:auto;">#${c.chunkIndex}</span>
            <button class="btn danger small" data-del-kb>🗑 Ta bort</button>
          </div>
          <div class="muted small">${escapeHtml(c.sourceType)} • ${escapeHtml(c.sourceRef || "")}</div>
          <div class="muted small" style="margin-top:8px;">${escapeHtml((c.content || "").slice(0, 180))}...</div>
        </div>
      `;
    })
    .join("");

  // Bind delete with robust feedback
  qsa("#kbList .listItem").forEach((item) => {
    const id = item.getAttribute("data-id");
    item.querySelector("[data-del-kb]")?.addEventListener("click", async () => {
      if (!confirm("Ta bort denna KB-chunk?")) return;
      try {
        await api(`/kb/${encodeURIComponent(id)}`, { method: "DELETE" });
        setAlert($("kbMsg"), "KB borttagen ✅", "");
        toast("KB borttagen");
        await loadKbList();
      } catch (e) {
        setAlert($("kbMsg"), e.message, "error");
        toast("Fel: " + e.message);
      }
    });
  });
}

async function kbUploadText() {
  const msg = $("kbMsg");
  setAlert(msg, "");
  try {
    const companyId = $("kbCategorySelect")?.value || "demo";
    const title = $("kbTextTitle")?.value?.trim() || "Text";
    const content = $("kbTextContent")?.value?.trim() || "";
    if (!content) throw new Error("Klistra in text först.");

    const data = await api("/kb/upload-text", {
      method: "POST",
      body: JSON.stringify({ companyId, title, content }),
    });

    setAlert(msg, data.message || "Uppladdat ✅", "");
    $("kbTextContent").value = "";
    await loadKbList();
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

async function kbUploadUrl() {
  const msg = $("kbMsg");
  setAlert(msg, "");
  try {
    const companyId = $("kbCategorySelect")?.value || "demo";
    const url = $("kbUrlInput")?.value?.trim();
    if (!url) throw new Error("Skriv en URL.");

    const data = await api("/kb/upload-url", {
      method: "POST",
      body: JSON.stringify({ companyId, url }),
    });

    setAlert(msg, data.message || "Uppladdat ✅", "");
    $("kbUrlInput").value = "";
    await loadKbList();
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

async function kbUploadPdf() {
  const msg = $("kbMsg");
  setAlert(msg, "");
  try {
    const companyId = $("kbCategorySelect")?.value || "demo";
    const file = $("kbPdfFile")?.files?.[0];
    if (!file) throw new Error("Välj en PDF fil.");

    const base64 = await fileToBase64(file);
    const data = await api("/kb/upload-pdf", {
      method: "POST",
      body: JSON.stringify({ companyId, filename: file.name, base64 }),
    });

    setAlert(msg, data.message || "Uppladdat ✅", "");
    $("kbPdfFile").value = "";
    await loadKbList();
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const res = String(fr.result || "");
      const b64 = res.split(",")[1] || "";
      resolve(b64);
    };
    fr.onerror = () => reject(new Error("Kunde inte läsa fil"));
    fr.readAsDataURL(file);
  });
}

function exportKb() {
  const companyId = $("kbCategorySelect")?.value || "demo";
  const url = `/export/kb/${encodeURIComponent(companyId)}`;
  fetch(API_BASE + url, { headers: { Authorization: `Bearer ${state.token}` } })
    .then((r) => {
      if (!r.ok) throw new Error("Export misslyckades");
      return r.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kb_${companyId}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => alert("❌ KB export misslyckades"));
}

/* =========================
   Categories Admin
========================= */
async function loadCategoriesAdmin() {
  const box = $("catsList");
  const msg = $("catsMsg");
  if (!box) return;
  setAlert(msg, "");
  box.innerHTML = `<div class="muted small">Laddar...</div>`;

  const cats = await safeApi("/categories");
  if (!cats || !Array.isArray(cats)) {
    setAlert(msg, "Kunde inte ladda kategorier (saknar endpoint).", "error");
    box.innerHTML = `<div class="muted small">Kunde inte ladda.</div>`;
    return;
  }

  box.innerHTML = cats
    .map((c) => {
      return `
        <div class="listItem" data-key="${escapeHtml(c.key)}">
          <div class="listItemTitle">
            <input class="input smallInput" value="${escapeHtml(c.name)}" data-edit-name />
            <span class="muted small">(${escapeHtml(c.key)})</span>
            <button class="btn secondary small" data-save-cat>💾 Spara</button>
            <button class="btn danger small" data-del-cat>🗑 Ta bort</button>
          </div>
          <div class="muted small" style="margin-top:6px;">System prompt:</div>
          <textarea class="input textarea" style="min-height:80px;" data-edit-prompt>${escapeHtml(c.systemPrompt || "")}</textarea>
        </div>
      `;
    })
    .join("");

  // Bind save/delete with robust feedback
  qsa("#catsList .listItem").forEach((item) => {
    const key = item.getAttribute("data-key");
    item.querySelector("[data-save-cat]")?.addEventListener("click", async () => {
      const name = item.querySelector("[data-edit-name]")?.value?.trim();
      const systemPrompt = item.querySelector("[data-edit-prompt]")?.value?.trim();
      if (!name) return setAlert($("catsMsg"), "Namn krävs", "error");
      try {
        await api(`/admin/categories/${encodeURIComponent(key)}`, {
          method: "PUT",
          body: JSON.stringify({ name, systemPrompt }),
        });
        setAlert($("catsMsg"), "Kategori uppdaterad ✅", "");
        toast("Kategori uppdaterad");
        await loadCategories();
        await loadCategoriesAdmin();
      } catch (e) {
        setAlert($("catsMsg"), e.message, "error");
        toast("Fel: " + e.message);
      }
    });
    item.querySelector("[data-del-cat]")?.addEventListener("click", async () => {
      if (!confirm("Ta bort kategori?")) return;
      try {
        await api(`/admin/categories/${encodeURIComponent(key)}`, { method: "DELETE" });
        setAlert($("catsMsg"), "Kategori borttagen ✅", "");
        toast("Kategori borttagen");
        await loadCategories();
        await loadCategoriesAdmin();
      } catch (e) {
        setAlert($("catsMsg"), e.message, "error");
        toast("Fel: " + e.message);
      }
    });
  });
}

async function createCategory() {
  const msg = $("catsMsg");
  setAlert(msg, "");
  try {
    const key = $("newCatKey")?.value?.trim();
    const name = $("newCatName")?.value?.trim();
    const systemPrompt = $("newCatPrompt")?.value?.trim() || "";
    if (!key || !name) throw new Error("Fyll i key + namn.");

    const data = await api("/admin/categories", {
      method: "POST",
      body: JSON.stringify({ key, name, systemPrompt }),
    });

    setAlert(msg, data.message || "Skapad ✅", "");
    $("newCatKey").value = "";
    $("newCatName").value = "";
    $("newCatPrompt").value = "";

    await loadCategories();
    await loadCategoriesAdmin();
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

/* =========================
   SETTINGS
========================= */
async function changeUsername() {
  const msg = $("settingsMsg");
  setAlert(msg, "");
  try {
    const newUsername = $("newUsernameInput")?.value?.trim();
    if (!newUsername || newUsername.length < 3) throw new Error("Nytt användarnamn är för kort.");

    const data = await api("/auth/change-username", {
      method: "POST",
      body: JSON.stringify({ newUsername }),
    });

    setAlert(msg, data.message || "Uppdaterat ✅", "");
    $("newUsernameInput").value = "";

    const me = await safeApi("/me");
    if (me) {
      state.user = me;
      setLS(LS.user, JSON.stringify(me));
      onLoggedIn();
    }
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

async function changePassword() {
  const msg = $("settingsMsg");
  setAlert(msg, "");
  try {
    const currentPassword = $("currentPassInput")?.value || "";
    const newPassword = $("newPassInput")?.value || "";
    if (!currentPassword || !newPassword) throw new Error("Fyll i båda fälten.");

    const data = await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    setAlert(msg, data.message || "Lösenord uppdaterat ✅", "");
    $("currentPassInput").value = "";
    $("newPassInput").value = "";
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

/* =========================
   DEBUG PANEL (FIXED END)
========================= */
function updateDebug(extra = {}) {
  // Enkel debugpanel
  if ($("dbgStats")) {
    $("dbgStats").textContent = `${escapeHtml(String(state.myTicketsCount))} / Inbox: ${escapeHtml(String(state.inboxOpenCount))}`;
  }
  if ($("dbgApi")) $("dbgApi").textContent = location.origin;
  if ($("dbgLogged")) $("dbgLogged").textContent = state.user?.username || "NEJ";
  if ($("dbgRole")) $("dbgRole").textContent = state.user?.role || "-";
  if ($("dbgToken")) $("dbgToken").textContent = state.token ? "JA" : "NEJ";
}

/* =========================
   SLA EXTRA UI (HTML match)
   ✅ Compare mode (visuell hint)
   ✅ Filters + sort för ticket-tabellen
   ✅ Clear my stats / clear all stats (kopplar till backend om du vill)
========================= */

function getSlaCompareMode() {
  return $("slaCompareMode")?.value || "none";
}

function applySlaTicketsFilters(rawRows) {
  let rows = Array.isArray(rawRows) ? [...rawRows] : [];

  const breachedMode = $("slaBreachedFilter")?.value || "all";
  const breachType = $("slaBreachTypeFilter")?.value || "any";
  const sortMode = $("slaSortTickets")?.value || "newest";

  // Filter: breached only / ok only
  if (breachedMode === "breachedOnly") {
    rows = rows.filter((r) => r.sla?.breachedFirstResponse || r.sla?.breachedResolution);
  } else if (breachedMode === "okOnly") {
    rows = rows.filter((r) => !r.sla?.breachedFirstResponse && !r.sla?.breachedResolution);
  }

  // Filter: type
  if (breachType === "first") {
    rows = rows.filter((r) => r.sla?.breachedFirstResponse);
  } else if (breachType === "resolution") {
    rows = rows.filter((r) => r.sla?.breachedResolution);
  }

  // Sort
  if (sortMode === "oldest") {
    rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sortMode === "worstFirst") {
    // "worst": prioriterar de som brutit både first+resolution
    rows.sort((a, b) => {
      const wa =
        (a.sla?.breachedFirstResponse ? 2 : 0) +
        (a.sla?.breachedResolution ? 2 : 0) +
        (a.priority === "high" ? 1 : 0);
      const wb =
        (b.sla?.breachedFirstResponse ? 2 : 0) +
        (b.sla?.breachedResolution ? 2 : 0) +
        (b.priority === "high" ? 1 : 0);
      return wb - wa;
    });
  } else {
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  return rows;
}

// Patch: renderSlaTickets ska ta hänsyn till filter
const __origRenderSlaTickets = renderSlaTickets;
renderSlaTickets = function (data) {
  const rows = applySlaTicketsFilters(data?.rows || []);
  return __origRenderSlaTickets({ ...data, rows });
};

// Bind events för filter/sort
function bindSlaExtraUi() {
  $("slaCompareMode")?.addEventListener("change", () => refreshSlaAll().catch(() => {}));
  $("slaBreachedFilter")?.addEventListener("change", () => refreshSlaAll().catch(() => {}));
  $("slaBreachTypeFilter")?.addEventListener("change", () => refreshSlaAll().catch(() => {}));
  $("slaSortTickets")?.addEventListener("change", () => refreshSlaAll().catch(() => {}));

  // Clear-knappar (safe)
  $("slaClearMyStatsBtn")?.addEventListener("click", async () => {
    alert(
      "Denna knapp är kopplad i UI ✅\n\nFör att radera statistik behöver vi en backend-endpoint (t.ex. /admin/sla/clear-my).\nSäg till så fixar jag den."
    );
  });

  $("slaClearAllStatsBtn")?.addEventListener("click", async () => {
    alert(
      "Denna knapp är kopplad i UI ✅\n\nFör att radera ALL statistik behöver vi en backend-endpoint (t.ex. /admin/sla/clear-all).\nSäg till så fixar jag den."
    );
  });
}

// Kör efter bindEvents (så vi inte påverkar annan init)
document.addEventListener("DOMContentLoaded", () => {
  bindSlaExtraUi();
});

