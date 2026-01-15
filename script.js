/*************************************************
 * ✅ API base
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API = {
  ME: `${API_BASE}/me`,
  LOGIN: `${API_BASE}/login`,
  REGISTER: `${API_BASE}/register`,
  CHAT: `${API_BASE}/chat`,
  CATEGORIES: `${API_BASE}/categories`,

  FORGOT: `${API_BASE}/auth/forgot-password`,
  RESET: `${API_BASE}/auth/reset-password`,
  CHANGE_PASSWORD: `${API_BASE}/auth/change-password`,
  CHANGE_USERNAME: `${API_BASE}/auth/change-username`,

  FEEDBACK: `${API_BASE}/feedback`,

  ADMIN_DASH: `${API_BASE}/admin/dashboard`,
  ADMIN_TICKETS: `${API_BASE}/admin/tickets`,
  ADMIN_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_TICKET_STATUS: (id) => `${API_BASE}/admin/tickets/${id}/status`,
  ADMIN_TICKET_REPLY: (id) => `${API_BASE}/admin/tickets/${id}/agent-reply`,
  ADMIN_TICKET_PRIORITY: (id) => `${API_BASE}/admin/tickets/${id}/priority`,
  ADMIN_TICKET_NOTES: (id) => `${API_BASE}/admin/tickets/${id}/notes`,
  ADMIN_DELETE_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_DELETE_SOLVED: `${API_BASE}/admin/tickets-solved`,

  ADMIN_USERS: `${API_BASE}/admin/users`,
  ADMIN_USER_ROLE: (id) => `${API_BASE}/admin/users/${id}/role`,
  ADMIN_DELETE_USER: (id) => `${API_BASE}/admin/users/${id}`,
  ADMIN_EXPORT_ALL: `${API_BASE}/admin/export/all`,

  KB_LIST: (companyId) => `${API_BASE}/kb/list/${companyId}`,
  KB_TEXT: `${API_BASE}/kb/upload-text`,
  KB_URL: `${API_BASE}/kb/upload-url`,
  KB_PDF: `${API_BASE}/kb/upload-pdf`,
  KB_EXPORT: (companyId) => `${API_BASE}/export/kb/${companyId}`,

  ADMIN_CATEGORIES: `${API_BASE}/admin/categories`,
  ADMIN_CAT_UPDATE: (key) => `${API_BASE}/admin/categories/${key}`,
  ADMIN_CAT_DELETE: (key) => `${API_BASE}/admin/categories/${key}`,
};

let token = localStorage.getItem("token") || null;
let currentUser = null;
let companyId = "demo";
let ticketId = null;
let lastRagUsed = null;

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
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
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
 * ✅ Debug
 *************************************************/
function refreshDebug() {
  setText($("dbgApi"), API_BASE || "(same-origin)");
  setText($("dbgLogged"), token ? "JA" : "NEJ");
  setText($("dbgRole"), currentUser?.role || "-");
  setText($("dbgTicket"), ticketId || "-");
  setText($("dbgRag"), lastRagUsed === null ? "-" : (lastRagUsed ? "JA" : "NEJ"));

  setText($("ticketPill"), ticketId || "-");

  const ragPill = $("ragPill");
  if (ragPill) {
    ragPill.textContent = lastRagUsed === null ? "-" : (lastRagUsed ? "JA ✅" : "NEJ ⚠️");
    ragPill.className = `pill ${lastRagUsed ? "ok" : "warn"}`;
  }
}

/*************************************************
 * ✅ Views
 *************************************************/
function setActiveMenu(which) {
  ["openChatView", "openInboxView", "openAdminView", "openSettingsView", "openFeedbackView"]
    .forEach((id) => $(id)?.classList.remove("active"));

  if (which === "chat") $("openChatView")?.classList.add("active");
  if (which === "inbox") $("openInboxView")?.classList.add("active");
  if (which === "admin") $("openAdminView")?.classList.add("active");
  if (which === "settings") $("openSettingsView")?.classList.add("active");
  if (which === "feedback") $("openFeedbackView")?.classList.add("active");
}

function openView(viewName) {
  show($("authView"), viewName === "auth");
  show($("chatView"), viewName === "chat");
  show($("inboxView"), viewName === "inbox");
  show($("adminView"), viewName === "admin");
  show($("settingsView"), viewName === "settings");
  show($("feedbackView"), viewName === "feedback");
}

