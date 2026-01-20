/* =========================================================
   AI Kundtjänst - script.js (BULLETPROOF ✅)
   Fixar "tomma flikar utan console-fel" genom:
   - UI visar ALLA API-fel tydligt
   - Hanterar när backend svarar HTML istället för JSON
   - Hanterar fel origin / fel API_BASE / CORS
   - Visar fallback-texter i varje flik
========================================================= */

const API_BASE = ""; // Om frontend + backend ligger på samma origin → tomt är rätt.

const LS = {
  token: "ai_token",
  user: "ai_user",
  theme: "ai_theme",
  debug: "ai_debug",
  chatConversation: "ai_chat_conversation",
  currentCompanyId: "ai_company_id",
  lastTicketId: "ai_last_ticket_id",
};

let state = {
  token: localStorage.getItem(LS.token) || "",
  user: safeJsonParse(localStorage.getItem(LS.user)) || null,
  companyId: localStorage.getItem(LS.currentCompanyId) || "demo",
  conversation: safeJsonParse(localStorage.getItem(LS.chatConversation)) || [],
  lastTicketId: localStorage.getItem(LS.lastTicketId) || "",
  selectedMyTicketId: null,
  selectedInboxTicketId: null,
  debug: localStorage.getItem(LS.debug) === "1",
  chartTrend: null,
};

const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function setLS(key, value) {
  if (value === null || value === undefined || value === "") localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function show(el, on = true) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setActiveMenu(btnId) {
  const ids = ["openChatView", "openMyTicketsView", "openInboxView", "openSlaView", "openAdminView", "openSettingsView"];
  ids.forEach((id) => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle("active", id === btnId);
  });
}

function switchView(viewId) {
  const views = ["authView", "chatView", "myTicketsView", "inboxView", "slaView", "adminView", "settingsView"];
  views.forEach((id) => show($(id), id === viewId));
}

function setAlert(el, msg, type = "") {
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error");
  if (type === "error") el.classList.add("error");
  show(el, !!msg);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleString("sv-SE");
  } catch {
    return "";
  }
}

