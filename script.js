/*************************************************
 * ✅ API base
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API = {
  ME: `${API_BASE}/me`,
  LOGIN: `${API_BASE}/login`,
  REGISTER: `${API_BASE}/register`,

  CHAT: `${API_BASE}/chat`,
  FEEDBACK: `${API_BASE}/feedback`,

  CHANGE_USERNAME: `${API_BASE}/auth/change-username`,
  CHANGE_PASSWORD: `${API_BASE}/auth/change-password`,
  FORGOT: `${API_BASE}/auth/forgot-password`,
  RESET: `${API_BASE}/auth/reset-password`,

  ADMIN_USERS: `${API_BASE}/admin/users`,
  ADMIN_USER_ROLE: (id) => `${API_BASE}/admin/users/${id}/role`,
  ADMIN_DELETE_USER: (id) => `${API_BASE}/admin/users/${id}`,

  ADMIN_TICKETS: `${API_BASE}/admin/tickets`,
  ADMIN_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_TICKET_STATUS: (id) => `${API_BASE}/admin/tickets/${id}/status`,
  ADMIN_TICKET_PRIORITY: (id) => `${API_BASE}/admin/tickets/${id}/priority`,
  ADMIN_TICKET_REPLY: (id) => `${API_BASE}/admin/tickets/${id}/agent-reply`,
  ADMIN_TICKET_DELETE: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_CLEANUP_SOLVED: `${API_BASE}/admin/tickets/cleanup-solved`,

  ADMIN_EXPORT_ALL: `${API_BASE}/admin/export/all`,
  ADMIN_EXPORT_TRAINING: `${API_BASE}/admin/export/training`,

  ADMIN_CATEGORIES: `${API_BASE}/admin/categories`,
  ADMIN_CATEGORY: (key) => `${API_BASE}/admin/categories/${key}`,

  KB_LIST: (companyId) => `${API_BASE}/kb/list/${companyId}`,
  KB_TEXT: `${API_BASE}/kb/upload-text`,
  KB_URL: `${API_BASE}/kb/upload-url`,
  KB_PDF: `${API_BASE}/kb/upload-pdf`,
  KB_EXPORT: (companyId) => `${API_BASE}/export/kb/${companyId}`,
};

/*************************************************
 * ✅ App state
 *************************************************/
let token = localStorage.getItem("token") || null;
let currentUser = null; // {id, username, role, email}
let companyId = "demo";
let ticketId = null;
let lastRagUsed = null;
let categoriesCache = []; // [{key,name,systemPrompt}]

// Inbox state
let inboxSelectedTicketId = null;

/*************************************************
 * ✅ DOM helpers
 *************************************************/
const $ = (id) => document.getElementById(id);

function show(el, yes = true) {
  if (!el) return;
  el.style.display = yes ? "" : "none";
}

function setText(el, txt) {
  if (el) el.textContent = txt;
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
    .replaceAll(">", "&gt;");
}

