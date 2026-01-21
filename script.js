/* =========================================================
   AI Kundtjänst - script.js (STABIL VERSION)
   - Passar din index.html exakt
   - Ingen extra "komplicerad" layout
   - Knappar funkar igen
   - Alla views funkar (Chat / Mina / Inbox / SLA / Admin / Settings)
   ========================================================= */

const API_BASE = ""; // samma origin

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

  if (!headers["Content-Type"] && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(API_BASE + path, { ...opts, headers });

  const ct = res.headers.get("content-type") || "";
  let data = null;
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
  const savedTheme = localStorage.getItem(LS.theme);
  if (savedTheme) document.body.setAttribute("data-theme", savedTheme);

  show($("debugPanel"), state.debug);

  bindEvents();
  boot();
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
      onLoggedIn();
    } catch {
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
    await loadMyTickets().catch((e) => setAlert($("myTicketsHint"), e.message, "error"));
  });

  $("openInboxView")?.addEventListener("click", async () => {
    setActiveMenu("openInboxView");
    switchView("inboxView");
    await loadInboxTickets().catch((e) => setAlert($("inboxMsg"), e.message, "error"));
  });

  $("openSlaView")?.addEventListener("click", async () => {
    setActiveMenu("openSlaView");
    switchView("slaView");
    await refreshSlaSimple().catch(() => {});
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("openAdminView");
    switchView("adminView");
    await refreshAdminAll().catch(() => {});
  });

  $("openSettingsView")?.addEventListener("click", () => {
    setActiveMenu("openSettingsView");
    switchView("settingsView");
  });

  $("categorySelect")?.addEventListener("change", async (e) => {
    state.companyId = e.target.value || "demo";
    setLS(LS.currentCompanyId, state.companyId);
    updateCategoryUiHints();
    updateDebug();
  });

  $("themeToggle")?.addEventListener("click", () => {
    const cur = document.body.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(LS.theme, next);
  });

  $("toggleDebugBtn")?.addEventListener("click", () => {
    state.debug = !state.debug;
    localStorage.setItem(LS.debug, state.debug ? "1" : "0");
    show($("debugPanel"), state.debug);
    updateDebug();
  });

  $("loginBtn")?.addEventListener("click", doLogin);
  $("registerBtn")?.addEventListener("click", doRegister);
  $("logoutBtn")?.addEventListener("click", () => doLogout(true));

  $("togglePassBtn")?.addEventListener("click", () => togglePass("password", "togglePassBtn"));
  $("toggleResetPassBtn")?.addEventListener("click", () => togglePass("resetNewPass", "toggleResetPassBtn"));

  $("openForgotBtn")?.addEventListener("click", () => openForgot(true));
  $("closeForgotBtn")?.addEventListener("click", () => openForgot(false));
  $("sendForgotBtn")?.addEventListener("click", sendForgotEmail);
  $("resetSaveBtn")?.addEventListener("click", doResetPassword);

  $("sendBtn")?.addEventListener("click", sendChat);
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  $("clearChatBtn")?.addEventListener("click", () => {
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    $("messages").innerHTML = "";
    addSystemMessage("Chat rensad ✅");
  });

  $("exportChatBtn")?.addEventListener("click", exportChat);

  $("newTicketBtn")?.addEventListener("click", () => {
    state.lastTicketId = "";
    setLS(LS.lastTicketId, "");
    state.conversation = [];
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    $("messages").innerHTML = "";
    addSystemMessage("✅ Nytt ärende startat.");
  });

  $("fbUp")?.addEventListener("click", () => sendFeedback("up"));
  $("fbDown")?.addEventListener("click", () => sendFeedback("down"));

  $("myTicketsRefreshBtn")?.addEventListener("click", loadMyTickets);
  $("myTicketReplyBtn")?.addEventListener("click", myTicketReply);

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

  $("slaRefreshBtn")?.addEventListener("click", refreshSlaSimple);
  $("slaExportCsvBtn")?.addEventListener("click", exportSlaCsv);
  $("slaDaysSelect")?.addEventListener("change", refreshSlaSimple);

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

  $("kbRefreshBtn")?.addEventListener("click", loadKbList);
  $("kbExportBtn")?.addEventListener("click", exportKb);
  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);
  $("kbCategorySelect")?.addEventListener("change", loadKbList);

  $("catsRefreshBtn")?.addEventListener("click", loadCategoriesAdmin);
  $("createCatBtn")?.addEventListener("click", createCategory);

  $("changeUsernameBtn")?.addEventListener("click", changeUsername);
  $("changePasswordBtn")?.addEventListener("click", changePassword);

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
  setLS(LS.token, "");
  setLS(LS.user, "");
  setLS(LS.lastTicketId, "");
  state.lastTicketId = "";

  onLoggedOut();
  if (showMsg) addSystemMessage("Du är utloggad ✅");
}

