/* =========================================================
   AI Kundtjänst - script.js (UPGRADED)
   - Full app controller
   - Auth + Views + Tickets + Inbox + Admin + KB + Categories
   - SLA Dashboard: Overview + KPI + Agents + Tickets + Trend (daily/weekly) + Breached
========================================================= */

/* =========================
   CONFIG
========================= */
const API_BASE = ""; // same origin

/* =========================
   HELPERS
========================= */
const $ = (id) => document.getElementById(id);

function show(el) {
  if (!el) return;
  el.style.display = "";
}

function hide(el) {
  if (!el) return;
  el.style.display = "none";
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
}

function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html ?? "";
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "-";
    return dt.toLocaleString("sv-SE");
  } catch {
    return "-";
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

function pillClassFromState(state) {
  if (state === "ok") return "pill ok";
  if (state === "breached") return "pill danger";
  if (state === "at_risk") return "pill warn";
  return "pill";
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================
   STATE
========================= */
const state = {
  token: localStorage.getItem("token") || "",
  user: null,

  companyId: localStorage.getItem("companyId") || "demo",

  conversation: [], // for chat view
  currentTicketId: null,

  myTickets: [],
  selectedMyTicket: null,

  inboxTickets: [],
  selectedInboxTicket: null,

  categories: [],

  debugOn: false,

  // SLA
  slaDays: Number(localStorage.getItem("slaDays") || 30),
  slaCompareMode: localStorage.getItem("slaCompareMode") || "none",
  slaTrendMode: localStorage.getItem("slaTrendMode") || "weekly", // weekly | daily
};

/* =========================
   API
========================= */
async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* =========================
   DOM refs
========================= */
// Views
const authView = $("authView");
const chatView = $("chatView");
const myTicketsView = $("myTicketsView");
const inboxView = $("inboxView");
const adminView = $("adminView");
const settingsView = $("settingsView");
const slaView = $("slaView");

// Sidebar
const roleBadge = $("roleBadge");
const categorySelect = $("categorySelect");
const openChatViewBtn = $("openChatView");
const openMyTicketsViewBtn = $("openMyTicketsView");
const openInboxViewBtn = $("openInboxView");
const openAdminViewBtn = $("openAdminView");
const openSettingsViewBtn = $("openSettingsView");
const openSlaViewBtn = $("openSlaView");
const inboxNotifDot = $("inboxNotifDot");

// Auth
const usernameInput = $("username");
const emailInput = $("email");
const passwordInput = $("password");
const togglePassBtn = $("togglePassBtn");
const loginBtn = $("loginBtn");
const registerBtn = $("registerBtn");
const authMessage = $("authMessage");

const openForgotBtn = $("openForgotBtn");
const forgotCard = $("forgotCard");
const forgotEmail = $("forgotEmail");
const sendForgotBtn = $("sendForgotBtn");
const closeForgotBtn = $("closeForgotBtn");
const forgotMsg = $("forgotMsg");

const resetCard = $("resetCard");
const resetNewPass = $("resetNewPass");
const toggleResetPassBtn = $("toggleResetPassBtn");
const resetSaveBtn = $("resetSaveBtn");
const resetMsg = $("resetMsg");

// Chat
const chatTitle = $("chatTitle");
const chatSubtitle = $("chatSubtitle");
const messagesBox = $("messages");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const clearChatBtn = $("clearChatBtn");
const exportChatBtn = $("exportChatBtn");
const newTicketBtn = $("newTicketBtn");
const fbUpBtn = $("fbUp");
const fbDownBtn = $("fbDown");
const fbMsg = $("fbMsg");

// My tickets
const myTicketsList = $("myTicketsList");
const myTicketDetails = $("myTicketDetails");
const myTicketsRefreshBtn = $("myTicketsRefreshBtn");
const myTicketsHint = $("myTicketsHint");
const myTicketReplyText = $("myTicketReplyText");
const myTicketReplyBtn = $("myTicketReplyBtn");
const myTicketReplyMsg = $("myTicketReplyMsg");

// Inbox
const inboxRefreshBtn = $("inboxRefreshBtn");
const solveAllBtn = $("solveAllBtn");
const removeSolvedBtn = $("removeSolvedBtn");
const inboxStatusFilter = $("inboxStatusFilter");
const inboxCategoryFilter = $("inboxCategoryFilter");
const inboxSearchInput = $("inboxSearchInput");
const inboxMsg = $("inboxMsg");
const inboxTicketsList = $("inboxTicketsList");

const ticketDetails = $("ticketDetails");
const inboxTicketMsg = $("inboxTicketMsg");

const setStatusOpenBtn = $("setStatusOpen");
const setStatusPendingBtn = $("setStatusPending");
const setStatusSolvedBtn = $("setStatusSolved");

const ticketPrioritySelect = $("ticketPrioritySelect");
const setPriorityBtn = $("setPriorityBtn");

const agentReplyTextInbox = $("agentReplyTextInbox");
const sendAgentReplyInboxBtn = $("sendAgentReplyInboxBtn");

const internalNoteText = $("internalNoteText");
const saveInternalNoteBtn = $("saveInternalNoteBtn");
const internalNotesList = $("internalNotesList");
const clearInternalNotesBtn = $("clearInternalNotesBtn");

const assignUserSelect = $("assignUserSelect");
const assignTicketBtn = $("assignTicketBtn");
const deleteTicketBtn = $("deleteTicketBtn");

// Admin
const adminExportAllBtn = $("adminExportAllBtn");
const trainingExportBtn = $("trainingExportBtn");
const adminUsersRefreshBtn = $("adminUsersRefreshBtn");
const adminUsersMsg = $("adminUsersMsg");
const adminUsersList = $("adminUsersList");

const kbCategorySelect = $("kbCategorySelect");
const kbRefreshBtn = $("kbRefreshBtn");
const kbExportBtn = $("kbExportBtn");
const kbMsg = $("kbMsg");
const kbList = $("kbList");

const kbTextTitle = $("kbTextTitle");
const kbTextContent = $("kbTextContent");
const kbUploadTextBtn = $("kbUploadTextBtn");

const kbUrlInput = $("kbUrlInput");
const kbUploadUrlBtn = $("kbUploadUrlBtn");

const kbPdfFile = $("kbPdfFile");
const kbUploadPdfBtn = $("kbUploadPdfBtn");

const catsRefreshBtn = $("catsRefreshBtn");
const catsMsg = $("catsMsg");
const newCatKey = $("newCatKey");
const newCatName = $("newCatName");
const newCatPrompt = $("newCatPrompt");
const createCatBtn = $("createCatBtn");
const catsList = $("catsList");

// Tabs
const tabBtns = Array.from(document.querySelectorAll(".tabBtn"));
const tabPanels = {
  tabUsers: $("tabUsers"),
  tabKB: $("tabKB"),
  tabCats: $("tabCats"),
};

// Settings
const newUsernameInput = $("newUsernameInput");
const changeUsernameBtn = $("changeUsernameBtn");
const currentPassInput = $("currentPassInput");
const newPassInput = $("newPassInput");
const changePasswordBtn = $("changePasswordBtn");
const settingsMsg = $("settingsMsg");

// Sidebar footer
const themeToggle = $("themeToggle");
const logoutBtn = $("logoutBtn");
const toggleDebugBtn = $("toggleDebugBtn");

// Debug panel
const debugPanel = $("debugPanel");
const dbgApi = $("dbgApi");
const dbgLogged = $("dbgLogged");
const dbgRole = $("dbgRole");
const dbgTicket = $("dbgTicket");
const dbgRag = $("dbgRag");

// SLA
const slaDaysSelect = $("slaDaysSelect");
const slaCompareModeSelect = $("slaCompareMode");
const slaRefreshBtn = $("slaRefreshBtn");
const slaExportCsvBtn = $("slaExportCsvBtn");
const slaClearMyStatsBtn = $("slaClearMyStatsBtn");
const slaClearAllStatsBtn = $("slaClearAllStatsBtn");

const slaOverviewBox = $("slaOverviewBox");
const slaTrendChart = $("slaTrendChart");
const slaTrendHint = $("slaTrendHint");
const slaAgentsBox = $("slaAgentsBox");
const slaTicketsBox = $("slaTicketsBox");

const slaBreachedFilter = $("slaBreachedFilter");
const slaBreachTypeFilter = $("slaBreachTypeFilter");
const slaSortTickets = $("slaSortTickets");

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  bindEvents();
  applyThemeFromStorage();
  syncSlaControls();
  await loadCategories();

  // Handle resetToken in URL
  handleResetTokenFlow();

  if (state.token) {
    await tryLoadMe();
  }

  // Default view
  if (state.user) {
    showAppForLoggedIn();
    openView("chat");
  } else {
    openView("auth");
  }

  refreshDebug();
  startInboxNotifPolling();
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  // Sidebar view buttons
  openChatViewBtn?.addEventListener("click", () => openView("chat"));
  openMyTicketsViewBtn?.addEventListener("click", () => openView("myTickets"));
  openInboxViewBtn?.addEventListener("click", () => openView("inbox"));
  openAdminViewBtn?.addEventListener("click", () => openView("admin"));
  openSettingsViewBtn?.addEventListener("click", () => openView("settings"));
  openSlaViewBtn?.addEventListener("click", () => openView("sla"));

  categorySelect?.addEventListener("change", async () => {
    state.companyId = categorySelect.value;
    localStorage.setItem("companyId", state.companyId);
    setText(chatTitle, "AI Kundtjänst");
    setText(chatSubtitle, `Kategori: ${state.companyId}`);
    await reloadAllViews();
  });

  // Auth
  togglePassBtn?.addEventListener("click", () => togglePassword(passwordInput, togglePassBtn));
  toggleResetPassBtn?.addEventListener("click", () => togglePassword(resetNewPass, toggleResetPassBtn));
  loginBtn?.addEventListener("click", onLogin);
  registerBtn?.addEventListener("click", onRegister);

  openForgotBtn?.addEventListener("click", () => {
    hide(authMessage);
    show(forgotCard);
    hide(resetCard);
  });
  closeForgotBtn?.addEventListener("click", () => {
    hide(forgotMsg);
    hide(forgotCard);
  });
  sendForgotBtn?.addEventListener("click", onForgotPassword);
  resetSaveBtn?.addEventListener("click", onResetPassword);

  // Chat
  sendBtn?.addEventListener("click", onSendChat);
  messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSendChat();
  });
  clearChatBtn?.addEventListener("click", clearChat);
  exportChatBtn?.addEventListener("click", exportChat);
  newTicketBtn?.addEventListener("click", startNewTicket);
  fbUpBtn?.addEventListener("click", () => sendFeedback("up"));
  fbDownBtn?.addEventListener("click", () => sendFeedback("down"));

  // My tickets
  myTicketsRefreshBtn?.addEventListener("click", loadMyTickets);
  myTicketReplyBtn?.addEventListener("click", onMyTicketReply);

  // Inbox
  inboxRefreshBtn?.addEventListener("click", loadInboxTickets);
  solveAllBtn?.addEventListener("click", solveAllTickets);
  removeSolvedBtn?.addEventListener("click", removeSolvedTickets);

  inboxStatusFilter?.addEventListener("change", renderInboxTicketsFiltered);
  inboxCategoryFilter?.addEventListener("change", renderInboxTicketsFiltered);
  inboxSearchInput?.addEventListener("input", debounce(renderInboxTicketsFiltered, 200));

  setStatusOpenBtn?.addEventListener("click", () => setTicketStatus("open"));
  setStatusPendingBtn?.addEventListener("click", () => setTicketStatus("pending"));
  setStatusSolvedBtn?.addEventListener("click", () => setTicketStatus("solved"));

  setPriorityBtn?.addEventListener("click", onSetPriority);

  sendAgentReplyInboxBtn?.addEventListener("click", onAgentReplyInbox);

  saveInternalNoteBtn?.addEventListener("click", onSaveInternalNote);
  clearInternalNotesBtn?.addEventListener("click", onClearInternalNotes);

  assignTicketBtn?.addEventListener("click", onAssignTicket);
  deleteTicketBtn?.addEventListener("click", onDeleteTicket);

  // Admin tabs
  tabBtns.forEach((b) => {
    b.addEventListener("click", () => {
      tabBtns.forEach((x) => x.classList.remove("active"));
      b.classList.add("active");

      Object.values(tabPanels).forEach((p) => hide(p));
      show(tabPanels[b.dataset.tab]);
    });
  });

  // Admin actions
  adminExportAllBtn?.addEventListener("click", () => window.open("/admin/export/all", "_blank"));
  trainingExportBtn?.addEventListener("click", () => {
    const cid = state.companyId || "demo";
    window.open(`/admin/export/training?companyId=${encodeURIComponent(cid)}`, "_blank");
  });

  adminUsersRefreshBtn?.addEventListener("click", loadAdminUsers);

  kbRefreshBtn?.addEventListener("click", loadKbList);
  kbExportBtn?.addEventListener("click", () => {
    const cid = kbCategorySelect?.value || state.companyId;
    window.open(`/export/kb/${encodeURIComponent(cid)}`, "_blank");
  });
  kbUploadTextBtn?.addEventListener("click", kbUploadText);
  kbUploadUrlBtn?.addEventListener("click", kbUploadUrl);
  kbUploadPdfBtn?.addEventListener("click", kbUploadPdf);

  catsRefreshBtn?.addEventListener("click", loadCatsList);
  createCatBtn?.addEventListener("click", createCategory);

  // Settings
  changeUsernameBtn?.addEventListener("click", changeUsername);
  changePasswordBtn?.addEventListener("click", changePassword);

  // Theme + logout + debug
  themeToggle?.addEventListener("click", toggleTheme);
  logoutBtn?.addEventListener("click", logout);
  toggleDebugBtn?.addEventListener("click", () => {
    state.debugOn = !state.debugOn;
    debugPanel.style.display = state.debugOn ? "" : "none";
    refreshDebug();
  });

  // SLA controls
  slaDaysSelect?.addEventListener("change", () => {
    state.slaDays = Number(slaDaysSelect.value || 30);
    localStorage.setItem("slaDays", String(state.slaDays));
  });

  slaCompareModeSelect?.addEventListener("change", () => {
    state.slaCompareMode = slaCompareModeSelect.value || "none";
    localStorage.setItem("slaCompareMode", state.slaCompareMode);
  });

  slaRefreshBtn?.addEventListener("click", loadSlaDashboard);

  slaExportCsvBtn?.addEventListener("click", () => {
    const days = state.slaDays || 30;
    window.open(`/admin/sla/export.csv?days=${days}`, "_blank");
  });

  slaClearMyStatsBtn?.addEventListener("click", clearMyStats);
  slaClearAllStatsBtn?.addEventListener("click", clearAllStats);

  slaBreachedFilter?.addEventListener("change", loadSlaTicketsTable);
  slaBreachTypeFilter?.addEventListener("change", loadSlaTicketsTable);
  slaSortTickets?.addEventListener("change", loadSlaTicketsTable);
}