function formatDate(d) {
  try { return new Date(d).toLocaleString(); }
  catch { return ""; }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  // om server råkar skicka HTML (t.ex. index.html) så vill vi ha ett tydligt fel
  if (text.startsWith("<!DOCTYPE")) {
    throw new Error(`API returnerade HTML istället för JSON. URL: ${url}`);
  }

  const data = text ? JSON.parse(text) : {};
  return { res, data };
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
 * ✅ View switch
 *************************************************/
function setActiveMenu(btnId) {
  ["openChatView", "openSettingsView", "openInboxView", "openAdminView"].forEach((id) => {
    const btn = $(id);
    if (btn) btn.classList.remove("active");
  });

  if (btnId === "chat") $("openChatView")?.classList.add("active");
  if (btnId === "settings") $("openSettingsView")?.classList.add("active");
  if (btnId === "inbox") $("openInboxView")?.classList.add("active");
  if (btnId === "admin") $("openAdminView")?.classList.add("active");
}

function openView(viewName) {
  show($("authView"), viewName === "auth");
  show($("chatView"), viewName === "chat");
  show($("settingsView"), viewName === "settings");
  show($("inboxView"), viewName === "inbox");
  show($("adminView"), viewName === "admin");
}

/*************************************************
 * ✅ Debug
 *************************************************/
function refreshDebug() {
  setText($("dbgApi"), API_BASE || "(same-origin)");
  setText($("dbgLogged"), token ? "JA" : "NEJ");
  setText($("dbgRole"), currentUser?.role || "-");
  setText($("dbgTicket"), ticketId || "-");
  setText($("dbgRag"), lastRagUsed === null ? "-" : (lastRagUsed ? "JA" : "NEJ"));
}

/*************************************************
 * ✅ Auth UI
 *************************************************/
function applyAuthUI() {
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");
  const inboxBtn = $("openInboxView");
  const adminBtn = $("openAdminView");
  const quickTools = $("quickTools");

  if (!token || !currentUser) {
    openView("auth");
    setText(roleBadge, "Inte inloggad");
    show(logoutBtn, false);
    show(inboxBtn, false);
    show(adminBtn, false);
    show(quickTools, false);
  } else {
    openView("chat");
    setText(roleBadge, `${currentUser.username} • ${String(currentUser.role || "user").toUpperCase()}`);
    show(logoutBtn, true);
    show(quickTools, true);

    const isAdmin = currentUser.role === "admin";
    show(inboxBtn, isAdmin);
    show(adminBtn, isAdmin);

    // settings view is available for all
  }

  refreshDebug();
}

/*************************************************
 * ✅ Fetch current user (/me)
 *************************************************/
async function fetchMe() {
  if (!token) return null;

  try {
    const { res, data } = await fetchJson(API.ME, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      token = null;
      localStorage.removeItem("token");
      return null;
    }

    return data;
  } catch (e) {
    token = null;
    localStorage.removeItem("token");
    return null;
  }
}

/*************************************************
 * ✅ Categories (from DB)
 *************************************************/
async function loadCategories() {
  // för alla users: vi använder admin endpoint bara om admin
  // men för vanliga users kan vi återanvända samma lista från default (fallback)
  // OBS: server.js upsertar defaults, så dessa finns alltid.

  try {
    // För att alla ska kunna läsa kategorier (utan admin) behöver vi en publik endpoint.
    // Om du INTE har den: vi använder fallback list.
    // För att hålla det 100% kompatibelt nu: vi kör fallback i frontend.
    categoriesCache = [
      { key: "demo", name: "Demo AB" },
      { key: "law", name: "Juridik" },
      { key: "tech", name: "Teknisk Support" },
      { key: "cleaning", name: "Städservice" }
    ];

    // Om admin: hämta riktiga kategorier från servern
    if (currentUser?.role === "admin") {
      const { res, data } = await fetchJson(API.ADMIN_CATEGORIES, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && Array.isArray(data)) categoriesCache = data;
    }
  } catch (e) {
    // fallback only
  }

  // populera dropdowns
  const categorySelect = $("categorySelect");
  const inboxCategoryFilter = $("inboxCategoryFilter");
  const kbCategorySelect = $("kbCategorySelect");

  if (categorySelect) {
    categorySelect.innerHTML = "";
    categoriesCache.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.name} (${c.key})`;
      categorySelect.appendChild(opt);
    });
    categorySelect.value = companyId;
  }

  if (inboxCategoryFilter) {
    inboxCategoryFilter.innerHTML = `<option value="">Alla kategorier</option>`;
    categoriesCache.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = c.name;
      inboxCategoryFilter.appendChild(opt);
    });
  }

  if (kbCategorySelect) {
    kbCategorySelect.innerHTML = "";
    categoriesCache.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.name} (${c.key})`;
      kbCategorySelect.appendChild(opt);
    });
    kbCategorySelect.value = companyId;
  }
}

/*************************************************
 * ✅ Title map
 *************************************************/
function titleForCompany(c) {
  const found = categoriesCache.find(x => x.key === c);
  const name = found?.name || c;

  const desc = {
    demo: "Ställ en fråga så hjälper jag dig direkt.",
    law: "Allmän vägledning (inte juridisk rådgivning).",
    tech: "Felsökning och IT-hjälp.",
    cleaning: "Frågor om städ, tjänster, rutiner."
  };

  return {
    title: `AI Kundtjänst – ${name}`,
    sub: desc[c] || "Ställ en fråga så hjälper jag dig direkt."
  };
}

