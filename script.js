/* =========================
   AI Kundtjänst – script.js (FULL FUNK)
   - Fixar klick
   - Kopplar Admin / Inbox / SLA endpoints
   - Kopplar My Tickets
========================= */

const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "",
  token: localStorage.getItem("token") || "",
  me: null,
  companyId: "demo",
  companies: [],
  currentCompany: null,

  conversation: [],
  activeTicketId: null,
  activeTicketPublicId: null,

  debug: false,

  myTickets: [],
  inboxTickets: [],
  inboxSelectedTicket: null,

  csatPendingTicketId: null,
};

/* =========================
   Helpers
========================= */
function setDebugLine(id, v) {
  const el = $(id);
  if (el) el.textContent = v ?? "-";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(title, text = "", type = "info") {
  const wrap = $("toastWrap");
  if (!wrap) return;

  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.innerHTML = `
    <div class="toastTitle">${escapeHtml(title)}</div>
    <div class="toastText">${escapeHtml(text)}</div>
  `;
  wrap.appendChild(div);

  setTimeout(() => {
    div.style.opacity = "0";
    div.style.transform = "translateY(6px)";
  }, 3400);

  setTimeout(() => div.remove(), 3800);
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers["Authorization"] = "Bearer " + state.token;

  const res = await fetch(state.apiBase + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    const msg = data?.error || `Serverfel (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

/* =========================
   Views
========================= */
function hideAllViews() {
  const views = [
    "authView",
    "chatView",
    "myTicketsView",
    "inboxView",
    "adminView",
    "settingsView",
    "slaView",
    "customerAdminView",
    "billingView",
    "customerSettingsView",
  ];
  views.forEach((v) => {
    const el = $(v);
    if (el) el.style.display = "none";
  });
}

function setActiveMenu(btnId) {
  const ids = [
    "openChatView",
    "openMyTicketsView",
    "openInboxView",
    "openAdminView",
    "openSettingsView",
    "openSlaView",
    "openCustomerAdminView",
    "openBillingView",
    "openCustomerSettingsView",
  ];
  ids.forEach((id) => $(id)?.classList.remove("active"));
  $(btnId)?.classList.add("active");
}

function showView(viewId, menuBtnId) {
  hideAllViews();
  const v = $(viewId);
  if (v) v.style.display = "";
  if (menuBtnId) setActiveMenu(menuBtnId);
}

function updateRoleUI() {
  const role = state.me?.role || "";
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");
  const settingsBtn = $("openSettingsView");

  const inboxBtn = $("openInboxView");
  const slaBtn = $("openSlaView");
  const adminBtn = $("openAdminView");
  const customerAdminBtn = $("openCustomerAdminView");
  const billingBtn = $("openBillingView");
  const customerSettingsBtn = $("openCustomerSettingsView");
  const slaClearAllStatsBtn = $("slaClearAllStatsBtn");

  if (!state.me) {
    if (roleBadge) roleBadge.textContent = "Inte inloggad";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (settingsBtn) settingsBtn.style.display = "none";

    if (inboxBtn) inboxBtn.style.display = "none";
    if (slaBtn) slaBtn.style.display = "none";
    if (adminBtn) adminBtn.style.display = "none";
    if (customerAdminBtn) customerAdminBtn.style.display = "none";
    if (billingBtn) billingBtn.style.display = "none";
    if (customerSettingsBtn) customerSettingsBtn.style.display = "none";
    if (slaClearAllStatsBtn) slaClearAllStatsBtn.style.display = "none";
    return;
  }

  if (roleBadge) roleBadge.textContent = `${state.me.username} (${role})`;
  if (logoutBtn) logoutBtn.style.display = "";
  if (settingsBtn) settingsBtn.style.display = "";

  if (role === "admin" || role === "agent") {
    if (inboxBtn) inboxBtn.style.display = "";
    if (slaBtn) slaBtn.style.display = "";
  }
  if (role === "admin") {
    if (adminBtn) adminBtn.style.display = "";
    if (customerAdminBtn) customerAdminBtn.style.display = "";
    if (slaClearAllStatsBtn) slaClearAllStatsBtn.style.display = "";
  }

  if (billingBtn) billingBtn.style.display = "";
  if (customerSettingsBtn) customerSettingsBtn.style.display = "";
}

/* =========================
   Theme & Debug
========================= */
function toggleTheme() {
  const b = document.body;
  const cur = b.getAttribute("data-theme") || "dark";
  b.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  localStorage.setItem("theme", b.getAttribute("data-theme"));
}

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) document.body.setAttribute("data-theme", saved);
}

function renderDebug() {
  setDebugLine("dbgApi", location.origin);
  setDebugLine("dbgLogged", state.token ? "JA" : "NEJ");
  setDebugLine("dbgRole", state.me?.role || "-");
  setDebugLine("dbgTicket", state.activeTicketPublicId || state.activeTicketId || "-");
  setDebugLine("dbgRag", "-");
}

/* =========================
   Chat UI
========================= */
function clearMessages() {
  const m = $("messages");
  if (m) m.innerHTML = "";
}

function addMsg(role, text, meta = "") {
  const wrap = $("messages");
  if (!wrap) return;

  const msg = document.createElement("div");
  msg.className = "msg " + (role === "user" ? "user" : "ai");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.innerHTML =
    role === "user"
      ? `<i class="fa-solid fa-user"></i>`
      : `<i class="fa-solid fa-robot"></i>`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text || "";

  const box = document.createElement("div");
  box.appendChild(bubble);

  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "msgMeta";
    metaEl.textContent = meta;
    box.appendChild(metaEl);
  }

  msg.appendChild(avatar);
  msg.appendChild(box);
  wrap.appendChild(msg);
  wrap.scrollTop = wrap.scrollHeight;
}

function renderChatHeader() {
  const c = state.currentCompany;
  const el = $("chatTitle");
  if (el) el.textContent = c ? `AI Kundtjänst – ${c.displayName}` : "AI Kundtjänst";
}

function resetConversation() {
  state.conversation = [];
  state.activeTicketId = null;
  state.activeTicketPublicId = null;
  clearMessages();
  addMsg("assistant", state.currentCompany?.settings?.greeting || "Hej! 👋 Vad kan jag hjälpa dig med?");
  renderDebug();
}

/* =========================
   Auth
========================= */
async function doLogin() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();

  if (!username || !password) return toast("Saknas", "Fyll i användarnamn & lösenord", "error");

  try {
    const res = await api("/auth/login", {
      method: "POST",
      auth: false,
      body: { username, password },
    });

    state.token = res.token;
    localStorage.setItem("token", res.token);

    state.me = res.user;
    updateRoleUI();

    toast("Inloggad", "Välkommen ✅", "info");

    await loadCompanies();
    await bootstrapAfterLogin();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function doRegister() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();
  const email = $("email")?.value?.trim();

  if (!username || !password) return toast("Saknas", "Fyll i användarnamn & lösenord", "error");

  try {
    const res = await api("/auth/register", {
      method: "POST",
      auth: false,
      body: { username, password, email },
    });

    state.token = res.token;
    localStorage.setItem("token", res.token);

    state.me = res.user;
    updateRoleUI();

    toast("Konto skapat", "Du är nu inloggad ✅", "info");

    await loadCompanies();
    await bootstrapAfterLogin();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function doLogout() {
  state.token = "";
  state.me = null;
  localStorage.removeItem("token");
  updateRoleUI();
  showView("authView", "openChatView");
  toast("Utloggad", "Du är nu utloggad.", "info");
}

/* =========================
   Bootstrap + Companies
========================= */
async function loadMe() {
  if (!state.token) return null;
  try {
    const me = await api("/me");
    state.me = me;
    return me;
  } catch {
    state.me = null;
    state.token = "";
    localStorage.removeItem("token");
    return null;
  }
}

async function loadCompanies() {
  const companies = await api("/companies");
  state.companies = companies || [];

  const sel = $("categorySelect");
  if (sel) {
    sel.innerHTML = "";
    state.companies.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.companyId;
      opt.textContent = `${c.companyId} - ${c.displayName}`;
      sel.appendChild(opt);
    });
    if (state.companies.length) {
      state.companyId = state.companies[0].companyId;
      sel.value = state.companyId;
    }
  }

  state.currentCompany =
    state.companies.find((c) => c.companyId === state.companyId) || state.companies[0] || null;

  renderChatHeader();
}

async function bootstrapAfterLogin() {
  showView("chatView", "openChatView");
  resetConversation();
}

/* =========================
   Chat
========================= */
async function sendChat() {
  const inp = $("messageInput");
  const text = inp?.value?.trim();
  if (!text) return;

  inp.value = "";
  addMsg("user", text);
  state.conversation.push({ role: "user", content: text });

  try {
    const data = await api("/chat", {
      method: "POST",
      body: {
        companyId: state.companyId,
        conversation: state.conversation,
        ticketId: state.activeTicketId || undefined,
      },
    });

    const reply = data.reply || "Inget svar.";
    addMsg("assistant", reply);
    state.conversation.push({ role: "assistant", content: reply });

    state.activeTicketId = data.ticketId || state.activeTicketId;
    state.activeTicketPublicId = data.ticketPublicId || state.activeTicketPublicId;

    renderDebug();

    await refreshMyTickets();
  } catch (e) {
    addMsg("assistant", "❌ Fel: " + e.message);
  }
}

/* =========================
   MY TICKETS (FULLT)
========================= */
function renderMyTicketsList() {
  const list = $("myTicketsList");
  if (!list) return;
  list.innerHTML = "";

  if (state.myTickets.length === 0) {
    list.innerHTML = `<div class="muted small">Inga ärenden ännu.</div>`;
    return;
  }

  state.myTickets.forEach((t) => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTitle">
        ${escapeHtml(t.title || "Ärende")}
        <span class="pill">${escapeHtml(t.status)}</span>
      </div>
      <div class="muted small">${escapeHtml(t.ticketPublicId || "")}</div>
    `;
    div.addEventListener("click", () => renderMyTicketDetails(t._id));
    list.appendChild(div);
  });
}

