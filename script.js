/*************************************************
 * ✅ API base
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API = {
  ME: `${API_BASE}/me`,
  LOGIN: `${API_BASE}/login`,
  REGISTER: `${API_BASE}/register`,
  CHAT: `${API_BASE}/chat`,
  TICKETS: `${API_BASE}/tickets`,

  ADMIN_USERS: `${API_BASE}/admin/users`,
  ADMIN_USER_ROLE: (id) => `${API_BASE}/admin/users/${id}/role`,
  ADMIN_DELETE_USER: (id) => `${API_BASE}/admin/users/${id}`,

  ADMIN_TICKETS: `${API_BASE}/admin/tickets`,
  ADMIN_TICKET: (id) => `${API_BASE}/admin/tickets/${id}`,
  ADMIN_TICKET_STATUS: (id) => `${API_BASE}/admin/tickets/${id}/status`,
  ADMIN_TICKET_REPLY: (id) => `${API_BASE}/admin/tickets/${id}/agent-reply`,
  ADMIN_TICKET_PRIORITY: (id) => `${API_BASE}/admin/tickets/${id}/priority`,

  ADMIN_EXPORT_ALL: `${API_BASE}/admin/export/all`,
  ADMIN_EXPORT_TRAINING: `${API_BASE}/admin/export/training`,

  KB_LIST: (companyId) => `${API_BASE}/kb/list/${companyId}`,
  KB_TEXT: `${API_BASE}/kb/upload-text`,
  KB_URL: `${API_BASE}/kb/upload-url`,
  KB_PDF: `${API_BASE}/kb/upload-pdf`,
  KB_EXPORT: (companyId) => `${API_BASE}/export/kb/${companyId}`,
};

let token = localStorage.getItem("token") || null;
let currentUser = null; // {id, username, role}
let companyId = "demo";
let ticketId = null;
let lastRagUsed = null;

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
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "";
  }
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
 * ✅ View switch
 *************************************************/
function setActiveMenu(btnId) {
  ["openChatView", "openInboxView", "openAdminView"].forEach((id) => {
    const btn = $(id);
    if (btn) btn.classList.remove("active");
  });

  if (btnId === "chat") $("openChatView")?.classList.add("active");
  if (btnId === "inbox") $("openInboxView")?.classList.add("active");
  if (btnId === "admin") $("openAdminView")?.classList.add("active");
}

