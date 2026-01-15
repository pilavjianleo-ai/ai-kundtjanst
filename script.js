/*************************************************
 * ✅ API base + endpoints
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API = {
  ME: `${API_BASE}/me`,
  LOGIN: `${API_BASE}/login`,
  REGISTER: `${API_BASE}/register`,
  CATEGORIES: `${API_BASE}/categories`,
  CHAT: `${API_BASE}/chat`,
  FEEDBACK: `${API_BASE}/feedback`,

  MY_TICKETS: `${API_BASE}/my/tickets`,
  MY_TICKET: (id) => `${API_BASE}/my/tickets/${id}`,

  AUTH_FORGOT: `${API_BASE}/auth/forgot-password`,
  AUTH_RESET: `${API_BASE}/auth/reset-password`,
  AUTH_CHANGE_USERNAME: `${API_BASE}/auth/change-username`,
  AUTH_CHANGE_PASSWORD: `${API_BASE}/auth/change-password`,

  ADMIN_USERS: `${API_BASE}/admin/users`,
  ADMIN_USER_ROLE: (id) => `${API_BASE}/admin/users/${id}/role`,
  ADMIN_DELETE_USER: (id) => `${API_BASE}/admin/users/${id}`,

  ADMIN_TICKETS: `${API_BASE}/admin/tickets`,
  ADMIN_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_TICKET_STATUS: (id) => `${API_BASE}/admin/tickets/${id}/status`,
  ADMIN_TICKET_REPLY: (id) => `${API_BASE}/admin/tickets/${id}/agent-reply`,
  ADMIN_TICKET_PRIORITY: (id) => `${API_BASE}/admin/tickets/${id}/priority`,
  ADMIN_TICKET_NOTE: (id) => `${API_BASE}/admin/tickets/${id}/internal-note`,
  ADMIN_TICKET_NOTE_DELETE: (ticketId, noteId) => `${API_BASE}/admin/tickets/${ticketId}/internal-note/${noteId}`,
ADMIN_TICKET_NOTES_CLEAR: (ticketId) => `${API_BASE}/admin/tickets/${ticketId}/internal-notes`,
  ADMIN_TICKET_ASSIGN: (id) => `${API_BASE}/admin/tickets/${id}/assign`,
  ADMIN_TICKET_DELETE: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_TICKETS_CLEANUP_SOLVED: `${API_BASE}/admin/tickets/cleanup-solved`,
ADMIN_TICKETS_SOLVE_ALL: `${API_BASE}/admin/tickets/solve-all`,
ADMIN_TICKETS_REMOVE_SOLVED: `${API_BASE}/admin/tickets/remove-solved`,

  ADMIN_EXPORT_ALL: `${API_BASE}/admin/export/all`,
  ADMIN_EXPORT_TRAINING: `${API_BASE}/admin/export/training`,

  ADMIN_CATEGORIES: `${API_BASE}/admin/categories`,

  KB_LIST: (companyId) => `${API_BASE}/kb/list/${companyId}`,
  KB_TEXT: `${API_BASE}/kb/upload-text`,
  KB_URL: `${API_BASE}/kb/upload-url`,
  KB_PDF: `${API_BASE}/kb/upload-pdf`,
  KB_EXPORT: (companyId) => `${API_BASE}/export/kb/${companyId}`,
};

let token = localStorage.getItem("token") || null;
let currentUser = null; // {id, username, role, email}
let companyId = "demo";
let ticketId = null;
let lastRagUsed = null;

let inboxSelectedTicketId = null;
let mySelectedTicketId = null;

let pollInterval = null;
let lastAdminTicketSnapshot = {};
let categoryNotifMap = {}; // { companyId: true/false }

/*************************************************
 * ✅ DOM helpers
 *************************************************/
const $ = (id) => document.getElementById(id);

function show(el, yes = true) {
  if (!el) return;
  el.style.display = yes ? "" : "none";
}

function setText(el, txt) {
  if (el) el.textContent = txt ?? "";
}

function setAlert(el, msg, isError = false) {
  if (!el) return;
  el.className = isError ? "alert error" : "alert";
  el.textContent = msg || "";
  el.style.display = msg ? "" : "none";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
}

/*************************************************
 * ✅ Safe fetchJson (fix HTML response issue)
 *************************************************/
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();

  // If server returned HTML, throw readable error
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    throw new Error(`API returnerade HTML istället för JSON. URL: ${url}`);
  }

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: "Ogiltig JSON från server" };
  }

  if (!res.ok) {
    const msg = data?.error || "Serverfel";
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/*************************************************
 * ✅ Debug panel
 *************************************************/
function refreshDebug() {
  setText($("dbgApi"), API_BASE || "(same-origin)");
  setText($("dbgLogged"), token ? "JA" : "NEJ");
  setText($("dbgRole"), currentUser?.role || "-");
  setText($("dbgTicket"), ticketId || "-");
  setText($("dbgRag"), lastRagUsed === null ? "-" : (lastRagUsed ? "JA" : "NEJ"));
}

/*************************************************
 * ✅ Views
 *************************************************/
function openView(viewName) {
  show($("authView"), viewName === "auth");
  show($("chatView"), viewName === "chat");
  show($("myTicketsView"), viewName === "myTickets");
  show($("inboxView"), viewName === "inbox");
  show($("adminView"), viewName === "admin");
  show($("settingsView"), viewName === "settings");
}

function setActiveMenu(btnId) {
  const map = {
    chat: $("openChatView"),
    myTickets: $("openMyTicketsView"),
    inbox: $("openInboxView"),
    admin: $("openAdminView"),
    settings: $("openSettingsView"),
  };

  Object.values(map).forEach((b) => b?.classList.remove("active"));
  map[btnId]?.classList.add("active");
}

/*************************************************
 * ✅ Title map
 *************************************************/
function titleForCompany(c) {
  const map = {
    demo: { title: "AI Kundtjänst – Demo AB", sub: "Ställ en fråga så hjälper jag dig direkt." },
    law: { title: "AI Kundtjänst – Juridik", sub: "Allmän vägledning (inte juridisk rådgivning)." },
    tech: { title: "AI Kundtjänst – Teknisk support", sub: "Felsökning och IT-hjälp." },
    cleaning: { title: "AI Kundtjänst – Städservice", sub: "Frågor om städ, tjänster, rutiner." }
  };
  return map[c] || { title: `AI Kundtjänst – ${c}`, sub: "Ställ en fråga så hjälper jag dig." };
}

function applyCompanyToUI() {
  const t = titleForCompany(companyId);
  setText($("chatTitle"), t.title);
  setText($("chatSubtitle"), t.sub);

  if ($("categorySelect")) $("categorySelect").value = companyId;
}

/*************************************************
 * ✅ Theme
 *************************************************/
function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  body.setAttribute("data-theme", next);

  const icon = $("themeToggle")?.querySelector("i");
  if (icon) icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
}

