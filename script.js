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

  // ✅ NY: svara från "Mina ärenden"
  MY_TICKET_REPLY: (id) => `${API_BASE}/my/tickets/${id}/reply`,

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
  ADMIN_CATEGORY_DELETE: (key) => `${API_BASE}/admin/categories/${key}`,

  // ✅ SLA (Admin full, Agent own)
  ADMIN_SLA_OVERVIEW: `${API_BASE}/admin/sla/overview`,
  ADMIN_SLA_TICKETS: `${API_BASE}/admin/sla/tickets`,
  ADMIN_SLA_AGENTS: `${API_BASE}/admin/sla/agents`,

  // ✅ NY: trend vecka-för-vecka
  ADMIN_SLA_TREND: `${API_BASE}/admin/sla/trend`,

  // ✅ NY: export SLA CSV
  ADMIN_SLA_EXPORT_CSV: `${API_BASE}/admin/sla/export.csv`,

  // ✅ NY: clear SLA stats (mine / all)
  ADMIN_SLA_CLEAR_MY: `${API_BASE}/admin/sla/clear/my`,
  ADMIN_SLA_CLEAR_ALL: `${API_BASE}/admin/sla/clear/all`,

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

// ✅ SLA client cache
let slaCachedTickets = [];
let slaCachedTrend = null;

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
  show($("slaView"), viewName === "sla");
  show($("adminView"), viewName === "admin");
  show($("settingsView"), viewName === "settings");
}

function setActiveMenu(btnId) {
  const map = {
    chat: $("openChatView"),
    myTickets: $("openMyTicketsView"),
    inbox: $("openInboxView"),
    sla: $("openSlaView"),
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
  const slaBtn = $("openSlaView");

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
    show(slaBtn, false);
  } else {
    setText(roleBadge, `${currentUser.username} • ${String(currentUser.role || "user").toUpperCase()}`);
    show(logoutBtn, true);

    show(chatBtn, true);
    show(myTicketsBtn, true);
    show(settingsBtn, true);

    const isAdmin = currentUser.role === "admin";
    const isAgent = currentUser.role === "agent";

    show(inboxBtn, isAdmin || isAgent);
    show(slaBtn, isAdmin || isAgent);
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
  const panels = ["tabUsers", "tabKB", "tabCats"]; // ✅ SLA tab borttagen

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

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const base64 = String(reader.result || "").split(",")[1] || "";
      const data = await fetchJson(API.KB_PDF, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companyId: kbCompany, filename: file.name, base64 }),
      });

      setAlert(msg, data?.message || "PDF uppladdad ✅");
      if ($("kbPdfFile")) $("kbPdfFile").value = "";

      await kbLoadList();
    } catch (e) {
      setAlert(msg, e.message || "Fel vid upload PDF", true);
    }
  };
  reader.readAsDataURL(file);
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
            <div class="listItemTitle">
              ${escapeHtml(c.key)} — ${escapeHtml(c.name)}
              <button class="btn danger small" data-del-cat="${escapeHtml(c.key)}" style="margin-left:auto;">
                <i class="fa-solid fa-trash"></i> Ta bort
              </button>
            </div>

            <div class="muted small">
              ${escapeHtml((c.systemPrompt || "").slice(0, 120))}
              ${(c.systemPrompt || "").length > 120 ? "..." : ""}
            </div>
          </div>
        `;
      })
      .join("");

    // ✅ bind delete buttons
    list.querySelectorAll("[data-del-cat]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-del-cat");
        if (!key) return;
        await catsDeleteCategory(key);
      });
    });
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
  const systemPrompt = $("newCatPrompt")?.value?.trim();

  if (!key || !name || !systemPrompt) return setAlert(msg, "Fyll i key + namn + prompt", true);

  try {
    const data = await fetchJson(API.ADMIN_CATEGORIES, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key, name, systemPrompt }),
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

async function catsDeleteCategory(key) {
  const msg = $("catsMsg");
  setAlert(msg, "");

  if (!key) return setAlert(msg, "Kategori-key saknas", true);

  const ok = confirm(`Vill du verkligen ta bort kategorin "${key}"? Detta går inte att ångra.`);
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_CATEGORY_DELETE(key), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert(msg, data.message || "Kategori borttagen ✅");

    await loadCategories();
    await catsLoadList();
  } catch (e) {
    setAlert(msg, e.message || "Fel vid borttagning", true);
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
 * ✅ NYTT: Kunden kan fortsätta chatten från "Mina ärenden"
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

    // ✅ NYTT: svara vidare på ticket från "Mina ärenden"
    details.innerHTML = `
      <div class="muted small">
        <b>ID:</b> ${escapeHtml(t._id)} • <b>Status:</b> ${escapeHtml(t.status)} • <b>Kategori:</b> ${escapeHtml(t.companyId)}
      </div>
      <div class="divider"></div>
      ${html || `<div class="muted small">Inga meddelanden.</div>`}

      <div class="divider"></div>

      <label>Fortsätt konversationen</label>
      <textarea id="myTicketReplyText" class="input textarea" placeholder="Skriv ett meddelande..."></textarea>
      <button id="sendMyTicketReplyBtn" class="btn primary full" type="button">
        <i class="fa-solid fa-paper-plane"></i> Skicka
      </button>

      <div id="myTicketReplyMsg" class="alert" style="display:none;"></div>
    `;

    // ✅ bind button
    const btn = $("sendMyTicketReplyBtn");
    if (btn) {
      btn.onclick = async () => {
        await myTicketsSendReply(id);
      };
    }
  } catch {
    details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
  }
}

async function myTicketsSendReply(ticketId) {
  const msgEl = $("myTicketReplyMsg");
  setAlert(msgEl, "");

  const content = $("myTicketReplyText")?.value?.trim();
  if (!content) return setAlert(msgEl, "Skriv något först.", true);

  try {
    const data = await fetchJson(API.MY_TICKET_REPLY(ticketId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    });

    $("myTicketReplyText").value = "";
    setAlert(msgEl, data.message || "Skickat ✅");
    await loadMyTicketDetails(ticketId);
    await loadMyTickets();
  } catch (e) {
    setAlert(msgEl, e.message || "Fel vid skick", true);
  }
}
/*************************************************
 * ✅ INBOX (Agent/Admin)
 *************************************************/
async function inboxLoadTickets() {
  const msg = $("inboxMsg");
  const list = $("inboxTicketsList");
  setAlert(msg, "");
  if (list) list.innerHTML = `<div class="muted small">Laddar...</div>`;

  try {
    const data = await fetchJson(API.ADMIN_TICKETS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tickets = data.tickets || data || [];
    slaCachedTickets = tickets; // ✅ cache for SLA too

    const statusFilter = $("inboxStatusFilter")?.value || "";
    const catFilter = $("inboxCategoryFilter")?.value || "";
    const search = ($("inboxSearchInput")?.value || "").toLowerCase();

    let filtered = tickets.slice();

    if (statusFilter) filtered = filtered.filter((t) => t.status === statusFilter);
    if (catFilter) filtered = filtered.filter((t) => t.companyId === catFilter);

    if (search) {
      filtered = filtered.filter((t) => {
        const hay = `${t._id} ${t.title || ""} ${t.companyId || ""}`.toLowerCase();
        return hay.includes(search);
      });
    }

    if (!filtered.length) {
      if (list) list.innerHTML = `<div class="muted small">Inga tickets.</div>`;
      return;
    }

    list.innerHTML = filtered
      .slice()
      .sort((a, b) => new Date(b.lastActivityAt || b.createdAt) - new Date(a.lastActivityAt || a.createdAt))
      .map((t) => {
        const isSelected = t._id === inboxSelectedTicketId;
        const assigned = t.assignedTo ? ` • Assign: ${escapeHtml(t.assignedTo.username || t.assignedTo)}` : "";
        const prio = t.priority || "normal";

        return `
          <div class="listItem ${isSelected ? "active" : ""}" data-ticket-id="${escapeHtml(t._id)}">
            <div class="listItemTitle">
              ${escapeHtml(t.title || "Ticket")}
              <span class="pill">${escapeHtml(t.status)}</span>
              <span class="pill ${prio === "high" ? "danger" : prio === "low" ? "muted" : ""}">
                ${escapeHtml(prio)}
              </span>
            </div>
            <div class="muted small">
              ${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.lastActivityAt || t.createdAt))}${assigned}
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll("[data-ticket-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        inboxSelectedTicketId = row.getAttribute("data-ticket-id");
        await inboxLoadTicketDetails(inboxSelectedTicketId);
        await inboxLoadTickets();
      });
    });

    updateInboxNotifDot(tickets);
  } catch (e) {
    console.error(e);
    setAlert(msg, e.message || "Kunde inte ladda inbox", true);
    if (list) list.innerHTML = "";
  }
}

