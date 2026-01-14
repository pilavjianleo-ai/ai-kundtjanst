const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API_CHAT = `${API_BASE}/chat`;
const API_LOGIN = `${API_BASE}/login`;
const API_REGISTER = `${API_BASE}/register`;
const API_HISTORY = `${API_BASE}/history`;

const API_TICKETS = `${API_BASE}/tickets`;
const API_ADMIN_TICKETS = `${API_BASE}/admin/tickets`;

const API_KB_TEXT = `${API_BASE}/kb/upload-text`;
const API_KB_URL = `${API_BASE}/kb/upload-url`;
const API_KB_LIST = `${API_BASE}/kb/list`;
const API_KB_DELETE = `${API_BASE}/kb/item`;

const API_EXPORT_KB_CATEGORY = `${API_BASE}/export/kb`;
const API_EXPORT_ALL = `${API_BASE}/admin/export/all`;

function el(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCompanyIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("company") || "demo";
}

function setCompanyIdInURL(newCompanyId) {
  const url = new URL(window.location.href);
  url.searchParams.set("company", newCompanyId);
  history.pushState({}, "", url.toString());
}

let companyId = getCompanyIdFromURL();
let token = localStorage.getItem("token");
let userRole = localStorage.getItem("role") || null;

// ✅ Current selected ticket
let currentTicketId = null;

// ---------------- UI ----------------
function setLoggedInUI(isLoggedIn) {
  const auth = el("authScreen");
  const app = el("mainApp");
  if (auth) auth.style.display = isLoggedIn ? "none" : "grid";
  if (app) app.style.display = isLoggedIn ? "grid" : "none";
}

function updateTitle() {
  const titleEl = el("title");
  if (!titleEl) return;
  const map = {
    law: "AI Kundtjänst – Juridik",
    tech: "AI Kundtjänst – Teknisk support",
    cleaning: "AI Kundtjänst – Städservice",
    demo: "AI Kundtjänst – Demo AB",
  };
  titleEl.textContent = map[companyId] || map.demo;
}

function setSubtitle(text) {
  const s = el("subtitle");
  if (s) s.textContent = text || "";
}

function setView(view) {
  const chatView = el("chatView");
  const kbView = el("kbView");
  const ticketsView = el("ticketsView");

  const navChat = el("navChat");
  const navKb = el("navKb");
  const navTickets = el("navTickets");

  if (chatView) chatView.style.display = view === "chat" ? "flex" : "none";
  if (kbView) kbView.style.display = view === "kb" ? "flex" : "none";
  if (ticketsView) ticketsView.style.display = view === "tickets" ? "flex" : "none";

  if (navChat) navChat.classList.toggle("active", view === "chat");
  if (navKb) navKb.classList.toggle("active", view === "kb");
  if (navTickets) navTickets.classList.toggle("active", view === "tickets");
}

function setAdminNavVisible(isAdmin) {
  const navKb = el("navKb");
  const navTicketsAdmin = el("ticketsAdminBox");
  if (navKb) navKb.style.display = isAdmin ? "flex" : "none";
  if (navTicketsAdmin) navTicketsAdmin.style.display = isAdmin ? "block" : "none";
}

function showRagBadge(text, good) {
  const badge = el("ragBadge");
  if (!badge) return;
  if (!text) {
    badge.style.display = "none";
    badge.innerHTML = "";
    return;
  }
  badge.style.display = "flex";
  badge.innerHTML = `<span class="dot ${good ? "good" : "warn"}"></span><span>${escapeHtml(text)}</span>`;
}

function showTyping() {
  const messages = el("messages");
  if (!messages) return;

  const existing = document.getElementById("typing");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.className = "msg";
  wrap.id = "typing";
  wrap.innerHTML = `
    <div class="avatar"><i class="fas fa-robot"></i></div>
    <div class="bubble ai">AI skriver…</div>
  `;
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

function addUserMessage(text) {
  const messages = el("messages");
  if (!messages) return;
  messages.innerHTML += `
    <div class="msg user">
      <div class="avatar"><i class="fas fa-user"></i></div>
      <div class="bubble user">${escapeHtml(text)}</div>
    </div>`;
  messages.scrollTop = messages.scrollHeight;
}

function addAiMessage(text, sources = []) {
  const messages = el("messages");
  if (!messages) return;

  const safeCopy = String(text || "").replace(/'/g, "\\'");

  const sourcesHtml = sources?.length
    ? `<div class="sources">
         <div class="sourcesTitle">Källor:</div>
         ${sources.map(s => `<div class="sourceItem">• ${escapeHtml(s.title || s.sourceRef || "Källa")}</div>`).join("")}
       </div>`
    : "";

  messages.innerHTML += `
    <div class="msg">
      <div class="avatar"><i class="fas fa-robot"></i></div>
      <div>
        <div class="bubble ai">${escapeHtml(text)}</div>
        ${sourcesHtml}
        <div class="bubbleActions">
          <button class="miniBtn" onclick="copyToClipboard('${safeCopy}')"><i class="fas fa-copy"></i></button>
        </div>
      </div>
    </div>`;
  messages.scrollTop = messages.scrollHeight;
}

function addAgentMessage(text) {
  const messages = el("messages");
  if (!messages) return;

  messages.innerHTML += `
    <div class="msg">
      <div class="avatar"><i class="fas fa-headset"></i></div>
      <div>
        <div class="bubble ai"><b>Agent:</b> ${escapeHtml(text)}</div>
      </div>
    </div>`;
  messages.scrollTop = messages.scrollHeight;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    setSubtitle("✅ Kopierat!");
    setTimeout(() => setSubtitle(""), 1200);
  });
}

