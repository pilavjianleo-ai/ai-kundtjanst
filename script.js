/*************************************************
 * ✅ API base + endpoints
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API = {
  ME: `${API_BASE}/me`,
  LOGIN: `${API_BASE}/login`,
  REGISTER: `${API_BASE}/register`,
  CHAT: `${API_BASE}/chat`,
  TICKETS: `${API_BASE}/tickets`,

  // agent/admin inbox
  ADMIN_TICKETS: `${API_BASE}/admin/tickets`,
  ADMIN_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_TICKET_STATUS: (id) => `${API_BASE}/admin/tickets/${id}/status`,
  ADMIN_TICKET_PRIORITY: (id) => `${API_BASE}/admin/tickets/${id}/priority`,
  ADMIN_TICKET_REPLY: (id) => `${API_BASE}/admin/tickets/${id}/agent-reply`,
  ADMIN_TICKET_ASSIGN: (id) => `${API_BASE}/admin/tickets/${id}/assign`,
  ADMIN_TICKET_NOTES: (id) => `${API_BASE}/admin/tickets/${id}/notes`,

  // admin users
  ADMIN_USERS: `${API_BASE}/admin/users`,
  ADMIN_USER_ROLE: (id) => `${API_BASE}/admin/users/${id}/role`,
  ADMIN_DELETE_USER: (id) => `${API_BASE}/admin/users/${id}`,

  // admin export
  ADMIN_EXPORT_ALL: `${API_BASE}/admin/export/all`,

  // dashboard
  ADMIN_DASHBOARD: `${API_BASE}/admin/dashboard`,

  // KB
  KB_LIST: (companyId) => `${API_BASE}/kb/list/${companyId}`,
  KB_TEXT: `${API_BASE}/kb/upload-text`,
  KB_URL: `${API_BASE}/kb/upload-url`,
  KB_PDF: `${API_BASE}/kb/upload-pdf`,
  KB_EXPORT: (companyId) => `${API_BASE}/export/kb/${companyId}`,
  KB_DELETE: (chunkId) => `${API_BASE}/kb/delete/${chunkId}`,
  KB_CLEAR: (companyId) => `${API_BASE}/kb/clear/${companyId}`,
};

/*************************************************
 * ✅ Global state
 *************************************************/
let token = localStorage.getItem("token") || null;
let currentUser = null; // {id, username, role}
let companyId = "demo";
let ticketId = null;

let inboxSelectedTicketId = null;
let inboxTicketsCache = [];

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
 * ✅ Company titles / subtitles
 *************************************************/
function titleForCompany(c) {
  const map = {
    demo: { title: "AI Kundtjänst – Demo AB", sub: "Ställ en fråga så hjälper jag dig direkt." },
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
  ["openChatView", "openInboxView", "openAdminView", "openDashboardView"].forEach((id) => {
    const btn = $(id);
    if (btn) btn.classList.remove("active");
  });

  if (btnId === "chat") $("openChatView")?.classList.add("active");
  if (btnId === "inbox") $("openInboxView")?.classList.add("active");
  if (btnId === "admin") $("openAdminView")?.classList.add("active");
  if (btnId === "dashboard") $("openDashboardView")?.classList.add("active");
}

function openView(viewName) {
  show($("authView"), viewName === "auth");
  show($("chatView"), viewName === "chat");
  show($("inboxView"), viewName === "inbox");
  show($("adminView"), viewName === "admin");
  show($("dashboardView"), viewName === "dashboard");
}

/*************************************************
 * ✅ Auth UI
 *************************************************/
function applyAuthUI() {
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");

  const inboxBtn = $("openInboxView");
  const adminBtn = $("openAdminView");
  const dashBtn = $("openDashboardView");

  if (!token || !currentUser) {
    openView("auth");
    setText(roleBadge, "Inte inloggad");
    show(logoutBtn, false);

    show(inboxBtn, false);
    show(adminBtn, false);
    show(dashBtn, false);
    return;
  }

  openView("chat");
  setText(roleBadge, `${currentUser.username} • ${String(currentUser.role || "user").toUpperCase()}`);
  show(logoutBtn, true);

  const isAdmin = currentUser.role === "admin";
  const isAgent = currentUser.role === "agent";

  show(inboxBtn, isAdmin || isAgent);
  show(dashBtn, isAdmin);      // dashboard endast admin
  show(adminBtn, isAdmin);     // adminpanel endast admin
}

/*************************************************
 * ✅ Fetch current user
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
 * ✅ Chat rendering
 *************************************************/
function addMessage(role, content, meta = "") {
  const messagesDiv = $("messages");
  if (!messagesDiv) return;

  const safe = escapeHtml(content);
  const isUser = role === "user";

  const icon =
    role === "user" ? "fa-user" :
    role === "agent" ? "fa-user-tie" :
    "fa-robot";

  const wrapper = document.createElement("div");
  wrapper.className = `msg ${isUser ? "user" : "ai"}`;

  wrapper.innerHTML = `
    <div class="avatar"><i class="fa-solid ${icon}"></i></div>
    <div class="msgBody">
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
      setTimeout(() => (copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Kopiera`), 1000);
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
    <div class="msgBody">
      <div class="bubble">AI skriver…</div>
    </div>
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
 * ✅ New ticket (category reset)
 *************************************************/