/*************************************************
 * ✅ Auth UI
 *************************************************/
function applyAuthUI() {
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");
  const inboxBtn = $("openInboxView");
  const adminBtn = $("openAdminView");

  if (!token || !currentUser) {
    openView("auth");
    setText(roleBadge, "Inte inloggad");
    show(logoutBtn, false);
    show(inboxBtn, false);
    show(adminBtn, false);
  } else {
    openView("chat");
    setText(roleBadge, `${currentUser.username} • ${currentUser.role.toUpperCase()}`);
    show(logoutBtn, true);

    const isAdmin = currentUser.role === "admin";
    show(inboxBtn, isAdmin);
    show(adminBtn, isAdmin);
  }

  refreshDebug();
}

/*************************************************
 * ✅ Fetch current user (/me)
 *************************************************/
async function fetchMe() {
  if (!token) return null;

  const res = await fetch(API.ME, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    token = null;
    localStorage.removeItem("token");
    return null;
  }

  return await res.json();
}

/*************************************************
 * ✅ Load categories
 *************************************************/
async function loadCategories() {
  const catSel = $("categorySelect");
  const inboxCat = $("inboxCategoryFilter");
  const kbCat = $("kbCategorySelect");

  if (catSel) catSel.innerHTML = "";
  if (inboxCat) inboxCat.innerHTML = `<option value="">Alla kategorier</option>`;
  if (kbCat) kbCat.innerHTML = "";

  try {
    const res = await fetch(API.CATEGORIES);
    const data = await res.json();

    data.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = c.name;
      catSel?.appendChild(opt);

      const opt2 = document.createElement("option");
      opt2.value = c.key;
      opt2.textContent = c.name;
      inboxCat?.appendChild(opt2);

      const opt3 = document.createElement("option");
      opt3.value = c.key;
      opt3.textContent = c.name;
      kbCat?.appendChild(opt3);
    });

    if (catSel) catSel.value = companyId;
    if (kbCat) kbCat.value = companyId;
  } catch (e) {
    console.error("Categories load error:", e);
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
    <div class="msgBody">
      <div class="bubble">${safe}</div>
      ${meta ? `<div class="msgMeta">${escapeHtml(meta)}</div>` : ""}
      ${!isUser ? `
        <div class="bubbleActions">
          <button class="actionBtn" data-action="copy">
            <i class="fa-solid fa-copy"></i> Kopiera
          </button>
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
    <div class="msgBody"><div class="bubble">AI skriver…</div></div>
  `;

  messagesDiv.appendChild(wrapper);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById("typing");
  if (el) el.remove();
}

/*************************************************
 * ✅ Ticket utilities
 *************************************************/
async function startNewTicket() {
  ticketId = null;
  $("messages").innerHTML = "";
  addMessage("assistant", "Nytt ärende skapat ✅ Vad kan jag hjälpa dig med?");
  refreshDebug();
}

function clearChat() {
  if ($("messages")) $("messages").innerHTML = "";
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
 * ✅ Conversation builder
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

    const res = await fetch(API.CHAT, {
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

    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      addMessage("assistant", `Serverfel: ${data?.error || "Okänt fel"}`);
      return;
    }

    ticketId = data.ticketId || ticketId;
    lastRagUsed = !!data.ragUsed;
    refreshDebug();

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
  ticketId = null;
  clearChat();
  addMessage("assistant", `Du bytte kategori ✅ Vad vill du fråga inom "${companyId}"?`);
  refreshDebug();
}

/*************************************************
 * ✅ Inbox (Admin)
 *************************************************/
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
    const res = await fetch(`${API.ADMIN_TICKETS}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte hämta inbox", true);
      return;
    }

    let filtered = Array.isArray(data) ? data : [];
    if (q) {
      filtered = filtered.filter((t) => {
        const a = String(t.title || "").toLowerCase();
        const b = String(t.companyId || "").toLowerCase();
        const c = String(t._id || "").toLowerCase();
        return a.includes(q) || b.includes(q) || c.includes(q);
      });
    }

    if (!filtered.length) {
      list.innerHTML = `<div class="muted small">Inga tickets hittades.</div>`;
      return;
    }

    filtered.forEach((t) => {
      const div = document.createElement("div");
      div.className = `ticketItem ${inboxSelectedTicketId === t._id ? "selected" : ""}`;

      div.innerHTML = `
        <div class="ticketTop">
          <div class="ticketTitle">${escapeHtml(t.title || "Inget ämne")}</div>
          <div class="row gap">
            <span class="pill">${escapeHtml(t.status || "open")}</span>
            <span class="pill">${escapeHtml(t.priority || "normal")}</span>
          </div>
        </div>
        <div class="ticketMeta">
          <div>Kategori: <b>${escapeHtml(t.companyId)}</b></div>
          <div class="muted small">Senast: ${escapeHtml(formatDate(t.lastActivityAt || t.createdAt))}</div>
        </div>
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
  details.innerHTML = `<div class="muted small">Laddar ticket...</div>`;

  try {
    const res = await fetch(API.ADMIN_TICKET(id), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
      setAlert(msg, data?.error || "Kunde inte ladda ticket", true);
      return;
    }

    if ($("agentNotesInbox")) $("agentNotesInbox").value = data.agentNotes || "";

    const msgs = data.messages || [];
    const html = msgs.slice(-80).map((m) => {
      const roleLabel = m.role === "user" ? "Kund" : (m.role === "agent" ? "Agent" : "AI");
      return `
        <div class="ticketMsg ${m.role}">
          <div class="ticketMsgHead">
            <b>${roleLabel}</b>
            <span>${escapeHtml(formatDate(m.timestamp))}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
        </div>
      `;
    }).join("");

    details.innerHTML = `
      <div class="ticketInfo">
        <div><b>ID:</b> ${escapeHtml(data._id)}</div>
        <div><b>Kategori:</b> ${escapeHtml(data.companyId)}</div>
        <div><b>Status:</b> ${escapeHtml(data.status)}</div>
        <div><b>Prioritet:</b> ${escapeHtml(data.priority || "normal")}</div>
        <div><b>Senast:</b> ${escapeHtml(formatDate(data.lastActivityAt))}</div>
      </div>
      <div class="divider"></div>
      <div class="ticketMsgs">${html}</div>
    `;
  } catch (e) {
    details.innerHTML = `<div class="muted small">Serverfel vid ticket.</div>`;
    console.error(e);
  }
}

async function inboxSetStatus(status) {
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");

  if (!inboxSelectedTicketId) {
    setAlert(msg, "Välj en ticket först.", true);
    return;
  }

  try {
    const res = await fetch(API.ADMIN_TICKET_STATUS(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte uppdatera status", true);
      return;
    }

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

  if (!inboxSelectedTicketId) {
    setAlert(msg, "Välj en ticket först.", true);
    return;
  }

  const priority = $("ticketPrioritySelect")?.value || "normal";

  try {
    const res = await fetch(API.ADMIN_TICKET_PRIORITY(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ priority })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte spara prioritet", true);
      return;
    }

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

  if (!inboxSelectedTicketId) {
    setAlert(msgEl, "Välj en ticket först.", true);
    return;
  }

  const content = $("agentReplyTextInbox")?.value?.trim();
  if (!content) {
    setAlert(msgEl, "Skriv ett svar först.", true);
    return;
  }

  try {
    const res = await fetch(API.ADMIN_TICKET_REPLY(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte skicka svar", true);
      return;
    }

    setAlert(msgEl, "Agent-svar skickat ✅");
    $("agentReplyTextInbox").value = "";
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid agent-svar", true);
  }
}

async function saveNotes() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) {
    setAlert(msgEl, "Välj en ticket först.", true);
    return;
  }

  const notes = $("agentNotesInbox")?.value || "";

  try {
    const res = await fetch(API.ADMIN_TICKET_NOTES(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ notes })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte spara notering", true);
      return;
    }

    setAlert(msgEl, "Notering sparad ✅");
  } catch {
    setAlert(msgEl, "Serverfel vid notering", true);
  }
}

async function deleteTicket() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) {
    setAlert(msgEl, "Välj en ticket först.", true);
    return;
  }

  const ok = confirm("Vill du verkligen radera denna ticket? Detta kan inte ångras.");
  if (!ok) return;

  try {
    const res = await fetch(API.ADMIN_DELETE_TICKET(inboxSelectedTicketId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte radera ticket", true);
      return;
    }

    setAlert(msgEl, "Ticket raderad ✅");
    inboxSelectedTicketId = null;
    $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket i listan</div>`;
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid radera ticket", true);
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
    const res = await fetch(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte hämta users", true);
      return;
    }

    if (!data.length) {
      list.innerHTML = `<div class="muted small">Inga users hittades.</div>`;
      return;
    }

    data.forEach((u) => {
      const div = document.createElement("div");
      div.className = "listItem";

      const isAdmin = u.role === "admin";
      const isSelf = String(u._id) === String(currentUser?.id);

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(u.username)} <span class="muted small">(${escapeHtml(u.email || "-")})</span>
          <span class="pill ${isAdmin ? "admin" : ""}">${escapeHtml(u.role)}</span>
        </div>
        <div class="muted small">ID: ${escapeHtml(u._id)}</div>

        <div class="row gap" style="margin-top:10px;">
          <button class="btn secondary small" data-action="toggleRole" ${isSelf || isAdmin ? "disabled" : ""}>
            <i class="fa-solid fa-user-gear"></i>
            ${isSelf ? "Din roll" : (isAdmin ? "Admin (låst)" : "Gör admin")}
          </button>

          ${isAdmin ? "" : `
            <button class="btn danger small" data-action="deleteUser">
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
        const ok = confirm(`Vill du verkligen ta bort användaren "${u.username}"?`);
        if (!ok) return;
        await adminDeleteUser(u._id);
        await adminLoadUsers();
      });

      list.appendChild(div);
    });
  } catch (e) {
    console.error("adminLoadUsers error:", e);
    setAlert(msgEl, "Serverfel vid users", true);
  }
}