// ---------------- Tickets ----------------
function renderTicketItem(t, isAdminList = false) {
  const title = t.title || "(utan titel)";
  const status = t.status || "open";
  const prio = t.priority || "normal";
  const time = t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleString() : "";

  const who = isAdminList ? `<span class="mutedTiny">User: ${t.userId}</span>` : "";

  return `
    <button class="ticketItem" onclick="openTicket('${t._id}', ${isAdminList ? "true" : "false"})">
      <div class="ticketTop">
        <div class="ticketTitle">${escapeHtml(title)}</div>
        <div class="ticketBadges">
          <span class="pill ${status}">${escapeHtml(status)}</span>
          <span class="pill prio-${prio}">${escapeHtml(prio)}</span>
        </div>
      </div>
      <div class="ticketMeta">${escapeHtml(time)} ${who}</div>
    </button>
  `;
}

async function loadMyTickets() {
  if (!token) return;
  const box = el("ticketsMine");
  if (!box) return;

  box.innerHTML = `<div class="muted">Laddar…</div>`;

  const res = await fetch(API_TICKETS, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  if (!res.ok) {
    box.innerHTML = `<div class="muted">❌ ${escapeHtml(data.error || "kunde inte ladda")}</div>`;
    return;
  }

  if (!data.length) {
    box.innerHTML = `<div class="muted">Inga ärenden ännu. Starta chatten så skapas ett automatiskt.</div>`;
    return;
  }

  box.innerHTML = data.map(t => renderTicketItem(t, false)).join("");
}

async function loadAdminTickets() {
  if (!token || userRole !== "admin") return;

  const box = el("ticketsAdmin");
  if (!box) return;

  box.innerHTML = `<div class="muted">Laddar…</div>`;

  const res = await fetch(API_ADMIN_TICKETS, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  if (!res.ok) {
    box.innerHTML = `<div class="muted">❌ ${escapeHtml(data.error || "kunde inte ladda")}</div>`;
    return;
  }

  if (!data.length) {
    box.innerHTML = `<div class="muted">Inga ärenden hittades.</div>`;
    return;
  }

  box.innerHTML = data.map(t => renderTicketItem(t, true)).join("");
}

async function openTicket(ticketId, isAdminTicket) {
  currentTicketId = ticketId;
  setView("chat");
  el("messages").innerHTML = "";

  const endpoint = isAdminTicket ? `${API_ADMIN_TICKETS}/${ticketId}` : `${API_TICKETS}/${ticketId}`;
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  const t = await res.json();

  if (!res.ok) {
    addAiMessage(`Kunde inte öppna ticket: ${t.error || "okänt fel"}`);
    return;
  }

  companyId = t.companyId || companyId;
  const companySelect = el("companySelect");
  if (companySelect) companySelect.value = companyId;
  updateTitle();

  setSubtitle(`Ärende: ${t.title || t._id} • Status: ${t.status}`);
  setTimeout(() => setSubtitle(""), 2500);

  for (const m of t.messages || []) {
    if (m.role === "user") addUserMessage(m.content);
    else if (m.role === "assistant") addAiMessage(m.content);
    else if (m.role === "agent") addAgentMessage(m.content);
  }

  // Admin agent panel
  const agentPanel = el("agentPanel");
  if (agentPanel) agentPanel.style.display = userRole === "admin" ? "block" : "none";
}

async function refreshTicketLists() {
  await loadMyTickets();
  if (userRole === "admin") await loadAdminTickets();
}

// ---------------- Chat ----------------
async function loadHistoryFallback() {
  if (!token) return;
  const messages = el("messages");
  if (messages) messages.innerHTML = "";

  const res = await fetch(`${API_HISTORY}/${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const data = await res.json();
  for (const m of data) {
    if (m.role === "user") addUserMessage(m.content);
    if (m.role === "assistant") addAiMessage(m.content);
    if (m.role === "agent") addAgentMessage(m.content);
  }
}

async function sendMessage() {
  if (!token) return;

  const input = el("messageInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  addUserMessage(text);
  showTyping();
  showRagBadge("", false);

  try {
    // if no ticket selected, we still use server ticket auto-ensure
    // but we can keep local context minimal
    const conversation = [{ role: "user", content: text }];

    const res = await fetch(API_CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        companyId,
        conversation,
        ticketId: currentTicketId, // ✅ binds to ticket if selected
      }),
    });

    const data = await res.json();
    removeTyping();

    if (!res.ok) {
      addAiMessage(`Serverfel: ${data.error || "okänt fel"}`);
      return;
    }

    if (data.ticketId) currentTicketId = data.ticketId;

    addAiMessage(data.reply || "Inget svar.", data.sources || []);

    if (data.ragUsed === true) showRagBadge("RAG användes ✅ (kunskapsdatabas)", true);
    else showRagBadge("", false);

    await refreshTicketLists();
  } catch (err) {
    console.error(err);
    removeTyping();
    addAiMessage("Tekniskt fel. Försök igen.");
  }
}

// ---------------- Admin Agent takeover ----------------
async function agentReply() {
  if (!token || userRole !== "admin") return;
  if (!currentTicketId) {
    setSubtitle("⚠️ Öppna ett ärende först");
    setTimeout(() => setSubtitle(""), 1500);
    return;
  }

  const input = el("agentInput");
  const text = input?.value?.trim();
  if (!text) return;

  input.value = "";

  const res = await fetch(`${API_ADMIN_TICKETS}/${currentTicketId}/agent-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content: text }),
  });

  const data = await res.json();
  if (!res.ok) {
    addAiMessage(`Agent-fel: ${data.error || "okänt fel"}`);
    return;
  }

  addAgentMessage(text);
  await refreshTicketLists();
}

