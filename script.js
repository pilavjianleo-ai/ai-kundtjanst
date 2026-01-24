/* =========================
   AI Kundtjänst – script.js (full uppdatering 2025)
   Kompatibel med uppdaterad server.js
========================= */

const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "", // same origin
  token: localStorage.getItem("token") || "",
  me: null,
  companyId: "demo",          // default
  companies: [],              // NY: lista över kundföretag
  currentCompany: null,       // NY: vald kunds data
  conversation: [],
  activeTicketId: null,
  activeTicketPublicId: null,
  categories: [],
  debug: false,
  myTickets: [],
  inboxTickets: [],
  inboxSelectedTicket: null,
  csatPendingTicketId: null,  // NY: för att visa CSAT efter solved
};

/* =========================
   Small helpers (oförändrade + små tillägg)
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
   API helper (oförändrad)
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
   Views (uppdaterad med nya vyer)
========================= */
function hideAllViews() {
  const views = [
    "authView", "chatView", "myTicketsView", "inboxView", 
    "adminView", "settingsView", "slaView",
    "customerAdminView", "billingView", "customerSettingsView"  // NYA
  ];
  views.forEach(v => {
    const el = $(v);
    if (el) el.style.display = "none";
  });
}

function setActiveMenu(btnId) {
  const ids = [
    "openChatView", "openMyTicketsView", "openInboxView", 
    "openAdminView", "openSettingsView", "openSlaView",
    "openCustomerAdminView", "openBillingView", "openCustomerSettingsView"  // NYA
  ];
  ids.forEach(id => $(id)?.classList.remove("active"));
  $(btnId)?.classList.add("active");
}

function showView(viewId, menuBtnId) {
  hideAllViews();
  $(viewId).style.display = "";
  if (menuBtnId) setActiveMenu(menuBtnId);
}

function updateRoleUI() {
  const role = state.me?.role || "";
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");
  const settingsBtn = $("openSettingsView");

  if (!state.me) {
    roleBadge.textContent = "Inte inloggad";
    logoutBtn.style.display = "none";
    settingsBtn.style.display = "none";
    $("openInboxView").style.display = "none";
    $("openSlaView").style.display = "none";
    $("openAdminView").style.display = "none";
    $("openCustomerAdminView").style.display = "none";
    $("openBillingView").style.display = "none";
    $("openCustomerSettingsView").style.display = "none";
    $("slaClearAllStatsBtn").style.display = "none";
    return;
  }

  roleBadge.textContent = `${state.me.username} (${role})`;
  logoutBtn.style.display = "";
  settingsBtn.style.display = "";

  if (role === "admin" || role === "agent") {
    $("openInboxView").style.display = "";
    $("openSlaView").style.display = "";
  }
  if (role === "admin") {
    $("openAdminView").style.display = "";
    $("openCustomerAdminView").style.display = "";
    $("slaClearAllStatsBtn").style.display = "";
  }
  // Alla användare får se billing & egna inställningar
  $("openBillingView").style.display = "";
  $("openCustomerSettingsView").style.display = "";
}

/* =========================
   Theme & Debug (oförändrade)
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
   Chat UI (oförändrad kärna)
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
  avatar.innerHTML = role === "user" ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-robot"></i>`;

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

function resetConversation() {
  state.conversation = [];
  state.activeTicketId = null;
  state.activeTicketPublicId = null;
  clearMessages();
  addMsg("assistant", state.currentCompany?.settings?.greeting || "Hej! 👋 Vad kan jag hjälpa dig med?");
  renderDebug();
}

/* =========================
   Auth & Logout (oförändrade)
========================= */
// ... doLogin, doRegister, doLogout, forgot/reset etc. oförändrade ...