async function refreshMyTickets() {
  try {
    const tickets = await api("/tickets/my");
    state.myTickets = tickets || [];
    renderMyTicketsList();
  } catch {}
}

async function renderMyTicketDetails(ticketId) {
  const box = $("myTicketDetails");
  if (!box) return;

  try {
    const t = await api("/tickets/" + ticketId);
    state.activeTicketId = t._id;
    state.activeTicketPublicId = t.ticketPublicId;
    renderDebug();

    const msgs = (t.messages || [])
      .map((m) => `<div class="muted small"><b>${escapeHtml(m.role)}:</b> ${escapeHtml(m.content)}</div>`)
      .join("<br>");

    box.innerHTML = `
      <div><b>${escapeHtml(t.title || "Ärende")}</b></div>
      <div class="muted small">${escapeHtml(t.ticketPublicId)} • ${escapeHtml(t.status)} • ${escapeHtml(t.priority)}</div>
      <div class="divider"></div>
      ${msgs || "<div class='muted small'>Inga meddelanden ännu.</div>"}
    `;
  } catch (e) {
    box.textContent = "Kunde inte ladda ticket: " + e.message;
  }
}

async function replyMyTicket() {
  const text = $("myTicketReplyText")?.value?.trim();
  if (!text) return toast("Saknas", "Skriv ett meddelande", "error");
  if (!state.activeTicketId) return toast("Saknas", "Välj ett ärende först", "error");

  try {
    await api(`/tickets/${state.activeTicketId}/reply`, {
      method: "POST",
      body: { message: text },
    });

    $("myTicketReplyText").value = "";
    toast("Skickat", "Ditt meddelande skickades ✅", "info");
    await renderMyTicketDetails(state.activeTicketId);
    await refreshMyTickets();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

/* =========================
   INBOX (agent/admin)
========================= */
function renderInboxList() {
  const list = $("inboxTicketsList");
  if (!list) return;
  list.innerHTML = "";

  if (state.inboxTickets.length === 0) {
    list.innerHTML = `<div class="muted small">Inga tickets hittades.</div>`;
    return;
  }

  state.inboxTickets.forEach((t) => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTitle">
        ${escapeHtml(t.title || "Ticket")}
        <span class="pill">${escapeHtml(t.status)}</span>
      </div>
      <div class="muted small">${escapeHtml(t.ticketPublicId)} • ${escapeHtml(t.companyId)} • ${escapeHtml(t.priority)}</div>
    `;
    div.addEventListener("click", () => selectInboxTicket(t._id));
    list.appendChild(div);
  });
}

async function loadInboxTickets() {
  const status = $("inboxStatusFilter")?.value || "";
  const companyId = $("inboxCategoryFilter")?.value || "";

  const tickets = await api(`/inbox/tickets?status=${encodeURIComponent(status)}&companyId=${encodeURIComponent(companyId)}`);
  state.inboxTickets = tickets || [];
  renderInboxList();
}

async function selectInboxTicket(ticketId) {
  state.inboxSelectedTicket = state.inboxTickets.find((t) => t._id === ticketId) || null;
  const box = $("ticketDetails");
  if (!box || !state.inboxSelectedTicket) return;

  const t = await api("/tickets/" + ticketId); // reuse ticket endpoint
  const msgs = (t.messages || [])
    .map((m) => `<div class="muted small"><b>${escapeHtml(m.role)}:</b> ${escapeHtml(m.content)}</div>`)
    .join("<br>");

  box.innerHTML = `
    <div><b>${escapeHtml(t.title || "Ticket")}</b></div>
    <div class="muted small">${escapeHtml(t.ticketPublicId)} • ${escapeHtml(t.status)} • ${escapeHtml(t.priority)}</div>
    <div class="divider"></div>
    ${msgs || "<div class='muted small'>Inga meddelanden ännu.</div>"}
  `;

  const priSel = $("ticketPrioritySelect");
  if (priSel) priSel.value = t.priority || "normal";
}

async function setInboxStatus(status) {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");

  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/status`, {
    method: "PATCH",
    body: { status },
  });

  toast("OK", "Status uppdaterad ✅", "info");
  await loadInboxTickets();
}

async function setInboxPriority() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const priority = $("ticketPrioritySelect")?.value || "normal";

  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/priority`, {
    method: "PATCH",
    body: { priority },
  });

  toast("OK", "Prioritet uppdaterad ✅", "info");
  await loadInboxTickets();
}

async function sendAgentReplyInbox() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const text = $("agentReplyTextInbox")?.value?.trim();
  if (!text) return toast("Saknas", "Skriv ett svar", "error");

  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/reply`, {
    method: "POST",
    body: { message: text },
  });

  $("agentReplyTextInbox").value = "";
  toast("Skickat", "Svar skickat ✅", "info");
  await selectInboxTicket(state.inboxSelectedTicket._id);
  await loadInboxTickets();
}