async function startNewTicket() {
  ticketId = null;
  clearChat();
  addMessage("assistant", "Nytt ärende ✅ Vad kan jag hjälpa dig med?");
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

    // ✅ meta visas bara om RAG faktiskt användes
    const meta = data.ragUsed ? "Svar baserat på kunskapsdatabas" : "";
    addMessage("assistant", data.reply || "Inget svar.", meta);
  } catch (e) {
    hideTyping();
    console.error(e);
    addMessage("assistant", "Tekniskt fel. Försök igen.");
  }
}

/*************************************************
 * ✅ Category select
 *************************************************/
function setCompanyFromSelect(value) {
  companyId = value || "demo";
  applyCompanyToUI();

  // reset ticket so context becomes clean
  ticketId = null;
  clearChat();
  addMessage("assistant", `Du bytte kategori till "${companyId}". Vad vill du fråga?`);
}

/*************************************************
 * ✅ INBOX (Agent/Admin)
 *************************************************/
function ticketCard(t) {
  const overdue = t.slaDueAt && new Date(t.slaDueAt).getTime() < Date.now();
  const pri = t.priority || "normal";
  const status = t.status || "open";

  return `
    <div class="ticketTop">
      <div class="ticketTitle">${escapeHtml(t.title || "Inget ämne")}</div>
      <div class="ticketPills">
        <span class="pill ${status}">${escapeHtml(status)}</span>
        <span class="pill pri-${pri}">${escapeHtml(pri)}</span>
        ${overdue ? `<span class="pill danger">SLA</span>` : ""}
      </div>
    </div>
    <div class="ticketMeta">
      <div>${escapeHtml(t.username || "okänd")} • ${escapeHtml(t.companyId)}</div>
      <div class="muted">${escapeHtml(formatDate(t.lastActivityAt))}</div>
    </div>
  `;
}

function getInboxFilters() {
  const status = $("inboxStatusFilter")?.value || "";
  const cat = $("inboxCategoryFilter")?.value || "";
  const assigned = $("inboxAssignedFilter")?.value || "";
  const q = ($("inboxSearchInput")?.value || "").trim().toLowerCase();
  return { status, cat, assigned, q };
}