/* =========================
   Bootstrap + Company loading (UPPDATERAD)
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
  try {
    const companies = await api("/admin/companies");
    state.companies = companies || [];
    
    const sel = $("categorySelect"); // återanvänder befintlig dropdown
    if (sel) {
      sel.innerHTML = "";
      companies.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.companyId;
        opt.textContent = `${c.companyId} - ${c.displayName}`;
        sel.appendChild(opt);
      });
      sel.value = state.companyId;
    }

    // Sätt default/current company
    state.currentCompany = companies.find(c => c.companyId === state.companyId) || companies[0];
    if (state.currentCompany) state.companyId = state.currentCompany.companyId;

    renderChatHeader();
  } catch (e) {
    console.error("Kunde inte ladda företag:", e);
  }
}

function renderChatHeader() {
  const c = state.currentCompany;
  $("chatTitle").textContent = c ? `AI Kundtjänst – ${c.displayName}` : "AI Kundtjänst";
}

/* =========================
   NY: CSAT efter solved ticket
========================= */
function showCsatPrompt(ticketId) {
  state.csatPendingTicketId = ticketId;
  const modal = document.createElement("div");
  modal.className = "modal" // lägg till enkel CSS längst ner i style.css om behövs
  modal.innerHTML = `
    <div class="card" style="max-width:420px; margin:20vh auto;">
      <h3>Hur nöjd var du med detta ärende?</h3>
      <div style="display:flex; gap:12px; justify-content:center; margin:20px 0;">
        <button class="btn" onclick="submitCsat(1)">1 😞</button>
        <button class="btn" onclick="submitCsat(2)">2</button>
        <button class="btn" onclick="submitCsat(3)">3</button>
        <button class="btn" onclick="submitCsat(4)">4</button>
        <button class="btn primary" onclick="submitCsat(5)">5 😊</button>
      </div>
      <textarea id="csatComment" class="input textarea" placeholder="Kommentar (valfritt)"></textarea>
      <button class="btn primary full" onclick="submitCsatWithComment()">Skicka betyg</button>
    </div>
  `;
  document.body.appendChild(modal);
}

window.submitCsat = async function(rating) {
  await submitCsatWithComment(rating);
};

window.submitCsatWithComment = async function(rating = null) {
  if (!state.csatPendingTicketId) return;
  const comment = $("csatComment")?.value?.trim() || "";

  try {
    await api(`/tickets/${state.csatPendingTicketId}/csat`, {
      method: "POST",
      body: { rating: rating || 5, comment }
    });
    toast("Tack!", "Ditt betyg är sparat ✅");
  } catch (e) {
    toast("Fel", "Kunde inte spara betyg");
  }

  // Ta bort modal
  document.querySelector(".modal")?.remove();
  state.csatPendingTicketId = null;
};

/* =========================
   Chat logic (uppdaterad för companyId)
========================= */
async function sendChat() {
  const inp = $("messageInput");
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

    const data = await api("/chat", { method: "POST", body });

    state.activeTicketId = data.ticketId;
    state.activeTicketPublicId = data.ticketPublicId;

    renderDebug();
    setDebugLine("dbgRag", data.ragUsed ? "JA" : "NEJ");

    const reply = data.reply || "Inget svar.";
    addMsg("assistant", reply, data.ragUsed ? "Svar baserat på kunskapsdatabas ✅" : "");
    state.conversation.push({ role: "assistant", content: reply });

    // NY: Kolla om ticket blev solved → visa CSAT
    if (data.ticket && data.ticket.status === "solved") {
      showCsatPrompt(data.ticketId);
    }

    await refreshMyTickets();
  } catch (e) {
    addMsg("assistant", "❌ Fel: " + e.message);
  }
}

// ... exportChat, clearChat, newTicket oförändrade ...

/* =========================
   NY: Kundinställningar + Simulator
========================= */
async function loadCustomerSettings() {
  try {
    const settings = await api("/company/settings?companyId=" + state.companyId);
    $("custGreeting").value = settings.greeting || "";
    $("custTone").value = settings.tone || "professional";
    $("custWidgetColor").value = settings.widgetColor || "#0066cc";
  } catch (e) {
    toast("Fel", "Kunde inte ladda inställningar");
  }
}