/* =========================
   SLA
========================= */
async function loadSlaDashboard() {
  const days = $("slaDaysSelect")?.value || "30";

  const overview = await api(`/sla/overview?days=${encodeURIComponent(days)}`);
  const trend = await api(`/sla/trend?days=${encodeURIComponent(days)}`);
  const agents = await api(`/sla/agents?days=${encodeURIComponent(days)}`);

  const box = $("slaOverviewBox");
  if (box) {
    box.innerHTML = `
      <div class="panel">
        <div class="panelHead"><b>Översikt (${overview.days} dagar)</b></div>
        <div class="muted small">
          Totalt: ${overview.counts.total} • Open: ${overview.counts.open} • Pending: ${overview.counts.pending} • Solved: ${overview.counts.solved}<br>
          Avg first reply (h): ${overview.avgFirstReplyHours ?? "-"}<br>
          Avg solve (h): ${overview.avgSolveHours ?? "-"}<br>
          CSAT: ${overview.avgCsat ?? "-"}
        </div>
      </div>
    `;
  }

  const agentsBox = $("slaAgentsBox");
  if (agentsBox) {
    agentsBox.innerHTML = "";
    agents.forEach((a) => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">${escapeHtml(a.agentName)}</div>
        <div class="muted small">Handled: ${a.handled} • Solved: ${a.solved}</div>
      `;
      agentsBox.appendChild(div);
    });
  }

  // Trend text (enkel)
  const hint = $("slaTrendHint");
  if (hint) hint.textContent = `Trendpunkter: ${trend.length}`;

  // Om chart.js finns, rendera enkel chart
  if (window.Chart && $("slaTrendChart")) {
    const ctx = $("slaTrendChart").getContext("2d");
    if (window.__slaChart) window.__slaChart.destroy();

    window.__slaChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: trend.map((r) => r.week),
        datasets: [
          { label: "Total", data: trend.map((r) => r.total) },
          { label: "Solved", data: trend.map((r) => r.solved) },
        ],
      },
    });
  }
}

/* =========================
   Billing
========================= */
async function loadBilling() {
  const data = await api("/billing/history?companyId=" + encodeURIComponent(state.companyId));
  const list = $("billingHistoryList");
  if (!list) return;

  list.innerHTML = "";
  const invoices = data.invoices || [];

  if (invoices.length === 0) {
    list.innerHTML = "<div class='muted small'>Inga fakturor ännu.</div>";
  } else {
    invoices.forEach((inv) => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(inv.status || "ok")} – ${escapeHtml(String(inv.amount_due || 0))}
        </div>
      `;
      list.appendChild(div);
    });
  }
}