async function inboxLoadTickets() {
  const list = $("inboxTicketsList");
  const msg = $("inboxMsg");

  setAlert(msg, "");
  if (list) list.innerHTML = `<div class="muted small">Laddar…</div>`;

  const { status, cat, assigned, q } = getInboxFilters();
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (cat) params.set("companyId", cat);
  if (assigned) params.set("assigned", assigned);

  try {
    const res = await fetch(`${API.ADMIN_TICKETS}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      if (list) list.innerHTML = "";
      setAlert(msg, data?.error || "Kunde inte hämta inbox", true);
      return;
    }

    inboxTicketsCache = Array.isArray(data) ? data : [];

    let filtered = inboxTicketsCache;
    if (q) {
      filtered = filtered.filter((t) => {
        const a = String(t.title || "").toLowerCase();
        const b = String(t.companyId || "").toLowerCase();
        const c = String(t._id || "").toLowerCase();
        const d = String(t.username || "").toLowerCase();
        return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q);
      });
    }

    if (!filtered.length) {
      if (list) list.innerHTML = `<div class="muted small">Inga tickets hittades.</div>`;
      return;
    }

    if (list) list.innerHTML = "";

    filtered.forEach((t) => {
      const item = document.createElement("div");
      item.className = `ticketItem ${inboxSelectedTicketId === t._id ? "selected" : ""}`;
      item.innerHTML = ticketCard(t);

      item.addEventListener("click", async () => {
        inboxSelectedTicketId = t._id;
        await inboxLoadTicketDetails(t._id);
        await inboxLoadTickets();
      });

      list.appendChild(item);
    });
  } catch (e) {
    console.error("Inbox error:", e);
    if (list) list.innerHTML = "";
    setAlert(msg, "Serverfel vid inbox (kolla Console / Network)", true);
  }
}

async function inboxLoadTicketDetails(id) {
  const details = $("ticketDetails");
  const msgEl = $("inboxTicketMsg");

  setAlert(msgEl, "");
  if (!details) return;

  details.innerHTML = `<div class="muted small">Laddar ticket…</div>`;

  try {
    const res = await fetch(API.ADMIN_TICKET(id), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
      setAlert(msgEl, data?.error || "Kunde inte ladda ticket", true);
      return;
    }

    // fill control fields
    if ($("ticketPrioritySelect")) $("ticketPrioritySelect").value = data.priority || "normal";
    if ($("agentNotesText")) $("agentNotesText").value = data.agentNotes || "";

    const msgs = (data.messages || []).slice(-50);

    const msgHtml = msgs
      .map((m) => {
        const roleLabel = m.role === "user" ? "Kund" : m.role === "agent" ? "Agent" : "AI";
        return `
          <div class="ticketMsg ${m.role}">
            <div class="ticketMsgHead">
              <b>${roleLabel}</b>
              <span>${escapeHtml(formatDate(m.timestamp))}</span>
            </div>
            <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
          </div>
        `;
      })
      .join("");

    details.innerHTML = `
      <div class="ticketInfo">
        <div><b>ID:</b> ${escapeHtml(data._id)}</div>
        <div><b>Kund:</b> ${escapeHtml(data.customerUsername || "-")}</div>
        <div><b>Kategori:</b> ${escapeHtml(data.companyId)}</div>
        <div><b>Status:</b> ${escapeHtml(data.status)}</div>
        <div><b>Prioritet:</b> ${escapeHtml(data.priority)}</div>
        <div><b>Assigned:</b> ${escapeHtml(data.assignedUsername || "Ingen")}</div>
        <div><b>Senast:</b> ${escapeHtml(formatDate(data.lastActivityAt))}</div>
      </div>
      <div class="divider"></div>
      <div class="ticketMsgs">${msgHtml}</div>
    `;
  } catch (e) {
    details.innerHTML = `<div class="muted small">Serverfel vid ticket.</div>`;
    setAlert(msgEl, "Serverfel vid ticket", true);
  }
}

async function inboxSetStatus(status) {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) {
    setAlert(msgEl, "Välj en ticket först.", true);
    return;
  }

  try {
    const res = await fetch(API.ADMIN_TICKET_STATUS(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte uppdatera status", true);
      return;
    }

    setAlert(msgEl, "Status uppdaterad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid status", true);
  }
}

async function inboxSetPriority() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) {
    setAlert(msgEl, "Välj en ticket först.", true);
    return;
  }

  const priority = $("ticketPrioritySelect")?.value || "normal";

  try {
    const res = await fetch(API.ADMIN_TICKET_PRIORITY(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ priority }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte spara prioritet", true);
      return;
    }

    setAlert(msgEl, "Prioritet sparad ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid prioritet", true);
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
        Authorization: `Bearer ${token}`,
      },
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
  } catch {
    setAlert(msgEl, "Serverfel vid agent-svar", true);
  }
}

async function inboxSaveNotes() {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) {
    setAlert(msgEl, "Välj en ticket först.", true);
    return;
  }

  const notes = $("agentNotesText")?.value || "";

  try {
    const res = await fetch(API.ADMIN_TICKET_NOTES(inboxSelectedTicketId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ notes }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte spara notes", true);
      return;
    }

    setAlert(msgEl, "Notes sparade ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
    await inboxLoadTickets();
  } catch {
    setAlert(msgEl, "Serverfel vid notes", true);
  }
}

/*************************************************
 * ✅ DASHBOARD
 *************************************************/
async function dashboardLoad() {
  const msgEl = $("dashMsg");
  setAlert(msgEl, "");

  const cards = $("dashCards");
  const latest = $("dashLatest");
  const byCompany = $("dashByCompany");

  if (cards) cards.innerHTML = `<div class="muted small">Laddar dashboard…</div>`;
  if (latest) latest.innerHTML = "";
  if (byCompany) byCompany.innerHTML = "";

  try {
    const res = await fetch(API.ADMIN_DASHBOARD, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ladda dashboard", true);
      if (cards) cards.innerHTML = "";
      return;
    }

    const c = data.counts || {};
    if (cards) {
      cards.innerHTML = `
        <div class="kpiCard"><div class="kpiLabel">Users</div><div class="kpiValue">${c.users ?? "-"}</div></div>
        <div class="kpiCard"><div class="kpiLabel">Tickets</div><div class="kpiValue">${c.tickets ?? "-"}</div></div>
        <div class="kpiCard"><div class="kpiLabel">Open</div><div class="kpiValue">${c.open ?? "-"}</div></div>
        <div class="kpiCard"><div class="kpiLabel">Pending</div><div class="kpiValue">${c.pending ?? "-"}</div></div>
        <div class="kpiCard"><div class="kpiLabel">Solved</div><div class="kpiValue">${c.solved ?? "-"}</div></div>
        <div class="kpiCard"><div class="kpiLabel">KB chunks</div><div class="kpiValue">${c.kbChunks ?? "-"}</div></div>
        <div class="kpiCard danger"><div class="kpiLabel">SLA Overdue</div><div class="kpiValue">${c.slaOverdue ?? "-"}</div></div>
      `;
    }

    if (byCompany) {
      const rows = (data.byCompany || [])
        .map((x) => `<div class="rowItem"><b>${escapeHtml(x.companyId)}</b> <span class="muted">${x.count}</span></div>`)
        .join("");
      byCompany.innerHTML = rows || `<div class="muted small">Ingen data.</div>`;
    }

    if (latest) {
      const rows = (data.latestTickets || [])
        .map((t) => `
          <div class="listItem">
            <div class="listItemTitle">${escapeHtml(t.title || "Inget ämne")}</div>
            <div class="listItemMeta">${escapeHtml(t.username)} • ${escapeHtml(t.companyId)} • ${escapeHtml(t.status)} • ${escapeHtml(formatDate(t.lastActivityAt))}</div>
          </div>
        `)
        .join("");
      latest.innerHTML = rows || `<div class="muted small">Inga tickets.</div>`;
    }
  } catch (e) {
    console.error("Dashboard error:", e);
    setAlert(msgEl, "Serverfel vid dashboard", true);
    if (cards) cards.innerHTML = "";
  }
}

/*************************************************
 * ✅ KB Manager
 *************************************************/
function kbActiveCategory() {
  return $("kbCategorySelect")?.value || "demo";
}

function setKbMsg(msg, isErr = false) {
  setAlert($("kbMsg"), msg, isErr);
}

async function kbRefreshList() {
  const list = $("kbList");
  if (list) list.innerHTML = `<div class="muted small">Laddar KB…</div>`;
  setKbMsg("");

  const cat = kbActiveCategory();

  try {
    const res = await fetch(API.KB_LIST(cat), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      if (list) list.innerHTML = "";
      setKbMsg(data?.error || "Kunde inte ladda KB", true);
      return;
    }

    if (!data.length) {
      if (list) list.innerHTML = `<div class="muted small">Ingen kunskap uppladdad för denna kategori.</div>`;
      return;
    }

    if (list) list.innerHTML = "";

    data.slice(0, 50).forEach((item) => {
      const div = document.createElement("div");
      div.className = "kbItem";

      const preview = (item.content || "").slice(0, 180);

      div.innerHTML = `
        <div class="kbItemTop">
          <div>
            <div class="kbItemTitle">${escapeHtml(item.title || item.sourceRef || "KB")}</div>
            <div class="kbItemMeta">${escapeHtml(item.sourceType)} • ${escapeHtml(item.sourceRef || "")}</div>
          </div>
          <div class="kbItemActions">
            <span class="muted small">${item.embeddingOk ? "Vector ✅" : "Vector ❌"}</span>
            <button class="btn danger small" data-del="${item._id}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="kbPreview">${escapeHtml(preview)}...</div>
      `;

      div.querySelector("[data-del]")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = confirm("Ta bort denna KB-rad?");
        if (!ok) return;
        await kbDelete(item._id);
        await kbRefreshList();
      });

      list.appendChild(div);
    });
  } catch {
    if (list) list.innerHTML = "";
    setKbMsg("Serverfel vid KB-lista", true);
  }
}

async function kbDelete(chunkId) {
  try {
    const res = await fetch(API.KB_DELETE(chunkId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Kunde inte ta bort KB", true);
      return;
    }
    setKbMsg("Borttaget ✅");
  } catch {
    setKbMsg("Serverfel vid borttagning", true);
  }
}

async function kbClearCategory() {
  const cat = kbActiveCategory();
  const ok = confirm(`Rensa ALL kunskap för kategorin "${cat}"?`);
  if (!ok) return;

  setKbMsg("Rensar…");
  try {
    const res = await fetch(API.KB_CLEAR(cat), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setKbMsg(data?.error || "Kunde inte rensa", true);
      return;
    }
    setKbMsg(data.message || "Rensad ✅");
    await kbRefreshList();
  } catch {
    setKbMsg("Serverfel vid rensning", true);
  }
}

async function kbUploadText() {
  const cat = kbActiveCategory();
  const title = $("kbTextTitle")?.value?.trim() || "Text";
  const content = $("kbTextContent")?.value?.trim() || "";

  if (!content || content.length < 30) {
    setKbMsg("Skriv/klistra in mer text först (minst 30 tecken).", true);
    return;
  }

  setKbMsg("Laddar upp text…");

  try {
    const res = await fetch(API.KB_TEXT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
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
        Authorization: `Bearer ${token}`,
      },
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
        Authorization: `Bearer ${token}`,
      },
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
 * ✅ Admin: Users
 *************************************************/
async function adminLoadUsers() {
  const msgEl = $("adminUsersMsg");
  const list = $("adminUsersList");
  setAlert(msgEl, "");
  if (list) list.innerHTML = `<div class="muted small">Laddar…</div>`;

  try {
    const res = await fetch(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      if (list) list.innerHTML = "";
      setAlert(msgEl, data?.error || "Kunde inte hämta users", true);
      return;
    }

    if (!data.length) {
      if (list) list.innerHTML = `<div class="muted small">Inga users hittades.</div>`;
      return;
    }

    if (list) list.innerHTML = "";

    data.forEach((u) => {
      const div = document.createElement("div");
      div.className = "listItem";

      const isAdmin = u.role === "admin";
      const isAgent = u.role === "agent";
      const isSelf = String(u._id) === String(currentUser?.id);

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(u.username)}
          <span class="pill ${isAdmin ? "admin" : isAgent ? "agent" : ""}">${escapeHtml(u.role)}</span>
        </div>
        <div class="listItemMeta">ID: ${escapeHtml(u._id)}</div>

        <div class="row gap" style="margin-top:10px;">
          <select class="select small" data-role>
            <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
            <option value="agent" ${u.role === "agent" ? "selected" : ""}>agent</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
          </select>

          <button class="btn secondary small" data-action="saveRole">
            <i class="fa-solid fa-user-gear"></i> Spara roll
          </button>

          <button class="btn danger small" data-action="deleteUser">
            <i class="fa-solid fa-trash"></i> Ta bort
          </button>
        </div>

        ${isSelf ? `<div class="muted small" style="margin-top:8px;">Din användare är låst.</div>` : ""}
      `;

      // disable actions on self
      if (isSelf) {
        div.querySelector('[data-action="saveRole"]')?.setAttribute("disabled", "true");
        div.querySelector('[data-action="deleteUser"]')?.setAttribute("disabled", "true");
        div.querySelector('[data-role]')?.setAttribute("disabled", "true");
      }

      // block deleting admins
      if (isAdmin) {
        div.querySelector('[data-action="deleteUser"]')?.setAttribute("disabled", "true");
      }

      div.querySelector('[data-action="saveRole"]')?.addEventListener("click", async () => {
        if (isSelf) return;

        const role = div.querySelector("[data-role]")?.value || "user";
        await adminSetUserRole(u._id, role);
        await adminLoadUsers();
      });

      div.querySelector('[data-action="deleteUser"]')?.addEventListener("click", async () => {
        if (isSelf) return;

        const ok = confirm(`Vill du verkligen ta bort användaren "${u.username}"? Detta tar även bort deras tickets.`);
        if (!ok) return;

        await adminDeleteUser(u._id);
        await adminLoadUsers();
      });

      list.appendChild(div);
    });
  } catch (e) {
    console.error("adminLoadUsers error:", e);
    if (list) list.innerHTML = "";
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
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    });

    const data = await res.json();
    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte ändra roll", true);
      return;
    }

    setAlert(msgEl, `Roll uppdaterad ✅ (${data.user.username} → ${data.user.role})`);
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
      headers: { Authorization: `Bearer ${token}` },
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

  setAlert($("authMessage"), "");
  if (!username || !password) {
    setAlert($("authMessage"), "Fyll i både användarnamn och lösenord.", true);
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

  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Init
 *************************************************/
async function init() {
  // get company from URL
  const params = new URLSearchParams(window.location.search);
  const c = params.get("company");
  if (c) companyId = c;

  applyCompanyToUI();

  // if token exists, fetch user
  if (token) currentUser = await fetchMe();
  applyAuthUI();

  // basic events
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

  // menu view switches
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("chat");
    openView("chat");
  });

  $("openInboxView")?.addEventListener("click", async () => {
    setActiveMenu("inbox");
    openView("inbox");
    await inboxLoadTickets();
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("admin");
    openView("admin");
    await kbRefreshList();
    await adminLoadUsers();
  });

  $("openDashboardView")?.addEventListener("click", async () => {
    setActiveMenu("dashboard");
    openView("dashboard");
    await dashboardLoad();
  });

  // inbox controls
  $("inboxRefreshBtn")?.addEventListener("click", inboxLoadTickets);
  $("inboxStatusFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxCategoryFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxAssignedFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxSearchInput")?.addEventListener("input", inboxLoadTickets);

  $("setStatusOpen")?.addEventListener("click", () => inboxSetStatus("open"));
  $("setStatusPending")?.addEventListener("click", () => inboxSetStatus("pending"));
  $("setStatusSolved")?.addEventListener("click", () => inboxSetStatus("solved"));

  $("setPriorityBtn")?.addEventListener("click", inboxSetPriority);
  $("sendAgentReplyInboxBtn")?.addEventListener("click", inboxSendAgentReply);
  $("saveNotesBtn")?.addEventListener("click", inboxSaveNotes);

  // KB controls
  $("kbRefreshBtn")?.addEventListener("click", kbRefreshList);
  $("kbExportBtn")?.addEventListener("click", kbExport);
  $("kbClearBtn")?.addEventListener("click", kbClearCategory);
  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);
  $("kbCategorySelect")?.addEventListener("change", kbRefreshList);

  // admin users
  $("adminUsersRefreshBtn")?.addEventListener("click", adminLoadUsers);
  $("adminExportAllBtn")?.addEventListener("click", () => window.open(API.ADMIN_EXPORT_ALL, "_blank"));

  // if logged in show message
  if (token && currentUser) {
    clearChat();
    addMessage("assistant", "Välkommen tillbaka! Vad kan jag hjälpa dig med?");
  }
}

document.addEventListener("DOMContentLoaded", init);