async function adminSetUserRole(userId, role) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const res = await fetch(API.ADMIN_USER_ROLE(userId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ role })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ändra roll", true);
      return;
    }

    setAlert(msgEl, `Roll uppdaterad ✅ ${data.user.username} → ${data.user.role}`);
  } catch {
    setAlert(msgEl, "Serverfel vid roll-ändring", true);
  }
}

async function adminDeleteUser(userId) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const res = await fetch(API.ADMIN_DELETE_USER(userId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ta bort user", true);
      return;
    }

    setAlert(msgEl, data.message || "User borttagen ✅");
  } catch {
    setAlert(msgEl, "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Admin: Dashboard
 *************************************************/
async function loadDashboard() {
  const msgEl = $("dashMsg");
  setAlert(msgEl, "");

  try {
    const res = await fetch(API.ADMIN_DASH, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ladda dashboard", true);
      return;
    }

    setText($("d_totalUsers"), data.totalUsers);
    setText($("d_totalTickets"), data.totalTickets);
    setText($("d_openTickets"), data.openTickets);
    setText($("d_pendingTickets"), data.pendingTickets);
    setText($("d_solvedTickets"), data.solvedTickets);
    setText($("d_totalKb"), data.totalKb);
    setText($("d_totalFeedback"), data.totalFeedback);
  } catch (e) {
    console.error("Dashboard error:", e);
    setAlert(msgEl, "Serverfel vid dashboard", true);
  }
}

async function deleteSolvedTickets() {
  const msgEl = $("dashMsg");
  setAlert(msgEl, "");

  const ok = confirm("Vill du radera ALLA solved tickets? (kan inte ångras)");
  if (!ok) return;

  try {
    const res = await fetch(API.ADMIN_DELETE_SOLVED, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte radera solved tickets", true);
      return;
    }

    setAlert(msgEl, data.message || "Klart ✅");
    await loadDashboard();
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid radera solved", true);
  }
}

/*************************************************
 * ✅ Admin: KB
 *************************************************/
function kbActiveCategory() {
  return $("kbCategorySelect")?.value || "demo";
}

function setKbMsg(msg, isErr = false) {
  setAlert($("kbMsg"), msg, isErr);
}

async function kbRefreshList() {
  const list = $("kbList");
  if (list) list.innerHTML = "";
  setKbMsg("");

  const cat = kbActiveCategory();

  try {
    const res = await fetch(API.KB_LIST(cat), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Kunde inte ladda KB", true);
      return;
    }

    if (!data.length) {
      list.innerHTML = `<div class="muted small">Ingen kunskap uppladdad för denna kategori.</div>`;
      return;
    }

    data.slice(0, 40).forEach((item) => {
      const div = document.createElement("div");
      div.className = "kbItem";
      const preview = (item.content || "").slice(0, 160);

      div.innerHTML = `
        <div class="kbItemTop">
          <div>
            <div class="kbItemTitle">${escapeHtml(item.title || item.sourceRef || "KB")}</div>
            <div class="kbItemMeta">${escapeHtml(item.sourceType)} • ${escapeHtml(item.sourceRef || "")}</div>
          </div>
          <div class="muted small">${item.embeddingOk ? "Vector ✅" : "Vector ❌"}</div>
        </div>
        <div class="kbPreview">${escapeHtml(preview)}...</div>
      `;

      list.appendChild(div);
    });
  } catch (e) {
    console.error("KB list error:", e);
    setKbMsg("Serverfel vid KB-lista", true);
  }
}

async function kbUploadText() {
  const cat = kbActiveCategory();
  const title = $("kbTextTitle")?.value?.trim() || "Text";
  const content = $("kbTextContent")?.value?.trim() || "";

  if (!content || content.length < 30) {
    setKbMsg("Skriv/klistra in mer text först (minst ~30 tecken).", true);
    return;
  }

  setKbMsg("Laddar upp text…");

  try {
    const res = await fetch(API.KB_TEXT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ companyId: cat, title, content })
    });

    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Fel vid text-upload", true);
      return;
    }

    setKbMsg(data.message || "Text uppladdad ✅");
    $("kbTextContent").value = "";
    kbRefreshList();
  } catch {
    setKbMsg("Serverfel vid text-upload", true);
  }
}