async function inboxLoadTicketDetails(id) {
  const msg = $("inboxTicketMsg");
  const details = $("ticketDetails");
  setAlert(msg, "");

  if (!details) return;
  details.innerHTML = `<div class="muted small">Laddar...</div>`;

  try {
    const t = await fetchJson(API.ADMIN_TICKET(id), {
      headers: { Authorization: `Bearer ${token}` },
    });

    // ✅ fill assign dropdown
    await inboxLoadAssignableUsers(t);

    const msgs = (t.messages || []).slice(-120);

    details.innerHTML = `
      <div class="muted small">
        <b>ID:</b> ${escapeHtml(t._id)} • <b>Status:</b> ${escapeHtml(t.status)} • <b>Kategori:</b> ${escapeHtml(t.companyId)}
      </div>
      <div class="muted small">
        <b>Skapad:</b> ${escapeHtml(formatDate(t.createdAt))} • <b>Senast:</b> ${escapeHtml(formatDate(t.lastActivityAt))}
      </div>
      <div class="muted small">
        <b>Prioritet:</b> ${escapeHtml(t.priority || "normal")}
        ${t.assignedTo ? ` • <b>Assigned:</b> ${escapeHtml(t.assignedTo.username || t.assignedTo)}` : ""}
      </div>

      <div class="divider"></div>

      ${(t.internalNotes || []).length
        ? `<div><b>Internal Notes</b></div>
           <div id="internalNotesList">${renderInternalNotes(t.internalNotes)}</div>
           <div class="divider"></div>`
        : `<div class="muted small">Inga internal notes.</div>
           <div id="internalNotesList"></div>
           <div class="divider"></div>`
      }

      <div><b>Meddelanden</b></div>

      <div class="ticketMsgs">
        ${msgs
          .map((m) => {
            const label = m.role === "user" ? "Kund" : m.role === "agent" ? "Agent" : "AI";
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
          .join("")}
      </div>
    `;

    // ✅ Bind delete note buttons
    const notesWrap = $("internalNotesList");
    if (notesWrap) {
      notesWrap.querySelectorAll("[data-note-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const noteId = btn.getAttribute("data-note-id");
          if (!noteId) return;

          const ok = confirm("Ta bort denna note?");
          if (!ok) return;

          await inboxDeleteInternalNote(t._id, noteId);
        });
      });
    }
  } catch (e) {
    console.error(e);
    details.innerHTML = `<div class="muted small">Kunde inte ladda ticket.</div>`;
    setAlert(msg, e.message || "Fel", true);
  }
}