/*************************************************
 * ✅ Auth UI
 *************************************************/
function applyAuthUI() {
  const logoutBtn = $("logoutBtn");
  const roleBadge = $("roleBadge");

  const chatBtn = $("openChatView");
  const myTicketsBtn = $("openMyTicketsView");
  const settingsBtn = $("openSettingsView");
  const inboxBtn = $("openInboxView");
  const adminBtn = $("openAdminView");

  const isLogged = !!(token && currentUser);

  if (!isLogged) {
    openView("auth");
    setActiveMenu("chat");

    setText(roleBadge, "Inte inloggad");
    show(logoutBtn, false);

    // Hide menu items when logged out
    show(chatBtn, false);
    show(myTicketsBtn, false);
    show(settingsBtn, false);
    show(inboxBtn, false);
    show(adminBtn, false);
  } else {
    setText(roleBadge, `${currentUser.username} • ${String(currentUser.role || "user").toUpperCase()}`);
    show(logoutBtn, true);

    // Show user menus
    show(chatBtn, true);
    show(myTicketsBtn, true);
    show(settingsBtn, true);

    const isAdmin = currentUser.role === "admin";
    const isAgent = currentUser.role === "agent";

    show(inboxBtn, isAdmin || isAgent);
    show(adminBtn, isAdmin);

    openView("chat");
    setActiveMenu("chat");
  }

  refreshDebug();
}

/*************************************************
 * ✅ Fetch current user
 *************************************************/
