/*************************************************
 * ✅ API base + endpoints (FIX: fungerar även på 127.0.0.1)
 *************************************************/
const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "";

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
let currentUser = null;
let companyId = "demo";
let ticketId = null;
let lastRagUsed = null;

let inboxSelectedTicketId = null;
let mySelectedTicketId = null;

let pollInterval = null;
let lastAdminTicketSnapshot = {};
let lastMyTicketSnapshot = {};
let categoryNotifMap = {};

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
 * ✅ Safe fetchJson + bättre debug info
 *************************************************/
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const raw = await res.text();
    throw new Error(
      `API returnerade inte JSON.\nURL: ${url}\nStatus: ${res.status}\nSvar: ${raw.slice(0, 200)}`
    );
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || `Fel (${res.status})`);
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
 * ✅ Theme (persist)
 *************************************************/
function applySavedTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    document.body.setAttribute("data-theme", saved);
    const icon = $("themeToggle")?.querySelector("i");
    if (icon) icon.className = saved === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
  }
}

function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  body.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);

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

    show(chatBtn, false);
    show(myTicketsBtn, false);
    show(settingsBtn, false);
    show(inboxBtn, false);
    show(adminBtn, false);
  } else {
    setText(roleBadge, `${currentUser.username} • ${String(currentUser.role || "user").toUpperCase()}`);
    show(logoutBtn, true);

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
    return await fetchJson(API.ME, {
      headers: { Authorization: `Bearer ${token}` }
    });
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

    const inboxCat = $("inboxCategoryFilter");
    if (inboxCat) {
      inboxCat.innerHTML = `<option value="">Alla kategorier</option>`;
      cats.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.key;
        opt.textContent = c.key;
        inboxCat.appendChild(opt);
      });
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
 * ✅ Send message (FIX: auto-repair om ticket saknas)
 *************************************************/
async function sendMessage() {
  const input = $("messageInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  addMessage("user", text);
  input.value = "";
  showTyping();

  const attempt = async () => {
    const conversation = gatherConversationFromUI();
    conversation.push({ role: "user", content: text });

    return await fetchJson(API.CHAT, {
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
  };

  try {
    const data = await attempt();
    hideTyping();

    ticketId = data.ticketId || ticketId;
    lastRagUsed = !!data.ragUsed;
    refreshDebug();

    addMessage("assistant", data.reply || "Inget svar.", data.ragUsed ? "Svar baserat på kunskapsdatabas (RAG)" : "");
  } catch (e) {
    // ✅ Auto-fix: om ticket försvann på servern
    if (String(e.message || "").toLowerCase().includes("ticket hittades inte")) {
      console.warn("Ticket saknas på servern -> skapar ny ticket och försöker igen…");
      ticketId = null;

      try {
        const data2 = await attempt();
        hideTyping();

        ticketId = data2.ticketId || null;
        lastRagUsed = !!data2.ragUsed;
        refreshDebug();

        addMessage("assistant", data2.reply || "Inget svar.", data2.ragUsed ? "Svar baserat på kunskapsdatabas (RAG)" : "");
        return;
      } catch (e2) {
        hideTyping();
        addMessage("assistant", `Serverfel: ${e2.message || "Okänt fel"}`);
        console.error(e2);
        return;
      }
    }

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
 * ✅ Auth actions / init binds (minimal version)
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
  stopPolling();
  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Polling start/stop (behåller)
 *************************************************/
async function pollMyTickets() {}
async function pollAdminInbox() {}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      await pollMyTickets();
      await pollAdminInbox();
    } catch {}
  }, 8000);
}

function stopPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
}

/*************************************************
 * ✅ INIT (fixar att alla knappar binds)
 *************************************************/
async function init() {
  applySavedTheme();
  applyCompanyToUI();
  refreshDebug();

  if (token) currentUser = await fetchMe();
  applyAuthUI();
  await loadCategories();
  applyCompanyToUI();

  $("loginBtn")?.addEventListener("click", login);
  $("registerBtn")?.addEventListener("click", register);
  $("logoutBtn")?.addEventListener("click", logout);

  $("themeToggle")?.addEventListener("click", toggleTheme);

  $("toggleDebugBtn")?.addEventListener("click", () => {
    const p = $("debugPanel");
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
  });

  $("categorySelect")?.addEventListener("change", (e) => setCompanyFromSelect(e.target.value));

  $("sendBtn")?.addEventListener("click", sendMessage);
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  if (token && currentUser) startPolling();
}

document.addEventListener("DOMContentLoaded", init);