async function inboxLoadAssignableUsers(ticket) {
  const select = $("assignUserSelect");
  if (!select) return;

  select.innerHTML = `<option value="">Välj agent...</option>`;

  try {
    const users = await fetchJson(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const agents = (users.users || users || []).filter((u) => u.role === "agent" || u.role === "admin");

    agents.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u._id;
      opt.textContent = `${u.username} (${u.role})`;
      if (ticket?.assignedTo?._id === u._id) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (e) {
    console.warn("assign load users fail:", e);
  }
}

async function inboxAssignTicket() {
  const id = inboxSelectedTicketId;
  if (!id) return alert("Välj en ticket först.");

  const userId = $("assignUserSelect")?.value || "";
  if (!userId) return alert("Välj en agent.");

  try {
    const data = await fetchJson(API.ADMIN_TICKET_ASSIGN(id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    });

    setAlert($("inboxTicketMsg"), data.message || "Assigned ✅");
    await inboxLoadTicketDetails(id);
    await inboxLoadTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid assign", true);
  }
}

async function inboxSetStatus(status) {
  const id = inboxSelectedTicketId;
  if (!id) return;

  try {
    await fetchJson(API.ADMIN_TICKET_STATUS(id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });

    await inboxLoadTicketDetails(id);
    await inboxLoadTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid status", true);
  }
}

async function inboxSetPriority() {
  const id = inboxSelectedTicketId;
  if (!id) return;

  const priority = $("ticketPrioritySelect")?.value || "normal";

  try {
    const data = await fetchJson(API.ADMIN_TICKET_PRIORITY(id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ priority }),
    });

    setAlert($("inboxTicketMsg"), data.message || "Prioritet sparad ✅");
    await inboxLoadTicketDetails(id);
    await inboxLoadTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid prioritet", true);
  }
}

async function inboxSendAgentReply() {
  const id = inboxSelectedTicketId;
  if (!id) return;

  const text = $("agentReplyTextInbox")?.value?.trim();
  if (!text) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKET_REPLY(id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: text }),
    });

    $("agentReplyTextInbox").value = "";
    setAlert($("inboxTicketMsg"), data.message || "Svar skickat ✅");
    await inboxLoadTicketDetails(id);
    await inboxLoadTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid svar", true);
  }
}

async function inboxSaveInternalNote() {
  const id = inboxSelectedTicketId;
  if (!id) return;

  const text = $("internalNoteText")?.value?.trim();
  if (!text) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKET_NOTE(id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: text }),
    });

    $("internalNoteText").value = "";
    setAlert($("inboxTicketMsg"), data.message || "Note sparad ✅");
    await inboxLoadTicketDetails(id);
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid note", true);
  }
}

async function inboxDeleteInternalNote(ticketId, noteId) {
  try {
    const data = await fetchJson(API.ADMIN_TICKET_NOTE_DELETE(ticketId, noteId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert($("inboxTicketMsg"), data.message || "Note borttagen ✅");
    await inboxLoadTicketDetails(ticketId);
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid borttagning", true);
  }
}

async function inboxClearInternalNotes() {
  const id = inboxSelectedTicketId;
  if (!id) return;

  const ok = confirm("Ta bort ALLA internal notes för ticket?");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKET_NOTES_CLEAR(id), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert($("inboxTicketMsg"), data.message || "Alla notes raderade ✅");
    await inboxLoadTicketDetails(id);
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid clear", true);
  }
}

async function inboxDeleteTicket() {
  const id = inboxSelectedTicketId;
  if (!id) return;

  const ok = confirm("Ta bort denna ticket permanent?");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKET_DELETE(id), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert($("inboxTicketMsg"), data.message || "Ticket borttagen ✅");
    inboxSelectedTicketId = null;
    $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
    await inboxLoadTickets();
  } catch (e) {
    setAlert($("inboxTicketMsg"), e.message || "Fel vid delete", true);
  }
}

async function inboxSolveAll() {
  try {
    const data = await fetchJson(API.ADMIN_TICKETS_SOLVE_ALL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert($("inboxMsg"), data.message || "Alla lösta ✅");
    await inboxLoadTickets();
  } catch (e) {
    setAlert($("inboxMsg"), e.message || "Fel", true);
  }
}

async function inboxRemoveSolved() {
  const ok = confirm("Ta bort ALLA solved tickets?");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_TICKETS_REMOVE_SOLVED, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert($("inboxMsg"), data.message || "Solved tickets borttagna ✅");
    await inboxLoadTickets();
  } catch (e) {
    setAlert($("inboxMsg"), e.message || "Fel", true);
  }
}

