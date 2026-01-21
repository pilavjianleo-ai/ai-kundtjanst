/* =========================================================
   AI Kundtjänst - script.js (FULL) ✅ PRO FINAL
   - Matchar din index.html (alla ID:n)
   - ✅ Fixar null-crashes (tomma flikar)
   - ✅ Boot + events alltid stabila
   - ✅ SLA Chart.js stabil höjd + destroy/recreate
   - ✅ SLA Clear: /admin/sla/clear/my + /admin/sla/clear/all
   - ✅ Agent kan INTE se admin panel UI
   - ✅ Agent ser SLA men endast sin statistik (server enforce)
   - ✅ Inbox highlight + notif-dot via /admin/tickets/notify (polling)
   - ✅ KPI Widget (chat + sla)
   - ✅ AI chat UX: welcome + typing + smart new ticket
   ========================================================= */

/* =========================
   CONFIG
========================= */
const API_BASE = ""; // same origin
const NOTIFY_POLL_MS = 3500;

const LS = {
  token: "ai_token",
  user: "ai_user",
  theme: "ai_theme",
  debug: "ai_debug",
  chatConversation: "ai_chat_conversation",
  currentCompanyId: "ai_company_id",
  lastTicketId: "ai_last_ticket_id",
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
  chartTrendDaily: null,

  notifyTimer: null,
  lastUnreadCount: 0,

  // typing indicator
  isTyping: false,
};

let slaCache = {
  overview: null,
  kpi: null,
  trend: null,
  agents: null,
  tickets: null,
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

function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
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

  const res = await fetch(API_BASE + path, {
    ...opts,
    headers,
  });

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
   UI helpers
========================= */
function setAlert(el, msg, type = "") {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error");
  if (type === "error") el.classList.add("error");
  show(el, !!msg);
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
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  // theme init
  const savedTheme = localStorage.getItem(LS.theme);
  if (savedTheme) document.body.setAttribute("data-theme", savedTheme);

  // Debug panel
  show($("debugPanel"), state.debug);

  bindEvents();
  boot().catch((e) => console.error("BOOT ERROR:", e));
});

async function boot() {
  await loadCategories().catch(() => {});

  if ($("categorySelect")) $("categorySelect").value = state.companyId;
  if ($("kbCategorySelect")) $("kbCategorySelect").value = state.companyId;

  if (state.token) {
    try {
      const me = await api("/me");
      state.user = me;
      setLS(LS.user, JSON.stringify(me));
      await onLoggedIn();
    } catch (e) {
      console.warn("Token invalid:", e.message);
      doLogout(false);
    }
  } else {
    onLoggedOut();
  }

  updateDebug();
}

/* =========================
   EVENTS (SAFE)
========================= */
function onClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", fn);
}

function onChange(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("change", fn);
}

function onInput(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", fn);
}