function onLoggedOut() {
  $("roleBadge").textContent = "Inte inloggad";
  show($("logoutBtn"), false);
  show($("openSettingsView"), false);

  qsa(".adminOnly").forEach((x) => (x.style.display = "none"));

  switchView("authView");
  setActiveMenu("openChatView");

  $("messages").innerHTML = "";
  state.conversation = [];
  setLS(LS.chatConversation, JSON.stringify(state.conversation));

  updateDebug();
}

async function onLoggedIn() {
  show($("logoutBtn"), true);
  show($("openSettingsView"), true);

  const role = state.user?.role || "user";

  $("roleBadge").textContent =
    role === "user"
      ? `Inloggad: ${state.user.username} • ID: ${String(state.user.id).slice(-6)}`
      : `${state.user.username} (${role}) • ID: ${String(state.user.id).slice(-6)}`;

  if (role === "admin") {
    qsa(".adminOnly").forEach((x) => (x.style.display = ""));
    show($("openAdminView"), true);
  } else if (role === "agent") {
    qsa(".adminOnly").forEach((x) => (x.style.display = ""));
    show($("openAdminView"), false);
  } else {
    qsa(".adminOnly").forEach((x) => (x.style.display = "none"));
  }

  show($("slaClearAllStatsBtn"), role === "admin");

  switchView("chatView");
  setActiveMenu("openChatView");

  renderConversation();
  scrollMessagesToBottom();

  updateCategoryUiHints();
  await loadInboxCategoryFilter().catch(() => {});
  updateDebug();
}

/* =========================
   Password toggle
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
   Forgot/Reset
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
   Categories
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

  updateDebug();
}

async function loadInboxCategoryFilter() {
  await loadCategories();
}

function updateCategoryUiHints() {
  const title = $("chatTitle");
  const sub = $("chatSubtitle");
  if (!title || !sub) return;

  title.textContent = "AI Kundtjänst";
  sub.textContent = `Kategori: ${state.companyId} • Skriv ditt ärende så hjälper jag dig direkt.`;
}

/* =========================
   CHAT UI
========================= */
function addSystemMessage(text) {
  addMessageToUI("assistant", text);
}

function addMessageToUI(role, content) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + (role === "user" ? "user" : "assistant");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML = role === "user" ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-robot"></i>`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content || "";

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);

  $("messages")?.appendChild(wrap);
}