/* =========================
   THEME
========================= */
function applyThemeFromStorage() {
  const saved = localStorage.getItem("theme") || "dark";
  document.body.setAttribute("data-theme", saved);
}

function toggleTheme() {
  const current = document.body.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

function togglePassword(input, btn) {
  if (!input || !btn) return;
  input.type = input.type === "password" ? "text" : "password";
  const icon = btn.querySelector("i");
  if (icon) icon.className = input.type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
}

/* =========================
   RESET TOKEN FLOW
========================= */
function handleResetTokenFlow() {
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("resetToken");
  if (!resetToken) return;

  // Show reset card
  hide(forgotCard);
  show(resetCard);
  openView("auth");

  resetSaveBtn.dataset.resetToken = resetToken;
}

/* =========================
   AUTH
========================= */
async function onLogin() {
  hide(authMessage);
  try {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) throw new Error("Fyll i användarnamn + lösenord");

    const data = await apiFetch("/login", { method: "POST", auth: false, body: { username, password } });
    state.token = data.token;
    localStorage.setItem("token", state.token);

    await tryLoadMe();
    showAppForLoggedIn();
    openView("chat");
  } catch (e) {
    showAuthError(e.message);
  }
}

async function onRegister() {
  hide(authMessage);
  try {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const email = emailInput.value.trim();

    if (!username || username.length < 3) throw new Error("Username måste vara minst 3 tecken");
    if (!password || password.length < 4) throw new Error("Lösenord måste vara minst 4 tecken");

    const data = await apiFetch("/register", { method: "POST", auth: false, body: { username, password, email } });
    setText(authMessage, data.message || "Registrerad ✅");
    authMessage.className = "alert";
    show(authMessage);
  } catch (e) {
    showAuthError(e.message);
  }
}

async function onForgotPassword() {
  hide(forgotMsg);
  try {
    const email = forgotEmail.value.trim();
    if (!email) throw new Error("Fyll i email");

    const data = await apiFetch("/auth/forgot-password", { method: "POST", auth: false, body: { email } });
    setText(forgotMsg, data.message || "Skickat ✅");
    forgotMsg.className = "alert";
    show(forgotMsg);
  } catch (e) {
    setText(forgotMsg, e.message);
    forgotMsg.className = "alert error";
    show(forgotMsg);
  }
}