// ---------------- KB (Admin) ----------------
function updateKbTitle() {
  const t = el("kbTitle");
  if (t) t.textContent = `Kunskapsdatabas (${companyId})`;
}

async function loadKbList() {
  if (!token || userRole !== "admin") return;

  const list = el("kbList");
  const msg = el("kbMsg");

  if (list) list.innerHTML = `<div class="muted">Laddar…</div>`;
  if (msg) msg.textContent = "";

  const res = await fetch(`${API_KB_LIST}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (!res.ok) {
    if (list) list.innerHTML = `<div class="muted">❌ ${escapeHtml(data.error || "fel")}</div>`;
    return;
  }

  if (!data.length) {
    if (list) list.innerHTML = `<div class="muted">Inga källor i denna kategori ännu.</div>`;
    return;
  }

  if (list) list.innerHTML = "";

  for (const it of data) {
    list.innerHTML += `
      <div class="kbItem">
        <div class="kbItemTop">
          <div>
            <div class="kbItemTitle">${escapeHtml(it.title || "Untitled")}</div>
            <div class="kbMeta">Typ: ${escapeHtml(it.sourceType)} • ${it.embeddingOk ? "✅ RAG-ready" : "⚠️ Begränsad"}</div>
          </div>
          <button class="btn danger small" onclick="deleteKbItem('${it._id}')">Ta bort</button>
        </div>
      </div>
    `;
  }

  if (msg) msg.textContent = `✅ ${data.length} källor laddade`;
}

async function deleteKbItem(id) {
  if (!token || userRole !== "admin") return;

  await fetch(`${API_KB_DELETE}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  await loadKbList();
}

async function uploadKbUrl() {
  if (!token || userRole !== "admin") return;

  const input = el("kbUrlInput");
  const msg = el("kbMsg");
  const url = input?.value?.trim();
  if (!url) return;

  if (msg) msg.textContent = "⏳ Sparar URL…";

  const res = await fetch(API_KB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, url }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (msg) msg.textContent = `❌ ${data.error || "Fel vid URL-upload"}`;
    return;
  }

  if (msg) msg.textContent = `✅ ${data.message}`;
  if (input) input.value = "";
  await loadKbList();
}

async function uploadKbText() {
  if (!token || userRole !== "admin") return;

  const input = el("kbTextInput");
  const msg = el("kbMsg");
  const content = input?.value?.trim();
  if (!content) return;

  if (msg) msg.textContent = "⏳ Laddar upp text…";

  const res = await fetch(API_KB_TEXT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, title: "Text", content }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (msg) msg.textContent = `❌ ${data.error || "Fel vid text-upload"}`;
    return;
  }

  if (msg) msg.textContent = `✅ ${data.message}`;
  if (input) input.value = "";
  await loadKbList();
}