function renderConversation() {
  if (!$("messages")) return;
  $("messages").innerHTML = "";
  for (const m of state.conversation) {
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
    updateDebug({ ticketId: state.lastTicketId, ragUsed: !!data.ragUsed });
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
    $("fbMsg").textContent = "Tack! ✅";
    setTimeout(() => ($("fbMsg").textContent = ""), 1200);
  } catch (e) {
    $("fbMsg").textContent = `Fel: ${e.message}`;
    setTimeout(() => ($("fbMsg").textContent = ""), 1500);
  }
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

  try {
    const tickets = await api("/my/tickets");

    if (!tickets.length) {
      if (list) list.innerHTML = `<div class="muted small">Inga ärenden ännu.</div>`;
      if (details) details.innerHTML = `<span class="muted small">Skapa en ny konversation i Chat.</span>`;
      return;
    }

    list.innerHTML = tickets
      .map((t) => {
        const status = t.status || "open";
        const prio = t.priority || "normal";
        return `
          <div class="listItem" data-id="${t._id}">
            <div class="listItemTitle">
              ${escapeHtml(t.title || "(utan titel)")}
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
  } catch (e) {
    setAlert($("myTicketsHint"), e.message, "error");
    if (details) details.innerHTML = `<span class="muted small">Kunde inte ladda.</span>`;
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
          <div class="listItem" data-id="${t._id}">
            <div class="listItemTitle">
              ${escapeHtml(t.title || "(utan titel)")}
              ${statusPill}
              ${prioPill}
            </div>
            <div class="muted small">
              ${escapeHtml(String(t.companyId || ""))} • ${escapeHtml(String(t._id).slice(-8))} • ${fmtDate(t.lastActivityAt || t.createdAt)}
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
  $("internalNotesList").innerHTML = "";

  try {
    const t = await api(`/admin/tickets/${ticketId}`);
    if ($("ticketPrioritySelect")) $("ticketPrioritySelect").value = t.priority || "normal";
    await fillAssignUsers(t.assignedToUserId);

    const top = `
      <div style="margin-bottom:10px;">
        <div><b>${escapeHtml(t.title || "Ticket")}</b></div>
        <div class="muted small">${escapeHtml(t.companyId)} • ${escapeHtml(String(t._id))} • Skapad ${fmtDate(t.createdAt)}</div>
        <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
          ${pill(t.status, t.status === "solved" ? "ok" : t.status === "pending" ? "warn" : "")}
          ${pill(t.priority, t.priority === "high" ? "danger" : "")}
        </div>
      </div>
      <div class="divider"></div>
    `;

    const msgsHtml = (t.messages || [])
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

    box.innerHTML = top + msgsHtml;
    renderInternalNotes(t.internalNotes || []);
  } catch (e) {
    setAlert(msg, e.message, "error");
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
    await api(`/admin/tickets/${state.selectedInboxTicketId}/internal-notes`, { method: "DELETE" });
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
      agents
        .map((u) => `<option value="${u._id}">${escapeHtml(u.username)} (${u.role})</option>`)
        .join("");

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
    $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
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
   SLA (ENKEL)
   - Endast endpoints som brukar finnas
========================= */
async function refreshSlaSimple() {
  const days = Number($("slaDaysSelect")?.value || 30);

  $("slaOverviewBox").innerHTML = `<div class="muted small">Laddar...</div>`;
  $("slaAgentsBox").innerHTML = `<div class="muted small">Laddar...</div>`;
  $("slaTicketsBox").innerHTML = `<div class="muted small">Laddar...</div>`;
  $("slaTrendHint").textContent = "";

  try {
    const overview = await api(`/admin/sla/overview?days=${days}`);
    $("slaOverviewBox").innerHTML = `
      <div class="panel soft">
        <b>SLA Overview</b>
        <div class="muted small" style="margin-top:6px;">
          Tickets: <b>${escapeHtml(String(overview.totalTickets ?? 0))}</b><br/>
          First avg: <b>${escapeHtml(msToPretty(overview.firstResponse?.avgMs))}</b> • Compliance: <b>${escapeHtml(String(overview.firstResponse?.compliancePct ?? "-"))}%</b><br/>
          Resolution avg: <b>${escapeHtml(msToPretty(overview.resolution?.avgMs))}</b> • Compliance: <b>${escapeHtml(String(overview.resolution?.compliancePct ?? "-"))}%</b>
        </div>
      </div>
    `;

    const trend = await api(`/admin/sla/trend/weekly?days=${days}`);
    renderSlaTrendChart(trend);

    const agents = await api(`/admin/sla/agents?days=${days}`);
    renderSlaAgents(agents);

    const tickets = await api(`/admin/sla/tickets?days=${days}`);
    renderSlaTicketsSimple(tickets);
  } catch (e) {
    $("slaOverviewBox").innerHTML = `<div class="alert error">❌ SLA fel: ${escapeHtml(e.message)}</div>`;
  }
}

function renderSlaTrendChart(tr) {
  const canvas = $("slaTrendChart");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    $("slaTrendHint").textContent =
      "❌ Chart.js saknas. Lägg in <script src='https://cdn.jsdelivr.net/npm/chart.js'></script> före script.js";
    return;
  }

  destroyTrendChart();

  const rows = tr?.rows || [];
  if (!rows.length) {
    $("slaTrendHint").textContent = "Ingen trend-data ännu.";
    return;
  }

  // ✅ LÅS canvas storlek för att stoppa "scroll ner"-buggen
  canvas.style.height = "260px";
  canvas.style.maxHeight = "260px";

  const labels = rows.map((r) => r.week);
  const firstPct = rows.map((r) => r.firstCompliancePct || 0);
  const resPct = rows.map((r) => r.resolutionCompliancePct || 0);

  const ctx = canvas.getContext("2d");

  state.chartTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "First response compliance (%)",
          data: firstPct,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
        },
        {
          label: "Resolution compliance (%)",
          data: resPct,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,

      // ✅ VIKTIGT: detta stoppar Chart.js från att "jaga" höjden
      maintainAspectRatio: true,
      animation: false,

      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: { enabled: true },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { callback: (v) => v + "%" },
        },
      },
    },
  });

  $("slaTrendHint").textContent = "Trend visar compliance vecka för vecka (hovera för detaljer).";
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
                  <td>${escapeHtml(msToPretty(fr.avgMs))}</td>
                  <td>${escapeHtml(String(fr.compliancePct ?? "-"))}%</td>
                  <td>${escapeHtml(msToPretty(rs.avgMs))}</td>
                  <td>${escapeHtml(String(rs.compliancePct ?? "-"))}%</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSlaTicketsSimple(data) {
  const box = $("slaTicketsBox");
  if (!box) return;

  const rows = data?.rows || [];
  if (!rows.length) {
    box.innerHTML = `<div class="muted small">Inga tickets.</div>`;
    return;
  }

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
            <th>Res</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 200)
            .map((r) => {
              const sla = r.sla || {};
              return `
                <tr>
                  <td><span class="muted small">${escapeHtml(String(r.ticketId).slice(-8))}</span></td>
                  <td>${escapeHtml(r.companyId || "")}</td>
                  <td>${escapeHtml(r.status || "")}</td>
                  <td>${escapeHtml(r.priority || "")}</td>
                  <td>${escapeHtml(fmtDate(r.createdAt))}</td>
                  <td>${escapeHtml(msToPretty(sla.firstResponseMs))}</td>
                  <td>${escapeHtml(msToPretty(sla.resolutionMs))}</td>
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
   ADMIN + KB + Categories + Settings
   (Behåller dina funktioner men utan "PUT kategori edit" mm)
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

    box.innerHTML = users
      .map((u) => {
        const rolePill = u.role === "admin" ? pill("admin", "ok") : u.role === "agent" ? pill("agent", "warn") : pill("user");
        const shortId = String(u._id || "").slice(-8);

        return `
          <div class="listItem">
            <div class="listItemTitle">
              ${escapeHtml(u.username)} ${rolePill}
              <span class="muted small" style="margin-left:auto;">${escapeHtml(shortId)}</span>
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

/* ===== exports ===== */
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

/* ===== KB ===== */
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
      .map((c) => `
        <div class="listItem">
          <div class="listItemTitle">
            ${escapeHtml(c.title || c.sourceRef || "KB")}
            <span class="muted small" style="margin-left:auto;">#${c.chunkIndex}</span>
          </div>
          <div class="muted small">${escapeHtml(c.sourceType)} • ${escapeHtml(c.sourceRef || "")}</div>
          <div class="muted small" style="margin-top:8px;">${escapeHtml((c.content || "").slice(0, 180))}...</div>
        </div>
      `)
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

/* ===== Categories Admin (ENKEL) ===== */
async function loadCategoriesAdmin() {
  const box = $("catsList");
  const msg = $("catsMsg");
  if (!box) return;
  setAlert(msg, "");
  box.innerHTML = `<div class="muted small">Laddar...</div>`;

  try {
    const cats = await api("/categories");
    box.innerHTML = cats
      .map((c) => `
        <div class="listItem">
          <div class="listItemTitle">
            ${escapeHtml(c.name)} <span class="muted small">(${escapeHtml(c.key)})</span>
          </div>
          <div class="muted small">${escapeHtml((c.systemPrompt || "").slice(0, 160))}...</div>
        </div>
      `)
      .join("");
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

    await loadCategories();
    await loadCategoriesAdmin();
  } catch (e) {
    setAlert(msg, e.message, "error");
  }
}

/* ===== Settings ===== */
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
    onLoggedIn();
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