function applyCompanyToUI() {
  const t = titleForCompany(companyId);
  setText($("chatTitle"), t.title);
  setText($("chatSubtitle"), t.sub);

  if ($("categorySelect")) $("categorySelect").value = companyId;
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
 * ✅ Chat tools
 *************************************************/
function clearChat() {
  if ($("messages")) $("messages").innerHTML = "";
  setText($("ragHint"), "");
}

async function startNewTicket() {
  ticketId = null;
  clearChat();
  addMessage("assistant", "Nytt ärende skapat ✅ Vad kan jag hjälpa dig med?");
  refreshDebug();
}

async function exportChat() {
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

/*************************************************
 * ✅ Conversation builder (simple from UI)
 *************************************************/
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

    const { res, data } = await fetchJson(API.CHAT, {
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

    if (!res.ok) {
      addMessage("assistant", `Serverfel: ${data?.error || "Okänt fel"}`);
      return;
    }

    ticketId = data.ticketId || ticketId;
    lastRagUsed = !!data.ragUsed;
    refreshDebug();

    setText($("ragHint"), data.ragUsed ? "RAG användes: JA ✅" : "RAG användes: NEJ ⚠️");
    addMessage("assistant", data.reply || "Inget svar.", data.ragUsed ? "Svar baserat på kunskapsdatabas (RAG)" : "");
  } catch (e) {
    hideTyping();
    addMessage("assistant", "Tekniskt fel. Försök igen.");
    console.error(e);
  }
}

/*************************************************
 * ✅ Category select
 *************************************************/
function setCompanyFromSelect(value) {
  companyId = value || "demo";
  applyCompanyToUI();

  // New ticket so context resets for category
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
    const { res, data } = await fetchJson(API.FEEDBACK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ type, companyId })
    });

    if (!res.ok) {
      alert(data?.error || "Kunde inte skicka feedback");
      return;
    }

    alert("Tack för feedback ✅");
  } catch {
    alert("Serverfel vid feedback");
  }
}

/*************************************************
 * ✅ Inbox (Admin)
 *************************************************/
function renderTicketItem(t) {
  const title = t.title || "(utan titel)";
  const meta = `${t.companyId} • ${t.status.toUpperCase()} • ${formatDate(t.lastActivityAt)}`;
  return `
    <div class="listItemTitle">${escapeHtml(title)} <span class="pill">${escapeHtml(t.priority || "normal")}</span></div>
    <div class="muted small">${escapeHtml(meta)}</div>
    <div class="muted small">ID: ${escapeHtml(t._id)}</div>
  `;
}