function bindEvents() {
  // Sidebar
  onClick("openChatView", () => {
    setActiveMenu("openChatView");
    switchView("chatView");
    scrollMessagesToBottom();
  });

  onClick("openMyTicketsView", async () => {
    setActiveMenu("openMyTicketsView");
    switchView("myTicketsView");
    await loadMyTickets().catch((e) => setAlert($("myTicketsHint"), e.message, "error"));
  });

  onClick("openInboxView", async () => {
    setActiveMenu("openInboxView");
    switchView("inboxView");
    await loadInboxTickets().catch((e) => setAlert($("inboxMsg"), e.message, "error"));
  });

  onClick("openSlaView", async () => {
    setActiveMenu("openSlaView");
    switchView("slaView");
    await refreshSlaAll().catch(() => {});
  });

  onClick("openAdminView", async () => {
    setActiveMenu("openAdminView");
    switchView("adminView");
    await refreshAdminAll().catch(() => {});
  });

  onClick("openSettingsView", () => {
    setActiveMenu("openSettingsView");
    switchView("settingsView");
  });

  // Category select
  onChange("categorySelect", async (e) => {
    state.companyId = e.target.value || "demo";
    setLS(LS.currentCompanyId, state.companyId);
    updateDebug();
  });

  // Theme toggle
  onClick("themeToggle", () => {
    const cur = document.body.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(LS.theme, next);
  });

  // Debug
  onClick("toggleDebugBtn", () => {
    state.debug = !state.debug;
    localStorage.setItem(LS.debug, state.debug ? "1" : "0");
    show($("debugPanel"), state.debug);
    updateDebug();
  });

  // Auth
  onClick("loginBtn", doLogin);
  onClick("registerBtn", doRegister);
  onClick("logoutBtn", () => doLogout(true));

  onClick("togglePassBtn", () => togglePass("password", "togglePassBtn"));
  onClick("toggleResetPassBtn", () => togglePass("resetNewPass", "toggleResetPassBtn"));

  // Forgot/reset
  onClick("openForgotBtn", () => openForgot(true));
  onClick("closeForgotBtn", () => openForgot(false));
  onClick("sendForgotBtn", sendForgotEmail);
  onClick("resetSaveBtn", doResetPassword);

  // Chat
  onClick("sendBtn", sendChat);
  const msgInput = $("messageInput");
  if (msgInput) {
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
  }

  onClick("clearChatBtn", () => {
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    setHTML($("messages"), "");
    addSystemMessage("Chat rensad ✅");
  });

  onClick("exportChatBtn", exportChat);

  onClick("newTicketBtn", () => {
    // ✅ Smart new ticket
    state.lastTicketId = "";
    setLS(LS.lastTicketId, "");
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    setHTML($("messages"), "");

    addSystemMessage("Nytt ärende startat ✅");
    addSystemMessage("Hej! 👋 Beskriv ditt problem så hjälper jag dig direkt.");
    scrollMessagesToBottom();
  });

  // Feedback
  onClick("fbUp", () => sendFeedback("up"));
  onClick("fbDown", () => sendFeedback("down"));

  // My tickets
  onClick("myTicketsRefreshBtn", loadMyTickets);
  onClick("myTicketReplyBtn", myTicketReply);

  // Inbox
  onClick("inboxRefreshBtn", loadInboxTickets);

  // Admin-only actions (buttons exist maybe)
  onClick("solveAllBtn", solveAllTickets);
  onClick("removeSolvedBtn", removeSolvedTickets);

  onChange("inboxStatusFilter", loadInboxTickets);
  onChange("inboxCategoryFilter", loadInboxTickets);
  onInput("inboxSearchInput", debounce(loadInboxTickets, 250));

  onClick("setStatusOpen", () => setInboxTicketStatus("open"));
  onClick("setStatusPending", () => setInboxTicketStatus("pending"));
  onClick("setStatusSolved", () => setInboxTicketStatus("solved"));
  onClick("setPriorityBtn", setInboxPriority);

  onClick("sendAgentReplyInboxBtn", sendInboxAgentReply);
  onClick("saveInternalNoteBtn", saveInternalNote);
  onClick("clearInternalNotesBtn", clearInternalNotes);
  onClick("assignTicketBtn", assignTicketToAgent);
  onClick("deleteTicketBtn", deleteSelectedInboxTicket);

  // SLA
  onClick("slaRefreshBtn", refreshSlaAll);
  onClick("slaExportCsvBtn", exportSlaCsv);

  onChange("slaDaysSelect", refreshSlaAll);
  onChange("slaCompareMode", refreshSlaAll);

  onChange("slaBreachedFilter", renderSlaTicketsFromCache);
  onChange("slaBreachTypeFilter", renderSlaTicketsFromCache);
  onChange("slaSortTickets", renderSlaTicketsFromCache);

  onClick("slaClearMyStatsBtn", clearMySlaStats);
  onClick("slaClearAllStatsBtn", clearAllSlaStats);

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
  onClick("adminUsersRefreshBtn", loadAdminUsers);
  onClick("adminExportAllBtn", exportAll);
  onClick("trainingExportBtn", exportTraining);

  // KB
  onClick("kbRefreshBtn", loadKbList);
  onClick("kbExportBtn", exportKb);
  onClick("kbUploadTextBtn", kbUploadText);
  onClick("kbUploadUrlBtn", kbUploadUrl);
  onClick("kbUploadPdfBtn", kbUploadPdf);
  onChange("kbCategorySelect", loadKbList);

  // Categories manager
  onClick("catsRefreshBtn", loadCategoriesAdmin);
  onClick("createCatBtn", createCategory);

  // ✅ NEW: edit category button (if exists in html)
  onClick("editCatBtn", openEditCategoryModal);
  onClick("saveCatEditBtn", saveCategoryEdit);

  // Settings
  onClick("changeUsernameBtn", changeUsername);
  onClick("changePasswordBtn", changePassword);

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
    show($("authMessage"), true);
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

  stopInboxNotifyPolling();

  onLoggedOut();
  if (showMsg) addSystemMessage("Du är utloggad ✅");
}

