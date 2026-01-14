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
  ADMIN_TICKETS: `${API_BASE}/admin/tickets`,
  ADMIN_EXPORT_ALL: `${API_BASE}/admin/export/all`,
  KB_LIST: `${API_BASE}/kb/list`,
  KB_TEXT: `${API_BASE}/kb/upload-text`,
  KB_URL: `${API_BASE}/kb/upload-url`,
  KB_PDF: `${API_BASE}/kb/upload-pdf`,
  KB_EXPORT: `${API_BASE}/export/kb`
};

let token = localStorage.getItem("token") || null;
let currentUser = null; // {id, username, role}
let companyId = "demo";
let ticketId = null;
let lastRagUsed = null;

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
  el.textContent = msg;
  el.style.display = msg ? "" : "none";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

  // sync dropdown
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
  const chatBtn = $("openChatView");
  const adminBtn = $("openAdminView");

  chatBtn?.classList.remove("active");
  adminBtn?.classList.remove("active");

  if (btnId === "chat") chatBtn?.classList.add("active");
  if (btnId === "admin") adminBtn?.classList.add("active");
}

function openView(viewName) {
  show($("authView"), viewName === "auth");
  show($("chatView"), viewName === "chat");
  show($("adminView"), viewName === "admin");
}

/*************************************************
 * ✅ Auth UI
 *************************************************/
function applyAuthUI() {
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");
  const adminBtn = $("openAdminView");

  if (!token || !currentUser) {
    openView("auth");
    setText(roleBadge, "Inte inloggad");
    show(logoutBtn, false);
    show(adminBtn, false);
  } else {
    openView("chat");
    setText(roleBadge, `${currentUser.username} • ${currentUser.role.toUpperCase()}`);
    show(logoutBtn, true);

    // Admin menu visible only if admin
    show(adminBtn, currentUser.role === "admin");
  }

  refreshDebug();
}

/*************************************************
 * ✅ Fetch current user (/me) to ensure admin works
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

  const me = await res.json();
  return me;
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

  // copy handler
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
    <div>
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

/*************************************************
 * ✅ Ticket utilities
 *************************************************/
async function startNewTicket() {
  // easiest: just clear ticketId so server creates new ticket
  ticketId = null;
  $("messages").innerHTML = "";
  addMessage("assistant", "Nytt ärende skapat ✅ Vad kan jag hjälpa dig med?");
  refreshDebug();
}

