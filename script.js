alert("script.js laddad ✅");

/* =========================================================
   AI Kundtjänst - script.js (FULL ✅ STABLE)
   - Matchar index.html IDs
   - Robust UI rendering (aldrig "tomt utan text")
   - Token/auth säker
   - Inbox / My tickets / Admin / KB / SLA fungerar
   - Chart.js: destroy/recreate + stabil canvas height
   ========================================================= */

/* =========================
   CONFIG
========================= */
const API_BASE = ""; // ✅ samma origin på Render. (Om du kör separat: sätt full URL här)

/* =========================
   LocalStorage keys
========================= */
const LS = {
  token: "ai_token",
  user: "ai_user",
  theme: "ai_theme",
  debug: "ai_debug",
  chatConversation: "ai_chat_conversation",
  currentCompanyId: "ai_company_id",
  lastTicketId: "ai_last_ticket_id",
};

/* =========================
   State
========================= */
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

function setAlert(el, msg, type = "") {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error");
  if (type === "error") el.classList.add("error");
  show(el, !!msg);
}

function pill(label, kind = "") {
  const cls =
    kind === "ok" ? "pill ok" : kind === "warn" ? "pill warn" : kind === "danger" ? "pill danger" : "pill";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

/* =========================
   API helper (robust)
========================= */
async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (!headers["Content-Type"] && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(API_BASE + path, { ...opts, headers });

  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  else data = await res.text().catch(() => null);

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Theme init
  const savedTheme = localStorage.getItem(LS.theme);
  if (savedTheme) document.body.setAttribute("data-theme", savedTheme);

  show($("debugPanel"), state.debug);

  bindEvents();
  boot();
});

async function boot() {
  // Always show something in all panels to avoid "blank feeling"
  if ($("myTicketsList")) $("myTicketsList").innerHTML = `<div class="muted small">Logga in för att se dina ärenden.</div>`;
  if ($("inboxTicketsList")) $("inboxTicketsList").innerHTML = `<div class="muted small">Logga in som agent/admin.</div>`;
  if ($("slaOverviewBox")) $("slaOverviewBox").innerHTML = `<div class="muted small">Logga in som agent/admin.</div>`;
  if ($("adminUsersList")) $("adminUsersList").innerHTML = `<div class="muted small">Logga in som admin.</div>`;

  // Load categories (public)
  await loadCategories().catch(() => {});

  if ($("categorySelect")) $("categorySelect").value = state.companyId;
  if ($("kbCategorySelect")) $("kbCategorySelect").value = state.companyId;

  // Validate token
  if (state.token) {
    try {
      const me = await api("/me");
      state.user = me;
      setLS(LS.user, JSON.stringify(me));
      await onLoggedIn();
    } catch {
      doLogout(false);
    }
  } else {
    onLoggedOut();
  }

  updateDebug();
  handleResetTokenFromUrl();
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  // Sidebar
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("openChatView");
    switchView("chatView");
    renderConversation();
    scrollMessagesToBottom();
  });

  $("openMyTicketsView")?.addEventListener("click", async () => {
    setActiveMenu("openMyTicketsView");
    switchView("myTicketsView");

    if (!state.token) {
      if ($("myTicketsList")) $("myTicketsList").innerHTML = `<div class="muted small">Logga in först.</div>`;
      if ($("myTicketDetails")) $("myTicketDetails").innerHTML = `Logga in för att se detaljer.`;
      return;
    }

    await loadMyTickets().catch((e) => setAlert($("myTicketsHint"), e.message, "error"));
  });

  $("openInboxView")?.addEventListener("click", async () => {
    setActiveMenu("openInboxView");
    switchView("inboxView");

    if (!state.token) {
      setAlert($("inboxMsg"), "Logga in först.", "error");
      return;
    }

    await loadInboxTickets().catch((e) => setAlert($("inboxMsg"), e.message, "error"));
  });

  $("openSlaView")?.addEventListener("click", async () => {
    setActiveMenu("openSlaView");
    switchView("slaView");

    if (!state.token) {
      $("slaOverviewBox").innerHTML = `<div class="muted small">Logga in som agent/admin för SLA.</div>`;
      return;
    }

    await refreshSlaAll().catch(() => {});
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("openAdminView");
    switchView("adminView");

    if (!state.token) {
      $("adminUsersList").innerHTML = `<div class="muted small">Logga in som admin.</div>`;
      return;
    }

    await refreshAdminAll().catch(() => {});
  });

  $("openSettingsView")?.addEventListener("click", () => {
    setActiveMenu("openSettingsView");
    switchView("settingsView");
  });

  // Category select
  $("categorySelect")?.addEventListener("change", async (e) => {
    state.companyId = e.target.value || "demo";
    setLS(LS.currentCompanyId, state.companyId);

    if ($("kbCategorySelect")) $("kbCategorySelect").value = state.companyId;
    updateDebug();
  });

  // Theme toggle
  $("themeToggle")?.addEventListener("click", () => {
    const cur = document.body.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(LS.theme, next);
  });

  // Debug toggle
  $("toggleDebugBtn")?.addEventListener("click", () => {
    state.debug = !state.debug;
    localStorage.setItem(LS.debug, state.debug ? "1" : "0");
    show($("debugPanel"), state.debug);
    updateDebug();
  });

  // Auth
  $("loginBtn")?.addEventListener("click", doLogin);
  $("registerBtn")?.addEventListener("click", doRegister);
  $("logoutBtn")?.addEventListener("click", () => doLogout(true));

  $("togglePassBtn")?.addEventListener("click", () => togglePass("password", "togglePassBtn"));
  $("toggleResetPassBtn")?.addEventListener("click", () => togglePass("resetNewPass", "toggleResetPassBtn"));

  // Forgot
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
    if ($("messages")) $("messages").innerHTML = "";
  });

  $("exportChatBtn")?.addEventListener("click", exportChat);

  $("newTicketBtn")?.addEventListener("click", () => {
    state.lastTicketId = "";
    setLS(LS.lastTicketId, "");
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    if ($("messages")) $("messages").innerHTML = "";
    addSystemMessage("Nytt ärende startat ✅");
  });

  // Feedback
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
  $("slaCompareMode")?.addEventListener("change", refreshSlaAll);

  $("slaBreachedFilter")?.addEventListener("change", renderSlaTicketsFromCache);
  $("slaBreachTypeFilter")?.addEventListener("change", renderSlaTicketsFromCache);
  $("slaSortTickets")?.addEventListener("change", renderSlaTicketsFromCache);

  $("slaClearMyStatsBtn")?.addEventListener("click", clearMySlaStats);
  $("slaClearAllStatsBtn")?.addEventListener("click", clearAllSlaStats);

  // Admin tabs
  qsa(".tabBtn").forEach((b) => {
    b.addEventListener("click", () => {
      qsa(".tabBtn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const tab = b.getAttribute("data-tab");
      qsa(".tabPanel").forEach((p) => show(p, p.id === tab));
    });
  });

  // Admin actions
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

    state.token = data.token || "";
    state.user = data.user || null;

    setLS(LS.token, state.token);
    setLS(LS.user, JSON.stringify(state.user || {}));

    await onLoggedIn();
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
    if (!username || !password) throw new Error("Fyll i användarnamn och lösenord");

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
  state.lastTicketId = "";
  state.selectedInboxTicketId = null;
  state.selectedMyTicketId = null;

  setLS(LS.token, "");
  setLS(LS.user, "");
  setLS(LS.lastTicketId, "");

  destroyTrendChart();
  onLoggedOut();

  if (showMsg) addSystemMessage("Du är utloggad ✅");
}