async function upgradeToPro() {
  const res = await api("/billing/create-checkout", {
    method: "POST",
    body: { plan: "pro", companyId: state.companyId },
  });
  if (res?.url) window.location.href = res.url;
}

/* =========================
   Admin
========================= */
async function loadAdminUsers() {
  const list = $("adminUsersList");
  if (!list) return;

  const users = await api("/admin/users");
  list.innerHTML = "";

  users.forEach((u) => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTitle">${escapeHtml(u.username)} <span class="pill">${escapeHtml(u.role)}</span></div>
      <div class="muted small">${escapeHtml(u.email || "-")}</div>
    `;
    list.appendChild(div);
  });
}

/* =========================
   CRM Admin (admin)
========================= */
async function refreshCustomers() {
  const list = $("customersList");
  if (!list) return;

  const companies = await api("/admin/companies"); // ADMIN LIST
  list.innerHTML = "";

  companies.forEach((c) => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTitle">
        ${escapeHtml(c.displayName)} (${escapeHtml(c.companyId)})
        <span class="pill">${escapeHtml(c.status)}</span>
      </div>
      <div class="muted small">
        Plan: ${escapeHtml(String(c.plan || "bas")).toUpperCase()} • ${escapeHtml(c.contactEmail || "-")}
      </div>
    `;
    list.appendChild(div);
  });
}

