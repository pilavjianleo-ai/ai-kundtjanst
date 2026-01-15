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

  // user tickets
  TICKETS: `${API_BASE}/tickets`,
  TICKET: (id) => `${API_BASE}/tickets/${id}`,

  // admin
  DASHBOARD: `${API_BASE}/admin/dashboard`,
  ADMIN_USERS: `${API_BASE}/admin/users`,
  ADMIN_USER_ROLE: (id) => `${API_BASE}/admin/users/${id}/role`,
  ADMIN_DELETE_USER: (id) => `${API_BASE}/admin/users/${id}`,
  ADMIN_EXPORT_ALL: `${API_BASE}/admin/export/all`,
  ADMIN_EXPORT_TRAINING: `${API_BASE}/admin/export/training`,
  ADMIN_TICKETS: `${API_BASE}/admin/tickets`,
  ADMIN_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_TICKET_STATUS: (id) => `${API_BASE}/admin/tickets/${id}/status`,
  ADMIN_TICKET_PRIORITY: (id) => `${API_BASE}/admin/tickets/${id}/priority`,
  ADMIN_TICKET_REPLY: (id) => `${API_BASE}/admin/tickets/${id}/agent-reply`,
  ADMIN_TICKET_NOTES: (id) => `${API_BASE}/admin/tickets/${id}/notes`,
  ADMIN_DELETE_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_CLEAR_SOLVED: `${API_BASE}/admin/tickets-solved`,

  // categories admin
  ADMIN_CREATE_CATEGORY: `${API_BASE}/admin/categories`,

  // kb
  KB_LIST: (companyId) => `${API_BASE}/kb/list/${companyId}`,
  KB_TEXT: `${API_BASE}/kb/upload-text`,
  KB_URL: `${API_BASE}/kb/upload-url`,
  KB_PDF: `${API_BASE}/kb/upload-pdf`,
  KB_EXPORT: (companyId) => `${API_BASE}/export/kb/${companyId}`,
  KB_CLEAR: (companyId) => `${API_BASE}/kb/clear/${companyId}`,

  // admin notes per category
  ADMIN_NOTES_LIST: (companyId) => `${API_BASE}/admin/notes/${companyId}`,
  ADMIN_NOTES_CREATE: `${API_BASE}/admin/notes`,
};

let token = localStorage.getItem("token") || null;
let currentUser = null; // {id, username, role}

let companyId = "demo";
let ticketId = null;
let lastRagUsed = null;

// admin/inbox state
let inboxSelectedTicketId = null;

// user/tickets state
let userSelectedTicketId = null;

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