function onLoggedOut() {
  if ($("roleBadge")) $("roleBadge").textContent = "Inte inloggad";
  show($("logoutBtn"), false);
  show($("openSettingsView"), false);

  qsa(".adminOnly").forEach((x) => (x.style.display = "none"));

  switchView("authView");
  setActiveMenu("openChatView");

  if ($("messages")) $("messages").innerHTML = "";
  state.conversation = [];
  setLS(LS.chatConversation, JSON.stringify(state.conversation));

  updateDebug();
}

async function onLoggedIn() {
  show($("logoutBtn"), true);
  show($("openSettingsView"), true);

  const role = state.user?.role || "user";
  if ($("roleBadge")) {
    $("roleBadge").textContent =
      role === "user" ? `Inloggad: ${state.user?.username || ""}` : `${state.user?.username || ""} (${role})`;
  }

  if (role === "agent" || role === "admin") {
    qsa(".adminOnly").forEach((x) => (x.style.display = ""));
  } else {
    qsa(".adminOnly").forEach((x) => (x.style.display = "none"));
  }

  show($("slaClearAllStatsBtn"), role === "admin");

  switchView("chatView");
  setActiveMenu("openChatView");

  renderConversation();
  scrollMessagesToBottom();

  await loadInboxCategoryFilter().catch(() => {});
  updateDebug();
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
   Forgot/Reset password
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
  const cats = await api("/categories");
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
      opt.value = c.key;
      opt.textContent = c.key === c.name ? c.key : `${c.name} (${c.key})`;
      selectEl.appendChild(opt);
    }
    selectEl.value = cur || "demo";
  }

  fill(sel, false);
  fill(selKb, false);
  fill(selInbox, true);
}

async function loadInboxCategoryFilter() {
  await loadCategories().catch(() => {});
}

/* =========================
   CHAT
========================= */
function addSystemMessage(text) {
  addMessageToUI("assistant", text);
}

function addMessageToUI(role, content) {
  const container = $("messages");
  if (!container) return;

  const wrap = document.createElement("div");
  wrap.className = "msg " + (role === "user" ? "user" : "assistant");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = role === "user" ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-robot"></i>`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content || "";

  const bubbleWrap = document.createElement("div");
  bubbleWrap.appendChild(bubble);

  if (role !== "user") {
    const actions = document.createElement("div");
    actions.className = "bubbleActions";
    actions.innerHTML = `<button class="actionBtn" type="button"><i class="fa-solid fa-copy"></i> Kopiera</button>`;
    actions.querySelector("button")?.addEventListener("click", () => {
      navigator.clipboard.writeText(content || "").catch(() => {});
    });
    bubbleWrap.appendChild(actions);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubbleWrap);

  container.appendChild(wrap);
}

function renderConversation() {
  const container = $("messages");
  if (!container) return;

  container.innerHTML = "";

  for (const m of state.conversation) {
    if (!m?.role) continue;
    addMessageToUI(m.role, m.content || "");
  }
}

