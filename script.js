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
  ADMIN_TICKET_NOTE_DELETE: (ticketId, noteId) =>
    `${API_BASE}/admin/tickets/${ticketId}/internal-note/${noteId}`,
  ADMIN_TICKET_NOTES_CLEAR: (ticketId) =>
    `${API_BASE}/admin/tickets/${ticketId}/internal-notes`,

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

/*************************************************
 * ✅ Global state
 *************************************************/
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
 * ✅ Internal notes renderer (ONE UI ONLY)
 *************************************************/
function renderInternalNotes(notes = []) {
  if (!notes || notes.length === 0) {
    return `<div class="muted small">Inga notes ännu.</div>`;
  }

  return `
    <div class="noteList">
      ${notes
        .slice(-30)
        .map(
          (n) => `
          <div class="noteItem">
            <div class="noteMeta">${escapeHtml(formatDate(n.createdAt))}</div>
            <div class="noteText">${escapeHtml(n.content)}</div>

            <button class="btn danger small" data-note-id="${escapeHtml(n._id)}" style="margin-top:8px;">
              <i class="fa-solid fa-trash"></i> Ta bort
            </button>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

/*************************************************
 * ✅ Safe fetchJson
 *************************************************/
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const raw = await res.text();
    throw new Error(
      `API returnerade INTE JSON (fick HTML/text).\nURL: ${url}\nStatus: ${res.status}\n${raw.slice(0, 180)}`
    );
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Fel (${res.status})`);

  return data;
}

/*************************************************
 * ✅ Safe event binding
 *************************************************/
function onClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", (e) => {
    try {
      fn(e);
    } catch (err) {
      console.error(`Click handler crashed: #${id}`, err);
    }
  });
}

function onChange(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("change", (e) => {
    try {
      fn(e);
    } catch (err) {
      console.error(`Change handler crashed: #${id}`, err);
    }
  });
}

function onInput(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", (e) => {
    try {
      fn(e);
    } catch (err) {
      console.error(`Input handler crashed: #${id}`, err);
    }
  });
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

function toggleDebugPanel() {
  const panel = $("debugPanel");
  if (!panel) return;

  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "";
  refreshDebug();
}

/*************************************************
 * ✅ Admin Export buttons
 *************************************************/
function adminExportAll() {
  window.open(API.ADMIN_EXPORT_ALL, "_blank");
}

function adminExportTraining() {
  window.open(API.ADMIN_EXPORT_TRAINING, "_blank");
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
    cleaning: { title: "AI Kundtjänst – Städservice", sub: "Frågor om städ, tjänster, rutiner." },
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
  const saved = localStorage.getItem("theme") || "dark";
  document.body.setAttribute("data-theme", saved);

  const icon = $("themeToggle")?.querySelector("i");
  if (icon) icon.className = saved === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
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
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.warn("fetchMe failed:", e?.message || e);
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

    if (!cats.some((c) => c.key === companyId)) companyId = cats[0]?.key || "demo";
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

    const kbCat = $("kbCategorySelect");
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
 * ✅ Admin Tabs
 *************************************************/
function initAdminTabs() {
  const tabBtns = document.querySelectorAll(".tabBtn");
  const panels = ["tabUsers", "tabKB", "tabCats"];

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const tab = btn.getAttribute("data-tab");
      panels.forEach((p) => show($(p), p === tab));

      if (tab === "tabUsers") await adminLoadUsers();
      if (tab === "tabKB") await kbLoadList();
      if (tab === "tabCats") await catsLoadList();
    });
  });
}

/*************************************************
 * ✅ Knowledge Base (KB)
 *************************************************/
async function kbLoadList() {
  const msg = $("kbMsg");
  const list = $("kbList");
  setAlert(msg, "");
  if (list) list.innerHTML = `<div class="muted small">Laddar...</div>`;

  const kbCompany = $("kbCategorySelect")?.value || companyId;

  try {
    const items = await fetchJson(API.KB_LIST(kbCompany), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!items.length) {
      if (list) list.innerHTML = `<div class="muted small">Inget KB-innehåll ännu.</div>`;
      return;
    }

    list.innerHTML = items
      .slice()
      .reverse()
      .map((it) => {
        return `
        <div class="listItem">
          <div class="listItemTitle">${escapeHtml(it.title || it.type || "KB")}</div>
          <div class="muted small">
            ${escapeHtml(it.type || "text")} • ${escapeHtml(formatDate(it.createdAt || it.updatedAt))}
          </div>
        </div>
      `;
      })
      .join("");
  } catch (e) {
    console.error(e);
    setAlert(msg, e.message || "Kunde inte ladda KB", true);
    if (list) list.innerHTML = "";
  }
}