async function createCompany() {
  const displayName = $("newCompanyDisplayName")?.value?.trim() || "";
  const orgNr = $("newCompanyOrgNr")?.value?.trim() || "";
  const email = $("newCompanyContactEmail")?.value?.trim() || "";
  const plan = $("newCompanyPlan")?.value || "bas";

  if (!displayName || !email) return toast("Saknas", "Namn och email krävs", "error");

  await api("/admin/companies", {
    method: "POST",
    body: { displayName, orgNumber: orgNr, contactEmail: email, plan },
  });

  toast("Skapat", "Ny kund skapad ✅", "info");
  await refreshCustomers();
}

/* =========================
   Customer settings
========================= */
async function loadCustomerSettings() {
  const settings = await api("/company/settings?companyId=" + encodeURIComponent(state.companyId));
  $("custGreeting").value = settings.greeting || "";
  $("custTone").value = settings.tone || "professional";
  $("custWidgetColor").value = settings.widgetColor || "#0066cc";
}

async function saveCustomerSettings() {
  const settings = {
    greeting: $("custGreeting")?.value?.trim() || "",
    tone: $("custTone")?.value || "professional",
    widgetColor: $("custWidgetColor")?.value || "#0066cc",
  };

  await api("/company/settings", {
    method: "PATCH",
    body: { companyId: state.companyId, settings },
  });

  toast("Sparat", "Inställningar uppdaterade ✅", "info");
}