function setHTML(el, html) {
  if (el) el.innerHTML = html;
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

function confirmSafe(message) {
  return window.confirm(message);
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
 * ✅ Title map
 *************************************************/
function titleForCompany(c) {
  const map = {
    demo: { title: "AI Kundtjänst – Demo", sub: "Ställ en fråga så hjälper jag dig direkt." },
    law: { title: "AI Kundtjänst – Juridik", sub: "Allmän vägledning (inte juridisk rådgivning)." },
    tech: { title: "AI Kundtjänst – Teknisk support", sub: "Felsökning och IT-hjälp." },
    cleaning: { title: "AI Kundtjänst – Städservice", sub: "Frågor om städ, tjänster, rutiner." },
  };
  return map[c] || map.demo;
}

function applyCompanyToUI() {
  const t = titleForCompany(companyId);
  setText($("chatTitle"), t.title);
  setText($("chatSubtitle"), t.sub);

  if ($("categorySelect")) $("categorySelect").value = companyId;
}

/*************************************************
 * ✅ Debug panel
 *************************************************/
function refreshDebug() {
  setText($("dbgApi"), API_BASE || "(same-origin)");
  setText($("dbgLogged"), token ? "JA" : "NEJ");
  setText($("dbgRole"), currentUser?.role || "-");
  setText($("dbgTicket"), ticketId || "-");
  setText($("dbgRag"), lastRagUsed === null ? "-" : lastRagUsed ? "JA" : "NEJ");
}

/*************************************************
 * ✅ View switching
 *************************************************/
function setActiveMenu(btnId) {
  ["openChatView", "openMyTicketsView", "openInboxView", "openAdminView", "openDashboardView"].forEach((id) => {
    $(id)?.classList.remove("active");
  });

  if (btnId === "chat") $("openChatView")?.classList.add("active");
  if (btnId === "mytickets") $("openMyTicketsView")?.classList.add("active");
  if (btnId === "inbox") $("openInboxView")?.classList.add("active");
  if (btnId === "admin") $("openAdminView")?.classList.add("active");
  if (btnId === "dash") $("openDashboardView")?.classList.add("active");
}

function openView(viewName) {
  show($("authView"), viewName === "auth");
  show($("chatView"), viewName === "chat");
  show($("myTicketsView"), viewName === "mytickets");
  show($("inboxView"), viewName === "inbox");
  show($("adminView"), viewName === "admin");
  show($("dashboardView"), viewName === "dash");
}

/*************************************************
 * ✅ Auth UI
 *************************************************/
function applyAuthUI() {
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");

  const myTicketsBtn = $("openMyTicketsView");
  const inboxBtn = $("openInboxView");
  const adminBtn = $("openAdminView");
  const dashBtn = $("openDashboardView");

  if (!token || !currentUser) {
    openView("auth");
    setText(roleBadge, "Inte inloggad");
    show(logoutBtn, false);

    show(myTicketsBtn, false);
    show(inboxBtn, false);
    show(adminBtn, false);
    show(dashBtn, false);
  } else {
    openView("chat");
    setText(roleBadge, `${currentUser.username} • ${currentUser.role.toUpperCase()}`);
    show(logoutBtn, true);

    // ✅ Users can always access My Tickets
    show(myTicketsBtn, true);

    // ✅ Admin-only
    const isAdmin = currentUser.role === "admin";
    show(inboxBtn, isAdmin);
    show(adminBtn, isAdmin);
    show(dashBtn, isAdmin);
  }

  refreshDebug();
}

/*************************************************
 * ✅ Fetch current user (/me)
 *************************************************/
async function fetchMe() {
  if (!token) return null;

  const res = await fetch(API.ME, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    token = null;
    localStorage.removeItem("token");
    return null;
  }

  return await res.json();
}

/*************************************************
 * ✅ Categories
 *************************************************/
async function loadCategories() {
  const sel = $("categorySelect");
  const kbSel = $("kbCategorySelect");
  const inboxCat = $("inboxCategoryFilter");
  const dashCat = $("dashCategoryFilter");
  const noteCat = $("adminNotesCategorySelect");

  // if no dropdowns exist just skip
  if (!sel && !kbSel && !inboxCat && !dashCat && !noteCat) return;

  let cats = [];
  try {
    const res = await fetch(API.CATEGORIES, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.ok) cats = await res.json();
  } catch {
    // ignore
  }

  // fallback if server fails
  if (!cats.length) {
    cats = [
      { companyId: "demo", title: "Demo" },
      { companyId: "law", title: "Juridik" },
      { companyId: "tech", title: "Teknisk support" },
      { companyId: "cleaning", title: "Städservice" },
    ];
  }

  function fillSelect(selectEl, includeAll = false) {
    if (!selectEl) return;
    const current = selectEl.value;

    let html = "";
    if (includeAll) html += `<option value="">Alla</option>`;

    for (const c of cats) {
      html += `<option value="${escapeHtml(c.companyId)}">${escapeHtml(c.title || c.companyId)}</option>`;
    }
    selectEl.innerHTML = html;

    if (current) selectEl.value = current;
  }

  fillSelect(sel, false);
  fillSelect(kbSel, false);
  fillSelect(noteCat, false);
  fillSelect(inboxCat, true);
  fillSelect(dashCat, true);

  // set defaults
  if (sel && !sel.value) sel.value = companyId;
  if (kbSel && !kbSel.value) kbSel.value = companyId;
  if (noteCat && !noteCat.value) noteCat.value = companyId;
}

/*************************************************
 * ✅ Chat rendering
 *************************************************/
function addMessage(role, content, meta = "") {
  const messagesDiv = $("messages");
  if (!messagesDiv) return;

  const safe = escapeHtml(content);
  const isUser = role === "user";

  const icon = isUser ? "fa-user" : role === "agent" ? "fa-user-tie" : "fa-robot";

  const wrapper = document.createElement("div");
  wrapper.className = `msg ${isUser ? "user" : "ai"}`;

  wrapper.innerHTML = `
    <div class="avatar"><i class="fa-solid ${icon}"></i></div>
    <div style="min-width: 0;">
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

function clearChat() {
  if ($("messages")) $("messages").innerHTML = "";
}

/*************************************************
 * ✅ Conversation builder (last N msgs)
 *************************************************/
function gatherConversationFromUI(limit = 12) {
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

  return all.slice(-limit);
}

/*************************************************
 * ✅ Category select
 *************************************************/
function setCompanyFromSelect(value) {
  companyId = value || "demo";
  applyCompanyToUI();

  // reset ticket so context changes correctly per category
  ticketId = null;
  clearChat();
  addMessage("assistant", `Du bytte kategori till "${companyId}". Vad vill du fråga?`);
  refreshDebug();
}

/*************************************************
 * ✅ New ticket
 *************************************************/
async function startNewTicket() {
  ticketId = null;
  clearChat();
  addMessage("assistant", "Nytt ärende skapat ✅ Vad kan jag hjälpa dig med?");
  refreshDebug();
}

/*************************************************
 * ✅ Send chat
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
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyId, conversation, ticketId }),
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

    addMessage(
      "assistant",
      data.reply || "Inget svar.",
      data.ragUsed ? "Svar baserat på kunskapsdatabas (RAG)" : ""
    );
  } catch (e) {
    hideTyping();
    addMessage("assistant", "Tekniskt fel. Försök igen.");
    console.error(e);
  }
}

/*************************************************
 * ✅ Export chat
 *************************************************/
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
 * ✅ USER: My Tickets
 *************************************************/
function renderUserTickets(list, tickets) {
  if (!list) return;

  if (!tickets.length) {
    list.innerHTML = `<div class="muted small">Inga ärenden hittades.</div>`;
    return;
  }

  list.innerHTML = "";

  tickets.forEach((t) => {
    const div = document.createElement("div");
    div.className = `ticketItem ${userSelectedTicketId === t._id ? "selected" : ""}`;

    div.innerHTML = `
      <div class="listItemTitle">
        ${escapeHtml(t.title || "Ärende")}
        <span class="pill ${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
      </div>
      <div class="listItemMeta">
        ${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.lastActivityAt))}
      </div>
    `;

    div.addEventListener("click", async () => {
      userSelectedTicketId = t._id;
      await loadUserTicketDetails(t._id);
      await loadUserTickets();
    });

    list.appendChild(div);
  });
}

async function loadUserTickets() {
  const msg = $("myTicketsMsg");
  const list = $("myTicketsList");
  setAlert(msg, "");
  if (list) list.innerHTML = "";

  try {
    const res = await fetch(API.TICKETS, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte hämta dina ärenden", true);
      return;
    }

    renderUserTickets(list, data);
  } catch (e) {
    setAlert(msg, "Serverfel vid hämtning av ärenden", true);
  }
}

async function loadUserTicketDetails(id) {
  const details = $("myTicketDetails");
  const msg = $("myTicketsMsg");
  setAlert(msg, "");

  if (!details) return;
  details.innerHTML = `<div class="muted small">Laddar ärende...</div>`;

  try {
    const res = await fetch(API.TICKET(id), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      details.innerHTML = `<div class="muted small">Kunde inte ladda ärende.</div>`;
      setAlert(msg, data?.error || "Kunde inte ladda ärende", true);
      return;
    }

    const msgs = data.messages || [];
    const html = msgs
      .slice(-80)
      .map((m) => {
        const roleLabel = m.role === "user" ? "Du" : m.role === "agent" ? "Agent" : "AI";
        return `
          <div class="ticketMsg ${escapeHtml(m.role)}">
            <div class="ticketMsgHead">
              <b>${escapeHtml(roleLabel)}</b>
              <span>${escapeHtml(formatDate(m.timestamp))}</span>
            </div>
            <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
          </div>
        `;
      })
      .join("");

    details.innerHTML = `
      <div class="ticketInfo">
        <div><b>Titel:</b> ${escapeHtml(data.title || "-")}</div>
        <div><b>Status:</b> ${escapeHtml(data.status)}</div>
        <div><b>Kategori:</b> ${escapeHtml(data.companyId)}</div>
      </div>
      <div class="divider"></div>
      <div class="ticketMsgs">${html}</div>
      <div class="muted small" style="margin-top:10px;">
        Agent-svar dyker upp här automatiskt ✅
      </div>
    `;
  } catch (e) {
    details.innerHTML = `<div class="muted small">Serverfel vid ärende.</div>`;
  }
}

/*************************************************
 * ✅ ADMIN: Inbox tickets
 *************************************************/
function inboxGetFilters() {
  const status = $("inboxStatusFilter")?.value || "";
  const cat = $("inboxCategoryFilter")?.value || "";
  const q = ($("inboxSearchInput")?.value || "").trim().toLowerCase();
  return { status, cat, q };
}

function ticketMatchesSearch(t, q) {
  if (!q) return true;
  const a = String(t.title || "").toLowerCase();
  const b = String(t.companyId || "").toLowerCase();
  const c = String(t._id || "").toLowerCase();
  return a.includes(q) || b.includes(q) || c.includes(q);
}

async function inboxLoadTickets() {
  const list = $("inboxTicketsList");
  const msg = $("inboxMsg");
  setAlert(msg, "");
  if (list) list.innerHTML = "";

  const { status, cat, q } = inboxGetFilters();
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (cat) params.set("companyId", cat);

  try {
    const res = await fetch(`${API.ADMIN_TICKETS}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte hämta inbox", true);
      return;
    }

    let filtered = data;
    if (q) filtered = filtered.filter((t) => ticketMatchesSearch(t, q));

    if (!filtered.length) {
      list.innerHTML = `<div class="muted small">Inga tickets hittades.</div>`;
      return;
    }

    filtered.forEach((t) => {
      const div = document.createElement("div");
      div.className = `ticketItem ${inboxSelectedTicketId === t._id ? "selected" : ""}`;

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(t.title || "Ticket")}
          <span class="pill ${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
          <span class="pill prio ${escapeHtml(t.priority || "normal")}">${escapeHtml(t.priority || "normal")}</span>
        </div>
        <div class="listItemMeta">
          ${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.lastActivityAt))}
        </div>
        <div class="listItemMeta small">ID: ${escapeHtml(t._id)}</div>
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
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
      setAlert(msg, data?.error || "Kunde inte ladda ticket", true);
      return;
    }

    const msgs = data.messages || [];
    const internalNotes = data.internalNotes || [];

    const msgsHtml = msgs
      .slice(-80)
      .map((m) => {
        const roleLabel = m.role === "user" ? "Kund" : m.role === "agent" ? "Agent" : "AI";
        return `
          <div class="ticketMsg ${escapeHtml(m.role)}">
            <div class="ticketMsgHead">
              <b>${escapeHtml(roleLabel)}</b>
              <span>${escapeHtml(formatDate(m.timestamp))}</span>
            </div>
            <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
          </div>
        `;
      })
      .join("");

    const notesHtml = internalNotes.length
      ? internalNotes
          .slice(-20)
          .map(
            (n) => `
          <div class="noteItem">
            <div class="noteHead">
              <b>${escapeHtml(n.byUsername || "admin")}</b>
              <span>${escapeHtml(formatDate(n.timestamp))}</span>
            </div>
            <div class="noteBody">${escapeHtml(n.content)}</div>
          </div>
        `
          )
          .join("")
      : `<div class="muted small">Inga interna noteringar ännu.</div>`;

    details.innerHTML = `
      <div class="ticketInfo">
        <div><b>ID:</b> ${escapeHtml(data._id)}</div>
        <div><b>Kategori:</b> ${escapeHtml(data.companyId)}</div>
        <div><b>Status:</b> ${escapeHtml(data.status)}</div>
        <div><b>Prioritet:</b> ${escapeHtml(data.priority || "normal")}</div>
        <div><b>Senast:</b> ${escapeHtml(formatDate(data.lastActivityAt))}</div>
      </div>

      <div class="divider"></div>

      <div class="twoCol">
        <div>
          <div class="sectionTitle">Konversation</div>
          <div class="ticketMsgs">${msgsHtml}</div>
        </div>

        <div>
          <div class="sectionTitle">Interna noteringar (endast admin)</div>
          <div class="notesBox">${notesHtml}</div>

          <div class="divider"></div>

          <div class="sectionTitle">Admin actions</div>
          <div class="row gap">
            <button class="btn secondary small" id="btnMarkSolved">
              <i class="fa-solid fa-check"></i> Markera solved
            </button>
            <button class="btn danger small" id="btnDeleteTicket">
              <i class="fa-solid fa-trash"></i> Ta bort ticket
            </button>
          </div>
        </div>
      </div>
    `;

    // bind actions
    $("btnMarkSolved")?.addEventListener("click", () => inboxSetStatus("solved"));
    $("btnDeleteTicket")?.addEventListener("click", async () => {
      const ok = confirmSafe("Vill du verkligen ta bort ticketen? Detta kan inte ångras.");
      if (!ok) return;
      await adminDeleteTicket(id);
      inboxSelectedTicketId = null;
      setHTML($("ticketDetails"), `<div class="muted small">Välj en ticket i listan.</div>`);
      await inboxLoadTickets();
    });
  } catch (e) {
    details.innerHTML = `<div class="muted small">Serverfel vid ticket.</div>`;
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte uppdatera status", true);
      return;
    }

    setAlert(msg, "Status uppdaterad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch (e) {
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ priority }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msg, data?.error || "Kunde inte spara prioritet", true);
      return;
    }

    setAlert(msg, "Prioritet sparad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch (e) {
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
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
  } catch (e) {
    setAlert(msgEl, "Serverfel vid agent-svar", true);
  }
}