async function fetchMe() {
  if (!token) return null;
  try {
    const me = await fetchJson(API.ME, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return me;
  } catch {
    token = null;
    localStorage.removeItem("token");
    return null;
  }
}

/*************************************************
 * ✅ Categories dropdown
 *************************************************/
async function loadCategories() {
  const select = $("categorySelect");
  if (!select) return;

  try {
    const cats = await fetchJson(API.CATEGORIES);
    select.innerHTML = "";

    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.key} — ${c.name}`;
      select.appendChild(opt);
    });

    if (!cats.some(c => c.key === companyId)) companyId = cats[0]?.key || "demo";
    select.value = companyId;

    // also update other dropdowns
    const inboxCat = $("inboxCategoryFilter");
    const kbCat = $("kbCategorySelect");
    if (inboxCat) {
      inboxCat.innerHTML = `<option value="">Alla kategorier</option>`;
      cats.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = c.key;
        inboxCat.appendChild(opt);
      });
    }

    if (kbCat) {
      kbCat.innerHTML = "";
      cats.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = c.key;
        kbCat.appendChild(opt);
      });
      kbCat.value = companyId;
    }

  } catch (e) {
    console.error("Categories error:", e);
  }
}

/*************************************************
 * ✅ Chat rendering
 *************************************************/
function addMessage(role, content, meta = "") {
  const messagesDiv = $("messages");
  if (!messagesDiv) return;

  const safe = escapeHtml(content);
  const isUser = role === "user";
  const icon = isUser ? "fa-user" : (role === "agent" ? "fa-user-tie" : "fa-robot");

  const wrapper = document.createElement("div");
  wrapper.className = `msg ${isUser ? "user" : "ai"}`;

  wrapper.innerHTML = `
    <div class="avatar"><i class="fa-solid ${icon}"></i></div>
    <div>
      <div class="bubble">${safe}</div>
      ${meta ? `<div class="msgMeta">${escapeHtml(meta)}</div>` : ""}
      ${!isUser ? `
        <div class="bubbleActions">
          <button class="actionBtn" data-action="copy"><i class="fa-solid fa-copy"></i> Kopiera</button>
        </div>
      ` : ""}
    </div>
  `;

  messagesDiv.appendChild(wrapper);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  const copyBtn = wrapper.querySelector('[data-action="copy"]');
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(content);
      copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Kopierad`;
      setTimeout(() => (copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Kopiera`), 1200);
    });
  }
}

function showTyping() {
  const messagesDiv = $("messages");
  if (!messagesDiv) return;

  const existing = document.getElementById("typing");
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "typing";
  wrapper.className = "msg ai";
  wrapper.innerHTML = `
    <div class="avatar"><i class="fa-solid fa-robot"></i></div>
    <div><div class="bubble">AI skriver…</div></div>
  `;

  messagesDiv.appendChild(wrapper);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

/*************************************************
 * ✅ Chat utilities
 *************************************************/
function clearChat() {
  if ($("messages")) $("messages").innerHTML = "";
}

function exportChat() {
  const messagesDiv = $("messages");
  if (!messagesDiv) return;

  const text = messagesDiv.innerText.trim();
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `chat_${companyId}_${new Date().toISOString().split("T")[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function gatherConversationFromUI() {
  const messagesDiv = $("messages");
  if (!messagesDiv) return [];

  const all = [];
  const nodes = messagesDiv.querySelectorAll(".msg");

  nodes.forEach((node) => {
    const isUser = node.classList.contains("user");
    const bubble = node.querySelector(".bubble");
    if (!bubble) return;

    const content = bubble.innerText.trim();
    if (!content || content === "AI skriver…") return;

    all.push({ role: isUser ? "user" : "assistant", content });
  });

  return all.slice(-12);
}

async function startNewTicket() {
  ticketId = null;
  clearChat();
  addMessage("assistant", "Nytt ärende skapat ✅ Vad kan jag hjälpa dig med?");
  refreshDebug();
}

/*************************************************
 * ✅ Send message
 *************************************************/
async function sendMessage() {
  const input = $("messageInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  addMessage("user", text);
  input.value = "";
  showTyping();

  try {
    const conversation = gatherConversationFromUI();
    conversation.push({ role: "user", content: text });

    const data = await fetchJson(API.CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        companyId,
        conversation,
        ticketId
      })
    });

    hideTyping();

    ticketId = data.ticketId || ticketId;
    lastRagUsed = !!data.ragUsed;
    refreshDebug();

    addMessage("assistant", data.reply || "Inget svar.", data.ragUsed ? "Svar baserat på kunskapsdatabas (RAG)" : "");
  } catch (e) {
    hideTyping();
    addMessage("assistant", `Serverfel: ${e.message || "Okänt fel"}`);
    console.error(e);
  }
}

/*************************************************
 * ✅ Category change
 *************************************************/
function setCompanyFromSelect(value) {
  $("categorySelect")?.classList.remove("categoryNotif");
  companyId = value || "demo";
  applyCompanyToUI();

  ticketId = null;
  clearChat();
  addMessage("assistant", `Du bytte kategori till "${companyId}". Vad vill du fråga?`);
  refreshDebug();
}

/*************************************************
 * ✅ Feedback (ALL users)
 *************************************************/
async function sendFeedback(type) {
  try {
    const data = await fetchJson(API.FEEDBACK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ type, companyId })
    });
    setText($("fbMsg"), data.message || "Feedback skickad ✅");
    setTimeout(() => setText($("fbMsg"), ""), 1400);
  } catch (e) {
    setText($("fbMsg"), e.message || "Fel vid feedback");
    setTimeout(() => setText($("fbMsg"), ""), 1600);
  }
}

/*************************************************
 * ✅ My Tickets (User)
 *************************************************/
async function loadMyTickets() {
  const list = $("myTicketsList");
  const details = $("myTicketDetails");
  if (list) list.innerHTML = "";
  if (details) details.innerHTML = `<div class="muted small">Välj ett ärende.</div>`;

  try {
    const tickets = await fetchJson(API.MY_TICKETS, {
      headers: { Authorization: `Bearer ${token}` }
    });

    setText($("myTicketsHint"), `${tickets.length} st`);

    if (!tickets.length) {
      list.innerHTML = `<div class="muted small">Du har inga ärenden ännu.</div>`;
      return;
    }

    tickets.forEach((t) => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(t.title || "Ärende")}
          <span class="pill">${escapeHtml(t.status)}</span>
        </div>
        <div class="muted small">${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.lastActivityAt))}</div>
      `;

      div.addEventListener("click", async () => {
        mySelectedTicketId = t._id;
        await loadMyTicketDetails(t._id);
      });

      list.appendChild(div);
    });
  } catch (e) {
    console.error("My tickets error:", e);
    if (list) list.innerHTML = `<div class="muted small">Kunde inte ladda tickets.</div>`;
  }
}

async function loadMyTicketDetails(id) {
  const details = $("myTicketDetails");
  if (!details) return;

  details.innerHTML = `<div class="muted small">Laddar…</div>`;

  try {
    const t = await fetchJson(API.MY_TICKET(id), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const msgs = (t.messages || []).slice(-80);
    const html = msgs.map((m) => {
      const label = m.role === "user" ? "Du" : (m.role === "agent" ? "Agent" : "AI");
      return `
        <div class="ticketMsg ${escapeHtml(m.role)}">
          <div class="ticketMsgHead">
            <b>${label}</b>
            <span>${escapeHtml(formatDate(m.timestamp))}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
        </div>
      `;
    }).join("");

    details.innerHTML = `
      <div class="muted small">
        <b>ID:</b> ${escapeHtml(t._id)} • <b>Status:</b> ${escapeHtml(t.status)} • <b>Kategori:</b> ${escapeHtml(t.companyId)}
      </div>
      <div class="divider"></div>
      ${html || `<div class="muted small">Inga meddelanden.</div>`}
    `;
  } catch (e) {
    details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
  }
}

/*************************************************
 * ✅ Polling (live notifiering vid agent-svar)
 *************************************************/
let lastMyTicketSnapshot = {};

async function pollMyTickets() {

  async function pollAdminInbox() {
  if (!token || !currentUser) return;
  const isAdminOrAgent = ["admin", "agent"].includes(currentUser.role);
  if (!isAdminOrAgent) return;

  try {
    const tickets = await fetchJson(API.ADMIN_TICKETS, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Reset map
    categoryNotifMap = {};

    let hasNew = false;

    tickets.forEach((t) => {
      const nowTs = new Date(t.lastActivityAt).getTime();
      const prev = lastAdminTicketSnapshot[t._id];

      if (prev && nowTs > prev) {
        hasNew = true;
        categoryNotifMap[t.companyId] = true;
      }
      lastAdminTicketSnapshot[t._id] = nowTs;
    });

    // Inbox highlight + dot
    const inboxBtn = $("openInboxView");
    const dot = $("inboxNotifDot");

    if (hasNew) {
      inboxBtn?.classList.add("hasNotif");
      if (dot) dot.style.display = "";
    }

    // Category dropdown highlight
    const catSelect = $("categorySelect");
    if (catSelect) {
      // remove any highlight
      catSelect.classList.remove("categoryNotif");

      if (categoryNotifMap[catSelect.value]) {
        catSelect.classList.add("categoryNotif");
      }
    }

  } catch (e) {
    // ignore
  }
}

  if (!token || !currentUser) return;

  try {
    const tickets = await fetchJson(API.MY_TICKETS, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // detect new activity on any ticket
    tickets.forEach((t) => {
      const prev = lastMyTicketSnapshot[t._id];
      const nowTs = new Date(t.lastActivityAt).getTime();

      if (prev && nowTs > prev) {
        // simple notification: show in chat subtitle
        const sub = $("chatSubtitle");
        if (sub) {
          sub.textContent = "📩 Ny uppdatering i ett ärende (agent/AI svar).";
          setTimeout(() => applyCompanyToUI(), 2500);
        }
      }
      lastMyTicketSnapshot[t._id] = nowTs;
    });

    // if user currently views myTickets, auto-refresh
    if ($("myTicketsView")?.style.display !== "none") {
      await loadMyTickets();
      if (mySelectedTicketId) await loadMyTicketDetails(mySelectedTicketId);
    }

  } catch (e) {
    // ignore polling errors
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    await pollMyTickets();
    await pollAdminInbox();
  }, 8000);
}


function stopPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
}

/*************************************************
 * ✅ Inbox (Agent/Admin)
 *************************************************/

async function deleteOneInternalNote(noteId) {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  try {
    await fetchJson(API.ADMIN_TICKET_NOTE_DELETE(inboxSelectedTicketId, noteId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    setAlert(msgEl, "Notering borttagen ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    setAlert(msgEl, e.message || "Fel vid borttagning", true);
  }
}

async function clearAllInternalNotes() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  const ok = confirm("Ta bort ALLA interna notes på denna ticket?");
  if (!ok) return;

  try {
    await fetchJson(API.ADMIN_TICKET_NOTES_CLEAR(inboxSelectedTicketId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    setAlert(msgEl, "Alla notes borttagna ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    setAlert(msgEl, e.message || "Fel vid rensning", true);
  }
}


async function inboxLoadTickets() {
  const list = $("inboxTicketsList");
  const msg = $("inboxMsg");
  setAlert(msg, "");
  if (list) list.innerHTML = "";

  const status = $("inboxStatusFilter")?.value || "";
  const cat = $("inboxCategoryFilter")?.value || "";
  const q = ($("inboxSearchInput")?.value || "").trim().toLowerCase();

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (cat) params.set("companyId", cat);

  try {
    const data = await fetchJson(`${API.ADMIN_TICKETS}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const filtered = !q ? data : data.filter((t) => {
      const a = String(t.title || "").toLowerCase();
      const b = String(t.companyId || "").toLowerCase();
      const c = String(t._id || "").toLowerCase();
      return a.includes(q) || b.includes(q) || c.includes(q);
    });

    if (!filtered.length) {
      list.innerHTML = `<div class="muted small">Inga tickets hittades.</div>`;
      return;
    }

    filtered.forEach((t) => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(t.title || "Ticket")}
          <span class="pill">${escapeHtml(t.status)}</span>
        </div>
        <div class="muted small">${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.lastActivityAt))}</div>
      `;

      div.addEventListener("click", async () => {
        inboxSelectedTicketId = t._id;
        await inboxLoadTicketDetails(t._id);
        await inboxLoadTickets();
      });

      list.appendChild(div);
    });

  } catch (e) {
    console.error("Inbox error:", e);
    setAlert(msg, "Serverfel vid inbox (kolla Console / Network)", true);
  }
}

async function inboxLoadTicketDetails(id) {
  const details = $("ticketDetails");
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");

  if (!details) return;
  details.innerHTML = `<div class="muted small">Laddar ticket…</div>`;

  try {
    const t = await fetchJson(API.ADMIN_TICKET(id), {
      headers: { Authorization: `Bearer ${token}` }
    });

    // update priority select
    const pr = $("ticketPrioritySelect");
    if (pr) pr.value = t.priority || "normal";

    const msgs = (t.messages || []).slice(-80);
    const html = msgs.map((m) => {
      const roleLabel = m.role === "user" ? "Kund" : (m.role === "agent" ? "Agent" : "AI");
      return `
        <div class="ticketMsg ${escapeHtml(m.role)}">
          <div class="ticketMsgHead">
            <b>${roleLabel}</b>
            <span>${escapeHtml(formatDate(m.timestamp))}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
        </div>
      `;
    }).join("");

    const notes = (t.internalNotes || []).slice(-20).map((n) => {
  return `<div class="ticketMsg">
    <div class="ticketMsgHead">
      <b>Intern note</b>
      <span>${escapeHtml(formatDate(n.createdAt))}</span>
    </div>
    <div class="ticketMsgBody">${escapeHtml(n.content)}</div>
    <div class="row" style="margin-top:8px;">
      <button class="btn danger small" onclick="deleteOneInternalNote('${n._id}')">
        <i class="fa-solid fa-trash"></i> Ta bort
      </button>
    </div>
  </div>`;
}).join("");


    details.innerHTML = `
      <div class="muted small">
        <b>ID:</b> ${escapeHtml(t._id)} • <b>Kategori:</b> ${escapeHtml(t.companyId)}
        • <b>Status:</b> ${escapeHtml(t.status)} • <b>Prioritet:</b> ${escapeHtml(t.priority)}
      </div>

      <div class="divider"></div>
      ${html || `<div class="muted small">Inga meddelanden.</div>`}

      <div class="divider"></div>
      <b class="muted small">Interna notes (syns ej för kund)</b>
      ${notes || `<div class="muted small">Inga notes.</div>`}
    `;
  } catch (e) {
    console.error(e);
    details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
    setAlert(msg, e.message || "Fel vid ticket", true);
  }
}

async function inboxSetStatus(status) {
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");

  if (!inboxSelectedTicketId) return setAlert(msg, "Välj en ticket först.", true);

  try {
    await fetchJson(API.ADMIN_TICKET_STATUS(inboxSelectedTicketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });

    setAlert(msg, "Status uppdaterad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch (e) {
    setAlert(msg, e.message || "Serverfel vid status", true);
  }
}

async function inboxSetPriority() {
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");
  if (!inboxSelectedTicketId) return setAlert(msg, "Välj en ticket först.", true);

  const priority = $("ticketPrioritySelect")?.value || "normal";

  try {
    await fetchJson(API.ADMIN_TICKET_PRIORITY(inboxSelectedTicketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ priority })
    });

    setAlert(msg, "Prioritet sparad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch (e) {
    setAlert(msg, e.message || "Serverfel vid prioritet", true);
  }
}

async function inboxSendAgentReply() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  const content = $("agentReplyTextInbox")?.value?.trim();
  if (!content) return setAlert(msgEl, "Skriv ett svar först.", true);

  try {
    await fetchJson(API.ADMIN_TICKET_REPLY(inboxSelectedTicketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content })
    });

    $("agentReplyTextInbox").value = "";
    setAlert(msgEl, "Agent-svar skickat ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid agent-svar", true);
  }
}

async function inboxSaveInternalNote() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  const content = $("internalNoteText")?.value?.trim();
  if (!content) return setAlert(msgEl, "Skriv en note först.", true);

  try {
    await fetchJson(API.ADMIN_TICKET_NOTE(inboxSelectedTicketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content })
    });

    $("internalNoteText").value = "";
    setAlert(msgEl, "Intern note sparad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid note", true);
  }
}

async function inboxAssignTicket() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");
  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  const userId = $("assignUserSelect")?.value || "";
  if (!userId) return setAlert(msgEl, "Välj en agent/admin först.", true);

  try {
    await fetchJson(API.ADMIN_TICKET_ASSIGN(inboxSelectedTicketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId })
    });

    setAlert(msgEl, "Ticket assignad ✅");
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid assign", true);
  }
}

async function inboxDeleteTicket() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  const ok = confirm("Vill du verkligen ta bort denna ticket? Detta går inte att ångra.");
  if (!ok) return;

  try {
    await fetchJson(API.ADMIN_TICKET_DELETE(inboxSelectedTicketId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    setAlert(msgEl, "Ticket borttagen ✅");
    inboxSelectedTicketId = null;
    $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
    await inboxLoadTickets();
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Admin: Users + roles
 *************************************************/
async function adminLoadUsers() {
  const msgEl = $("adminUsersMsg");
  const list = $("adminUsersList");
  setAlert(msgEl, "");
  if (list) list.innerHTML = "";

  try {
    const users = await fetchJson(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Fill assign dropdown with agent/admin
    const assignSel = $("assignUserSelect");
    if (assignSel) {
      assignSel.innerHTML = `<option value="">Välj agent...</option>`;
      users
        .filter(u => ["admin", "agent"].includes(u.role))
        .forEach((u) => {
          const opt = document.createElement("option");
          opt.value = u._id;
          opt.textContent = `${u.username} (${u.role})`;
          assignSel.appendChild(opt);
        });
    }

    users.forEach((u) => {
      const div = document.createElement("div");
      div.className = "listItem";

      const isSelf = String(u._id) === String(currentUser?.id);
      const isAdmin = u.role === "admin";

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(u.username)}
          <span class="pill ${isAdmin ? "admin" : ""}">${escapeHtml(u.role)}</span>
        </div>
        <div class="muted small">ID: ${escapeHtml(u._id)}</div>
        ${u.email ? `<div class="muted small">Email: ${escapeHtml(u.email)}</div>` : ""}

        <div class="row gap" style="margin-top:10px;">
          <select class="input smallInput" data-action="roleSelect" ${isSelf ? "disabled" : ""}>
            <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
            <option value="agent" ${u.role === "agent" ? "selected" : ""}>agent</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
          </select>

          <button class="btn secondary small" data-action="saveRole" ${isSelf ? "disabled style='opacity:.6;cursor:not-allowed;'" : ""}>
            <i class="fa-solid fa-floppy-disk"></i> Spara
          </button>

          <button class="btn danger small" data-action="deleteUser" ${isSelf ? "disabled style='opacity:.6;cursor:not-allowed;'" : ""}>
            <i class="fa-solid fa-trash"></i> Ta bort
          </button>
        </div>
      `;

      div.querySelector('[data-action="saveRole"]')?.addEventListener("click", async () => {
        if (isSelf) return;
        const role = div.querySelector('[data-action="roleSelect"]')?.value || "user";
        await adminSetUserRole(u._id, role);
        await adminLoadUsers();
      });

      div.querySelector('[data-action="deleteUser"]')?.addEventListener("click", async () => {
        if (isSelf) return;
        const ok = confirm(`Vill du verkligen ta bort "${u.username}"?`);
        if (!ok) return;
        await adminDeleteUser(u._id);
        await adminLoadUsers();
      });

      list.appendChild(div);
    });

  } catch (e) {
    console.error("Users error:", e);
    setAlert(msgEl, e.message || "Kunde inte hämta users", true);
  }
}