/*************************************************
 * ✅ Inbox notif dot
 *************************************************/
function updateInboxNotifDot(allTickets = []) {
  const dot = $("inboxNotifDot");
  if (!dot) return;

  const openCount = allTickets.filter((t) => t.status === "open").length;
  dot.style.display = openCount > 0 ? "" : "none";
}

/*************************************************
 * ✅ ADMIN USERS
 *************************************************/
async function adminLoadUsers() {
  const msg = $("adminUsersMsg");
  const list = $("adminUsersList");
  setAlert(msg, "");
  if (list) list.innerHTML = `<div class="muted small">Laddar...</div>`;

  try {
    const data = await fetchJson(API.ADMIN_USERS, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const users = data.users || data || [];

    list.innerHTML = users
      .map((u) => {
        const isMe = u._id === currentUser?._id;

        return `
          <div class="listItem">
            <div class="listItemTitle">
              ${escapeHtml(u.username)} (${escapeHtml(u.role)})
              ${isMe ? `<span class="pill">DU</span>` : ""}
            </div>
            <div class="muted small">${escapeHtml(u.email || "-")}</div>
            <div class="row gap" style="margin-top:8px;">
              <select class="input smallInput" data-role-user="${escapeHtml(u._id)}" ${isMe ? "disabled" : ""}>
                <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
                <option value="agent" ${u.role === "agent" ? "selected" : ""}>agent</option>
                <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
              </select>

              <button class="btn danger small" data-del-user="${escapeHtml(u._id)}" ${isMe ? "disabled" : ""}>
                <i class="fa-solid fa-trash"></i> Ta bort
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll("[data-role-user]").forEach((sel) => {
      sel.addEventListener("change", async () => {
        const id = sel.getAttribute("data-role-user");
        const role = sel.value;
        await adminSetUserRole(id, role);
      });
    });

    list.querySelectorAll("[data-del-user]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del-user");
        await adminDeleteUser(id);
      });
    });
  } catch (e) {
    console.error(e);
    setAlert(msg, e.message || "Kunde inte ladda users", true);
    if (list) list.innerHTML = "";
  }
}

async function adminSetUserRole(id, role) {
  try {
    const data = await fetchJson(API.ADMIN_USER_ROLE(id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    });

    setAlert($("adminUsersMsg"), data.message || "Roll uppdaterad ✅");
    await adminLoadUsers();
  } catch (e) {
    setAlert($("adminUsersMsg"), e.message || "Fel", true);
  }
}

async function adminDeleteUser(id) {
  const ok = confirm("Ta bort user permanent?");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_DELETE_USER(id), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    setAlert($("adminUsersMsg"), data.message || "User borttagen ✅");
    await adminLoadUsers();
  } catch (e) {
    setAlert($("adminUsersMsg"), e.message || "Fel", true);
  }
}

/*************************************************
 * ✅ SLA Helpers (median, avg, breached etc)
 *************************************************/
function minutesBetween(a, b) {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Math.max(0, (tb - ta) / 60000);
}

function median(arr) {
  const nums = (arr || []).slice().sort((x, y) => x - y);
  if (!nums.length) return 0;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function avg(arr) {
  const nums = arr || [];
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

function formatMinutes(min) {
  if (!isFinite(min)) return "-";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function filterTicketsByDays(tickets, days) {
  const from = new Date(daysAgoIso(days)).getTime();
  return (tickets || []).filter((t) => new Date(t.createdAt).getTime() >= from);
}

/*************************************************
 * ✅ SLA: fetch + render
 *************************************************/
async function slaRefresh() {
  // SLA View finns i style/css, men din HTML använder tab i Admin tidigare.
  // Nu ligger SLA som egen view via menuBtn openSlaView (i script).
  // Om du inte har knappen i sidebar: den kommer ändå funka om knappen finns.
  const days = parseInt($("slaDaysSelect")?.value || "30", 10);

  const overviewBox = $("slaOverviewBox");
  const agentsBox = $("slaAgentsBox");
  const ticketsBox = $("slaTicketsBox");

  if (overviewBox) overviewBox.innerHTML = `<div class="muted small">Laddar SLA...</div>`;
  if (agentsBox) agentsBox.innerHTML = "";
  if (ticketsBox) ticketsBox.innerHTML = "";

  try {
    // ✅ tickets used for stats locally (supports agent-only view too)
    const allTickets = await fetchJson(API.ADMIN_SLA_TICKETS + `?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tickets = allTickets.tickets || allTickets || [];
    slaCachedTickets = tickets;

    const filtered = filterTicketsByDays(tickets, days);

    renderSlaOverview(filtered, days);
    renderSlaAgents(filtered, days);
    renderSlaTickets(filtered, days);

    // ✅ Trend
    await slaRefreshTrend(days);
  } catch (e) {
    console.error(e);
    if (overviewBox) overviewBox.innerHTML = `<div class="alert error">${escapeHtml(e.message || "Fel")}</div>`;
  }
}

/*************************************************
 * ✅ SLA overview (avg+median, breached)
 *************************************************/
function renderSlaOverview(tickets, days) {
  const box = $("slaOverviewBox");
  if (!box) return;

  const solved = tickets.filter((t) => t.status === "solved");
  const open = tickets.filter((t) => t.status === "open");
  const pending = tickets.filter((t) => t.status === "pending");

  const firstResponseTimes = solved
    .map((t) => t.metrics?.firstResponseMinutes)
    .filter((x) => typeof x === "number" && isFinite(x));

  const resolutionTimes = solved
    .map((t) => t.metrics?.resolutionMinutes)
    .filter((x) => typeof x === "number" && isFinite(x));

  const avgFirst = avg(firstResponseTimes);
  const medFirst = median(firstResponseTimes);

  const avgRes = avg(resolutionTimes);
  const medRes = median(resolutionTimes);

  const breached = tickets.filter((t) => t.metrics?.breached);

  // ✅ compare periods (days vs previous days)
  box.innerHTML = `
    <div class="kbGrid">
      <div class="panel soft">
        <b>Översikt (${days} dagar)</b>
        <div class="muted small" style="margin-top:6px;">
          Tickets: <b>${tickets.length}</b><br/>
          Open: <b>${open.length}</b> • Pending: <b>${pending.length}</b> • Solved: <b>${solved.length}</b><br/>
          Breached: <b>${breached.length}</b> (${pct(breached.length, tickets.length)}%)
        </div>
      </div>

      <div class="panel soft">
        <b>First Response</b>
        <div class="muted small" style="margin-top:6px;">
          Average: <b>${formatMinutes(avgFirst)}</b><br/>
          Median: <b>${formatMinutes(medFirst)}</b>
        </div>
      </div>

      <div class="panel soft">
        <b>Resolution</b>
        <div class="muted small" style="margin-top:6px;">
          Average: <b>${formatMinutes(avgRes)}</b><br/>
          Median: <b>${formatMinutes(medRes)}</b>
        </div>
      </div>

      <div class="panel soft">
        <b>Export / Reset</b>
        <div class="row gap" style="margin-top:10px; flex-wrap:wrap;">
          <button id="slaExportCsvBtn" class="btn ghost small" type="button">
            <i class="fa-solid fa-download"></i> Export CSV
          </button>

          <button id="slaClearMyBtn" class="btn secondary small" type="button">
            <i class="fa-solid fa-eraser"></i> Clear mine
          </button>

          ${
            currentUser?.role === "admin"
              ? `<button id="slaClearAllBtn" class="btn danger small" type="button">
                   <i class="fa-solid fa-trash"></i> Clear ALL
                 </button>`
              : ""
          }
        </div>
        <div class="muted small" style="margin-top:8px;">
          Export CSV laddar ner SLA-data. Clear tar bort statistik (server).
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="panel soft">
      <b>Breached filter</b>
      <div class="row gap" style="margin-top:10px; flex-wrap:wrap;">
        <select id="slaBreachedFilter" class="input smallInput">
          <option value="">Alla</option>
          <option value="breached">Endast breached</option>
          <option value="ok">Endast OK</option>
        </select>

        <select id="slaSortBy" class="input smallInput">
          <option value="lastActivity">Sortera: Senast aktivitet</option>
          <option value="firstResponse">Sortera: First response (störst)</option>
          <option value="resolution">Sortera: Resolution (störst)</option>
        </select>

        <button id="slaApplyFilterBtn" class="btn ghost small" type="button">
          <i class="fa-solid fa-filter"></i> Apply
        </button>
      </div>
    </div>
  `;

  // ✅ bind
  onClick("slaExportCsvBtn", () => window.open(API.ADMIN_SLA_EXPORT_CSV + `?days=${days}`, "_blank"));
  onClick("slaClearMyBtn", slaClearMyStats);
  onClick("slaClearAllBtn", slaClearAllStats);

  onClick("slaApplyFilterBtn", () => {
    const bf = $("slaBreachedFilter")?.value || "";
    const sb = $("slaSortBy")?.value || "lastActivity";
    renderSlaTickets(slaCachedTickets, days, bf, sb);
  });
}

async function slaClearMyStats() {
  const ok = confirm("Clear dina SLA stats? Detta går inte att ångra.");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_SLA_CLEAR_MY, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    alert(data.message || "Cleared ✅");
    await slaRefresh();
  } catch (e) {
    alert(e.message || "Fel");
  }
}

async function slaClearAllStats() {
  const ok = confirm("Clear ALLA SLA stats? Detta går inte att ångra.");
  if (!ok) return;

  try {
    const data = await fetchJson(API.ADMIN_SLA_CLEAR_ALL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    alert(data.message || "Cleared ALL ✅");
    await slaRefresh();
  } catch (e) {
    alert(e.message || "Fel");
  }
}

/*************************************************
 * ✅ SLA agents (pending per agent, own stats for agent)
 *************************************************/
function renderSlaAgents(tickets, days) {
  const box = $("slaAgentsBox");
  if (!box) return;

  // group by agent assigned
  const map = {};

  tickets.forEach((t) => {
    const agent = t.assignedTo?.username || t.assignedTo?.email || t.assignedTo || "Unassigned";
    if (!map[agent]) map[agent] = { name: agent, tickets: [] };
    map[agent].tickets.push(t);
  });

  const rows = Object.values(map).sort((a, b) => b.tickets.length - a.tickets.length);

  if (!rows.length) {
    box.innerHTML = `<div class="muted small">Ingen agent-data.</div>`;
    return;
  }

  box.innerHTML = rows
    .map((r) => {
      // ✅ for agent role: show only their own + unassigned (optional)
      if (currentUser?.role === "agent") {
        const me = currentUser?.username;
        if (r.name !== me) return "";
      }

      const all = r.tickets;
      const open = all.filter((t) => t.status === "open").length;
      const pending = all.filter((t) => t.status === "pending").length;
      const solved = all.filter((t) => t.status === "solved").length;

      const fr = all
        .map((t) => t.metrics?.firstResponseMinutes)
        .filter((x) => typeof x === "number" && isFinite(x));
      const res = all
        .map((t) => t.metrics?.resolutionMinutes)
        .filter((x) => typeof x === "number" && isFinite(x));

      const breached = all.filter((t) => t.metrics?.breached).length;

      return `
        <div class="panel soft" style="margin-bottom:10px;">
          <div class="panelHead">
            <b>${escapeHtml(r.name)}</b>
            <span class="muted small" style="margin-left:auto;">
              Tickets: <b>${all.length}</b> • Breached: <b>${breached}</b>
            </span>
          </div>

          <div class="muted small">
            Open: <b>${open}</b> • Pending: <b>${pending}</b> • Solved: <b>${solved}</b>
          </div>

          <div class="divider"></div>

          <div class="kbGrid">
            <div class="panel soft">
              <b>First response</b>
              <div class="muted small">
                Avg: <b>${formatMinutes(avg(fr))}</b><br/>
                Median: <b>${formatMinutes(median(fr))}</b>
              </div>
            </div>

            <div class="panel soft">
              <b>Resolution</b>
              <div class="muted small">
                Avg: <b>${formatMinutes(avg(res))}</b><br/>
                Median: <b>${formatMinutes(median(res))}</b>
              </div>
            </div>

            <div class="panel soft">
              <b>Status</b>
              <div class="muted small">
                Open: <b>${open}</b><br/>
                Pending: <b>${pending}</b>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

/*************************************************
 * ✅ SLA tickets list (filter/sort breached)
 *************************************************/
function renderSlaTickets(tickets, days, breachedFilter = "", sortBy = "lastActivity") {
  const box = $("slaTicketsBox");
  if (!box) return;

  let list = filterTicketsByDays(tickets, days);

  // ✅ agent sees only assigned
  if (currentUser?.role === "agent") {
    const me = currentUser?.username;
    list = list.filter((t) => (t.assignedTo?.username || t.assignedTo) === me);
  }

  // ✅ breached filter
  if (breachedFilter === "breached") list = list.filter((t) => t.metrics?.breached);
  if (breachedFilter === "ok") list = list.filter((t) => !t.metrics?.breached);

  // ✅ sort
  if (sortBy === "lastActivity") {
    list.sort((a, b) => new Date(b.lastActivityAt || b.createdAt) - new Date(a.lastActivityAt || a.createdAt));
  } else if (sortBy === "firstResponse") {
    list.sort((a, b) => (b.metrics?.firstResponseMinutes || 0) - (a.metrics?.firstResponseMinutes || 0));
  } else if (sortBy === "resolution") {
    list.sort((a, b) => (b.metrics?.resolutionMinutes || 0) - (a.metrics?.resolutionMinutes || 0));
  }

  if (!list.length) {
    box.innerHTML = `<div class="muted small">Inga tickets i denna period.</div>`;
    return;
  }

  box.innerHTML = list
    .slice(0, 200)
    .map((t) => {
      const breached = t.metrics?.breached;
      const fr = t.metrics?.firstResponseMinutes;
      const res = t.metrics?.resolutionMinutes;

      return `
        <div class="listItem">
          <div class="listItemTitle">
            ${escapeHtml(t.title || "Ticket")} 
            <span class="pill">${escapeHtml(t.status)}</span>
            ${breached ? `<span class="pill danger">BREACHED</span>` : `<span class="pill">OK</span>`}
          </div>

          <div class="muted small">
            <b>ID:</b> ${escapeHtml(t._id)} • ${escapeHtml(t.companyId)} • ${escapeHtml(formatDate(t.createdAt))}
          </div>

          <div class="muted small">
            First response: <b>${formatMinutes(fr)}</b> • Resolution: <b>${formatMinutes(res)}</b>
          </div>
        </div>
      `;
    })
    .join("");
}

/*************************************************
 * ✅ SLA Trend (week-by-week)
 *************************************************/
async function slaRefreshTrend(days) {
  try {
    const data = await fetchJson(API.ADMIN_SLA_TREND + `?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    slaCachedTrend = data.trend || data || [];
    renderSlaTrend(slaCachedTrend);
  } catch (e) {
    console.warn("SLA trend fail:", e?.message || e);
  }
}

function renderSlaTrend(trend = []) {
  // vi renderar i Overview box om den finns
  const overview = $("slaOverviewBox");
  if (!overview || !Array.isArray(trend) || trend.length === 0) return;

  const html = `
    <div class="divider"></div>
    <div class="panel soft">
      <b>Trend (vecka för vecka)</b>
      <div class="muted small" style="margin-top:6px;">
        Visar genomsnitt & median för first response / resolution per vecka.
      </div>

      <div class="divider"></div>

      <div class="list">
        ${trend
          .map((w) => {
            return `
              <div class="listItem">
                <div class="listItemTitle">
                  Vecka: ${escapeHtml(w.label || "-")}
                </div>
                <div class="muted small">
                  Tickets: <b>${w.count || 0}</b> • Breached: <b>${w.breached || 0}</b>
                </div>
                <div class="muted small">
                  First response avg: <b>${formatMinutes(w.firstResponseAvg)}</b> • median: <b>${formatMinutes(
              w.firstResponseMedian
            )}</b>
                </div>
                <div class="muted small">
                  Resolution avg: <b>${formatMinutes(w.resolutionAvg)}</b> • median: <b>${formatMinutes(
              w.resolutionMedian
            )}</b>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;

  overview.insertAdjacentHTML("beforeend", html);
}

/*************************************************
 * ✅ AUTH: login/register/forgot/reset
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
    addMessage("assistant", "Du är inloggad ✅");
  } catch (e) {
    setAlert($("authMessage"), e.message || "Inloggning misslyckades", true);
  }
}

async function register() {
  setAlert($("authMessage"), "");

  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();
  const email = $("email")?.value?.trim();

  if (!username || !password || !email) return setAlert($("authMessage"), "Fyll i användarnamn + lösenord + email", true);

  try {
    const data = await fetchJson(API.REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, email }),
    });

    token = data.token;
    localStorage.setItem("token", token);

    currentUser = await fetchMe();
    applyAuthUI();
    await loadCategories();
    applyCompanyToUI();

    clearChat();
    addMessage("assistant", "Konto skapat ✅");
  } catch (e) {
    setAlert($("authMessage"), e.message || "Registrering misslyckades", true);
  }
}

async function forgotPasswordSend() {
  const email = $("forgotEmail")?.value?.trim();
  if (!email) return setAlert($("forgotMsg"), "Skriv en email", true);

  try {
    const data = await fetchJson(API.AUTH_FORGOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setAlert($("forgotMsg"), data.message || "Återställningslänk skickad ✅");
  } catch (e) {
    setAlert($("forgotMsg"), e.message || "Fel", true);
  }
}

async function resetPasswordSave() {
  const newPass = $("resetNewPass")?.value?.trim();
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get("resetToken");

  if (!resetToken) return setAlert($("resetMsg"), "Reset-token saknas i URL", true);
  if (!newPass) return setAlert($("resetMsg"), "Skriv nytt lösenord", true);

  try {
    const data = await fetchJson(API.AUTH_RESET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetToken, newPass }),
    });

    setAlert($("resetMsg"), data.message || "Lösenord sparat ✅");
  } catch (e) {
    setAlert($("resetMsg"), e.message || "Fel", true);
  }
}

/*************************************************
 * ✅ SETTINGS (change username/password)
 *************************************************/
async function settingsChangeUsername() {
  const msg = $("settingsMsg");
  setAlert(msg, "");

  const newUsername = $("newUsernameInput")?.value?.trim();
  if (!newUsername) return setAlert(msg, "Skriv nytt användarnamn", true);

  try {
    const data = await fetchJson(API.AUTH_CHANGE_USERNAME, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newUsername }),
    });

    setAlert(msg, data.message || "Användarnamn uppdaterat ✅");
    currentUser = await fetchMe();
    applyAuthUI();
  } catch (e) {
    setAlert(msg, e.message || "Fel", true);
  }
}

async function settingsChangePassword() {
  const msg = $("settingsMsg");
  setAlert(msg, "");

  const currentPass = $("currentPassInput")?.value?.trim();
  const newPass = $("newPassInput")?.value?.trim();

  if (!currentPass || !newPass) return setAlert(msg, "Fyll i båda lösenord", true);

  try {
    const data = await fetchJson(API.AUTH_CHANGE_PASSWORD, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPass, newPass }),
    });

    setAlert(msg, data.message || "Lösenord uppdaterat ✅");
    $("currentPassInput").value = "";
    $("newPassInput").value = "";
  } catch (e) {
    setAlert(msg, e.message || "Fel", true);
  }
}

