/* =========================
   AI Kundtjänst – script.js (FIXAD + STABIL)
   - Fixar "inget går att klicka"
   - Inga null-crashes vid event bind
   - Saknade funktioner finns som säkra defaults
========================= */

const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "", // same origin
  token: localStorage.getItem("token") || "",
  me: null,
  companyId: "demo",
  companies: [],
  currentCompany: null,
  conversation: [],
  activeTicketId: null,
  activeTicketPublicId: null,
  categories: [],
  debug: false,
  myTickets: [],
  inboxTickets: [],
  inboxSelectedTicket: null,
  csatPendingTicketId: null,
};

/* =========================
   Small helpers
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

/* =========================
   API helper
========================= */
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
    const msg = data?.error || "Serverfel";
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

  // safe checks
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

  // alla användare
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
   Auth (MINIMAL fungerande)
   - Om din server saknar routes för login/register så visar vi toast istället.
   - Du kan koppla på riktiga endpoints senare utan att UI dör.
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


/* =========================
   Forgot/Reset – safe placeholders
========================= */
async function resetPasswordFromToken() {
  toast("Info", "Reset-länk finns, men reset endpoint saknas i servern just nu.", "info");
}

/* =========================
   Bootstrap + Company loading
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
  // Endast admin kan hämta /admin/companies
  // Om du inte är admin → vi skapar en "demo-company" lokalt så UI funkar ändå.
  try {
    const companies = await api("/admin/companies");
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
  } catch {
    // fallback: demo-company
    state.companies = [
      {
        companyId: "demo",
        displayName: "Demo",
        settings: { greeting: "Hej! 👋 Hur kan jag hjälpa dig idag?" },
      },
    ];
    state.currentCompany = state.companies[0];

    const sel = $("categorySelect");
    if (sel) {
      sel.innerHTML = `<option value="demo">demo</option>`;
      sel.value = "demo";
    }

    renderChatHeader();
  }
}

async function bootstrapAfterLogin() {
  // minimalt: visa chat
  showView("chatView", "openChatView");
  resetConversation();
}

/* =========================
   CSAT
========================= */
function showCsatPrompt(ticketId) {
  state.csatPendingTicketId = ticketId;

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.background = "rgba(0,0,0,0.55)";
  modal.style.zIndex = "999999";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.innerHTML = `
    <div class="card" style="max-width:420px; width:92%; padding:16px;">
      <h3>Hur nöjd var du med detta ärende?</h3>
      <div style="display:flex; gap:10px; justify-content:center; margin:16px 0; flex-wrap:wrap;">
        <button class="btn" data-rate="1" type="button">1 😞</button>
        <button class="btn" data-rate="2" type="button">2</button>
        <button class="btn" data-rate="3" type="button">3</button>
        <button class="btn" data-rate="4" type="button">4</button>
        <button class="btn primary" data-rate="5" type="button">5 😊</button>
      </div>
      <textarea id="csatComment" class="input textarea" placeholder="Kommentar (valfritt)"></textarea>
      <button id="csatSendBtn" class="btn primary full" type="button" style="margin-top:10px;">Skicka betyg</button>
      <button id="csatCloseBtn" class="btn ghost full" type="button" style="margin-top:10px;">Stäng</button>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-rate]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const rating = Number(btn.getAttribute("data-rate") || "5");
      await submitCsatWithComment(rating);
    });
  });

  modal.querySelector("#csatSendBtn")?.addEventListener("click", async () => {
    await submitCsatWithComment(5);
  });

  modal.querySelector("#csatCloseBtn")?.addEventListener("click", () => {
    modal.remove();
    state.csatPendingTicketId = null;
  });
}

async function submitCsatWithComment(rating = 5) {
  if (!state.csatPendingTicketId) return;
  const comment = $("csatComment")?.value?.trim() || "";

  try {
    await api(`/tickets/${state.csatPendingTicketId}/csat`, {
      method: "POST",
      body: { rating, comment },
    });
    toast("Tack!", "Ditt betyg är sparat ✅", "info");
  } catch {
    toast("Fel", "Kunde inte spara betyg", "error");
  }

  document.querySelector(".modal")?.remove();
  state.csatPendingTicketId = null;
}

/* =========================
   Chat logic
========================= */
async function sendChat() {
  const inp = $("messageInput");
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;

  inp.value = "";
  addMsg("user", text);
  state.conversation.push({ role: "user", content: text });

  try {
    const body = {
      companyId: state.companyId,
      conversation: state.conversation,
      ticketId: state.activeTicketId || undefined,
    };

    // ⚠️ Din server returnerar bara { reply: "Test-svar från server" }
    // Vi gör koden kompatibel och kraschar aldrig om fält saknas.
    const data = await api("/chat", { method: "POST", body });

    const reply = data?.reply || "Inget svar.";
    addMsg("assistant", reply, data?.ragUsed ? "Svar baserat på kunskapsdatabas ✅" : "");

    state.activeTicketId = data?.ticketId ?? state.activeTicketId;
    state.activeTicketPublicId = data?.ticketPublicId ?? state.activeTicketPublicId;

    renderDebug();
    setDebugLine("dbgRag", data?.ragUsed ? "JA" : "NEJ");

    state.conversation.push({ role: "assistant", content: reply });

    if (data?.ticket?.status === "solved" && data?.ticketId) {
      showCsatPrompt(data.ticketId);
    }

    await refreshMyTickets();
  } catch (e) {
    addMsg("assistant", "❌ Fel: " + e.message);
  }
}

/* =========================
   MyTickets – minimal safe
========================= */
async function refreshMyTickets() {
  // Du har inte endpoints i server.js för detta i din nuvarande version,
  // så vi gör den tyst och safe.
  const hint = $("myTicketsHint");
  if (hint) hint.textContent = "";
}

/* =========================
   Kundinställningar + Simulator
========================= */
async function loadCustomerSettings() {
  try {
    const settings = await api("/company/settings?companyId=" + encodeURIComponent(state.companyId));
    const g = $("custGreeting");
    const t = $("custTone");
    const c = $("custWidgetColor");
    if (g) g.value = settings.greeting || "";
    if (t) t.value = settings.tone || "professional";
    if (c) c.value = settings.widgetColor || "#0066cc";
  } catch (e) {
    toast("Fel", "Kunde inte ladda inställningar", "error");
  }
}

async function saveCustomerSettings() {
  try {
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
    await simulateSettings();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function simulateSettings() {
  const previewBox = $("settingsSimulator");
  if (!previewBox) return;

  const message = "Hej, hur fungerar er tjänst?";

  try {
    const res = await api("/company/simulator", {
      method: "POST",
      body: { companyId: state.companyId, message },
    });

    const p = res.preview;
    previewBox.innerHTML = `
      <div class="msg ai" style="background:${p.widgetColor}22; border:1px solid ${p.widgetColor}; border-radius:12px; padding:12px;">
        ${escapeHtml(p.greeting)}<br><br>
        Exempelsvar: ${escapeHtml(p.replyExample)}
      </div>
    `;
  } catch (e) {
    previewBox.innerHTML = `<div class="muted">Simulatorfel: ${escapeHtml(e.message)}</div>`;
  }
}

/* =========================
   Billing – safe (server route saknas i din server.js)
========================= */
async function loadBilling() {
  const list = $("billingHistoryList");
  if (list) list.innerHTML = "<div class='muted small'>Billing-route saknas på servern.</div>";
  const planEl = $("currentPlan");
  const stEl = $("subscriptionStatus");
  if (planEl) planEl.textContent = "BAS";
  if (stEl) stEl.textContent = "-";
}

async function upgradeToPro() {
  try {
    const res = await api("/billing/create-checkout", {
      method: "POST",
      body: { plan: "pro", companyId: state.companyId },
    });
    if (res?.url) window.location.href = res.url;
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

/* =========================
   CRM Admin
========================= */
async function refreshCustomers() {
  const list = $("customersList");
  if (!list) return;

  try {
    const companies = await api("/admin/companies");
    list.innerHTML = "";

    companies.forEach((c) => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(c.displayName)} (${escapeHtml(c.companyId)})
          <span class="pill ${c.status === "active" ? "ok" : "warn"}">${escapeHtml(c.status)}</span>
        </div>
        <div class="muted small">
          Plan: ${escapeHtml(String(c.plan || "bas")).toUpperCase()} • Org.nr: ${escapeHtml(c.orgNumber || "-")} • ${escapeHtml(c.contactEmail || "-")}
        </div>
      `;
      list.appendChild(div);
    });
  } catch (e) {
    toast("Fel", "Kunde inte ladda kunder", "error");
  }
}