async function adminSetUserRole(userId, role) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const data = await fetchJson(API.ADMIN_USER_ROLE(userId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role })
    });

    setAlert(msgEl, data.message || "Roll uppdaterad ✅");
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid roll", true);
  }
}

async function adminDeleteUser(userId) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const data = await fetchJson(API.ADMIN_DELETE_USER(userId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    setAlert(msgEl, data.message || "User borttagen ✅");
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ KB Manager (Admin)
 *************************************************/
function kbActiveCategory() {
  return $("kbCategorySelect")?.value || companyId || "demo";
}

async function kbRefreshList() {
  const list = $("kbList");
  if (list) list.innerHTML = "";
  setAlert($("kbMsg"), "");

  const cat = kbActiveCategory();

  try {
    const items = await fetchJson(API.KB_LIST(cat), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!items.length) {
      list.innerHTML = `<div class="muted small">Ingen kunskap uppladdad för denna kategori.</div>`;
      return;
    }

    items.slice(0, 40).forEach((item) => {
      const div = document.createElement("div");
      div.className = "listItem";
      const preview = (item.content || "").slice(0, 160);

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(item.title || item.sourceRef || "KB")}
          <span class="pill">${escapeHtml(item.sourceType)}</span>
        </div>
        <div class="muted small">${escapeHtml(item.sourceRef || "")}</div>
        <div class="muted small">${item.embeddingOk ? "Vector ✅" : "Vector ❌"} • v${item.version || 1}</div>
        <div class="muted small" style="margin-top:6px;">${escapeHtml(preview)}...</div>
      `;
      list.appendChild(div);
    });

  } catch (e) {
    console.error("KB list error:", e);
    setAlert($("kbMsg"), e.message || "Serverfel vid KB-lista", true);
  }
}

async function kbUploadText() {
  const cat = kbActiveCategory();
  const title = $("kbTextTitle")?.value?.trim() || "Text";
  const content = $("kbTextContent")?.value?.trim() || "";

  if (!content || content.length < 30) {
    setAlert($("kbMsg"), "Skriv mer text (minst ~30 tecken).", true);
    return;
  }

  setAlert($("kbMsg"), "Laddar upp text…");

  try {
    const data = await fetchJson(API.KB_TEXT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: cat, title, content })
    });

    setAlert($("kbMsg"), data.message || "Text uppladdad ✅");
    $("kbTextContent").value = "";
    kbRefreshList();
  } catch (e) {
    setAlert($("kbMsg"), e.message || "Fel vid text-upload", true);
  }
}

async function kbUploadUrl() {
  const cat = kbActiveCategory();
  const url = $("kbUrlInput")?.value?.trim() || "";

  if (!url.startsWith("http")) {
    setAlert($("kbMsg"), "Ange en riktig URL som börjar med http/https", true);
    return;
  }

  setAlert($("kbMsg"), "Hämtar URL och extraherar text…");

  try {
    const data = await fetchJson(API.KB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: cat, url })
    });

    setAlert($("kbMsg"), data.message || "URL uppladdad ✅");
    $("kbUrlInput").value = "";
    kbRefreshList();
  } catch (e) {
    setAlert($("kbMsg"), e.message || "Fel vid URL-upload", true);
  }
}

async function kbUploadPdf() {
  const cat = kbActiveCategory();
  const file = $("kbPdfFile")?.files?.[0];

  if (!file) {
    setAlert($("kbMsg"), "Välj en PDF först.", true);
    return;
  }

  setAlert($("kbMsg"), "Läser PDF…");

  const base64 = await readFileAsBase64(file);

  try {
    const data = await fetchJson(API.KB_PDF, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: cat, filename: file.name, base64 })
    });

    setAlert($("kbMsg"), data.message || "PDF uppladdad ✅");
    $("kbPdfFile").value = "";
    kbRefreshList();
  } catch (e) {
    setAlert($("kbMsg"), e.message || "Fel vid PDF-upload", true);
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result || "";
      const base64 = String(result).split(",")[1] || "";
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function kbExport() {
  const cat = kbActiveCategory();
  window.open(API.KB_EXPORT(cat), "_blank");
}

/*************************************************
 * ✅ Admin: Categories manager
 *************************************************/
async function catsRefresh() {
  const list = $("catsList");
  if (list) list.innerHTML = "";
  setAlert($("catsMsg"), "");

  try {
    const cats = await fetchJson(API.ADMIN_CATEGORIES, {
      headers: { Authorization: `Bearer ${token}` }
    });

    cats.forEach((c) => {
      const div = document.createElement("div");
      div.className = "listItem";

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(c.key)} — ${escapeHtml(c.name)}
        </div>
        <div class="muted small">Prompt:</div>
        <textarea class="input textarea" data-action="prompt">${escapeHtml(c.systemPrompt || "")}</textarea>
        <div class="row gap" style="margin-top:10px;">
          <input class="input smallInput" data-action="name" value="${escapeHtml(c.name || "")}" />
          <button class="btn secondary small" data-action="save">
            <i class="fa-solid fa-floppy-disk"></i> Spara
          </button>
          <button class="btn danger small" data-action="del">
            <i class="fa-solid fa-trash"></i> Ta bort
          </button>
        </div>
      `;

      div.querySelector('[data-action="save"]')?.addEventListener("click", async () => {
        const name = div.querySelector('[data-action="name"]')?.value?.trim() || "";
        const systemPrompt = div.querySelector('[data-action="prompt"]')?.value || "";
        await catsUpdate(c.key, name, systemPrompt);
        await loadCategories();
        await catsRefresh();
      });

      div.querySelector('[data-action="del"]')?.addEventListener("click", async () => {
        const ok = confirm(`Ta bort kategori "${c.key}"?`);
        if (!ok) return;
        await catsDelete(c.key);
        await loadCategories();
        await catsRefresh();
      });

      list.appendChild(div);
    });

  } catch (e) {
    console.error("Cats error:", e);
    setAlert($("catsMsg"), e.message || "Serverfel vid kategorier", true);
  }
}

async function catsCreate() {
  setAlert($("catsMsg"), "");

  const key = $("newCatKey")?.value?.trim();
  const name = $("newCatName")?.value?.trim();
  const systemPrompt = $("newCatPrompt")?.value || "";

  if (!key || !name) return setAlert($("catsMsg"), "Key + name krävs", true);

  try {
    const data = await fetchJson(API.ADMIN_CATEGORIES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, name, systemPrompt })
    });

    setAlert($("catsMsg"), data.message || "Kategori skapad ✅");
    $("newCatKey").value = "";
    $("newCatName").value = "";
    $("newCatPrompt").value = "";
    await loadCategories();
    await catsRefresh();
  } catch (e) {
    setAlert($("catsMsg"), e.message || "Serverfel vid skapa kategori", true);
  }
}