function onLoggedOut() {
  setText($("roleBadge"), "Inte inloggad");
  show($("logoutBtn"), false);
  show($("openSettingsView"), false);

  // ✅ hide adminOnly
  qsa(".adminOnly").forEach((x) => (x.style.display = "none"));

  // ✅ hide agentOnly too (if you use it in html)
  qsa(".agentOnly").forEach((x) => (x.style.display = "none"));

  switchView("authView");
  setActiveMenu("openChatView");

  setHTML($("messages"), "");
  state.conversation = [];
  setLS(LS.chatConversation, JSON.stringify(state.conversation));

  destroyTrendChart();
  updateDebug();
}

async function onLoggedIn() {
  show($("logoutBtn"), true);
  show($("openSettingsView"), true);

  const role = state.user?.role || "user";
  const rb = $("roleBadge");
  if (rb) {
    rb.textContent = role === "user" ? `Inloggad: ${state.user.username}` : `${state.user.username} (${role})`;
  }

  // ✅ UI role logic:
  // - agent can see inbox + SLA
  // - agent CANNOT see admin panel
  // - admin sees admin panel
  if (role === "admin") {
    qsa(".adminOnly").forEach((x) => (x.style.display = ""));
    show($("openAdminView"), true);
  } else {
    qsa(".adminOnly").forEach((x) => (x.style.display = "none"));
    show($("openAdminView"), false);
  }

  if (role === "agent" || role === "admin") {
    qsa(".agentOnly").forEach((x) => (x.style.display = ""));
    show($("openInboxView"), true);
    show($("openSlaView"), true);
  } else {
    qsa(".agentOnly").forEach((x) => (x.style.display = "none"));
    show($("openInboxView"), false);
    show($("openSlaView"), false);
  }

  show($("slaClearAllStatsBtn"), role === "admin");

  switchView("chatView");
  setActiveMenu("openChatView");

  renderConversation();
  ensureWelcomeIfEmptyChat();
  scrollMessagesToBottom();

  await loadInboxCategoryFilter().catch(() => {});
  updateDebug();

  startInboxNotifyPolling();
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
   ✅ Inbox notify polling
   - Highlights inbox when unread appears
========================= */
function startInboxNotifyPolling() {
  stopInboxNotifyPolling();

  const role = state.user?.role || "user";
  if (role !== "agent" && role !== "admin") return;

  state.notifyTimer = setInterval(async () => {
    try {
      const r = await api("/admin/tickets/notify");
      const count = Number(r?.unreadCount || 0);
      state.lastUnreadCount = count;

      // notif dot
      const dot = $("inboxNotifDot");
      if (dot) show(dot, count > 0);

      // highlight sidebar
      const inboxBtn = $("openInboxView");
      if (inboxBtn) {
        inboxBtn.classList.toggle("pulse", count > 0);
        inboxBtn.classList.toggle("hasNotif", count > 0);
      }

      // optional alert
      const banner = $("inboxNewBanner");
      if (banner) {
        if (count > 0) {
          banner.textContent = `Nytt inkommande ärende (${count})`;
          show(banner, true);
        } else {
          show(banner, false);
        }
      }

      // auto refresh list if inbox view open
      if ($("inboxView")?.style.display !== "none" && count > 0) {
        await loadInboxTickets().catch(() => {});
      }
    } catch {
      // ignore
    }
  }, NOTIFY_POLL_MS);
}

function stopInboxNotifyPolling() {
  if (state.notifyTimer) {
    clearInterval(state.notifyTimer);
    state.notifyTimer = null;
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
    const cur = state.companyId || "demo";
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

    selectEl.value = selectEl.value || cur;
  }

  fill(sel, false);
  fill(selKb, false);
  fill(selInbox, true);

  updateDebug();
}

async function loadInboxCategoryFilter() {
  await loadCategories();
}

/* =========================
   ✅ CHAT (better UX)
========================= */
function ensureWelcomeIfEmptyChat() {
  if (!state.conversation || state.conversation.length === 0) {
    addSystemMessage("Hej! 👋 Välkommen till AI kundtjänst.");
    addSystemMessage("Skriv vad du behöver hjälp med så löser vi det direkt ✅");
    state.conversation.push({ role: "assistant", content: "Hej! 👋 Välkommen till AI kundtjänst." });
    state.conversation.push({ role: "assistant", content: "Skriv vad du behöver hjälp med så löser vi det direkt ✅" });
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
  }
}

function addSystemMessage(text) {
  addMessageToUI("assistant", text);
}

function addMessageToUI(role, content, meta = {}) {
  const list = $("messages");
  if (!list) return;

  const wrap = document.createElement("div");
  wrap.className = "msg " + (role === "user" ? "user" : "assistant");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = role === "user" ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-robot"></i>`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // ✅ typing style
  if (meta.typing) {
    bubble.classList.add("typing");
    bubble.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
  } else {
    bubble.textContent = content || "";
  }

  const bubbleWrap = document.createElement("div");
  bubbleWrap.appendChild(bubble);

  if (role !== "user" && !meta.typing) {
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

  list.appendChild(wrap);
  return wrap;
}

function renderConversation() {
  const list = $("messages");
  if (!list) return;
  list.innerHTML = "";

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

function showTyping(on) {
  const list = $("messages");
  if (!list) return;

  // remove existing
  const existing = qs(".msg.assistant .bubble.typing");
  if (existing) existing.closest(".msg")?.remove();

  if (!on) return;

  addMessageToUI("assistant", "", { typing: true });
  scrollMessagesToBottom();
}

async function sendChat() {
  const inp = $("messageInput");
  if (!inp) return;

  const text = inp.value.trim();
  if (!text) return;

  inp.value = "";

  // ✅ add user message
  state.conversation.push({ role: "user", content: text });
  setLS(LS.chatConversation, JSON.stringify(state.conversation));
  addMessageToUI("user", text);
  scrollMessagesToBottom();

  try {
    showTyping(true);

    const payload = { companyId: state.companyId, conversation: state.conversation };
    if (state.lastTicketId) payload.ticketId = state.lastTicketId;

    const data = await api("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const reply = data.reply || "Inget svar.";
    state.lastTicketId = data.ticketId || state.lastTicketId || "";
    setLS(LS.lastTicketId, state.lastTicketId);

    showTyping(false);

    state.conversation.push({ role: "assistant", content: reply });
    setLS(LS.chatConversation, JSON.stringify(state.conversation));

    addMessageToUI("assistant", reply);
    updateDebug({ ragUsed: !!data.ragUsed, ticketId: state.lastTicketId });
    scrollMessagesToBottom();

    // ✅ update quick widget (if exists)
    refreshQuickWidgets().catch(() => {});
  } catch (e) {
    showTyping(false);
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
    await api("/feedback", { method: "POST", body: JSON.stringify({ type, companyId: state.companyId }) });
    setText($("fbMsg"), "Tack! ✅");
    setTimeout(() => setText($("fbMsg"), ""), 1200);
  } catch (e) {
    setText($("fbMsg"), `Fel: ${e.message}`);
    setTimeout(() => setText($("fbMsg"), ""), 1500);
  }
}

/* =========================
   ✅ Quick widgets (optional)
========================= */
async function refreshQuickWidgets() {
  // If you add these containers in index.html later, they will work automatically.
  const chatBox = $("chatKpiWidget");
  const slaBox = $("slaKpiWidget");

  if (!chatBox && !slaBox) return;

  const role = state.user?.role || "user";
  if (role !== "agent" && role !== "admin") return;

  try {
    const days = Number($("slaDaysSelect")?.value || 30);
    const kpi = await api(`/admin/sla/kpi?days=${days}`);

    const html = `
      <div class="kpiWidget">
        <div class="kpiRow">
          <div class="kpiItem"><div class="kpiLabel">Open</div><div class="kpiVal">${escapeHtml(String(kpi?.totals?.open ?? 0))}</div></div>
          <div class="kpiItem"><div class="kpiLabel">Pending</div><div class="kpiVal">${escapeHtml(String(kpi?.totals?.pending ?? 0))}</div></div>
          <div class="kpiItem"><div class="kpiLabel">Solved</div><div class="kpiVal">${escapeHtml(String(kpi?.totals?.solved ?? 0))}</div></div>
        </div>
        <div class="kpiRow small">
          <div class="kpiItem">${pill(`Breached: ${kpi?.slaHealth?.breachedAny ?? 0}`, (kpi?.slaHealth?.breachedAny ?? 0) > 0 ? "danger" : "ok")}</div>
          <div class="kpiItem">${pill(`Risk: ${kpi?.slaHealth?.riskAny ?? 0}`, (kpi?.slaHealth?.riskAny ?? 0) > 0 ? "warn" : "ok")}</div>
          <div class="kpiItem">${pill(`Solve rate: ${pct(kpi?.totals?.solveRatePct)}`, "ok")}</div>
        </div>
      </div>
    `;

    if (chatBox) setHTML(chatBox, html);
    if (slaBox) setHTML(slaBox, html);
  } catch {
    // ignore
  }
}
/* =========================
   MY TICKETS
========================= */
async function loadMyTickets() {
  setAlert($("myTicketsHint"), "");
  const list = $("myTicketsList");
  const details = $("myTicketDetails");

  setHTML(list, "");
  setHTML(details, `<span class="muted small">Laddar...</span>`);

  try {
    const tickets = await api("/my/tickets");
    if (!tickets.length) {
      setHTML(list, `<div class="muted small">Inga ärenden ännu.</div>`);
      setHTML(details, `<span class="muted small">Skapa en ny konversation i Chat.</span>`);
      return;
    }

    setHTML(
      list,
      tickets
        .map((t) => {
          const status = t.status || "open";
          const prio = t.priority || "normal";
          const title = t.title || "(utan titel)";
          const unread = t.unreadForAgent ? `<span class="pill warn">ny</span>` : "";
          return `
            <div class="listItem" data-id="${t._id}">
              <div class="listItemTitle">
                ${escapeHtml(title)}
                ${pill(status, status === "solved" ? "ok" : status === "pending" ? "warn" : "")}
                ${pill(prio, prio === "high" ? "danger" : prio === "low" ? "" : "")}
                ${unread}
              </div>
              <div class="muted small">${escapeHtml(String(t._id).slice(-8))} • ${fmtDate(t.lastActivityAt || t.createdAt)}</div>
            </div>
          `;
        })
        .join("")
    );

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
    const firstEl = qs(`#myTicketsList .listItem[data-id="${firstId}"]`);
    if (firstEl) firstEl.classList.add("selected");
    await loadMyTicketDetails(firstId);
  } catch (e) {
    setAlert($("myTicketsHint"), e.message, "error");
    setHTML(details, `<span class="muted small">Kunde inte ladda.</span>`);
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

    if ($("myTicketReplyText")) $("myTicketReplyText").value = "";
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

    // ✅ inbox highlight dot based on notify endpoint if available
    const dot = $("inboxNotifDot");
    if (dot) show(dot, state.lastUnreadCount > 0);

    list.innerHTML = tickets
      .map((t) => {
        const statusPill = t.status === "solved" ? pill("solved", "ok") : t.status === "pending" ? pill("pending", "warn") : pill("open");
        const prioPill = t.priority === "high" ? pill("high", "danger") : t.priority === "low" ? pill("low") : pill("normal");
        const assigned = t.assignedToUserId ? `<span class="muted small">assigned</span>` : `<span class="muted small">unassigned</span>`;
        const unread = t.unreadForAgent ? `<span class="pill warn">NY</span>` : "";

        return `
          <div class="listItem ${t.unreadForAgent ? "unread" : ""}" data-id="${t._id}">
            <div class="listItemTitle">
              ${escapeHtml(t.title || "(utan titel)")}
              ${unread}
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
  setHTML($("internalNotesList"), "");

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

    if ($("agentReplyTextInbox")) $("agentReplyTextInbox").value = "";
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

    if ($("internalNoteText")) $("internalNoteText").value = "";
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
    setHTML($("ticketDetails"), `<div class="muted small">Välj en ticket.</div>`);
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
async function refreshSlaAll() {
  destroyTrendChart();

  const days = Number($("slaDaysSelect")?.value || 30);
  const compareMode = $("slaCompareMode")?.value || "none";

  setHTML($("slaOverviewBox"), `<div class="muted small">Laddar KPI...</div>`);
  setHTML($("slaAgentsBox"), `<div class="muted small">Laddar agents...</div>`);
  setHTML($("slaTicketsBox"), `<div class="muted small">Laddar tickets...</div>`);
  setText($("slaTrendHint"), "");

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

    if ($("slaView") && $("slaView").style.display !== "none") {
      renderSlaTrendChart(trend);
    }

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
      setText($("slaTrendHint"), "Tips: välj jämförelseläge för att se förändring mot tidigare period.");
    }

    refreshQuickWidgets().catch(() => {});
  } catch (e) {
    setHTML($("slaOverviewBox"), `<div class="alert error">❌ SLA fel: ${escapeHtml(e.message)}</div>`);
  }
}

/* =========================
   ✅ Chart.js trend
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
    setText(
      $("slaTrendHint"),
      "❌ Chart.js saknas. Lägg in <script src='https://cdn.jsdelivr.net/npm/chart.js'></script> före script.js i index.html"
    );
    return;
  }

  destroyTrendChart();
  ensureCanvasStableSize(canvas);

  const rows = tr?.rows || [];
  if (!rows.length) {
    setText($("slaTrendHint"), "Ingen trend-data ännu.");
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

  setText($("slaTrendHint"), "Trend visar compliance vecka för vecka.");
}

/* =========================
   SLA Tickets (filter/sort)
========================= */
function renderSlaTicketsFromCache() {
  const data = slaCache.tickets;
  if (!data) return;

  const box = $("slaTicketsBox");
  if (!box) return;

  let rows = data.rows || [];

  const breachedFilter = $("slaBreachedFilter")?.value || "all";
  const breachType = $("slaBreachTypeFilter")?.value || "any";
  const sortMode = $("slaSortTickets")?.value || "newest";

  rows = rows.map((r) => ({
    ...r,
    _createdAtMs: new Date(r.createdAt).getTime() || 0,
    _worst:
      Math.max(
        r.sla?.firstResponseMs ? (r.sla.firstResponseMs - (r.sla.firstResponseLimitMs || 0)) : 0,
        r.sla?.effectiveRunningMs ? (r.sla.effectiveRunningMs - (r.sla.resolutionLimitMs || 0)) : 0
      ) || 0,
  }));

  if (breachedFilter === "breachedOnly") {
    rows = rows.filter((r) => r.sla?.breachedFirstResponse || r.sla?.breachedResolution);
  } else if (breachedFilter === "okOnly") {
    rows = rows.filter((r) => !r.sla?.breachedFirstResponse && !r.sla?.breachedResolution);
  }

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

/* =========================
   SLA Export CSV
========================= */
function exportSlaCsv() {
  const days = Number($("slaDaysSelect")?.value || 30);
  const url = `/admin/sla/export/csv?days=${days}`;

  fetch(API_BASE + url, {
    headers: { Authorization: `Bearer ${state.token}` },
  })
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
   ✅ SLA CLEAR (WORKING)
========================= */
async function clearMySlaStats() {
  const role = state.user?.role || "user";
  if (role !== "admin" && role !== "agent") return;

  if (!confirm("Radera din SLA-statistik?")) return;

  try {
    const data = await api("/admin/sla/clear/my", { method: "DELETE" });
    alert(data.message || "Raderat ✅");
    await refreshSlaAll();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

async function clearAllSlaStats() {
  const role = state.user?.role || "user";
  if (role !== "admin") {
    alert("❌ Endast admin kan radera ALL statistik.");
    return;
  }

  if (!confirm("Radera ALL SLA-statistik? Detta går inte att ångra.")) return;

  try {
    const data = await api("/admin/sla/clear/all", { method: "DELETE" });
    alert(data.message || "Raderat ✅");
    await refreshSlaAll();
  } catch (e) {
    alert("❌ " + e.message);
  }
}

/* =========================
   ADMIN DASHBOARD
========================= */
async function refreshAdminAll() {
  // admin only
  if (state.user?.role !== "admin") return;

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
          await api(`/admin/users/${userId}/role`, {
            method: "POST",
            body: JSON.stringify({ role }),
          });
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
    if ($("kbTextContent")) $("kbTextContent").value = "";
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
    if ($("kbUrlInput")) $("kbUrlInput").value = "";
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
    if ($("kbPdfFile")) $("kbPdfFile").value = "";
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
   Categories Admin (+ Edit)
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
        const isCurrent = c.key === state.companyId;

        return `
          <div class="listItem">
            <div class="listItemTitle">
              ${escapeHtml(c.name)} <span class="muted small">(${escapeHtml(c.key)})</span>
              ${isCurrent ? `<span class="pill warn" style="margin-left:auto;">aktiv</span>` : ""}
            </div>

            <div class="muted small" style="margin-top:6px;">
              ${escapeHtml((c.systemPrompt || "").slice(0, 120))}...
            </div>

            <div class="row gap" style="margin-top:10px; flex-wrap:wrap;">
              <button class="btn ghost small" data-edit-cat="${escapeHtml(c.key)}">
                <i class="fa-solid fa-pen"></i> Redigera
              </button>

              <button 
                class="btn danger small" 
                data-del-cat="${escapeHtml(c.key)}"
                ${isCurrent ? "disabled" : ""}
              >
                <i class="fa-solid fa-trash"></i> Ta bort
              </button>
            </div>

            ${
              isCurrent
                ? `<div class="muted small" style="margin-top:6px;">Du kan inte ta bort den kategori som är aktiv.</div>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    // delete
    qsa("[data-del-cat]").forEach((b) => {
      b.addEventListener("click", async () => {
        const key = b.getAttribute("data-del-cat");
        if (!key) return;
        if (!confirm(`Ta bort kategori "${key}"?`)) return;

        try {
          await api(`/admin/categories/${encodeURIComponent(key)}`, { method: "DELETE" });
          setAlert(msg, "Kategori borttagen ✅", "");
          await loadCategories();
          await loadCategoriesAdmin();

          if (state.companyId === key) {
            state.companyId = "demo";
            setLS(LS.currentCompanyId, state.companyId);
            if ($("categorySelect")) $("categorySelect").value = state.companyId;
            if ($("kbCategorySelect")) $("kbCategorySelect").value = state.companyId;
          }
        } catch (e) {
          setAlert(msg, e.message, "error");
        }
      });
    });

    // edit
    qsa("[data-edit-cat]").forEach((b) => {
      b.addEventListener("click", async () => {
        const key = b.getAttribute("data-edit-cat");
        if (!key) return;
        openEditCategoryModal(key);
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
    if ($("newCatKey")) $("newCatKey").value = "";
    if ($("newCatName")) $("newCatName").value = "";
    if ($("newCatPrompt")) $("newCatPrompt").value = "";

    await loadCategories();
    await loadCategoriesAdmin();
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

/* =========================
   ✅ Category Edit (works even without modal)
   - If you have these inputs in index.html:
   - catEditKey, catEditName, catEditPrompt, catEditMsg, catEditWrap
========================= */
function openEditCategoryModal(keyFromBtn = "") {
  // basic behavior: fill inputs if they exist and show wrap
  const wrap = $("catEditWrap");
  const keyEl = $("catEditKey");
  const nameEl = $("catEditName");
  const promptEl = $("catEditPrompt");

  // if you dont have modal in HTML, just quick alert
  if (!keyEl || !nameEl || !promptEl) {
    alert("För att redigera kategori behöver index.html ha fält: catEditKey, catEditName, catEditPrompt + knapp saveCatEditBtn.");
    return;
  }

  setText($("catEditMsg"), "");
  show(wrap, true);

  // load current from categories list
  api("/categories")
    .then((cats) => cats.find((c) => c.key === keyFromBtn) || null)
    .then((c) => {
      if (!c) return;
      keyEl.value = c.key;
      nameEl.value = c.name || "";
      promptEl.value = c.systemPrompt || "";
    })
    .catch(() => {});
}

async function saveCategoryEdit() {
  const key = $("catEditKey")?.value?.trim();
  const name = $("catEditName")?.value?.trim();
  const systemPrompt = $("catEditPrompt")?.value ?? "";

  if (!key) return setText($("catEditMsg"), "Key saknas");
  if (!name) return setText($("catEditMsg"), "Namn saknas");

  try {
    const data = await api(`/admin/categories/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ name, systemPrompt }),
    });

    setText($("catEditMsg"), data.message || "Uppdaterat ✅");
    await loadCategories();
    await loadCategoriesAdmin();
  } catch (e) {
    setText($("catEditMsg"), "❌ " + e.message);
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
    if ($("newUsernameInput")) $("newUsernameInput").value = "";

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
    if ($("currentPassInput")) $("currentPassInput").value = "";
    if ($("newPassInput")) $("newPassInput").value = "";
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