/*************************************************
 * ✅ Logout
 *************************************************/
function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem("token");

  ticketId = null;
  inboxSelectedTicketId = null;
  mySelectedTicketId = null;

  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Polling for inbox + my tickets changes (notif)
 *************************************************/
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    if (!token || !currentUser) return;

    if (currentUser.role === "admin" || currentUser.role === "agent") {
      try {
        const data = await fetchJson(API.ADMIN_TICKETS, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const tickets = data.tickets || data || [];
        updateCategoryNotif(tickets);
        updateInboxNotifDot(tickets);
      } catch {}
    }

    try {
      const tickets = await fetchJson(API.MY_TICKETS, {
        headers: { Authorization: `Bearer ${token}` },
      });

      updateMyTicketsNotif(tickets);
    } catch {}
  }, 5000);
}

function updateCategoryNotif(tickets = []) {
  // ✅ notif on category dropdown if new open ticket exists in that category
  const map = {};
  tickets.forEach((t) => {
    if (t.status !== "open") return;
    map[t.companyId] = (map[t.companyId] || 0) + 1;
  });

  categoryNotifMap = map;

  const select = $("categorySelect");
  if (!select) return;

  // highlight if there is any open in current category
  if (categoryNotifMap[companyId] > 0) select.classList.add("categoryNotif");
  else select.classList.remove("categoryNotif");
}