async function kbUploadText() {
  const msg = $("kbMsg");
  setAlert(msg, "");

  const kbCompany = $("kbCategorySelect")?.value || companyId;
  const title = $("kbTextTitle")?.value?.trim();
  const content = $("kbTextContent")?.value?.trim();

  if (!title || !content) return setAlert(msg, "Fyll i titel + text", true);

  try {
    const data = await fetchJson(API.KB_TEXT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: kbCompany, title, content }),
    });

    setAlert(msg, data.message || "Text uppladdad ✅");
    if ($("kbTextTitle")) $("kbTextTitle").value = "";
    if ($("kbTextContent")) $("kbTextContent").value = "";

    await kbLoadList();
  } catch (e) {
    setAlert(msg, e.message || "Fel vid upload text", true);
  }
}

async function kbUploadUrl() {
  const msg = $("kbMsg");
  setAlert(msg, "");

  const kbCompany = $("kbCategorySelect")?.value || companyId;
  const url = $("kbUrlInput")?.value?.trim();

  if (!url) return setAlert(msg, "Skriv en URL", true);

  try {
    const data = await fetchJson(API.KB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: kbCompany, url }),
    });

    setAlert(msg, data.message || "URL uppladdad ✅");
    if ($("kbUrlInput")) $("kbUrlInput").value = "";

    await kbLoadList();
  } catch (e) {
    setAlert(msg, e.message || "Fel vid upload URL", true);
  }
}