async function kbUploadUrl() {
  const cat = kbActiveCategory();
  const url = $("kbUrlInput")?.value?.trim() || "";

  if (!url.startsWith("http")) {
    setKbMsg("Ange en riktig URL som börjar med http/https", true);
    return;
  }

  setKbMsg("Hämtar URL och extraherar text…");

  try {
    const res = await fetch(API.KB_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ companyId: cat, url })
    });

    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Fel vid URL-upload", true);
      return;
    }

    setKbMsg(data.message || "URL uppladdad ✅");
    $("kbUrlInput").value = "";
    kbRefreshList();
  } catch {
    setKbMsg("Serverfel vid URL-upload", true);
  }
}

async function kbUploadPdf() {
  const cat = kbActiveCategory();
  const file = $("kbPdfFile")?.files?.[0];

  if (!file) {
    setKbMsg("Välj en PDF först.", true);
    return;
  }

  setKbMsg("Läser PDF…");

  const base64 = await readFileAsBase64(file);

  try {
    const res = await fetch(API.KB_PDF, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ companyId: cat, filename: file.name, base64 })
    });

    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Fel vid PDF-upload", true);
      return;
    }

    setKbMsg(data.message || "PDF uppladdad ✅");
    $("kbPdfFile").value = "";
    kbRefreshList();
  } catch {
    setKbMsg("Serverfel vid PDF-upload", true);
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
 * ✅ KB Tabs
 *************************************************/
function activateKbTab(tabId) {
  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));
  document.querySelectorAll(`.tabBtn[data-tab="${tabId}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = "";
}

/*************************************************
 * ✅ Category Manager
 *************************************************/
let adminCats = [];

function setCatMsg(msg, isErr = false) {
  setAlert($("catMsg"), msg, isErr);
}

async function loadAdminCategories() {
  const select = $("catSelect");
  if (!select) return;
  select.innerHTML = "";

  try {
    const res = await fetch(API.ADMIN_CATEGORIES, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setCatMsg(data?.error || "Kunde inte ladda kategorier", true);
      return;
    }

    adminCats = data;

    data.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.key} — ${c.name}`;
      select.appendChild(opt);
    });

    select.value = data[0]?.key || "demo";
    applyCatEditFromSelect();
  } catch (e) {
    console.error(e);
    setCatMsg("Serverfel vid kategorier", true);
  }
}