async function catsUpdate(key, name, systemPrompt) {
  setAlert($("catsMsg"), "");
  try {
    const data = await fetchJson(`${API.ADMIN_CATEGORIES}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, systemPrompt })
    });
    setAlert($("catsMsg"), data.message || "Uppdaterad ✅");
  } catch (e) {
    setAlert($("catsMsg"), e.message || "Serverfel vid update", true);
  }
}

async function catsDelete(key) {
  setAlert($("catsMsg"), "");
  try {
    const data = await fetchJson(`${API.ADMIN_CATEGORIES}/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    setAlert($("catsMsg"), data.message || "Borttagen ✅");
  } catch (e) {
    setAlert($("catsMsg"), e.message || "Serverfel vid delete", true);
  }
}

/*************************************************
 * ✅ Admin exports + cleanup
 *************************************************/
function adminExportAll() {
  window.open(API.ADMIN_EXPORT_ALL, "_blank");
}
function trainingExport() {
  window.open(`${API.ADMIN_EXPORT_TRAINING}?companyId=${encodeURIComponent(companyId)}`, "_blank");
}
async function cleanupSolvedTickets() {

async function solveAllTickets() {
  const ok = confirm("Vill du markera ALLA tickets som SOLVED?");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKETS_SOLVE_ALL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    alert(data.message || "Alla tickets solved ✅");
    await inboxLoadTickets();
  } catch (e) {
    alert(e.message || "Fel vid Solve ALL");
  }
}

async function removeAllSolvedTickets() {
  const ok = confirm("Vill du TA BORT alla solved tickets? (kan inte ångras)");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKETS_REMOVE_SOLVED, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    alert(data.message || "Alla solved borttagna ✅");
    await inboxLoadTickets();
  } catch (e) {
    alert(e.message || "Fel vid Remove solved");
  }
}
  
  try {
    const data = await fetchJson(API.ADMIN_TICKETS_CLEANUP_SOLVED, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    alert(data.message || "Rensat ✅");
    await inboxLoadTickets();
  } catch (e) {
    alert(e.message || "Fel vid cleanup");
  }
}