async function onResetPassword() {
  hide(resetMsg);
  try {
    const resetToken = resetSaveBtn.dataset.resetToken || "";
    const newPassword = resetNewPass.value.trim();
    if (!resetToken) throw new Error("Reset-token saknas");
    if (!newPassword || newPassword.length < 4) throw new Error("Välj ett starkare lösenord");

    const data = await apiFetch("/auth/reset-password", { method: "POST", auth: false, body: { resetToken, newPassword } });
    setText(resetMsg, data.message || "Lösenord uppdaterat ✅");
    resetMsg.className = "alert";
    show(resetMsg);

    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete("resetToken");
    window.history.replaceState({}, "", url.toString());
  } catch (e) {
    setText(resetMsg, e.message);
    resetMsg.className = "alert error";
    show(resetMsg);
  }
}

function showAuthError(msg) {
  setText(authMessage, msg);
  authMessage.className = "alert error";
  show(authMessage);
}

async function tryLoadMe() {
  try {
    const me = await apiFetch("/me");
    state.user = me;
    updateRoleUI();
  } catch {
    state.user = null;
    state.token = "";
    localStorage.removeItem("token");
  }
}

function logout() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("token");

  // reset app
  state.conversation = [];
  state.currentTicketId = null;
  messagesBox.innerHTML = "";

  showAppForLoggedOut();
  openView("auth");
}

function updateRoleUI() {
  const role = state.user?.role || "user";
  setText(roleBadge, role === "admin" ? "Admin" : role === "agent" ? "Agent" : "Användare");

  // show/hide admin-only menu buttons
  const adminOnly = document.querySelectorAll(".adminOnly");
  adminOnly.forEach((el) => {
    el.style.display = role === "admin" || role === "agent" ? "" : "none";
  });

  // Settings available once logged in
  if (state.user) show(openSettingsViewBtn);

  // Show logout
  if (state.user) show(logoutBtn);
  else hide(logoutBtn);

  // SLA clear ALL visible only for admin
  if (slaClearAllStatsBtn) {
    slaClearAllStatsBtn.style.display = role === "admin" ? "" : "none";
  }
}

/* =========================
   VIEW SWITCH
========================= */
function openView(name) {
  // hide all
  [authView, chatView, myTicketsView, inboxView, adminView, settingsView, slaView].forEach(hide);

  // menu active
  document.querySelectorAll(".menuBtn").forEach((b) => b.classList.remove("active"));

  // show selected
  if (name === "auth") {
    show(authView);
  } else if (name === "chat") {
    show(chatView);
    openChatViewBtn?.classList.add("active");
    ensureChatStarter();
  } else if (name === "myTickets") {
    show(myTicketsView);
    openMyTicketsViewBtn?.classList.add("active");
    loadMyTickets();
  } else if (name === "inbox") {
    show(inboxView);
    openInboxViewBtn?.classList.add("active");
    loadInboxTickets();
  } else if (name === "admin") {
    show(adminView);
    openAdminViewBtn?.classList.add("active");
    loadAdminUsers();
    loadKbList();
    loadCatsList();
  } else if (name === "settings") {
    show(settingsView);
    openSettingsViewBtn?.classList.add("active");
  } else if (name === "sla") {
    show(slaView);
    openSlaViewBtn?.classList.add("active");
    loadSlaDashboard();
  }

  refreshDebug();
}

function showAppForLoggedIn() {
  // hide auth message cards
  hide(forgotCard);
  hide(resetCard);

  // show main views toggles
  show(openSettingsViewBtn);
  show(logoutBtn);

  updateRoleUI();
}

function showAppForLoggedOut() {
  // hide admin/agent views
  document.querySelectorAll(".adminOnly").forEach((el) => (el.style.display = "none"));
  hide(openSettingsViewBtn);
  hide(logoutBtn);
}

async function reloadAllViews() {
  // Refresh things that depends on category
  clearChat();
  if (state.user) {
    await loadMyTickets().catch(() => {});
    await loadInboxTickets().catch(() => {});
    await loadSlaDashboard().catch(() => {});
    await loadKbList().catch(() => {});
  }
}

/* =========================
   CATEGORIES
========================= */
async function loadCategories() {
  try {
    const cats = await apiFetch("/categories", { auth: false });
    state.categories = cats;

    // Fill dropdown
    if (categorySelect) {
      categorySelect.innerHTML = "";
      cats.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = c.name ? `${c.name} (${c.key})` : c.key;
        categorySelect.appendChild(opt);
      });

      // select stored
      const found = cats.some((c) => c.key === state.companyId);
      categorySelect.value = found ? state.companyId : (cats[0]?.key || "demo");
      state.companyId = categorySelect.value;
      localStorage.setItem("companyId", state.companyId);
    }

    // Admin KB category select too
    if (kbCategorySelect) {
      kbCategorySelect.innerHTML = "";
      cats.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = c.name ? `${c.name} (${c.key})` : c.key;
        kbCategorySelect.appendChild(opt);
      });
      kbCategorySelect.value = state.companyId;
      kbCategorySelect.addEventListener("change", () => loadKbList());
    }
  } catch (e) {
    console.warn("Categories load failed:", e.message);
  }
}

/* =========================
   CHAT VIEW
========================= */
function ensureChatStarter() {
  if (!state.user) return;

  setText(chatTitle, "AI Kundtjänst");
  setText(chatSubtitle, `Kategori: ${state.companyId}`);

  if (!state.conversation.length) {
    addMessageUI("assistant", "Hej! 👋 Skriv din fråga så hjälper jag dig direkt.");
  }
}

