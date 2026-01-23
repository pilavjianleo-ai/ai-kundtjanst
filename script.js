/* ==========================================================
   AI Kundtjänst - script.js
   Matches:
   - index.html IDs
   - server.js routes you pasted
   ========================================================== */

const API_BASE = ""; // same origin (Render / localhost). Keep empty.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* =====================
   DOM refs
===================== */
// Sidebar
const roleBadge = $("#roleBadge");
const categorySelect = $("#categorySelect");

const openChatViewBtn = $("#openChatView");
const openMyTicketsViewBtn = $("#openMyTicketsView");
const openInboxViewBtn = $("#openInboxView");
const openSlaViewBtn = $("#openSlaView");
const openAdminViewBtn = $("#openAdminView");
const openSettingsViewBtn = $("#openSettingsView");

const inboxNotifDot = $("#inboxNotifDot");

const themeToggleBtn = $("#themeToggle");
const logoutBtn = $("#logoutBtn");
const toggleDebugBtn = $("#toggleDebugBtn");

const debugPanel = $("#debugPanel");
const dbgApi = $("#dbgApi");
const dbgLogged = $("#dbgLogged");
const dbgRole = $("#dbgRole");
const dbgTicket = $("#dbgTicket");
const dbgRag = $("#dbgRag");

// Views
const authView = $("#authView");
const chatView = $("#chatView");
const myTicketsView = $("#myTicketsView");
const inboxView = $("#inboxView");
const adminView = $("#adminView");
const settingsView = $("#settingsView");
const slaView = $("#slaView");

// Auth
const usernameInput = $("#username");
const emailInput = $("#email");
const passwordInput = $("#password");
const togglePassBtn = $("#togglePassBtn");
const loginBtn = $("#loginBtn");
const registerBtn = $("#registerBtn");
const openForgotBtn = $("#openForgotBtn");
const authMessage = $("#authMessage");

const forgotCard = $("#forgotCard");
const forgotEmail = $("#forgotEmail");
const sendForgotBtn = $("#sendForgotBtn");
const closeForgotBtn = $("#closeForgotBtn");
const forgotMsg = $("#forgotMsg");

const resetCard = $("#resetCard");
const resetNewPass = $("#resetNewPass");
const toggleResetPassBtn = $("#toggleResetPassBtn");
const resetSaveBtn = $("#resetSaveBtn");
const resetMsg = $("#resetMsg");

// Chat
const chatTitle = $("#chatTitle");
const chatSubtitle = $("#chatSubtitle");
const newTicketBtn = $("#newTicketBtn");
const clearChatBtn = $("#clearChatBtn");
const exportChatBtn = $("#exportChatBtn");

const messagesBox = $("#messages");
const messageInput = $("#messageInput");
const sendBtn = $("#sendBtn");

const fbUpBtn = $("#fbUp");
const fbDownBtn = $("#fbDown");
const fbMsg = $("#fbMsg");

// My tickets
const myTicketsRefreshBtn = $("#myTicketsRefreshBtn");
const myTicketsList = $("#myTicketsList");
const myTicketsHint = $("#myTicketsHint");
const myTicketDetails = $("#myTicketDetails");
const myTicketReplyText = $("#myTicketReplyText");
const myTicketReplyBtn = $("#myTicketReplyBtn");
const myTicketReplyMsg = $("#myTicketReplyMsg");

// Inbox (Agent/Admin)
const inboxRefreshBtn = $("#inboxRefreshBtn");
const solveAllBtn = $("#solveAllBtn");
const removeSolvedBtn = $("#removeSolvedBtn");

const inboxStatusFilter = $("#inboxStatusFilter");
const inboxCategoryFilter = $("#inboxCategoryFilter");
const inboxSearchInput = $("#inboxSearchInput");

const inboxMsg = $("#inboxMsg");
const inboxTicketsList = $("#inboxTicketsList");

const inboxTicketMsg = $("#inboxTicketMsg");
const setStatusOpen = $("#setStatusOpen");
const setStatusPending = $("#setStatusPending");
const setStatusSolved = $("#setStatusSolved");

const ticketPrioritySelect = $("#ticketPrioritySelect");
const setPriorityBtn = $("#setPriorityBtn");

const ticketDetails = $("#ticketDetails");

const agentReplyTextInbox = $("#agentReplyTextInbox");
const sendAgentReplyInboxBtn = $("#sendAgentReplyInboxBtn");

const internalNoteText = $("#internalNoteText");
const saveInternalNoteBtn = $("#saveInternalNoteBtn");
const internalNotesList = $("#internalNotesList");
const clearInternalNotesBtn = $("#clearInternalNotesBtn");

const assignUserSelect = $("#assignUserSelect");
const assignTicketBtn = $("#assignTicketBtn");

const deleteTicketBtn = $("#deleteTicketBtn");

// Admin dashboard
const adminExportAllBtn = $("#adminExportAllBtn");
const trainingExportBtn = $("#trainingExportBtn");
const tabBtns = $$(".tabBtn");
const tabUsers = $("#tabUsers");
const tabKB = $("#tabKB");
const tabCats = $("#tabCats");

const adminUsersRefreshBtn = $("#adminUsersRefreshBtn");
const adminUsersMsg = $("#adminUsersMsg");
const adminUsersList = $("#adminUsersList");

// KB manager
const kbCategorySelect = $("#kbCategorySelect");
const kbRefreshBtn = $("#kbRefreshBtn");
const kbExportBtn = $("#kbExportBtn");
const kbMsg = $("#kbMsg");

const kbTextTitle = $("#kbTextTitle");
const kbTextContent = $("#kbTextContent");
const kbUploadTextBtn = $("#kbUploadTextBtn");

const kbUrlInput = $("#kbUrlInput");
const kbUploadUrlBtn = $("#kbUploadUrlBtn");

const kbPdfFile = $("#kbPdfFile");
const kbUploadPdfBtn = $("#kbUploadPdfBtn");

const kbList = $("#kbList");

// Categories manager
const catsRefreshBtn = $("#catsRefreshBtn");
const catsMsg = $("#catsMsg");
const newCatKey = $("#newCatKey");
const newCatName = $("#newCatName");
const newCatPrompt = $("#newCatPrompt");
const createCatBtn = $("#createCatBtn");
const catsList = $("#catsList");

// Settings view
const newUsernameInput = $("#newUsernameInput");
const changeUsernameBtn = $("#changeUsernameBtn");
const currentPassInput = $("#currentPassInput");
const newPassInput = $("#newPassInput");
const changePasswordBtn = $("#changePasswordBtn");
const settingsMsg = $("#settingsMsg");

// SLA view
const slaDaysSelect = $("#slaDaysSelect");
const slaCompareMode = $("#slaCompareMode");
const slaRefreshBtn = $("#slaRefreshBtn");
const slaExportCsvBtn = $("#slaExportCsvBtn");
const slaClearMyStatsBtn = $("#slaClearMyStatsBtn");
const slaClearAllStatsBtn = $("#slaClearAllStatsBtn");

const slaOverviewBox = $("#slaOverviewBox");
const slaTrendChart = $("#slaTrendChart");
const slaTrendHint = $("#slaTrendHint");
const slaAgentsBox = $("#slaAgentsBox");
const slaTicketsBox = $("#slaTicketsBox");

const slaBreachedFilter = $("#slaBreachedFilter");
const slaBreachTypeFilter = $("#slaBreachTypeFilter");
const slaSortTickets = $("#slaSortTickets");

/* =====================
   App State
===================== */
let token = localStorage.getItem("kt_token") || "";
let me = null;

let activeCompanyId = localStorage.getItem("kt_companyId") || "demo";

// Chat state
let conversation = []; // [{role, content}]
let activeTicketId = localStorage.getItem("kt_ticketId") || "";
let activeTicketPublicId = localStorage.getItem("kt_ticketPublicId") || "";

// My tickets state
let selectedMyTicketId = "";

// Inbox state
let inboxSelectedTicketId = "";