/*************************************************
 * ✅ Settings (change username/password)
 *************************************************/
async function changeUsername() {
  setAlert($("settingsMsg"), "");
  const newUsername = $("newUsernameInput")?.value?.trim();
  if (!newUsername) return setAlert($("settingsMsg"), "Skriv nytt användarnamn", true);

  try {
    const data = await fetchJson(API.AUTH_CHANGE_USERNAME, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newUsername })
    });
    setAlert($("settingsMsg"), data.message || "Uppdaterat ✅");
    currentUser = await fetchMe();
    applyAuthUI();
  } catch (e) {
    setAlert($("settingsMsg"), e.message || "Fel vid username", true);
  }
}

async function changePassword() {
  setAlert($("settingsMsg"), "");
  const currentPassword = $("currentPassInput")?.value?.trim();
  const newPassword = $("newPassInput")?.value?.trim();
  if (!currentPassword || !newPassword) return setAlert($("settingsMsg"), "Fyll i båda fälten", true);

  try {
    const data = await fetchJson(API.AUTH_CHANGE_PASSWORD, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    setAlert($("settingsMsg"), data.message || "Lösenord uppdaterat ✅");
    $("currentPassInput").value = "";
    $("newPassInput").value = "";
  } catch (e) {
    setAlert($("settingsMsg"), e.message || "Fel vid lösenord", true);
  }
}

/*************************************************
 * ✅ Forgot/Reset UI
 *************************************************/
function getResetTokenFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return p.get("resetToken");
}