function addMessageUI(role, text, meta = "") {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = role === "user" ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-robot"></i>`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  const metaEl = document.createElement("div");
  metaEl.className = "msgMeta";
  metaEl.textContent = meta || "";

  const contentCol = document.createElement("div");
  contentCol.appendChild(bubble);
  if (meta) contentCol.appendChild(metaEl);

  wrap.appendChild(avatar);
  wrap.appendChild(contentCol);

  messagesBox.appendChild(wrap);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

function clearChat() {
  state.conversation = [];
  state.currentTicketId = null;
  messagesBox.innerHTML = "";
  ensureChatStarter();
  refreshDebug();
}

function exportChat() {
  const lines = state.conversation.map((m) => `[${m.role}] ${m.content}`);
  const text = lines.join("\n\n");
  downloadText(`chat_${state.companyId}_${new Date().toISOString().slice(0, 10)}.txt`, text);
}

function startNewTicket() {
  // New ticket = reset currentTicketId so backend creates a new open ticket on next message
  state.currentTicketId = null;
  state.conversation = [];
  messagesBox.innerHTML = "";
  addMessageUI("assistant", "Okej ✅ Nytt ärende startat. Skriv din fråga!");
  refreshDebug();
}

async function onSendChat() {
  if (!state.user) return;

  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  addMessageUI("user", text, fmtDate(new Date()));

  const msgObj = { role: "user", content: text };
  state.conversation.push(msgObj);

  // Make assistant feel responsive
  addMessageUI("assistant", "Skriver...", "");

  try {
    const data = await apiFetch("/chat", {
      method: "POST",
      body: {
        companyId: state.companyId,
        conversation: state.conversation,
        ticketId: state.currentTicketId,
      },
    });

    // remove "Skriver..." bubble (last assistant msg)
    messagesBox.removeChild(messagesBox.lastElementChild);

    state.currentTicketId = data.ticketId || state.currentTicketId;

    const reply = data.reply || "Inget svar.";
    state.conversation.push({ role: "assistant", content: reply });

    const meta = [];
    meta.push(fmtDate(new Date()));
    if (data.ragUsed) meta.push("RAG: ON");
    if (Array.isArray(data.sources) && data.sources.length) meta.push(`Källor: ${data.sources.length}`);

    addMessageUI("assistant", reply, meta.join(" • "));
    dbgRag && setText(dbgRag, data.ragUsed ? "ON" : "OFF");
  } catch (e) {
    // remove "Skriver..." bubble
    messagesBox.removeChild(messagesBox.lastElementChild);
    addMessageUI("assistant", `❌ Fel: ${e.message}`);
  }

  refreshDebug();
}

async function sendFeedback(type) {
  if (!state.user) return;
  try {
    await apiFetch("/feedback", { method: "POST", body: { type, companyId: state.companyId } });
    setText(fbMsg, "Tack för feedback! ✅");
    setTimeout(() => setText(fbMsg, ""), 2500);
  } catch {
    setText(fbMsg, "Kunde inte skicka feedback.");
    setTimeout(() => setText(fbMsg, ""), 2500);
  }
}

/* =========================
   MY TICKETS
========================= */
async function loadMyTickets() {
  if (!state.user) return;
  try {
    const data = await apiFetch("/my/tickets");
    state.myTickets = data || [];

    setText(myTicketsHint, `${state.myTickets.length} ärenden`);

    renderMyTicketsList();
  } catch (e) {
    setText(myTicketsHint, e.message);
  }
}

function renderMyTicketsList() {
  myTicketsList.innerHTML = "";

  if (!state.myTickets.length) {
    myTicketsList.innerHTML = `<div class="muted small">Inga ärenden ännu.</div>`;
    setHTML(myTicketDetails, `<div class="muted small">Välj ett ärende för att se detaljer.</div>`);
    state.selectedMyTicket = null;
    return;
  }

  state.myTickets.forEach((t) => {
    const item = document.createElement("div");
    item.className = "listItem";

    const selected = state.selectedMyTicket && String(state.selectedMyTicket._id) === String(t._id);
    if (selected) item.classList.add("selected");

    const title = t.title || "(utan titel)";
    const status = t.status || "open";
    const prio = t.priority || "normal";

    item.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-ticket"></i>
        <span>${escapeHtml(title)}</span>
        <span class="pill">${escapeHtml(status)}</span>
        <span class="pill">${escapeHtml(prio)}</span>
      </div>
      <div class="muted small" style="margin-top:6px;">Senast: ${fmtDate(t.lastActivityAt)}</div>
    `;

    item.addEventListener("click", async () => {
      const full = await apiFetch(`/my/tickets/${t._id}`);
      state.selectedMyTicket = full;
      renderMyTicketsList();
      renderMyTicketDetails();
    });

    myTicketsList.appendChild(item);
  });

  if (!state.selectedMyTicket) {
    state.selectedMyTicket = state.myTickets[0];
    renderMyTicketDetails();
    renderMyTicketsList();
  }
}

function renderMyTicketDetails() {
  const t = state.selectedMyTicket;
  if (!t) {
    setHTML(myTicketDetails, `<div class="muted small">Välj ett ärende för att se detaljer.</div>`);
    return;
  }

  const msgs = t.messages || [];
  const parts = [];

  parts.push(`<div><b>${escapeHtml(t.title || "(utan titel)")}</b></div>`);
  parts.push(`<div class="muted small">Ticket: ${escapeHtml(String(t._id))}</div>`);
  parts.push(`<div class="muted small">Status: ${escapeHtml(t.status || "-")} • Prio: ${escapeHtml(t.priority || "-")}</div>`);
  parts.push(`<div class="divider"></div>`);

  if (!msgs.length) {
    parts.push(`<div class="muted small">Inga meddelanden ännu.</div>`);
  } else {
    for (const m of msgs) {
      const who = m.role === "user" ? "Du" : m.role === "agent" ? "Agent" : "AI";
      parts.push(`
        <div class="ticketMsg">
          <div class="ticketMsgHead">
            <span>${escapeHtml(who)}</span>
            <span>${fmtDate(m.timestamp)}</span>
          </div>
          <div>${escapeHtml(m.content)}</div>
        </div>
      `);
    }
  }

  setHTML(myTicketDetails, parts.join(""));
}

async function onMyTicketReply() {
  hide(myTicketReplyMsg);
  try {
    const t = state.selectedMyTicket;
    if (!t) throw new Error("Välj ett ärende först");

    const content = myTicketReplyText.value.trim();
    if (!content) throw new Error("Skriv ett meddelande");

    const data = await apiFetch(`/my/tickets/${t._id}/reply`, {
      method: "POST",
      body: { content },
    });

    myTicketReplyText.value = "";
    state.selectedMyTicket = data.ticket;
    await loadMyTickets();

    setText(myTicketReplyMsg, data.message || "Skickat ✅");
    myTicketReplyMsg.className = "alert";
    show(myTicketReplyMsg);

    renderMyTicketDetails();
  } catch (e) {
    setText(myTicketReplyMsg, e.message);
    myTicketReplyMsg.className = "alert error";
    show(myTicketReplyMsg);
  }
}

/* =========================
   INBOX
========================= */
async function loadInboxTickets() {
  if (!state.user) return;
  if (!["admin", "agent"].includes(state.user.role)) return;

  hide(inboxMsg);

  try {
    // For inbox view we load all statuses by default
    const data = await apiFetch(`/admin/tickets?companyId=${encodeURIComponent(state.companyId)}`);
    state.inboxTickets = data || [];

    // populate category filter from categories
    if (inboxCategoryFilter) {
      inboxCategoryFilter.innerHTML = `<option value="">Alla kategorier</option>`;
      state.categories.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = c.name ? `${c.name} (${c.key})` : c.key;
        inboxCategoryFilter.appendChild(opt);
      });
    }

    renderInboxTicketsFiltered();
    updateInboxNotifDot();
  } catch (e) {
    setText(inboxMsg, e.message);
    show(inboxMsg);
  }
}

function updateInboxNotifDot() {
  if (!inboxNotifDot || !openInboxViewBtn) return;

  const openCount = (state.inboxTickets || []).filter((t) => t.status === "open").length;
  if (openCount > 0) {
    inboxNotifDot.style.display = "";
    openInboxViewBtn.classList.add("hasNotif");
  } else {
    inboxNotifDot.style.display = "none";
    openInboxViewBtn.classList.remove("hasNotif");
  }
}

function renderInboxTicketsFiltered() {
  inboxTicketsList.innerHTML = "";

  const status = inboxStatusFilter?.value || "";
  const cat = inboxCategoryFilter?.value || "";
  const q = (inboxSearchInput?.value || "").trim().toLowerCase();

  let list = [...(state.inboxTickets || [])];

  if (status) list = list.filter((t) => t.status === status);
  if (cat) list = list.filter((t) => t.companyId === cat);
  if (q) {
    list = list.filter((t) => {
      const title = String(t.title || "").toLowerCase();
      const id = String(t._id || "").toLowerCase();
      const company = String(t.companyId || "").toLowerCase();
      return title.includes(q) || id.includes(q) || company.includes(q);
    });
  }

  if (!list.length) {
    inboxTicketsList.innerHTML = `<div class="muted small">Inga tickets.</div>`;
    return;
  }

  list.forEach((t) => {
    const item = document.createElement("div");
    item.className = "listItem";

    if (state.selectedInboxTicket && String(state.selectedInboxTicket._id) === String(t._id)) {
      item.classList.add("selected");
    }

    const badge = t.status === "open" ? `<span class="pill">Open</span>` : t.status === "pending" ? `<span class="pill">Pending</span>` : `<span class="pill">Solved</span>`;
    const prio = `<span class="pill">${escapeHtml(t.priority || "normal")}</span>`;

    const sla = t.sla || {};
    const s1 = sla.firstResponseState || "";
    const s2 = sla.resolutionState || "";
    const slaBadges = `
      <span class="${pillClassFromState(s1)}">FR: ${escapeHtml(s1 || "-")}</span>
      <span class="${pillClassFromState(s2)}">RES: ${escapeHtml(s2 || "-")}</span>
    `;

    item.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-inbox"></i>
        <span>${escapeHtml(t.title || "(utan titel)")}</span>
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${badge} ${prio} ${slaBadges}
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${escapeHtml(String(t._id).slice(-8))} • ${escapeHtml(t.companyId || "-")} • ${fmtDate(t.lastActivityAt)}
      </div>
    `;

    item.addEventListener("click", async () => {
      const full = await apiFetch(`/admin/tickets/${t._id}`);
      state.selectedInboxTicket = full;
      renderInboxTicketsFiltered();
      renderInboxTicketDetails();
      await loadAssignUsers();
    });

    inboxTicketsList.appendChild(item);
  });

  if (!state.selectedInboxTicket && list[0]) {
    state.selectedInboxTicket = list[0];
    renderInboxTicketDetails();
    loadAssignUsers().catch(() => {});
  }
}

function renderInboxTicketDetails() {
  const t = state.selectedInboxTicket;
  if (!t) {
    setHTML(ticketDetails, `<div class="muted small">Välj en ticket.</div>`);
    return;
  }

  hide(inboxTicketMsg);

  const sla = t.sla || {};

  const head = `
    <div><b>${escapeHtml(t.title || "(utan titel)")}</b></div>
    <div class="muted small">Ticket: ${escapeHtml(String(t._id))}</div>
    <div class="muted small">Status: ${escapeHtml(t.status)} • Prio: ${escapeHtml(t.priority || "normal")} • Kategori: ${escapeHtml(t.companyId)}</div>

    <div class="divider"></div>

    <div class="row gap" style="flex-wrap:wrap;">
      <span class="${pillClassFromState(sla.firstResponseState)}">First response: ${escapeHtml(sla.firstResponseState || "-")}</span>
      <span class="${pillClassFromState(sla.resolutionState)}">Resolution: ${escapeHtml(sla.resolutionState || "-")}</span>
      <span class="pill">FR kvar: ${escapeHtml(msToPretty(sla.firstResponseRemainingMs))}</span>
      <span class="pill">RES kvar: ${escapeHtml(msToPretty(sla.resolutionRemainingMs))}</span>
      <span class="pill">Pending: ${escapeHtml(msToPretty(sla.pendingTotalMs))}</span>
    </div>

    <div class="divider"></div>
  `;

  const msgs = t.messages || [];
  const parts = [head];

  if (!msgs.length) {
    parts.push(`<div class="muted small">Inga meddelanden.</div>`);
  } else {
    for (const m of msgs) {
      const who = m.role === "user" ? "Kund" : m.role === "agent" ? "Agent" : "AI";
      parts.push(`
        <div class="ticketMsg">
          <div class="ticketMsgHead">
            <span>${escapeHtml(who)}</span>
            <span>${fmtDate(m.timestamp)}</span>
          </div>
          <div>${escapeHtml(m.content)}</div>
        </div>
      `);
    }
  }

  // internal notes
  const notes = t.internalNotes || [];
  const notesHtml = notes.length
    ? notes
        .slice()
        .reverse()
        .map((n) => {
          return `
            <div class="ticketMsg">
              <div class="ticketMsgHead">
                <span>Note</span>
                <span>${fmtDate(n.createdAt)}</span>
              </div>
              <div>${escapeHtml(n.content)}</div>
            </div>
          `;
        })
        .join("")
    : `<div class="muted small">Inga interna notes.</div>`;

  setHTML(ticketDetails, parts.join(""));
  setHTML(internalNotesList, notesHtml);

  // set priority select
  if (ticketPrioritySelect) ticketPrioritySelect.value = t.priority || "normal";
}

async function setTicketStatus(status) {
  try {
    const t = state.selectedInboxTicket;
    if (!t) throw new Error("Välj en ticket");

    const data = await apiFetch(`/admin/tickets/${t._id}/status`, { method: "POST", body: { status } });
    state.selectedInboxTicket = data.ticket;

    // refresh list
    await loadInboxTickets();
    renderInboxTicketDetails();
  } catch (e) {
    setText(inboxTicketMsg, e.message);
    show(inboxTicketMsg);
  }
}

async function onSetPriority() {
  try {
    const t = state.selectedInboxTicket;
    if (!t) throw new Error("Välj en ticket");

    const priority = ticketPrioritySelect.value || "normal";
    const data = await apiFetch(`/admin/tickets/${t._id}/priority`, { method: "POST", body: { priority } });
    state.selectedInboxTicket = data.ticket;

    await loadInboxTickets();
    renderInboxTicketDetails();
  } catch (e) {
    setText(inboxTicketMsg, e.message);
    show(inboxTicketMsg);
  }
}

async function onAgentReplyInbox() {
  try {
    const t = state.selectedInboxTicket;
    if (!t) throw new Error("Välj en ticket");

    const content = agentReplyTextInbox.value.trim();
    if (!content) throw new Error("Skriv ett svar");

    const data = await apiFetch(`/admin/tickets/${t._id}/agent-reply`, { method: "POST", body: { content } });
    state.selectedInboxTicket = data.ticket;

    agentReplyTextInbox.value = "";
    await loadInboxTickets();
    renderInboxTicketDetails();
  } catch (e) {
    setText(inboxTicketMsg, e.message);
    show(inboxTicketMsg);
  }
}

async function onSaveInternalNote() {
  try {
    const t = state.selectedInboxTicket;
    if (!t) throw new Error("Välj en ticket");

    const content = internalNoteText.value.trim();
    if (!content) throw new Error("Skriv en notering");

    const data = await apiFetch(`/admin/tickets/${t._id}/internal-note`, { method: "POST", body: { content } });
    state.selectedInboxTicket = data.ticket;

    internalNoteText.value = "";
    renderInboxTicketDetails();
  } catch (e) {
    setText(inboxTicketMsg, e.message);
    show(inboxTicketMsg);
  }
}

async function onClearInternalNotes() {
  try {
    const t = state.selectedInboxTicket;
    if (!t) throw new Error("Välj en ticket");
    await apiFetch(`/admin/tickets/${t._id}/internal-notes`, { method: "DELETE" });
    await loadInboxTickets();
    renderInboxTicketDetails();
  } catch (e) {
    setText(inboxTicketMsg, e.message);
    show(inboxTicketMsg);
  }
}

async function loadAssignUsers() {
  // only admin can assign
  if (!state.user || state.user.role !== "admin") return;

  const users = await apiFetch("/admin/users");
  const agents = (users || []).filter((u) => u.role === "agent" || u.role === "admin");

  assignUserSelect.innerHTML = `<option value="">Välj agent...</option>`;
  agents.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u._id;
    opt.textContent = `${u.username} (${u.role})`;
    assignUserSelect.appendChild(opt);
  });
}