// Debug
let debugOn = localStorage.getItem("kt_debug") === "1";

// SLA chart instance (Chart.js-like) => We'll do a tiny native canvas draw.
let slaTrendData = null;

/* =====================
   Utils
===================== */
function setActiveMenu(btn) {
  $$(".menuBtn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

function showView(viewEl) {
  [authView, chatView, myTicketsView, inboxView, adminView, settingsView, slaView].forEach((v) => {
    if (v) v.style.display = "none";
  });
  if (viewEl) viewEl.style.display = "block";
}

function showAlert(el, text, type = "error") {
  if (!el) return;
  el.style.display = "block";
  el.textContent = text;
  el.classList.toggle("error", type === "error");
}

function hideAlert(el) {
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function prettyDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function msToPretty(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
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

function pillStatus(status) {
  if (status === "solved") return `<span class="pill ok"><i class="fa-solid fa-check"></i> Solved</span>`;
  if (status === "pending") return `<span class="pill warn"><i class="fa-solid fa-hourglass-half"></i> Pending</span>`;
  return `<span class="pill"><i class="fa-solid fa-circle"></i> Open</span>`;
}

function pillPriority(priority) {
  if (priority === "high") return `<span class="pill danger"><i class="fa-solid fa-bolt"></i> High</span>`;
  if (priority === "low") return `<span class="pill"><i class="fa-solid fa-leaf"></i> Low</span>`;
  return `<span class="pill"><i class="fa-solid fa-flag"></i> Normal</span>`;
}

function pillBreach(t) {
  const b1 = !!t?.sla?.breachedFirstResponse;
  const b2 = !!t?.sla?.breachedResolution;
  if (!b1 && !b2) return `<span class="pill ok"><i class="fa-solid fa-shield"></i> OK</span>`;
  if (b1 && b2) return `<span class="pill danger"><i class="fa-solid fa-triangle-exclamation"></i> 2 breaches</span>`;
  return `<span class="pill warn"><i class="fa-solid fa-triangle-exclamation"></i> Breach</span>`;
}

function viewResetAllMessages() {
  messagesBox.innerHTML = "";
}

function appendChatMessage(role, content) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "user" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = role === "user" ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-robot"></i>`;

  const bubbleWrap = document.createElement("div");

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content || "";

  const meta = document.createElement("div");
  meta.className = "msgMeta";
  meta.textContent = new Date().toLocaleTimeString();

  bubbleWrap.appendChild(bubble);
  bubbleWrap.appendChild(meta);

  wrap.appendChild(avatar);
  wrap.appendChild(bubbleWrap);

  messagesBox.appendChild(wrap);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (token) headers.Authorization = `Bearer ${token}`;
  headers["Content-Type"] = headers["Content-Type"] || "application/json";

  dbgApi && (dbgApi.textContent = path);

  const res = await fetch(API_BASE + path, { ...opts, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function setTheme(next) {
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("kt_theme", next);
}

function loadTheme() {
  const t = localStorage.getItem("kt_theme") || "dark";
  setTheme(t);
}

function toggleTheme() {
  const cur = document.body.getAttribute("data-theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
}

function setDebug(on) {
  debugOn = !!on;
  localStorage.setItem("kt_debug", debugOn ? "1" : "0");
  debugPanel.style.display = debugOn ? "block" : "none";
}

function updateDebug() {
  dbgLogged && (dbgLogged.textContent = token ? "JA" : "NEJ");
  dbgRole && (dbgRole.textContent = me?.role || "-");
  dbgTicket && (dbgTicket.textContent = activeTicketPublicId || activeTicketId || "-");
  dbgRag && (dbgRag.textContent = "-");
}

/* =====================
   Auth + boot
===================== */
function setRoleUI() {
  const adminOnlyEls = $$(".adminOnly");
  const isAgentOrAdmin = me && (me.role === "admin" || me.role === "agent");
  const isAdmin = me && me.role === "admin";

  adminOnlyEls.forEach((el) => {
    // inbox, SLA, admin view buttons have class adminOnly
    // but we show admin view only for admin
    if (el === openAdminViewBtn) {
      el.style.display = isAdmin ? "flex" : "none";
    } else {
      el.style.display = isAgentOrAdmin ? "flex" : "none";
    }
  });

  openSettingsViewBtn.style.display = me ? "flex" : "none";
  logoutBtn.style.display = me ? "flex" : "none";

  if (!me) {
    roleBadge.textContent = "Inte inloggad";
  } else {
    roleBadge.textContent = `${me.username} • ${me.role}`;
  }

  // SLA clear all stats only for admin
  if (slaClearAllStatsBtn) slaClearAllStatsBtn.style.display = isAdmin ? "inline-flex" : "none";
}

async function loadMe() {
  if (!token) {
    me = null;
    setRoleUI();
    updateDebug();
    return;
  }
  try {
    me = await api("/me", { method: "GET" });
    setRoleUI();
    updateDebug();
  } catch (e) {
    // token invalid -> logout
    token = "";
    localStorage.removeItem("kt_token");
    me = null;
    setRoleUI();
    updateDebug();
  }
}

async function loadCategories() {
  try {
    const cats = await fetch(API_BASE + "/categories").then((r) => r.json());
    if (!Array.isArray(cats)) return;

    categorySelect.innerHTML = "";
    kbCategorySelect.innerHTML = "";

    inboxCategoryFilter.innerHTML = `<option value="">Alla kategorier</option>`;

    for (const c of cats) {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.key} — ${c.name || c.key}`;
      categorySelect.appendChild(opt);

      const opt2 = document.createElement("option");
      opt2.value = c.key;
      opt2.textContent = `${c.key} — ${c.name || c.key}`;
      kbCategorySelect.appendChild(opt2);

      const opt3 = document.createElement("option");
      opt3.value = c.key;
      opt3.textContent = `${c.key} — ${c.name || c.key}`;
      inboxCategoryFilter.appendChild(opt3);
    }

    categorySelect.value = activeCompanyId;
    kbCategorySelect.value = activeCompanyId;
  } catch {
    // ignore
  }
}

function setCompany(companyId) {
  activeCompanyId = companyId || "demo";
  localStorage.setItem("kt_companyId", activeCompanyId);

  chatTitle.textContent = `AI Kundtjänst • ${activeCompanyId}`;
  chatSubtitle.textContent = "Ställ en fråga så hjälper jag dig direkt.";

  // also sync KB select if exists
  if (kbCategorySelect) kbCategorySelect.value = activeCompanyId;
}

/* =====================
   Reset token flow
===================== */
function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function showForgotUI(show) {
  forgotCard.style.display = show ? "block" : "none";
  resetCard.style.display = "none";
}

function showResetUI(show) {
  resetCard.style.display = show ? "block" : "none";
  forgotCard.style.display = "none";
}

async function checkResetTokenInUrl() {
  const resetToken = getQueryParam("resetToken");
  if (!resetToken) return;
  // show reset card directly
  showResetUI(true);
  showForgotUI(false);
  authMessage.style.display = "none";

  resetSaveBtn.onclick = async () => {
    hideAlert(resetMsg);
    const newPassword = (resetNewPass.value || "").trim();
    if (newPassword.length < 6) return showAlert(resetMsg, "Nytt lösenord måste vara minst 6 tecken");
    try {
      const data = await fetch(API_BASE + "/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword }),
      }).then((r) => r.json().then((d) => ({ ok: r.ok, d })));

      if (!data.ok) throw new Error(data.d?.error || "Serverfel");

      showAlert(resetMsg, data.d?.message || "Lösenord återställt ✅", "ok");
      // remove resetToken from url (clean)
      window.history.replaceState({}, document.title, window.location.pathname);
      showResetUI(false);
    } catch (e) {
      showAlert(resetMsg, e.message || "Serverfel");
    }
  };
}

/* =====================
   Chat
===================== */
function resetTicketContext() {
  activeTicketId = "";
  activeTicketPublicId = "";
  localStorage.removeItem("kt_ticketId");
  localStorage.removeItem("kt_ticketPublicId");
  conversation = [];
  viewResetAllMessages();
  appendChatMessage("assistant", "Nytt ärende startat ✅ Skriv din fråga så hjälper jag dig.");
  updateDebug();
}

async function sendChatMessage() {
  hideAlert(authMessage);
  const text = (messageInput.value || "").trim();
  if (!text) return;

  messageInput.value = "";
  appendChatMessage("user", text);

  conversation.push({ role: "user", content: text });

  // cap local conversation to prevent huge payload
  if (conversation.length > 30) conversation = conversation.slice(-30);

  // Build payload
  const payload = {
    companyId: activeCompanyId,
    conversation,
  };

  // Only send ticketId if we have it
  if (activeTicketId) payload.ticketId = activeTicketId;

  sendBtn.disabled = true;
  try {
    const data = await api("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const reply = data.reply || "Inget svar.";
    appendChatMessage("assistant", reply);

    conversation.push({ role: "assistant", content: reply });

    // Update ticket context
    if (data.ticketId) {
      activeTicketId = data.ticketId;
      localStorage.setItem("kt_ticketId", activeTicketId);
    }
    if (data.ticketPublicId) {
      activeTicketPublicId = data.ticketPublicId;
      localStorage.setItem("kt_ticketPublicId", activeTicketPublicId);
    }

    // Debug RAG
    dbgRag && (dbgRag.textContent = data.ragUsed ? "JA" : "NEJ");
    updateDebug();
  } catch (e) {
    appendChatMessage("assistant", `❌ Fel: ${e.message}`);
  } finally {
    sendBtn.disabled = false;
  }
}

function exportChat() {
  const rows = conversation.map((m) => `${m.role.toUpperCase()}: ${m.content}`);
  const content = rows.join("\n\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat_export_${activeCompanyId}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
}

async function sendFeedback(type) {
  if (!me) return;
  fbMsg.textContent = "Sparar...";
  try {
    await api("/feedback", {
      method: "POST",
      body: JSON.stringify({ type, companyId: activeCompanyId }),
    });
    fbMsg.textContent = "Tack! ✅";
    setTimeout(() => (fbMsg.textContent = ""), 1200);
  } catch (e) {
    fbMsg.textContent = `Fel: ${e.message}`;
  }
}

/* =====================
   My tickets
===================== */
function renderMyTickets(list) {
  myTicketsList.innerHTML = "";
  const arr = Array.isArray(list) ? list : [];
  myTicketsHint.textContent = arr.length ? `${arr.length} st` : "Inga";

  for (const t of arr) {
    const div = document.createElement("div");
    div.className = `listItem ${String(t._id) === String(selectedMyTicketId) ? "selected" : ""}`;

    div.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-ticket"></i>
        <span>${escapeHtml(t.ticketPublicId || t._id)}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center;">
          ${pillStatus(t.status)}
          ${pillPriority(t.priority)}
          ${pillBreach(t)}
        </span>
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${escapeHtml(t.title || "(utan titel)")} • ${escapeHtml(t.companyId || "")}<br/>
        Senast: ${prettyDate(t.lastActivityAt)}
      </div>
    `;

    div.onclick = async () => {
      selectedMyTicketId = t._id;
      await loadMyTicketDetails(selectedMyTicketId);
      // rerender selection
      renderMyTickets(arr);
    };

    myTicketsList.appendChild(div);
  }
}

function renderTicketDetailsBox(t) {
  if (!t) {
    myTicketDetails.innerHTML = `Välj ett ärende för att se detaljer.`;
    return;
  }

  const msgs = Array.isArray(t.messages) ? t.messages : [];

  myTicketDetails.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <b>${escapeHtml(t.ticketPublicId || t._id)}</b>
      ${pillStatus(t.status)}
      ${pillPriority(t.priority)}
      ${pillBreach(t)}
      <span class="muted small" style="margin-left:auto;">${escapeHtml(t.companyId || "")}</span>
    </div>
    <div class="divider"></div>
    <div class="muted small">
      <div><b>Titel:</b> ${escapeHtml(t.title || "")}</div>
      <div><b>Skapad:</b> ${prettyDate(t.createdAt)}</div>
      <div><b>Senast:</b> ${prettyDate(t.lastActivityAt)}</div>
    </div>
    <div class="divider"></div>
    <div>
      ${msgs
        .map((m) => {
          const r = m.role || "user";
          const cls = r === "assistant" ? "ai" : r;
          return `
            <div class="ticketMsg ${cls}">
              <div class="ticketMsgHead">
                <span>${escapeHtml(r)}</span>
                <span>${prettyDate(m.timestamp)}</span>
              </div>
              <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

async function loadMyTickets() {
  hideAlert(myTicketReplyMsg);
  try {
    const tickets = await api("/my/tickets", { method: "GET" });
    renderMyTickets(tickets);

    // auto select first if none selected
    if (!selectedMyTicketId && tickets?.length) {
      selectedMyTicketId = tickets[0]._id;
      await loadMyTicketDetails(selectedMyTicketId);
      renderMyTickets(tickets);
    }
  } catch (e) {
    myTicketsList.innerHTML = `<div class="muted small">Fel: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadMyTicketDetails(ticketId) {
  hideAlert(myTicketReplyMsg);
  if (!ticketId) return renderTicketDetailsBox(null);
  try {
    const t = await api(`/my/tickets/${ticketId}`, { method: "GET" });
    renderTicketDetailsBox(t);
  } catch (e) {
    myTicketDetails.innerHTML = `<div class="muted small">Fel: ${escapeHtml(e.message)}</div>`;
  }
}

async function replyMyTicket() {
  hideAlert(myTicketReplyMsg);
  const content = (myTicketReplyText.value || "").trim();
  if (!selectedMyTicketId) return showAlert(myTicketReplyMsg, "Välj ett ärende först");
  if (!content) return showAlert(myTicketReplyMsg, "Skriv ett meddelande");

  myTicketReplyBtn.disabled = true;
  try {
    const r = await api(`/my/tickets/${selectedMyTicketId}/reply`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });

    myTicketReplyText.value = "";
    showAlert(myTicketReplyMsg, r.message || "Skickat ✅", "ok");
    await loadMyTicketDetails(selectedMyTicketId);
    await loadMyTickets();
  } catch (e) {
    showAlert(myTicketReplyMsg, e.message || "Serverfel");
  } finally {
    myTicketReplyBtn.disabled = false;
  }
}

/* =====================
   Inbox (Agent/Admin)
===================== */
function setInboxMsg(text, isError = true) {
  if (!text) return hideAlert(inboxMsg);
  showAlert(inboxMsg, text, isError ? "error" : "ok");
}

function renderInboxTickets(list) {
  const arr = Array.isArray(list) ? list : [];
  inboxTicketsList.innerHTML = "";

  const statusVal = (inboxStatusFilter?.value || "").trim();
  const catVal = (inboxCategoryFilter?.value || "").trim();
  const q = (inboxSearchInput?.value || "").trim().toLowerCase();

  const filtered = arr.filter((t) => {
    if (statusVal && t.status !== statusVal) return false;
    if (catVal && t.companyId !== catVal) return false;
    if (q) {
      const hay = `${t.ticketPublicId || ""} ${t._id || ""} ${t.title || ""} ${t.companyId || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // notif dot
  const hasOpen = filtered.some((t) => t.status === "open");
  inboxNotifDot.style.display = hasOpen ? "inline-block" : "none";
  openInboxViewBtn.classList.toggle("hasNotif", hasOpen);

  for (const t of filtered) {
    const div = document.createElement("div");
    div.className = `listItem ${String(t._id) === String(inboxSelectedTicketId) ? "selected" : ""}`;

    const breached = t?.sla?.breachedFirstResponse || t?.sla?.breachedResolution;
    if (breached) div.classList.add("categoryNotif");

    div.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-inbox"></i>
        <span>${escapeHtml(t.ticketPublicId || t._id)}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center;">
          ${pillStatus(t.status)}
          ${pillPriority(t.priority)}
          ${pillBreach(t)}
        </span>
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${escapeHtml(t.title || "(utan titel)")} • ${escapeHtml(t.companyId || "")}<br/>
        Senast: ${prettyDate(t.lastActivityAt)}
      </div>
    `;

    div.onclick = async () => {
      inboxSelectedTicketId = t._id;
      await loadInboxTicketDetails(inboxSelectedTicketId);
      renderInboxTickets(arr);
    };

    inboxTicketsList.appendChild(div);
  }

  if (!filtered.length) {
    inboxTicketsList.innerHTML = `<div class="muted small">Inga tickets matchar filter.</div>`;
  }
}

function renderInternalNotes(t) {
  const notes = Array.isArray(t?.internalNotes) ? t.internalNotes : [];
  if (!notes.length) {
    internalNotesList.innerHTML = `<div class="muted small">Inga interna notes.</div>`;
    return;
  }

  internalNotesList.innerHTML = `
    <div class="noteList">
      ${notes
        .map((n) => {
          return `
            <div class="noteItem">
              <div class="noteMeta">
                ${prettyDate(n.createdAt)}
                <button class="actionBtn" data-action="deleteNote" data-noteid="${escapeHtml(n._id)}" style="float:right;">
                  <i class="fa-solid fa-trash"></i> Ta bort
                </button>
              </div>
              <div class="noteText">${escapeHtml(n.content)}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderInboxTicketDetails(t) {
  if (!t) {
    ticketDetails.innerHTML = `Välj en ticket.`;
    internalNotesList.innerHTML = "";
    return;
  }

  // sync priority dropdown
  ticketPrioritySelect.value = t.priority || "normal";

  const msgs = Array.isArray(t.messages) ? t.messages : [];

  ticketDetails.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <b>${escapeHtml(t.ticketPublicId || t._id)}</b>
      ${pillStatus(t.status)}
      ${pillPriority(t.priority)}
      ${pillBreach(t)}
      <span class="muted small" style="margin-left:auto;">${escapeHtml(t.companyId || "")}</span>
    </div>

    <div class="divider"></div>

    <div class="muted small">
      <div><b>Titel:</b> ${escapeHtml(t.title || "")}</div>
      <div><b>Skapad:</b> ${prettyDate(t.createdAt)}</div>
      <div><b>Senast:</b> ${prettyDate(t.lastActivityAt)}</div>
      <div><b>Assigned:</b> ${escapeHtml(t.assignedToUserId || "")}</div>
    </div>

    <div class="divider"></div>

    <div>
      ${msgs
        .map((m) => {
          const r = m.role || "user";
          const cls = r === "assistant" ? "ai" : r;
          return `
            <div class="ticketMsg ${cls}">
              <div class="ticketMsgHead">
                <span>${escapeHtml(r)}</span>
                <span>${prettyDate(m.timestamp)}</span>
              </div>
              <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
            </div>
          `;
        })
        .join("")}
    </div>

    <div class="divider"></div>

    <div class="muted small">
      <b>SLA:</b><br/>
      First response: ${escapeHtml(t?.sla?.pretty?.firstResponse || "")}
      (remaining: ${escapeHtml(t?.sla?.pretty?.firstRemaining || "")})
      • Breach: ${t?.sla?.breachedFirstResponse ? "YES" : "NO"}<br/>
      Resolution: ${escapeHtml(t?.sla?.pretty?.resolution || "")}
      (remaining: ${escapeHtml(t?.sla?.pretty?.resolutionRemaining || "")})
      • Breach: ${t?.sla?.breachedResolution ? "YES" : "NO"}<br/>
      Pending total: ${escapeHtml(t?.sla?.pretty?.pendingTotal || "")}<br/>
      Effective running: ${escapeHtml(t?.sla?.pretty?.effectiveRunning || "")}
    </div>
  `;

  renderInternalNotes(t);
}

let _inboxCache = [];
async function loadInboxTickets() {
  setInboxMsg("");
  try {
    const tickets = await api("/admin/tickets", { method: "GET" });
    _inboxCache = tickets || [];
    renderInboxTickets(_inboxCache);

    // auto select first if none
    if (!inboxSelectedTicketId && tickets?.length) {
      inboxSelectedTicketId = tickets[0]._id;
      await loadInboxTicketDetails(inboxSelectedTicketId);
      renderInboxTickets(_inboxCache);
    }
  } catch (e) {
    setInboxMsg(e.message || "Serverfel");
  }
}

async function loadInboxTicketDetails(ticketId) {
  hideAlert(inboxTicketMsg);
  if (!ticketId) return renderInboxTicketDetails(null);

  try {
    const t = await api(`/admin/tickets/${ticketId}`, { method: "GET" });
    renderInboxTicketDetails(t);
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  }
}

async function setTicketStatus(status) {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return showAlert(inboxTicketMsg, "Välj en ticket först");
  try {
    await api(`/admin/tickets/${inboxSelectedTicketId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    await loadInboxTicketDetails(inboxSelectedTicketId);
    await loadInboxTickets();
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  }
}

async function setTicketPriority() {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return showAlert(inboxTicketMsg, "Välj en ticket först");

  try {
    await api(`/admin/tickets/${inboxSelectedTicketId}/priority`, {
      method: "POST",
      body: JSON.stringify({ priority: ticketPrioritySelect.value }),
    });
    await loadInboxTicketDetails(inboxSelectedTicketId);
    await loadInboxTickets();
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  }
}

async function sendAgentReply() {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return showAlert(inboxTicketMsg, "Välj en ticket först");
  const content = (agentReplyTextInbox.value || "").trim();
  if (!content) return showAlert(inboxTicketMsg, "Skriv ett svar först");

  sendAgentReplyInboxBtn.disabled = true;
  try {
    await api(`/admin/tickets/${inboxSelectedTicketId}/agent-reply`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    agentReplyTextInbox.value = "";
    await loadInboxTicketDetails(inboxSelectedTicketId);
    await loadInboxTickets();
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  } finally {
    sendAgentReplyInboxBtn.disabled = false;
  }
}

async function saveInternalNote() {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return showAlert(inboxTicketMsg, "Välj en ticket först");
  const content = (internalNoteText.value || "").trim();
  if (!content) return showAlert(inboxTicketMsg, "Skriv en note först");

  saveInternalNoteBtn.disabled = true;
  try {
    await api(`/admin/tickets/${inboxSelectedTicketId}/internal-note`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    internalNoteText.value = "";
    await loadInboxTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  } finally {
    saveInternalNoteBtn.disabled = false;
  }
}

async function deleteSingleNote(noteId) {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return;
  try {
    // requires admin (per your server.js)
    await api(`/admin/tickets/${inboxSelectedTicketId}/internal-note/${noteId}`, {
      method: "DELETE",
    });
    await loadInboxTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  }
}

async function clearAllNotes() {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return showAlert(inboxTicketMsg, "Välj en ticket först");

  try {
    await api(`/admin/tickets/${inboxSelectedTicketId}/internal-notes`, {
      method: "DELETE",
    });
    await loadInboxTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  }
}

async function assignTicket() {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return showAlert(inboxTicketMsg, "Välj en ticket först");
  const userId = assignUserSelect.value;
  if (!userId) return showAlert(inboxTicketMsg, "Välj en agent");

  try {
    await api(`/admin/tickets/${inboxSelectedTicketId}/assign`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    await loadInboxTicketDetails(inboxSelectedTicketId);
    await loadInboxTickets();
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  }
}

async function deleteTicket() {
  hideAlert(inboxTicketMsg);
  if (!inboxSelectedTicketId) return showAlert(inboxTicketMsg, "Välj en ticket först");

  if (!confirm("Ta bort ticket permanent?")) return;

  try {
    await api(`/admin/tickets/${inboxSelectedTicketId}`, { method: "DELETE" });
    inboxSelectedTicketId = "";
    renderInboxTicketDetails(null);
    await loadInboxTickets();
  } catch (e) {
    showAlert(inboxTicketMsg, e.message || "Serverfel");
  }
}

async function loadAgentsForAssign() {
  if (!me || (me.role !== "admin" && me.role !== "agent")) return;
  try {
    const users = await api("/admin/agents", { method: "GET" });
    assignUserSelect.innerHTML = `<option value="">Välj agent...</option>`;
    for (const u of users) {
      const opt = document.createElement("option");
      opt.value = u._id;
      opt.textContent = `${u.username} (${u.role})`;
      assignUserSelect.appendChild(opt);
    }
  } catch {
    // ignore
  }
}

/* =====================
   Admin: users panel
===================== */
function renderUsers(users) {
  adminUsersList.innerHTML = "";
  const arr = Array.isArray(users) ? users : [];
  if (!arr.length) {
    adminUsersList.innerHTML = `<div class="muted small">Inga användare.</div>`;
    return;
  }

  for (const u of arr) {
    const div = document.createElement("div");
    div.className = "listItem";

    div.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-user"></i>
        <span>${escapeHtml(u.username)}</span>
        <span style="margin-left:auto;display:flex;gap:8px;align-items:center;">
          <span class="pill admin"><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(u.role)}</span>
        </span>
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${escapeHtml(u.email || "")}<br/>
        Skapad: ${prettyDate(u.createdAt)}
      </div>

      <div class="bubbleActions" style="margin-top:10px;flex-wrap:wrap;">
        <button class="actionBtn" data-action="role" data-userid="${escapeHtml(u._id)}" data-role="user">User</button>
        <button class="actionBtn" data-action="role" data-userid="${escapeHtml(u._id)}" data-role="agent">Agent</button>
        <button class="actionBtn" data-action="role" data-userid="${escapeHtml(u._id)}" data-role="admin">Admin</button>
        <button class="actionBtn" data-action="deleteUser" data-userid="${escapeHtml(u._id)}">
          <i class="fa-solid fa-trash"></i> Ta bort
        </button>
      </div>
    `;

    adminUsersList.appendChild(div);
  }
}

async function loadUsers() {
  hideAlert(adminUsersMsg);
  try {
    const users = await api("/admin/users", { method: "GET" });
    renderUsers(users);
  } catch (e) {
    showAlert(adminUsersMsg, e.message || "Serverfel");
  }
}

/* =====================
   Admin: KB manager
===================== */
function renderKbList(items) {
  kbList.innerHTML = "";
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) {
    kbList.innerHTML = `<div class="muted small">Ingen KB data.</div>`;
    return;
  }

  for (const it of arr) {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTitle">
        <i class="fa-solid fa-database"></i>
        <span>${escapeHtml(it.title || it.sourceRef || it.sourceType)}</span>
        <span style="margin-left:auto;" class="muted small">${escapeHtml(it.sourceType)}</span>
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${escapeHtml(it.sourceRef || "")}<br/>
        Chunk #${it.chunkIndex} • embeddings: ${it.embeddingOk ? "OK" : "NO"} • ${prettyDate(it.createdAt)}
      </div>
    `;
    kbList.appendChild(div);
  }
}

async function kbRefresh() {
  hideAlert(kbMsg);
  const companyId = kbCategorySelect.value || "demo";
  try {
    const items = await api(`/kb/list/${companyId}`, { method: "GET" });
    renderKbList(items);
  } catch (e) {
    showAlert(kbMsg, e.message || "Serverfel");
  }
}

async function kbUploadText() {
  hideAlert(kbMsg);
  const companyId = kbCategorySelect.value || "demo";
  const title = (kbTextTitle.value || "").trim();
  const content = (kbTextContent.value || "").trim();
  if (!content) return showAlert(kbMsg, "Klistra in text först");

  kbUploadTextBtn.disabled = true;
  try {
    const r = await api("/kb/upload-text", {
      method: "POST",
      body: JSON.stringify({ companyId, title, content }),
    });
    showAlert(kbMsg, r.message || "Uppladdat ✅", "ok");
    kbTextContent.value = "";
    await kbRefresh();
  } catch (e) {
    showAlert(kbMsg, e.message || "Serverfel");
  } finally {
    kbUploadTextBtn.disabled = false;
  }
}

async function kbUploadUrl() {
  hideAlert(kbMsg);
  const companyId = kbCategorySelect.value || "demo";
  const url = (kbUrlInput.value || "").trim();
  if (!url) return showAlert(kbMsg, "Skriv en URL först");

  kbUploadUrlBtn.disabled = true;
  try {
    const r = await api("/kb/upload-url", {
      method: "POST",
      body: JSON.stringify({ companyId, url }),
    });
    showAlert(kbMsg, r.message || "Uppladdat ✅", "ok");
    kbUrlInput.value = "";
    await kbRefresh();
  } catch (e) {
    showAlert(kbMsg, e.message || "Serverfel");
  } finally {
    kbUploadUrlBtn.disabled = false;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      // "data:application/pdf;base64,...."
      const base64 = s.split(",")[1] || "";
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function kbUploadPdf() {
  hideAlert(kbMsg);
  const companyId = kbCategorySelect.value || "demo";
  const f = kbPdfFile.files?.[0];
  if (!f) return showAlert(kbMsg, "Välj en PDF först");

  kbUploadPdfBtn.disabled = true;
  try {
    const base64 = await fileToBase64(f);
    const r = await api("/kb/upload-pdf", {
      method: "POST",
      body: JSON.stringify({ companyId, filename: f.name, base64 }),
    });
    showAlert(kbMsg, r.message || "Uppladdat ✅", "ok");
    kbPdfFile.value = "";
    await kbRefresh();
  } catch (e) {
    showAlert(kbMsg, e.message || "Serverfel");
  } finally {
    kbUploadPdfBtn.disabled = false;
  }
}

function kbExport() {
  const companyId = kbCategorySelect.value || "demo";
  // Browser download with token header isn't possible directly.
  // We'll fetch and create blob with Authorization.
  (async () => {
    hideAlert(kbMsg);
    try {
      const res = await fetch(API_BASE + `/export/kb/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kb_${companyId}.json`;
      a.click();
    } catch (e) {
      showAlert(kbMsg, e.message || "Export misslyckades");
    }
  })();
}

/* =====================
   Admin: Categories manager
===================== */
async function catsRefresh() {
  hideAlert(catsMsg);
  try {
    const cats = await fetch(API_BASE + "/categories").then((r) => r.json());
    catsList.innerHTML = "";
    if (!Array.isArray(cats) || !cats.length) {
      catsList.innerHTML = `<div class="muted small">Inga kategorier.</div>`;
      return;
    }

    for (const c of cats) {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          <i class="fa-solid fa-layer-group"></i>
          <span>${escapeHtml(c.key)}</span>
          <span class="muted small" style="margin-left:auto;">${escapeHtml(c.name || "")}</span>
        </div>
        <div class="muted small" style="margin-top:6px;">
          <b>Tone:</b> ${escapeHtml(c.settings?.tone || "professional")} •
          <b>Lang:</b> ${escapeHtml(c.settings?.language || "sv")} •
          <b>Emojis:</b> ${c.settings?.allowEmojis === false ? "NO" : "YES"}
        </div>
      `;
      catsList.appendChild(div);
    }
  } catch (e) {
    showAlert(catsMsg, e.message || "Serverfel");
  }
}

async function createCategory() {
  hideAlert(catsMsg);
  const key = (newCatKey.value || "").trim();
  const name = (newCatName.value || "").trim();
  const systemPrompt = (newCatPrompt.value || "").trim();

  if (!key || !name) return showAlert(catsMsg, "Key + namn krävs");

  createCatBtn.disabled = true;
  try {
    const r = await api("/admin/categories", {
      method: "POST",
      body: JSON.stringify({
        key,
        name,
        systemPrompt,
        settings: { tone: "professional", language: "sv", allowEmojis: true },
      }),
    });
    showAlert(catsMsg, r.message || "Kategori skapad ✅", "ok");
    newCatKey.value = "";
    newCatName.value = "";
    newCatPrompt.value = "";
    await loadCategories();
    await catsRefresh();
  } catch (e) {
    showAlert(catsMsg, e.message || "Serverfel");
  } finally {
    createCatBtn.disabled = false;
  }
}

/* =====================
   Admin: Export all + Training export
===================== */
async function adminExportAll() {
  // needs bearer -> fetch as blob
  try {
    const res = await fetch(API_BASE + "/admin/export/all", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const text = await res.text();
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `export_all_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  } catch (e) {
    alert("Export misslyckades: " + (e.message || ""));
  }
}

async function trainingExport() {
  // optional companyId param (we can use activeCompanyId)
  const companyId = activeCompanyId || "";
  try {
    const url = companyId ? `/admin/export/training?companyId=${encodeURIComponent(companyId)}` : `/admin/export/training`;
    const res = await fetch(API_BASE + url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const text = await res.text();
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `training_export_${companyId || "all"}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  } catch (e) {
    alert("Training export misslyckades: " + (e.message || ""));
  }
}

/* =====================
   Settings view
===================== */
async function changeUsername() {
  hideAlert(settingsMsg);
  const newUsername = (newUsernameInput.value || "").trim();
  if (newUsername.length < 3) return showAlert(settingsMsg, "Nytt username är för kort");

  changeUsernameBtn.disabled = true;
  try {
    const r = await api("/auth/change-username", {
      method: "POST",
      body: JSON.stringify({ newUsername }),
    });
    showAlert(settingsMsg, r.message || "Uppdaterat ✅", "ok");
    await loadMe();
    setRoleUI();
  } catch (e) {
    showAlert(settingsMsg, e.message || "Serverfel");
  } finally {
    changeUsernameBtn.disabled = false;
  }
}

async function changePassword() {
  hideAlert(settingsMsg);
  const currentPassword = (currentPassInput.value || "").trim();
  const newPassword = (newPassInput.value || "").trim();
  if (!currentPassword || !newPassword) return showAlert(settingsMsg, "Fyll i båda fälten");
  if (newPassword.length < 6) return showAlert(settingsMsg, "Nytt lösenord måste vara minst 6 tecken");

  changePasswordBtn.disabled = true;
  try {
    const r = await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    showAlert(settingsMsg, r.message || "Lösenord uppdaterat ✅", "ok");
    currentPassInput.value = "";
    newPassInput.value = "";
  } catch (e) {
    showAlert(settingsMsg, e.message || "Serverfel");
  } finally {
    changePasswordBtn.disabled = false;
  }
}

/* =====================
   SLA Dashboard
===================== */
async function slaLoadAll() {
  hideAlert(inboxTicketMsg);

  const days = Number(slaDaysSelect.value || 30);
  const breachedFilter = slaBreachedFilter.value || "all";
  const breachType = slaBreachTypeFilter.value || "any";
  const sortMode = slaSortTickets.value || "newest";

  // 1) overview
  const overview = await api(`/admin/sla/overview?days=${days}`, { method: "GET" });
  renderSlaOverview(overview);

  // 2) trend weekly
  const trend = await api(`/admin/sla/trend/weekly?days=${days}`, { method: "GET" });
  slaTrendData = trend?.rows || [];
  drawSlaTrendChart(slaTrendData);

  // 3) agents
  const agents = await api(`/admin/sla/agents?days=${days}`, { method: "GET" });
  renderSlaAgents(agents?.rows || []);

  // 4) tickets
  const ticketsRes = await api(`/admin/sla/tickets?days=${days}`, { method: "GET" });
  let rows = ticketsRes?.rows || [];

  // filter breached
  rows = rows.filter((r) => {
    const b1 = !!r?.sla?.breachedFirstResponse;
    const b2 = !!r?.sla?.breachedResolution;

    if (breachedFilter === "breachedOnly" && !(b1 || b2)) return false;
    if (breachedFilter === "okOnly" && (b1 || b2)) return false;

    if (breachType === "first" && !b1) return false;
    if (breachType === "resolution" && !b2) return false;

    return true;
  });

  // sort
  if (sortMode === "oldest") rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (sortMode === "newest") rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sortMode === "worstFirst") {
    rows.sort((a, b) => {
      const aBad =
        (a?.sla?.breachedFirstResponse ? 1 : 0) +
        (a?.sla?.breachedResolution ? 1 : 0) +
        (a?.sla?.effectiveRunningMs || 0) / 1000000000;
      const bBad =
        (b?.sla?.breachedFirstResponse ? 1 : 0) +
        (b?.sla?.breachedResolution ? 1 : 0) +
        (b?.sla?.effectiveRunningMs || 0) / 1000000000;
      return bBad - aBad;
    });
  }

  renderSlaTickets(rows);
}

function renderSlaOverview(o) {
  if (!o) return;

  const mk = (label, value) => `
    <div class="slaCard">
      <div class="slaLabel">${escapeHtml(label)}</div>
      <div class="slaValue">${escapeHtml(value ?? "-")}</div>
    </div>
  `;

  const firstAvg = o?.firstResponse?.avgMs != null ? msToPretty(o.firstResponse.avgMs) : "-";
  const firstMed = o?.firstResponse?.medianMs != null ? msToPretty(o.firstResponse.medianMs) : "-";
  const resAvg = o?.resolution?.avgMs != null ? msToPretty(o.resolution.avgMs) : "-";
  const resMed = o?.resolution?.medianMs != null ? msToPretty(o.resolution.medianMs) : "-";

  slaOverviewBox.innerHTML = `
    <div class="slaGrid">
      ${mk("Tickets (period)", o.totalTickets)}
      ${mk("Open", o.statusCounts?.open ?? 0)}
      ${mk("Pending", o.statusCounts?.pending ?? 0)}
      ${mk("Solved", o.statusCounts?.solved ?? 0)}

      ${mk("First avg", firstAvg)}
      ${mk("First median", firstMed)}
      ${mk("First compliance", (o.firstResponse?.compliancePct ?? "-") + "%")}
      ${mk("First breaches", o.firstResponse?.breaches ?? 0)}

      ${mk("Res avg", resAvg)}
      ${mk("Res median", resMed)}
      ${mk("Res compliance", (o.resolution?.compliancePct ?? "-") + "%")}
      ${mk("Res breaches", o.resolution?.breaches ?? 0)}
    </div>
  `;
}

function drawSlaTrendChart(rows) {
  const canvas = slaTrendChart;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // basic canvas chart (no external libs)
  const w = canvas.width = canvas.clientWidth * devicePixelRatio;
  const h = canvas.height = canvas.clientHeight * devicePixelRatio;

  ctx.clearRect(0, 0, w, h);

  const pad = 26 * devicePixelRatio;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  // axes
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, pad + innerH);
  ctx.lineTo(pad + innerW, pad + innerH);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1 * devicePixelRatio;
  ctx.stroke();

  if (!rows || !rows.length) {
    slaTrendHint.textContent = "Ingen trend-data.";
    return;
  }
  slaTrendHint.textContent = `Visar ${rows.length} veckor (compliance %).`;

  const xs = rows.map((_, i) => i);
  const first = rows.map((r) => Number(r.firstCompliancePct || 0));
  const res = rows.map((r) => Number(r.resolutionCompliancePct || 0));

  const maxY = 100;
  const minY = 0;

  const xTo = (i) => pad + (i / Math.max(1, xs.length - 1)) * innerW;
  const yTo = (v) => pad + innerH - ((v - minY) / (maxY - minY)) * innerH;

  // grid lines
  ctx.globalAlpha = 0.35;
  for (let y = 0; y <= 100; y += 25) {
    ctx.beginPath();
    ctx.moveTo(pad, yTo(y));
    ctx.lineTo(pad + innerW, yTo(y));
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
  }

  // draw first line
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  first.forEach((v, i) => {
    const x = xTo(i);
    const y = yTo(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "rgba(76,125,255,0.95)";
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.stroke();

  // draw resolution line
  ctx.beginPath();
  res.forEach((v, i) => {
    const x = xTo(i);
    const y = yTo(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "rgba(55,214,122,0.95)";
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.stroke();

  // labels (last)
  const last = rows[rows.length - 1];
  ctx.globalAlpha = 0.9;
  ctx.font = `${12 * devicePixelRatio}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(last.week, pad, pad - 8 * devicePixelRatio);
}

function renderSlaAgents(rows) {
  if (!slaAgentsBox) return;
  if (!rows || !rows.length) {
    slaAgentsBox.innerHTML = `<div class="muted small">Ingen agent-data.</div>`;
    return;
  }

  slaAgentsBox.innerHTML = `
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
              const favg = r.firstResponse?.avgMs != null ? msToPretty(r.firstResponse.avgMs) : "-";
              const ravg = r.resolution?.avgMs != null ? msToPretty(r.resolution.avgMs) : "-";
              return `
                <tr>
                  <td>${escapeHtml(r.username)} <span class="muted small">(${escapeHtml(r.role)})</span></td>
                  <td>${r.tickets}</td>
                  <td>${r.open}</td>
                  <td>${r.pending}</td>
                  <td>${r.solved}</td>
                  <td>${escapeHtml(favg)}</td>
                  <td>${escapeHtml((r.firstResponse?.compliancePct ?? "-") + "%")}</td>
                  <td>${escapeHtml(ravg)}</td>
                  <td>${escapeHtml((r.resolution?.compliancePct ?? "-") + "%")}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSlaTickets(rows) {
  if (!slaTicketsBox) return;
  if (!rows || !rows.length) {
    slaTicketsBox.innerHTML = `<div class="muted small">Inga tickets matchar filter.</div>`;
    return;
  }

  slaTicketsBox.innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Company</th>
            <th>Status</th>
            <th>Prio</th>
            <th>First</th>
            <th>Res</th>
            <th>Pending</th>
            <th>Running</th>
            <th>Breaches</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const sla = r.sla || {};
              const breaches = (sla.breachedFirstResponse ? 1 : 0) + (sla.breachedResolution ? 1 : 0);
              return `
                <tr>
                  <td><b>${escapeHtml(r.ticketPublicId || r.ticketId)}</b><br/><span class="muted small">${escapeHtml(r.ticketId)}</span></td>
                  <td>${escapeHtml(r.companyId)}</td>
                  <td>${escapeHtml(r.status)}</td>
                  <td>${escapeHtml(r.priority)}</td>
                  <td>${escapeHtml(sla.pretty?.firstResponse || "")}</td>
                  <td>${escapeHtml(sla.pretty?.resolution || "")}</td>
                  <td>${escapeHtml(sla.pretty?.pendingTotal || "")}</td>
                  <td>${escapeHtml(sla.pretty?.effectiveRunning || "")}</td>
                  <td>${breaches}</td>
                  <td>${prettyDate(r.createdAt)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function slaExportCsv() {
  const days = Number(slaDaysSelect.value || 30);
  try {
    const res = await fetch(API_BASE + `/admin/sla/export/csv?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${res.status}`);
    }
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sla_export_${days}d.csv`;
    a.click();
  } catch (e) {
    alert("SLA export misslyckades: " + (e.message || ""));
  }
}

async function slaClearMy() {
  try {
    const r = await api(`/admin/sla/clear/my`, { method: "POST", body: JSON.stringify({}) });
    alert(r.message || "Raderat ✅");
    await slaLoadAll();
  } catch (e) {
    alert("Fel: " + (e.message || ""));
  }
}

async function slaClearAll() {
  if (!confirm("Radera ALL SLA statistik?")) return;
  try {
    const r = await api(`/admin/sla/clear/all`, { method: "POST", body: JSON.stringify({}) });
    alert(r.message || "Raderat ✅");
    await slaLoadAll();
  } catch (e) {
    alert("Fel: " + (e.message || ""));
  }
}

/* =====================
   Navigation
===================== */
async function goAuth() {
  setActiveMenu(null);
  showView(authView);
}

async function goChat() {
  setActiveMenu(openChatViewBtn);
  showView(chatView);
}

async function goMyTickets() {
  setActiveMenu(openMyTicketsViewBtn);
  showView(myTicketsView);
  await loadMyTickets();
}

async function goInbox() {
  setActiveMenu(openInboxViewBtn);
  showView(inboxView);
  await loadAgentsForAssign();
  await loadInboxTickets();
}

async function goAdmin() {
  setActiveMenu(openAdminViewBtn);
  showView(adminView);
  // default tab users
  switchAdminTab("tabUsers");
  await loadUsers();
}

async function goSettings() {
  setActiveMenu(openSettingsViewBtn);
  showView(settingsView);
}

async function goSla() {
  setActiveMenu(openSlaViewBtn);
  showView(slaView);
  await slaLoadAll();
}

function switchAdminTab(tabId) {
  tabBtns.forEach((b) => b.classList.remove("active"));
  tabBtns.find((b) => b.dataset.tab === tabId)?.classList.add("active");

  tabUsers.style.display = tabId === "tabUsers" ? "block" : "none";
  tabKB.style.display = tabId === "tabKB" ? "block" : "none";
  tabCats.style.display = tabId === "tabCats" ? "block" : "none";
}

/* =====================
   Bind events
===================== */
function bindEvents() {
  // Theme
  themeToggleBtn?.addEventListener("click", toggleTheme);

  // Debug
  toggleDebugBtn?.addEventListener("click", () => setDebug(!debugOn));

  // Sidebar nav
  openChatViewBtn?.addEventListener("click", () => goChat());
  openMyTicketsViewBtn?.addEventListener("click", () => goMyTickets());
  openInboxViewBtn?.addEventListener("click", () => goInbox());
  openAdminViewBtn?.addEventListener("click", () => goAdmin());
  openSettingsViewBtn?.addEventListener("click", () => goSettings());
  openSlaViewBtn?.addEventListener("click", () => goSla());

  // Category select
  categorySelect?.addEventListener("change", () => {
    setCompany(categorySelect.value);
    // reset ticket context when company changes
    resetTicketContext();
  });

  // Auth
  togglePassBtn?.addEventListener("click", () => {
    passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  });

  toggleResetPassBtn?.addEventListener("click", () => {
    resetNewPass.type = resetNewPass.type === "password" ? "text" : "password";
  });

  loginBtn?.addEventListener("click", async () => {
    hideAlert(authMessage);
    const username = (usernameInput.value || "").trim();
    const password = (passwordInput.value || "").trim();
    if (!username || !password) return showAlert(authMessage, "Fyll i användarnamn och lösenord");

    loginBtn.disabled = true;
    try {
      const res = await fetch(API_BASE + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).then((r) => r.json().then((d) => ({ ok: r.ok, d })));

      if (!res.ok) throw new Error(res.d?.error || "Login misslyckades");
      token = res.d.token;
      localStorage.setItem("kt_token", token);
      await loadMe();
      await bootAfterLogin();
    } catch (e) {
      showAlert(authMessage, e.message || "Serverfel");
    } finally {
      loginBtn.disabled = false;
    }
  });

  registerBtn?.addEventListener("click", async () => {
    hideAlert(authMessage);
    const username = (usernameInput.value || "").trim();
    const password = (passwordInput.value || "").trim();
    const email = (emailInput.value || "").trim();

    if (username.length < 3) return showAlert(authMessage, "Användarnamn måste vara minst 3 tecken");
    if (password.length < 6) return showAlert(authMessage, "Lösenord måste vara minst 6 tecken");

    registerBtn.disabled = true;
    try {
      const res = await fetch(API_BASE + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email }),
      }).then((r) => r.json().then((d) => ({ ok: r.ok, d })));

      if (!res.ok) throw new Error(res.d?.error || "Registrering misslyckades");
      showAlert(authMessage, res.d?.message || "Registrering lyckades ✅", "ok");
    } catch (e) {
      showAlert(authMessage, e.message || "Serverfel");
    } finally {
      registerBtn.disabled = false;
    }
  });

  openForgotBtn?.addEventListener("click", () => {
    showForgotUI(true);
    hideAlert(forgotMsg);
  });

  closeForgotBtn?.addEventListener("click", () => showForgotUI(false));

  sendForgotBtn?.addEventListener("click", async () => {
    hideAlert(forgotMsg);
    const email = (forgotEmail.value || "").trim();
    if (!email) return showAlert(forgotMsg, "Skriv din email först");

    sendForgotBtn.disabled = true;
    try {
      const res = await fetch(API_BASE + "/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).then((r) => r.json().then((d) => ({ ok: r.ok, d })));

      if (!res.ok) throw new Error(res.d?.error || "Serverfel");
      showAlert(forgotMsg, res.d?.message || "Skickat ✅", "ok");
    } catch (e) {
      showAlert(forgotMsg, e.message || "Serverfel");
    } finally {
      sendForgotBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener("click", () => {
    token = "";
    me = null;
    localStorage.removeItem("kt_token");
    resetTicketContext();
    setRoleUI();
    goAuth();
  });

  // Chat actions
  sendBtn?.addEventListener("click", sendChatMessage);
  messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChatMessage();
    }
  });

  newTicketBtn?.addEventListener("click", resetTicketContext);
  clearChatBtn?.addEventListener("click", () => {
    conversation = [];
    viewResetAllMessages();
  });
  exportChatBtn?.addEventListener("click", exportChat);

  fbUpBtn?.addEventListener("click", () => sendFeedback("up"));
  fbDownBtn?.addEventListener("click", () => sendFeedback("down"));

  // My tickets
  myTicketsRefreshBtn?.addEventListener("click", loadMyTickets);
  myTicketReplyBtn?.addEventListener("click", replyMyTicket);

  // Inbox filters
  inboxRefreshBtn?.addEventListener("click", loadInboxTickets);
  inboxStatusFilter?.addEventListener("change", () => renderInboxTickets(_inboxCache));
  inboxCategoryFilter?.addEventListener("change", () => renderInboxTickets(_inboxCache));
  inboxSearchInput?.addEventListener("input", () => renderInboxTickets(_inboxCache));

  // Inbox actions
  setStatusOpen?.addEventListener("click", () => setTicketStatus("open"));
  setStatusPending?.addEventListener("click", () => setTicketStatus("pending"));
  setStatusSolved?.addEventListener("click", () => setTicketStatus("solved"));

  setPriorityBtn?.addEventListener("click", setTicketPriority);

  sendAgentReplyInboxBtn?.addEventListener("click", sendAgentReply);

  saveInternalNoteBtn?.addEventListener("click", saveInternalNote);
  clearInternalNotesBtn?.addEventListener("click", clearAllNotes);

  assignTicketBtn?.addEventListener("click", assignTicket);
  deleteTicketBtn?.addEventListener("click", deleteTicket);

  // internal notes delete (event delegation)
  internalNotesList?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='deleteNote']");
    if (!btn) return;
    const noteId = btn.getAttribute("data-noteid");
    if (!noteId) return;
    if (!confirm("Ta bort notering? (Admin krävs)")) return;
    deleteSingleNote(noteId);
  });

  // Solve all / remove solved (admin only routes)
  solveAllBtn?.addEventListener("click", async () => {
    if (!confirm("Solve ALL tickets? (Admin)")) return;
    try {
      const r = await api("/admin/tickets/solve-all", { method: "POST", body: JSON.stringify({}) });
      alert(r.message || "Done ✅");
      await loadInboxTickets();
    } catch (e) {
      alert(e.message || "Serverfel");
    }
  });

  removeSolvedBtn?.addEventListener("click", async () => {
    if (!confirm("Remove ALL solved tickets? (Admin)")) return;
    try {
      const r = await api("/admin/tickets/remove-solved", { method: "POST", body: JSON.stringify({}) });
      alert(r.message || "Done ✅");
      await loadInboxTickets();
    } catch (e) {
      alert(e.message || "Serverfel");
    }
  });

  // Admin tabs
  tabBtns.forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.dataset.tab;
      switchAdminTab(id);

      if (id === "tabUsers") await loadUsers();
      if (id === "tabKB") await kbRefresh();
      if (id === "tabCats") await catsRefresh();
    })
  );

  // Admin users panel actions (delegation)
  adminUsersList?.addEventListener("click", async (e) => {
    const roleBtn = e.target.closest("[data-action='role']");
    const delBtn = e.target.closest("[data-action='deleteUser']");

    if (roleBtn) {
      const userId = roleBtn.getAttribute("data-userid");
      const role = roleBtn.getAttribute("data-role");
      if (!userId || !role) return;
      if (!confirm(`Byt roll till ${role}?`)) return;

      try {
        await api(`/admin/users/${userId}/role`, {
          method: "POST",
          body: JSON.stringify({ role }),
        });
        await loadUsers();
      } catch (err) {
        alert(err.message || "Serverfel");
      }
    }

    if (delBtn) {
      const userId = delBtn.getAttribute("data-userid");
      if (!userId) return;
      if (!confirm("Ta bort användare?")) return;

      try {
        await api(`/admin/users/${userId}`, { method: "DELETE" });
        await loadUsers();
      } catch (err) {
        alert(err.message || "Serverfel");
      }
    }
  });

  adminUsersRefreshBtn?.addEventListener("click", loadUsers);

  // Admin export buttons
  adminExportAllBtn?.addEventListener("click", adminExportAll);
  trainingExportBtn?.addEventListener("click", trainingExport);

  // KB
  kbRefreshBtn?.addEventListener("click", kbRefresh);
  kbExportBtn?.addEventListener("click", kbExport);

  kbUploadTextBtn?.addEventListener("click", kbUploadText);
  kbUploadUrlBtn?.addEventListener("click", kbUploadUrl);
  kbUploadPdfBtn?.addEventListener("click", kbUploadPdf);

  // Categories
  catsRefreshBtn?.addEventListener("click", catsRefresh);
  createCatBtn?.addEventListener("click", createCategory);

  // Settings
  changeUsernameBtn?.addEventListener("click", changeUsername);
  changePasswordBtn?.addEventListener("click", changePassword);

  // SLA
  slaRefreshBtn?.addEventListener("click", slaLoadAll);
  slaExportCsvBtn?.addEventListener("click", slaExportCsv);
  slaClearMyStatsBtn?.addEventListener("click", slaClearMy);
  slaClearAllStatsBtn?.addEventListener("click", slaClearAll);

  slaDaysSelect?.addEventListener("change", slaLoadAll);
  slaBreachedFilter?.addEventListener("change", slaLoadAll);
  slaBreachTypeFilter?.addEventListener("change", slaLoadAll);
  slaSortTickets?.addEventListener("change", slaLoadAll);

  // Compare mode is in HTML but not used (safe no-op)
  slaCompareMode?.addEventListener("change", () => {
    // future feature - kept for compatibility with your UI
  });
}

/* =====================
   Boot logic
===================== */
async function bootAfterLogin() {
  // update UI
  setRoleUI();

  // sync company
  setCompany(activeCompanyId);

  // restore ticket context
  if (activeTicketId && activeTicketPublicId) {
    // keep conversation empty - we don't store full server chat history here
    appendChatMessage("assistant", "Välkommen tillbaka! ✅ Fortsätt skriva i chatten.");
  } else {
    resetTicketContext();
  }

  await goChat();

  // load agent assignment list in background
  await loadAgentsForAssign();
}

async function boot() {
  loadTheme();
  setDebug(debugOn);
  bindEvents();

  await loadCategories();
  setCompany(activeCompanyId);

  // reset token flow?
  await checkResetTokenInUrl();

  await loadMe();

  if (!me) {
    await goAuth();
    return;
  }

  await bootAfterLogin();
}

/* =====================
   Start
===================== */
boot().catch((e) => {
  console.error("BOOT ERROR:", e);
});