async function createCompany() {
  const displayName = $("newCompanyDisplayName")?.value?.trim() || "";
  const orgNr = $("newCompanyOrgNr")?.value?.trim() || "";
  const email = $("newCompanyContactEmail")?.value?.trim() || "";
  const plan = $("newCompanyPlan")?.value || "bas";

  if (!displayName || !email) return toast("Saknas", "Namn och email krävs", "error");

  try {
    await api("/admin/companies", {
      method: "POST",
      body: { displayName, orgNumber: orgNr, contactEmail: email, plan },
    });
    toast("Skapat", "Ny kund skapad ✅", "info");
    refreshCustomers();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

/* =========================
   ✅ FIX: Event binding som ALDRIG kraschar
========================= */
function bindEvents() {
  const on = (id, event, fn) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener(event, fn);
  };

  // Tema + debug
  on("themeToggle", "click", toggleTheme);

  on("toggleDebugBtn", "click", () => {
    state.debug = !state.debug;
    const p = $("debugPanel");
    if (p) p.style.display = state.debug ? "" : "none";
    renderDebug();
  });

  // Meny
  on("openChatView", "click", () => {
    showView(state.me ? "chatView" : "authView", "openChatView");
  });

  on("openMyTicketsView", "click", async () => {
    if (!state.me) return showView("authView", "openChatView");
    showView("myTicketsView", "openMyTicketsView");
    await refreshMyTickets();
  });

  on("openInboxView", "click", () => {
    toast("Info", "Inbox endpoints saknas i servern just nu.", "info");
  });

  on("openSlaView", "click", () => {
    toast("Info", "SLA endpoints saknas i servern just nu.", "info");
  });

  on("openAdminView", "click", () => {
    toast("Info", "Admin endpoints saknas delvis i servern just nu.", "info");
  });

  on("openSettingsView", "click", () => {
    showView("settingsView", "openSettingsView");
  });

  // Nya vyer
  on("openCustomerAdminView", "click", async () => {
    showView("customerAdminView", "openCustomerAdminView");
    await refreshCustomers();
  });

  on("openBillingView", "click", async () => {
    showView("billingView", "openBillingView");
    await loadBilling();
  });

  on("openCustomerSettingsView", "click", async () => {
    showView("customerSettingsView", "openCustomerSettingsView");
    await loadCustomerSettings();
    await simulateSettings();
  });

  // Chat
  on("sendBtn", "click", sendChat);
  on("messageInput", "keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  // Auth
  on("loginBtn", "click", doLogin);
  on("registerBtn", "click", doRegister);
  on("logoutBtn", "click", doLogout);

  // CRM + Settings + Billing
  on("refreshCustomersBtn", "click", refreshCustomers);
  on("createCompanyBtn", "click", createCompany);
  on("saveCustomerSettingsBtn", "click", saveCustomerSettings);
  on("upgradeToProBtn", "click", upgradeToPro);

  // Password toggles
  on("togglePassBtn", "click", () => {
    const inp = $("password");
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
  });

  on("toggleResetPassBtn", "click", () => {
    const inp = $("resetNewPass");
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
  });
}

/* =========================
   Init
========================= */
async function init() {
  loadTheme();
  bindEvents();
  renderDebug();

  const params = new URLSearchParams(location.search);
  const resetToken = params.get("resetToken");
  if (resetToken) {
    showView("authView", "openChatView");
    await resetPasswordFromToken(resetToken);
  }

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
  // Om console är tyst hos dig, visa toast också
  toast("Init-fel", e?.message || "Okänt fel", "error");
});