async function onAssignTicket() {
  try {
    if (!state.user || state.user.role !== "admin") throw new Error("Endast admin kan assigna");
    const t = state.selectedInboxTicket;
    if (!t) throw new Error("Välj en ticket");

    const userId = assignUserSelect.value;
    if (!userId) throw new Error("Välj en agent");

    const data = await apiFetch(`/admin/tickets/${t._id}/assign`, { method: "POST", body: { userId } });
    state.selectedInboxTicket = data.ticket;
    await loadInboxTickets();
    renderInboxTicketDetails();
  } catch (e) {
    setText(inboxTicketMsg, e.message);
    show(inboxTicketMsg);
  }
}

async function onDeleteTicket() {
  try {
    const t = state.selectedInboxTicket;
    if (!t) throw new Error("Välj en ticket");

    await apiFetch(`/admin/tickets/${t._id}`, { method: "DELETE" });

    state.selectedInboxTicket = null;
    await loadInboxTickets();
    setHTML(ticketDetails, `<div class="muted small">Välj en ticket.</div>`);
  } catch (e) {
    setText(inboxTicketMsg, e.message);
    show(inboxTicketMsg);
  }
}

async function solveAllTickets() {
  try {
    if (!state.user || state.user.role !== "admin") throw new Error("Endast admin");
    await apiFetch(`/admin/tickets/solve-all`, { method: "POST" });
    await loadInboxTickets();
  } catch (e) {
    setText(inboxMsg, e.message);
    show(inboxMsg);
  }
}

async function removeSolvedTickets() {
  try {
    if (!state.user || state.user.role !== "admin") throw new Error("Endast admin");
    await apiFetch(`/admin/tickets/remove-solved`, { method: "POST" });
    await loadInboxTickets();
  } catch (e) {
    setText(inboxMsg, e.message);
    show(inboxMsg);
  }
}

/* =========================
   ADMIN: USERS + KB + CATS
========================= */
async function loadAdminUsers() {
  if (!state.user || !["admin", "agent"].includes(state.user.role)) return;

  hide(adminUsersMsg);

  try {
    const users = await apiFetch("/admin/users");
    renderAdminUsers(users || []);
  } catch (e) {
    setText(adminUsersMsg, e.message);
    show(adminUsersMsg);
  }
}