function applyCatEditFromSelect() {
  const key = $("catSelect")?.value;
  const c = adminCats.find(x => x.key === key);
  if (!c) return;
  $("catEditName").value = c.name || "";
  $("catEditPrompt").value = c.systemPrompt || "";
}

async function createCategory() {
  setCatMsg("");
  const key = $("catNewKey")?.value?.trim();
  const name = $("catNewName")?.value?.trim();
  const systemPrompt = $("catNewPrompt")?.value || "";

  if (!key || !name) {
    setCatMsg("Fyll i key + namn", true);
    return;
  }

  try {
    const res = await fetch(API.ADMIN_CATEGORIES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, name, systemPrompt })
    });

    const data = await res.json();
    if (!res.ok) {
      setCatMsg(data?.error || "Kunde inte skapa kategori", true);
      return;
    }

    setCatMsg("Kategori skapad ✅");
    $("catNewKey").value = "";
    $("catNewName").value = "";
    $("catNewPrompt").value = "";

    await loadCategories();
    await loadAdminCategories();
  } catch {
    setCatMsg("Serverfel vid skapa kategori", true);
  }
}

async function updateCategory() {
  setCatMsg("");
  const key = $("catSelect")?.value;
  const name = $("catEditName")?.value?.trim();
  const systemPrompt = $("catEditPrompt")?.value || "";

  if (!key) return;

  try {
    const res = await fetch(API.ADMIN_CAT_UPDATE(key), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, systemPrompt })
    });

    const data = await res.json();
    if (!res.ok) {
      setCatMsg(data?.error || "Kunde inte uppdatera kategori", true);
      return;
    }

    setCatMsg("Kategori uppdaterad ✅");
    await loadCategories();
    await loadAdminCategories();
  } catch {
    setCatMsg("Serverfel vid uppdatera kategori", true);
  }
}