function openView(viewName) {
  show($("authView"), viewName === "auth");
  show($("chatView"), viewName === "chat");
  show($("inboxView"), viewName === "inbox");
  show($("adminView"), viewName === "admin");
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
 * ✅ Ticket utilities
 *************************************************/
async function startNewTicket() {
  ticketId = null;
  $("messages").innerHTML = "";
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

function clearChat() {
  if ($("messages")) $("messages").innerHTML = "";
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
 * ✅ Category select
 *************************************************/
function setCompanyFromSelect(value) {
  companyId = value || "demo";
  applyCompanyToUI();

  ticketId = null;
  clearChat();
  addMessage("assistant", `Du bytte kategori till "${companyId}". Vad vill du fråga?`);
  refreshDebug();
}

/*************************************************
 * ✅ Inbox (Admin) — FIXAD
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

    // ✅ robust parse
    const raw = await res.text();
    let data = [];
    try {
      data = raw ? JSON.parse(raw) : [];
    } catch {
      console.error("Inbox non-json:", raw);
      setAlert(msg, `Inbox fel: ej JSON (status ${res.status})`, true);
      return;
    }

    if (!res.ok) {
      setAlert(msg, `Inbox fel ${res.status}: ${data?.error || "Okänt fel"}`, true);
      return;
    }

    // ✅ filter on frontend
    let filtered = data;
    if (q) {
      filtered = data.filter((t) => {
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
      const status = String(t.status || "open").toLowerCase();
const priority = String(t.priority || "normal").toLowerCase();

div.innerHTML = `
  <div class="listItemTitle">
    <div>${escapeHtml(t.title || "Inget ämne")}</div>

    <div class="row" style="gap:6px; justify-content:flex-end;">
     <span class="pill ${status}">${escapeHtml(status)}</span>
<span class="pill">${escapeHtml(priority)}</span>
    </div>
  </div>

  <div class="listItemMeta">
    Kategori: ${escapeHtml(t.companyId || "-")} •
Senast: ${escapeHtml(formatDate(t.lastActivityAt || t.createdAt))}
  </div>
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

async function inboxLoadTicketDetails(ticketId) {
  const details = $("ticketDetails");
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");

  if (!details) return;
  details.innerHTML = `<div class="muted small">Laddar ticket...</div>`;

  try {
    const res = await fetch(API.ADMIN_TICKET(ticketId), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    if (!res.ok) {
      details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
      setAlert(msg, data?.error || "Kunde inte ladda ticket", true);
      return;
    }

    const msgs = data.messages || [];
    const html = msgs
      .slice(-50)
      .map((m) => {
        const roleLabel =
          m.role === "user" ? "Kund" : (m.role === "agent" ? "Agent" : "AI");
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
  } catch (e) {
    setAlert(msgEl, "Serverfel vid agent-svar", true);
  }
}

/*************************************************
 * ✅ Admin: KB Manager
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

    data.slice(0, 25).forEach((item) => {
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

function trainingExport() {
  const cat = kbActiveCategory();
  window.open(`${API.ADMIN_EXPORT_TRAINING}?companyId=${encodeURIComponent(cat)}`, "_blank");
}

function adminExportAll() {
  window.open(API.ADMIN_EXPORT_ALL, "_blank");
}

/*************************************************
 * ✅ ADMIN: Delete user
 *************************************************/
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
  } catch (err) {
    console.error("Delete user error:", err);
    setAlert(msgEl, "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Admin: Users list
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
        <div class="listItemMeta">ID: ${escapeHtml(u._id || "-")}</div>

        <div class="row" style="margin-top:10px;">
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
        const ok = confirm(`Vill du verkligen ta bort användaren "${u.username}"? Detta tar även bort deras tickets.`);
        if (!ok) return;

        await adminDeleteUser(u._id);
        await adminLoadUsers();
      });

      list.appendChild(div);
    });
  } catch (e) {
    console.error("Admin users error:", e);
    setAlert(msgEl, "Serverfel vid användarlista", true);
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

    setAlert(msgEl, `Roll uppdaterad: ${data.user.username} → ${data.user.role}`);
  } catch {
    setAlert(msgEl, "Serverfel vid roll-ändring", true);
  }
}

/*************************************************
 * ✅ Login / Register / Logout
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

    applyCompanyToUI();
    clearChat();
    addMessage("assistant", "Välkommen! Vad kan jag hjälpa dig med?");
  } catch (e) {
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
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      setAlert($("authMessage"), data?.error || "Registrering misslyckades", true);
      return;
    }

    setAlert($("authMessage"), "Registrering klar ✅ Logga in nu.");
  } catch (e) {
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
  const params = new URLSearchParams(window.location.search);
  const c = params.get("company");
  if (c) companyId = c;

  applyCompanyToUI();
  refreshDebug();

  if (token) {
    currentUser = await fetchMe();
  }

  applyAuthUI();

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

  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("chat");
    openView("chat");
  });

  $("openInboxView")?.addEventListener("click", async () => {
    if (!token) return alert("Du måste vara inloggad");
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

  $("inboxRefreshBtn")?.addEventListener("click", inboxLoadTickets);
  $("inboxStatusFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxCategoryFilter")?.addEventListener("change", inboxLoadTickets);
  $("inboxSearchInput")?.addEventListener("input", inboxLoadTickets);

  $("setStatusOpen")?.addEventListener("click", () => inboxSetStatus("open"));
  $("setStatusPending")?.addEventListener("click", () => inboxSetStatus("pending"));
  $("setStatusSolved")?.addEventListener("click", () => inboxSetStatus("solved"));

  $("sendAgentReplyInboxBtn")?.addEventListener("click", inboxSendAgentReply);
  $("setPriorityBtn")?.addEventListener("click", inboxSetPriority);

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
  $("adminExportAllBtn")?.addEventListener("click", adminExportAll);

  if (token && currentUser) {
    clearChat();
    addMessage("assistant", "Välkommen tillbaka! Vad kan jag hjälpa dig med?");
  }
}

/*************************************************
 * ✅ KB tabs helper (required by init)
 *************************************************/
function activateKbTab(tabId) {
  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));

  document.querySelectorAll(`.tabBtn[data-tab="${tabId}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = "";
}

document.addEventListener("DOMContentLoaded", init);