function togglePass(inputId) {
  const inp = $(inputId);
  if (!inp) return;
  inp.type = inp.type === "password" ? "text" : "password";
}

async function sendForgotEmail() {
  setAlert($("forgotMsg"), "");
  const email = $("forgotEmail")?.value?.trim();
  if (!email) return setAlert($("forgotMsg"), "Skriv din email", true);

  try {
    const data = await fetchJson(API.AUTH_FORGOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    setAlert($("forgotMsg"), data.message || "Länk skickad ✅");
  } catch (e) {
    setAlert($("forgotMsg"), e.message || "Fel vid mail", true);
  }
}

async function saveResetPassword() {
  setAlert($("resetMsg"), "");
  const resetToken = getResetTokenFromUrl();
  const newPassword = $("resetNewPass")?.value?.trim();
  if (!resetToken) return setAlert($("resetMsg"), "Reset-token saknas", true);
  if (!newPassword) return setAlert($("resetMsg"), "Skriv nytt lösenord", true);

  try {
    const data = await fetchJson(API.AUTH_RESET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetToken, newPassword })
    });

    setAlert($("resetMsg"), data.message || "Reset klar ✅");
  } catch (e) {
    setAlert($("resetMsg"), e.message || "Fel vid reset", true);
  }
}

/*************************************************
 * ✅ Auth actions
 *************************************************/
async function login() {
  setAlert($("authMessage"), "");
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();

  if (!username || !password) return setAlert($("authMessage"), "Fyll i användarnamn + lösenord", true);

  try {
    const data = await fetchJson(API.LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    token = data.token;
    localStorage.setItem("token", token);

    currentUser = await fetchMe();
    applyAuthUI();

    await loadCategories();
    applyCompanyToUI();

    clearChat();
    addMessage("assistant", "Välkommen! Vad kan jag hjälpa dig med?");
    startPolling();
  } catch (e) {
    setAlert($("authMessage"), e.message || "Fel vid login", true);
  }
}

async function register() {
  setAlert($("authMessage"), "");
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();
  const email = $("email")?.value?.trim() || "";

  if (!username || !password) return setAlert($("authMessage"), "Fyll i användarnamn + lösenord", true);

  try {
    const data = await fetchJson(API.REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, email })
    });

    setAlert($("authMessage"), data.message || "Registrering klar ✅ Logga in nu.");
  } catch (e) {
    setAlert($("authMessage"), e.message || "Fel vid registrering", true);
  }
}