async function deleteCategory() {
  setCatMsg("");
  const key = $("catSelect")?.value;
  if (!key) return;

  const ok = confirm(`Vill du verkligen radera kategorin "${key}"?`);
  if (!ok) return;

  try {
    const res = await fetch(API.ADMIN_CAT_DELETE(key), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) {
      setCatMsg(data?.error || "Kunde inte radera kategori", true);
      return;
    }

    setCatMsg("Kategori raderad ✅");
    await loadCategories();
    await loadAdminCategories();
  } catch {
    setCatMsg("Serverfel vid radera kategori", true);
  }
}

/*************************************************
 * ✅ Feedback
 *************************************************/
async function sendFeedback() {
  const msgEl = $("fbMsg");
  setAlert(msgEl, "");

  const rating = $("fbRating")?.value || "5";
  const comment = $("fbComment")?.value || "";

  try {
    const res = await fetch(API.FEEDBACK, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId, rating: Number(rating), comment })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte skicka feedback", true);
      return;
    }

    setAlert(msgEl, "Feedback skickad ✅");
    $("fbComment").value = "";
  } catch {
    setAlert(msgEl, "Serverfel vid feedback", true);
  }
}

/*************************************************
 * ✅ AUTH actions
 *************************************************/
async function login() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();
  setAlert($("authMessage"), "");

  if (!username || !password) {
    setAlert($("authMessage"), "Fyll i användarnamn och lösenord.", true);
    return;
  }

  try {
    const res = await fetch(API.LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert($("authMessage"), data?.error || "Login misslyckades", true);
      return;
    }

    token = data.token;
    localStorage.setItem("token", token);
    currentUser = await fetchMe();
    applyAuthUI();

    clearChat();
    addMessage("assistant", "Välkommen! Vad kan jag hjälpa dig med?");
  } catch {
    setAlert($("authMessage"), "Serverfel vid login", true);
  }
}