async function kbUploadPdf() {
  const msg = $("kbMsg");
  setAlert(msg, "");

  const kbCompany = $("kbCategorySelect")?.value || companyId;
  const file = $("kbPdfFile")?.files?.[0];

  if (!file) return setAlert(msg, "Välj en PDF-fil först", true);

  const form = new FormData();
  form.append("companyId", kbCompany);
  form.append("file", file);

  try {
    const res = await fetch(API.KB_PDF, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const contentType = res.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Fel (${res.status})`);

    setAlert(msg, data?.message || "PDF uppladdad ✅");
    if ($("kbPdfFile")) $("kbPdfFile").value = "";

    await kbLoadList();
  } catch (e) {
    setAlert(msg, e.message || "Fel vid upload PDF", true);
  }
}

function kbExport() {
  const kbCompany = $("kbCategorySelect")?.value || companyId;
  window.open(API.KB_EXPORT(kbCompany), "_blank");
}

/*************************************************
 * ✅ Categories Admin
 *************************************************/
async function catsLoadList() {
  const msg = $("catsMsg");
  const list = $("catsList");
  setAlert(msg, "");
  if (list) list.innerHTML = `<div class="muted small">Laddar...</div>`;

  try {
    const cats = await fetchJson(API.CATEGORIES);

    if (!cats.length) {
      if (list) list.innerHTML = `<div class="muted small">Inga kategorier.</div>`;
      return;
    }

    list.innerHTML = cats
      .map((c) => {
        return `
        <div class="listItem">
          <div class="listItemTitle">${escapeHtml(c.key)} — ${escapeHtml(c.name)}</div>
          <div class="muted small">${escapeHtml((c.prompt || "").slice(0, 120))}${(c.prompt || "").length > 120 ? "..." : ""}</div>
        </div>
      `;
      })
      .join("");
  } catch (e) {
    console.error(e);
    setAlert(msg, e.message || "Kunde inte ladda kategorier", true);
    if (list) list.innerHTML = "";
  }
}

async function catsCreateCategory() {
  const msg = $("catsMsg");
  setAlert(msg, "");

  const key = $("newCatKey")?.value?.trim();
  const name = $("newCatName")?.value?.trim();
  const prompt = $("newCatPrompt")?.value?.trim();

  if (!key || !name || !prompt) return setAlert(msg, "Fyll i key + namn + prompt", true);

  try {
    const data = await fetchJson(API.ADMIN_CATEGORIES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, name, prompt }),
    });

    setAlert(msg, data.message || "Kategori skapad ✅");

    if ($("newCatKey")) $("newCatKey").value = "";
    if ($("newCatName")) $("newCatName").value = "";
    if ($("newCatPrompt")) $("newCatPrompt").value = "";

    await loadCategories();
    await catsLoadList();
  } catch (e) {
    setAlert(msg, e.message || "Fel vid skapa kategori", true);
  }
}

/*************************************************
 * ✅ Chat rendering + sending
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
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        companyId,
        conversation,
        ticketId,
      }),
    });

    hideTyping();

    ticketId = data.ticketId || ticketId;
    lastRagUsed = !!data.ragUsed;
    refreshDebug();

    addMessage("assistant", data.reply || "Inget svar.", data.ragUsed ? "Svar baserat på kunskapsdatabas (RAG)" : "");
  } catch (e) {
    hideTyping();

    const msg = String(e?.message || "");
    if (msg.includes("Ticket hittades inte")) {
      ticketId = null;
      refreshDebug();
      addMessage("assistant", "Ticket kunde inte hittas. Jag skapade ett nytt ✅\nSkicka igen.");
      return;
    }

    addMessage("assistant", `Serverfel: ${e.message || "Okänt fel"}`);
    console.error(e);
  }
}

/*************************************************
 * ✅ Category select
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
 * ✅ Feedback
 *************************************************/
async function sendFeedback(type) {
  try {
    const data = await fetchJson(API.FEEDBACK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type, companyId }),
    });

    setText($("fbMsg"), data.message || "Feedback skickad ✅");
    setTimeout(() => setText($("fbMsg"), ""), 1400);
  } catch (e) {
    setText($("fbMsg"), e.message || "Fel vid feedback");
    setTimeout(() => setText($("fbMsg"), ""), 1600);
  }
}

/*************************************************
 * ✅ My Tickets
 *************************************************/
async function loadMyTickets() {
  const list = $("myTicketsList");
  const details = $("myTicketDetails");
  if (list) list.innerHTML = "";
  if (details) details.innerHTML = `<div class="muted small">Välj ett ärende.</div>`;

  try {
    const tickets = await fetchJson(API.MY_TICKETS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    setText($("myTicketsHint"), `${tickets.length} st`);

    if (!tickets.length) {
      if (list) list.innerHTML = `<div class="muted small">Du har inga ärenden ännu.</div>`;
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
      headers: { Authorization: `Bearer ${token}` },
    });

    const msgs = (t.messages || []).slice(-80);
    const html = msgs
      .map((m) => {
        const label = m.role === "user" ? "Du" : m.role === "agent" ? "Agent" : "AI";
        return `
        <div class="ticketMsg ${escapeHtml(m.role)}">
          <div class="ticketMsgHead">
            <b>${label}</b>
            <span>${escapeHtml(formatDate(m.timestamp))}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content)}</div>
        </div>
      `;
      })
      .join("");

    details.innerHTML = `
      <div class="muted small">
        <b>ID:</b> ${escapeHtml(t._id)} • <b>Status:</b> ${escapeHtml(t.status)} • <b>Kategori:</b> ${escapeHtml(t.companyId)}
      </div>
      <div class="divider"></div>
      ${html || `<div class="muted small">Inga meddelanden.</div>`}
    `;
  } catch {
    details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
  }
}

/*************************************************
 * ✅ Polling
 *************************************************/
async function pollMyTickets() {
  if (!token || !currentUser) return;

  try {
    const tickets = await fetchJson(API.MY_TICKETS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    tickets.forEach((t) => {
      const prev = lastMyTicketSnapshot[t._id];
      const nowTs = new Date(t.lastActivityAt).getTime();

      if (prev && nowTs > prev) {
        const sub = $("chatSubtitle");
        if (sub) {
          sub.textContent = "📩 Ny uppdatering i ett ärende (agent/AI svar).";
          setTimeout(() => applyCompanyToUI(), 2500);
        }
      }
      lastMyTicketSnapshot[t._id] = nowTs;
    });

    if ($("myTicketsView")?.style.display !== "none") {
      await loadMyTickets();
      if (mySelectedTicketId) await loadMyTicketDetails(mySelectedTicketId);
    }
  } catch {}
}

async function pollAdminInbox() {
  if (!token || !currentUser) return;
  const isAdminOrAgent = ["admin", "agent"].includes(currentUser.role);
  if (!isAdminOrAgent) return;

  try {
    const tickets = await fetchJson(API.ADMIN_TICKETS, {
      headers: { Authorization: `Bearer ${token}` },
    });

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

    const inboxBtn = $("openInboxView");
    const dot = $("inboxNotifDot");

    if (hasNew) {
      inboxBtn?.classList.add("hasNotif");
      if (dot) dot.style.display = "";
    }

    const catSelect = $("categorySelect");
    if (catSelect) {
      catSelect.classList.remove("categoryNotif");
      if (categoryNotifMap[catSelect.value]) {
        catSelect.classList.add("categoryNotif");
      }
    }
  } catch {}
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
 * ✅ Bulk actions
 *************************************************/
async function solveAllTickets() {
  const ok = confirm("Vill du markera ALLA open/pending som SOLVED?");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKETS_SOLVE_ALL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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
      headers: { Authorization: `Bearer ${token}` },
    });
    alert(data.message || "Alla solved borttagna ✅");
    await inboxLoadTickets();
  } catch (e) {
    alert(e.message || "Fel vid Remove solved");
  }
}

/*************************************************
 * ✅ Admin users
 *************************************************/
async function adminLoadUsers() {
  const msgEl = $("adminUsersMsg");
  const list = $("adminUsersList");
  setAlert(msgEl, "");
  if (list) list.innerHTML = "";

  try {
    const users = await fetchJson(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const assignSel = $("assignUserSelect");
    if (assignSel) {
      assignSel.innerHTML = `<option value="">Välj agent...</option>`;
      users
        .filter((u) => ["admin", "agent"].includes(u.role))
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
      body: JSON.stringify({ role }),
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
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert(msgEl, data.message || "User borttagen ✅");
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Inbox list + details
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
    const data = await fetchJson(`${API.ADMIN_TICKETS}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const filtered = !q
      ? data
      : data.filter((t) => {
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
      div.className = `listItem ${inboxSelectedTicketId === t._id ? "selected" : ""}`;
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(t.title || "Ticket")}
          <span class="pill">${escapeHtml(t.status)}</span>
        </div>
        <div class="muted small">${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.lastActivityAt))}</div>
      `;

      // ✅ ONLY ONE CLICK LISTENER
      div.addEventListener("click", async () => {
        inboxSelectedTicketId = t._id;
        await inboxLoadTicketDetails(t._id);
        await inboxLoadTickets();
      });

      list.appendChild(div);
    });
  } catch (e) {
    console.error("Inbox error:", e);
    setAlert(msg, "Serverfel vid inbox", true);
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
      headers: { Authorization: `Bearer ${token}` },
    });

    // ✅ Render notes in lower internal notes box
const notesTarget = $("notesList");
if (notesTarget) {
  notesTarget.innerHTML = renderInternalNotes(t.internalNotes || []);
} else {
  console.warn("❌ notesList saknas i HTML");
}

    if ($("ticketPrioritySelect")) $("ticketPrioritySelect").value = t.priority || "normal";

    const msgs = (t.messages || []).slice(-80);
    const html = msgs
      .map((m) => {
        const roleLabel = m.role === "user" ? "Kund" : m.role === "agent" ? "Agent" : "AI";
        return `
        <div class="ticketMsg ${escapeHtml(m.role)}">
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
      <div class="muted small">
        <b>ID:</b> ${escapeHtml(t._id)} • <b>Kategori:</b> ${escapeHtml(t.companyId)}
        • <b>Status:</b> ${escapeHtml(t.status)} • <b>Prioritet:</b> ${escapeHtml(t.priority)}
      </div>

      <div class="divider"></div>
      ${html || `<div class="muted small">Inga meddelanden.</div>`}
    `;

    // ✅ Render notes ONLY in the lower box
    const notesTarget = $("notesList");
    if (notesTarget) {
      notesTarget.innerHTML = renderInternalNotes(t.internalNotes || []);
    }
  } catch (e) {
    details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
    setAlert(msg, e.message || "Fel vid ticket", true);
  }
}

/*************************************************
 * ✅ Inbox Ticket actions
 *************************************************/
async function inboxSetStatus(status) {
  const msg = $("inboxTicketMsg");
  setAlert(msg, "");

  if (!inboxSelectedTicketId) return setAlert(msg, "Välj en ticket först.", true);

  try {
    await fetchJson(API.ADMIN_TICKET_STATUS(inboxSelectedTicketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
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
      body: JSON.stringify({ priority }),
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
      body: JSON.stringify({ content }),
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
      body: JSON.stringify({ content }),
    });

    $("internalNoteText").value = "";
    setAlert(msgEl, "Intern note sparad ✅");

    // ✅ Reload ticket details to show note instantly
    await inboxLoadTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid note", true);
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
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert(msgEl, "Alla notes borttagna ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    setAlert(msgEl, e.message || "Fel vid rensning", true);
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
      body: JSON.stringify({ userId }),
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
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert(msgEl, "Ticket borttagen ✅");
    inboxSelectedTicketId = null;

    if ($("ticketDetails")) {
      $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
    }

    // Clear notes list UI too
    if ($("notesList")) $("notesList").innerHTML = `<div class="muted small">Inga notes ännu.</div>`;

    await inboxLoadTickets();
  } catch (e) {
    setAlert(msgEl, e.message || "Serverfel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Delete ONE internal note
 *************************************************/
async function deleteOneInternalNote(noteId) {
  const msgEl = $("inboxTicketMsg");
  setAlert(msgEl, "");

  if (!inboxSelectedTicketId) {
    return setAlert(msgEl, "Välj en ticket först.", true);
  }

  const ok = confirm("Vill du ta bort denna notering?");
  if (!ok) return;

  try {
    await fetchJson(API.ADMIN_TICKET_NOTE_DELETE(inboxSelectedTicketId, noteId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert(msgEl, "Notering borttagen ✅");
    await inboxLoadTicketDetails(inboxSelectedTicketId);
  } catch (e) {
    setAlert(msgEl, e.message || "Fel vid borttagning", true);
  }
}

/*************************************************
 * ✅ Inbox Ticket actions (event delegation) - FIXED
 *************************************************/
function bindInboxTicketActions() {
  const inboxView = $("inboxView");
  if (!inboxView) return;

  if (inboxView.dataset.bound === "1") return;
  inboxView.dataset.bound = "1";

  inboxView.addEventListener("click", async (e) => {
    // ✅ Delete one note
    const noteBtn = e.target.closest("[data-note-id]");
    if (noteBtn) {
      const noteId = noteBtn.getAttribute("data-note-id");
      if (!noteId) return;
      await deleteOneInternalNote(noteId);
      return;
    }

    // Other button actions
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.id;

    if (id === "setStatusOpen") return inboxSetStatus("open");
    if (id === "setStatusPending") return inboxSetStatus("pending");
    if (id === "setStatusSolved") return inboxSetStatus("solved");

    if (id === "setPriorityBtn") return inboxSetPriority();
    if (id === "sendAgentReplyInboxBtn") return inboxSendAgentReply();

    // ✅ ONLY keep lower internal notes
    if (id === "saveInternalNoteBtn") return inboxSaveInternalNote();
    if (id === "clearInternalNotesBtn") return clearAllInternalNotes();

    if (id === "assignTicketBtn") return inboxAssignTicket();
    if (id === "deleteTicketBtn") return inboxDeleteTicket();
  });
}

/*************************************************
 * ✅ Settings
 *************************************************/
async function changeUsername() {
  setAlert($("settingsMsg"), "");
  const newUsername = $("newUsernameInput")?.value?.trim();
  if (!newUsername) return setAlert($("settingsMsg"), "Skriv nytt användarnamn", true);

  try {
    const data = await fetchJson(API.AUTH_CHANGE_USERNAME, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newUsername }),
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
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setAlert($("settingsMsg"), data.message || "Lösenord uppdaterat ✅");
    if ($("currentPassInput")) $("currentPassInput").value = "";
    if ($("newPassInput")) $("newPassInput").value = "";
  } catch (e) {
    setAlert($("settingsMsg"), e.message || "Fel vid lösenord", true);
  }
}

/*************************************************
 * ✅ Forgot/Reset
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
      body: JSON.stringify({ email }),
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
      body: JSON.stringify({ resetToken, newPassword }),
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
      body: JSON.stringify({ username, password }),
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
      body: JSON.stringify({ username, password, email }),
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
 * ✅ Init
 *************************************************/
async function init() {
  try {
    applySavedTheme();

    const params = new URLSearchParams(window.location.search);
    const c = params.get("company");
    if (c) companyId = c;

    applyCompanyToUI();
    refreshDebug();

    const resetToken = getResetTokenFromUrl();
    if (resetToken) {
      show($("authView"), true);
      show($("resetCard"), true);
      show($("forgotCard"), false);
    }

    if (token) currentUser = await fetchMe();
    applyAuthUI();

    await loadCategories();
    applyCompanyToUI();

    // Tabs
    initAdminTabs();

    // Debug
    onClick("toggleDebugBtn", toggleDebugPanel);

    // Admin export
    onClick("adminExportAllBtn", adminExportAll);
    onClick("trainingExportBtn", adminExportTraining);

    // Auth
    onClick("loginBtn", login);
    onClick("registerBtn", register);
    onClick("logoutBtn", logout);

    onClick("togglePassBtn", () => togglePass("password"));
    onClick("toggleResetPassBtn", () => togglePass("resetNewPass"));

    onClick("openForgotBtn", () => show($("forgotCard"), true));
    onClick("closeForgotBtn", () => {
      show($("forgotCard"), false);
      setAlert($("forgotMsg"), "");
    });

    onClick("sendForgotBtn", sendForgotEmail);
    onClick("resetSaveBtn", saveResetPassword);

    // Theme
    onClick("themeToggle", toggleTheme);

    // ✅ Bind inbox ticket action delegation (notes save/delete etc)
    bindInboxTicketActions();

    // Menu
    onClick("openChatView", () => {
      setActiveMenu("chat");
      openView("chat");
    });

    onClick("openMyTicketsView", async () => {
      setActiveMenu("myTickets");
      openView("myTickets");
      await loadMyTickets();
    });

    onClick("openInboxView", async () => {
      $("openInboxView")?.classList.remove("hasNotif");
      if ($("inboxNotifDot")) $("inboxNotifDot").style.display = "none";

      setActiveMenu("inbox");
      openView("inbox");
      await inboxLoadTickets();
      await adminLoadUsers();
    });

    onClick("openAdminView", async () => {
      setActiveMenu("admin");
      openView("admin");
      await adminLoadUsers();
    });

    onClick("openSettingsView", () => {
      setActiveMenu("settings");
      openView("settings");
    });

    // Category select
    onChange("categorySelect", (e) => setCompanyFromSelect(e.target.value));

    // Chat
    onClick("sendBtn", sendMessage);
    const msgInput = $("messageInput");
    if (msgInput) {
      msgInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    onClick("newTicketBtn", startNewTicket);
    onClick("clearChatBtn", clearChat);
    onClick("exportChatBtn", exportChat);

    // Feedback
    onClick("fbUp", () => sendFeedback("positive"));
    onClick("fbDown", () => sendFeedback("negative"));

    // Inbox top actions
    onClick("inboxRefreshBtn", inboxLoadTickets);
    onClick("solveAllBtn", solveAllTickets);
    onClick("removeSolvedBtn", removeAllSolvedTickets);

    onChange("inboxStatusFilter", inboxLoadTickets);
    onChange("inboxCategoryFilter", inboxLoadTickets);
    onInput("inboxSearchInput", inboxLoadTickets);

    // Settings
    onClick("changeUsernameBtn", changeUsername);
    onClick("changePasswordBtn", changePassword);

    // KB actions
    onClick("kbRefreshBtn", kbLoadList);
    onClick("kbUploadTextBtn", kbUploadText);
    onClick("kbUploadUrlBtn", kbUploadUrl);
    onClick("kbUploadPdfBtn", kbUploadPdf);
    onClick("kbExportBtn", kbExport);
    onChange("kbCategorySelect", kbLoadList);

    // Cats actions
    onClick("catsRefreshBtn", catsLoadList);
    onClick("createCatBtn", catsCreateCategory);

    if (token && currentUser) startPolling();
  } catch (err) {
    console.error("init crashed:", err);
    alert("script.js kraschade vid start. Kolla Console.");
  }
}

document.addEventListener("DOMContentLoaded", init);