function msToPretty(ms) {
  if (ms == null || !Number.isFinite(ms)) return "-";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const hh = h % 24;
  const mm = m % 60;
  if (d > 0) return `${d}d ${hh}h ${mm}m`;
  if (h > 0) return `${h}h ${mm}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function pill(label, kind = "") {
  const cls =
    kind === "ok" ? "pill ok" : kind === "warn" ? "pill warn" : kind === "danger" ? "pill danger" : "pill";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

/* =========================================================
   ✅ SUPER-ROBUST API
   - Om server svarar HTML eller tomt: visa tydligt fel
========================================================= */
async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const isFormData = opts.body instanceof FormData;
  if (!headers["Content-Type"] && !isFormData) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(API_BASE + path, { ...opts, headers });
  } catch (err) {
    throw new Error(`Kan inte nå backend (${API_BASE || location.origin}). Kör du frontend separat?`);
  }

  const ct = res.headers.get("content-type") || "";

  // Läs body som text först → sen parse om JSON
  const rawText = await res.text().catch(() => "");

  let data = null;
  if (ct.includes("application/json")) {
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      throw new Error(`Backend svarade "json", men kunde inte tolkas. Raw: ${rawText.slice(0, 120)}...`);
    }
  } else {
    data = rawText;
  }

  if (!res.ok) {
    const msg =
      (typeof data === "object" && data?.error) ||
      (typeof data === "object" && data?.message) ||
      `HTTP ${res.status}: ${String(rawText).slice(0, 120)}`;
    throw new Error(msg);
  }

  // ✅ Om endpointen borde vara JSON men du fick HTML, så är origin fel
  if (typeof data === "string" && data.includes("<!DOCTYPE html")) {
    throw new Error(`Fel origin/API_BASE. Du får HTML istället för API JSON. Kör frontend + backend på samma host.`);
  }

  return data;
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem(LS.theme);
  if (savedTheme) document.body.setAttribute("data-theme", savedTheme);

  show($("debugPanel"), state.debug);

  bindEvents();
  boot();
});

async function boot() {
  // ✅ ALLA VYER får initial fallback, så inget blir "tomt"
  if ($("messages")) $("messages").innerHTML = `<div class="muted small">Logga in och starta en chatt.</div>`;
  if ($("myTicketsList")) $("myTicketsList").innerHTML = `<div class="muted small">Logga in för att se dina ärenden.</div>`;
  if ($("myTicketDetails")) $("myTicketDetails").innerHTML = `Välj ett ärende för att se detaljer.`;
  if ($("inboxTicketsList")) $("inboxTicketsList").innerHTML = `<div class="muted small">Logga in som agent/admin.</div>`;
  if ($("ticketDetails")) $("ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
  if ($("slaOverviewBox")) $("slaOverviewBox").innerHTML = `<div class="muted small">Logga in som agent/admin.</div>`;
  if ($("slaAgentsBox")) $("slaAgentsBox").innerHTML = `<div class="muted small">Ingen data.</div>`;
  if ($("slaTicketsBox")) $("slaTicketsBox").innerHTML = `<div class="muted small">Ingen data.</div>`;
  if ($("adminUsersList")) $("adminUsersList").innerHTML = `<div class="muted small">Logga in som admin.</div>`;
  if ($("kbList")) $("kbList").innerHTML = `<div class="muted small">Välj kategori och ladda KB.</div>`;
  if ($("catsList")) $("catsList").innerHTML = `<div class="muted small">Laddar kategorier...</div>`;

  // Categories (public)
  try {
    await loadCategories();
  } catch (e) {
    // Visar fel i auth view om /categories failar
    setAlert($("authMessage"), `❌ /categories fel: ${e.message}`, "error");
  }

  if ($("categorySelect")) $("categorySelect").value = state.companyId;
  if ($("kbCategorySelect")) $("kbCategorySelect").value = state.companyId;

  // Verify token
  if (state.token) {
    try {
      const me = await api("/me");
      state.user = me;
      setLS(LS.user, JSON.stringify(me));
      await onLoggedIn();
    } catch (e) {
      doLogout(false);
      setAlert($("authMessage"), `Token ogiltig: ${e.message}`, "error");
    }
  } else {
    onLoggedOut();
  }

  handleResetTokenFromUrl();
  updateDebug();
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  $("openChatView")?.addEventListener("click", () => {
    setActiveMenu("openChatView");
    switchView("chatView");
    renderConversation();
  });

  $("openMyTicketsView")?.addEventListener("click", async () => {
    setActiveMenu("openMyTicketsView");
    switchView("myTicketsView");

    if (!state.token) {
      $("myTicketsList").innerHTML = `<div class="muted small">Logga in först.</div>`;
      return;
    }

    try {
      await loadMyTickets();
    } catch (e) {
      setAlert($("myTicketsHint"), e.message, "error");
    }
  });

  $("openInboxView")?.addEventListener("click", async () => {
    setActiveMenu("openInboxView");
    switchView("inboxView");

    if (!state.token) {
      setAlert($("inboxMsg"), "Logga in först.", "error");
      return;
    }

    try {
      await loadInboxTickets();
    } catch (e) {
      setAlert($("inboxMsg"), e.message, "error");
    }
  });

  $("openSlaView")?.addEventListener("click", async () => {
    setActiveMenu("openSlaView");
    switchView("slaView");

    if (!state.token) {
      $("slaOverviewBox").innerHTML = `<div class="muted small">Logga in som agent/admin för SLA.</div>`;
      return;
    }

    try {
      await refreshSlaAll();
    } catch (e) {
      $("slaOverviewBox").innerHTML = `<div class="alert error">❌ ${escapeHtml(e.message)}</div>`;
    }
  });

  $("openAdminView")?.addEventListener("click", async () => {
    setActiveMenu("openAdminView");
    switchView("adminView");

    if (!state.token) {
      $("adminUsersList").innerHTML = `<div class="muted small">Logga in som admin.</div>`;
      return;
    }

    try {
      await refreshAdminAll();
    } catch (e) {
      setAlert($("adminUsersMsg"), e.message, "error");
    }
  });

  $("openSettingsView")?.addEventListener("click", () => {
    setActiveMenu("openSettingsView");
    switchView("settingsView");
  });

  $("categorySelect")?.addEventListener("change", (e) => {
    state.companyId = e.target.value || "demo";
    setLS(LS.currentCompanyId, state.companyId);
    if ($("kbCategorySelect")) $("kbCategorySelect").value = state.companyId;
    updateDebug();
  });

  $("themeToggle")?.addEventListener("click", () => {
    const cur = document.body.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(LS.theme, next);
  });

  $("toggleDebugBtn")?.addEventListener("click", () => {
    state.debug = !state.debug;
    localStorage.setItem(LS.debug, state.debug ? "1" : "0");
    show($("debugPanel"), state.debug);
    updateDebug();
  });

  $("loginBtn")?.addEventListener("click", doLogin);
  $("registerBtn")?.addEventListener("click", doRegister);
  $("logoutBtn")?.addEventListener("click", () => doLogout(true));

  $("sendBtn")?.addEventListener("click", sendChat);
  $("messageInput")?.addEventListener("keydown", (e) => e.key === "Enter" && sendChat());

  $("myTicketsRefreshBtn")?.addEventListener("click", loadMyTickets);

  $("inboxRefreshBtn")?.addEventListener("click", loadInboxTickets);

  $("slaRefreshBtn")?.addEventListener("click", refreshSlaAll);

  qsa(".tabBtn").forEach((b) => {
    b.addEventListener("click", () => {
      qsa(".tabBtn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const tab = b.getAttribute("data-tab");
      qsa(".tabPanel").forEach((p) => show(p, p.id === tab));
    });
  });

  $("kbRefreshBtn")?.addEventListener("click", loadKbList);
  $("catsRefreshBtn")?.addEventListener("click", loadCategoriesAdmin);
}

/* =========================
   AUTH
========================= */
async function doLogin() {
  setAlert($("authMessage"), "");
  try {
    const username = $("username")?.value?.trim();
    const password = $("password")?.value || "";
    if (!username || !password) throw new Error("Fyll i användarnamn och lösenord");

    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    state.token = data.token || "";
    state.user = data.user || null;

    setLS(LS.token, state.token);
    setLS(LS.user, JSON.stringify(state.user || {}));

    await onLoggedIn();
  } catch (e) {
    setAlert($("authMessage"), e.message, "error");
  }
}

async function doRegister() {
  setAlert($("authMessage"), "");
  try {
    const username = $("username")?.value?.trim();
    const password = $("password")?.value || "";
    const email = $("email")?.value?.trim() || "";
    if (!username || !password) throw new Error("Fyll i användarnamn och lösenord");

    await api("/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email }),
    });

    setAlert($("authMessage"), "Registrering lyckades ✅ Logga in nu.", "");
  } catch (e) {
    setAlert($("authMessage"), e.message, "error");
  }
}

function doLogout(showMsg = true) {
  state.token = "";
  state.user = null;
  setLS(LS.token, "");
  setLS(LS.user, "");
  onLoggedOut();
  if (showMsg) addSystemMessage("Du är utloggad ✅");
}

function onLoggedOut() {
  if ($("roleBadge")) $("roleBadge").textContent = "Inte inloggad";
  show($("logoutBtn"), false);
  show($("openSettingsView"), false);
  qsa(".adminOnly").forEach((x) => (x.style.display = "none"));
  switchView("authView");
  setActiveMenu("openChatView");
}

async function onLoggedIn() {
  show($("logoutBtn"), true);
  show($("openSettingsView"), true);

  const role = state.user?.role || "user";
  $("roleBadge").textContent =
    role === "user" ? `Inloggad: ${state.user?.username || ""}` : `${state.user?.username || ""} (${role})`;

  if (role === "agent" || role === "admin") qsa(".adminOnly").forEach((x) => (x.style.display = ""));
  else qsa(".adminOnly").forEach((x) => (x.style.display = "none"));

  switchView("chatView");
  setActiveMenu("openChatView");

  renderConversation();
  updateDebug();
}

/* =========================
   CATEGORIES
========================= */
async function loadCategories() {
  const cats = await api("/categories");
  const sel = $("categorySelect");
  const selKb = $("kbCategorySelect");

  const fill = (selectEl) => {
    if (!selectEl) return;
    const cur = selectEl.value || state.companyId || "demo";
    selectEl.innerHTML = "";
    for (const c of cats) {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = c.key === c.name ? c.key : `${c.name} (${c.key})`;
      selectEl.appendChild(opt);
    }
    selectEl.value = cur || "demo";
  };

  fill(sel);
  fill(selKb);
}

/* =========================
   CHAT
========================= */
function addSystemMessage(text) {
  const m = $("messages");
  if (m) {
    const div = document.createElement("div");
    div.className = "muted small";
    div.style.margin = "10px 0";
    div.textContent = text;
    m.appendChild(div);
  }
}

function renderConversation() {
  if (!$("messages")) return;
  $("messages").innerHTML = "";
  for (const m of state.conversation) {
    const div = document.createElement("div");
    div.className = "muted small";
    div.textContent = `${m.role}: ${m.content}`;
    $("messages").appendChild(div);
  }
}

async function sendChat() {
  if (!state.token) {
    addSystemMessage("❌ Logga in först.");
    return;
  }
  const inp = $("messageInput");
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;

  inp.value = "";
  state.conversation.push({ role: "user", content: text });
  setLS(LS.chatConversation, JSON.stringify(state.conversation));
  renderConversation();

  try {
    const data = await api("/chat", {
      method: "POST",
      body: JSON.stringify({ companyId: state.companyId, conversation: state.conversation }),
    });
    state.conversation.push({ role: "assistant", content: data.reply || "-" });
    setLS(LS.chatConversation, JSON.stringify(state.conversation));
    renderConversation();
  } catch (e) {
    addSystemMessage(`❌ ${e.message}`);
  }
}

/* =========================
   MY TICKETS
========================= */
async function loadMyTickets() {
  $("myTicketsList").innerHTML = `<div class="muted small">Laddar...</div>`;
  try {
    const tickets = await api("/my/tickets");
    $("myTicketsList").innerHTML = tickets.length
      ? tickets.map((t) => `<div class="listItem">${escapeHtml(t.title || t._id)}</div>`).join("")
      : `<div class="muted small">Inga ärenden ännu.</div>`;
  } catch (e) {
    $("myTicketsList").innerHTML = `<div class="alert error">❌ ${escapeHtml(e.message)}</div>`;
  }
}

/* =========================
   INBOX
========================= */
async function loadInboxTickets() {
  $("inboxTicketsList").innerHTML = `<div class="muted small">Laddar...</div>`;
  try {
    const tickets = await api("/admin/tickets");
    $("inboxTicketsList").innerHTML = tickets.length
      ? tickets.map((t) => `<div class="listItem">${escapeHtml(t.title || t._id)}</div>`).join("")
      : `<div class="muted small">Inga tickets.</div>`;
  } catch (e) {
    $("inboxTicketsList").innerHTML = `<div class="alert error">❌ ${escapeHtml(e.message)}</div>`;
  }
}

/* =========================
   SLA / ADMIN minimal placeholders
========================= */
async function refreshSlaAll() {
  $("slaOverviewBox").innerHTML = `<div class="muted small">Laddar...</div>`;
  try {
    const o = await api("/admin/sla/overview?days=30");
    $("slaOverviewBox").innerHTML = `<div class="muted small">Tickets: ${escapeHtml(String(o.totalTickets || 0))}</div>`;
  } catch (e) {
    $("slaOverviewBox").innerHTML = `<div class="alert error">❌ ${escapeHtml(e.message)}</div>`;
  }
}

async function refreshAdminAll() {
  $("adminUsersList").innerHTML = `<div class="muted small">Laddar...</div>`;
  try {
    const u = await api("/admin/users");
    $("adminUsersList").innerHTML = u.length
      ? u.map((x) => `<div class="listItem">${escapeHtml(x.username)} (${escapeHtml(x.role)})</div>`).join("")
      : `<div class="muted small">Inga users.</div>`;
  } catch (e) {
    $("adminUsersList").innerHTML = `<div class="alert error">❌ ${escapeHtml(e.message)}</div>`;
  }
}

function handleResetTokenFromUrl() {}

function updateDebug() {
  if (!$("dbgApi")) return;
  $("dbgApi").textContent = API_BASE || location.origin;
  $("dbgLogged").textContent = state.token ? "JA" : "NEJ";
  $("dbgRole").textContent = state.user?.role || "-";
  $("dbgTicket").textContent = state.lastTicketId || "-";
  $("dbgRag").textContent = "-";
}

async function loadKbList() {
  if ($("kbList")) $("kbList").innerHTML = `<div class="muted small">KB: ej aktiv i minimal debug-build.</div>`;
}

async function loadCategoriesAdmin() {
  if ($("catsList")) $("catsList").innerHTML = `<div class="muted small">Kategorier: ej aktiv i minimal debug-build.</div>`;
}