function scrollMessagesToBottom() {
  const el = $("messages");
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

async function sendChat() {
  const inp = $("messageInput");
  if (!inp) return;

  if (!state.token) {
    addMessageToUI("assistant", "❌ Du måste logga in först.");
    return;
  }

  const text = inp.value.trim();
  if (!text) return;
  inp.value = "";

  state.conversation.push({ role: "user", content: text });
  setLS(LS.chatConversation, JSON.stringify(state.conversation));
  addMessageToUI("user", text);
  scrollMessagesToBottom();

  try {
    const payload = {
      companyId: state.companyId,
      conversation: state.conversation,
    };
    if (state.lastTicketId) payload.ticketId = state.lastTicketId;

    const data = await api("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const reply = data.reply || "Inget svar.";
    state.lastTicketId = data.ticketId || state.lastTicketId || "";
    setLS(LS.lastTicketId, state.lastTicketId);

    state.conversation.push({ role: "assistant", content: reply });
    setLS(LS.chatConversation, JSON.stringify(state.conversation));

    addMessageToUI("assistant", reply);

    updateDebug({ ragUsed: !!data.ragUsed, ticketId: state.lastTicketId });
    scrollMessagesToBottom();
  } catch (e) {
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
  try {
    await api("/feedback", {
      method: "POST",
      body: JSON.stringify({ type, companyId: state.companyId }),
    });
    if ($("fbMsg")) {
      $("fbMsg").textContent = "Tack! ✅";
      setTimeout(() => ($("fbMsg").textContent = ""), 1200);
    }
  } catch (e) {
    if ($("fbMsg")) {
      $("fbMsg").textContent = `Fel: ${e.message}`;
      setTimeout(() => ($("fbMsg").textContent = ""), 1500);
    }
  }
}

/* =========================
   MY TICKETS
========================= */
async function loadMyTickets() {
  setAlert($("myTicketsHint"), "");

  const list = $("myTicketsList");
  const details = $("myTicketDetails");
  if (list) list.innerHTML = `<div class="muted small">Laddar...</div>`;
  if (details) details.innerHTML = `<span class="muted small">Laddar...</span>`;

  try {
    const tickets = await api("/my/tickets");

    if (!tickets.length) {
      if (list) list.innerHTML = `<div class="muted small">Inga ärenden ännu.</div>`;
      if (details) details.innerHTML = `<span class="muted small">Skapa en ny konversation i Chat.</span>`;
      return;
    }

    if (list) {
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
                ${pill(prio, prio === "high" ? "danger" : prio === "low" ? "" : "")}
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
    }

    const firstId = tickets[0]._id;
    state.selectedMyTicketId = firstId;
    const firstEl = qs(`#myTicketsList .listItem[data-id="${firstId}"]`);
    if (firstEl) firstEl.classList.add("selected");
    await loadMyTicketDetails(firstId);
  } catch (e) {
    setAlert($("myTicketsHint"), e.message, "error");
    if (list) list.innerHTML = `<div class="muted small">Kunde inte ladda.</div>`;
    if (details) details.innerHTML = `<span class="muted small">Fel: ${escapeHtml(e.message)}</span>`;
  }
}

async function loadMyTicketDetails(ticketId) {
  const details = $("myTicketDetails");
  if (!details) return;

  details.innerHTML = `<span class="muted small">Laddar...</span>`;

  try {
    const t = await api(`/my/tickets/${ticketId}`);
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
  } catch (e) {
    details.innerHTML = `<span class="muted small">Fel: ${escapeHtml(e.message)}</span>`;
  }
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
   INBOX (Agent/Admin)
========================= */
async function loadInboxTickets() {
  setAlert($("inboxMsg"), "");
  const list = $("inboxTicketsList");
  if (!list) return;

  list.innerHTML = `<div class="muted small">Laddar...</div>`;

  const status = $("inboxStatusFilter")?.value || "";
  const companyId = $("inboxCategoryFilter")?.value || "";
  const search = $("inboxSearchInput")?.value?.trim().toLowerCase() || "";

  try {
    const url = new URL(location.origin + "/admin/tickets");
    if (status) url.searchParams.set("status", status);
    if (companyId) url.searchParams.set("companyId", companyId);

    let tickets = await api(url.pathname + url.search);

    if (search) {
      tickets = tickets.filter((t) => {
        const id = String(t._id || "").toLowerCase();
        const title = String(t.title || "").toLowerCase();
        const cat = String(t.companyId || "").toLowerCase();
        return id.includes(search) || title.includes(search) || cat.includes(search);
      });
    }

    const openCount = tickets.filter((t) => t.status === "open").length;
    const dot = $("inboxNotifDot");
    if (dot) show(dot, openCount > 0);

    if (!tickets.length) {
      list.innerHTML = `<div class="muted small">Inga tickets i inboxen.</div>`;
      $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
      return;
    }

    list.innerHTML = tickets
      .map((t) => {
        const statusPill =
          t.status === "solved" ? pill("solved", "ok") : t.status === "pending" ? pill("pending", "warn") : pill("open");
        const prioPill = t.priority === "high" ? pill("high", "danger") : t.priority === "low" ? pill("low") : pill("normal");
        const assigned = t.assignedToUserId ? `<span class="muted small">assigned</span>` : `<span class="muted small">unassigned</span>`;

        return `
          <div class="listItem" data-id="${t._id}">
            <div class="listItemTitle">
              ${escapeHtml(t.title || "(utan titel)")}
              ${statusPill}
              ${prioPill}
            </div>
            <div class="muted small">
              ${escapeHtml(String(t.companyId || ""))} • ${escapeHtml(String(t._id).slice(-8))} • ${fmtDate(t.lastActivityAt || t.createdAt)} • ${assigned}
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

    // Auto select
    if (!state.selectedInboxTicketId && tickets[0]) {
      state.selectedInboxTicketId = tickets[0]._id;
      const el = qs(`#inboxTicketsList .listItem[data-id="${tickets[0]._id}"]`);
      if (el) el.classList.add("selected");
      await loadInboxTicketDetails(tickets[0]._id);
    }
  } catch (e) {
    setAlert($("inboxMsg"), e.message, "error");
    list.innerHTML = `<div class="muted small">Kunde inte ladda tickets.</div>`;
  }
}

async function loadInboxTicketDetails(ticketId) {
  const box = $("ticketDetails");
  const msg = $("inboxTicketMsg");
  if (!box) return;

  setAlert(msg, "");
  box.innerHTML = `<div class="muted small">Laddar...</div>`;
  if ($("internalNotesList")) $("internalNotesList").innerHTML = "";

  try {
    const t = await api(`/admin/tickets/${ticketId}`);

    if ($("ticketPrioritySelect")) $("ticketPrioritySelect").value = t.priority || "normal";
    await fillAssignUsers(t.assignedToUserId);

    const sla = t.sla || {};
    const first = sla.firstResponseMs != null ? msToPretty(sla.firstResponseMs) : "—";
    const res = sla.resolutionMs != null ? msToPretty(sla.resolutionMs) : "—";
    const pendingTotal = sla.pendingTotalMs != null ? msToPretty(sla.pendingTotalMs) : "—";
    const effRun = sla.effectiveRunningMs != null ? msToPretty(sla.effectiveRunningMs) : "—";

    const firstB = sla.breachedFirstResponse ? pill("First breached", "danger") : pill("First OK", "ok");
    const resB = sla.breachedResolution ? pill("Res breached", "danger") : pill("Res OK", "ok");

    const top = `
      <div style="margin-bottom:10px;">
        <div><b>${escapeHtml(t.title || "Ticket")}</b></div>
        <div class="muted small">
          ${escapeHtml(t.companyId)} • ${escapeHtml(String(t._id))} • Skapad ${fmtDate(t.createdAt)}
        </div>
        <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
          ${pill(t.status, t.status === "solved" ? "ok" : t.status === "pending" ? "warn" : "")}
          ${pill(t.priority, t.priority === "high" ? "danger" : "")}
          ${firstB}
          ${resB}
        </div>
      </div>

      <div class="divider"></div>

      <div class="row gap" style="flex-wrap:wrap;">
        <div class="pill">First: <b>${escapeHtml(first)}</b></div>
        <div class="pill">Resolution: <b>${escapeHtml(res)}</b></div>
        <div class="pill">Pending total: <b>${escapeHtml(pendingTotal)}</b></div>
        <div class="pill">Effective running: <b>${escapeHtml(effRun)}</b></div>
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
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
    box.innerHTML = `<div class="muted small">Kunde inte visa ticket.</div>`;
  }
}

async function setInboxTicketStatus(status) {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");
  try {
    await api(`/admin/tickets/${state.selectedInboxTicketId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    await loadInboxTicketDetails(state.selectedInboxTicketId);
    await loadInboxTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
  }
}

async function setInboxPriority() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");
  try {
    const priority = $("ticketPrioritySelect")?.value || "normal";
    await api(`/admin/tickets/${state.selectedInboxTicketId}/priority`, {
      method: "POST",
      body: JSON.stringify({ priority }),
    });
    await loadInboxTicketDetails(state.selectedInboxTicketId);
    await loadInboxTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
  }
}

async function sendInboxAgentReply() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  try {
    const content = $("agentReplyTextInbox")?.value?.trim();
    if (!content) throw new Error("Skriv ett svar.");

    await api(`/admin/tickets/${state.selectedInboxTicketId}/agent-reply`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });

    $("agentReplyTextInbox").value = "";
    await loadInboxTicketDetails(state.selectedInboxTicketId);
    await loadInboxTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
  }
}

async function saveInternalNote() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  try {
    const content = $("internalNoteText")?.value?.trim();
    if (!content) throw new Error("Skriv en intern notering.");

    const data = await api(`/admin/tickets/${state.selectedInboxTicketId}/internal-note`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });

    $("internalNoteText").value = "";
    renderInternalNotes(data.ticket?.internalNotes || []);
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
  }
}

async function clearInternalNotes() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");
  try {
    await api(`/admin/tickets/${state.selectedInboxTicketId}/internal-notes`, {
      method: "DELETE",
    });
    renderInternalNotes([]);
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
  }
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

  try {
    const users = await api("/admin/users");
    const agents = users.filter((u) => u.role === "agent" || u.role === "admin");

    sel.innerHTML =
      `<option value="">Välj agent...</option>` +
      agents.map((u) => `<option value="${u._id}">${escapeHtml(u.username)} (${u.role})</option>`).join("");
    sel.value = selectedId || "";
  } catch {
    // ignore
  }
}