async function simulateSettings() {
  const previewBox = $("settingsSimulator");
  if (!previewBox) return;

  const res = await api("/company/simulator", {
    method: "POST",
    body: { companyId: state.companyId, message: "Hej, hur fungerar er tjänst?" },
  });

  const p = res.preview;
  previewBox.innerHTML = `
    <div class="msg ai" style="border:1px solid ${p.widgetColor}; border-radius:12px; padding:12px;">
      ${escapeHtml(p.greeting)}<br><br>
      Exempelsvar: ${escapeHtml(p.replyExample)}
    </div>
  `;
}

/* =========================
   Events
========================= */
function bindEvents() {
  const on = (id, event, fn) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener(event, fn);
  };

  on("themeToggle", "click", toggleTheme);

  on("toggleDebugBtn", "click", () => {
    state.debug = !state.debug;
    const p = $("debugPanel");
    if (p) p.style.display = state.debug ? "" : "none";
    renderDebug();
  });

  on("loginBtn", "click", doLogin);
  on("registerBtn", "click", doRegister);
  on("logoutBtn", "click", doLogout);

  on("openChatView", "click", () => showView(state.me ? "chatView" : "authView", "openChatView"));

  on("openMyTicketsView", "click", async () => {
    if (!state.me) return showView("authView", "openChatView");
    showView("myTicketsView", "openMyTicketsView");
    await refreshMyTickets();
  });

  on("myTicketsRefreshBtn", "click", refreshMyTickets);
  on("myTicketReplyBtn", "click", replyMyTicket);

  // ✅ INBOX
  on("openInboxView", "click", async () => {
    showView("inboxView", "openInboxView");
    await loadInboxTickets();
  });

  on("inboxRefreshBtn", "click", loadInboxTickets);
  on("setStatusOpen", "click", () => setInboxStatus("open"));
  on("setStatusPending", "click", () => setInboxStatus("pending"));
  on("setStatusSolved", "click", () => setInboxStatus("solved"));
  on("setPriorityBtn", "click", setInboxPriority);
  on("sendAgentReplyInboxBtn", "click", sendAgentReplyInbox);

  // ✅ SLA
  on("openSlaView", "click", async () => {
    showView("slaView", "openSlaView");
    await loadSlaDashboard();
  });

  on("slaRefreshBtn", "click", loadSlaDashboard);
  on("slaDaysSelect", "change", loadSlaDashboard);

  // ✅ ADMIN
  on("openAdminView", "click", async () => {
    showView("adminView", "openAdminView");
    await loadAdminUsers();
  });

  on("adminUsersRefreshBtn", "click", loadAdminUsers);

  // ✅ CRM
  on("openCustomerAdminView", "click", async () => {
    showView("customerAdminView", "openCustomerAdminView");
    await refreshCustomers();
  });
  on("refreshCustomersBtn", "click", refreshCustomers);
  on("createCompanyBtn", "click", createCompany);

  // ✅ Billing
  on("openBillingView", "click", async () => {
    showView("billingView", "openBillingView");
    await loadBilling();
  });
  on("upgradeToProBtn", "click", upgradeToPro);

  // ✅ Customer settings
  on("openCustomerSettingsView", "click", async () => {
    showView("customerSettingsView", "openCustomerSettingsView");
    await loadCustomerSettings();
    await simulateSettings();
  });
  on("saveCustomerSettingsBtn", "click", saveCustomerSettings);

  // Chat send
  on("sendBtn", "click", sendChat);
  on("messageInput", "keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
}

/* =========================
   Init
========================= */
async function init() {
  loadTheme();
  bindEvents();
  renderDebug();

  await loadMe();
  updateRoleUI();

  if (state.me) {
    await loadCompanies();
    await bootstrapAfterLogin();
  } else {
    showView("authView", "openChatView");
  }
}

init().catch((e) => {
  toast("Init-fel", e?.message || "Okänt fel", "error");
});