function renderAdminUsers(users) {
  adminUsersList.innerHTML = "";

  if (!users.length) {
    adminUsersList.innerHTML = `<div class="muted small">Inga users.</div>`;
    return;
  }

  users.forEach((u) => {
    const item = document.createElement("div");
    item.className = "listItem";

    item.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-user"></i>
        <span>${escapeHtml(u.username)}</span>
        <span class="pill ${u.role === "admin" ? "admin" : ""}">${escapeHtml(u.role)}</span>
      </div>
      <div class="muted small" style="margin-top:6px;">Email: ${escapeHtml(u.email || "-")}</div>
    `;

    // Admin controls
    if (state.user?.role === "admin" && String(u._id) !== String(state.user.id)) {
      const actions = document.createElement("div");
      actions.className = "bubbleActions";

      const roleSelect = document.createElement("select");
      roleSelect.className = "input smallInput";
      roleSelect.innerHTML = `
        <option value="user">user</option>
        <option value="agent">agent</option>
        <option value="admin">admin</option>
      `;
      roleSelect.value = u.role;

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn ghost small";
      saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Spara roll`;

      saveBtn.addEventListener("click", async () => {
        try {
          await apiFetch(`/admin/users/${u._id}/role`, { method: "POST", body: { role: roleSelect.value } });
          await loadAdminUsers();
        } catch (e) {
          alert(e.message);
        }
      });

      const delBtn = document.createElement("button");
      delBtn.className = "btn danger small";
      delBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Ta bort`;

      delBtn.addEventListener("click", async () => {
        if (!confirm(`Ta bort ${u.username}?`)) return;
        try {
          await apiFetch(`/admin/users/${u._id}`, { method: "DELETE" });
          await loadAdminUsers();
        } catch (e) {
          alert(e.message);
        }
      });

      actions.appendChild(roleSelect);
      actions.appendChild(saveBtn);
      actions.appendChild(delBtn);
      item.appendChild(actions);
    }

    adminUsersList.appendChild(item);
  });
}

async function loadKbList() {
  if (!state.user || state.user.role !== "admin") return;
  hide(kbMsg);

  const cid = kbCategorySelect?.value || state.companyId || "demo";

  try {
    const items = await apiFetch(`/kb/list/${encodeURIComponent(cid)}`);
    kbList.innerHTML = "";

    if (!items.length) {
      kbList.innerHTML = `<div class="muted small">Ingen KB ännu.</div>`;
      return;
    }

    items.forEach((it) => {
      const row = document.createElement("div");
      row.className = "listItem";

      row.innerHTML = `
        <div class="listItemTitle">
          <i class="fa-solid fa-book"></i>
          <span>${escapeHtml(it.title || it.sourceRef || "KB")}</span>
          <span class="pill">${escapeHtml(it.sourceType)}</span>
        </div>
        <div class="muted small" style="margin-top:6px;">
          Chunk #${it.chunkIndex} • ${fmtDate(it.createdAt)} • ${it.embeddingOk ? "embedding✅" : "embedding❌"}
        </div>
      `;
      kbList.appendChild(row);
    });
  } catch (e) {
    setText(kbMsg, e.message);
    show(kbMsg);
  }
}

async function kbUploadText() {
  hide(kbMsg);
  try {
    const companyId = kbCategorySelect.value;
    const title = kbTextTitle.value.trim();
    const content = kbTextContent.value.trim();
    if (!content) throw new Error("Klistra in text");

    const data = await apiFetch("/kb/upload-text", { method: "POST", body: { companyId, title, content } });
    setText(kbMsg, data.message || "Uppladdad ✅");
    kbMsg.className = "alert";
    show(kbMsg);
    kbTextContent.value = "";
    await loadKbList();
  } catch (e) {
    setText(kbMsg, e.message);
    kbMsg.className = "alert error";
    show(kbMsg);
  }
}

async function kbUploadUrl() {
  hide(kbMsg);
  try {
    const companyId = kbCategorySelect.value;
    const url = kbUrlInput.value.trim();
    if (!url) throw new Error("Skriv en URL");

    const data = await apiFetch("/kb/upload-url", { method: "POST", body: { companyId, url } });
    setText(kbMsg, data.message || "Uppladdad ✅");
    kbMsg.className = "alert";
    show(kbMsg);
    kbUrlInput.value = "";
    await loadKbList();
  } catch (e) {
    setText(kbMsg, e.message);
    kbMsg.className = "alert error";
    show(kbMsg);
  }
}

async function kbUploadPdf() {
  hide(kbMsg);
  try {
    const companyId = kbCategorySelect.value;
    const file = kbPdfFile.files?.[0];
    if (!file) throw new Error("Välj en PDF-fil");

    const base64 = await fileToBase64(file);
    const data = await apiFetch("/kb/upload-pdf", {
      method: "POST",
      body: { companyId, filename: file.name, base64: base64.split(",")[1] },
    });

    setText(kbMsg, data.message || "Uppladdad ✅");
    kbMsg.className = "alert";
    show(kbMsg);
    kbPdfFile.value = "";
    await loadKbList();
  } catch (e) {
    setText(kbMsg, e.message);
    kbMsg.className = "alert error";
    show(kbMsg);
  }
}

async function loadCatsList() {
  if (!state.user || state.user.role !== "admin") return;
  hide(catsMsg);

  try {
    const cats = await apiFetch("/categories", { auth: false });
    renderCatsList(cats || []);
  } catch (e) {
    setText(catsMsg, e.message);
    show(catsMsg);
  }
}

function renderCatsList(cats) {
  catsList.innerHTML = "";
  cats.forEach((c) => {
    const item = document.createElement("div");
    item.className = "listItem";
    item.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-layer-group"></i>
        <span>${escapeHtml(c.name || c.key)}</span>
        <span class="pill">${escapeHtml(c.key)}</span>
      </div>
      <div class="muted small" style="margin-top:6px;">Prompt: ${escapeHtml((c.systemPrompt || "").slice(0, 90))}${(c.systemPrompt || "").length > 90 ? "..." : ""}</div>
    `;

    if (!["demo", "law", "tech", "cleaning"].includes(c.key)) {
      const del = document.createElement("button");
      del.className = "btn danger small";
      del.style.marginTop = "10px";
      del.innerHTML = `<i class="fa-solid fa-trash"></i> Ta bort kategori`;
      del.addEventListener("click", async () => {
        if (!confirm(`Ta bort kategori ${c.key}?`)) return;
        try {
          await apiFetch(`/admin/categories/${c.key}`, { method: "DELETE" });
          await loadCategories();
          await loadCatsList();
        } catch (e) {
          alert(e.message);
        }
      });
      item.appendChild(del);
    }

    catsList.appendChild(item);
  });
}

async function createCategory() {
  hide(catsMsg);
  try {
    const key = newCatKey.value.trim();
    const name = newCatName.value.trim();
    const systemPrompt = newCatPrompt.value.trim();

    if (!key || !name) throw new Error("Key + namn krävs");

    const data = await apiFetch("/admin/categories", { method: "POST", body: { key, name, systemPrompt } });
    setText(catsMsg, data.message || "Skapad ✅");
    catsMsg.className = "alert";
    show(catsMsg);

    newCatKey.value = "";
    newCatName.value = "";
    newCatPrompt.value = "";

    await loadCategories();
    await loadCatsList();
  } catch (e) {
    setText(catsMsg, e.message);
    catsMsg.className = "alert error";
    show(catsMsg);
  }
}

/* =========================
   SETTINGS
========================= */
async function changeUsername() {
  hide(settingsMsg);
  try {
    const newUsername = newUsernameInput.value.trim();
    if (!newUsername || newUsername.length < 3) throw new Error("Minst 3 tecken");

    const data = await apiFetch("/auth/change-username", { method: "POST", body: { newUsername } });
    setText(settingsMsg, data.message || "Uppdaterat ✅");
    settingsMsg.className = "alert";
    show(settingsMsg);

    await tryLoadMe();
    updateRoleUI();
  } catch (e) {
    setText(settingsMsg, e.message);
    settingsMsg.className = "alert error";
    show(settingsMsg);
  }
}