async function assignTicketToAgent() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  try {
    const userId = $("assignUserSelect")?.value;
    if (!userId) throw new Error("Välj en agent att assigna.");

    await api(`/admin/tickets/${state.selectedInboxTicketId}/assign`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });

    await loadInboxTicketDetails(state.selectedInboxTicketId);
    await loadInboxTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
  }
}

async function deleteSelectedInboxTicket() {
  if (!state.selectedInboxTicketId) return;
  setAlert($("inboxTicketMsg"), "");

  if (!confirm("Ta bort ticket?")) return;

  try {
    await api(`/admin/tickets/${state.selectedInboxTicketId}`, { method: "DELETE" });
    state.selectedInboxTicketId = null;
    if ($("ticketDetails")) $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
    renderInternalNotes([]);
    await loadInboxTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message, "error");
  }
}

async function solveAllTickets() {
  setAlert($("inboxMsg"), "");
  if (!confirm("Solve ALL? (Admin)")) return;
  try {
    const data = await api("/admin/tickets/solve-all", { method: "POST" });
    setAlert($("inboxMsg"), data.message || "Klart ✅", "");
    await loadInboxTickets();
  } catch (e) {
    setAlert($("inboxMsg"), e.message, "error");
  }
}

async function removeSolvedTickets() {
  setAlert($("inboxMsg"), "");
  if (!confirm("Remove solved? (Admin)")) return;
  try {
    const data = await api("/admin/tickets/remove-solved", { method: "POST" });
    setAlert($("inboxMsg"), data.message || "Klart ✅", "");
    await loadInboxTickets();
  } catch (e) {
    setAlert($("inboxMsg"), e.message, "error");
  }
}