async function exportChat() {
  // export from UI only
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
  // We'll keep it simple: use last ~12 messages from UI.
  // Server saves full ticket messages anyway.
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

  // Keep last 12 to reduce token usage
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

  // Start fresh ticket for each category so it truly changes "context"
  ticketId = null;
  clearChat();
  addMessage("assistant", `Du bytte kategori till "${companyId}". Vad vill du fråga?`);
  refreshDebug();
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
      setAlert(msgEl, "Inga users hittades.");
      return;
    }

    data.forEach(u => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">${escapeHtml(u.username)} <span style="opacity:.7">(${escapeHtml(u.role)})</span></div>
        <div class="listItemMeta">ID: ${escapeHtml(u._id || u.id || "-")}</div>
      `;
      list.appendChild(div);
    });
  } catch (e) {
    setAlert(msgEl, "Serverfel vid users-lista", true);
  }
}

/*************************************************
 * ✅ Admin: Tickets
 *************************************************/
async function adminLoadTickets() {
  const msgEl = $("adminTicketsMsg");
  const list = $("adminTicketsList");
  setAlert(msgEl, "");
  if (list) list.innerHTML = "";

  try {
    const res = await fetch(API.ADMIN_TICKETS, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte hämta tickets", true);
      return;
    }

    if (!data.length) {
      setAlert(msgEl, "Inga tickets hittades.");
      return;
    }

    data.forEach(t => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.style.cursor = "pointer";
      div.innerHTML = `
        <div class="listItemTitle">${escapeHtml(t.title || "Ticket")}</div>
        <div class="listItemMeta">
          ID: ${escapeHtml(t._id)} • Kategori: ${escapeHtml(t.companyId)} • Status: ${escapeHtml(t.status)}
        </div>
      `;

      div.addEventListener("click", () => {
        $("agentTicketId").value = t._id;
      });

      list.appendChild(div);
    });
  } catch (e) {
    setAlert(msgEl, "Serverfel vid ticket-lista", true);
  }
}

async function sendAgentReply() {
  const tId = $("agentTicketId")?.value?.trim();
  const content = $("agentReplyText")?.value?.trim();
  const msgEl = $("agentMsg");

  setAlert(msgEl, "");

  if (!tId || !content) {
    setAlert(msgEl, "Ticket ID + text krävs.", true);
    return;
  }

  try {
    const res = await fetch(`${API.ADMIN_TICKETS}/${tId}/agent-reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });

    const data = await res.json();

    if (!res.ok) {
      setAlert(msgEl, data?.error || "Kunde inte skicka agent-svar", true);
      return;
    }

    setAlert(msgEl, "Agent-svar skickat ✅");
    $("agentReplyText").value = "";
    adminLoadTickets();
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
    const res = await fetch(`${API.KB_LIST}/${cat}`, {
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

    data.slice(0, 20).forEach(item => {
      const div = document.createElement("div");
      div.className = "kbItem";

      const preview = (item.content || "").slice(0, 140);

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

  if (!content || content.length < 20) {
    setKbMsg("Skriv/klistra in mer text först.", true);
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
  const url = `${API.KB_EXPORT}/${cat}`;
  window.open(url, "_blank");
}

function adminExportAll() {
  window.open(API.ADMIN_EXPORT_ALL, "_blank");
}

/*************************************************
 * ✅ Tabs (KB)
 *************************************************/
function activateKbTab(tabId) {
  document.querySelectorAll(".tabBtn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tabPanel").forEach(p => (p.style.display = "none"));

  document.querySelectorAll(`.tabBtn[data-tab="${tabId}"]`).forEach(b => b.classList.add("active"));
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = "";
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

    // ✅ fetch real role from DB
    currentUser = await fetchMe();
    applyAuthUI();

    // ensure chat is ready
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

  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Init
 *************************************************/
async function init() {
  // category from URL if you want: ?company=law
  const params = new URLSearchParams(window.location.search);
  const c = params.get("company");
  if (c) companyId = c;

  applyCompanyToUI();

  // debug icon
  refreshDebug();

  // If token exists, fetch /me
  if (token) {
    currentUser = await fetchMe();
  }

  applyAuthUI();

  // events
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

  $("categorySelect")?.addEventListener("change", (e) => {
    setCompanyFromSelect(e.target.value);
  });

  $("newTicketBtn")?.addEventListener("click", startNewTicket);

  $("exportChatBtn")?.addEventListener("click", exportChat);
  $("clearChatBtn")?.addEventListener("click", clearChat);

  $("toggleDebugBtn")?.addEventListener("click", () => {
    const p = $("debugPanel");
    if (!p) return;
    const isVisible = p.style.display !== "none";
    p.style.display = isVisible ? "none" : "";
  });

  // view switches
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("chat");
    openView("chat");
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("admin");
    openView("admin");

    // load initial admin data
    await kbRefreshList();
    await adminLoadUsers();
    await adminLoadTickets();
  });

  // KB tabs
  document.querySelectorAll(".tabBtn").forEach(btn => {
    btn.addEventListener("click", () => activateKbTab(btn.dataset.tab));
  });

  // KB actions
  $("kbRefreshBtn")?.addEventListener("click", kbRefreshList);
  $("kbExportBtn")?.addEventListener("click", kbExport);

  $("kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);

  $("kbCategorySelect")?.addEventListener("change", kbRefreshList);

  // admin actions
  $("adminUsersRefreshBtn")?.addEventListener("click", adminLoadUsers);
  $("adminTicketsRefreshBtn")?.addEventListener("click", adminLoadTickets);
  $("sendAgentReplyBtn")?.addEventListener("click", sendAgentReply);

  $("adminExportAllBtn")?.addEventListener("click", adminExportAll);

  // if logged in show welcome message
  if (token && currentUser) {
    clearChat();
    addMessage("assistant", "Välkommen tillbaka! Vad kan jag hjälpa dig med?");
  }
}

document.addEventListener("DOMContentLoaded", init);