async function register() {
  const username = $("username")?.value?.trim();
  const email = $("email")?.value?.trim();
  const password = $("password")?.value?.trim();

  setAlert($("authMessage"), "");

  if (!username || !email || !password) {
    setAlert($("authMessage"), "Fyll i användarnamn, email och lösenord.", true);
    return;
  }

  try {
    const res = await fetch(API.REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert($("authMessage"), data?.error || "Registrering misslyckades", true);
      return;
    }

    setAlert($("authMessage"), "Registrering klar ✅ Logga in nu.");
  } catch {
    setAlert($("authMessage"), "Serverfel vid registrering", true);
  }
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
 * ✅ Forgot / Reset Password
 *************************************************/
function toggleForgotPanel(open = null) {
  const p = $("forgotPanel");
  if (!p) return;
  if (open === null) {
    p.style.display = p.style.display === "none" ? "" : "none";
  } else {
    p.style.display = open ? "" : "none";
  }
}

async function sendResetLink() {
  const msg = $("forgotMsg");
  setAlert(msg, "");

  const username = $("username")?.value?.trim();
  if (!username) {
    setAlert(msg, "Skriv ditt användarnamn först.", true);
    return;
  }

  try {
    const res = await fetch(API.FORGOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte skicka länk", true);
      return;
    }

    setAlert(msg, data.message || "Länk skickad ✅");
  } catch {
    setAlert(msg, "Serverfel vid reset mail", true);
  }
}

function openResetPanel(resetToken) {
  show($("resetPanel"), true);
  show($("forgotPanel"), false);
  window.__RESET_TOKEN__ = resetToken;
}

async function resetPassword() {
  const msg = $("resetMsg");
  setAlert(msg, "");

  const newPassword = $("resetNewPassword")?.value?.trim();
  const token = window.__RESET_TOKEN__;

  if (!token) {
    setAlert(msg, "Reset token saknas.", true);
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    setAlert(msg, "Lösenord måste vara minst 6 tecken.", true);
    return;
  }

  try {
    const res = await fetch(API.RESET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte återställa", true);
      return;
    }

    setAlert(msg, data.message || "Klart ✅ Logga in nu.");
    $("resetNewPassword").value = "";

    // remove resetToken from url
    const url = new URL(window.location.href);
    url.searchParams.delete("resetToken");
    window.history.replaceState({}, "", url.toString());

    window.__RESET_TOKEN__ = null;
    show($("resetPanel"), false);
  } catch {
    setAlert(msg, "Serverfel vid reset", true);
  }
}

/*************************************************
 * ✅ Settings
 *************************************************/
async function changeUsername() {
  const msg = $("settingsMsg");
  setAlert(msg, "");

  const newUsername = $("newUsername")?.value?.trim();
  if (!newUsername || newUsername.length < 3) {
    setAlert(msg, "Användarnamn måste vara minst 3 tecken.", true);
    return;
  }

  try {
    const res = await fetch(API.CHANGE_USERNAME, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newUsername })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte ändra användarnamn", true);
      return;
    }

    setAlert(msg, "Användarnamn uppdaterat ✅");
    currentUser = await fetchMe();
    applyAuthUI();
    $("newUsername").value = "";
  } catch {
    setAlert(msg, "Serverfel vid ändra användarnamn", true);
  }
}

async function changePassword() {
  const msg = $("settingsMsg");
  setAlert(msg, "");

  const currentPassword = $("currentPw")?.value?.trim();
  const newPassword = $("newPw")?.value?.trim();

  if (!currentPassword || !newPassword) {
    setAlert(msg, "Fyll i både nuvarande och nytt lösenord.", true);
    return;
  }

  if (newPassword.length < 6) {
    setAlert(msg, "Nytt lösenord måste vara minst 6 tecken.", true);
    return;
  }

  try {
    const res = await fetch(API.CHANGE_PASSWORD, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte byta lösenord", true);
      return;
    }

    setAlert(msg, "Lösenord uppdaterat ✅");
    $("currentPw").value = "";
    $("newPw").value = "";
  } catch {
    setAlert(msg, "Serverfel vid byta lösenord", true);
  }
}

/*************************************************
 * ✅ Password eye toggles
 *************************************************/