async function inboxAddInternalNote() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) {
    setAlert(msgEl, "Välj en ticket först.", true);
    return;
  }

  const content = $("internalNoteTextInbox")?.value?.trim();
  if (!content) {
    setAlert(msgEl, "Skriv en notering först.", true);
    return;
  }

  try {
    const res = await fetch(API.ADMIN_TICKET_NOTES(inboxSelectedTicketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte spara notering", true);
      return;
    }

    setAlert(msgEl, "Notering sparad ✅");
    $("internalNoteTextInbox").value = "";
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch (e) {
    setAlert(msgEl, "Serverfel vid notering", true);
  }
}

/*************************************************
 * ✅ ADMIN: delete ticket
 *************************************************/
async function adminDeleteTicket(id) {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  try {
    const res = await fetch(API.ADMIN_DELETE_TICKET(id), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ta bort ticket", true);
      return;
    }

    setAlert(msgEl, data.message || "Ticket borttagen ✅");
  } catch (e) {
    setAlert(msgEl, "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ ADMIN: Users list + role toggle + delete user
 *************************************************/
async function adminLoadUsers() {
  const msgEl = $("adminUsersMsg");
  const list = $("adminUsersList");
  setAlert(msgEl, "");
  if (list) list.innerHTML = "";

  try {
    const res = await fetch(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte hämta users", true);
      return;
    }

    if (!data.length) {
      setAlert(msgEl, "Inga users hittades.");
      return;
    }

    data.forEach((u) => {
      const div = document.createElement("div");
      div.className = "listItem";

      const isAdmin = u.role === "admin";
      const isSelf = String(u._id) === String(currentUser?.id);

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(u.username)}
          <span class="pill ${isAdmin ? "admin" : ""}">${escapeHtml(u.role)}</span>
        </div>
        <div class="listItemMeta">ID: ${escapeHtml(u._id)}</div>

        <div class="row" style="margin-top:10px; gap:10px;">
          <button class="btn secondary small" data-action="toggleRole">
            <i class="fa-solid fa-user-gear"></i>
            ${isSelf ? "Din roll" : isAdmin ? "Admin (låst)" : "Gör admin"}
          </button>

          <button class="btn danger small" data-action="deleteUser">
            <i class="fa-solid fa-trash"></i>
            Ta bort
          </button>
        </div>
      `;

      // lock role changes for self and admins
      const roleBtn = div.querySelector('[data-action="toggleRole"]');
      if (isSelf || isAdmin) {
        roleBtn.disabled = true;
        roleBtn.style.opacity = "0.6";
        roleBtn.style.cursor = "not-allowed";
      } else {
        roleBtn.addEventListener("click", async () => {
          await adminSetUserRole(u._id, "admin");
          await adminLoadUsers();
        });
      }

      // do not allow deleting admins
      const delBtn = div.querySelector('[data-action="deleteUser"]');
      if (isAdmin) {
        delBtn.disabled = true;
        delBtn.style.opacity = "0.6";
        delBtn.style.cursor = "not-allowed";
      } else {
        delBtn.addEventListener("click", async () => {
          const ok = confirmSafe(`Vill du verkligen ta bort användaren "${u.username}"? Detta tar även bort deras tickets.`);
          if (!ok) return;

          await adminDeleteUser(u._id);
          await adminLoadUsers();
        });
      }

      list.appendChild(div);
    });
  } catch (e) {
    console.error("Admin users error:", e);
    setAlert(msgEl, "Serverfel vid users", true);
  }
}

async function adminSetUserRole(userId, role) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const res = await fetch(API.ADMIN_USER_ROLE(userId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ändra roll", true);
      return;
    }

    setAlert(msgEl, `Roll uppdaterad ✅`);
  } catch (e) {
    setAlert(msgEl, "Serverfel vid roll-ändring", true);
  }
}

async function adminDeleteUser(userId) {
  const msgEl = $("adminUsersMsg");
  setAlert(msgEl, "");

  try {
    const res = await fetch(API.ADMIN_DELETE_USER(userId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ta bort user", true);
      return;
    }

    setAlert(msgEl, data.message || "User borttagen ✅");
  } catch (e) {
    console.error("Delete user error:", e);
    setAlert(msgEl, "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ ADMIN: KB Manager
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
      headers: { Authorization: `Bearer ${token}` },
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: cat, title, content }),
    });

    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Fel vid text-upload", true);
      return;
    }

    setKbMsg(data.message || "Text uppladdad ✅");
    $("kbTextContent").value = "";
    await kbRefreshList();
  } catch (e) {
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: cat, url }),
    });

    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Fel vid URL-upload", true);
      return;
    }

    setKbMsg(data.message || "URL uppladdad ✅");
    $("kbUrlInput").value = "";
    await kbRefreshList();
  } catch (e) {
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: cat, filename: file.name, base64 }),
    });

    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Fel vid PDF-upload", true);
      return;
    }

    setKbMsg(data.message || "PDF uppladdad ✅");
    $("kbPdfFile").value = "";
    await kbRefreshList();
  } catch (e) {
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

async function kbClear() {
  const cat = kbActiveCategory();
  const ok = confirmSafe(`Vill du rensa hela kunskapsdatabasen för "${cat}"?`);
  if (!ok) return;

  setKbMsg("Rensar…");

  try {
    const res = await fetch(API.KB_CLEAR(cat), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      setKbMsg(data?.error || "Kunde inte rensa KB", true);
      return;
    }

    setKbMsg(data.message || "KB rensad ✅");
    await kbRefreshList();
  } catch {
    setKbMsg("Serverfel vid KB-rensning", true);
  }
}

function trainingExport() {
  const cat = kbActiveCategory();
  window.open(`${API.ADMIN_EXPORT_TRAINING}?companyId=${encodeURIComponent(cat)}`, "_blank");
}

function adminExportAll() {
  window.open(API.ADMIN_EXPORT_ALL, "_blank");
}

/*************************************************
 * ✅ Admin Notes per category
 *************************************************/
function notesActiveCategory() {
  return $("adminNotesCategorySelect")?.value || "demo";
}

function setNotesMsg(msg, isErr = false) {
  setAlert($("adminNotesMsg"), msg, isErr);
}

async function adminNotesLoad() {
  const list = $("adminNotesList");
  setNotesMsg("");
  if (list) list.innerHTML = "";

  const cat = notesActiveCategory();

  try {
    const res = await fetch(API.ADMIN_NOTES_LIST(cat), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      setNotesMsg(data?.error || "Kunde inte ladda noteringar", true);
      return;
    }

    if (!data.length) {
      list.innerHTML = `<div class="muted small">Inga noteringar för denna kategori.</div>`;
      return;
    }

    data.slice(0, 60).forEach((n) => {
      const div = document.createElement("div");
      div.className = "noteCard";
      div.innerHTML = `
        <div class="noteHead">
          <b>${escapeHtml(n.title || "Notering")}</b>
          <span class="muted small">${escapeHtml(formatDate(n.createdAt))}</span>
        </div>
        <div class="noteBody">${escapeHtml(n.content)}</div>
        <div class="muted small">Av: ${escapeHtml(n.createdByUsername || "admin")}</div>
      `;
      list.appendChild(div);
    });
  } catch {
    setNotesMsg("Serverfel vid noteringar", true);
  }
}

async function adminNotesCreate() {
  const cat = notesActiveCategory();
  const title = $("adminNoteTitle")?.value?.trim() || "";
  const content = $("adminNoteContent")?.value?.trim() || "";

  if (!content || content.length < 3) {
    setNotesMsg("Skriv en notering först.", true);
    return;
  }

  setNotesMsg("Sparar…");

  try {
    const res = await fetch(API.ADMIN_NOTES_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: cat, title, content }),
    });

    const data = await res.json();
    if (!res.ok) {
      setNotesMsg(data?.error || "Kunde inte spara notering", true);
      return;
    }

    setNotesMsg(data.message || "Notering sparad ✅");
    $("adminNoteTitle").value = "";
    $("adminNoteContent").value = "";
    await adminNotesLoad();
  } catch {
    setNotesMsg("Serverfel vid notering", true);
  }
}

/*************************************************
 * ✅ Dashboard
 *************************************************/
function setDashMsg(msg, isErr = false) {
  setAlert($("dashMsg"), msg, isErr);
}

async function dashboardLoad() {
  setDashMsg("");

  try {
    const res = await fetch(API.DASHBOARD, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      setDashMsg(data?.error || "Kunde inte ladda dashboard", true);
      return;
    }

    // counters
    setText($("dashTotalUsers"), data.totalUsers ?? "-");
    setText($("dashTotalTickets"), data.totalTickets ?? "-");
    setText($("dashOpenTickets"), data.open ?? "-");
    setText($("dashPendingTickets"), data.pending ?? "-");
    setText($("dashSolvedTickets"), data.solved ?? "-");

    // latest tickets
    const latest = $("dashLatestTickets");
    if (latest) {
      const arr = data.latest || [];
      if (!arr.length) {
        latest.innerHTML = `<div class="muted small">Inga tickets.</div>`;
      } else {
        latest.innerHTML = arr
          .slice(0, 10)
          .map(
            (t) => `
            <div class="listItem">
              <div class="listItemTitle">
                ${escapeHtml(t.title || "Ticket")}
                <span class="pill ${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
              </div>
              <div class="listItemMeta">${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.lastActivityAt))}</div>
              <div class="listItemMeta small">ID: ${escapeHtml(t._id)}</div>
            </div>
          `
          )
          .join("");
      }
    }

    // chart-ish list
    const byComp = $("dashByCompany");
    if (byComp) {
      const rows = data.byCompany || [];
      if (!rows.length) byComp.innerHTML = `<div class="muted small">Ingen data.</div>`;
      else {
        byComp.innerHTML = rows
          .map((r) => `<div class="rowBetween"><span>${escapeHtml(r._id)}</span><b>${escapeHtml(r.count)}</b></div>`)
          .join("");
      }
    }
  } catch {
    setDashMsg("Serverfel vid dashboard", true);
  }
}

async function dashboardClearSolved() {
  const ok = confirmSafe("Vill du rensa ALLA tickets med status 'solved'? Detta går inte att ångra.");
  if (!ok) return;

  setDashMsg("Rensar solved tickets…");

  try {
    const res = await fetch(API.ADMIN_CLEAR_SOLVED, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      setDashMsg(data?.error || "Kunde inte rensa solved", true);
      return;
    }

    setDashMsg(data.message || "Rensat ✅");
    await dashboardLoad();
    await inboxLoadTickets();
  } catch {
    setDashMsg("Serverfel vid rensning", true);
  }
}

/*************************************************
 * ✅ Admin: Create category (dynamic AI)
 *************************************************/
function setCatMsg(msg, isErr = false) {
  setAlert($("adminCategoryMsg"), msg, isErr);
}

async function adminCreateCategory() {
  const company = $("adminCategoryCompanyId")?.value?.trim()?.toLowerCase();
  const title = $("adminCategoryTitle")?.value?.trim();
  const prompt = $("adminCategoryPrompt")?.value?.trim();

  setCatMsg("");

  if (!company || !title || !prompt) {
    setCatMsg("Fyll i companyId, titel och systemprompt.", true);
    return;
  }

  setCatMsg("Skapar kategori…");

  try {
    const res = await fetch(API.ADMIN_CREATE_CATEGORY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: company, title, systemPrompt: prompt }),
    });

    const data = await res.json();
    if (!res.ok) {
      setCatMsg(data?.error || "Kunde inte skapa kategori", true);
      return;
    }

    setCatMsg(data.message || "Kategori skapad ✅");
    $("adminCategoryCompanyId").value = "";
    $("adminCategoryTitle").value = "";
    $("adminCategoryPrompt").value = "";
    await loadCategories();
  } catch {
    setCatMsg("Serverfel vid kategori-skapande", true);
  }
}

/*************************************************
 * ✅ KB tabs
 *************************************************/
function activateKbTab(tabId) {
  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));

  document.querySelectorAll(`.tabBtn[data-tab="${tabId}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = "";
}

/*************************************************
 * ✅ Auth actions
 *************************************************/
async function login() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();

  setAlert($("authMessage"), "");
  if (!username || !password) {
    setAlert($("authMessage"), "Fyll i både användarnamn och lösenord.", true);
    return;
  }

  try {
    const res = await fetch(API.LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
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

    await loadCategories();

    applyCompanyToUI();
    clearChat();
    addMessage("assistant", "Välkommen! Vad kan jag hjälpa dig med?");
  } catch {
    setAlert($("authMessage"), "Serverfel vid login", true);
  }
}

async function register() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();
  const password2 = $("password2")?.value?.trim(); // optional if exists

  setAlert($("authMessage"), "");

  if (!username || !password) {
    setAlert($("authMessage"), "Fyll i både användarnamn och lösenord.", true);
    return;
  }

  if ($("password2") && password !== password2) {
    setAlert($("authMessage"), "Lösenorden matchar inte.", true);
    return;
  }

  if (password.length < 6) {
    setAlert($("authMessage"), "Lösenord måste vara minst 6 tecken.", true);
    return;
  }

  try {
    const res = await fetch(API.REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
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
  userSelectedTicketId = null;

  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Init
 *************************************************/
async function init() {
  const params = new URLSearchParams(window.location.search);
  const c = params.get("company");
  if (c) companyId = c;

  applyCompanyToUI();
  refreshDebug();

  // If token exists, fetch /me
  if (token) {
    currentUser = await fetchMe();
  }

  applyAuthUI();
  await loadCategories();

  // Chat events
  $("themeToggle")?.addEventListener("click", toggleTheme);
  $("logoutBtn")?.addEventListener("click", logout);

  $("loginBtn")?.addEventListener("click", login);
  $("registerBtn")?.addEventListener("click", register);

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

  $("toggleDebugBtn")?.addEventListener("click", () => {
    const p = $("debugPanel");
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
  });

  // menu switches
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("chat");
    openView("chat");
  });

  $("openMyTicketsView")?.addEventListener("click", async () => {
    setActiveMenu("mytickets");
    openView("mytickets");
    await loadUserTickets();
  });

  $("openInboxView")?.addEventListener("click", async () => {
    setActiveMenu("inbox");
    openView("inbox");
    await inboxLoadTickets();
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("admin");
    openView("admin");
    activateKbTab("tabKbUpload");
    await kbRefreshList();
    await adminLoadUsers();
    await adminNotesLoad();
  });

  $("openDashboardView")?.addEventListener("click", async () => {
    setActiveMenu("dash");
    openView("dash");
    await dashboardLoad();
  });

  // inbox actions
  $("inboxRefreshBtn")?.addEventListener("click", inboxLoadTickets);
  $("inboxStatusFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxCategoryFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxSearchInput")?.addEventListener("input", inboxLoadTickets);

  $("setStatusOpen")?.addEventListener("click", () => inboxSetStatus("open"));
  $("setStatusPending")?.addEventListener("click", () => inboxSetStatus("pending"));
  $("setStatusSolved")?.addEventListener("click", () => inboxSetStatus("solved"));

  $("setPriorityBtn")?.addEventListener("click", inboxSetPriority);

  $("sendAgentReplyInboxBtn")?.addEventListener("click", inboxSendAgentReply);
  $("addInternalNoteInboxBtn")?.addEventListener("click", inboxAddInternalNote);

  // KB manager
  document.querySelectorAll(".tabBtn").forEach((btn) => {
    btn.addEventListener("click", () => activateKbTab(btn.dataset.tab));
  });

  $("kbRefreshBtn")?.addEventListener("click", kbRefreshList);
  $("kbExportBtn")?.addEventListener("click", kbExport);
  $("kbClearBtn")?.addEventListener("click", kbClear);
  $("trainingExportBtn")?.addEventListener("click", trainingExport);

  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);
  $("kbCategorySelect")?.addEventListener("change", kbRefreshList);

  // admin users
  $("adminUsersRefreshBtn")?.addEventListener("click", adminLoadUsers);
  $("adminExportAllBtn")?.addEventListener("click", adminExportAll);

  // admin notes
  $("adminNotesRefreshBtn")?.addEventListener("click", adminNotesLoad);
  $("adminNotesSaveBtn")?.addEventListener("click", adminNotesCreate);
  $("adminNotesCategorySelect")?.addEventListener("change", adminNotesLoad);

  // dashboard
  $("dashRefreshBtn")?.addEventListener("click", dashboardLoad);
  $("dashClearSolvedBtn")?.addEventListener("click", dashboardClearSolved);

  // categories admin
  $("adminCreateCategoryBtn")?.addEventListener("click", adminCreateCategory);

  // default welcome
  if (token && currentUser) {
    clearChat();
    addMessage("assistant", "Välkommen tillbaka! Vad kan jag hjälpa dig med?");
  }
}

document.addEventListener("DOMContentLoaded", init);