async function changePassword() {
  hide(settingsMsg);
  try {
    const currentPassword = currentPassInput.value.trim();
    const newPassword = newPassInput.value.trim();
    if (!currentPassword || !newPassword) throw new Error("Fyll i båda fälten");

    const data = await apiFetch("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
    setText(settingsMsg, data.message || "Uppdaterat ✅");
    settingsMsg.className = "alert";
    show(settingsMsg);

    currentPassInput.value = "";
    newPassInput.value = "";
  } catch (e) {
    setText(settingsMsg, e.message);
    settingsMsg.className = "alert error";
    show(settingsMsg);
  }
}

/* =========================
   SLA DASHBOARD (BIG UPGRADE)
========================= */
function syncSlaControls() {
  if (slaDaysSelect) slaDaysSelect.value = String(state.slaDays);
  if (slaCompareModeSelect) slaCompareModeSelect.value = state.slaCompareMode;
}

async function loadSlaDashboard() {
  if (!state.user || !["admin", "agent"].includes(state.user.role)) return;

  syncSlaControls();

  // Make SLA view look alive immediately
  setHTML(slaOverviewBox, `<div class="muted small">Laddar SLA...</div>`);
  setHTML(slaAgentsBox, `<div class="muted small">Laddar agents...</div>`);
  setHTML(slaTicketsBox, `<div class="muted small">Laddar tickets...</div>`);
  setText(slaTrendHint, "Laddar trend...");

  await Promise.allSettled([
    loadSlaOverviewAndKpi(),
    loadSlaTrend(),
    loadSlaAgents(),
    loadSlaTicketsTable(),
  ]);
}

async function loadSlaOverviewAndKpi() {
  const days = state.slaDays || 30;

  const [overviewRes, kpiRes] = await Promise.all([
    apiFetch(`/admin/sla/overview?days=${days}`),
    apiFetch(`/admin/sla/kpi?days=${days}`),
  ]);

  renderSlaOverviewAndKpi(overviewRes, kpiRes);

  // optional compare
  if (state.slaCompareMode !== "none") {
    let a = days;
    let b = 7;
    if (state.slaCompareMode === "prevPeriod") b = days;
    if (state.slaCompareMode === "prevWeek") b = 7;

    try {
      const cmp = await apiFetch(`/admin/sla/compare?a=${a}&b=${b}`);
      renderSlaCompareBlock(cmp);
    } catch {
      // ignore compare errors
    }
  }
}

function renderSlaOverviewAndKpi(overview, kpi) {
  const o = overview || {};
  const k = kpi || {};

  const fr = o.firstResponse || {};
  const rs = o.resolution || {};

  const totals = k.totals || {};
  const health = k.slaHealth || {};
  const distFR = k.distribution?.firstResponse || {};
  const distRS = k.distribution?.resolution || {};
  const ageing = Array.isArray(k.ageing) ? k.ageing : [];
  const byCat = Array.isArray(k.byCategory) ? k.byCategory : [];

  const overviewCards = `
    <div class="slaGrid">
      <div class="slaCard">
        <div class="slaLabel">Tickets (period)</div>
        <div class="slaValue">${o.totalTickets ?? "-"}</div>
        <div class="muted small">Low: ${(o.byPriority?.low ?? 0)} • Normal: ${(o.byPriority?.normal ?? 0)} • High: ${(o.byPriority?.high ?? 0)}</div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">First response compliance</div>
        <div class="slaValue">${fr.compliancePct ?? "-"}%</div>
        <div class="muted small">
          Avg: ${msToPretty(fr.avgMs)} • Median: ${msToPretty(fr.medianMs)} • P90: ${msToPretty(fr.p90Ms)}
        </div>
        <div class="muted small">
          Breaches: ${fr.breaches ?? 0} • At-risk: ${fr.atRisk ?? 0}
        </div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">Resolution compliance</div>
        <div class="slaValue">${rs.compliancePct ?? "-"}%</div>
        <div class="muted small">
          Avg: ${msToPretty(rs.avgMs)} • Median: ${msToPretty(rs.medianMs)} • P90: ${msToPretty(rs.p90Ms)}
        </div>
        <div class="muted small">
          Breaches: ${rs.breaches ?? 0} • At-risk: ${rs.atRisk ?? 0}
        </div>
      </div>
    </div>
  `;

  const kpiCards = `
    <div class="divider"></div>
    <h3 style="margin:0 0 8px 0;">KPI Dashboard</h3>

    <div class="slaGrid">
      <div class="slaCard">
        <div class="slaLabel">Backlog (open + pending)</div>
        <div class="slaValue">${(totals.open ?? 0) + (totals.pending ?? 0)}</div>
        <div class="muted small">Open: ${totals.open ?? 0} • Pending: ${totals.pending ?? 0}</div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">Solve rate</div>
        <div class="slaValue">${totals.solveRatePct ?? "-"}%</div>
        <div class="muted small">Solved: ${totals.solved ?? 0} av ${totals.total ?? 0}</div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">SLA Health</div>
        <div class="slaValue">${health.breachedPct ?? "-"}%</div>
        <div class="muted small">Breached: ${health.breachedAny ?? 0} • Risk: ${health.riskAny ?? 0} (${health.riskPct ?? "-"}%)</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="split">
      <div class="panel">
        <div class="panelHead"><b>Ageing (backlog)</b></div>
        ${
          ageing.length
            ? ageing
                .map(
                  (b) => `
                <div class="row" style="justify-content:space-between; margin:8px 0;">
                  <span class="muted small">${escapeHtml(b.key)}</span>
                  <span class="pill">${b.count}</span>
                </div>
              `
                )
                .join("")
            : `<div class="muted small">Ingen data.</div>`
        }
      </div>

      <div class="panel">
        <div class="panelHead"><b>Kategori KPI</b></div>
        ${
          byCat.length
            ? `
          <div class="tableWrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Total</th>
                  <th>Solved%</th>
                  <th>Breached%</th>
                  <th>Open</th>
                  <th>Pending</th>
                </tr>
              </thead>
              <tbody>
                ${byCat
                  .slice(0, 12)
                  .map(
                    (r) => `
                    <tr>
                      <td>${escapeHtml(r.companyId)}</td>
                      <td>${r.total ?? 0}</td>
                      <td>${r.solvedPct ?? "-"}%</td>
                      <td>${r.breachedPct ?? "-"}%</td>
                      <td>${r.open ?? 0}</td>
                      <td>${r.pending ?? 0}</td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <div class="muted small" style="margin-top:8px;">Visar topp 12 kategorier i perioden.</div>
          `
            : `<div class="muted small">Ingen kategori-data.</div>`
        }
      </div>
    </div>
  `;

  const distBlock = `
    <div class="divider"></div>
    <h3 style="margin:0 0 8px 0;">Distribution (KPI)</h3>

    <div class="slaGrid">
      <div class="slaCard">
        <div class="slaLabel">First Response (KPI)</div>
        <div class="slaValue">${msToPretty(distFR.medianMs)}</div>
        <div class="muted small">Avg: ${msToPretty(distFR.avgMs)} • P90: ${msToPretty(distFR.p90Ms)}</div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">Resolution (KPI)</div>
        <div class="slaValue">${msToPretty(distRS.medianMs)}</div>
        <div class="muted small">Avg: ${msToPretty(distRS.avgMs)} • P90: ${msToPretty(distRS.p90Ms)}</div>
      </div>

      <div class="slaCard">
        <div class="slaLabel">Period</div>
        <div class="slaValue">${k.rangeDays ?? "-"}</div>
        <div class="muted small">Dagar i urval</div>
      </div>
    </div>
  `;

  setHTML(slaOverviewBox, overviewCards + kpiCards + distBlock);
}

function renderSlaCompareBlock(cmp) {
  const a = cmp?.a;
  const b = cmp?.b;
  if (!a || !b) return;

  const block = `
    <div class="divider"></div>
    <h3 style="margin:0 0 8px 0;">Jämförelse</h3>

    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Tickets</th>
            <th>FR compliance</th>
            <th>FR breaches</th>
            <th>RES compliance</th>
            <th>RES breaches</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${a.rangeDays} dagar</td>
            <td>${a.totalTickets ?? 0}</td>
            <td>${a.firstResponse?.compliancePct ?? "-"}%</td>
            <td>${a.firstResponse?.breaches ?? 0}</td>
            <td>${a.resolution?.compliancePct ?? "-"}%</td>
            <td>${a.resolution?.breaches ?? 0}</td>
          </tr>
          <tr>
            <td>${b.rangeDays} dagar</td>
            <td>${b.totalTickets ?? 0}</td>
            <td>${b.firstResponse?.compliancePct ?? "-"}%</td>
            <td>${b.firstResponse?.breaches ?? 0}</td>
            <td>${b.resolution?.compliancePct ?? "-"}%</td>
            <td>${b.resolution?.breaches ?? 0}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="muted small" style="margin-top:8px;">Jämförelsen använder din backend endpoint <code>/admin/sla/compare</code>.</div>
  `;

  // Append under overview box
  slaOverviewBox.insertAdjacentHTML("beforeend", block);
}

async function loadSlaTrend() {
  const days = state.slaDays || 30;

  // Toggle mode button inside hint area
  const toggleHtml = `
    <span class="pill" style="cursor:pointer;" id="slaTrendToggle">
      Trend: ${state.slaTrendMode === "weekly" ? "Weekly" : "Daily"} (klicka för att ändra)
    </span>
  `;
  setHTML(slaTrendHint, toggleHtml);

  const toggle = $("slaTrendToggle");
  toggle?.addEventListener("click", async () => {
    state.slaTrendMode = state.slaTrendMode === "weekly" ? "daily" : "weekly";
    localStorage.setItem("slaTrendMode", state.slaTrendMode);
    await loadSlaTrend();
  });

  const endpoint =
    state.slaTrendMode === "daily"
      ? `/admin/sla/trend/daily?days=${clamp(days, 1, 120)}`
      : `/admin/sla/trend/weekly?days=${days}`;

  const data = await apiFetch(endpoint);
  const rows = data.rows || [];

  renderSlaTrendChart(rows, state.slaTrendMode);
}

let slaChartInstance = null;

function renderSlaTrendChart(rows, mode) {
  if (!slaTrendChart) return;
  if (!window.Chart) {
    setText(slaTrendHint, "Chart.js saknas (lägg in CDN om du vill ha graf).");
    return;
  }

  const labels = rows.map((r) => (mode === "daily" ? r.day : r.week));
  const fr = rows.map((r) => r.firstCompliancePct ?? 0);
  const rs = rows.map((r) => r.resolutionCompliancePct ?? 0);

  if (slaChartInstance) {
    slaChartInstance.destroy();
    slaChartInstance = null;
  }

  const ctx = slaTrendChart.getContext("2d");
  slaChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "First response %", data: fr, tension: 0.35 },
        { label: "Resolution %", data: rs, tension: 0.35 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } },
      },
    },
  });

  // keep hint toggle visible
  const toggleHtml = `
    <span class="pill" style="cursor:pointer;" id="slaTrendToggle">
      Trend: ${state.slaTrendMode === "weekly" ? "Weekly" : "Daily"} (klicka för att ändra)
    </span>
    <span class="muted small" style="margin-left:10px;">Punkter: ${rows.length}</span>
  `;
  setHTML(slaTrendHint, toggleHtml);
  $("slaTrendToggle")?.addEventListener("click", async () => {
    state.slaTrendMode = state.slaTrendMode === "weekly" ? "daily" : "weekly";
    localStorage.setItem("slaTrendMode", state.slaTrendMode);
    await loadSlaTrend();
  });
}

async function loadSlaAgents() {
  const days = state.slaDays || 30;
  const data = await apiFetch(`/admin/sla/agents?days=${days}`);
  const rows = data.rows || [];

  if (!rows.length) {
    setHTML(slaAgentsBox, `<div class="muted small">Ingen agentdata.</div>`);
    return;
  }

  const html = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Tickets</th>
            <th>Open</th>
            <th>Pending</th>
            <th>Solved</th>
            <th>FR median</th>
            <th>FR %</th>
            <th>RES median</th>
            <th>RES %</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .sort((a, b) => (b.tickets || 0) - (a.tickets || 0))
            .map((r) => {
              const fr = r.firstResponse || {};
              const rs = r.resolution || {};
              const risk = (r.firstRisk || 0) + (r.resRisk || 0);

              return `
                <tr>
                  <td>${escapeHtml(r.username)} <span class="pill ${r.role === "admin" ? "admin" : ""}">${escapeHtml(r.role)}</span></td>
                  <td>${r.tickets ?? 0}</td>
                  <td>${r.open ?? 0}</td>
                  <td>${r.pending ?? 0}</td>
                  <td>${r.solved ?? 0}</td>
                  <td>${escapeHtml(msToPretty(fr.medianMs))}</td>
                  <td>${fr.compliancePct ?? "-"}%</td>
                  <td>${escapeHtml(msToPretty(rs.medianMs))}</td>
                  <td>${rs.compliancePct ?? "-"}%</td>
                  <td><span class="pill">${risk}</span></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="muted small" style="margin-top:8px;">Agents KPI inkluderar även open/pending/solved + risk-count.</div>
  `;

  setHTML(slaAgentsBox, html);
}

async function loadSlaTicketsTable() {
  const days = state.slaDays || 30;
  const data = await apiFetch(`/admin/sla/tickets?days=${days}`);
  let rows = data.rows || [];

  // Apply filters
  const breachedFilter = slaBreachedFilter?.value || "all";
  const breachType = slaBreachTypeFilter?.value || "any";
  const sortMode = slaSortTickets?.value || "newest";

  if (breachedFilter !== "all") {
    rows = rows.filter((r) => {
      const s = r.sla || {};
      const breachedAny = !!s.breachedFirstResponse || !!s.breachedResolution;

      if (breachedFilter === "breachedOnly") return breachedAny;
      if (breachedFilter === "okOnly") return !breachedAny;
      return true;
    });
  }

  if (breachType !== "any") {
    rows = rows.filter((r) => {
      const s = r.sla || {};
      if (breachType === "first") return !!s.breachedFirstResponse;
      if (breachType === "resolution") return !!s.breachedResolution;
      return true;
    });
  }

  if (sortMode === "newest") rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sortMode === "oldest") rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (sortMode === "worstFirst") {
    rows.sort((a, b) => {
      const sa = a.sla || {};
      const sb = b.sla || {};
      const aBad = (sa.breachedFirstResponse ? 1 : 0) + (sa.breachedResolution ? 1 : 0);
      const bBad = (sb.breachedFirstResponse ? 1 : 0) + (sb.breachedResolution ? 1 : 0);
      return bBad - aBad;
    });
  }

  const html = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Status</th>
            <th>Prio</th>
            <th>Skapad</th>
            <th>FR</th>
            <th>RES</th>
            <th>FR kvar</th>
            <th>RES kvar</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 300)
            .map((r) => {
              const s = r.sla || {};
              const frState = s.firstResponseState || "-";
              const resState = s.resolutionState || "-";

              return `
                <tr>
                  <td>
                    <span class="pill">${escapeHtml(String(r.ticketId).slice(-8))}</span>
                    <span class="muted small">${escapeHtml(r.companyId || "")}</span>
                  </td>
                  <td>${escapeHtml(r.status || "-")}</td>
                  <td>${escapeHtml(r.priority || "-")}</td>
                  <td>${fmtDate(r.createdAt)}</td>
                  <td><span class="${pillClassFromState(frState)}">${escapeHtml(frState)}</span></td>
                  <td><span class="${pillClassFromState(resState)}">${escapeHtml(resState)}</span></td>
                  <td>${escapeHtml(msToPretty(s.firstResponseRemainingMs))}</td>
                  <td>${escapeHtml(msToPretty(s.resolutionRemainingMs))}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="muted small" style="margin-top:8px;">
      Visar max 300 tickets (filtrera/period för fler). Totalt efter filter: ${rows.length}
    </div>

    <div class="divider"></div>

    <button class="btn secondary" type="button" id="slaShowBreachedBtn">
      <i class="fa-solid fa-triangle-exclamation"></i> Visa breached-lista
    </button>

    <div id="slaBreachedListBox" style="margin-top:10px;"></div>
  `;

  setHTML(slaTicketsBox, html);

  $("slaShowBreachedBtn")?.addEventListener("click", loadSlaBreachedList);
}

async function loadSlaBreachedList() {
  const box = $("slaBreachedListBox");
  if (!box) return;

  setHTML(box, `<div class="muted small">Laddar breached...</div>`);

  try {
    const days = state.slaDays || 30;
    const data = await apiFetch(`/admin/sla/breached?days=${days}`);
    const rows = data.rows || [];

    if (!rows.length) {
      setHTML(box, `<div class="muted small">Inga breached tickets 🎉</div>`);
      return;
    }

    const html = `
      <div class="panel soft">
        <div class="panelHead">
          <b>Breached tickets</b>
          <span class="muted small" style="margin-left:auto;">${rows.length} st</span>
        </div>
        ${rows
          .slice(0, 120)
          .map((r) => {
            const s = r.sla || {};
            const b1 = s.breachedFirstResponse ? "FR" : "";
            const b2 = s.breachedResolution ? "RES" : "";
            const which = [b1, b2].filter(Boolean).join(" + ") || "Breach";

            return `
              <div class="listItem" style="cursor:default;">
                <div class="listItemTitle">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <span>${escapeHtml(String(r.ticketId).slice(-8))}</span>
                  <span class="pill danger">${escapeHtml(which)}</span>
                  <span class="pill">${escapeHtml(r.priority || "normal")}</span>
                  <span class="pill">${escapeHtml(r.status || "-")}</span>
                </div>
                <div class="muted small" style="margin-top:6px;">
                  ${escapeHtml(r.companyId || "")} • Skapad: ${fmtDate(r.createdAt)}
                </div>
              </div>
            `;
          })
          .join("")}
        ${rows.length > 120 ? `<div class="muted small">Visar 120 av ${rows.length}</div>` : ""}
      </div>
    `;
    setHTML(box, html);
  } catch (e) {
    setHTML(box, `<div class="alert error">${escapeHtml(e.message)}</div>`);
  }
}

async function clearMyStats() {
  try {
    if (!state.user || state.user.role !== "admin") {
      alert("Just nu kan bara admin radera statistik i backend (kräver agentId).");
      return;
    }

    // Admin can clear own stats by agentId
    await apiFetch(`/admin/sla/clear/agent/${state.user.id}`, { method: "POST" });
    await loadSlaDashboard();
  } catch (e) {
    alert(e.message);
  }
}

async function clearAllStats() {
  try {
    if (!state.user || state.user.role !== "admin") throw new Error("Endast admin");
    if (!confirm("Radera ALL SLA-statistik?")) return;
    await apiFetch(`/admin/sla/clear/all`, { method: "POST" });
    await loadSlaDashboard();
  } catch (e) {
    alert(e.message);
  }
}

/* =========================
   DEBUG
========================= */
function refreshDebug() {
  if (!dbgApi) return;
  setText(dbgApi, location.origin);
  setText(dbgLogged, state.user ? "YES" : "NO");
  setText(dbgRole, state.user?.role || "-");
  setText(dbgTicket, state.currentTicketId ? String(state.currentTicketId).slice(-8) : "-");
  // dbgRag is set after chat response
}

/* =========================
   INBOX NOTIF POLLING
========================= */
function startInboxNotifPolling() {
  // light polling to refresh notif dot
  setInterval(async () => {
    if (!state.user || !["admin", "agent"].includes(state.user.role)) return;
    try {
      const data = await apiFetch(`/admin/tickets?companyId=${encodeURIComponent(state.companyId)}`);
      state.inboxTickets = data || [];
      updateInboxNotifDot();
    } catch {
      // ignore
    }
  }, 15000);
}

/* =========================
   UTIL
========================= */
function escapeHtml(str) {
  const s = String(str ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}