function togglePasswordInput(id) {
  const input = $(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

/*************************************************
 * ✅ Init
 *************************************************/
async function init() {
  // read category from URL if set
  const params = new URLSearchParams(window.location.search);
  const c = params.get("company");
  if (c) companyId = c;

  // If resetToken exists -> show reset form
  const resetToken = params.get("resetToken");
  if (resetToken) {
    show($("resetPanel"), true);
    openResetPanel(resetToken);
  }

  await loadCategories();
  refreshDebug();

  if (token) currentUser = await fetchMe();
  applyAuthUI();

  // Top events
  $("themeToggle")?.addEventListener("click", toggleTheme);
  $("logoutBtn")?.addEventListener("click", logout);

  // Auth
  $("loginBtn")?.addEventListener("click", login);
  $("registerBtn")?.addEventListener("click", register);

  $("forgotPwBtn")?.addEventListener("click", () => toggleForgotPanel(true));
  $("closeForgotPanelBtn")?.addEventListener("click", () => toggleForgotPanel(false));
  $("sendResetLinkBtn")?.addEventListener("click", sendResetLink);

  $("resetPasswordBtn")?.addEventListener("click", resetPassword);
  $("cancelResetBtn")?.addEventListener("click", () => show($("resetPanel"), false));

  $("toggleLoginPw")?.addEventListener("click", () => togglePasswordInput("password"));
  $("toggleResetPw")?.addEventListener("click", () => togglePasswordInput("resetNewPassword"));

  $("toggleCurrentPw")?.addEventListener("click", () => togglePasswordInput("currentPw"));
  $("toggleNewPw")?.addEventListener("click", () => togglePasswordInput("newPw"));

  // Chat
  $("sendBtn")?.addEventListener("click", sendMessage);
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  $("categorySelect")?.addEventListener("change", (e) => setCompanyFromSelect(e.target.value));
  $("newTicketBtn")?.addEventListener("click", startNewTicket);

  $("exportChatBtn")?.addEventListener("click", exportChat);
  $("clearChatBtn")?.addEventListener("click", clearChat);

  // Views
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("chat");
    openView(token ? "chat" : "auth");
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
    await kbRefreshList();
    await adminLoadUsers();
    await loadAdminCategories();
  });

  $("openSettingsView")?.addEventListener("click", () => {
    setActiveMenu("settings");
    openView("settings");
  });

  $("openFeedbackView")?.addEventListener("click", () => {
    setActiveMenu("feedback");
    openView("feedback");
  });

  // Inbox actions
  $("inboxRefreshBtn")?.addEventListener("click", inboxLoadTickets);
  $("inboxStatusFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxCategoryFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxSearchInput")?.addEventListener("input", inboxLoadTickets);

  $("setStatusOpen")?.addEventListener("click", () => inboxSetStatus("open"));
  $("setStatusPending")?.addEventListener("click", () => inboxSetStatus("pending"));
  $("setStatusSolved")?.addEventListener("click", () => inboxSetStatus("solved"));

  $("sendAgentReplyInboxBtn")?.addEventListener("click", inboxSendAgentReply);
  $("setPriorityBtn")?.addEventListener("click", inboxSetPriority);
  $("saveNotesBtn")?.addEventListener("click", saveNotes);
  $("deleteTicketBtn")?.addEventListener("click", deleteTicket);

  // Dashboard buttons
  $("refreshDashboardBtn")?.addEventListener("click", loadDashboard);
  $("deleteSolvedTicketsBtn")?.addEventListener("click", deleteSolvedTickets);

  // KB actions
  document.querySelectorAll(".tabBtn").forEach((btn) => {
    btn.addEventListener("click", () => activateKbTab(btn.dataset.tab));
  });

  $("kbRefreshBtn")?.addEventListener("click", kbRefreshList);
  $("kbExportBtn")?.addEventListener("click", kbExport);
  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);
  $("kbCategorySelect")?.addEventListener("change", kbRefreshList);

  // Users/admin
  $("adminUsersRefreshBtn")?.addEventListener("click", adminLoadUsers);
  $("adminExportAllBtn")?.addEventListener("click", () => window.open(API.ADMIN_EXPORT_ALL, "_blank"));

  // Category manager
  $("createCategoryBtn")?.addEventListener("click", createCategory);
  $("catSelect")?.addEventListener("change", applyCatEditFromSelect);
  $("updateCategoryBtn")?.addEventListener("click", updateCategory);
  $("deleteCategoryBtn")?.addEventListener("click", deleteCategory);

  // Settings actions
  $("changeUsernameBtn")?.addEventListener("click", changeUsername);
  $("changePasswordBtn")?.addEventListener("click", changePassword);

  // Feedback
  $("sendFeedbackBtn")?.addEventListener("click", sendFeedback);

  // Debug
  $("toggleDebugBtn")?.addEventListener("click", () => {
    const p = $("debugPanel");
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
  });

  // welcome text
  if (token && currentUser) {
    openView("chat");
    clearChat();
    addMessage("assistant", "Välkommen tillbaka! Vad kan jag hjälpa dig med?");
  }
}

document.addEventListener("DOMContentLoaded", init);