async function inboxLoadTickets() {
  const list = $("inboxTicketsList");
  const msg = $("inboxMsg");
  setAlert(msg, "");
  if (list) list.innerHTML = "";

  try {
    const status = $("inboxStatusFilter")?.value || "";
    const cat = $("inboxCategoryFilter")?.value || "";
    const q = ($("inboxSearchInput")?.value || "").trim().toLowerCase();

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (cat) params.set("companyId", cat);

    const { res, data } = await fetchJson(`${API.ADMIN_TICKETS}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte hämta inbox", true);
      return;
    }

    let tickets = Array.isArray(data) ? data : [];

    // ✅ search filter
    if (q) {
      tickets = tickets.filter((t) => {
        const a = String(t.title || "").toLowerCase();
        const b = String(t.companyId || "").toLowerCase();
        const c = String(t._id || "").toLowerCase();
        return a.includes(q) || b.includes(q) || c.includes(q);
      });
    }

    if (!tickets.length) {
      list.innerHTML = `<div class="muted small">Inga tickets hittades.</div>`;
      return;
    }

    tickets.forEach((t) => {
      const div = document.createElement("div");
      div.className = `ticketItem ${inboxSelectedTicketId === t._id ? "selected" : ""}`;
      div.innerHTML = renderTicketItem(t);

      div.addEventListener("click", async () => {
        inboxSelectedTicketId = t._id;
        await inboxLoadTicketDetails(t._id);
        await inboxLoadTickets();
      });

      list.appendChild(div);
    });
  } catch (e) {
    console.error("Inbox error:", e);
    setAlert($("inboxMsg"), "Serverfel vid inbox (kolla Console / Network)", true);
  }
}

async function inboxLoadTicketDetails(id) {
  const details = $("ticketDetails");
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");
  if (!details) return;

  details.innerHTML = `<div class="muted small">Laddar ticket...</div>`;

  try {
    const { res, data } = await fetchJson(API.ADMIN_TICKET(id), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
      setAlert(msg, data?.error || "Kunde inte ladda ticket", true);
      return;
    }

    const t = data;
    const msgs = t.messages || [];

    const html = msgs.slice(-80).map((m) => {
      const roleLabel = m.role === "user" ? "Kund" : (m.role === "agent" ? "Agent" : "AI");
      return `
        <div class="ticketMsg ${m.role}">
          <div class="ticketMsgHead">
            <b>${escapeHtml(roleLabel)}</b>
            <span>${escapeHtml(formatDate(m.timestamp))}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
        </div>
      `;
    }).join("");

    details.innerHTML = `
      <div class="ticketInfo">
        <div><b>ID:</b> ${escapeHtml(t._id)}</div>
        <div><b>Kategori:</b> ${escapeHtml(t.companyId)}</div>
        <div><b>Status:</b> ${escapeHtml(t.status)}</div>
        <div><b>Prioritet:</b> ${escapeHtml(t.priority || "normal")}</div>
        <div><b>Senast:</b> ${escapeHtml(formatDate(t.lastActivityAt))}</div>
      </div>
      <div class="divider"></div>
      <div class="ticketMsgs">${html}</div>
    `;

    // sätt dropdown priority
    if ($("ticketPrioritySelect")) $("ticketPrioritySelect").value = t.priority || "normal";
  } catch (e) {
    console.error(e);
    details.innerHTML = `<div class="muted small">Serverfel vid ticket.</div>`;
  }
}

async function inboxSetStatus(status) {
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");

  if (!inboxSelectedTicketId) return setAlert(msg, "Välj en ticket först.", true);

  try {
    const { res, data } = await fetchJson(API.ADMIN_TICKET_STATUS(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    if (!res.ok) return setAlert(msg, data?.error || "Kunde inte uppdatera status", true);

    setAlert(msg, "Status uppdaterad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch {
    setAlert(msg, "Serverfel vid status", true);
  }
}

async function inboxSetPriority() {
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");

  if (!inboxSelectedTicketId) return setAlert(msg, "Välj en ticket först.", true);

  const priority = $("ticketPrioritySelect")?.value || "normal";

  try {
    const { res, data } = await fetchJson(API.ADMIN_TICKET_PRIORITY(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ priority })
    });

    if (!res.ok) return setAlert(msg, data?.error || "Kunde inte spara prioritet", true);

    setAlert(msg, "Prioritet sparad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch {
    setAlert(msg, "Serverfel vid prioritet", true);
  }
}

async function inboxSendAgentReply() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  const content = $("agentReplyTextInbox")?.value?.trim();
  if (!content) return setAlert(msgEl, "Skriv ett svar först.", true);

  try {
    const { res, data } = await fetchJson(API.ADMIN_TICKET_REPLY(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });

    if (!res.ok) return setAlert(msgEl, data?.error || "Kunde inte skicka svar", true);

    setAlert(msgEl, "Agent-svar skickat ✅");
    $("agentReplyTextInbox").value = "";
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid agent-svar", true);
  }
}

async function inboxDeleteTicket() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) return setAlert(msgEl, "Välj en ticket först.", true);

  const ok = confirm("Vill du ta bort denna ticket permanent?");
  if (!ok) return;

  try {
    const { res, data } = await fetchJson(API.ADMIN_TICKET_DELETE(inboxSelectedTicketId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return setAlert(msgEl, data?.error || "Kunde inte ta bort ticket", true);

    inboxSelectedTicketId = null;
    $("ticketDetails").innerHTML = "";
    setAlert(msgEl, "Ticket borttagen ✅");
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Admin: Users
 *************************************************/
async function adminLoadUsers() {
  const msgEl = $("adminUsersMsg");
  const list = $("adminUsersList");
  setAlert(msgEl, "");
  if (list) list.innerHTML = "";

  try {
    const { res, data } = await fetchJson(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return setAlert(msgEl, data?.error || "Kunde inte hämta users", true);
    const users = Array.isArray(data) ? data : [];

    if (!users.length) return setAlert(msgEl, "Inga users hittades.");

    users.forEach((u) => {
      const div = document.createElement("div");
      div.className = "listItem";

      const isAdmin = u.role === "admin";
      const isSelf = String(u._id) === String(currentUser?.id);

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(u.username)}
          <span class="pill ${isAdmin ? "admin" : ""}">${escapeHtml(u.role)}</span>
        </div>
        <div class="muted small">ID: ${escapeHtml(u._id)}</div>

        <div class="row" style="margin-top:10px;">
          <button class="btn secondary small" data-action="toggleRole"
            ${isSelf || isAdmin ? "disabled style='opacity:.6;cursor:not-allowed;'" : ""}>
            <i class="fa-solid fa-user-gear"></i>
            ${isSelf ? "Din roll" : (isAdmin ? "Admin (låst)" : "Gör admin")}
          </button>

          ${isAdmin ? "" : `
          <button class="btn danger small" data-action="deleteUser" ${isSelf ? "disabled style='opacity:.6;cursor:not-allowed;'" : ""}>
            <i class="fa-solid fa-trash"></i>
            Ta bort
          </button>
          `}
        </div>
      `;

      div.querySelector('[data-action="toggleRole"]')?.addEventListener("click", async () => {
        if (isSelf || isAdmin) return;
        await adminSetUserRole(u._id, "admin");
        await adminLoadUsers();
      });

      div.querySelector('[data-action="deleteUser"]')?.addEventListener("click", async () => {
        if (isSelf) return;
        const ok = confirm(`Vill du ta bort användaren "${u.username}"?`);
        if (!ok) return;
        await adminDeleteUser(u._id);
        await adminLoadUsers();
      });

      list.appendChild(div);
    });
  } catch (e) {
    console.error(e);
    setAlert(msgEl, "Serverfel vid users", true);
  }
}