function logout() {
  localStorage.removeItem("token");
  token = null;
  currentUser = null;
  ticketId = null;

  inboxSelectedTicketId = null;
  mySelectedTicketId = null;

  stopPolling();
  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Tabs
 *************************************************/
function activateTab(tabId) {
  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));

  document.querySelectorAll(`.tabBtn[data-tab="${tabId}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = "";
}

/*************************************************
 * ✅ Init
 *************************************************/
async function init() {
  // apply company from URL
  const params = new URLSearchParams(window.location.search);
  const c = params.get("company");
  if (c) companyId = c;

  applyCompanyToUI();
  refreshDebug();

  // reset UI
  const resetToken = getResetTokenFromUrl();
  if (resetToken) {
    show($("authView"), true);
    show($("resetCard"), true);
    show($("forgotCard"), false);
    // keep login visible too but reset is shown
  }

  // token check
  if (token) currentUser = await fetchMe();
  applyAuthUI();

  // load categories dropdown always (public)
  await loadCategories();
  applyCompanyToUI();

  // EVENTS - Auth
  $("loginBtn")?.addEventListener("click", login);
  $("registerBtn")?.addEventListener("click", register);
  $("logoutBtn")?.addEventListener("click", logout);

  $("togglePassBtn")?.addEventListener("click", () => togglePass("password"));
  $("toggleResetPassBtn")?.addEventListener("click", () => togglePass("resetNewPass"));

  $("openForgotBtn")?.addEventListener("click", () => {
    show($("forgotCard"), true);
  });
  $("closeForgotBtn")?.addEventListener("click", () => {
    show($("forgotCard"), false);
    setAlert($("forgotMsg"), "");
  });

  $("sendForgotBtn")?.addEventListener("click", sendForgotEmail);
  $("resetSaveBtn")?.addEventListener("click", saveResetPassword);

  // Theme
  $("themeToggle")?.addEventListener("click", toggleTheme);

  // Debug toggle
  $("toggleDebugBtn")?.addEventListener("click", () => {
    const p = $("debugPanel");
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
  });

  // Menu view switches
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("chat");
    openView("chat");
  });

  $("openMyTicketsView")?.addEventListener("click", async () => {
    setActiveMenu("myTickets");
    openView("myTickets");
    await loadMyTickets();
  });

  $("openInboxView")?.addEventListener("click", async () => {
  // reset notif
  $("openInboxView")?.classList.remove("hasNotif");
  if ($("inboxNotifDot")) $("inboxNotifDot").style.display = "none";

  setActiveMenu("inbox");
  openView("inbox");
  await inboxLoadTickets();
  await adminLoadUsers();
});


  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("admin");
    openView("admin");
    await adminLoadUsers();
    await kbRefreshList();
    await catsRefresh();
  });

  $("openSettingsView")?.addEventListener("click", () => {
    setActiveMenu("settings");
    openView("settings");
  });

  // Category select
  $("categorySelect")?.addEventListener("change", (e) => setCompanyFromSelect(e.target.value));

  // Chat actions
  $("sendBtn")?.addEventListener("click", sendMessage);
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  $("newTicketBtn")?.addEventListener("click", startNewTicket);
  $("clearChatBtn")?.addEventListener("click", clearChat);
  $("exportChatBtn")?.addEventListener("click", exportChat);

  // Feedback
  $("fbUp")?.addEventListener("click", () => sendFeedback("positive"));
  $("fbDown")?.addEventListener("click", () => sendFeedback("negative"));

  // My tickets refresh
  $("myTicketsRefreshBtn")?.addEventListener("click", loadMyTickets);

  // Inbox actions
  $("inboxRefreshBtn")?.addEventListener("click", inboxLoadTickets);
  $("solveAllBtn")?.addEventListener("click", solveAllTickets);
$("removeSolvedBtn")?.addEventListener("click", removeAllSolvedTickets);
  $("inboxStatusFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxCategoryFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxSearchInput")?.addEventListener("input", inboxLoadTickets);

  $("setStatusOpen")?.addEventListener("click", () => inboxSetStatus("open"));
  $("setStatusPending")?.addEventListener("click", () => inboxSetStatus("pending"));
  $("setStatusSolved")?.addEventListener("click", () => inboxSetStatus("solved"));
  $("sendAgentReplyInboxBtn")?.addEventListener("click", inboxSendAgentReply);
  $("setPriorityBtn")?.addEventListener("click", inboxSetPriority);
  $("saveInternalNoteBtn")?.addEventListener("click", inboxSaveInternalNote);
  $("clearInternalNotesBtn")?.addEventListener("click", clearAllInternalNotes);
  $("assignTicketBtn")?.addEventListener("click", inboxAssignTicket);
  $("deleteTicketBtn")?.addEventListener("click", inboxDeleteTicket);

  // Admin exports + cleanup
  $("adminExportAllBtn")?.addEventListener("click", adminExportAll);
  $("trainingExportBtn")?.addEventListener("click", trainingExport);
  $("cleanupSolvedBtn")?.addEventListener("click", cleanupSolvedTickets);

  // KB
  $("kbRefreshBtn")?.addEventListener("click", kbRefreshList);
  $("kbExportBtn")?.addEventListener("click", kbExport);
  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);
  $("kbCategorySelect")?.addEventListener("change", kbRefreshList);

  // Admin users refresh
  $("adminUsersRefreshBtn")?.addEventListener("click", adminLoadUsers);

  // Categories manager
  $("catsRefreshBtn")?.addEventListener("click", catsRefresh);
  $("createCatBtn")?.addEventListener("click", catsCreate);

  // Tabs
  document.querySelectorAll(".tabBtn").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  // Settings actions
  $("changeUsernameBtn")?.addEventListener("click", changeUsername);
  $("changePasswordBtn")?.addEventListener("click", changePassword);

  // If logged in: start polling
  if (token && currentUser) startPolling();
}

document.addEventListener("DOMContentLoaded", init);