function exportCategoryKB() {
  if (!token || userRole !== "admin") return;
  window.location.href = `${API_EXPORT_KB_CATEGORY}/${companyId}`;
}

function exportAllAdmin() {
  if (!token || userRole !== "admin") return;
  if (!confirm("Vill du exportera ALLT?")) return;
  window.location.href = API_EXPORT_ALL;
}

// ---------------- Misc ----------------
function clearChat() {
  const messages = el("messages");
  if (messages) messages.innerHTML = "";
  showRagBadge("", false);
  setSubtitle("🗑️ Rensad (endast UI)");
  setTimeout(() => setSubtitle(""), 1200);
}

function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute("data-theme") || "dark";
  body.setAttribute("data-theme", current === "dark" ? "light" : "dark");
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  token = null;
  userRole = null;
  currentTicketId = null;
  setLoggedInUI(false);
}

/*************************************************
 * ✅ AUTH
 *************************************************/
async function handleLogin() {
  const username = el("username")?.value;
  const password = el("password")?.value;
  const msg = el("authMessage");

  const res = await fetch(API_LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (msg) msg.textContent = data.error || "Fel vid login.";
    return;
  }

  localStorage.setItem("token", data.token);
  token = data.token;

  userRole = data.user?.role || "user";
  localStorage.setItem("role", userRole);

  setLoggedInUI(true);
  setView("tickets");
  updateTitle();

  setAdminNavVisible(userRole === "admin");

  await refreshTicketLists();

  setSubtitle("✅ Inloggad");
  setTimeout(() => setSubtitle(""), 1200);
}

async function handleRegister() {
  const username = el("username")?.value;
  const password = el("password")?.value;
  const msg = el("authMessage");

  const res = await fetch(API_REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (msg) msg.textContent = data.error || "Registrering misslyckades.";
    return;
  }

  if (msg) msg.textContent = "✅ Registrering lyckades! Logga in nu.";
}

/*************************************************
 * ✅ INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  companyId = getCompanyIdFromURL();
  updateTitle();

  setLoggedInUI(!!token);
  setAdminNavVisible(userRole === "admin");

  // UI binds
  el("loginBtn")?.addEventListener("click", handleLogin);
  el("registerBtn")?.addEventListener("click", handleRegister);

  el("sendBtn")?.addEventListener("click", sendMessage);
  el("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  el("clearChat")?.addEventListener("click", clearChat);
  el("exportChat")?.addEventListener("click", () => {
    // Export current ticket view not implemented in this version
    exportChatSimple();
  });

  el("themeToggle")?.addEventListener("click", toggleTheme);
  el("logoutBtn")?.addEventListener("click", logout);

  // Category change
  el("companySelect")?.addEventListener("change", async (e) => {
    companyId = e.target.value;
    setCompanyIdInURL(companyId);
    updateTitle();
    updateKbTitle();
    currentTicketId = null;
    await refreshTicketLists();
    setSubtitle(`✅ Bytte kategori: ${companyId}`);
    setTimeout(() => setSubtitle(""), 1000);
  });

  // Nav
  el("navChat")?.addEventListener("click", async () => {
    setView("chat");
    if (!currentTicketId) await loadHistoryFallback();
  });

  el("navTickets")?.addEventListener("click", async () => {
    setView("tickets");
    await refreshTicketLists();
  });

  el("navKb")?.addEventListener("click", async () => {
    setView("kb");
    updateKbTitle();
    await loadKbList();
  });

  // Tickets refresh
  el("ticketsReloadBtn")?.addEventListener("click", refreshTicketLists);

  // Agent takeover
  el("agentSendBtn")?.addEventListener("click", agentReply);

  // KB
  el("kbReloadBtn")?.addEventListener("click", loadKbList);
  el("kbUploadUrlBtn")?.addEventListener("click", uploadKbUrl);
  el("kbUploadTextBtn")?.addEventListener("click", uploadKbText);
  el("kbExportCategoryBtn")?.addEventListener("click", exportCategoryKB);
  el("kbExportAllBtn")?.addEventListener("click", exportAllAdmin);

  // Already logged in
  if (token) {
    setLoggedInUI(true);
    setView("tickets");
    await refreshTicketLists();
  }
});

function exportChatSimple() {
  const messages = el("messages");
  if (!messages) return;

  const text = messages.innerText || "";
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `chat_${companyId}_${new Date().toISOString().split("T")[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