/* =========================
   ✅ SLA DASHBOARD
========================= */
let slaCache = {
  overview: null,
  kpi: null,
  trend: null,
  agents: null,
  tickets: null,
};

async function refreshSlaAll() {
  destroyTrendChart();

  const days = Number($("slaDaysSelect")?.value || 30);
  const compareMode = $("slaCompareMode")?.value || "none";

  if ($("slaOverviewBox")) $("slaOverviewBox").innerHTML = `<div class="muted small">Laddar KPI...</div>`;
  if ($("slaAgentsBox")) $("slaAgentsBox").innerHTML = `<div class="muted small">Laddar agents...</div>`;
  if ($("slaTicketsBox")) $("slaTicketsBox").innerHTML = `<div class="muted small">Laddar tickets...</div>`;
  if ($("slaTrendHint")) $("slaTrendHint").textContent = "";

  try {
    const overview = await api(`/admin/sla/overview?days=${days}`);
    slaCache.overview = overview;

    let kpi = null;
    try {
      kpi = await api(`/admin/sla/kpi?days=${days}`);
    } catch {
      kpi = null;
    }
    slaCache.kpi = kpi;

    renderSlaOverviewKpi(overview, kpi);

    const trend = await api(`/admin/sla/trend/weekly?days=${days}`);
    slaCache.trend = trend;

    const slaView = $("slaView");
    const isVisible = slaView && getComputedStyle(slaView).display !== "none";
    if (isVisible) renderSlaTrendChart(trend);

    const agents = await api(`/admin/sla/agents?days=${days}`);
    slaCache.agents = agents;
    renderSlaAgents(agents);

    const tickets = await api(`/admin/sla/tickets?days=${days}`);
    slaCache.tickets = tickets;
    renderSlaTicketsFromCache();

    if (compareMode && compareMode !== "none") {
      const a = days;
      const b = compareMode === "prevWeek" ? 7 : days;
      const cmp = await api(`/admin/sla/compare?a=${a}&b=${b}`);
      renderSlaCompareHint(cmp, compareMode);
    } else {
      if ($("slaTrendHint")) $("slaTrendHint").textContent = "Tips: välj jämförelseläge för att se förändring mot tidigare period.";
    }
  } catch (e) {
    if ($("slaOverviewBox")) $("slaOverviewBox").innerHTML = `<div class="alert error">❌ SLA fel: ${escapeHtml(e.message)}</div>`;
  }
}