async function saveCustomerSettings() {
  try {
    const settings = {
      greeting: $("custGreeting").value.trim(),
      tone: $("custTone").value,
      widgetColor: $("custWidgetColor").value,
    };

    await api("/company/settings", {
      method: "PATCH",
      body: { companyId: state.companyId, settings }
    });

    toast("Sparat", "Inställningar uppdaterade ✅");

    // Uppdatera simulator live
    simulateSettings();
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function simulateSettings() {
  const previewBox = $("settingsSimulator");
  if (!previewBox) return;

  const message = "Hej, hur fungerar er tjänst?";

  try {
    const res = await api("/company/simulator", {
      method: "POST",
      body: { companyId: state.companyId, message }
    });

    const p = res.preview;
    previewBox.innerHTML = `
      <div class="msg ai" style="background:${p.widgetColor}22; border-color:${p.widgetColor};">
        ${escapeHtml(p.greeting)}<br><br>
        Exempelsvar: ${escapeHtml(p.replyExample)}
      </div>
    `;
  } catch (e) {
    previewBox.innerHTML = `<div class="muted">Simulatorfel: ${e.message}</div>`;
  }
}

/* =========================
   NY: Billing & Abonnemang
========================= */
async function loadBilling() {
  try {
    const data = await api("/billing/history?companyId=" + state.companyId);
    const list = $("billingHistoryList");
    list.innerHTML = "";

    if (data.invoices.length === 0) {
      list.innerHTML = "<div class='muted small'>Inga fakturor ännu.</div>";
      return;
    }

    data.invoices.forEach(inv => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${inv.status === "paid" ? "Betald" : "Obetald"} – ${inv.amount_due / 100} SEK
          <span style="margin-left:auto">${new Date(inv.created * 1000).toLocaleDateString()}</span>
        </div>
      `;
      list.appendChild(div);
    });

    // Hämta aktuell plan/status från company (via loadCompanies eller separat)
    const company = state.currentCompany || await api("/company/settings?companyId=" + state.companyId);
    $("currentPlan").textContent = company.plan?.toUpperCase() || "BAS";
    $("subscriptionStatus").textContent = company.status || "okänd";
  } catch (e) {
    toast("Fel", "Kunde inte ladda fakturor");
  }
}

async function upgradeToPro() {
  try {
    const res = await api("/billing/create-checkout", {
      method: "POST",
      body: { plan: "pro", companyId: state.companyId }
    });
    window.location.href = res.url;
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* =========================
   NY: Kund-CRM Admin-vy
========================= */
async function refreshCustomers() {
  const list = $("customersList");
  if (!list) return;

  try {
    const companies = await api("/admin/companies");
    list.innerHTML = "";

    companies.forEach(c => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(c.displayName)} (${c.companyId})
          <span class="pill ${c.status === "active" ? "ok" : "warn"}">${c.status}</span>
        </div>
        <div class="muted small">
          Plan: ${c.plan.toUpperCase()} • Org.nr: ${c.orgNumber || "-"} • ${c.contactEmail}
        </div>
      `;
      list.appendChild(div);
    });
  } catch (e) {
    toast("Fel", "Kunde inte ladda kunder");
  }
}

async function createCompany() {
  const displayName = $("newCompanyDisplayName").value.trim();
  const orgNr = $("newCompanyOrgNr").value.trim();
  const email = $("newCompanyContactEmail").value.trim();
  const plan = $("newCompanyPlan").value;

  if (!displayName || !email) return toast("Saknas", "Namn och email krävs");

  try {
    await api("/admin/companies", {
      method: "POST",
      body: { displayName, orgNumber: orgNr, contactEmail: email, plan }
    });
    toast("Skapat", "Ny kund skapad ✅");
    refreshCustomers();
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* =========================
   Events – utökade med nya knappar/vyer
========================= */
function bindEvents() {
  // ... alla dina befintliga events ...

  // NYA events
  $("openCustomerAdminView").onclick = async () => {
    showView("customerAdminView", "openCustomerAdminView");
    await refreshCustomers();
  };

  $("openBillingView").onclick = async () => {
    showView("billingView", "openBillingView");
    await loadBilling();
  };

  $("openCustomerSettingsView").onclick = async () => {
    showView("customerSettingsView", "openCustomerSettingsView");
    await loadCustomerSettings();
    simulateSettings();
  };

  $("refreshCustomersBtn").onclick = refreshCustomers;
  $("createCompanyBtn").onclick = createCompany;

  $("saveCustomerSettingsBtn").onclick = saveCustomerSettings;
  $("upgradeToProBtn").onclick = upgradeToPro;

  // ... fortsätt med dina befintliga ...
}

/* =========================
   Init (uppdaterad)
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
    await loadCompanies();           // NY
    await bootstrapAfterLogin();
  } else {
    showView("authView", "openChatView");
  }
}

init().catch(e => {
  console.error(e);
  toast("Init-fel", e.message);
});