function updateMyTicketsNotif(tickets = []) {
  // placeholder if you want future badge
  lastMyTicketSnapshot = tickets.reduce((acc, t) => {
    acc[t._id] = t.lastActivityAt;
    return acc;
  }, {});
}

/*************************************************
 * ✅ Init / Bind events
 *************************************************/
function initEvents() {
  // Sidebar menu
  onClick("openChatView", () => {
    openView("chat");
    setActiveMenu("chat");
  });

  onClick("openMyTicketsView", async () => {
    openView("myTickets");
    setActiveMenu("myTickets");
    await loadMyTickets();
  });

  onClick("openInboxView", async () => {
    openView("inbox");
    setActiveMenu("inbox");
    await inboxLoadTickets();
  });

  onClick("openAdminView", async () => {
    openView("admin");
    setActiveMenu("admin");
    initAdminTabs();
    await adminLoadUsers();
  });

  // ✅ SLA view entry
  onClick("openSlaView", async () => {
    openView("sla");
    setActiveMenu("sla");
    await slaRefresh();
  });

  onClick("openSettingsView", () => {
    openView("settings");
    setActiveMenu("settings");
  });

  // Theme
  onClick("themeToggle", toggleTheme);

  // Debug
  onClick("toggleDebugBtn", toggleDebugPanel);

  // Auth
  onClick("loginBtn", login);
  onClick("registerBtn", register);

  // forgot/reset cards
  onClick("openForgotBtn", () => {
    show($("forgotCard"), true);
    show($("resetCard"), false);
  });
  onClick("closeForgotBtn", () => {
    show($("forgotCard"), false);
  });
  onClick("sendForgotBtn", forgotPasswordSend);

  // reset password card auto if URL has resetToken
  const params = new URLSearchParams(window.location.search);
  if (params.get("resetToken")) {
    show($("resetCard"), true);
    show($("forgotCard"), false);
  }

  onClick("resetSaveBtn", resetPasswordSave);

  // Password visibility
  onClick("togglePassBtn", () => {
    const inp = $("password");
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
  });

  onClick("toggleResetPassBtn", () => {
    const inp = $("resetNewPass");
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
  });

  // Chat
  onClick("sendBtn", sendMessage);
  onClick("clearChatBtn", clearChat);
  onClick("exportChatBtn", exportChat);
  onClick("newTicketBtn", startNewTicket);

  // Enter to send
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Feedback
  onClick("fbUp", () => sendFeedback("up"));
  onClick("fbDown", () => sendFeedback("down"));

  // Category select
  onChange("categorySelect", (e) => setCompanyFromSelect(e.target.value));

  // Inbox filters
  onChange("inboxStatusFilter", inboxLoadTickets);
  onChange("inboxCategoryFilter", inboxLoadTickets);
  onInput("inboxSearchInput", inboxLoadTickets);

  onClick("inboxRefreshBtn", inboxLoadTickets);
  onClick("solveAllBtn", inboxSolveAll);
  onClick("removeSolvedBtn", inboxRemoveSolved);

  // Inbox actions
  onClick("setStatusOpen", () => inboxSetStatus("open"));
  onClick("setStatusPending", () => inboxSetStatus("pending"));
  onClick("setStatusSolved", () => inboxSetStatus("solved"));

  onClick("setPriorityBtn", inboxSetPriority);
  onClick("sendAgentReplyInboxBtn", inboxSendAgentReply);
  onClick("saveInternalNoteBtn", inboxSaveInternalNote);
  onClick("clearInternalNotesBtn", inboxClearInternalNotes);
  onClick("assignTicketBtn", inboxAssignTicket);
  onClick("deleteTicketBtn", inboxDeleteTicket);

  // My tickets refresh
  onClick("myTicketsRefreshBtn", loadMyTickets);

  // Admin exports
  onClick("adminExportAllBtn", adminExportAll);
  onClick("trainingExportBtn", adminExportTraining);

  // KB buttons
  onClick("kbRefreshBtn", kbLoadList);
  onClick("kbUploadTextBtn", kbUploadText);
  onClick("kbUploadUrlBtn", kbUploadUrl);
  onClick("kbUploadPdfBtn", kbUploadPdf);
  onClick("kbExportBtn", kbExport);

  // Categories
  onClick("catsRefreshBtn", catsLoadList);
  onClick("createCatBtn", catsCreateCategory);

  // Settings
  onClick("changeUsernameBtn", settingsChangeUsername);
  onClick("changePasswordBtn", settingsChangePassword);

  // Logout
  onClick("logoutBtn", logout);

  // SLA refresh
  onClick("slaRefreshBtn", slaRefresh);
  onChange("slaDaysSelect", slaRefresh);
}

/*************************************************
 * ✅ Bootstrap
 *************************************************/
(async function boot() {
  applySavedTheme();

  currentUser = await fetchMe();
  applyAuthUI();

  await loadCategories();
  applyCompanyToUI();

  initEvents();
  startPolling();

  // Start text if logged in
  if (token && currentUser) {
    clearChat();
    addMessage("assistant", "Välkommen tillbaka ✅ Vad vill du fråga?");
  }
})();