function renderSlaOverviewKpi(o, kpi) {
  if (!o || !$("slaOverviewBox")) return;

  const total = o.totalTickets ?? 0;
  const byP = o.byPriority || { low: 0, normal: 0, high: 0 };

  const frAvg = o.firstResponse?.avgMs;
  const frMed = o.firstResponse?.medianMs;
  const frP90 = o.firstResponse?.p90Ms;
  const frBr = o.firstResponse?.breaches ?? 0;
  const frComp = o.firstResponse?.compliancePct;
  const frRisk = o.firstResponse?.atRisk ?? 0;

  const rsAvg = o.resolution?.avgMs;
  const rsMed = o.resolution?.medianMs;
  const rsP90 = o.resolution?.p90Ms;
  const rsBr = o.resolution?.breaches ?? 0;
  const rsComp = o.resolution?.compliancePct;
  const rsRisk = o.resolution?.atRisk ?? 0;

  const totals = kpi?.totals || {};
  const health = kpi?.slaHealth || {};
  const ageing = Array.isArray(kpi?.ageing) ? kpi.ageing : [];
  const solveRate = totals?.solveRatePct;

  const ageingText = ageing.length
    ? ageing.map((b) => `${escapeHtml(b.key)}: <b>${escapeHtml(String(b.count || 0))}</b>`).join(" • ")
    : "";

  $("slaOverviewBox").innerHTML = `
    <div class="slaGrid kpiWide">
      <div class="slaCard">
        <div class="slaLabel">Tickets (totalt)</div>
        <div class="slaValue">${escapeHtml(String(total))}</div>
        <div class="slaSubValue">
          Low: <b>${byP.low || 0}</b> • Normal: <b>${byP.normal || 0}</b> • High: <b>${byP.high || 0}</b>
        </div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">First response compliance</div>
        <div class="slaValue">${escapeHtml(pct(frComp))}</div>
        <div class="slaSubValue">
          Avg: <b>${escapeHtml(msToPretty(frAvg))}</b> • Median: <b>${escapeHtml(msToPretty(frMed))}</b><br/>
          P90: <b>${escapeHtml(msToPretty(frP90))}</b> • Breaches: <b>${escapeHtml(String(frBr))}</b> • At risk: <b>${escapeHtml(String(frRisk))}</b>
        </div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">Resolution compliance</div>
        <div class="slaValue">${escapeHtml(pct(rsComp))}</div>
        <div class="slaSubValue">
          Avg: <b>${escapeHtml(msToPretty(rsAvg))}</b> • Median: <b>${escapeHtml(msToPretty(rsMed))}</b><br/>
          P90: <b>${escapeHtml(msToPretty(rsP90))}</b> • Breaches: <b>${escapeHtml(String(rsBr))}</b> • At risk: <b>${escapeHtml(String(rsRisk))}</b>
        </div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">SLA Health (breached / risk)</div>
        <div class="slaValue">${escapeHtml(String(health?.breachedAny ?? 0))}</div>
        <div class="slaSubValue">
          Breached %: <b>${escapeHtml(pct(health?.breachedPct))}</b> • Risk: <b>${escapeHtml(String(health?.riskAny ?? 0))}</b> (${escapeHtml(pct(health?.riskPct))})<br/>
          Solve rate: <b>${escapeHtml(pct(solveRate))}</b>
        </div>
      </div>
    </div>

    <div class="divider"></div>
    <div class="panel soft">
      <b>Backlog ageing (öppna/pending)</b>
      <div class="muted small" style="margin-top:8px;">
        ${ageingText || "Ingen ageing-data ännu."}
      </div>
    </div>
  `;
}

function renderSlaCompareHint(cmp, mode) {
  const hint = $("slaTrendHint");
  if (!hint || !cmp?.a || !cmp?.b) return;

  const a = cmp.a;
  const b = cmp.b;

  const frA = a.firstResponse?.compliancePct;
  const frB = b.firstResponse?.compliancePct;
  const rsA = a.resolution?.compliancePct;
  const rsB = b.resolution?.compliancePct;

  const diff = (x, y) => {
    if (x == null || y == null) return "";
    const d = x - y;
    const sign = d >= 0 ? "+" : "";
    return `${sign}${d}pp`;
  };

  const label = mode === "prevWeek" ? "föregående vecka" : "föregående period";
  hint.textContent = `Jämförelse mot ${label}: First ${diff(frA, frB)}, Resolution ${diff(rsA, rsB)}.`;
}

/* =========================
   Chart.js trend
========================= */
function destroyTrendChart() {
  if (state.chartTrend) {
    try {
      state.chartTrend.destroy();
    } catch {}
    state.chartTrend = null;
  }
}

function ensureCanvasStableSize(canvas) {
  try {
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "260px";
  } catch {}
}

function renderSlaTrendChart(tr) {
  const canvas = $("slaTrendChart");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    if ($("slaTrendHint")) $("slaTrendHint").textContent = "❌ Chart.js saknas.";
    return;
  }

  destroyTrendChart();
  ensureCanvasStableSize(canvas);

  const rows = tr?.rows || [];
  if (!rows.length) {
    if ($("slaTrendHint")) $("slaTrendHint").textContent = "Ingen trend-data ännu.";
    return;
  }

  const labels = rows.map((r) => r.week);
  const firstPct = rows.map((r) => Number(r.firstCompliancePct || 0));
  const resPct = rows.map((r) => Number(r.resolutionCompliancePct || 0));

  const ctx = canvas.getContext("2d");

  state.chartTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "First response compliance (%)", data: firstPct, tension: 0.35, borderWidth: 2, pointRadius: 3 },
        { label: "Resolution compliance (%)", data: resPct, tension: 0.35, borderWidth: 2, pointRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true }, tooltip: { enabled: true } },
      scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } } },
    },
  });

  if ($("slaTrendHint")) $("slaTrendHint").textContent = "Trend visar compliance vecka för vecka.";
}

/* =========================
   SLA Agents table
========================= */
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
            <th>First med</th>
            <th>First P90</th>
            <th>First compliance</th>
            <th>Res avg</th>
            <th>Res med</th>
            <th>Res P90</th>
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
                  <td>${escapeHtml(msToPretty(fr.medianMs))}</td>
                  <td>${escapeHtml(msToPretty(fr.p90Ms))}</td>
                  <td>${escapeHtml(pct(fr.compliancePct))}</td>
                  <td>${escapeHtml(msToPretty(rs.avgMs))}</td>
                  <td>${escapeHtml(msToPretty(rs.medianMs))}</td>
                  <td>${escapeHtml(msToPretty(rs.p90Ms))}</td>
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