async function adminSetUserRole(userId, role) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const { res, data } = await fetchJson(API.ADMIN_USER_ROLE(userId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role })
    });

    if (!res.ok) return setAlert(msgEl, data?.error || "Kunde inte ändra roll", true);

    setAlert(msgEl, `Roll uppdaterad ✅`);
  } catch {
    setAlert(msgEl, "Serverfel vid roll-ändring", true);
  }
}

async function adminDeleteUser(userId) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const { res, data } = await fetchJson(API.ADMIN_DELETE_USER(userId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return setAlert(msgEl, data?.error || "Kunde inte ta bort user", true);
    setAlert(msgEl, data.message || "User borttagen ✅");
  } catch {
    setAlert(msgEl, "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Dashboard
 *************************************************/
async function loadDashboard() {
  if (currentUser?.role !== "admin") return;

  setAlert($("dashMsg"), "");

  try {
    // Vi räknar baserat på tickets + users endpoints som finns
    const [{ res: resUsers, data: users }, { res: resTickets, data: tickets }] = await Promise.all([
      fetchJson(API.ADMIN_USERS, { headers: { Authorization: `Bearer ${token}` } }),
      fetchJson(API.ADMIN_TICKETS, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    if (!resUsers.ok) return setAlert($("dashMsg"), "Serverfel vid dashboard (users)", true);
    if (!resTickets.ok) return setAlert($("dashMsg"), "Serverfel vid dashboard (tickets)", true);

    const uCount = Array.isArray(users) ? users.length : 0;
    const tArr = Array.isArray(tickets) ? tickets : [];
    const tCount = tArr.length;

    const openCount = tArr.filter(t => t.status === "open").length;
    const solvedCount = tArr.filter(t => t.status === "solved").length;

    setText($("statUsers"), uCount);
    setText($("statTickets"), tCount);
    setText($("statOpen"), openCount);
    setText($("statSolved"), solvedCount);
  } catch (e) {
    console.error("Dashboard error:", e);
    setAlert($("dashMsg"), "Serverfel vid dashboard", true);
  }
}

async function cleanupSolved() {
  const ok = confirm("Rensa alla SOLVED tickets permanent?");
  if (!ok) return;

  const { res, data } = await fetchJson(API.ADMIN_CLEANUP_SOLVED, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    alert(data?.error || "Kunde inte rensa solved");
    return;
  }

  alert(data.message || "Rensat ✅");
  await loadDashboard();
  await inboxLoadTickets();
}

/*************************************************
 * ✅ Categories Manager (Admin)
 *************************************************/
async function adminLoadCategoriesList() {
  const list = $("categoriesList");
  if (!list) return;
  list.innerHTML = "";

  try {
    const { res, data } = await fetchJson(API.ADMIN_CATEGORIES, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;

    categoriesCache = Array.isArray(data) ? data : categoriesCache;

    categoriesCache.forEach(c => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(c.name)} <span class="pill">${escapeHtml(c.key)}</span>
        </div>
        <div class="muted small">${escapeHtml((c.systemPrompt || "").slice(0, 130))}${(c.systemPrompt || "").length > 130 ? "..." : ""}</div>
      `;
      div.addEventListener("click", () => {
        $("catKey").value = c.key;
        $("catName").value = c.name;
        $("catPrompt").value = c.systemPrompt || "";
      });
      list.appendChild(div);
    });

    // refresh dropdowns too
    await loadCategories();
    applyCompanyToUI();
  } catch (e) {}
}

async function createCategory() {
  const key = $("catKey")?.value?.trim();
  const name = $("catName")?.value?.trim();
  const systemPrompt = $("catPrompt")?.value || "";

  if (!key || !name) return setAlert($("catMsg"), "Key + Name krävs", true);

  const { res, data } = await fetchJson(API.ADMIN_CATEGORIES, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ key, name, systemPrompt })
  });

  if (!res.ok) return setAlert($("catMsg"), data?.error || "Kunde inte skapa kategori", true);

  setAlert($("catMsg"), data.message || "Kategori skapad ✅");
  await adminLoadCategoriesList();
}

async function updateCategory() {
  const key = $("catKey")?.value?.trim();
  const name = $("catName")?.value?.trim();
  const systemPrompt = $("catPrompt")?.value || "";

  if (!key) return setAlert($("catMsg"), "Välj en kategori först", true);

  const { res, data } = await fetchJson(API.ADMIN_CATEGORY(key), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, systemPrompt })
  });

  if (!res.ok) return setAlert($("catMsg"), data?.error || "Kunde inte uppdatera kategori", true);

  setAlert($("catMsg"), data.message || "Kategori uppdaterad ✅");
  await adminLoadCategoriesList();
}

async function deleteCategory() {
  const key = $("catKey")?.value?.trim();
  if (!key) return setAlert($("catMsg"), "Välj en kategori först", true);

  const ok = confirm(`Ta bort kategori "${key}"? Detta tar bort tickets + KB för kategorin.`);
  if (!ok) return;

  const { res, data } = await fetchJson(API.ADMIN_CATEGORY(key), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return setAlert($("catMsg"), data?.error || "Kunde inte ta bort kategori", true);

  setAlert($("catMsg"), data.message || "Kategori borttagen ✅");
  $("catKey").value = "";
  $("catName").value = "";
  $("catPrompt").value = "";
  await adminLoadCategoriesList();
}

/*************************************************
 * ✅ KB Manager
 *************************************************/
function kbActiveCategory() {
  return $("kbCategorySelect")?.value || companyId || "demo";
}
function setKbMsg(msg, isErr = false) {
  setAlert($("kbMsg"), msg, isErr);
}

function activateKbTab(tabId) {
  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));

  document.querySelectorAll(`.tabBtn[data-tab="${tabId}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = "";
}

async function kbRefreshList() {
  const list = $("kbList");
  if (list) list.innerHTML = "";
  setKbMsg("");

  const cat = kbActiveCategory();

  try {
    const { res, data } = await fetchJson(API.KB_LIST(cat), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return setKbMsg(data?.error || "Kunde inte ladda KB", true);

    if (!data.length) {
      list.innerHTML = `<div class="muted small">Ingen kunskap uppladdad för denna kategori.</div>`;
      return;
    }

    data.slice(0, 25).forEach((item) => {
      const div = document.createElement("div");
      div.className = "listItem";

      const preview = (item.content || "").slice(0, 160);
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(item.title || item.sourceRef || "KB")}
          <span class="pill">${item.embeddingOk ? "Vector ✅" : "Vector ❌"}</span>
        </div>
        <div class="muted small">${escapeHtml(item.sourceType)} • ${escapeHtml(item.sourceRef || "")}</div>
        <div class="muted small">${escapeHtml(preview)}...</div>
      `;
      list.appendChild(div);
    });
  } catch (e) {
    setKbMsg("Serverfel vid KB-lista", true);
  }
}

async function kbUploadText() {
  const cat = kbActiveCategory();
  const title = $("kbTextTitle")?.value?.trim() || "Text";
  const content = $("kbTextContent")?.value?.trim() || "";

  if (!content || content.length < 30) return setKbMsg("Skriv mer text (minst ~30 tecken).", true);

  setKbMsg("Laddar upp text…");

  const { res, data } = await fetchJson(API.KB_TEXT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId: cat, title, content })
  });

  if (!res.ok) return setKbMsg(data?.error || "Fel vid text-upload", true);

  setKbMsg(data.message || "Text uppladdad ✅");
  $("kbTextContent").value = "";
  await kbRefreshList();
}

async function kbUploadUrl() {
  const cat = kbActiveCategory();
  const url = $("kbUrlInput")?.value?.trim() || "";
  if (!url.startsWith("http")) return setKbMsg("Ange en riktig URL (http/https)", true);

  setKbMsg("Hämtar URL och extraherar text…");

  const { res, data } = await fetchJson(API.KB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId: cat, url })
  });

  if (!res.ok) return setKbMsg(data?.error || "Fel vid URL-upload", true);

  setKbMsg(data.message || "URL uppladdad ✅");
  $("kbUrlInput").value = "";
  await kbRefreshList();
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

async function kbUploadPdf() {
  const cat = kbActiveCategory();
  const file = $("kbPdfFile")?.files?.[0];
  if (!file) return setKbMsg("Välj en PDF först.", true);

  setKbMsg("Läser PDF…");

  const base64 = await readFileAsBase64(file);

  const { res, data } = await fetchJson(API.KB_PDF, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId: cat, filename: file.name, base64 })
  });

  if (!res.ok) return setKbMsg(data?.error || "Fel vid PDF-upload", true);

  setKbMsg(data.message || "PDF uppladdad ✅");
  $("kbPdfFile").value = "";
  await kbRefreshList();
}

function kbExport() {
  const cat = kbActiveCategory();
  window.open(API.KB_EXPORT(cat), "_blank");
}

function trainingExport() {
  const cat = kbActiveCategory();
  window.open(`${API.ADMIN_EXPORT_TRAINING}?companyId=${encodeURIComponent(cat)}`, "_blank");
}

function adminExportAll() {
  window.open(API.ADMIN_EXPORT_ALL, "_blank");
}

/*************************************************
 * ✅ Settings actions
 *************************************************/
async function changeUsername() {
  const newUsername = $("newUsernameInput")?.value?.trim();
  if (!newUsername) return setAlert($("changeUsernameMsg"), "Skriv ett nytt användarnamn.", true);

  const { res, data } = await fetchJson(API.CHANGE_USERNAME, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ newUsername })
  });

  if (!res.ok) return setAlert($("changeUsernameMsg"), data?.error || "Kunde inte byta användarnamn", true);

  setAlert($("changeUsernameMsg"), data.message || "Användarnamn uppdaterat ✅");
  currentUser = await fetchMe();
  applyAuthUI();
  renderSettingsUserInfo();
}

async function changePassword() {
  const currentPassword = $("currentPasswordInput")?.value?.trim();
  const newPassword = $("newPasswordInput")?.value?.trim();
  if (!currentPassword || !newPassword) return setAlert($("changePasswordMsg"), "Fyll i båda fälten.", true);

  const { res, data } = await fetchJson(API.CHANGE_PASSWORD, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword })
  });

  if (!res.ok) return setAlert($("changePasswordMsg"), data?.error || "Kunde inte byta lösenord", true);

  setAlert($("changePasswordMsg"), data.message || "Lösenord uppdaterat ✅");
  $("currentPasswordInput").value = "";
  $("newPasswordInput").value = "";
}

function renderSettingsUserInfo() {
  if (!$("settingsUserInfo")) return;
  if (!currentUser) return setText($("settingsUserInfo"), "-");

  const lines = [
    `Username: ${currentUser.username}`,
    `Role: ${currentUser.role}`,
    `Email: ${currentUser.email || "(saknas)"}`
  ];
  $("settingsUserInfo").textContent = lines.join("\n");
}

/*************************************************
 * ✅ Forgot/Reset UI
 *************************************************/
function toggleInputType(inputId) {
  const el = $(inputId);
  if (!el) return;
  el.type = el.type === "password" ? "text" : "password";
}

function getResetTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("resetToken");
}

async function sendForgotEmail() {
  const email = $("forgotEmail")?.value?.trim();
  if (!email) return setAlert($("forgotMsg"), "Skriv din email.", true);

  const { res, data } = await fetchJson(API.FORGOT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });

  if (!res.ok) return setAlert($("forgotMsg"), data?.error || "Kunde inte skicka mail", true);
  setAlert($("forgotMsg"), data.message || "Mail skickat ✅");
}

async function resetPassword() {
  const tokenFromUrl = getResetTokenFromUrl();
  const newPassword = $("resetNewPassword")?.value?.trim();
  if (!tokenFromUrl) return setAlert($("resetMsg"), "resetToken saknas i URL", true);
  if (!newPassword) return setAlert($("resetMsg"), "Skriv nytt lösenord.", true);

  const { res, data } = await fetchJson(API.RESET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resetToken: tokenFromUrl, newPassword })
  });

  if (!res.ok) return setAlert($("resetMsg"), data?.error || "Kunde inte återställa", true);
  setAlert($("resetMsg"), data.message || "Återställt ✅ Logga in nu.");
}

/*************************************************
 * ✅ Login / Register / Logout
 *************************************************/
async function login() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();

  setAlert($("authMessage"), "");
  if (!username || !password) return setAlert($("authMessage"), "Fyll i både användarnamn och lösenord.", true);

  const { res, data } = await fetchJson(API.LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) return setAlert($("authMessage"), data?.error || "Login misslyckades", true);

  token = data.token;
  localStorage.setItem("token", token);

  currentUser = await fetchMe();
  applyAuthUI();

  await loadCategories();
  applyCompanyToUI();

  clearChat();
  addMessage("assistant", "Välkommen! Vad kan jag hjälpa dig med?");
  renderSettingsUserInfo();
}

async function register() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();
  const email = $("email")?.value?.trim();

  setAlert($("authMessage"), "");
  if (!username || !password) return setAlert($("authMessage"), "Fyll i både användarnamn och lösenord.", true);

  const { res, data } = await fetchJson(API.REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email })
  });

  if (!res.ok) return setAlert($("authMessage"), data?.error || "Registrering misslyckades", true);

  setAlert($("authMessage"), "Registrering klar ✅ Logga in nu.");
}

function logout() {
  localStorage.removeItem("token");
  token = null;
  currentUser = null;
  ticketId = null;
  inboxSelectedTicketId = null;

  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Init
 *************************************************/
async function init() {
  refreshDebug();

  // reset-token UI
  const resetToken = getResetTokenFromUrl();
  if (resetToken) {
    show($("forgotCard"), false);
    show($("resetCard"), true);
    show($("authView"), true);
  }

  // if token exists => load me
  if (token) currentUser = await fetchMe();

  applyAuthUI();

  // load categories and apply UI
  await loadCategories();

  const params = new URLSearchParams(window.location.search);
  const c = params.get("company");
  if (c) companyId = c;
  applyCompanyToUI();

  renderSettingsUserInfo();

  // EVENTS
  $("themeToggle")?.addEventListener("click", toggleTheme);
  $("logoutBtn")?.addEventListener("click", logout);

  $("toggleDebugBtn")?.addEventListener("click", () => {
    const p = $("debugPanel");
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
  });

  // auth
  $("loginBtn")?.addEventListener("click", login);
  $("registerBtn")?.addEventListener("click", register);
  $("openForgotBtn")?.addEventListener("click", () => show($("forgotCard"), true));
  $("forgotSendBtn")?.addEventListener("click", sendForgotEmail);
  $("resetSaveBtn")?.addEventListener("click", resetPassword);

  $("togglePassLogin")?.addEventListener("click", () => toggleInputType("password"));
  $("toggleResetPass")?.addEventListener("click", () => toggleInputType("resetNewPassword"));
  $("toggleChangePass")?.addEventListener("click", () => {
    toggleInputType("currentPasswordInput");
    toggleInputType("newPasswordInput");
  });

  // chat
  $("sendBtn")?.addEventListener("click", sendMessage);
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
  });

  $("newTicketBtn")?.addEventListener("click", startNewTicket);
  $("clearChatBtn")?.addEventListener("click", clearChat);
  $("exportChatBtn")?.addEventListener("click", exportChat);

  $("feedbackPosBtn")?.addEventListener("click", () => sendFeedback("positive"));
  $("feedbackNegBtn")?.addEventListener("click", () => sendFeedback("negative"));

  $("categorySelect")?.addEventListener("change", (e) => setCompanyFromSelect(e.target.value));

  // menu views
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("chat");
    openView("chat");
  });

  $("openSettingsView")?.addEventListener("click", () => {
    setActiveMenu("settings");
    openView("settings");
    renderSettingsUserInfo();
  });

  $("openInboxView")?.addEventListener("click", async () => {
    setActiveMenu("inbox");
    openView("inbox");
    await inboxLoadTickets();
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("admin");
    openView("admin");
    await loadDashboard();
    await adminLoadUsers();
    await adminLoadCategoriesList();
    await kbRefreshList();
  });

  // settings actions
  $("changeUsernameBtn")?.addEventListener("click", changeUsername);
  $("changePasswordBtn")?.addEventListener("click", changePassword);

  // Inbox
  $("inboxRefreshBtn")?.addEventListener("click", inboxLoadTickets);
  $("inboxStatusFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxCategoryFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxSearchInput")?.addEventListener("input", inboxLoadTickets);

  $("setStatusOpen")?.addEventListener("click", () => inboxSetStatus("open"));
  $("setStatusPending")?.addEventListener("click", () => inboxSetStatus("pending"));
  $("setStatusSolved")?.addEventListener("click", () => inboxSetStatus("solved"));
  $("setPriorityBtn")?.addEventListener("click", inboxSetPriority);
  $("sendAgentReplyInboxBtn")?.addEventListener("click", inboxSendAgentReply);
  $("deleteTicketBtn")?.addEventListener("click", inboxDeleteTicket);

  // Dashboard
  $("cleanupSolvedBtn")?.addEventListener("click", cleanupSolved);
  $("adminExportAllBtn")?.addEventListener("click", adminExportAll);

  // Category manager
  $("createCategoryBtn")?.addEventListener("click", createCategory);
  $("updateCategoryBtn")?.addEventListener("click", updateCategory);
  $("deleteCategoryBtn")?.addEventListener("click", deleteCategory);

  // KB tabs
  document.querySelectorAll(".tabBtn").forEach((btn) => {
    btn.addEventListener("click", () => activateKbTab(btn.dataset.tab));
  });

  $("kbRefreshBtn")?.addEventListener("click", kbRefreshList);
  $("kbExportBtn")?.addEventListener("click", kbExport);
  $("trainingExportBtn")?.addEventListener("click", trainingExport);

  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);
  $("kbCategorySelect")?.addEventListener("change", kbRefreshList);

  $("adminUsersRefreshBtn")?.addEventListener("click", adminLoadUsers);

  // if logged in show welcome
  if (token && currentUser) {
    clearChat();
    addMessage("assistant", "Välkommen tillbaka! Vad kan jag hjälpa dig med?");
  }
}

document.addEventListener("DOMContentLoaded", init);