/* =========================
   SLA Tickets table (filter/sort)
========================= */
function renderSlaTicketsFromCache() {
  const data = slaCache.tickets;
  const box = $("slaTicketsBox");
  if (!box) return;

  if (!data?.rows) {
    box.innerHTML = `<div class="muted small">Ingen ticket-data.</div>`;
    return;
  }

  let rows = data.rows || [];

  const breachedFilter = $("slaBreachedFilter")?.value || "all";
  const breachType = $("slaBreachTypeFilter")?.value || "any";
  const sortMode = $("slaSortTickets")?.value || "newest";

  rows = rows.map((r) => ({
    ...r,
    _createdAtMs: new Date(r.createdAt).getTime() || 0,
    _worst:
      Math.max(
        r.sla?.firstResponseMs ? r.sla.firstResponseMs - (r.sla.firstResponseLimitMs || 0) : 0,
        r.sla?.effectiveRunningMs ? r.sla.effectiveRunningMs - (r.sla.resolutionLimitMs || 0) : 0
      ) || 0,
  }));

  if (breachedFilter === "breachedOnly") rows = rows.filter((r) => r.sla?.breachedFirstResponse || r.sla?.breachedResolution);
  if (breachedFilter === "okOnly") rows = rows.filter((r) => !r.sla?.breachedFirstResponse && !r.sla?.breachedResolution);

  if (breachType === "first") rows = rows.filter((r) => r.sla?.breachedFirstResponse);
  if (breachType === "resolution") rows = rows.filter((r) => r.sla?.breachedResolution);

  if (sortMode === "newest") rows.sort((a, b) => b._createdAtMs - a._createdAtMs);
  if (sortMode === "oldest") rows.sort((a, b) => a._createdAtMs - b._createdAtMs);
  if (sortMode === "worstFirst") rows.sort((a, b) => (b._worst || 0) - (a._worst || 0));

  box.innerHTML = `
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
            <th>First state</th>
            <th>Res</th>
            <th>Res state</th>
            <th>Pending total</th>
            <th>Breaches</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 800)
            .map((r) => {
              const sla = r.sla || {};
              const first = sla.firstResponseMs != null ? msToPretty(sla.firstResponseMs) : "—";
              const res = sla.resolutionMs != null ? msToPretty(sla.resolutionMs) : "—";
              const pending = sla.pendingTotalMs != null ? msToPretty(sla.pendingTotalMs) : "—";

              const firstState =
                sla.firstResponseState === "breached"
                  ? pill("breached", "danger")
                  : sla.firstResponseState === "at_risk"
                  ? pill("at risk", "warn")
                  : sla.firstResponseState === "waiting"
                  ? pill("waiting")
                  : pill("ok", "ok");

              const resState =
                sla.resolutionState === "breached"
                  ? pill("breached", "danger")
                  : sla.resolutionState === "at_risk"
                  ? pill("at risk", "warn")
                  : sla.resolutionState === "waiting"
                  ? pill("waiting")
                  : pill("ok", "ok");

              const b1 = sla.breachedFirstResponse ? pill("first", "danger") : pill("first", "ok");
              const b2 = sla.breachedResolution ? pill("res", "danger") : pill("res", "ok");

              return `
                <tr>
                  <td><span class="muted small">${escapeHtml(String(r.ticketId).slice(-8))}</span></td>
                  <td>${escapeHtml(r.companyId || "")}</td>
                  <td>${escapeHtml(r.status || "")}</td>
                  <td>${escapeHtml(r.priority || "")}</td>
                  <td>${escapeHtml(fmtDate(r.createdAt))}</td>
                  <td>${escapeHtml(first)}</td>
                  <td>${firstState}</td>
                  <td>${escapeHtml(res)}</td>
                  <td>${resState}</td>
                  <td>${escapeHtml(pending)}</td>
                  <td style="display:flex; gap:6px; flex-wrap:wrap;">${b1}${b2}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function exportSlaCsv() {
  const days = Number($("slaDaysSelect")?.value || 30);
  const url = `/admin/sla/export.csv?days=${days}`;

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
    .catch((e) => alert(`❌ Export misslyckades: ${e.message || ""}`));
}

async function clearMySlaStats() {
  try {
    if (!confirm("Radera min SLA-statistik?")) return;

    const me = state.user || {};
    const uid = me._id || me.id;

    if (!uid) throw new Error("Kunde inte hitta ditt userId (saknar _id).");

    await api(`/admin/sla/clear/agent/${uid}`, { method: "POST" });
    alert("✅ Din statistik raderad.");
    await refreshSlaAll();
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}

async function clearAllSlaStats() {
  try {
    if (!confirm("Radera ALL SLA-statistik? (Admin)")) return;
    await api(`/admin/sla/clear/all`, { method: "POST" });
    alert("✅ All statistik raderad.");
    await refreshSlaAll();
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}

/* =========================
   ADMIN DASHBOARD
========================= */
async function refreshAdminAll() {
  await loadAdminUsers().catch(() => {});
  await loadKbList().catch(() => {});
  await loadCategoriesAdmin().catch(() => {});
}

async function loadAdminUsers() {
  const box = $("adminUsersList");
  setAlert($("adminUsersMsg"), "");
  if (!box) return;

  box.innerHTML = `<div class="muted small">Laddar...</div>`;

  try {
    const users = await api("/admin/users");

    if (!users.length) {
      box.innerHTML = `<div class="muted small">Inga users hittades.</div>`;
      return;
    }

    box.innerHTML = users
      .map((u) => {
        const rolePill =
          u.role === "admin" ? pill("admin", "ok") : u.role === "agent" ? pill("agent", "warn") : pill("user");
        return `
          <div class="listItem">
            <div class="listItemTitle">
              ${escapeHtml(u.username)} ${rolePill}
              <span class="muted small" style="margin-left:auto;">${escapeHtml(String(u._id).slice(-8))}</span>
            </div>
            <div class="muted small">${escapeHtml(u.email || "")} • ${fmtDate(u.createdAt)}</div>

            <div class="row gap" style="margin-top:10px; flex-wrap:wrap;">
              <select class="input smallInput" data-role-select="${u._id}">
                <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
                <option value="agent" ${u.role === "agent" ? "selected" : ""}>agent</option>
                <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
              </select>
              <button class="btn ghost small" data-set-role="${u._id}">
                <i class="fa-solid fa-user-shield"></i> Sätt roll
              </button>

              <button class="btn danger small" data-del-user="${u._id}">
                <i class="fa-solid fa-trash"></i> Ta bort
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    qsa("[data-set-role]").forEach((b) => {
      b.addEventListener("click", async () => {
        const userId = b.getAttribute("data-set-role");
        const sel = qs(`[data-role-select="${userId}"]`);
        const role = sel?.value;
        try {
          await api(`/admin/users/${userId}/role`, { method: "POST", body: JSON.stringify({ role }) });
          setAlert($("adminUsersMsg"), "Roll uppdaterad ✅", "");
          await loadAdminUsers();
        } catch (e) {
          setAlert($("adminUsersMsg"), e.message, "error");
        }
      });
    });

    qsa("[data-del-user]").forEach((b) => {
      b.addEventListener("click", async () => {
        const userId = b.getAttribute("data-del-user");
        if (!confirm("Ta bort användare?")) return;
        try {
          await api(`/admin/users/${userId}`, { method: "DELETE" });
          setAlert($("adminUsersMsg"), "Användare borttagen ✅", "");
          await loadAdminUsers();
        } catch (e) {
          setAlert($("adminUsersMsg"), e.message, "error");
        }
      });
    });
  } catch (e) {
    setAlert($("adminUsersMsg"), e.message, "error");
    box.innerHTML = `<div class="muted small">Kunde inte ladda users.</div>`;
  }
}

/* =========================
   EXPORTS
========================= */
function exportAll() {
  fetch(API_BASE + "/admin/export/all", { headers: { Authorization: `Bearer ${state.token}` } })
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

  try {
    const companyId = $("kbCategorySelect")?.value || "demo";
    const items = await api(`/kb/list/${companyId}`);

    if (!items.length) {
      box.innerHTML = `<div class="muted small">Inga KB chunks ännu.</div>`;
      return;
    }

    box.innerHTML = items
      .map((c) => {
        return `
          <div class="listItem">
            <div class="listItemTitle">
              ${escapeHtml(c.title || c.sourceRef || "KB")}
              <span class="muted small" style="margin-left:auto;">#${c.chunkIndex}</span>
            </div>
            <div class="muted small">${escapeHtml(c.sourceType)} • ${escapeHtml(c.sourceRef || "")}</div>
            <div class="muted small" style="margin-top:8px;">${escapeHtml((c.content || "").slice(0, 180))}...</div>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    setAlert(msg, e.message, "error");
    box.innerHTML = `<div class="muted small">Kunde inte ladda KB.</div>`;
  }
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

  try {
    const cats = await api("/categories");

    box.innerHTML = cats
      .map((c) => {
        const locked = ["demo", "law", "tech", "cleaning"].includes(c.key);
        return `
          <div class="listItem">
            <div class="listItemTitle">
              ${escapeHtml(c.name)} <span class="muted small">(${escapeHtml(c.key)})</span>
              ${locked ? `<span class="pill ok" style="margin-left:auto;">default</span>` : ""}
            </div>
            <div class="muted small" style="margin-top:6px;">${escapeHtml((c.systemPrompt || "").slice(0, 120))}...</div>
            ${
              locked
                ? ""
                : `<button class="btn danger small" style="margin-top:10px;" data-del-cat="${escapeHtml(c.key)}">
                     <i class="fa-solid fa-trash"></i> Ta bort
                   </button>`
            }
          </div>
        `;
      })
      .join("");

    qsa("[data-del-cat]").forEach((b) => {
      b.addEventListener("click", async () => {
        const key = b.getAttribute("data-del-cat");
        if (!confirm(`Ta bort kategori ${key}?`)) return;
        try {
          await api(`/admin/categories/${encodeURIComponent(key)}`, { method: "DELETE" });
          setAlert(msg, "Kategori borttagen ✅", "");
          await loadCategories().catch(() => {});
          await loadCategoriesAdmin();
        } catch (e) {
          setAlert(msg, e.message, "error");
        }
      });
    });
  } catch (e) {
    setAlert(msg, e.message, "error");
    box.innerHTML = `<div class="muted small">Kunde inte ladda kategorier.</div>`;
  }
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

    await loadCategories().catch(() => {});
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

    const me = await api("/me");
    state.user = me;
    setLS(LS.user, JSON.stringify(me));
    await onLoggedIn();
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
   DEBUG PANEL
========================= */
function updateDebug(extra = {}) {
  if (!$("dbgApi")) return;

  $("dbgApi").textContent = location.origin;
  $("dbgLogged").textContent = state.token ? "JA" : "NEJ";
  $("dbgRole").textContent = state.user?.role || "-";
  $("dbgTicket").textContent = extra.ticketId || state.lastTicketId || "-";
  $("dbgRag").textContent = extra.ragUsed ? "JA" : "-";
}
