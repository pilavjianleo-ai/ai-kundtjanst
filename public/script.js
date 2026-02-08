/* =========================
   AI Kundtjänst – script.js (FULL FUNK)
   - Fixar klick
   - Kopplar Admin / Inbox / SLA endpoints
   - Kopplar My Tickets
========================= */

const $ = (id) => document.getElementById(id);

// Toggle password visibility
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const btn = input?.parentElement?.querySelector('button i');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.className = 'fa-solid fa-eye-slash';
  } else {
    input.type = 'password';
    if (btn) btn.className = 'fa-solid fa-eye';
  }
}


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
  currentView: "chatView",
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
  if (auth && state.token) {
    headers["Authorization"] = "Bearer " + state.token;
  } else if (auth && !state.token) {
    // If auth is required but no token, we might want to skip or handle it silently
    // For now, let's just proceed, but this is where we could redirect to login
  }

  const res = await fetch(state.apiBase + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch { }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      console.warn("Session ogiltig eller utgången (401). Loggar ut...");
      if (typeof doLogout === 'function') doLogout();
    }
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
    "simulatorView",
    "feedbackView",
    "scenarioView",
    "salesView",
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
    "openSimulatorView",
    "openFeedbackView",
    "openScenarioView",
    "openSalesView",
  ];
  ids.forEach((id) => $(id)?.classList.remove("active"));
  $(btnId)?.classList.add("active");
}

function showView(viewId, menuBtnId) {
  state.currentView = viewId;
  hideAllViews();
  const v = $(viewId);
  if (v) v.style.display = "";
  if (menuBtnId) setActiveMenu(menuBtnId);

  if (viewId === "inboxView") {
    const dot = $("inboxNotifDot");
    if (dot) dot.style.display = "none";
    loadInboxTickets();
  }
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
  const simulatorBtn = $("openSimulatorView");
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
    if (simulatorBtn) simulatorBtn.style.display = "none";
    if (slaClearAllStatsBtn) slaClearAllStatsBtn.style.display = "none";
    return;
  }

  if (roleBadge) roleBadge.textContent = `${state.me.username} (${role})`;
  if (logoutBtn) logoutBtn.style.display = "";
  if (settingsBtn) settingsBtn.style.display = "";

  // Simulator is available for all logged-in users
  if (simulatorBtn) simulatorBtn.style.display = "";

  if (role === "admin" || role === "agent") {
    if (inboxBtn) inboxBtn.style.display = "";
    if (slaBtn) slaBtn.style.display = "";
    const feedbackBtn = $("openFeedbackView");
    if (feedbackBtn) feedbackBtn.style.display = "";
    const scenarioBtn = $("openScenarioView");
    if (scenarioBtn) scenarioBtn.style.display = "";
    const salesBtn = $("openSalesView");
    if (salesBtn) salesBtn.style.display = "";
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
  const cur = b.getAttribute("data-theme") || "light";
  b.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  localStorage.setItem("theme", b.getAttribute("data-theme"));
}

function loadTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.body.setAttribute("data-theme", saved);
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

  // Smooth entrance
  msg.style.opacity = "0";
  msg.style.transform = "translateY(10px)";
  setTimeout(() => {
    msg.style.transition = "all 0.3s ease";
    msg.style.opacity = "1";
    msg.style.transform = "translateY(0)";
  }, 10);

  wrap.scrollTop = wrap.scrollHeight;
}

function showTyping() {
  const wrap = $("messages");
  if (!wrap || $("typingIndicator")) return;

  const div = document.createElement("div");
  div.id = "typingIndicator";
  div.className = "msg ai";
  div.innerHTML = `
        <div class="avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="bubble typing">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    `;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function hideTyping() {
  const el = $("typingIndicator");
  if (el) el.remove();
}

function renderSuggestions(list) {
  const box = $("suggestions");
  if (!box) return;
  box.innerHTML = "";
  list.forEach(text => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = text;
    chip.onclick = () => {
      $("messageInput").value = text;
      sendChat();
    };
    box.appendChild(chip);
  });
}

function renderChatHeader() {
  const c = state.currentCompany;
  const titleEl = $("chatTitle");
  const subtitleEl = $("chatSubtitle");

  if (titleEl) {
    titleEl.textContent = c ? `AI Kundtjänst – ${c.displayName}` : "AI Kundtjänst";
  }

  if (subtitleEl) {
    if (c) {
      subtitleEl.innerHTML = `<i class="fa-solid fa-building" style="margin-right:5px;"></i> Kunskapsbas: <b>${c.displayName}</b> (${c.companyId})`;
    } else {
      subtitleEl.textContent = "Ställ en fråga så hjälper jag dig direkt.";
    }
  }
}

function resetConversation() {
  state.conversation = [];
  state.activeTicketId = null;
  state.activeTicketPublicId = null;
  const name = state.me?.username || "vän";
  const companyName = state.currentCompany?.displayName || "vår tjänst";

  if ($("messages")) {
    $("messages").innerHTML = `
      <div class="introCard" id="chatIntro">
        <div class="introIcon"><i class="fa-solid fa-robot"></i></div>
        <h3>Välkommen till ${companyName}</h3>
        <p>Jag är din intelligenta assistent, redo att hjälpa dig dygnet runt. Hur kan jag underlätta för dig idag?</p>
      </div>
    `;
  }

  const greeting = state.currentCompany?.settings?.greeting || `Hej ${name}! Roligt att se dig. Vad kan jag hjälpa till med idag?`;

  state.conversation.push({ role: "assistant", content: greeting });

  setTimeout(() => {
    addMsg("assistant", greeting);
    renderSuggestions(["Mina abonnemang", "Supportfrågor", "Prata med person"]);
  }, 400);

  const inp = $("messageInput");
  if (inp) inp.focus();
  renderDebug();
}

function clearChat() {
  if (confirm("Vill du rensa chatten?")) {
    clearMessages();
    state.conversation = [];
    toast("Rensat", "Chatthistoriken har rensats lokalt.", "info");
  }
}

async function sendFeedback(type) {
  if (!state.activeTicketId) return toast("Info", "Starta en konversation först", "info");
  const fbMsg = $("fbMsg");
  if (fbMsg) fbMsg.textContent = "Tack för din feedback! ❤️";
  toast("Tack", "Vi har tagit emot din feedback.", "info");
}

/* =========================
   Auth
========================= */
async function doLogin() {
  const usernameInput = $("username");
  const passwordInput = $("password");

  const username = usernameInput?.value?.trim();
  const password = passwordInput?.value?.trim();

  console.log("Login attempt for:", username);

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

  // Also populate KB select
  const kbSel = $("kbCategorySelect");
  if (kbSel) {
    kbSel.innerHTML = "";
    state.companies.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.companyId;
      opt.textContent = `${c.companyId} - ${c.displayName}`;
      kbSel.appendChild(opt);
    });
  }

  // Also populate Inbox category filter
  const inboxSel = $("inboxCategoryFilter");
  if (inboxSel) {
    inboxSel.innerHTML = '<option value="">Alla företag</option>';
    state.companies.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.companyId;
      opt.textContent = `${c.companyId} - ${c.displayName}`;
      inboxSel.appendChild(opt);
    });
  }

  state.currentCompany =
    state.companies.find((c) => c.companyId === state.companyId) || state.companies[0] || null;

  renderChatHeader();
}

/* Switch between companies */
async function switchCompany(newCompanyId) {
  if (!newCompanyId || newCompanyId === state.companyId) return;

  state.companyId = newCompanyId;
  state.currentCompany = state.companies.find((c) => c.companyId === newCompanyId) || null;

  // Update the selector if it doesn't match
  const sel = $("categorySelect");
  if (sel && sel.value !== newCompanyId) {
    sel.value = newCompanyId;
  }

  // Sync inbox filter with the selected company
  const inboxSel = $("inboxCategoryFilter");
  if (inboxSel) {
    inboxSel.value = newCompanyId;
  }

  // Clear the current conversation
  state.conversation = [];
  state.activeTicketId = null;
  state.activeTicketPublicId = null;

  // Update the chat header to reflect the new company
  renderChatHeader();

  // Show the intro card with the new company name
  const companyName = state.currentCompany?.displayName || newCompanyId;
  const messagesEl = $("messages");
  if (messagesEl) {
    messagesEl.innerHTML = `
      <div class="introCard" id="chatIntro" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 20px;">
        <div style="width:72px; height:72px; background:linear-gradient(135deg, var(--primary), var(--primary2)); border-radius:24px; display:flex; align-items:center; justify-content:center; margin-bottom:24px; box-shadow:0 12px 30px var(--primary-fade); animation: float 6s ease-in-out infinite;">
          <i class="fa-solid fa-robot" style="font-size:36px; color:white;"></i>
        </div>
        <h2 style="margin:0 0 12px 0; font-size:24px; font-weight:800; color:var(--text);">Välkommen till ${escapeHtml(companyName)}</h2>
        <p style="max-width:420px; line-height:1.6; color:var(--muted); font-size:15px; margin-bottom:30px;">
          Jag är din intelligenta assistent för ${escapeHtml(companyName)}, redo att hjälpa dig dygnet runt. Hur kan jag underlätta för dig idag?
        </p>
        
        <div class="suggestionChips" style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-bottom:20px;">
            <button type="button" class="btn ghost small" style="background:var(--panel); border:1px solid var(--border); border-radius:100px; padding:10px 18px; font-size:13px;" onclick="setChatInput('Hur fungerar det?')">Hur fungerar det?</button>
            <button type="button" class="btn ghost small" style="background:var(--panel); border:1px solid var(--border); border-radius:100px; padding:10px 18px; font-size:13px;" onclick="setChatInput('Vilka priser har ni?')">Vilka priser har ni?</button>
            <button type="button" class="btn ghost small" style="background:var(--panel); border:1px solid var(--border); border-radius:100px; padding:10px 18px; font-size:13px;" onclick="setChatInput('Prata med person')">Prata med person</button>
        </div>
        <style>@keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-6px); } 100% { transform: translateY(0px); } }</style>
      </div>
    `;
  }

  // Generate and show the company-specific greeting
  const greeting = state.currentCompany?.settings?.greeting ||
    `Hej! Välkommen till ${companyName}. Hur kan jag hjälpa dig idag?`;

  state.conversation.push({ role: "assistant", content: greeting });

  setTimeout(() => {
    // Restore the greeting bubble (user request)
    addMsg("assistant", greeting);

    // Hide default suggestions bar
    const sugg = $("suggestions");
    if (sugg) sugg.style.display = "none";
  }, 100);

  // Reload inbox if we're currently viewing it
  if (state.currentView === "inboxView") {
    await loadInboxTickets();
  }

  // Show notification
  toast("Företag bytt", `Nu aktiv: ${companyName}`, "info");

  renderDebug();
}

async function bootstrapAfterLogin() {
  showView("chatView", "openChatView");

  // Force update to ensure Intro Card renders (bypass early return in switchCompany)
  const current = state.companyId || 'demo';
  state.companyId = null;
  await switchCompany(current);
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

  // UI: Show typing
  showTyping();
  $("suggestions").style.display = "none";

  try {
    const data = await api("/chat", {
      method: "POST",
      body: {
        companyId: state.companyId,
        conversation: state.conversation,
        ticketId: state.activeTicketId || undefined,
        contactInfo: state.userContactInfo || (sessionStorage.getItem('contactInfo') ? JSON.parse(sessionStorage.getItem('contactInfo')) : undefined)
      },
    });

    // Simulate thinking delay for a more natural feel
    setTimeout(async () => {
      hideTyping();
      const reply = data.reply || "Jag ber om ursäkt, men jag kunde inte generera ett svar just nu.";
      addMsg("assistant", reply);
      state.conversation.push({ role: "assistant", content: reply });

      state.activeTicketId = data.ticketId || state.activeTicketId;
      state.activeTicketPublicId = data.publicTicketId || state.activeTicketPublicId;

      if (data.priority === "high") {
        toast("Systemmeddelande", "Detta ärende har markerats som hög prioritet för snabb hantering.", "warning");
      }

      renderDebug();
      await refreshMyTickets();

      // Show context-aware suggestions after reply
      if (reply.toLowerCase().includes("hjälpa")) {
        renderSuggestions(["Visa priser", "Teknisk support", "Boka demo"]);
      } else {
        renderSuggestions(["Tack!", "En fråga till", "Prata med agent"]);
      }
      $("suggestions").style.display = "flex";

      const inp = $("messageInput");
      if (inp) inp.focus();
    }, 1000);

  } catch (e) {
    hideTyping();
    addMsg("assistant", "❌ Fel: " + e.message);
  }
}

async function requestHumanHandoff() {
  const inp = $("messageInput");
  if (inp) {
    inp.value = "Jag vill prata med en person.";
    await sendChat();
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
      <div class="muted small">${escapeHtml(t.publicTicketId || "")}</div>
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
  } catch { }
}

async function renderMyTicketDetails(ticketId) {
  const box = $("myTicketDetails");
  if (!box) return;

  try {
    const t = await api("/tickets/" + ticketId);
    state.activeTicketId = t._id;
    state.activeTicketPublicId = t.publicTicketId;
    renderDebug();

    const msgs = (t.messages || [])
      .map((m) => `<div class="muted small"><b>${escapeHtml(m.role)}:</b> ${escapeHtml(m.content)}</div>`)
      .join("<br>");

    box.innerHTML = `
      <div><b>${escapeHtml(t.title || "Ärende")}</b></div>
      <div class="muted small">${escapeHtml(t.publicTicketId)} • ${escapeHtml(t.status)} • ${escapeHtml(t.priority)}</div>
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

  (state.inboxTickets || []).forEach((t) => {
    const div = document.createElement("div");
    const isHigh = t.priority === "high";
    const priClass = isHigh ? "danger" : t.priority === "low" ? "muted" : "info";

    div.className = "listItem " + (isHigh ? "important-highlight" : "");
    div.innerHTML = `
      <div class="listItemTitle">
        ${isHigh ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i> ' : ""}
        ${escapeHtml(t.title || "Ticket")}
        <span class="pill ${priClass}">${escapeHtml(t.priority || "normal")}</span>
        <span class="pill">${escapeHtml(t.status)}</span>
      </div>
      <div class="muted small">${escapeHtml(t.publicTicketId)} • ${escapeHtml(t.companyId)} • ${new Date(t.lastActivityAt).toLocaleString('sv-SE')}</div>
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

function filterInboxBySearch() {
  const query = $("inboxSearchInput")?.value?.toLowerCase()?.trim() || "";

  if (!query) {
    renderInboxList();
    return;
  }

  const list = $("inboxTicketsList");
  if (!list) return;
  list.innerHTML = "";

  const filtered = state.inboxTickets.filter(t => {
    const title = (t.title || "").toLowerCase();
    const publicId = (t.publicTicketId || "").toLowerCase();
    const company = (t.companyId || "").toLowerCase();
    return title.includes(query) || publicId.includes(query) || company.includes(query);
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="muted small">Inga tickets matchar "${escapeHtml(query)}".</div>`;
    return;
  }

  filtered.forEach((t) => {
    const div = document.createElement("div");
    const isHigh = t.priority === "high";
    const priClass = isHigh ? "danger" : t.priority === "low" ? "muted" : "info";

    div.className = "listItem " + (isHigh ? "important-highlight" : "");
    div.innerHTML = `
      <div class="listItemTitle">
        ${isHigh ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i> ' : ""}
        ${escapeHtml(t.title || "Ticket")}
        <span class="pill ${priClass}">${escapeHtml(t.priority || "normal")}</span>
        <span class="pill">${escapeHtml(t.status)}</span>
      </div>
      <div class="muted small">${escapeHtml(t.publicTicketId)} • ${escapeHtml(t.companyId)} • ${new Date(t.lastActivityAt).toLocaleString('sv-SE')}</div>
    `;
    div.addEventListener("click", () => selectInboxTicket(t._id));
    list.appendChild(div);
  });
}

async function selectInboxTicket(ticketId) {
  const box = $("ticketDetails");
  if (!box) return;

  try {
    box.innerHTML = `<div class="muted small center" style="padding:20px;">Laddar ärende...</div>`;

    // Fetch directly from API to ensure we get it even if not in local list
    const t = await api("/tickets/" + ticketId);

    if (!t) throw new Error("Kunde inte hämta ärendet.");

    // Update state
    state.inboxSelectedTicket = t;

    const msgs = (t.messages || [])
      .map((m) => `<div class="muted small"><b>${escapeHtml(m.role)}:</b> ${escapeHtml(m.content)}</div>`)
      .join("<br>");

    // Render details
    box.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:flex-start;">
          <div>
              <b>${escapeHtml(t.title || "Ticket")}</b><br>
              <div class="row gap small" style="margin-top:5px;">
                <span class="pill muted">${escapeHtml(t.publicTicketId)}</span>
                <span class="pill ${t.status === 'solved' ? 'ok' : t.status === 'high' ? 'danger' : 'info'}">${escapeHtml(t.status)}</span>
                <span class="muted small">Företag: ${escapeHtml(t.companyId || 'demo')}</span>
              </div>
          </div>
          <button class="btn ghost small" onclick="summarizeTicket('${t._id}')">
              <i class="fa-solid fa-wand-magic-sparkles"></i> AI Sammanfatta
          </button>
      </div>
      <div id="ticketSummaryContent" class="alert info small" style="display:none; margin-top:10px;"></div>
      
      ${t.contactInfo && (t.contactInfo.name || t.contactInfo.email) ? `
        <div class="panel soft" style="margin-top:15px; padding:15px; border-left:3px solid var(--primary); background:var(--panel2);">
            <div style="font-weight:700; font-size:13px; margin-bottom:12px; color:var(--text); display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-address-card" style="color:var(--primary); font-size:16px;"></i> Kontaktuppgifter
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; font-size:13px;">
                ${t.contactInfo.name ? `<div><div class="muted tiny" style="margin-bottom:2px;">Namn</div><div style="font-weight:600;">${escapeHtml(t.contactInfo.name)} ${escapeHtml(t.contactInfo.surname || '')}</div></div>` : ''}
                ${t.contactInfo.email ? `<div><div class="muted tiny" style="margin-bottom:2px;">E-post</div><a href="mailto:${escapeHtml(t.contactInfo.email)}" style="color:var(--primary); text-decoration:none;">${escapeHtml(t.contactInfo.email)}</a></div>` : ''}
                ${t.contactInfo.phone ? `<div><div class="muted tiny" style="margin-bottom:2px;">Telefon</div><div>${escapeHtml(t.contactInfo.phone)}</div></div>` : ''}
                ${t.contactInfo.isCompany ? `<div><div class="muted tiny" style="margin-bottom:2px;">Företag</div><div style="font-weight:600;">${escapeHtml(t.contactInfo.orgName || '-')}</div></div>` : ''}
                ${t.contactInfo.orgNr ? `<div><div class="muted tiny" style="margin-bottom:2px;">Org.nr</div><div>${escapeHtml(t.contactInfo.orgNr)}</div></div>` : ''}
                ${t.contactInfo.ticketIdInput ? `<div><div class="muted tiny" style="margin-bottom:2px;">Referens</div><div>${escapeHtml(t.contactInfo.ticketIdInput)}</div></div>` : ''}
            </div>
        </div>
      ` : ''}

      <div class="divider"></div>
      <div class="messageList" style="max-height:400px; overflow-y:auto;">
        ${msgs || "<div class='muted small'>Inga meddelanden ännu.</div>"}
      </div>
    `;

    const priSel = $("ticketPrioritySelect");
    if (priSel) priSel.value = t.priority || "normal";

    // Update internal notes if they exist
    const noteArea = $("internalNoteText");
    if (noteArea) noteArea.value = t.internalNote || "";

    // Show internal notes (orphaned fix)
    if (t.internalNotes && t.internalNotes.length > 0) {
      const notesHtml = t.internalNotes.map(n => `
            <div class="alert info tiny" style="margin-top:5px; border-style:dashed;">
                <i class="fa-solid fa-note-sticky"></i> ${escapeHtml(n.content)}
            </div>
          `).join("");
      box.innerHTML += `
            <div style="margin-top:15px;">
                <b>Interna noter:</b>
                ${notesHtml}
            </div>
          `;
    }

    // Populate agent select (if we have users)
    const userSel = $("assignUserSelect");
    if (userSel) {
      userSel.value = t.assignedToUserId || "";
    }

  } catch (e) {
    console.error("Select ticket error:", e);
    box.innerHTML = `<div class="alert error">Kunde inte öppna ärendet: ${e.message}</div>`;
  }
}

async function editCustomer(companyId) {
  const customer = crmData.customers.find(c => c.companyId === companyId);
  if (!customer) return toast("Fel", "Kunden hittades ej", "error");

  const modal = $("crmCustomerModal");
  const nameEl = $("crmModalCustomerName");
  const bodyEl = $("crmModalBody");

  nameEl.textContent = "Redigera " + customer.displayName;

  bodyEl.innerHTML = `
    <div class="grid2" style="gap: 20px;">
      <div>
        <label>Företagsnamn</label>
        <input id="editCrmName" class="input" value="${escapeHtml(customer.displayName || '')}" />
        
        <label>Kontaktperson</label>
        <input id="editCrmContact" class="input" value="${escapeHtml(customer.contactName || '')}" />
        
        <label>E-post</label>
        <input id="editCrmEmail" class="input" value="${escapeHtml(customer.contactEmail || '')}" />
        
        <label>Telefon</label>
        <input id="editCrmPhone" class="input" value="${escapeHtml(customer.phone || '')}" />
      </div>
      <div>
        <label>Plan</label>
        <select id="editCrmPlan" class="input">
          <option value="trial" ${customer.plan === 'trial' ? 'selected' : ''}>Trial</option>
          <option value="bas" ${(!customer.plan || customer.plan === 'bas') ? 'selected' : ''}>BAS</option>
          <option value="pro" ${customer.plan === 'pro' ? 'selected' : ''}>PRO</option>
          <option value="enterprise" ${customer.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
        </select>
        
        <label>Status</label>
        <select id="editCrmStatus" class="input">
          <option value="active" ${(!customer.status || customer.status === 'active') ? 'selected' : ''}>Aktiv</option>
          <option value="pending" ${customer.status === 'pending' ? 'selected' : ''}>Väntar</option>
          <option value="inactive" ${customer.status === 'inactive' ? 'selected' : ''}>Inaktiv</option>
        </select>
        
        <label>Org.nr</label>
        <input id="editCrmOrg" class="input" value="${escapeHtml(customer.orgNr || '')}" />
        
        <label>AI Tonalitet</label>
        <select id="editCrmTone" class="input">
          <option value="professional" ${customer.settings?.tone === 'professional' ? 'selected' : ''}>Professionell</option>
          <option value="friendly" ${customer.settings?.tone === 'friendly' ? 'selected' : ''}>Vänlig</option>
          <option value="strict" ${customer.settings?.tone === 'strict' ? 'selected' : ''}>Formell</option>
        </select>
      </div>
    </div>
    
    <label>Interna anteckningar</label>
    <textarea id="editCrmNotes" class="input textarea" rows="4">${escapeHtml(customer.notes || '')}</textarea>
    
    <button id="saveCrmCustomerBtn" class="btn primary full" style="margin-top: 20px;">
      <i class="fa-solid fa-floppy-disk"></i> Spara ändringar
    </button>
  `;

  const saveBtn = document.getElementById("saveCrmCustomerBtn");
  saveBtn.onclick = async () => {
    try {
      await api("/company/settings", {
        method: "PATCH",
        body: {
          companyId,
          settings: {
            displayName: $("editCrmName").value,
            contactName: $("editCrmContact").value,
            contactEmail: $("editCrmEmail").value,
            phone: $("editCrmPhone").value,
            plan: $("editCrmPlan").value,
            status: $("editCrmStatus").value,
            orgNr: $("editCrmOrg").value,
            tone: $("editCrmTone").value,
            notes: $("editCrmNotes").value
          }
        }
      });
      toast("Sparat", "Kundinformation uppdaterad", "info");
      closeCrmModal();
      await refreshCustomers();
    } catch (e) {
      toast("Fel", e.message, "error");
    }
  };

  modal.style.display = "flex";
}

async function summarizeTicket(id) {
  const contentBox = $("ticketSummaryContent");
  if (contentBox) {
    contentBox.style.display = "block";
    contentBox.textContent = "Genererar sammanfattning... ✨";
    try {
      const res = await api(`/tickets/${id}/summary`);
      contentBox.textContent = "AI Sammanfattning: " + res.summary;
    } catch (e) { contentBox.textContent = "Kunde inte sammanfatta: " + e.message; }
  }
}

async function assignTicket() {
  if (!state.inboxSelectedTicket) return toast("Fel", "Välj ett ärende först", "error");
  const userId = $("assignUserSelect")?.value;

  try {
    await api(`/tickets/${state.inboxSelectedTicket._id}/assign`, {
      method: "PATCH",
      body: { assignedToUserId: userId }
    });
    toast("Tilldelad", "Ärendet har tilldelats", "info");
    await loadInboxTickets();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function saveInternalNote() {
  if (!state.inboxSelectedTicket) return toast("Fel", "Välj ett ärende först", "error");
  const note = $("internalNoteText")?.value.trim();
  if (!note) return toast("Saknas", "Skriv en notering först", "error");

  try {
    await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/note`, {
      method: "POST",
      body: { content: note }
    });
    $("internalNoteText").value = "";
    toast("Sparat", "Notering sparad", "info");
    await selectInboxTicket(state.inboxSelectedTicket._id);
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function deleteTicket() {
  if (!state.inboxSelectedTicket) return toast("Fel", "Välj ett ärende först", "error");
  if (!confirm("Är du säker på att du vill radera detta ärende permanent?")) return;

  try {
    await api(`/tickets/${state.inboxSelectedTicket._id}`, { method: "DELETE" });
    toast("Raderat", "Ärendet raderades", "info");
    $("ticketDetails").innerHTML = '<div class="muted small center" style="padding: 40px;">Välj ett ärende för att se detaljer</div>';
    state.inboxSelectedTicket = null;
    await loadInboxTickets();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function setInboxStatus(status) {
  if (!state.inboxSelectedTicket) return toast("Fel", "Välj ett ärende först", "error");

  try {
    await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/status`, {
      method: "PATCH",
      body: { status }
    });
    await selectInboxTicket(state.inboxSelectedTicket._id);
    await loadInboxTickets();
  } catch (e) { toast("Fel", e.message, "error"); }
}

async function setInboxPriority() {
  const pri = $("ticketPrioritySelect")?.value;
  if (!state.inboxSelectedTicket) return toast("Fel", "Välj ett ärende först", "error");

  try {
    await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/priority`, {
      method: "PATCH",
      body: { priority: pri }
    });
    toast("Uppdaterad", `Prioritet satt till ${pri}`, "info");
    await loadInboxTickets();
  } catch (e) { toast("Fel", e.message, "error"); }
}

async function sendAgentReplyInbox() {
  const text = $("agentReplyTextInbox")?.value.trim();
  if (!text) return toast("Saknas", "Skriv ett meddelande", "error");
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj ett ärende först", "error");

  try {
    await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/reply`, {
      method: "POST",
      body: { message: text }
    });

    $("agentReplyTextInbox").value = "";
    toast("Skickat", "Ditt svar skickades", "info");
    await selectInboxTicket(state.inboxSelectedTicket._id);
    await loadInboxTickets();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

function useQuickReply(type) {
  const area = $("agentReplyTextInbox");
  if (!area) return;
  const templates = {
    greeting: "Hej! Tack för att du hör av dig. Hur kan jag hjälpa dig idag?",
    working: "Vi tittar på ditt ärende just nu och återkommer så snart vi har mer information.",
    solved: "Hoppas detta löser ditt ärende! Jag markerar ticketen som löst nu. Ha en fin dag!",
    thanks: "Tack för din feedback! Vi uppskattar att du hörde av dig."
  };
  area.value = templates[type] || "";
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

async function saveInternalNote() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const content = $("internalNoteText")?.value?.trim();
  if (!content) return toast("Saknas", "Skriv en note", "error");

  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/note`, {
    method: "POST",
    body: { content },
  });

  $("internalNoteText").value = "";
  toast("Klar", "Intern note sparad 📝", "info");
  await selectInboxTicket(state.inboxSelectedTicket._id);
}

async function clearInternalNotes() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  if (!confirm("Vill du radera alla interna noter på denna ticket?")) return;

  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/notes`, { method: "DELETE" });
  toast("Raderat", "Notes raderade 🗑️", "info");
  await selectInboxTicket(state.inboxSelectedTicket._id);
}

async function assignTicket() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const userId = $("assignUserSelect")?.value;

  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/assign`, {
    method: "PATCH",
    body: { userId },
  });

  toast("Klar", "Ärende tilldelat ✅", "info");
  await loadInboxTickets();
}

async function deleteTicket() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  if (!confirm("ÄR DU SÄKER? Detta raderar ticketen permanent!")) return;

  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}`, { method: "DELETE" });
  toast("Raderat", "Ticket borta för alltid", "warning");
  state.inboxSelectedTicket = null;
  $("ticketDetails").innerHTML = "Välj en ticket.";
  await loadInboxTickets();
}

/* =========================
   SLA
========================= */
async function loadSlaDashboard() {
  const days = $("slaDaysSelect")?.value || "30";

  try {
    const overview = await api(`/sla/overview?days=${encodeURIComponent(days)}`);
    const trend = await api(`/sla/trend?days=${encodeURIComponent(days)}`);
    const agents = await api(`/sla/agents?days=${encodeURIComponent(days)}`);
    const topTopics = await api(`/sla/top-topics`);

    const overviewBox = $("slaOverviewBox");
    if (overviewBox) {
      overviewBox.innerHTML = `
            <div class="slaGrid">
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-ticket"></i> Total Tickets</div>
                    <div class="slaValue">${overview.counts.total}</div>
                    <div class="slaDelta up">Last ${days} days</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-robot"></i> AI Solve Rate</div>
                    <div class="slaValue">${overview.aiRate}%</div>
                    <div class="slaDelta up">Automatic handling</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-stopwatch"></i> Avg. Solve Time</div>
                    <div class="slaValue">${overview.avgSolveHours}h</div>
                    <div class="slaDelta">Resolution SLA</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-star"></i> Customer CSAT</div>
                    <div class="slaValue">${overview.avgCsat}</div>
                    <div class="slaDelta up">Avg Rating</div>
                </div>
            </div>
        `;
    }

    // Top Topics
    const topicsBox = $("slaTopTopicsBox");
    if (topicsBox) {
      topicsBox.innerHTML = topTopics.length ? topTopics.map(t => `
            <div class="listItem" style="cursor:default">
                <div class="listItemTitle">
                    <span class="muted" style="width:24px">#</span> ${escapeHtml(t.topic)}
                    <span class="pill" style="margin-left:auto">${t.count} träffar</span>
                </div>
            </div>
        `).join("") : '<div class="muted small p-10">Ingen trend-data tillgänglig än.</div>';
    }

    // Agents Table
    const tableBody = $("slaAgentsTableBody");
    if (tableBody) {
      tableBody.innerHTML = agents.length ? agents.map(a => `
            <tr>
                <td><b>${escapeHtml(a.agentName)}</b></td>
                <td>${a.handled}</td>
                <td>${a.solved}</td>
                <td>
                    <div class="pill ${a.efficiency > 70 ? 'ok' : 'warn'}">${a.efficiency}%</div>
                </td>
            </tr>
        `).join("") : '<tr><td colspan="4" class="muted center">Inga agenter aktiva under perioden.</td></tr>';
    }

    // Advanced Chart.js
    if (window.Chart && $("slaTrendChart")) {
      const ctx = $("slaTrendChart").getContext("2d");
      if (window.__slaChart) window.__slaChart.destroy();

      window.__slaChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: trend.map(r => r.week),
          datasets: [
            {
              label: "Inkommande",
              data: trend.map(r => r.total),
              borderColor: "#4c7dff",
              backgroundColor: "rgba(76, 125, 255, 0.1)",
              fill: true,
              tension: 0.4
            },
            {
              label: "Lösta",
              data: trend.map(r => r.solved),
              borderColor: "#37d67a",
              backgroundColor: "rgba(55, 214, 122, 0.1)",
              fill: true,
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#a6abc6', usePointStyle: true } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#a6abc6' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a6abc6' } }
          }
        }
      });
    }
  } catch (e) {
    console.error("SLA Load Error:", e);
    toast("Fel", "Kunde inte ladda dashboard-data", "error");
  }
}

async function exportSlaCsv() {
  toast("Export", "Förbereder CSV...", "info");
  const days = $("slaDaysSelect")?.value || "30";
  try {
    const overview = await api(`/sla/overview?days=${days}`);
    const agents = await api(`/sla/agents?days=${days}`);

    let csv = "Metric,Value\n";
    csv += `Total Tickets,${overview.counts.total}\n`;
    csv += `Solved Tickets,${overview.counts.solved}\n`;
    csv += `AI Solve Rate,${overview.aiRate}%\n`;
    csv += `Avg Solve Time,${overview.avgSolveHours}h\n`;
    csv += `Avg CSAT,${overview.avgCsat}\n`;
    csv += "\nAgent,Handled,Solved,Efficiency\n";
    agents.forEach(a => {
      csv += `${a.agentName},${a.handled},${a.solved},${a.efficiency}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `SLA_Report_${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
  } catch (e) { toast("Fel", "Export misslyckades", "error"); }
}

async function clearSla(scope) {
  const msg = scope === 'all' ? "Vill du radera ALL statistik (hela databasen)?" : "Vill du radera DIN statistik?";
  if (!confirm(msg)) return;

  try {
    const url = scope === 'all' ? "/sla/clear/all" : "/sla/clear/my";
    await api(url, { method: "DELETE" });
    toast("Raderat", "Statistik har rensats ✅", "info");
    await loadSlaDashboard();
  } catch (e) { toast("Fel", e.message, "error"); }
}

/* =========================
   Billing
========================= */
async function loadBilling() {
  try {
    const [details, history] = await Promise.all([
      api("/billing/details"),
      api("/billing/history")
    ]);

    // Update Stats
    if ($("currentPlanName")) $("currentPlanName").textContent = details.plan.toUpperCase();
    if ($("currentPlanStatus")) $("currentPlanStatus").textContent = details.status;
    if ($("billingUsageVal")) $("billingUsageVal").textContent = details.usage.percent + "%";
    if ($("billingUsageLabel")) $("billingUsageLabel").textContent = `${details.usage.current} / ${details.usage.limit} ärenden`;
    if ($("nextBillingDate")) $("nextBillingDate").textContent = details.nextInvoice;

    // Active Plan Card Highlight
    const activeLabel = $("activePlanLabel");
    if (activeLabel) activeLabel.textContent = details.planInfo.name;

    const activeFeatures = $("activePlanFeatures");
    if (activeFeatures) {
      activeFeatures.innerHTML = details.planInfo.features.map(f => `
            <li style="font-size:13px;"><i class="fa-solid fa-circle-check" style="color:var(--ok)"></i> ${f}</li>
        `).join("");
    }

    // Highlight the card in the upgrade list
    const proCard = $("planCardPro");
    const basCard = $("planCardBas");
    if (details.plan === "pro") {
      if (proCard) proCard.style.boxShadow = "0 0 20px rgba(76, 125, 255, 0.3)";
      if (proCard) proCard.style.borderColor = "var(--primary)";
      const upBtn = $("upgradeToProBtn");
      if (upBtn) {
        upBtn.textContent = "Din nuvarande plan";
        upBtn.disabled = true;
        upBtn.className = "btn ghost full";
      }
    } else {
      if (basCard) basCard.style.boxShadow = "0 0 20px rgba(55, 214, 122, 0.15)";
    }

    // Update History Table
    const list = $("billingHistoryList");
    if (list) {
      list.innerHTML = history.invoices.length ? history.invoices.map(inv => `
            <tr>
                <td>${inv.date}</td>
                <td><b>${inv.amount}</b></td>
                <td><span class="pill ok">${inv.status}</span></td>
                <td style="text-align:right">
                    <a href="${inv.url}" class="btn ghost small"><i class="fa-solid fa-file-pdf"></i></a>
                </td>
            </tr>
        `).join("") : '<tr><td colspan="4" class="muted center">Inga fakturor än.</td></tr>';
    }
  } catch (e) {
    console.error("Billing Load Error:", e);
    toast("Fel", "Kunde inte ladda betalningsinformation", "error");
  }
}

async function upgradeToPro() {
  try {
    const res = await api("/billing/create-checkout", {
      method: "POST",
      body: { plan: "pro", companyId: state.companyId },
    });
    if (res?.message?.includes("DEMO")) {
      toast("Demo Mode", res.message, "info");
    } else if (res?.url && res.url !== "#") {
      window.location.href = res.url;
    } else {
      toast("Stripe", "Stripe integration påbörjad. Se .env för att aktivera skarpt läge.", "info");
    }
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

/* =========================
   Admin
========================= */
async function loadAdminUsers() {
  const list = $("adminUsersList");
  if (!list) return;

  try {
    const users = await api("/admin/users");
    list.innerHTML = "";

    (users || []).forEach((u) => {
      const div = document.createElement("div");
      div.className = "listItem";
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.justifyContent = "space-between";

      const info = document.createElement("div");
      info.innerHTML = `
        <div class="listItemTitle">${escapeHtml(u.username)} <span class="pill ${u.role === 'admin' ? 'admin' : (u.role === 'agent' ? 'ok' : '')}">${escapeHtml(u.role)}</span></div>
        <div class="muted small">${escapeHtml(u.email || "Ingen e-post")} • ID: ${u._id.slice(-6)}</div>
      `;
      div.appendChild(info);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      // Role select
      if (state.me?.role === "admin" && state.me?._id !== u._id) {
        const sel = document.createElement("select");
        sel.className = "input smallInput";
        sel.style.width = "auto";
        ["user", "agent", "admin"].forEach(r => {
          const opt = document.createElement("option");
          opt.value = r;
          opt.textContent = r;
          if (u.role === r) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.onchange = async () => {
          try {
            await api(`/admin/users/${u._id}/role`, { method: "PATCH", body: { role: sel.value } });
            toast("Uppdaterat", `Roll ändrad till ${sel.value}`, "info");
            await loadAdminUsers();
          } catch (e) { toast("Fel", e.message, "error"); }
        };
        actions.appendChild(sel);

        const delBtn = document.createElement("button");
        delBtn.className = "btn danger small";
        delBtn.innerHTML = `<i class="fa-solid fa-user-slash"></i>`;
        delBtn.title = "Ta bort användare";
        delBtn.onclick = async () => {
          if (!confirm(`Är du säker på att du vill radera ${u.username}? Detta kan ej ångras.`)) return;
          try {
            await api(`/admin/users/${u._id}`, { method: "DELETE" });
            toast("Borttagen", "Användaren har raderats", "info");
            await loadAdminUsers();
          } catch (e) { toast("Fel", e.message, "error"); }
        };
        actions.appendChild(delBtn);
      }

      div.appendChild(actions);
      list.appendChild(div);
    });
  } catch (e) { toast("Fel", "Kunde inte ladda användare", "error"); }
}

async function loadAdminDiagnostics() {
  const box = $("diagnosticsBox");
  if (!box) return;

  try {
    const d = await api("/admin/diagnostics");
    box.innerHTML = `
            <div class="slaGrid">
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-heart-pulse"></i> Status</div>
                    <div class="slaValue" style="color:var(--ok)">${d.status}</div>
                    <div class="slaDelta up">Systemet mår bra</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-database"></i> Database</div>
                    <div class="slaValue">${d.database}</div>
                    <div class="slaDelta up">Mongoose v${d.server.node_version}</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-microchip"></i> Memory</div>
                    <div class="slaValue">${d.server.memory_usage}</div>
                    <div class="slaDelta">Heap Used</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-clock"></i> Uptime</div>
                    <div class="slaValue">${d.server.uptime}</div>
                    <div class="slaDelta up">Senaste omstart</div>
                </div>
            </div>
            
            <div class="grid2" style="margin-top:20px;">
                <div class="panel">
                    <div class="panelHead"><b><i class="fa-solid fa-chart-pie"></i> Databas-statistik</b></div>
                    <div class="list">
                        <div class="listItem" style="cursor:default"><b>Totalt användare:</b> ${d.stats.users}</div>
                        <div class="listItem" style="cursor:default"><b>Totalt tickets:</b> ${d.stats.tickets}</div>
                        <div class="listItem" style="cursor:default"><b>KB Dokument:</b> ${d.stats.knowledgeDocs}</div>
                    </div>
                </div>
                <div class="panel">
                    <div class="panelHead"><b><i class="fa-solid fa-lock"></i> Miljövariabler (Check)</b></div>
                    <div class="list">
                        <div class="listItem" style="cursor:default">OpenAI Key: ${d.env.openai ? '✅ Aktiv' : '❌ Saknas'}</div>
                        <div class="listItem" style="cursor:default">Stripe Key: ${d.env.stripe ? '✅ Aktiv' : '⚠️ Ej konfig'}</div>
                        <div class="listItem" style="cursor:default">MongoDB: ${d.env.mongo ? '✅ Ansluten' : '❌ Fel'}</div>
                    </div>
                </div>
            </div>
        `;
  } catch (e) { box.innerHTML = `<div class="alert error">Kunde inte ladda systemdiagnostik.</div>`; }
}

async function bulkDeleteKb() {
  if (!confirm("VARNING: Detta raderar ALLA dokument i kunskapsbasen för valt bolag. Är du säker?")) return;
  try {
    await api("/admin/kb/bulk-delete", {
      method: "DELETE",
      body: { companyId: $("kbCategorySelect").value }
    });
    toast("Rensat", "Kunskapsbasen har tömts ✅", "info");
    await loadKb();
  } catch (e) { toast("Fel", e.message, "error"); }
}

/* =========================
   CRM Admin (admin)
========================= */
async function refreshCustomers() {
  const list = $("customersList");
  if (!list) return;

  const companies = await api("/admin/companies"); // ADMIN LIST
  list.innerHTML = "";

  (companies || []).forEach((c) => {
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
  const contactEmail = $("newCompanyContactEmail")?.value?.trim() || "";
  const plan = $("newCompanyPlan")?.value || "bas";

  if (!displayName) return toast("Saknas", "Namn krävs", "error");

  try {
    await api("/admin/companies", {
      method: "POST",
      body: { displayName, contactEmail, plan },
    });

    toast("Skapat", "Ny kund skapad ✅", "info");
    $("newCompanyDisplayName").value = "";
    $("newCompanyContactEmail").value = "";
    await refreshCustomers();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
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
   KB & Tabs
========================= */
function initTabs() {
  const tabs = document.querySelectorAll(".tabBtn");
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      // Remove active from all tabs
      tabs.forEach((b) => b.classList.remove("active"));
      // Hide all panels
      document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));

      // Activate clicked
      t.classList.add("active");
      const target = t.getAttribute("data-tab");
      const p = $(target);
      if (p) p.style.display = "";
    });
  });
}

async function loadKb() {
  const companyId = $("kbCategorySelect")?.value || "demo";
  const list = $("kbList");
  if (!list) return;

  try {
    const docs = await api(`/admin/kb?companyId=${encodeURIComponent(companyId)}`);
    list.innerHTML = "";

    if (docs.length === 0) {
      list.innerHTML = "<div class='muted small'>Inga dokument ännu.</div>";
      return;
    }

    docs.forEach((d) => {
      const div = document.createElement("div");
      div.className = "listItem";

      const icon = d.sourceType === "pdf" ? "fa-file-pdf" : d.sourceType === "url" ? "fa-link" : "fa-file-lines";

      div.innerHTML = `
        <div class="listItemTitle">
          <i class="fa-solid ${icon}"></i> ${escapeHtml(d.title)} 
          <span class="muted small">(${d.sourceType})</span>
        </div>
      `;

      const delBtn = document.createElement("button");
      delBtn.className = "btn ghost small danger";
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Ta bort "${d.title}"?`)) return;
        await api("/admin/kb/" + d._id, { method: "DELETE" });
        await loadKb();
      };

      div.appendChild(delBtn);
      list.appendChild(div);
    });
  } catch (e) {
    list.textContent = "Fel: " + e.message;
  }
}

async function uploadKbText() {
  const companyId = $("kbCategorySelect")?.value || "demo";
  const title = $("kbTextTitle")?.value.trim();
  const content = $("kbTextContent")?.value.trim();

  if (!title || !content) return toast("Saknas", "Fyll i titel och innehåll", "error");

  try {
    await api("/admin/kb/text", { method: "POST", body: { companyId, title, content } });
    toast("Sparat", "Textblock sparad", "info");
    $("kbTextTitle").value = "";
    $("kbTextContent").value = "";
    await loadKb();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function uploadKbUrl() {
  const companyId = $("kbCategorySelect")?.value || "demo";
  const url = $("kbUrlInput")?.value.trim();
  if (!url) return toast("Saknas", "Fyll i URL", "error");
  try {
    toast("Laddar...", "Hämtar URL innehåll...", "info");
    await api("/admin/kb/url", { method: "POST", body: { companyId, url } });
    toast("Klar", "URL sparad", "info");
    $("kbUrlInput").value = "";
    await loadKb();
  } catch (e) { toast("Fel", e.message, "error"); }
}

async function uploadKbPdf() {
  const companyId = $("kbCategorySelect")?.value || "demo";
  const fileInput = $("kbPdfFile");
  const file = fileInput?.files?.[0];
  if (!file) return toast("Saknas", "Välj en fil", "error");

  const formData = new FormData();
  formData.append("pdf", file);
  formData.append("companyId", companyId);

  try {
    toast("Laddar...", "Laddar upp PDF...", "info");
    const res = await fetch(state.apiBase + "/admin/kb/pdf", {
      method: "POST",
      headers: { "Authorization": "Bearer " + state.token },
      body: formData
    });
    if (!res.ok) throw new Error("Upload failed");
    toast("Klar", "PDF sparad", "info");
    fileInput.value = "";
    await loadKb();
  } catch (e) { toast("Fel", e.message, "error"); }
}

/* =========================
   Categories / Companies (CRM)
 ========================= */
async function loadCategories() {
  if (!state.companies || state.companies.length === 0) {
    await loadCompanies();
  }
  renderCatsList();
}

function renderCatsList() {
  const list = $("catsList");
  if (!list) return;
  list.innerHTML = "";

  if (state.companies.length === 0) {
    list.innerHTML = '<div class="muted small">Inga företag/kategorier hittades.</div>';
    return;
  }

  state.companies.forEach((c) => {
    const div = document.createElement("div");
    div.className = "listItem";

    const isDemo = c.companyId === "demo";

    div.innerHTML = `
      <div class="listItemTitle">
        <b>${escapeHtml(c.displayName)}</b>
        <span class="pill muted" style="font-size:10px;">${escapeHtml(c.companyId)}</span>
        ${isDemo ? '<span class="pill warn" style="font-size:10px;">Standard</span>' : ''}
      </div>
      <div class="muted small">
        Ton: ${c.settings?.tone || 'professional'} • 
        Widget: ${c.settings?.widgetColor || '#0066cc'}
      </div>
    `;

    if (!isDemo) {
      const delBtn = document.createElement("button");
      delBtn.className = "btn ghost small danger";
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.title = "Ta bort företag";
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        await deleteCompany(c.companyId, c.displayName);
      };
      div.appendChild(delBtn);
    }

    list.appendChild(div);
  });
}

async function createCategory() {
  const companyId = $("newCatKey")?.value.trim();
  const displayName = $("newCatName")?.value.trim();
  const tone = $("newCatTone")?.value || "professional";
  const emojis = $("newCatEmojis")?.value === "true";

  if (!companyId || !displayName) {
    return toast("Saknas", "Ange både nyckel och namn", "error");
  }

  // Create company by saving settings for it (this will create it if not exists)
  try {
    // First check if company exists
    const existing = state.companies.find(c => c.companyId === companyId);
    if (existing) {
      return toast("Fel", "Företaget finns redan", "error");
    }

    // Create new company via API
    await api("/company/settings", {
      method: "PATCH",
      body: {
        companyId,
        settings: { tone, greeting: `Välkommen till ${displayName}!` }
      }
    });

    toast("Skapat", `Företag "${displayName}" skapades`, "info");

    // Clear form
    $("newCatKey").value = "";
    $("newCatName").value = "";

    // Reload companies
    await loadCompanies();
    renderCatsList();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

async function deleteCompany(companyId, displayName) {
  if (!confirm(`Ta bort "${displayName}" och alla dess kunskapsdokument?\n\nDetta går inte att ångra.`)) {
    return;
  }

  try {
    const res = await api(`/companies/${companyId}`, { method: "DELETE" });
    toast("Borttaget", `Företag "${displayName}" togs bort (${res.deletedDocuments} dokument)`, "info");

    // Reload companies
    await loadCompanies();
    renderCatsList();

    // If this was the selected company, switch to first available
    if (state.companyId === companyId && state.companies.length > 0) {
      await switchCompany(state.companies[0].companyId);
    }
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

/* =========================
   CRM - Full Customer Management
 ========================= */
let crmData = {
  customers: [],
  activities: [],
  stats: {}
};

async function refreshCustomers() {
  try {
    // Load companies as customers
    const companies = await api("/companies");
    crmData.customers = companies || [];

    // Load tickets for statistics
    let tickets = [];
    if (state.me?.role === "admin" || state.me?.role === "agent") {
      tickets = await api("/inbox/tickets");
    }

    // Calculate statistics
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    crmData.stats = {
      total: crmData.customers.length,
      active: crmData.customers.filter(c => c.status !== "inactive").length,
      pro: crmData.customers.filter(c => c.plan === "pro").length,
      enterprise: crmData.customers.filter(c => c.plan === "enterprise").length,
      trial: crmData.customers.filter(c => c.plan === "trial").length,
      newThisMonth: crmData.customers.filter(c => new Date(c.createdAt) >= thisMonth).length,
      totalTickets: tickets.length,
      openTickets: tickets.filter(t => t.status !== "solved").length,
      avgCsat: calculateAvgCsat(tickets)
    };

    // Generate activity log from recent tickets and changes
    crmData.activities = generateCrmActivities(tickets, crmData.customers);

    // Render all CRM sections
    renderCrmOverview();
    renderCrmCustomersList();
    renderCrmActivity();
    renderCrmAnalytics();

  } catch (e) {
    console.error("CRM Error:", e);
    toast("CRM Fel", e.message, "error");
  }
}

function calculateAvgCsat(tickets) {
  const rated = tickets.filter(t => t.csatRating);
  if (rated.length === 0) return null;
  const sum = rated.reduce((s, t) => s + t.csatRating, 0);
  return (sum / rated.length).toFixed(1);
}

function generateCrmActivities(tickets, customers) {
  const activities = [];

  // Recent tickets as activities
  tickets.slice(0, 20).forEach(t => {
    activities.push({
      type: "ticket",
      title: t.title || "Nytt ärende",
      description: `${t.companyId} - ${t.status}`,
      time: new Date(t.lastActivityAt || t.createdAt),
      icon: "fa-ticket"
    });
  });

  // Recent customers
  customers.slice(0, 10).forEach(c => {
    activities.push({
      type: "customer",
      title: `Kund: ${c.displayName}`,
      description: `Plan: ${c.plan || 'bas'}`,
      time: new Date(c.createdAt),
      icon: "fa-building"
    });
  });

  // Sort by time
  activities.sort((a, b) => b.time - a.time);
  return activities.slice(0, 30);
}

function renderCrmOverview() {
  // KPI Cards
  const s = crmData.stats;
  $("crmTotalCustomers").textContent = s.total;
  $("crmCustomersDelta").textContent = `+${s.newThisMonth} denna månad`;
  $("crmActiveCustomers").textContent = s.active;
  $("crmProCustomers").textContent = s.pro + s.enterprise;
  $("crmProPercentage").textContent = s.total ? `${Math.round((s.pro + s.enterprise) / s.total * 100)}% av alla` : "0%";
  $("crmTotalTickets").textContent = s.totalTickets;
  $("crmOpenTickets").textContent = `${s.openTickets} öppna`;
  $("crmCsatScore").textContent = s.avgCsat ? `${s.avgCsat}/5` : "--";

  // Recent Customers
  const recentList = $("crmRecentCustomersList");
  if (recentList) {
    const recent = crmData.customers.slice(0, 5);
    recentList.innerHTML = recent.length ? recent.map(c => `
      <div class="listItem" style="cursor: pointer;" onclick="openCustomerModal('${c.companyId}')">
        <div class="listItemTitle">
          <b>${escapeHtml(c.displayName)}</b>
          <span class="planBadge ${c.plan || 'bas'}">${(c.plan || 'bas').toUpperCase()}</span>
        </div>
        <div class="muted small">${escapeHtml(c.companyId)} • ${new Date(c.createdAt).toLocaleDateString('sv-SE')}</div>
      </div>
    `).join("") : '<div class="muted small center">Inga kunder ännu.</div>';
  }

  // Recent Activity
  const activityList = $("crmRecentActivityList");
  if (activityList) {
    const recent = crmData.activities.slice(0, 5);
    activityList.innerHTML = recent.length ? recent.map(a => `
      <div class="crmActivityItem">
        <div class="icon ${a.type}"><i class="fa-solid ${a.icon}"></i></div>
        <div class="content">
          <div><b>${escapeHtml(a.title)}</b></div>
          <div class="muted small">${escapeHtml(a.description)}</div>
        </div>
        <div class="time">${timeAgo(a.time)}</div>
      </div>
    `).join("") : '<div class="muted small center">Ingen aktivitet ännu.</div>';
  }
}

function timeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just nu";
  if (minutes < 60) return `${minutes}m sedan`;
  if (hours < 24) return `${hours}h sedan`;
  if (days < 7) return `${days}d sedan`;
  return date.toLocaleDateString('sv-SE');
}

function renderCrmCustomersList() {
  const list = $("customersList");
  if (!list) return;

  // Get filter values
  const search = ($("crmSearchInput")?.value || "").toLowerCase().trim();
  const planFilter = $("crmPlanFilter")?.value || "";
  const statusFilter = $("crmStatusFilter")?.value || "";
  const sortBy = $("crmSortBy")?.value || "createdAt";

  // Filter customers
  let filtered = crmData.customers.filter(c => {
    const matchSearch = !search ||
      (c.displayName || "").toLowerCase().includes(search) ||
      (c.companyId || "").toLowerCase().includes(search) ||
      (c.orgNr || "").toLowerCase().includes(search) ||
      (c.contactEmail || "").toLowerCase().includes(search) ||
      (c.contactName || "").toLowerCase().includes(search);

    const matchPlan = !planFilter || (c.plan || "bas") === planFilter;
    const matchStatus = !statusFilter || (c.status || "active") === statusFilter;

    return matchSearch && matchPlan && matchStatus;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === "displayName") return (a.displayName || "").localeCompare(b.displayName || "");
    if (sortBy === "ticketCount") return (b.ticketCount || 0) - (a.ticketCount || 0);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Update count
  const countEl = $("crmCustomerCount");
  if (countEl) countEl.textContent = `(${filtered.length} kunder)`;

  // Render list
  if (!filtered.length) {
    list.innerHTML = `<div class="muted small center" style="padding: 40px;">Inga kunder matchar sökningen.</div>`;
    return;
  }

  list.innerHTML = filtered.map(c => {
    const initials = (c.displayName || "??").substring(0, 2).toUpperCase();
    const plan = c.plan || "bas";
    const status = c.status || "active";
    const org = c.orgNr || c.orgNumber || "Ej angivet";

    // Status Icon
    const statusIcon = status === 'active'
      ? `<i class="fa-solid fa-circle-check" style="color:var(--ok);" title="Aktiv"></i>`
      : `<i class="fa-solid fa-circle-xmark" style="color:var(--danger);" title="Inaktiv"></i>`;

    return `
      <div class="crmCustomerCard" onclick="openCustomerModal('${c.companyId}')" style="display: grid; grid-template-columns: 50px 2fr 1.5fr 1fr 1fr auto; align-items: center; gap: 15px; padding: 15px; cursor: pointer; transition: background 0.2s;">
        <div class="avatar-small" style="background:var(--primary); color:white;">${initials}</div>
        
        <div class="info">
          <div class="name" style="font-weight:bold; font-size:16px; color:var(--text); display:flex; align-items:center; gap:8px;">
             ${escapeHtml(c.displayName)}
             ${statusIcon}
          </div>
          <div class="muted small" style="margin-top:2px;">
            <i class="fa-solid fa-building"></i> ${escapeHtml(org)}
          </div>
        </div>
        
        <div class="contact muted small">
           <div style="margin-bottom:2px;"><i class="fa-solid fa-envelope"></i> ${escapeHtml(c.contactEmail || '-')}</div>
           <div><i class="fa-solid fa-tag"></i> ${escapeHtml(c.companyId)}</div>
        </div>

        <div style="text-align:center;">
            <span class="planBadge ${plan}" style="padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform:uppercase;">${plan}</span>
        </div>
        
        <div style="text-align:center;">
             <span class="statusBadge ${status}" style="font-weight:bold; text-transform:uppercase;">${status}</span>
        </div>
        
        <div class="actions" style="display:flex; gap:10px;">
          <button class="btn secondary small" onclick="event.stopPropagation(); editCustomer('${c.companyId}')" title="Redigera">
            <i class="fa-solid fa-pen"></i> <span class="hide-mobile">Redigera</span>
          </button>
          <button class="btn danger small" onclick="event.stopPropagation(); deleteCompanyFromCrm('${c.companyId}', '${escapeHtml(c.displayName)}')" title="Ta bort">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function deleteCompanyFromCrm(companyId, name) {
  if (!confirm(`VARNING: Vill du verkligen TABORT ${name} (${companyId})?\n\nDetta raderar ALLA användare, ärenden och dokument kopplade till bolaget.\nDetta går inte att ångra.`)) return;

  try {
    await api(`/admin/companies/${companyId}`, { method: "DELETE" });
    toast("Raderat", `${name} har tagits bort och datan är rensad.`, "info");
    await refreshCustomers();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  const btn = input.nextElementSibling || input.parentElement.querySelector('button');
  if (btn) {
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    }
  }
}

async function openCustomerModal(companyId) {
  const customer = crmData.customers.find(c => c.companyId === companyId);
  if (!customer) return toast("Fel", "Kunden hittades ej", "error");

  const modal = $("crmCustomerModal");
  const nameEl = $("crmModalCustomerName");
  const bodyEl = $("crmModalBody");

  nameEl.textContent = customer.displayName;

  // Get ticket count
  let tickets = [];
  try {
    tickets = await api(`/inbox/tickets?companyId=${companyId}`);
  } catch (e) { }

  const openTickets = tickets.filter(t => t.status !== "solved").length;
  const solvedTickets = tickets.filter(t => t.status === "solved").length;

  bodyEl.innerHTML = `
    <div class="grid2" style="gap: 20px;">
      <div>
        <h4 style="margin-top: 0;"><i class="fa-solid fa-pen-to-square"></i> Redigera Uppgifter</h4>
        <div class="panel soft" style="padding: 15px;">
          <label>Företag / Namn</label>
          <input id="crmModalName" class="input" value="${escapeHtml(customer.displayName || '')}" />
          
          <label>Org.nr</label>
          <input id="crmModalOrg" class="input" value="${escapeHtml(customer.orgNr || '')}" />
          
          <label>Kontaktperson</label>
          <input id="crmModalContact" class="input" value="${escapeHtml(customer.contactName || '')}" />
          
          <label>E-post</label>
          <input id="crmModalEmail" class="input" value="${escapeHtml(customer.contactEmail || '')}" />

          <label>Telefon</label>
          <input id="crmModalPhone" class="input" value="${escapeHtml(customer.phone || '')}" />

          <label>Plan</label>
          <select id="crmModalPlan" class="input">
              <option value="trial" ${customer.plan === 'trial' ? 'selected' : ''}>Trial</option>
              <option value="bas" ${customer.plan === 'bas' ? 'selected' : ''}>BAS</option>
              <option value="pro" ${customer.plan === 'pro' ? 'selected' : ''}>PRO</option>
              <option value="enterprise" ${customer.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
          </select>
          
          <button id="crmSaveBtn" class="btn primary full" style="margin-top:15px;">
            <i class="fa-solid fa-floppy-disk"></i> Spara ändringar
          </button>
        </div>
        
        <div class="panel soft" style="padding:15px; margin-top:15px; border-color:${customer.status === 'active' ? 'var(--ok)' : 'var(--danger)'}">
           <label>Status & Åtkomst</label>
           <div class="row gap" style="align-items:center; justify-content:space-between;">
               <span class="statusBadge ${customer.status}" style="font-size:14px;">${customer.status.toUpperCase()}</span>
               
               <button class="btn secondary small" onclick="toggleCompanyStatus('${companyId}', '${customer.status === 'active' ? 'inactive' : 'active'}')">
                  ${customer.status === 'active' ? '<i class="fa-solid fa-ban"></i> Inaktivera' : '<i class="fa-solid fa-check"></i> Aktivera'}
               </button>
           </div>
        </div>
      </div>
      
      <div>
        <h4 style="margin-top: 0;"><i class="fa-solid fa-chart-bar"></i> Statistik</h4>
        <div class="slaGrid" style="grid-template-columns: repeat(2, 1fr);">
          <div class="slaCard small">
            <div class="slaLabel">Öppna ärenden</div>
            <div class="slaValue" style="font-size: 18px;">${openTickets}</div>
          </div>
          <div class="slaCard small">
            <div class="slaLabel">Lösta ärenden</div>
            <div class="slaValue" style="font-size: 18px;">${solvedTickets}</div>
          </div>
        </div>

        <h4 style="margin-top: 20px;"><i class="fa-solid fa-cog"></i> AI-inställningar</h4>
        <div class="panel soft" style="padding: 15px;">
             <p class="muted small">Dessa inställningar kan ändras via Företagsinställningar eller av admin i separat vy.</p>
            <p><b>Tonalitet:</b> ${customer.settings?.tone || 'professional'}</p>
            <p><b>Hälsning:</b> ${escapeHtml(customer.settings?.greeting || 'Standard')}</p>
        </div>
    
        <h4 style="margin-top: 20px;"><i class="fa-solid fa-clock-rotate-left"></i> Senaste ärenden</h4>
        <div class="list" style="max-height: 200px; overflow-y: auto;">
            ${tickets.slice(0, 5).map(t => `
            <div class="listItem" style="padding: 10px;">
                <div class="listItemTitle">
                ${escapeHtml(t.title || 'Ärende')}
                <span class="pill ${t.status === 'solved' ? 'ok' : t.status === 'pending' ? 'warn' : 'info'}">${t.status}</span>
                </div>
                <div class="muted small">${new Date(t.createdAt).toLocaleString('sv-SE')}</div>
            </div>
            `).join("") || '<div class="muted small center">Inga ärenden.</div>'}
        </div>
      </div>
    </div>
  `;

  modal.style.display = "flex";

  // Bind save
  const saveBtn = document.getElementById("crmSaveBtn");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      try {
        await api("/company/settings", {
          method: "PATCH",
          body: {
            companyId,
            settings: {
              displayName: $("crmModalName").value,
              contactName: $("crmModalContact").value,
              contactEmail: $("crmModalEmail").value,
              phone: $("crmModalPhone").value,
              plan: $("crmModalPlan").value,
              orgNr: $("crmModalOrg").value
            }
          }
        });
        toast("Sparat", "Kundinformation uppdaterad", "info");
        await refreshCustomers();
        openCustomerModal(companyId);
      } catch (e) {
        toast("Fel", "Kunde inte spara: " + e.message, "error");
      }
    };
  }
}

async function toggleCompanyStatus(companyId, newStatus) {
  try {
    await api("/company/settings", {
      method: "PATCH",
      body: { companyId, settings: { status: newStatus } }
    });
    toast("Uppdaterat", `Status ändrad till ${newStatus}`, "info");
    await refreshCustomers();
    openCustomerModal(companyId);
  } catch (e) { toast("Fel", e.message, "error"); }
}

function closeCrmModal() {
  $("crmCustomerModal").style.display = "none";
}

async function editCustomer(companyId) {
  toast("Info", "Redigering via Kategorier-tabben i Admin-panelen", "info");
  closeCrmModal();
}

async function deleteCompanyFromCrm(companyId, displayName) {
  await deleteCompany(companyId, displayName);
  await refreshCustomers();
}

function renderCrmActivity() {
  const list = $("crmActivityLog");
  if (!list) return;

  const filter = $("crmActivityFilter")?.value || "";
  const filtered = filter
    ? crmData.activities.filter(a => a.type === filter)
    : crmData.activities;

  list.innerHTML = filtered.length ? filtered.map(a => `
    <div class="crmActivityItem">
      <div class="icon ${a.type}"><i class="fa-solid ${a.icon}"></i></div>
      <div class="content">
        <div><b>${escapeHtml(a.title)}</b></div>
        <div class="muted small">${escapeHtml(a.description)}</div>
      </div>
      <div class="time">${timeAgo(a.time)}</div>
    </div>
  `).join("") : `<div class="muted small center" style="padding: 40px;">Ingen aktivitet.</div>`;
}

function renderCrmAnalytics() {
  const s = crmData.stats;

  // Plan Distribution Chart
  if (window.Chart && $("crmPlanDistributionChart")) {
    const ctx = $("crmPlanDistributionChart").getContext("2d");
    if (window.__crmPlanChart) window.__crmPlanChart.destroy();

    const planCounts = {
      trial: crmData.customers.filter(c => c.plan === "trial").length,
      bas: crmData.customers.filter(c => !c.plan || c.plan === "bas").length,
      pro: crmData.customers.filter(c => c.plan === "pro").length,
      enterprise: crmData.customers.filter(c => c.plan === "enterprise").length
    };

    window.__crmPlanChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Trial", "BAS", "PRO", "Enterprise"],
        datasets: [{
          data: [planCounts.trial, planCounts.bas, planCounts.pro, planCounts.enterprise],
          backgroundColor: ["#ffb020", "#6b7280", "#4c7dff", "#8a2be2"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: "#a6abc6", usePointStyle: true } }
        }
      }
    });
  }

  // Analytics Table
  const tableBody = $("crmAnalyticsTable");
  if (tableBody) {
    const plans = ["trial", "bas", "pro", "enterprise"];
    const prices = { trial: 0, bas: 0, pro: 499, enterprise: 2999 };

    tableBody.innerHTML = plans.map(plan => {
      const count = crmData.customers.filter(c => (c.plan || "bas") === plan).length;
      const pct = s.total ? Math.round(count / s.total * 100) : 0;
      const mrr = count * prices[plan];

      return `
        <tr>
          <td style="padding: 12px;"><span class="planBadge ${plan}">${plan.toUpperCase()}</span></td>
          <td style="padding: 12px; text-align: right;">${count}</td>
          <td style="padding: 12px; text-align: right;">${pct}%</td>
          <td style="padding: 12px; text-align: right;">${mrr.toLocaleString('sv-SE')} kr</td>
          <td style="padding: 12px; text-align: right;">--</td>
        </tr>
      `;
    }).join("") + `
      <tr style="font-weight: bold; background: var(--panel2);">
        <td style="padding: 12px;">TOTALT</td>
        <td style="padding: 12px; text-align: right;">${s.total}</td>
        <td style="padding: 12px; text-align: right;">100%</td>
        <td style="padding: 12px; text-align: right;">${crmData.customers.reduce((sum, c) => sum + (prices[c.plan || "bas"] || 0), 0).toLocaleString('sv-SE')
      } kr</td>
        <td style="padding: 12px; text-align: right;">--</td>
      </tr>
    `;
  }
}

async function createCrmCustomer() {
  const displayName = $("newCompanyDisplayName")?.value.trim();
  const companyId = $("newCompanyId")?.value.trim().toLowerCase().replace(/\s+/g, "-");
  const orgNr = $("newCompanyOrgNr")?.value.trim();
  const contactEmail = $("newCompanyContactEmail")?.value.trim();
  const contactName = $("newCompanyContactName")?.value.trim();
  const phone = $("newCompanyPhone")?.value.trim();
  const plan = $("newCompanyPlan")?.value || "bas";
  const status = $("newCompanyStatus")?.value || "active";
  const notes = $("newCompanyNotes")?.value.trim();

  if (!displayName || !companyId) {
    return toast("Saknas", "Företagsnamn och ID krävs", "error");
  }

  // Check if exists
  if (crmData.customers.find(c => c.companyId === companyId)) {
    return toast("Fel", "Företags-ID finns redan", "error");
  }

  try {
    // Create via API
    // Create via API (POST /admin/companies)
    await api("/admin/companies", {
      method: "POST",
      body: {
        companyId,
        displayName,
        orgNr,
        contactEmail,
        contactName,
        phone,
        plan,
        status,
        notes,
        // AI settings default
        tone: "professional",
        greeting: `Välkommen till ${displayName}!`
      }
    });

    toast("Skapat", `Kund "${displayName}" skapades`, "info");

    // Clear form
    $("newCompanyDisplayName").value = "";
    $("newCompanyId").value = "";
    $("newCompanyOrgNr").value = "";
    $("newCompanyContactEmail").value = "";
    $("newCompanyContactName").value = "";
    $("newCompanyPhone").value = "";
    $("newCompanyNotes").value = "";

    // Reload
    await loadCompanies();
    await refreshCustomers();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

function exportCrmData() {
  const rows = [
    ["Företag", "ID", "Org.nr", "Kontakt", "E-post", "Telefon", "Plan", "Status", "Skapad"]
  ];

  crmData.customers.forEach(c => {
    rows.push([
      c.displayName || "",
      c.companyId || "",
      c.orgNr || c.settings?.orgNr || "",
      c.contactName || c.settings?.contactName || "",
      c.contactEmail || c.settings?.contactEmail || "",
      c.phone || c.settings?.phone || "",
      c.plan || c.settings?.plan || "bas",
      c.status || c.settings?.status || "active",
      new Date(c.createdAt).toLocaleDateString('sv-SE')
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${v}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm_export_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  toast("Exporterat", `${crmData.customers.length} kunder exporterade till CSV`, "info");
}

/* =========================
   Profile / Settings
 ========================= */
async function loadProfile() {
  if (!state.me) return;

  const avatar = $("profileAvatar");
  const nameDisp = $("profileNameDisplay");
  const badge = $("profileRoleBadge");
  const emailInput = $("profileEmail");
  const usernameInput = $("newUsernameInput");
  const statsBox = $("roleBasedStats");

  if (nameDisp) nameDisp.textContent = state.me.username;
  if (emailInput) emailInput.value = state.me.email || "Ingen e-post angiven";
  if (usernameInput) usernameInput.value = state.me.username;
  if (avatar) avatar.textContent = state.me.username.substring(0, 2).toUpperCase();

  if (badge) {
    badge.className = `badge-${state.me.role}`;
    badge.textContent = state.me.role.toUpperCase();
  }

  try {
    const stats = await api("/me/stats");
    if (statsBox) {
      let html = "";
      if (state.me.role === "user") {
        html = `
            <div class="slaGrid">
                <div class="slaCard" style="padding:10px;">
                    <div class="slaLabel">Skapade</div>
                    <div class="slaValue" style="font-size:20px;">${stats.ticketsCreated}</div>
                </div>
                <div class="slaCard" style="padding:10px;">
                    <div class="slaLabel">Lösta</div>
                    <div class="slaValue" style="font-size:20px;">${stats.ticketsResolved}</div>
                </div>
            </div>
        `;
      } else if (state.me.role === "agent" || state.me.role === "admin") {
        html = `
            <div class="slaGrid">
                <div class="slaCard" style="padding:10px;">
                    <div class="slaLabel">Hanterade</div>
                    <div class="slaValue" style="font-size:20px;">${stats.ticketsHandled}</div>
                </div>
                <div class="slaCard" style="padding:10px;">
                    <div class="slaLabel">Dina Solves</div>
                    <div class="slaValue" style="font-size:20px;">${stats.ticketsSolved}</div>
                </div>
            </div>
        `;
        if (state.me.role === "admin") {
          html += `
              <div class="panel soft" style="margin-top:10px; border:none; background:rgba(255,184,0,0.05);">
                  <div class="muted small"><i class="fa-solid fa-crown" style="color:#ffb800"></i> Admin Översikt</div>
                  <div class="row gap small" style="margin-top:5px;">
                      <span>Users: <b>${stats.totalUsers}</b></span>
                      <span>Tickets: <b>${stats.totalSystemTickets}</b></span>
                  </div>
              </div>
          `;
        }
      }
      statsBox.innerHTML = html;
    }
  } catch (e) { console.error("Stats Error:", e); }
}

async function changeUsername() {
  const newName = $("newUsernameInput")?.value.trim();
  if (!newName) return toast("Fel", "Ange ett nytt namn", "error");
  try {
    await api("/me/username", { method: "PATCH", body: { username: newName } });
    state.me.username = newName;
    toast("Klart", "Namn uppdaterat", "info");
    await loadProfile();
    updateRoleUI();
  } catch (e) { toast("Fel", e.message, "error"); }
}

async function changePassword() {
  const currentPassword = $("currentPassInput")?.value;
  const newPassword = $("newPassInput")?.value;
  if (!currentPassword || !newPassword) return toast("Fel", "Fyll i båda fält", "error");
  try {
    await api("/me/password", { method: "PATCH", body: { currentPassword, newPassword } });
    toast("Klart", "Lösenord bytt ✅", "info");
    $("currentPassInput").value = "";
    $("newPassInput").value = "";
  } catch (e) { toast("Fel", e.message, "error"); }
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
      <div class="muted small">${escapeHtml(t.publicTicketId || "")}</div>
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
  } catch { }
}

async function renderMyTicketDetails(ticketId) {
  const box = $("myTicketDetails");
  if (!box) return;
  try {
    const t = await api("/tickets/" + ticketId);
    state.activeTicketId = t._id;
    state.activeTicketPublicId = t.publicTicketId;
    renderDebug();
    const msgs = (t.messages || [])
      .map((m) => `<div class="muted small"><b>${escapeHtml(m.role)}:</b> ${escapeHtml(m.content)}</div>`)
      .join("<br>");
    box.innerHTML = `
      <div><b>${escapeHtml(t.title || "Ärende")}</b></div>
      <div class="muted small">${escapeHtml(t.publicTicketId)} • ${escapeHtml(t.status)} • ${escapeHtml(t.priority)}</div>
      <div class="divider"></div>
      ${msgs || "<div class='muted small'>Inga meddelanden ännu.</div>"}
    `;
  } catch (e) { box.textContent = "Kunde inte ladda ticket: " + e.message; }
}

async function replyMyTicket() {
  const text = $("myTicketReplyText")?.value?.trim();
  if (!text) return toast("Saknas", "Skriv ett meddelande", "error");
  if (!state.activeTicketId) return toast("Saknas", "Välj ett ärende först", "error");
  try {
    await api(`/tickets/${state.activeTicketId}/reply`, { method: "POST", body: { message: text } });
    $("myTicketReplyText").value = "";
    toast("Skickat", "Ditt meddelande skickades ✅", "info");
    await renderMyTicketDetails(state.activeTicketId);
    await refreshMyTickets();
  } catch (e) { toast("Fel", e.message, "error"); }
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
    const isHigh = t.priority === "high";
    const priClass = isHigh ? "danger" : t.priority === "low" ? "muted" : "info";
    div.className = "listItem " + (isHigh ? "important-highlight" : "");
    div.innerHTML = `
      <div class="listItemTitle">
        ${isHigh ? '<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i> ' : ""}
        ${escapeHtml(t.title || "Ticket")}
        <span class="pill ${priClass}">${escapeHtml(t.priority || "normal")}</span>
        <span class="pill">${escapeHtml(t.status)}</span>
      </div>
      <div class="muted small">${escapeHtml(t.publicTicketId)} • ${escapeHtml(t.companyId)} • ${new Date(t.lastActivityAt).toLocaleString('sv-SE')}</div>
    `;
    div.addEventListener("click", () => selectInboxTicket(t._id));
    list.appendChild(div);
  });
}

async function loadInboxTickets() {
  try {
    const status = $("inboxStatusFilter")?.value || "";
    const companyId = $("inboxCategoryFilter")?.value || "";
    const tickets = await api(`/inbox/tickets?status=${encodeURIComponent(status)}&companyId=${encodeURIComponent(companyId)}`);
    state.inboxTickets = tickets || [];
    renderInboxList();
  } catch (e) { console.error("Inbox Load Error:", e); }
}

async function selectInboxTicket(ticketId) {
  state.inboxSelectedTicket = state.inboxTickets.find((t) => t._id === ticketId) || null;
  const box = $("ticketDetails");
  if (!box || !state.inboxSelectedTicket) return;
  const t = await api("/tickets/" + ticketId);
  const msgs = (t.messages || [])
    .map((m) => `<div class="muted small"><b>${escapeHtml(m.role)}:</b> ${escapeHtml(m.content)}</div>`)
    .join("<br>");
  box.innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:flex-start;">
        <div>
            <b>${escapeHtml(t.title || "Ticket")}</b><br>
            <span class="muted small">${escapeHtml(t.publicTicketId)} • ${escapeHtml(t.status)}</span>
        </div>
        <button class="btn ghost small" onclick="summarizeTicket('${t._id}')">
            <i class="fa-solid fa-wand-magic-sparkles"></i> AI Sammanfatta
        </button>
    </div>
    <div id="ticketSummaryContent" class="alert info small" style="display:none; margin-top:10px;"></div>
    <div class="divider"></div>
    ${msgs || "<div class='muted small'>Inga meddelanden ännu.</div>"}
  `;
  const priSel = $("ticketPrioritySelect");
  if (priSel) priSel.value = t.priority || "normal";
  if (t.internalNotes && t.internalNotes.length > 0) {
    const notesHtml = t.internalNotes.map(n => `<div class="alert info tiny" style="margin-top:5px; border-style:dashed;"><i class="fa-solid fa-note-sticky"></i> ${escapeHtml(n.content)}</div>`).join("");
    box.innerHTML += `<div style="margin-top:15px;"><b>Interna noter:</b>${notesHtml}</div>`;
  }
  const userSel = $("assignUserSelect");
  if (userSel) userSel.value = t.assignedToUserId || "";
}

async function summarizeTicket(id) {
  const contentBox = $("ticketSummaryContent");
  if (contentBox) {
    contentBox.style.display = "block";
    contentBox.textContent = "Genererar sammanfattning... ✨";
    try {
      const res = await api(`/tickets/${id}/summary`);
      contentBox.textContent = "AI Sammanfattning: " + res.summary;
    } catch (e) { contentBox.textContent = "Kunde inte sammanfatta: " + e.message; }
  }
}

async function setInboxStatus(status) {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/status`, { method: "PATCH", body: { status } });
  toast("OK", "Status uppdaterad ✅", "info");
  await loadInboxTickets();
}

async function setInboxPriority() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const priority = $("ticketPrioritySelect")?.value || "normal";
  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/priority`, { method: "PATCH", body: { priority } });
  toast("OK", "Prioritet uppdaterad ✅", "info");
  await loadInboxTickets();
}

async function sendAgentReplyInbox() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const text = $("agentReplyTextInbox")?.value?.trim();
  if (!text) return toast("Saknas", "Skriv ett svar", "error");
  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/reply`, { method: "POST", body: { message: text } });
  $("agentReplyTextInbox").value = "";
  toast("Skickat", "Svar skickat ✅", "info");
  await selectInboxTicket(state.inboxSelectedTicket._id);
  await loadInboxTickets();
}

async function saveInternalNote() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const content = $("internalNoteText")?.value?.trim();
  if (!content) return toast("Saknas", "Skriv en note", "error");
  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/note`, { method: "POST", body: { content } });
  $("internalNoteText").value = "";
  toast("Klar", "Intern note sparad ✅", "info");
  await selectInboxTicket(state.inboxSelectedTicket._id);
}

async function clearInternalNotes() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  if (!confirm("Vill du radera alla interna noter på denna ticket?")) return;
  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/notes`, { method: "DELETE" });
  toast("Raderat", "Notes raderade ✅", "info");
  await selectInboxTicket(state.inboxSelectedTicket._id);
}

async function assignTicket() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  const userId = $("assignUserSelect")?.value;
  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}/assign`, { method: "PATCH", body: { userId } });
  toast("Klar", "Ärende tilldelat ✅", "info");
  await loadInboxTickets();
}

async function deleteTicket() {
  if (!state.inboxSelectedTicket) return toast("Saknas", "Välj en ticket först", "error");
  if (!confirm("ÄR DU SÄKER? Detta raderar ticketen permanent!")) return;
  await api(`/inbox/tickets/${state.inboxSelectedTicket._id}`, { method: "DELETE" });
  toast("Raderat", "Ticket borta för alltid", "warning");
  state.inboxSelectedTicket = null;
  $("ticketDetails").innerHTML = "Välj en ticket.";
  await loadInboxTickets();
}

/* =========================
   SLA
========================= */
async function loadSlaDashboard() {
  const days = $("slaDaysSelect")?.value || "30";

  try {
    // Fetch all data in parallel for performance
    const [overview, trend, agents, topTopics, escalation, comparison, questions, hourly, insights] = await Promise.all([
      api(`/sla/overview?days=${encodeURIComponent(days)}`),
      api(`/sla/trend?days=${encodeURIComponent(days)}`),
      api(`/sla/agents/detailed?days=${encodeURIComponent(days)}`),
      api(`/sla/top-topics`),
      api(`/sla/escalation?days=${encodeURIComponent(days)}`),
      api(`/sla/comparison?days=${encodeURIComponent(days)}`),
      api(`/sla/questions?days=${encodeURIComponent(days)}`),
      api(`/sla/hourly?days=${Math.min(days, 14)}`),
      api(`/sla/insights?days=${encodeURIComponent(days)}`)
    ]);

    // ===== TAB 1: OVERVIEW =====
    const overviewBox = $("slaOverviewBox");
    if (overviewBox) {
      overviewBox.innerHTML = `
        <div class="slaGrid">
          <div class="slaCard">
            <div class="slaLabel"><i class="fa-solid fa-ticket"></i> Total Ärenden</div>
            <div class="slaValue">${overview.counts.total}</div>
            <div class="slaDelta up">Senaste ${days} dagar</div>
          </div>
          <div class="slaCard">
            <div class="slaLabel"><i class="fa-solid fa-circle-check"></i> Lösta</div>
            <div class="slaValue">${overview.counts.solved}</div>
            <div class="slaDelta ${overview.counts.solved > overview.counts.total * 0.5 ? 'up' : 'down'}">${overview.counts.total > 0 ? ((overview.counts.solved / overview.counts.total) * 100).toFixed(1) : 0}%</div>
          </div>
          <div class="slaCard">
            <div class="slaLabel"><i class="fa-solid fa-robot"></i> AI Solve Rate</div>
            <div class="slaValue">${overview.aiRate}%</div>
            <div class="slaDelta up">Automatisk hantering</div>
          </div>
          <div class="slaCard">
            <div class="slaLabel"><i class="fa-solid fa-stopwatch"></i> Snitt Lösningstid</div>
            <div class="slaValue">${overview.avgSolveHours}h</div>
            <div class="slaDelta">Resolution SLA</div>
          </div>
          <div class="slaCard">
            <div class="slaLabel"><i class="fa-solid fa-star"></i> Kundnöjdhet</div>
            <div class="slaValue">${overview.avgCsat}</div>
            <div class="slaDelta up">CSAT Score</div>
          </div>
          <div class="slaCard">
            <div class="slaLabel"><i class="fa-solid fa-fire"></i> High Priority</div>
            <div class="slaValue" style="color: ${overview.counts.total > 0 && (overview.counts.total * 0.2) < (overview.counts.open || 0) ? 'var(--error)' : 'inherit'}">
              ${((overview.counts.open || 0) + (overview.counts.pending || 0))}
            </div>
            <div class="slaDelta">Öppna/Väntande</div>
          </div>
        </div>
      `;
    }

    // Top Topics
    const topicsBox = $("slaTopTopicsBox");
    if (topicsBox) {
      topicsBox.innerHTML = topTopics.length ? topTopics.map((t, i) => `
        <div class="listItem" style="cursor:default">
          <div class="listItemTitle">
            <span class="muted" style="width:24px; font-weight:bold;">#${i + 1}</span>
            ${escapeHtml(t.topic)}
            <span class="pill" style="margin-left:auto">${t.count} träffar</span>
          </div>
        </div>
      `).join("") : '<div class="muted small p-10">Ingen trend-data tillgänglig än.</div>';
    }

    // Daily Distribution
    const dailyBox = $("slaDailyDistribution");
    if (dailyBox && hourly.dailyDistribution) {
      const dayLabels = { Mon: "Mån", Tue: "Tis", Wed: "Ons", Thu: "Tor", Fri: "Fre", Sat: "Lör", Sun: "Sön" };
      const maxVal = Math.max(...Object.values(hourly.dailyDistribution)) || 1;
      dailyBox.innerHTML = `
        <div style="display:flex; gap:8px; align-items:flex-end; height:100px;">
          ${Object.entries(hourly.dailyDistribution).map(([day, count]) => `
            <div style="flex:1; text-align:center;">
              <div style="background:var(--primary); height:${Math.max(5, (count / maxVal) * 80)}px; border-radius:4px 4px 0 0; transition: height 0.3s;"></div>
              <div class="muted tiny" style="margin-top:5px;">${dayLabels[day] || day}</div>
              <div class="muted tiny">${count}</div>
            </div>
          `).join("")}
        </div>
        <div class="muted small" style="margin-top:10px; text-align:center;">
          <i class="fa-solid fa-sun"></i> Peak: <b>${hourly.peakHour}</b> | 
          <i class="fa-solid fa-moon"></i> Lugnt: <b>${hourly.quietHour}</b>
        </div>
      `;
    }

    // Trend Chart
    if (window.Chart && $("slaTrendChart")) {
      const ctx = $("slaTrendChart").getContext("2d");
      if (window.__slaChart) window.__slaChart.destroy();
      window.__slaChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: trend.map(r => r.week),
          datasets: [
            { label: "Inkommande", data: trend.map(r => r.total), borderColor: "#4c7dff", backgroundColor: "rgba(76, 125, 255, 0.1)", fill: true, tension: 0.4 },
            { label: "Lösta", data: trend.map(r => r.solved), borderColor: "#37d67a", backgroundColor: "rgba(55, 214, 122, 0.1)", fill: true, tension: 0.4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: '#a6abc6', usePointStyle: true } } },
          scales: { x: { grid: { display: false }, ticks: { color: '#a6abc6' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a6abc6' } } }
        }
      });
    }

    // Hourly Chart
    if (window.Chart && $("slaHourlyChart") && hourly.hourly) {
      const ctx2 = $("slaHourlyChart").getContext("2d");
      if (window.__slaHourlyChart) window.__slaHourlyChart.destroy();
      window.__slaHourlyChart = new Chart(ctx2, {
        type: "bar",
        data: {
          labels: hourly.hourly.map((_, i) => `${i}:00`),
          datasets: [{
            label: "Ärenden",
            data: hourly.hourly,
            backgroundColor: "rgba(76, 125, 255, 0.6)",
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false }, ticks: { color: '#a6abc6', maxRotation: 45 } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a6abc6' } } }
        }
      });
    }

    // ===== TAB 2: ESCALATION =====
    $("escTotalVal").textContent = escalation.total;
    $("escAiVal").textContent = escalation.aiOnlySolved;
    $("escAiRate").textContent = escalation.aiSolveRate + "%";
    $("escHumanVal").textContent = escalation.escalatedCount;
    $("escHumanRate").textContent = escalation.escalationRate + "%";
    $("escTimeVal").textContent = escalation.avgTimeToEscalation;

    const escOverview = $("slaEscalationOverview");
    if (escOverview) {
      const aiRate = parseFloat(escalation.aiSolveRate) || 0;
      const humanRate = parseFloat(escalation.escalationRate) || 0;
      escOverview.innerHTML = `
        <div style="display:flex; align-items:center; gap:20px;">
          <div style="flex:1;">
            <div style="display:flex; height:20px; border-radius:10px; overflow:hidden; background:var(--panel2); border: 1px solid var(--border);">
              <div style="width:${aiRate}%; background: linear-gradient(90deg, var(--ok), var(--primary)); transition: width 0.5s;"></div>
              <div style="width:${humanRate}%; background: linear-gradient(90deg, var(--danger), var(--warn)); transition: width 0.5s;"></div>
            </div>
            <div class="row gap" style="margin-top:10px; font-size:12px;">
              <span><i class="fa-solid fa-robot" style="color:var(--ok);"></i> AI: ${aiRate}%</span>
              <span style="margin-left:auto;"><i class="fa-solid fa-user" style="color:var(--warn);"></i> Människa: ${humanRate}%</span>
            </div>
          </div>
        </div>
      `;
    }

    const escReasons = $("slaEscalationReasons");
    if (escReasons && escalation.topReasons) {
      escReasons.innerHTML = escalation.topReasons.length ? escalation.topReasons.map((r, i) => `
        <div class="listItem" style="cursor:default; padding:10px;">
          <div class="listItemTitle">
            <span class="pill ${i === 0 ? 'warn' : ''}" style="margin-right:10px;">#${i + 1}</span>
            <b>"${escapeHtml(r.reason)}"</b>
            <span style="margin-left:auto;">${r.count} ggr (${r.percentage}%)</span>
          </div>
        </div>
      `).join("") : '<div class="muted small center">Inga tydliga eskaleringsorsaker hittades.</div>';
    }

    // ===== TAB 3: QUESTIONS =====
    $("qTotalMessages").textContent = questions.totalMessages;
    $("qUserMessages").textContent = questions.userMessages;
    $("qAiMessages").textContent = questions.aiMessages;
    $("qAgentMessages").textContent = questions.agentMessages;
    $("qAvgConv").textContent = questions.avgConversationLength;
    $("qResponseRatio").textContent = questions.responseRatio + "x";

    const qTypes = $("slaQuestionTypes");
    if (qTypes && questions.typeBreakdown) {
      qTypes.innerHTML = questions.typeBreakdown.length ? questions.typeBreakdown.map((t, i) => `
        <div class="listItem" style="cursor:default; padding:10px;">
          <div class="listItemTitle">
            <span class="pill" style="margin-right:10px;">${i + 1}</span>
            <b>${escapeHtml(t.type)}</b>
            <span style="margin-left:auto;">${t.count} (${t.percentage}%)</span>
          </div>
          <div style="margin-top:5px; height:6px; background:#333; border-radius:3px; overflow:hidden;">
            <div style="width:${t.percentage}%; height:100%; background: linear-gradient(90deg, #4c7dff, #8a2be2);"></div>
          </div>
        </div>
      `).join("") : '<div class="muted small center">Ingen frågedata tillgänglig.</div>';
    }

    // Question Types Chart
    if (window.Chart && $("slaQuestionTypesChart") && questions.typeBreakdown?.length) {
      const ctx3 = $("slaQuestionTypesChart").getContext("2d");
      if (window.__slaQuestionsChart) window.__slaQuestionsChart.destroy();
      window.__slaQuestionsChart = new Chart(ctx3, {
        type: "doughnut",
        data: {
          labels: questions.typeBreakdown.map(t => t.type),
          datasets: [{
            data: questions.typeBreakdown.map(t => t.count),
            backgroundColor: ["#4c7dff", "#37d67a", "#ffa726", "#ff6b6b", "#8a2be2", "#00bcd4"],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, position: "right", labels: { color: '#a6abc6', usePointStyle: true } } }
        }
      });
    }

    // ===== TAB 4: COMPARISON =====
    const compCurrent = $("compCurrentStats");
    const compPrevious = $("compPreviousStats");
    if (compCurrent && comparison.current) {
      compCurrent.innerHTML = `
        <div class="slaGrid" style="gap:8px;">
          <div><b>${comparison.current.total}</b> <span class="muted tiny">ärenden</span></div>
          <div><b>${comparison.current.solved}</b> <span class="muted tiny">lösta</span></div>
          <div><b>${comparison.current.aiRate}%</b> <span class="muted tiny">AI</span></div>
        </div>
      `;
    }
    if (compPrevious && comparison.previous) {
      compPrevious.innerHTML = `
        <div class="slaGrid" style="gap:8px;">
          <div><b>${comparison.previous.total}</b> <span class="muted tiny">ärenden</span></div>
          <div><b>${comparison.previous.solved}</b> <span class="muted tiny">lösta</span></div>
          <div><b>${comparison.previous.aiRate}%</b> <span class="muted tiny">AI</span></div>
        </div>
      `;
    }

    // Deltas
    const formatDelta = (val) => {
      const num = parseFloat(val) || 0;
      const color = num > 0 ? 'var(--ok)' : num < 0 ? 'var(--error)' : 'inherit';
      const prefix = num > 0 ? '+' : '';
      return `<span style="color:${color}">${prefix}${num}%</span>`;
    };
    if (comparison.deltas) {
      $("deltaTotal").innerHTML = formatDelta(comparison.deltas.total);
      $("deltaSolved").innerHTML = formatDelta(comparison.deltas.solved);
      $("deltaAiSolved").innerHTML = formatDelta(comparison.deltas.aiSolved);
      $("deltaHighPriority").innerHTML = formatDelta(comparison.deltas.highPriority);
    }

    // ===== TAB 5: INSIGHTS & TIPS =====
    const insightsBox = $("slaInsightsBox");
    if (insightsBox && insights.insights) {
      insightsBox.innerHTML = insights.insights.length ? insights.insights.map(ins => `
        <div class="alert ${ins.type}" style="margin-bottom:8px; font-size:13px;">
          <i class="fa-solid ${ins.icon}"></i> ${escapeHtml(ins.text)}
        </div>
      `).join("") : '<div class="muted small center">Ingen data för insikter.</div>';
    }

    const tipsBox = $("slaTipsBox");
    if (tipsBox && insights.tips) {
      tipsBox.innerHTML = insights.tips.length ? insights.tips.map(tip => `
        <div class="listItem" style="cursor:default; padding:10px;">
          <div class="listItemTitle">
            <i class="fa-solid ${tip.icon}" style="color:var(--warning); margin-right:8px;"></i>
            ${escapeHtml(tip.text)}
            <span class="pill ${tip.priority === 'high' ? 'warn' : ''}" style="margin-left:auto;">${tip.priority}</span>
          </div>
        </div>
      `).join("") : '<div class="muted small center">Inga tips just nu.</div>';
    }

    // ===== TAB 6: AGENT LEADERBOARD =====
    const tableBody = $("slaAgentsTableBody");
    if (tableBody && agents) {
      tableBody.innerHTML = agents.length ? agents.map((a, i) => `
        <tr style="${i === 0 ? 'background: rgba(255, 215, 0, 0.1);' : ''}">
          <td>
            ${i === 0 ? '<i class="fa-solid fa-crown" style="color:gold;"></i>' :
          i === 1 ? '<i class="fa-solid fa-medal" style="color:silver;"></i>' :
            i === 2 ? '<i class="fa-solid fa-medal" style="color:#cd7f32;"></i>' : (i + 1)}
          </td>
          <td><b>${escapeHtml(a.agentName)}</b></td>
          <td>${a.handled}</td>
          <td>${a.solved}</td>
          <td>${a.highPriority}</td>
          <td>${a.avgMessagesPerTicket}</td>
          <td><div class="pill ${a.efficiency > 70 ? 'ok' : 'warn'}">${a.efficiency}%</div></td>
          <td>${a.avgCsat}</td>
          <td style="text-align:right; font-weight:bold; color:var(--primary);">${a.score}</td>
        </tr>
      `).join("") : '<tr><td colspan="9" class="muted center">Inga agenter aktiva under perioden.</td></tr>';

      // Top Performer
      if (agents.length > 0) {
        const top = agents[0];
        const initials = top.agentName.slice(0, 2).toUpperCase();
        $("topPerformerAvatar").textContent = initials;
        $("topPerformerName").textContent = top.agentName;
        $("topPerformerStats").innerHTML = `
          <b>${top.solved}</b> lösta | <b>${top.efficiency}%</b> effektivitet | <b>${top.score}</b> poäng
        `;
      }

      // Agent Pie Chart
      if (window.Chart && $("slaAgentPieChart") && agents.length) {
        const ctx4 = $("slaAgentPieChart").getContext("2d");
        if (window.__slaAgentPie) window.__slaAgentPie.destroy();
        window.__slaAgentPie = new Chart(ctx4, {
          type: "pie",
          data: {
            labels: agents.slice(0, 5).map(a => a.agentName),
            datasets: [{
              data: agents.slice(0, 5).map(a => a.handled),
              backgroundColor: ["#4c7dff", "#37d67a", "#ffa726", "#ff6b6b", "#8a2be2"],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, position: "right", labels: { color: '#a6abc6', usePointStyle: true } } }
          }
        });
      }
    }

  } catch (e) {
    console.error("SLA Dashboard Error:", e);
    toast("Fel", "Kunde inte ladda dashboard-data: " + e.message, "error");
  }
}

async function exportSlaCsv() {
  toast("Export", "Förbereder CSV...", "info");
  const days = $("slaDaysSelect")?.value || "30";
  try {
    const [overview, agents] = await Promise.all([api(`/sla/overview?days=${days}`), api(`/sla/agents?days=${days}`)]);
    let csv = "Metric,Value\nTotal Tickets," + overview.counts.total + "\nSolved Tickets," + overview.counts.solved + "\nAI Solve Rate," + overview.aiRate + "%\nAvg Solve Time," + overview.avgSolveHours + "h\nAvg CSAT," + overview.avgCsat + "\n\nAgent,Handled,Solved,Efficiency\n";
    agents.forEach(a => { csv += `${a.agentName},${a.handled},${a.solved},${a.efficiency}%\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `SLA_Report_${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
  } catch (e) { toast("Fel", "Export misslyckades", "error"); }
}

async function clearSla(scope) {
  const msg = scope === 'all' ? "Vill du radera ALL statistik (hela databasen)?" : "Vill du radera DIN statistik?";
  if (!confirm(msg)) return;
  try {
    await api(scope === 'all' ? "/sla/clear/all" : "/sla/clear/my", { method: "DELETE" });
    toast("Raderat", "Statistik har rensats ✅", "info");
    await loadSlaDashboard();
  } catch (e) { toast("Fel", e.message, "error"); }
}

/* =========================
   Billing
========================= */
async function loadBilling() {
  try {
    const [details, history] = await Promise.all([api("/billing/details"), api("/billing/history")]);
    if ($("currentPlanName")) $("currentPlanName").textContent = details.plan.toUpperCase();
    if ($("currentPlanStatus")) $("currentPlanStatus").textContent = details.status;
    if ($("billingUsageVal")) $("billingUsageVal").textContent = details.usage.percent + "%";
    if ($("billingUsageLabel")) $("billingUsageLabel").textContent = `${details.usage.current} / ${details.usage.limit} ärenden`;
    if ($("nextBillingDate")) $("nextBillingDate").textContent = details.nextInvoice;
    const activeLabel = $("activePlanLabel");
    if (activeLabel) activeLabel.textContent = details.planInfo.name;
    const activeFeatures = $("activePlanFeatures");
    if (activeFeatures) activeFeatures.innerHTML = details.planInfo.features.map(f => `<li style="font-size:13px;"><i class="fa-solid fa-circle-check" style="color:var(--ok)"></i> ${f}</li>`).join("");
    const proCard = $("planCardPro");
    const basCard = $("planCardBas");
    if (details.plan === "pro") {
      if (proCard) { proCard.style.boxShadow = "0 0 20px rgba(76, 125, 255, 0.3)"; proCard.style.borderColor = "var(--primary)"; }
      const upBtn = $("upgradeToProBtn");
      if (upBtn) { upBtn.textContent = "Din nuvarande plan"; upBtn.disabled = true; upBtn.className = "btn ghost full"; }
    } else if (basCard) { basCard.style.boxShadow = "0 0 20px rgba(55, 214, 122, 0.15)"; }
    const list = $("billingHistoryList");
    if (list) list.innerHTML = history.invoices.length ? history.invoices.map(inv => `<tr><td>${inv.date}</td><td><b>${inv.amount}</b></td><td><span class="pill ok">${inv.status}</span></td><td style="text-align:right"><a href="${inv.url}" class="btn ghost small"><i class="fa-solid fa-file-pdf"></i></a></td></tr>`).join("") : '<tr><td colspan="4" class="muted center">Inga fakturor än.</td></tr>';
  } catch (e) { toast("Fel", "Kunde inte ladda betalningsinformation", "error"); }
}

async function upgradeToPro() {
  try {
    const res = await api("/billing/create-checkout", { method: "POST", body: { plan: "pro", companyId: state.companyId } });
    if (res?.message?.includes("DEMO")) toast("Demo Mode", res.message, "info");
    else if (res?.url && res.url !== "#") window.location.href = res.url;
    else toast("Stripe", "Stripe integration påbörjad. Se .env för att aktivera skarpt läge.", "info");
  } catch (e) { toast("Fel", e.message, "error"); }
}

/* =========================
   Admin
========================= */
async function loadAdminUsers() {
  const list = $("adminUsersList");
  if (!list) return;
  try {
    const users = await api("/admin/users");
    list.innerHTML = "";
    (users || []).forEach((u) => {
      const div = document.createElement("div"); div.className = "listItem"; div.style.display = "flex"; div.style.alignItems = "center"; div.style.justifyContent = "space-between";
      const info = document.createElement("div"); info.innerHTML = `<div class="listItemTitle">${escapeHtml(u.username)} <span class="pill ${u.role === 'admin' ? 'admin' : (u.role === 'agent' ? 'ok' : '')}">${escapeHtml(u.role)}</span></div><div class="muted small">${escapeHtml(u.email || "Ingen e-post")} • ID: ${u._id.slice(-6)}</div>`;
      div.appendChild(info);
      const actions = document.createElement("div"); actions.style.display = "flex"; actions.style.gap = "8px";
      if (state.me?.role === "admin" && state.me?._id !== u._id) {
        const sel = document.createElement("select"); sel.className = "input smallInput"; sel.style.width = "auto";
        ["user", "agent", "admin"].forEach(r => { const opt = document.createElement("option"); opt.value = r; opt.textContent = r; if (u.role === r) opt.selected = true; sel.appendChild(opt); });
        sel.onchange = async () => { try { await api(`/admin/users/${u._id}/role`, { method: "PATCH", body: { role: sel.value } }); toast("Uppdaterat", `Roll ändrad till ${sel.value}`, "info"); await loadAdminUsers(); } catch (e) { toast("Fel", e.message, "error"); } };
        actions.appendChild(sel);
        const delBtn = document.createElement("button"); delBtn.className = "btn danger small"; delBtn.innerHTML = `<i class="fa-solid fa-user-slash"></i>`; delBtn.onclick = async () => { if (!confirm(`Vill du radera ${u.username}?`)) return; try { await api(`/admin/users/${u._id}`, { method: "DELETE" }); toast("Borttagen", "Användaren har raderats", "info"); await loadAdminUsers(); } catch (e) { toast("Fel", e.message, "error"); } };
        actions.appendChild(delBtn);
      }
      div.appendChild(actions); list.appendChild(div);
    });
  } catch (e) { toast("Fel", "Kunde inte ladda användare", "error"); }
}

async function loadAdminDiagnostics() {
  const box = $("diagnosticsBox");
  if (!box) return;
  try {
    const d = await api("/admin/diagnostics");
    box.innerHTML = `
            <div class="slaGrid">
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-heart-pulse"></i> Status</div>
                    <div class="slaValue" style="color:var(--ok)">${d.status}</div>
                    <div class="slaDelta up">Systemet mår bra</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-database"></i> Database</div>
                    <div class="slaValue">${d.database}</div>
                    <div class="slaDelta up">Mongoose v${d.server.node_version}</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-microchip"></i> Memory</div>
                    <div class="slaValue">${d.server.memory_usage}</div>
                    <div class="slaDelta">Heap Used</div>
                </div>
                <div class="slaCard">
                    <div class="slaLabel"><i class="fa-solid fa-clock"></i> Uptime</div>
                    <div class="slaValue">${d.server.uptime}</div>
                    <div class="slaDelta up">Senaste omstart</div>
                </div>
            </div>
            <div class="grid2" style="margin-top:20px;">
                <div class="panel">
                    <div class="panelHead"><b><i class="fa-solid fa-chart-pie"></i> Databas-statistik</b></div>
                    <div class="list">
                        <div class="listItem" style="cursor:default"><b>Totalt användare:</b> ${d.stats.users}</div>
                        <div class="listItem" style="cursor:default"><b>Totalt tickets:</b> ${d.stats.tickets}</div>
                        <div class="listItem" style="cursor:default"><b>KB Dokument:</b> ${d.stats.knowledgeDocs}</div>
                    </div>
                </div>
                <div class="panel">
                    <div class="panelHead"><b><i class="fa-solid fa-lock"></i> Miljövariabler (Check)</b></div>
                    <div class="list">
                        <div class="listItem" style="cursor:default">OpenAI Key: ${d.env.openai ? '✅ Aktiv' : '❌ Saknas'}</div>
                        <div class="listItem" style="cursor:default">Stripe Key: ${d.env.stripe ? '✅ Aktiv' : '⚠️ Ej konfig'}</div>
                        <div class="listItem" style="cursor:default">MongoDB: ${d.env.mongo ? '✅ Ansluten' : '❌ Fel'}</div>
                    </div>
                </div>
            </div>
        `;
  } catch (e) { box.innerHTML = `<div class="alert error">Kunde inte ladda systemdiagnostik.</div>`; }
}

async function bulkDeleteKb() {
  if (!confirm("VARNING: Detta raderar ALLA dokument i kunskapsbasen för valt bolag. Är du säker?")) return;
  try {
    await api("/admin/kb/bulk-delete", { method: "DELETE", body: { companyId: $("kbCategorySelect").value } });
    toast("Rensat", "Kunskapsbasen har tömts ✅", "info");
    await loadKb();
  } catch (e) { toast("Fel", e.message, "error"); }
}

/* =========================
   CRM Admin (admin)
========================= */
async function refreshCustomers() {
  try {
    const companies = await api("/admin/companies");
    crmData.customers = companies || [];
    renderCrmCustomersList();
  } catch (e) {
    console.error("CRM Load Error:", e);
    crmData.customers = [];
    renderCrmCustomersList();
  }
}

async function createCompany() {
  const displayName = $("newCompanyDisplayName")?.value?.trim() || "";
  const contactEmail = $("newCompanyContactEmail")?.value?.trim() || "";
  const plan = $("newCompanyPlan")?.value || "bas";
  const orgNr = $("newCompanyOrgNr")?.value?.trim() || "";
  const contactName = $("newCompanyContactName")?.value?.trim() || "";
  const phone = $("newCompanyPhone")?.value?.trim() || "";
  const status = $("newCompanyStatus")?.value || "active";
  const notes = $("newCompanyNotes")?.value?.trim() || "";

  if (!displayName) return toast("Saknas", "Namn krävs", "error");

  try {
    await api("/admin/companies", {
      method: "POST",
      body: { displayName, contactEmail, plan, orgNr, contactName, phone, status, notes }
    });
    toast("Skapat", "Ny kund skapad ✅", "info");

    // Clear inputs
    ["newCompanyDisplayName", "newCompanyContactEmail", "newCompanyOrgNr",
      "newCompanyContactName", "newCompanyPhone", "newCompanyNotes"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });

    await refreshCustomers();
  } catch (e) { toast("Fel", e.message, "error"); }
}

/* =========================
   Customer settings
========================= */
async function loadCustomerSettings() {
  try {
    const settings = await api("/company/settings?companyId=" + encodeURIComponent(state.companyId));
    $("custGreeting").value = settings.greeting || "";
    $("custTone").value = settings.tone || "professional";
    $("custWidgetColor").value = settings.widgetColor || "#0066cc";
  } catch (e) { console.error("Settings Load Error:", e); }
}

async function saveCustomerSettings() {
  try {
    const settings = { greeting: $("custGreeting")?.value?.trim() || "", tone: $("custTone")?.value || "professional", widgetColor: $("custWidgetColor")?.value || "#0066cc" };
    await api("/company/settings", { method: "PATCH", body: { companyId: state.companyId, settings } });
    toast("Sparat", "Inställningar uppdaterade ✅", "info");
  } catch (e) { toast("Fel", e.message, "error"); }
}

async function simulateSettings() {
  const previewBox = $("settingsSimulator");
  if (!previewBox) return;
  try {
    const res = await api("/company/simulator", { method: "POST", body: { companyId: state.companyId, message: "Hej!" } });
    const p = res.preview;
    previewBox.innerHTML = `<div class="msg ai" style="border:1px solid ${p.widgetColor}; border-radius:12px; padding:12px;">${escapeHtml(p.greeting)}<br><br>Exempelsvar: ${escapeHtml(p.replyExample)}</div>`;
  } catch (e) { previewBox.textContent = "Simulering misslyckades."; }
}

/* =========================
   KB & Tabs
========================= */
function initTabs() {
  const tabs = document.querySelectorAll(".tabBtn");
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));
      t.classList.add("active");
      const target = t.getAttribute("data-tab");
      const p = $(target);
      if (p) p.style.display = "";
    });
  });
}

async function loadKb() {
  const companyId = $("kbCategorySelect")?.value || "demo";
  const list = $("kbList");
  if (!list) return;
  try {
    const docs = await api(`/admin/kb?companyId=${encodeURIComponent(companyId)}`);
    list.innerHTML = "";
    if (docs.length === 0) { list.innerHTML = "<div class='muted small'>Inga dokument ännu.</div>"; return; }
    docs.forEach((d) => {
      const div = document.createElement("div"); div.className = "listItem";
      const icon = d.sourceType === "pdf" ? "fa-file-pdf" : d.sourceType === "url" ? "fa-link" : "fa-file-lines";
      div.innerHTML = `<div class="listItemTitle"><i class="fa-solid ${icon}"></i> ${escapeHtml(d.title)} <span class="muted small">(${d.sourceType})</span></div>`;
      const delBtn = document.createElement("button"); delBtn.className = "btn ghost small danger"; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.onclick = async (e) => { e.stopPropagation(); if (!confirm(`Ta bort "${d.title}"?`)) return; await api("/admin/kb/" + d._id, { method: "DELETE" }); await loadKb(); };
      div.appendChild(delBtn); list.appendChild(div);
    });
  } catch (e) { list.textContent = "Fel: " + e.message; }
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
  on("solveAllBtn", "click", async () => {
    if (!confirm("Är du säker på att du vill markera ALLA öppna ärenden som lösta?")) return;
    try {
      await api("/inbox/tickets/solve-all", { method: "PATCH" });
      toast("Inbox", "Alla ärenden har markerats som lösta ✅", "info");
      await loadInboxTickets();
    } catch (e) { toast("Fel", e.message, "error"); }
  });
  on("setStatusOpen", "click", () => setInboxStatus("open"));
  on("setStatusPending", "click", () => setInboxStatus("pending"));
  on("setStatusSolved", "click", () => setInboxStatus("solved"));
  on("setPriorityBtn", "click", setInboxPriority);
  on("sendAgentReplyInboxBtn", "click", sendAgentReplyInbox);
  on("saveInternalNoteBtn", "click", saveInternalNote);
  on("clearInternalNotesBtn", "click", clearInternalNotes);
  on("assignTicketBtn", "click", assignTicket);
  on("deleteTicketBtn", "click", deleteTicket);

  // ✅ SLA
  on("openSlaView", "click", async () => {
    showView("slaView", "openSlaView");
    await loadSlaDashboard();
  });

  on("slaRefreshBtn", "click", loadSlaDashboard);
  on("slaDaysSelect", "change", loadSlaDashboard);
  on("slaExportCsvBtn", "click", exportSlaCsv);
  on("slaClearMyStatsBtn", "click", () => clearSla('my'));
  on("slaClearAllStatsBtn", "click", () => clearSla('all'));

  // ✅ ADMIN
  on("openAdminView", "click", async () => {
    showView("adminView", "openAdminView");
    await loadAdminDiagnostics();
    await loadAdminUsers();
    await loadCategories();
  });

  on("adminUsersRefreshBtn", "click", loadAdminUsers);
  on("kbBulkDeleteBtn", "click", bulkDeleteKb);

  // KB Events
  initTabs();
  on("kbRefreshBtn", "click", loadKb);
  on("kbUploadTextBtn", "click", uploadKbText);
  on("kbUploadUrlBtn", "click", uploadKbUrl);
  on("kbUploadPdfBtn", "click", uploadKbPdf);
  on("kbCategorySelect", "change", loadKb); // reload when changing KB company dropdown

  // ✅ CRM
  on("openCustomerAdminView", "click", async () => {
    showView("customerAdminView", "openCustomerAdminView");
    await refreshCustomers();
  });
  on("refreshCustomersBtn", "click", refreshCustomers);
  on("createCompanyBtn", "click", createCrmCustomer);
  on("crmExportBtn", "click", exportCrmData);
  on("crmCloseModalBtn", "click", closeCrmModal);

  // CRM Filters
  on("crmSearchInput", "input", () => {
    setTimeout(renderCrmCustomersList, 200);
  });
  on("crmPlanFilter", "change", renderCrmCustomersList);
  on("crmStatusFilter", "change", renderCrmCustomersList);
  on("crmSortBy", "change", renderCrmCustomersList);
  on("crmActivityFilter", "change", renderCrmActivity);

  // Close modal on backdrop click
  on("crmCustomerModal", "click", (e) => {
    if (e.target.id === "crmCustomerModal") closeCrmModal();
  });

  // ✅ Billing
  on("openBillingView", "click", async () => {
    showView("billingView", "openBillingView");
    await loadBilling();
  });
  on("upgradeToProBtn", "click", upgradeToPro);

  on("openSettingsView", "click", () => {
    showView("settingsView", "openSettingsView");
    loadProfile();
  });

  on("changeUsernameBtn", "click", changeUsername);
  on("changePasswordBtn", "click", changePassword);
  on("themeToggleProfile", "click", toggleTheme);

  // ✅ Customer settings (Admin only / Company settings)
  on("openCustomerSettingsView", "click", async () => {
    showView("customerSettingsView", "openCustomerSettingsView");
    await loadCustomerSettings();
    await simulateSettings();
  });
  on("saveCustomerSettingsBtn", "click", saveCustomerSettings);

  // ✅ Category / Company management
  on("catsRefreshBtn", "click", loadCategories);
  on("createCatBtn", "click", createCategory);

  // ✅ Product Simulator
  on("openSimulatorView", "click", async () => {
    showView("simulatorView", "openSimulatorView");
    await loadSimHistory();
  });
  on("simGenerateBtn", "click", generateSimulation);
  on("simResetBtn", "click", resetSimulator);
  on("simDownloadBtn", "click", downloadSimResult);
  on("simShareBtn", "click", shareSimResult);
  on("simProductFile", "change", () => handleSimImageUpload("simProductFile", "simProductPreview", true));
  on("simRoomFile", "change", () => handleSimImageUpload("simRoomFile", "simRoomPreview", false));

  // ✅ FEEDBACK
  on("openFeedbackView", "click", async () => {
    showView("feedbackView", "openFeedbackView");
    if (typeof loadFeedback === "function") await loadFeedback();
  });
  on("refreshFeedbackBtn", "click", () => { if (typeof loadFeedback === "function") loadFeedback(); });
  on("clearFeedbackBtn", "click", () => { if (typeof clearFeedback === "function") clearFeedback(); });
  on("getAiAnalysisBtn", "click", () => { if (typeof getAiAnalysis === "function") getAiAnalysis(); });
  on("fbPeriodFilter", "change", () => { if (typeof loadFeedback === "function") loadFeedback(); });
  on("fbTypeFilter", "change", () => { if (typeof loadFeedback === "function") loadFeedback(); });
  on("fbAgentFilter", "change", () => { if (typeof loadFeedback === "function") loadFeedback(); });

  // ✅ SCENARIO PLANNER
  on("openScenarioView", "click", async () => {
    showView("scenarioView", "openScenarioView");
    if (typeof initScenarioPlanner === "function") await initScenarioPlanner();
  });

  // ✅ SALES ANALYTICS
  on("openSalesView", "click", async () => {
    showView("salesView", "openSalesView");
    if (typeof initSalesAnalytics === "function") await initSalesAnalytics();
  });

  // ✅ Company switching - syncs chat context and inbox
  on("categorySelect", "change", (e) => {
    const newCompanyId = e.target.value;
    if (newCompanyId) {
      switchCompany(newCompanyId);
    }
  });

  // Inbox category filter - reload inbox when changed
  on("inboxCategoryFilter", "change", () => {
    loadInboxTickets();
  });

  // Inbox status filter - reload inbox when changed
  on("inboxStatusFilter", "change", () => {
    loadInboxTickets();
  });

  // Inbox search - debounced search
  let inboxSearchTimeout = null;
  on("inboxSearchInput", "input", () => {
    clearTimeout(inboxSearchTimeout);
    inboxSearchTimeout = setTimeout(() => {
      filterInboxBySearch();
    }, 300);
  });

  // Chat send
  on("sendBtn", "click", sendChat);
  on("messageInput", "keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
  on("talkToHumanBtn", "click", requestHumanHandoff);
  on("newTicketBtn", "click", resetConversation);
  on("clearChatBtn", "click", clearChat);
  on("fbUp", "click", () => sendFeedback("up"));
  on("fbDown", "click", () => sendFeedback("down"));
}

function initSocket() {
  if (typeof io === 'undefined') return;
  const socket = io();

  socket.on("ticketUpdate", (data) => {
    if (state.currentView === "inboxView") loadInboxTickets();
    if (state.currentView === "slaView" && typeof loadSlaDashboard === "function") loadSlaDashboard();
    if (state.currentView === "adminView" && typeof loadAdminDiagnostics === "function") loadAdminDiagnostics();
    if (typeof renderCrmDashboard === "function") renderCrmDashboard();
  });

  socket.on("newImportantTicket", (data) => {
    toast("Viktigt!", "Nytt brådskande ärende: " + data.title, "warning");

    // Highlight sidebar
    const dot = $("inboxNotifDot");
    if (dot) dot.style.display = "inline-block";

    const btn = $("openInboxView");
    if (btn) {
      btn.classList.add("shake-notif");
      setTimeout(() => btn.classList.remove("shake-notif"), 2000);
    }

    if (state.currentView === "inboxView") loadInboxTickets();
  });

  socket.on("aiTyping", (data) => {
    if (state.inboxSelectedTicket?._id === data.ticketId) {
      // Logic to show typing for agent (optional)
    }
  });
}

/* =========================
   Product Simulator
========================= */
let simProductImageBase64 = null;
let simRoomImageBase64 = null;
let simRoomMode = 'custom'; // 'custom' or 'ai'

function setSimRoomType(type) {
  simRoomMode = type;

  const customBtn = $("simRoomTypeCustom");
  const aiBtn = $("simRoomTypeAi");
  const customPanel = $("simRoomCustom");
  const aiPanel = $("simRoomAi");

  if (type === 'custom') {
    customBtn?.classList.add("active", "secondary");
    customBtn?.classList.remove("ghost");
    aiBtn?.classList.remove("active", "secondary");
    aiBtn?.classList.add("ghost");
    if (customPanel) customPanel.style.display = "block";
    if (aiPanel) aiPanel.style.display = "none";
  } else {
    aiBtn?.classList.add("active", "secondary");
    aiBtn?.classList.remove("ghost");
    customBtn?.classList.remove("active", "secondary");
    customBtn?.classList.add("ghost");
    if (customPanel) customPanel.style.display = "none";
    if (aiPanel) aiPanel.style.display = "block";
  }
}

function handleSimImageUpload(inputId, previewId, isProduct) {
  const input = $(inputId);
  const preview = $(previewId);

  if (!input || !input.files || !input.files[0]) return;

  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    toast("Fel", "Bilden är för stor (max 5MB)", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;

    if (isProduct) {
      simProductImageBase64 = base64;
    } else {
      simRoomImageBase64 = base64;
    }

    if (preview) {
      preview.innerHTML = `
        <div style="position:relative; display:inline-block;">
          <img src="${base64}" style="max-width:100%; max-height:150px; border-radius:8px;" />
          <button class="btn danger small" style="position:absolute; top:5px; right:5px;" onclick="clearSimImage('${isProduct ? 'product' : 'room'}')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <p class="muted tiny" style="margin-top:5px;">${file.name}</p>
      `;
      preview.style.display = "block";
    }

    // Hide dropzone
    const dropzoneId = isProduct ? "simProductDropzone" : "simRoomDropzone";
    const dropzone = $(dropzoneId);
    if (dropzone) dropzone.style.display = "none";
  };
  reader.readAsDataURL(file);
}

function clearSimImage(type) {
  if (type === 'product') {
    simProductImageBase64 = null;
    const preview = $("simProductPreview");
    if (preview) {
      preview.innerHTML = "";
      preview.style.display = "none";
    }
    const dropzone = $("simProductDropzone");
    if (dropzone) dropzone.style.display = "flex";
    const input = $("simProductFile");
    if (input) input.value = "";
  } else {
    simRoomImageBase64 = null;
    const preview = $("simRoomPreview");
    if (preview) {
      preview.innerHTML = "";
      preview.style.display = "none";
    }
    const dropzone = $("simRoomDropzone");
    if (dropzone) dropzone.style.display = "flex";
    const input = $("simRoomFile");
    if (input) input.value = "";
  }
}

async function generateSimulation() {
  const productName = $("simProductName")?.value?.trim();

  if (!productName) {
    toast("Fel", "Ange ett produktnamn eller beskrivning", "error");
    return;
  }

  const status = $("simStatus");
  const statusText = $("simStatusText");
  const generateBtn = $("simGenerateBtn");

  // Show loading
  if (status) status.style.display = "block";
  if (statusText) statusText.textContent = "Skapar AI-visualisering...";
  if (generateBtn) generateBtn.disabled = true;

  try {
    const payload = {
      productName,
      productCategory: $("simProductCategory")?.value || "other",
      productImage: simProductImageBase64,
      roomType: simRoomMode,
      roomImage: simRoomImageBase64,
      roomDescription: $("simRoomDescription")?.value || "",
      roomStyle: $("simRoomStyle")?.value || "modern",
      roomTypeSelect: $("simRoomType")?.value || "living_room",
      placement: $("simPlacement")?.value || "center",
      lighting: $("simLighting")?.value || "daylight",
      angle: $("simAngle")?.value || "front"
    };

    const result = await api("/simulator/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (result.success && result.imageUrl) {
      // Show result
      const placeholder = $("simResultPlaceholder");
      const resultImg = $("simResultImage");
      const img = $("simResultImg");

      if (placeholder) placeholder.style.display = "none";
      if (resultImg) resultImg.style.display = "block";
      if (img) {
        img.src = result.imageUrl;
        img.alt = `Visualisering av ${productName}`;
      }

      // Show action buttons
      const downloadBtn = $("simDownloadBtn");
      const shareBtn = $("simShareBtn");
      if (downloadBtn) downloadBtn.style.display = "inline-flex";
      if (shareBtn) shareBtn.style.display = "inline-flex";

      toast("Klart! ✨", "Visualisering skapad!", "success");

      // Reload history
      loadSimHistory();
    } else {
      throw new Error(result.error || "Okänt fel");
    }

  } catch (e) {
    console.error("Simulator error:", e);
    toast("Fel", e.message || "Kunde inte skapa visualisering", "error");
  } finally {
    if (status) status.style.display = "none";
    if (generateBtn) generateBtn.disabled = false;
  }
}

async function loadSimHistory() {
  try {
    const history = await api("/simulator/history");
    const container = $("simHistory");

    if (!container) return;

    if (!history || history.length === 0) {
      container.innerHTML = '<div class="muted small center" style="padding: 20px;">Inga tidigare visualiseringar</div>';
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px;">
        ${history.map(sim => `
          <div class="sim-history-item" onclick="loadSimResult('${sim.imageUrl}')" style="cursor:pointer;">
            <img src="${sim.imageUrl}" alt="${escapeHtml(sim.productName)}" 
              style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:8px; transition: transform 0.2s;" 
              onmouseover="this.style.transform='scale(1.05)'" 
              onmouseout="this.style.transform='scale(1)'" />
            <div class="muted tiny" style="margin-top:4px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(sim.productName)}</div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (e) {
    console.error("Load sim history error:", e);
  }
}

function loadSimResult(imageUrl) {
  const placeholder = $("simResultPlaceholder");
  const resultImg = $("simResultImage");
  const img = $("simResultImg");

  if (placeholder) placeholder.style.display = "none";
  if (resultImg) resultImg.style.display = "block";
  if (img) img.src = imageUrl;

  const downloadBtn = $("simDownloadBtn");
  const shareBtn = $("simShareBtn");
  if (downloadBtn) downloadBtn.style.display = "inline-flex";
  if (shareBtn) shareBtn.style.display = "inline-flex";
}

function downloadSimResult() {
  const img = $("simResultImg");
  if (!img || !img.src) {
    toast("Fel", "Ingen bild att ladda ner", "error");
    return;
  }

  const link = document.createElement("a");
  link.href = img.src;
  link.download = `produktvisualisering_${Date.now()}.png`;
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  toast("Laddar ner", "Bilden laddas ner...", "info");
}

function shareSimResult() {
  const img = $("simResultImg");
  if (!img || !img.src) {
    toast("Fel", "Ingen bild att dela", "error");
    return;
  }

  if (navigator.share) {
    navigator.share({
      title: "Produktvisualisering",
      text: "Kolla in denna produktvisualisering!",
      url: img.src
    }).catch(console.error);
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(img.src).then(() => {
      toast("Kopierad! 📋", "Bildlänken har kopierats till urklipp", "success");
    }).catch(() => {
      toast("Fel", "Kunde inte kopiera länken", "error");
    });
  }
}

function resetSimulator() {
  // Clear product
  $("simProductName").value = "";
  $("simProductCategory").value = "furniture";
  clearSimImage('product');

  // Clear room
  $("simRoomDescription").value = "";
  $("simRoomType").value = "living_room";
  $("simRoomStyle").value = "modern";
  clearSimImage('room');
  setSimRoomType('custom');

  // Reset settings
  $("simPlacement").value = "center";
  $("simLighting").value = "daylight";
  $("simAngle").value = "front";

  // Hide result
  const placeholder = $("simResultPlaceholder");
  const resultImg = $("simResultImage");
  if (placeholder) placeholder.style.display = "flex";
  if (resultImg) resultImg.style.display = "none";

  const downloadBtn = $("simDownloadBtn");
  const shareBtn = $("simShareBtn");
  if (downloadBtn) downloadBtn.style.display = "none";
  if (shareBtn) shareBtn.style.display = "none";

  toast("Återställt", "Simulatorn har återställts", "info");
}

// Make setSimRoomType available globally
window.setSimRoomType = setSimRoomType;

/* =========================
   Init
========================= */
async function init() {
  loadTheme();
  initSocket();
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

  // Back button support
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace("#", "");
    if (hash) {
      const btnId = "open" + hash.charAt(0).toUpperCase() + hash.slice(1) + "View";
      const btn = $(btnId);
      if (btn) btn.click();
    }
  });
}

init().catch((e) => {
  toast("Init-fel", e?.message || "Okänt fel", "error");
});

/* === INBOX ACTIONS === */
async function inboxAction(action) {
  const companyId = document.getElementById("inboxCategoryFilter")?.value || "";

  if (action === 'solve') {
    if (!confirm("Markera ALLA synliga ärenden som lösta?")) return;
    try {
      await api("/inbox/tickets/solve-all", { method: "PATCH", body: { companyId } });
      toast("Klart", "Alla ärenden lösta", "success");
      if (window.loadInboxTickets) window.loadInboxTickets();
    } catch (e) { toast("Fel", e.message, "error"); }
  }

  if (action === 'remove') {
    if (!confirm("Ta bort ALLA lösta ärenden permanent?")) return;
    try {
      await api(`/inbox/tickets/solved?companyId=${encodeURIComponent(companyId)}`, { method: "DELETE" });
      toast("Klart", "Rensat lösta ärenden", "success");
      if (window.loadInboxTickets) window.loadInboxTickets();
    } catch (e) { toast("Fel", e.message, "error"); }
  }
}

function bindInboxActions() {
  const solveBtn = document.getElementById("solveAllBtn");
  const removeBtn = document.getElementById("removeSolvedBtn");

  if (solveBtn) solveBtn.onclick = () => inboxAction('solve');
  if (removeBtn) removeBtn.onclick = () => inboxAction('remove');

  console.log("Inbox actions bound", { solveBtn, removeBtn });
}

// Bind when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindInboxActions);
} else {
  bindInboxActions();
}
// Expose for re-binding
window.bindInboxActions = bindInboxActions;

/* === SAFETY OVERRIDE === */
window.inboxAction = async function (action) {
  const companyId = document.getElementById("inboxCategoryFilter")?.value || "";

  if (!companyId) {
    alert("Vänligen välj ett företag i filtret först för att undvika att påverka alla.");
    return;
  }

  if (action === 'solve') {
    if (!confirm("Markera ALLA ärenden för detta företag som lösta?")) return;
    try {
      await api("/inbox/tickets/solve-all", { method: "PATCH", body: { companyId } });
      toast("Klart", "Alla ärenden lösta", "success");
      if (window.loadInboxTickets) window.loadInboxTickets();
    } catch (e) { toast("Fel", e.message, "error"); }
  }

  if (action === 'remove') {
    if (!confirm("Ta bort ALLA lösta ärenden permanent för detta företag?")) return;
    try {
      await api(`/inbox/tickets/solved?companyId=${encodeURIComponent(companyId)}`, { method: "DELETE" });
      toast("Klart", "Rensat lösta ärenden", "success");
      if (window.loadInboxTickets) window.loadInboxTickets();
    } catch (e) { toast("Fel", e.message, "error"); }
  }
};

// Re-bind buttons to use the safe global function
function rebindSafeActions() {
  const solveBtn = document.getElementById("solveAllBtn");
  const removeBtn = document.getElementById("removeSolvedBtn");
  if (solveBtn) solveBtn.onclick = () => window.inboxAction('solve');
  if (removeBtn) removeBtn.onclick = () => window.inboxAction('remove');
  console.log("Safe Inbox Actions Bound");
}
// Run immediately and on DOMContentLoaded just in case
rebindSafeActions();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", rebindSafeActions);
}

/* === UPDATED INBOX ACTION (SMART SCOPE) === */
window.inboxAction = async function (action) {
  const filterEl = document.getElementById("inboxCategoryFilter");
  const companyId = filterEl?.value || "";

  console.log(`Executing Inbox Action: ${action} for Company: '${companyId}'`);

  // 1. Check Scope & Confirm
  if (!companyId) {
    // Global scope warning
    if (action === 'solve') {
      if (!confirm("Du har inte valt något företag. Detta kommer markera ALLA ärenden i HELA systemet som lösta. Är du säker?")) return;
    } else if (action === 'remove') {
      if (!confirm("Du har inte valt något företag. Detta kommer RADERA ALLA lösta ärenden i HELA systemet. Är du säker?")) return;
    }
  } else {
    // Company scope confirm
    const companyName = filterEl.options[filterEl.selectedIndex]?.text || "valt företag";
    if (action === 'solve') {
      if (!confirm(`Markera alla ärenden för ${companyName} som lösta?`)) return;
    } else if (action === 'remove') {
      if (!confirm(`Ta bort alla lösta ärenden för ${companyName}?`)) return;
    }
  }

  // 2. Execute
  try {
    if (action === 'solve') {
      const res = await api("/inbox/tickets/solve-all", { method: "PATCH", body: { companyId } });
      toast("Klart", res.message || "Buntåtgärd utförd", "success");
    }
    else if (action === 'remove') {
      // Pass explicitly via query param
      const url = `/inbox/tickets/solved?companyId=${encodeURIComponent(companyId)}`;
      console.log("Calling DELETE:", url);
      const res = await api(url, { method: "DELETE" });
      toast("Klart", res.message || "Rensning utförd", "success");
    }

    if (window.loadInboxTickets) window.loadInboxTickets();

  } catch (e) {
    console.error("Inbox Action Failed:", e);
    toast("Fel", e.message, "error");
  }
};

// Rebind
const solveBtn = document.getElementById("solveAllBtn");
const removeBtn = document.getElementById("removeSolvedBtn");
if (solveBtn) solveBtn.onclick = () => window.inboxAction('solve');
if (removeBtn) removeBtn.onclick = () => window.inboxAction('remove');

/* =====================
   FEEDBACK SYSTEM - Frontend
===================== */

// Show Feedback view for agents/admins
function initFeedbackView() {
  const fbBtn = document.getElementById("openFeedbackView");
  if (fbBtn && window.currentUser && ["agent", "admin"].includes(window.currentUser.role)) {
    fbBtn.style.display = "";
    fbBtn.onclick = () => showView("feedbackView");
  }

  // Show admin-only elements
  if (window.currentUser?.role === "admin") {
    const clearBtn = document.getElementById("clearFeedbackBtn");
    if (clearBtn) clearBtn.style.display = "";

    const agentPanel = document.getElementById("agentLeaderboardPanel");
    if (agentPanel) agentPanel.style.display = "";

    const agentFilterWrap = document.getElementById("fbAgentFilterWrap");
    if (agentFilterWrap) agentFilterWrap.style.display = "";
  }

  // Bind events
  const refreshBtn = document.getElementById("refreshFeedbackBtn");
  if (refreshBtn) refreshBtn.onclick = loadFeedback;

  const clearBtn = document.getElementById("clearFeedbackBtn");
  if (clearBtn) clearBtn.onclick = clearFeedback;

  const aiBtn = document.getElementById("getAiAnalysisBtn");
  if (aiBtn) aiBtn.onclick = getAiAnalysis;

  // Filter changes
  const periodFilter = document.getElementById("fbPeriodFilter");
  const typeFilter = document.getElementById("fbTypeFilter");
  const agentFilter = document.getElementById("fbAgentFilter");

  if (periodFilter) periodFilter.onchange = loadFeedback;
  if (typeFilter) typeFilter.onchange = loadFeedback;
  if (agentFilter) agentFilter.onchange = loadFeedback;
}

// Load Feedback
async function loadFeedback() {
  try {
    const periodEl = document.getElementById("fbPeriodFilter");
    const typeEl = document.getElementById("fbTypeFilter");
    const agentEl = document.getElementById("fbAgentFilter");

    const days = periodEl?.value || "30";
    const targetType = typeEl?.value || "";
    const agentId = agentEl?.value || "";

    // Build query
    let query = `?limit=100`;
    if (days !== "all") {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      query += `&startDate=${startDate.toISOString()}`;
    }
    if (targetType) query += `&targetType=${targetType}`;
    if (agentId) query += `&agentId=${agentId}`;

    const data = await api(`/feedback${query}`);

    // Update stats
    const statAvg = document.getElementById("fbStatAvg");
    const statTotal = document.getElementById("fbStatTotal");
    const statAgents = document.getElementById("fbStatAgents");
    const statAi = document.getElementById("fbStatAi");

    if (statAvg) statAvg.textContent = data.stats?.avgRating?.toFixed(1) || "-";
    if (statTotal) statTotal.textContent = data.stats?.totalCount || 0;
    if (statAgents) statAgents.textContent = data.stats?.agentCount || 0;
    if (statAi) statAi.textContent = data.stats?.aiCount || 0;

    // Update rating distribution bars
    const dist = data.stats?.ratingDistribution || {};
    const maxCount = Math.max(...Object.values(dist), 1);

    for (let i = 1; i <= 5; i++) {
      const bar = document.getElementById(`rating${i}Bar`);
      const count = document.getElementById(`rating${i}Count`);
      const val = dist[i] || 0;
      if (bar) bar.style.width = `${(val / maxCount) * 100}%`;
      if (count) count.textContent = val;
    }

    // Render feedback list
    renderFeedbackList(data.feedback || []);

    // Update list count
    const listCount = document.getElementById("fbListCount");
    if (listCount) listCount.textContent = (data.feedback?.length || 0);

    // Load agent leaderboard (admin only)
    if (window.currentUser?.role === "admin") {
      loadAgentLeaderboard(days);
    }

  } catch (e) {
    console.error("Load Feedback Error:", e);
    toast("Fel", "Kunde inte ladda feedback", "error");
  }
}

// Render Feedback List
function renderFeedbackList(feedbackList) {
  const container = document.getElementById("feedbackListContainer");
  if (!container) return;

  if (!feedbackList.length) {
    container.innerHTML = `
      <div class="muted center" style="padding: 40px;">
        <i class="fa-solid fa-inbox" style="font-size: 48px; margin-bottom: 15px; display: block; opacity: 0.5;"></i>
        Ingen feedback ännu
      </div>`;
    return;
  }

  container.innerHTML = feedbackList.map(fb => {
    const stars = "★".repeat(fb.rating) + "☆".repeat(5 - fb.rating);
    const starColor = fb.rating >= 4 ? "var(--ok)" : fb.rating >= 3 ? "var(--warn)" : "var(--danger)";
    const typeIcon = fb.targetType === "ai" ? "fa-robot" : "fa-user-tie";
    const typeBadge = fb.targetType === "ai" ? "AI" : (fb.targetAgentId?.username || "Agent");
    const date = new Date(fb.createdAt).toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const username = fb.userId?.username || "Anonym";

    return `
      <div class="listItem feedbackItem" style="padding: 16px; border-left: 3px solid ${starColor};">
        <div class="row" style="justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 20px; color: ${starColor}; margin-bottom: 5px;">${stars}</div>
            <div class="row gap" style="margin-bottom: 8px;">
              <span class="pill ${fb.targetType === 'ai' ? 'info' : 'ok'}" style="font-size: 11px;">
                <i class="fa-solid ${typeIcon}"></i> ${typeBadge}
              </span>
              <span class="muted small">${username}</span>
              <span class="muted small">${date}</span>
            </div>
            ${fb.comment ? `<p style="margin: 8px 0 0 0; line-height: 1.5;">"${fb.comment}"</p>` : ""}
            ${fb.ticketId ? `<div class="muted small" style="margin-top: 8px;"><i class="fa-solid fa-ticket"></i> ${fb.ticketId.publicTicketId || fb.ticketId.title || "Ticket"}</div>` : ""}
          </div>
          ${window.currentUser?.role === "admin" ? `
            <button class="btn ghost small" onclick="deleteFeedback('${fb._id}')" title="Radera">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// Delete single feedback
async function deleteFeedback(id) {
  if (!confirm("Radera denna feedback?")) return;
  try {
    await api(`/feedback/${id}`, { method: "DELETE" });
    toast("Klart", "Feedback raderad", "success");
    loadFeedback();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

// Clear all feedback (Admin)
async function clearFeedback() {
  if (!confirm("VARNING: Detta raderar ALL feedback inom vald period. Är du säker?")) return;

  try {
    const periodEl = document.getElementById("fbPeriodFilter");
    const typeEl = document.getElementById("fbTypeFilter");

    const days = periodEl?.value || "30";
    const targetType = typeEl?.value || "";

    let query = "?";
    if (days !== "all") {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      query += `startDate=${startDate.toISOString()}&`;
    }
    if (targetType) query += `targetType=${targetType}`;

    const res = await api(`/feedback/clear${query}`, { method: "DELETE" });
    toast("Klart", res.message, "success");
    loadFeedback();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

// AI Analysis
async function getAiAnalysis() {
  const container = document.getElementById("aiAnalysisContent");
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 30px;">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i>
      <p class="muted" style="margin-top: 10px;">Analyserar feedback med AI...</p>
    </div>`;

  try {
    const periodEl = document.getElementById("fbPeriodFilter");
    const days = periodEl?.value || "30";

    const data = await api(`/feedback/ai-analysis?days=${days}`);

    const sentimentIcon = data.sentiment === "positive" ? "fa-face-smile text-ok"
      : data.sentiment === "negative" ? "fa-face-frown text-danger"
        : "fa-face-meh text-warn";

    const sentimentText = data.sentiment === "positive" ? "Positivt"
      : data.sentiment === "negative" ? "Negativt"
        : "Neutralt";

    container.innerHTML = `
      <div class="aiAnalysisResult">
        <div class="row gap" style="margin-bottom: 15px; align-items: center;">
          <i class="fa-solid ${sentimentIcon}" style="font-size: 28px;"></i>
          <div>
            <div class="small muted">Övergripande känsla</div>
            <div style="font-weight: 600;">${sentimentText}</div>
          </div>
          <div style="margin-left: auto; text-align: right;">
            <div class="small muted">Snittbetyg</div>
            <div style="font-weight: 600; font-size: 20px; color: var(--warn);">${data.stats?.avgRating || "-"} ★</div>
          </div>
        </div>
        
        <div class="divider"></div>
        
        <div style="margin: 15px 0; line-height: 1.6;">
          ${data.analysis}
        </div>
        
        ${data.tips?.length ? `
          <div class="divider"></div>
          <div style="margin-top: 15px;">
            <div class="small muted" style="margin-bottom: 10px;"><i class="fa-solid fa-lightbulb"></i> Tips för förbättring</div>
            <ul style="margin: 0; padding-left: 20px;">
              ${data.tips.map(t => `<li style="margin-bottom: 5px;">${t}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </div>
    `;

  } catch (e) {
    container.innerHTML = `
      <div class="alert error">
        <i class="fa-solid fa-exclamation-circle"></i> Kunde inte generera analys: ${e.message}
      </div>`;
  }
}

// Agent Leaderboard (Admin)
async function loadAgentLeaderboard(days = 30) {
  const container = document.getElementById("agentLeaderboardList");
  if (!container) return;

  try {
    const data = await api(`/feedback/agents?days=${days}`);

    if (!data.agents?.length) {
      container.innerHTML = `<div class="muted center" style="padding: 20px;">Ingen agent-feedback ännu</div>`;
      return;
    }

    container.innerHTML = data.agents.map((agent, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
      const ratingColor = agent.avgRating >= 4.5 ? "var(--ok)" : agent.avgRating >= 3.5 ? "var(--warn)" : "var(--danger)";

      return `
        <div class="listItem" style="padding: 12px; display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 24px; width: 40px; text-align: center;">${medal}</span>
          <div style="flex: 1;">
            <div style="font-weight: 600;">${agent.agentName}</div>
            <div class="small muted">${agent.feedbackCount} svar • ${agent.fiveStarCount} femstjärniga</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 20px; font-weight: 700; color: ${ratingColor};">${agent.avgRating}</div>
            <div class="small muted">snitt</div>
          </div>
        </div>
      `;
    }).join("");

    // Populate agent filter dropdown
    const agentFilter = document.getElementById("fbAgentFilter");
    if (agentFilter && data.agents.length) {
      const currentVal = agentFilter.value;
      agentFilter.innerHTML = `<option value="">Alla agenter</option>` +
        data.agents.map(a => `<option value="${a.agentId}">${a.agentName}</option>`).join("");
      agentFilter.value = currentVal;
    }

  } catch (e) {
    console.error("Leaderboard Error:", e);
  }
}

// Stars helper for rendering
function renderStars(rating) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

// Initialize on view change
const originalShowView = window.showView || function () { };
window.showView = function (viewId) {
  originalShowView(viewId);
  if (viewId === "feedbackView") {
    loadFeedback();
  }
};

// Init when DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => setTimeout(initFeedbackView, 500));
} else {
  setTimeout(initFeedbackView, 500);
}

// Listen for new feedback in real-time
if (window.socket) {
  window.socket.on("newFeedback", () => {
    const fbNotif = document.getElementById("feedbackNotifDot");
    if (fbNotif) fbNotif.style.display = "";
    // Reload if on feedback view
    const fbView = document.getElementById("feedbackView");
    if (fbView && fbView.style.display !== "none") {
      loadFeedback();
    }
  });
}

/* =====================
   CUSTOMER FEEDBACK MODAL 
===================== */

let currentFeedbackRating = 0;

function openFeedbackModal(targetType = "ai", targetAgentId = null) {
  const modal = $("feedbackModal");
  if (!modal) return;

  // Reset
  currentFeedbackRating = 0;
  $("feedbackRatingValue").value = "0";
  $("feedbackComment").value = "";
  $("feedbackTargetType").value = targetType;
  $("feedbackTargetAgentId").value = targetAgentId || "";

  // Reset stars
  document.querySelectorAll("#starRatingContainer .starBtn").forEach(btn => {
    btn.textContent = "☆";
    btn.style.color = "var(--muted)";
  });

  modal.style.display = "flex";
}

function closeFeedbackModal() {
  const modal = $("feedbackModal");
  if (modal) modal.style.display = "none";
}

function setFeedbackRating(rating) {
  currentFeedbackRating = rating;
  $("feedbackRatingValue").value = rating;

  // Update star display
  document.querySelectorAll("#starRatingContainer .starBtn").forEach(btn => {
    const btnRating = parseInt(btn.getAttribute("data-rating"));
    if (btnRating <= rating) {
      btn.textContent = "★";
      btn.style.color = "var(--warn)";
    } else {
      btn.textContent = "☆";
      btn.style.color = "var(--muted)";
    }
  });
}

async function submitCustomerFeedback() {
  const rating = parseInt($("feedbackRatingValue").value) || 0;
  const comment = $("feedbackComment")?.value?.trim() || "";
  const targetType = $("feedbackTargetType")?.value || "ai";
  const targetAgentId = $("feedbackTargetAgentId")?.value || null;

  if (rating < 1 || rating > 5) {
    toast("Välj betyg", "Klicka på 1-5 stjärnor", "error");
    return;
  }

  try {
    await api("/feedback", {
      method: "POST",
      body: {
        rating,
        comment,
        targetType,
        targetAgentId: targetAgentId || null,
        companyId: state.companyId,
        ticketId: state.activeTicketId || null
      }
    });

    toast("Tack! 🌟", "Din feedback har skickats", "success");
    closeFeedbackModal();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
}

// Trigger feedback modal after ticket is solved or chat ends
function promptForFeedback(targetType = "ai", targetAgentId = null) {
  // Only show if not shown recently
  const lastPrompt = localStorage.getItem("lastFeedbackPrompt");
  const now = Date.now();

  // Don't show more than once per hour
  if (lastPrompt && (now - parseInt(lastPrompt)) < 3600000) {
    return;
  }

  localStorage.setItem("lastFeedbackPrompt", now.toString());

  setTimeout(() => {
    openFeedbackModal(targetType, targetAgentId);
  }, 1000);
}

// Make functions globally available
window.openFeedbackModal = openFeedbackModal;
window.closeFeedbackModal = closeFeedbackModal;
window.setFeedbackRating = setFeedbackRating;
window.submitCustomerFeedback = submitCustomerFeedback;
window.promptForFeedback = promptForFeedback;

// Add a "Rate this chat" button to chat view
function addFeedbackButton() {
  const chatActions = document.querySelector(".chatActions") || document.querySelector("#chatView .topbarActions");
  if (!chatActions) return;

  // Check if already added
  if (document.getElementById("rateChatBtn")) return;

  const btn = document.createElement("button");
  btn.id = "rateChatBtn";
  btn.className = "btn ghost";
  btn.type = "button";
  btn.innerHTML = '<i class="fa-solid fa-star"></i> Betygsätt';
  btn.onclick = () => openFeedbackModal("ai");

  chatActions.appendChild(btn);
}

// Add button on load
setTimeout(addFeedbackButton, 1000);

/* =====================
   SALES ANALYTICS - Frontend
===================== */

// Initialize Sales Analytics
async function initSalesAnalytics() {
  bindSalesTabs();
  bindSalesEvents();
  await loadSalesData();
}

function bindSalesTabs() {
  const tabs = document.querySelectorAll(".salesTabBtn");
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".salesTabContent").forEach(c => c.style.display = "none");
      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      const target = $(targetId);
      if (target) target.style.display = "";
    };
  });
}

function bindSalesEvents() {
  const periodFilter = $("salesPeriodFilter");
  if (periodFilter) periodFilter.onchange = loadSalesData;

  const refreshBtn = $("refreshSalesBtn");
  if (refreshBtn) refreshBtn.onclick = loadSalesData;

  const exportBtn = $("exportSalesBtn");
  if (exportBtn) exportBtn.onclick = exportSalesReport;
}

async function loadSalesData() {
  const days = parseInt($("salesPeriodFilter")?.value || 30);

  // Since we don't have real sales data yet, generate demo/simulation data
  const data = generateDemoSalesData(days);

  // Update top KPIs
  $("salesTotalRevenue").textContent = formatCurrency(data.totalRevenue);
  $("salesTotalOrders").textContent = data.totalOrders.toLocaleString("sv-SE");
  $("salesAov").textContent = formatCurrency(data.aov);
  $("salesConversionRate").textContent = data.conversionRate + "%";
  $("salesAiRevenue").textContent = formatCurrency(data.aiRevenue);

  // Update all metrics
  updateSalesMetrics(data);
  updateProductsList(data.topProducts);
  updateIntentsList(data.salesByIntent);
  updateHighProbLeads(data.highProbLeads);
  updateChurnRiskList(data.highChurnRisk);
}

function generateDemoSalesData(days) {
  const multiplier = days / 30;
  const baseOrders = Math.round(247 * multiplier);
  const baseRevenue = Math.round(487500 * multiplier);

  return {
    // Core
    totalRevenue: baseRevenue,
    totalOrders: baseOrders,
    aov: Math.round(baseRevenue / baseOrders),
    revenuePerConv: Math.round(baseRevenue / (baseOrders * 3.2)),
    revenuePerAi: Math.round(baseRevenue * 0.65 / (baseOrders * 0.65)),
    conversionRate: 12.4,
    aiRevenue: Math.round(baseRevenue * 0.65),

    // Funnel
    convStarted: Math.round(baseOrders * 8.1),
    offersShown: Math.round(baseOrders * 4.2),
    offersClicked: Math.round(baseOrders * 2.1),
    purchasesMade: baseOrders,
    funnelRate: 12.4,
    dropoff1: 50,
    dropoff2: 52.4,
    aiToSale: 31.2,

    // Upsell
    upsellRate: 23.5,
    upsellRevenue: Math.round(baseRevenue * 0.18),
    avgUpsellValue: 342,
    crossSellFreq: 15.2,
    rejectedOffers: 34.2,
    timeToSale: "4.2 min",
    timingEffect: "+18% kvällstid",

    // Products
    productsPerOrder: 1.8,
    singleItemOrders: Math.round(baseOrders * 0.58),
    bundleOrders: Math.round(baseOrders * 0.42),
    topProducts: [
      { name: "Premium Abonnemang", sales: 89, revenue: 178000 },
      { name: "Tilläggstjänst Pro", sales: 67, revenue: 67000 },
      { name: "Supportavtal Guld", sales: 45, revenue: 112500 },
      { name: "API Access", sales: 34, revenue: 68000 },
      { name: "Konsulttimmar", sales: 12, revenue: 62000 }
    ],
    salesByIntent: [
      { intent: "Köpintresse", count: 124, pct: 50.2 },
      { intent: "Prisförfrågan", count: 67, pct: 27.1 },
      { intent: "Uppgradering", count: 34, pct: 13.8 },
      { intent: "Support → köp", count: 22, pct: 8.9 }
    ],

    // Customers
    newCustomers: Math.round(baseOrders * 0.42),
    returningCustomers: Math.round(baseOrders * 0.58),
    purchasesNew: 1.2,
    purchasesReturning: 2.4,
    purchasesByChannel: "Web 68%, Chat 32%",
    peakTime: "14:00-16:00",
    postSupportPurchase: Math.round(baseOrders * 0.15),
    returnRate: 3.2,
    repeatAiPurchases: Math.round(baseOrders * 0.28),

    // AI Performance
    convPerPrompt: "v2.1: 14.2%",
    revenuePerPrompt: "v2.1: 2,340 kr",
    revenuePerModel: "GPT-4o: +23%",
    suggestionToSale: 31.2,
    fallbackLost: "12,400 kr",
    failedAiLost: "8,200 kr",
    abComparison: "B +18%",
    salesByStrategy: "Mjuk: 62%",
    offerTiming: "Sent: +24%",

    // Predictive
    probConv: 34.2,
    probCustomer: 45.8,
    probProduct: 67.3,
    probIntent: 72.1,
    probSentiment: 58.4,
    highProbLeads: [
      { name: "Acme Corp", prob: 89, value: "45,000 kr" },
      { name: "TechStart AB", prob: 82, value: "28,000 kr" },
      { name: "Nordic Solutions", prob: 76, value: "35,000 kr" }
    ],

    // Churn
    churnCustomer: 8.4,
    churnRejected: 12.3,
    churnFailedAi: 18.7,
    churnEscalated: 9.2,
    churnSegment: "SMB: 11.2%",
    highChurnRisk: [
      { name: "ClientX", risk: 78, reason: "Avvisat 3 erbjudanden" },
      { name: "CompanyY", risk: 65, reason: "2 misslyckade AI-dialoger" },
      { name: "BizZ", risk: 54, reason: "Ingen aktivitet 45d" }
    ],

    // CLV
    clvTotal: 24500,
    clvAiInfluenced: 32400,
    clvAiCustomers: 38200,
    clvNonAiCustomers: 18700,
    clvPreAi: 21300,
    clvPostAi: 34600,
    clvPerPrompt: "v2.1: 36,200 kr",
    clvPerModel: "GPT-4o: 38,400 kr",
    clvPerStrategy: "Personlig: 41,200 kr"
  };
}

function updateSalesMetrics(data) {
  const setValue = (id, val) => { const el = $(id); if (el) el.textContent = val; };

  // Core
  setValue("sm_totalRevenue", formatCurrency(data.totalRevenue));
  setValue("sm_totalOrders", data.totalOrders.toLocaleString("sv-SE"));
  setValue("sm_aov", formatCurrency(data.aov));
  setValue("sm_revenuePerConv", formatCurrency(data.revenuePerConv));
  setValue("sm_revenuePerAi", formatCurrency(data.revenuePerAi));

  // Funnel
  setValue("sm_convStarted", data.convStarted.toLocaleString("sv-SE"));
  setValue("sm_offersShown", data.offersShown.toLocaleString("sv-SE"));
  setValue("sm_offersClicked", data.offersClicked.toLocaleString("sv-SE"));
  setValue("sm_purchasesMade", data.purchasesMade.toLocaleString("sv-SE"));
  setValue("sm_funnelRate", data.funnelRate + "%");
  setValue("sm_dropoff1", data.dropoff1 + "%");
  setValue("sm_dropoff2", data.dropoff2 + "%");
  setValue("sm_aiToSale", data.aiToSale + "%");

  // Upsell
  setValue("sm_upsellRate", data.upsellRate + "%");
  setValue("sm_upsellRevenue", formatCurrency(data.upsellRevenue));
  setValue("sm_avgUpsellValue", formatCurrency(data.avgUpsellValue));
  setValue("sm_crossSellFreq", data.crossSellFreq + "%");
  setValue("sm_rejectedOffers", data.rejectedOffers + "%");
  setValue("sm_timeToSale", data.timeToSale);
  setValue("sm_timingEffect", data.timingEffect);

  // Products
  setValue("sm_productsPerOrder", data.productsPerOrder);
  setValue("sm_singleItemOrders", data.singleItemOrders.toLocaleString("sv-SE"));
  setValue("sm_bundleOrders", data.bundleOrders.toLocaleString("sv-SE"));

  // Customers
  setValue("sm_newCustomers", data.newCustomers.toLocaleString("sv-SE"));
  setValue("sm_returningCustomers", data.returningCustomers.toLocaleString("sv-SE"));
  setValue("sm_purchasesNew", data.purchasesNew + " snitt");
  setValue("sm_purchasesReturning", data.purchasesReturning + " snitt");
  setValue("sm_purchasesByChannel", data.purchasesByChannel);
  setValue("sm_peakTime", data.peakTime);
  setValue("sm_postSupportPurchase", data.postSupportPurchase.toLocaleString("sv-SE"));
  setValue("sm_returnRate", data.returnRate + "%");
  setValue("sm_repeatAiPurchases", data.repeatAiPurchases.toLocaleString("sv-SE"));

  // AI Performance
  setValue("sm_convPerPrompt", data.convPerPrompt);
  setValue("sm_revenuePerPrompt", data.revenuePerPrompt);
  setValue("sm_revenuePerModel", data.revenuePerModel);
  setValue("sm_suggestionToSale", data.suggestionToSale + "%");
  setValue("sm_fallbackLost", data.fallbackLost);
  setValue("sm_failedAiLost", data.failedAiLost);
  setValue("sm_abComparison", data.abComparison);
  setValue("sm_salesByStrategy", data.salesByStrategy);
  setValue("sm_offerTiming", data.offerTiming);

  // Predictive
  setValue("sm_probConv", data.probConv + "%");
  setValue("sm_probCustomer", data.probCustomer + "%");
  setValue("sm_probProduct", data.probProduct + "%");
  setValue("sm_probIntent", data.probIntent + "%");
  setValue("sm_probSentiment", data.probSentiment + "%");

  // Churn
  setValue("sm_churnCustomer", data.churnCustomer + "%");
  setValue("sm_churnRejected", data.churnRejected + "%");
  setValue("sm_churnFailedAi", data.churnFailedAi + "%");
  setValue("sm_churnEscalated", data.churnEscalated + "%");
  setValue("sm_churnSegment", data.churnSegment);

  // CLV
  setValue("sm_clvTotal", formatCurrency(data.clvTotal));
  setValue("sm_clvAiInfluenced", formatCurrency(data.clvAiInfluenced));
  setValue("sm_clvAiCustomers", formatCurrency(data.clvAiCustomers));
  setValue("sm_clvNonAiCustomers", formatCurrency(data.clvNonAiCustomers));
  setValue("sm_clvPreAi", formatCurrency(data.clvPreAi));
  setValue("sm_clvPostAi", formatCurrency(data.clvPostAi));
  setValue("sm_clvPerPrompt", data.clvPerPrompt);
  setValue("sm_clvPerModel", data.clvPerModel);
  setValue("sm_clvPerStrategy", data.clvPerStrategy);
}

function updateProductsList(products) {
  const container = $("salesTopProducts");
  if (!container) return;

  container.innerHTML = products.map((p, i) => `
    <div class="salesMetricRow" style="padding: 8px 0; border-bottom: 1px solid var(--border);">
      <span><span style="color: var(--muted);">#${i + 1}</span> ${p.name}</span>
      <span class="salesMetricValue">${formatCurrency(p.revenue)} <span class="small muted">(${p.sales} st)</span></span>
    </div>
  `).join("");
}

function updateIntentsList(intents) {
  const container = $("salesByIntent");
  if (!container) return;

  container.innerHTML = intents.map(i => `
    <div class="salesMetricRow" style="padding: 8px 0; border-bottom: 1px solid var(--border);">
      <span>${i.intent}</span>
      <span class="salesMetricValue">${i.count} <span class="small muted">(${i.pct}%)</span></span>
    </div>
  `).join("");
}

function updateHighProbLeads(leads) {
  const container = $("salesHighProbLeads");
  if (!container) return;

  container.innerHTML = leads.map(l => `
    <div class="salesMetricRow" style="padding: 10px 0; border-bottom: 1px solid var(--border);">
      <span>
        <span style="display: inline-block; width: 40px; height: 40px; background: var(--primary); color: white; border-radius: 50%; text-align: center; line-height: 40px; margin-right: 10px; font-weight: 700;">${l.prob}%</span>
        ${l.name}
      </span>
      <span class="salesMetricValue text-ok">${l.value}</span>
    </div>
  `).join("");
}

function updateChurnRiskList(risks) {
  const container = $("salesHighChurnRisk");
  if (!container) return;

  container.innerHTML = risks.map(r => `
    <div class="salesMetricRow" style="padding: 10px 0; border-bottom: 1px solid var(--border);">
      <span>
        <span style="display: inline-block; width: 40px; height: 40px; background: ${r.risk > 70 ? 'var(--danger)' : 'var(--warn)'}; color: white; border-radius: 50%; text-align: center; line-height: 40px; margin-right: 10px; font-weight: 700;">${r.risk}%</span>
        <span>
          <div>${r.name}</div>
          <div class="small muted">${r.reason}</div>
        </span>
      </span>
    </div>
  `).join("");
}

function formatCurrency(amount) {
  return amount.toLocaleString("sv-SE") + " kr";
}

function exportSalesReport() {
  const days = $("salesPeriodFilter")?.value || 30;
  const data = generateDemoSalesData(parseInt(days));

  const report = `
SÄLJANALYSRAPPORT
=================
Genererad: ${new Date().toLocaleString("sv-SE")}
Period: Senaste ${days} dagar

ÖVERSIKT
--------
Total försäljning: ${formatCurrency(data.totalRevenue)}
Antal köp: ${data.totalOrders}
Genomsnittligt ordervärde: ${formatCurrency(data.aov)}
Conversion rate: ${data.conversionRate}%
AI-driven intäkt: ${formatCurrency(data.aiRevenue)}

MERSÄLJ
-------
Mersäljsgrad: ${data.upsellRate}%
Mersäljsintäkt: ${formatCurrency(data.upsellRevenue)}
Korsförsäljningsfrekvens: ${data.crossSellFreq}%

KUNDER
------
Nya kunder: ${data.newCustomers}
Återkommande kunder: ${data.returningCustomers}
Retur-/ångerkvot: ${data.returnRate}%

CLV
---
Customer Lifetime Value: ${formatCurrency(data.clvTotal)}
AI-påverkad CLV: ${formatCurrency(data.clvAiInfluenced)}
CLV efter AI-interaktion: ${formatCurrency(data.clvPostAi)}

=================
Rapporten skapad av AI Kundtjänst Säljanalys
  `.trim();

  const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `saljrapport_${new Date().toISOString().split("T")[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  toast("Exporterad", "Säljrapporten har laddats ner", "success");
}

// Make globally available
window.initSalesAnalytics = initSalesAnalytics;

/* =====================
   SALES ANALYTICS V2 - Redesigned
   Clean, Decision-focused, User-friendly
===================== */

// State
const salesState = {
  favorites: JSON.parse(localStorage.getItem('salesFavorites') || '[]'),
  onboardingShown: localStorage.getItem('salesOnboardingShown') === 'true',
  currentMode: 'overview'
};

// KPI Definitions with thresholds and recommendations
const kpiDefs = {
  revenue: { label: 'Total försäljning', format: 'currency' },
  conversion: {
    label: 'Konverteringsgrad', format: 'percent', warnBelow: 10, dangerBelow: 5,
    actionLow: 'Förbättra erbjudandetexter eller timing'
  },
  aov: { label: 'Ordervärde', format: 'currency' },
  aiRevenue: { label: 'AI-driven försäljning', format: 'currency' },
  orders: { label: 'Antal köp', format: 'number' },
  convStarted: { label: 'Konversationer', format: 'number' },
  offersShown: { label: 'Erbjudanden visade', format: 'number' },
  offersClicked: { label: 'Klick på erbjudanden', format: 'number' },
  dropoff: {
    label: 'Drop-off', format: 'percent', warnAbove: 40, dangerAbove: 60,
    actionHigh: 'Hög drop-off → Testa kortare erbjudandetext'
  },
  upsellRate: { label: 'Mersäljsgrad', format: 'percent' },
  upsellRevenue: { label: 'Mersäljsintäkt', format: 'currency' },
  rejectedOffers: {
    label: 'Avvisade förslag', format: 'percent', warnAbove: 35, dangerAbove: 50,
    actionHigh: 'Många avvisningar → Anpassa timing eller relevans'
  },
  aiConversion: { label: 'AI-konvertering', format: 'percent' },
  promptPerformance: { label: 'Bästa prompt', format: 'text' },
  fallbackLost: {
    label: 'Tappad vid eskalering', format: 'currency', dangerAbove: 10000,
    actionHigh: 'Hög förlust → Träna AI på vanliga eskaleringsfrågor'
  },
  clvTotal: { label: 'Genomsnittligt CLV', format: 'currency' },
  clvAi: { label: 'CLV med AI', format: 'currency' },
  clvGrowth: { label: 'CLV-tillväxt', format: 'percent' },
  churnRisk: {
    label: 'Churn-risk', format: 'percent', warnAbove: 8, dangerAbove: 15,
    actionHigh: 'Hög churn-risk → Aktivera retention-kampanj'
  },
  churnFailedAi: {
    label: 'Churn efter AI-misslyckande', format: 'percent', dangerAbove: 15,
    actionHigh: 'Granska misslyckade AI-dialoger för förbättring'
  },
  highRiskCount: { label: 'Högrisk-kunder', format: 'number' },
  predictedRevenue: { label: 'Prognostiserad intäkt', format: 'currency' },
  hotLeads: { label: 'Heta leads', format: 'number' },
  buyProbability: { label: 'Köpsannolikhet', format: 'percent' }
};

// Initialize
async function initSalesAnalytics() {
  bindSalesModeButtons();
  bindSalesEvents();

  // Show onboarding first time
  if (!salesState.onboardingShown) {
    showSalesOnboarding();
  }

  await loadSalesData();
  updateFavoriteButtons();
}

function bindSalesModeButtons() {
  document.querySelectorAll('.salesModeBtn').forEach(btn => {
    btn.onclick = () => {
      const mode = btn.dataset.mode;
      switchSalesMode(mode);
    };
  });
}

function switchSalesMode(mode) {
  salesState.currentMode = mode;

  // Update buttons
  document.querySelectorAll('.salesModeBtn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.salesModeBtn[data-mode="${mode}"]`)?.classList.add('active');

  // Update content
  document.querySelectorAll('.salesModeContent').forEach(c => c.style.display = 'none');
  const modeId = 'salesMode' + mode.charAt(0).toUpperCase() + mode.slice(1);
  const modeEl = document.getElementById(modeId);
  if (modeEl) modeEl.style.display = '';

  // Load favorites if my view
  if (mode === 'myview') renderMyViewFavorites();
}

function bindSalesEvents() {
  const periodFilter = document.getElementById('salesPeriodFilter');
  if (periodFilter) periodFilter.onchange = loadSalesData;

  const showOnboardingBtn = document.getElementById('showSalesOnboarding');
  if (showOnboardingBtn) showOnboardingBtn.onclick = showSalesOnboarding;

  const exportBtn = document.getElementById('exportSalesBtn');
  if (exportBtn) exportBtn.onclick = exportSalesReport;
}

function showSalesOnboarding() {
  const modal = document.getElementById('salesOnboarding');
  if (modal) modal.style.display = 'flex';
}

function closeSalesOnboarding() {
  const modal = document.getElementById('salesOnboarding');
  if (modal) modal.style.display = 'none';
  localStorage.setItem('salesOnboardingShown', 'true');
  salesState.onboardingShown = true;
}
window.closeSalesOnboarding = closeSalesOnboarding;

function toggleSalesSection(sectionId) {
  const content = document.getElementById(sectionId + 'Content');
  const header = content?.previousElementSibling;
  if (!content) return;

  const isOpen = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : '';

  const chevron = header?.querySelector('.sectionChevron');
  if (chevron) {
    chevron.style.transform = isOpen ? 'rotate(-90deg)' : '';
  }
}
window.toggleSalesSection = toggleSalesSection;

function toggleFavorite(kpiId) {
  const idx = salesState.favorites.indexOf(kpiId);
  if (idx === -1) {
    salesState.favorites.push(kpiId);
  } else {
    salesState.favorites.splice(idx, 1);
  }
  localStorage.setItem('salesFavorites', JSON.stringify(salesState.favorites));
  updateFavoriteButtons();

  if (salesState.currentMode === 'myview') renderMyViewFavorites();
}
window.toggleFavorite = toggleFavorite;

function updateFavoriteButtons() {
  document.querySelectorAll('.favoriteBtn').forEach(btn => {
    const card = btn.closest('[data-kpi]');
    if (!card) return;
    const kpiId = card.dataset.kpi;
    const isFav = salesState.favorites.includes(kpiId);
    btn.innerHTML = isFav ? '<i class="fa-solid fa-star" style="color: var(--warn);"></i>' : '<i class="fa-regular fa-star"></i>';
  });
}

async function loadSalesData() {
  const days = parseInt(document.getElementById('salesPeriodFilter')?.value || 30);
  const data = generateSalesData(days);

  // Update all KPIs
  updateKpi('revenue', data.revenue, data.revenueTrend);
  updateKpi('conversion', data.conversion, data.conversionTrend);
  updateKpi('aov', data.aov, data.aovTrend);
  updateKpi('aiRevenue', data.aiRevenue, data.aiRevenueTrend);
  updateKpi('orders', data.orders, data.ordersTrend);

  // Optimization mode
  updateKpi('convStarted', data.convStarted);
  updateKpi('offersShown', data.offersShown);
  updateKpi('offersClicked', data.offersClicked);
  updateKpi('dropoff', data.dropoff);
  updateKpi('upsellRate', data.upsellRate);
  updateKpi('upsellRevenue', data.upsellRevenue);
  updateKpi('rejectedOffers', data.rejectedOffers);
  updateKpi('aiConversion', data.aiConversion);
  updateKpi('promptPerformance', data.promptPerformance);
  updateKpi('fallbackLost', data.fallbackLost);

  // Strategy mode
  updateKpi('clvTotal', data.clvTotal);
  updateKpi('clvAi', data.clvAi);
  updateKpi('clvGrowth', data.clvGrowth);
  updateKpi('churnRisk', data.churnRisk);
  updateKpi('churnFailedAi', data.churnFailedAi);
  updateKpi('highRiskCount', data.highRiskCount);
  updateKpi('predictedRevenue', data.predictedRevenue);
  updateKpi('hotLeads', data.hotLeads);
  updateKpi('buyProbability', data.buyProbability);

  // Update insights
  updateTopInsight(data);
  updateSectionInsights(data);
  updateActionRecommendations(data);
}

function generateSalesData(days) {
  const m = days / 30;
  return {
    revenue: Math.round(487500 * m),
    revenueTrend: 12.4,
    conversion: 12.4,
    conversionTrend: 2.1,
    aov: 1975,
    aovTrend: -1.2,
    aiRevenue: Math.round(316875 * m),
    aiRevenueTrend: 18.5,
    orders: Math.round(247 * m),
    ordersTrend: 8.3,

    convStarted: Math.round(2000 * m),
    offersShown: Math.round(1037 * m),
    offersClicked: Math.round(518 * m),
    dropoff: 52.4,
    upsellRate: 23.5,
    upsellRevenue: Math.round(87750 * m),
    rejectedOffers: 34.2,
    aiConversion: 31.2,
    promptPerformance: 'v2.1 (+18%)',
    fallbackLost: Math.round(12400 * m),

    clvTotal: 24500,
    clvAi: 32400,
    clvGrowth: 15.2,
    churnRisk: 8.4,
    churnFailedAi: 18.7,
    highRiskCount: 12,
    predictedRevenue: Math.round(534000 * m),
    hotLeads: 23,
    buyProbability: 45.8
  };
}

function updateKpi(kpiId, value, trend = null) {
  const def = kpiDefs[kpiId] || {};

  // Format value
  let formatted;
  if (def.format === 'currency') {
    formatted = value.toLocaleString('sv-SE') + ' kr';
  } else if (def.format === 'percent') {
    formatted = value + '%';
  } else if (def.format === 'number') {
    formatted = value.toLocaleString('sv-SE');
  } else {
    formatted = value;
  }

  // Update main value
  const valueEl = document.getElementById('kpi_' + kpiId);
  if (valueEl) valueEl.textContent = formatted;

  // Update trend
  if (trend !== null) {
    const trendEl = document.getElementById('kpi_' + kpiId + '_trend');
    if (trendEl) {
      const isPositive = trend >= 0;
      const color = isPositive ? 'var(--ok)' : 'var(--danger)';
      trendEl.innerHTML = `<span style="color: ${color}; font-size: 12px;"><i class="fa-solid fa-arrow-${isPositive ? 'up' : 'down'}"></i> ${Math.abs(trend)}%</span>`;
    }
  }

  // Check thresholds and update actions
  const actionEl = document.getElementById('kpi_' + kpiId + '_action');
  if (actionEl) {
    let action = '';
    if (def.dangerAbove && value > def.dangerAbove) {
      action = def.actionHigh || '';
    } else if (def.warnAbove && value > def.warnAbove) {
      action = def.actionHigh || '';
    } else if (def.dangerBelow && value < def.dangerBelow) {
      action = def.actionLow || '';
    } else if (def.warnBelow && value < def.warnBelow) {
      action = def.actionLow || '';
    }
    actionEl.innerHTML = action ? `<span class="actionTip"><i class="fa-solid fa-lightbulb"></i> ${action}</span>` : '';
  }

  // Update card status
  const card = document.querySelector(`[data-kpi="${kpiId}"]`);
  if (card) {
    card.classList.remove('status-ok', 'status-warn', 'status-danger');
    if (def.dangerAbove && value > def.dangerAbove) {
      card.classList.add('status-danger');
    } else if (def.warnAbove && value > def.warnAbove) {
      card.classList.add('status-warn');
    } else if (def.dangerBelow && value < def.dangerBelow) {
      card.classList.add('status-danger');
    } else if (def.warnBelow && value < def.warnBelow) {
      card.classList.add('status-warn');
    }
  }
}

function updateTopInsight(data) {
  const insightEl = document.getElementById('overviewTopInsight');
  if (!insightEl) return;

  let insight = { title: '', text: '', type: 'info' };

  if (data.aiRevenueTrend > 15) {
    insight = { title: 'AI-försäljningen växer starkt', text: `+${data.aiRevenueTrend}% jämfört med förra perioden. Fortsätt med nuvarande strategi.`, type: 'ok' };
  } else if (data.dropoff > 50) {
    insight = { title: 'Hög drop-off påverkar intäkten', text: `${data.dropoff}% avbryter köpflödet. Överväg att förenkla erbjudanden.`, type: 'warn' };
  } else if (data.churnRisk > 10) {
    insight = { title: 'Ökad churn-risk detekterad', text: `${data.highRiskCount} kunder har hög risk för avhopp. Aktivera retention-åtgärder.`, type: 'danger' };
  } else {
    insight = { title: 'Stabil försäljningsutveckling', text: `Konverteringsgraden ligger på ${data.conversion}% med ${data.orders} genomförda köp.`, type: 'ok' };
  }

  const iconColors = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--primary)' };

  insightEl.innerHTML = `
    <div class="insightIcon" style="color: ${iconColors[insight.type]}"><i class="fa-solid fa-lightbulb"></i></div>
    <div class="insightContent">
      <div class="insightTitle">${insight.title}</div>
      <div class="insightText">${insight.text}</div>
    </div>
  `;
}

function updateSectionInsights(data) {
  const setInsight = (id, text, status = '') => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      el.className = 'sectionInsight' + (status ? ' status-' + status : '');
    }
  };

  setInsight('salesFlowInsight', `${data.conversion}% konvertering`, data.conversion < 10 ? 'warn' : 'ok');
  setInsight('upsellInsight', `${data.upsellRate}% mersälj`, data.upsellRate > 20 ? 'ok' : '');
  setInsight('aiSellerInsight', `${data.aiConversion}% AI-konv.`, data.aiConversion > 25 ? 'ok' : '');
  setInsight('clvInsight', data.clvTotal.toLocaleString('sv-SE') + ' kr', 'ok');
  setInsight('churnInsight', data.churnRisk + '% risk', data.churnRisk > 10 ? 'danger' : 'warn');
  setInsight('predictiveInsight', data.hotLeads + ' heta leads', 'ok');
}

function updateActionRecommendations(data) {
  const container = document.getElementById('overviewActions');
  if (!container) return;

  const recommendations = [];

  if (data.dropoff > 50) {
    recommendations.push({ icon: 'fa-triangle-exclamation', type: 'warn', text: 'Hög drop-off (' + data.dropoff + '%) → Testa kortare erbjudandetext' });
  }
  if (data.churnRisk > 8) {
    recommendations.push({ icon: 'fa-user-slash', type: 'warn', text: data.highRiskCount + ' kunder har hög churn-risk → Aktivera retention' });
  }
  if (data.aiRevenueTrend > 15) {
    recommendations.push({ icon: 'fa-robot', type: 'ok', text: 'AI-försäljningen ökar (' + data.aiRevenueTrend + '%) → Expandera AI-användningen' });
  }
  if (data.hotLeads > 15) {
    recommendations.push({ icon: 'fa-fire', type: 'ok', text: data.hotLeads + ' heta leads identifierade → Prioritera dessa i outreach' });
  }

  if (recommendations.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="actionHeader"><i class="fa-solid fa-hand-point-right"></i> Rekommenderade åtgärder</div>
    ${recommendations.map(r => `
      <div class="actionItem ${r.type}">
        <i class="fa-solid ${r.icon}"></i>
        <span>${r.text}</span>
      </div>
    `).join('')}
  `;
}

function renderMyViewFavorites() {
  const container = document.getElementById('myViewKpiContainer');
  const emptyEl = document.getElementById('myViewEmpty');
  if (!container) return;

  if (salesState.favorites.length === 0) {
    if (emptyEl) emptyEl.style.display = '';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  const days = parseInt(document.getElementById('salesPeriodFilter')?.value || 30);
  const data = generateSalesData(days);

  container.innerHTML = salesState.favorites.map(kpiId => {
    const def = kpiDefs[kpiId] || { label: kpiId, format: 'text' };
    const value = data[kpiId];
    let formatted;
    if (def.format === 'currency') formatted = (value || 0).toLocaleString('sv-SE') + ' kr';
    else if (def.format === 'percent') formatted = (value || 0) + '%';
    else if (def.format === 'number') formatted = (value || 0).toLocaleString('sv-SE');
    else formatted = value || '-';

    return `
      <div class="myViewKpiCard" data-kpi="${kpiId}">
        <button class="favoriteBtn" onclick="toggleFavorite('${kpiId}')"><i class="fa-solid fa-star" style="color: var(--warn);"></i></button>
        <div class="mvKpiValue">${formatted}</div>
        <div class="mvKpiLabel">${def.label}</div>
      </div>
    `;
  }).join('');
}

function exportSalesReport() {
  const days = document.getElementById('salesPeriodFilter')?.value || 30;
  const data = generateSalesData(parseInt(days));

  const report = `
SÄLJANALYSRAPPORT
=================
Period: Senaste ${days} dagar
Genererad: ${new Date().toLocaleString('sv-SE')}

NYCKELTAL
---------
Total försäljning: ${data.revenue.toLocaleString('sv-SE')} kr
Konverteringsgrad: ${data.conversion}%
Genomsnittligt ordervärde: ${data.aov.toLocaleString('sv-SE')} kr
AI-driven försäljning: ${data.aiRevenue.toLocaleString('sv-SE')} kr
Antal köp: ${data.orders}

OPTIMERING
----------
Drop-off: ${data.dropoff}%
Mersäljsgrad: ${data.upsellRate}%
AI-konvertering: ${data.aiConversion}%

STRATEGI
--------
CLV (snitt): ${data.clvTotal.toLocaleString('sv-SE')} kr
CLV med AI: ${data.clvAi.toLocaleString('sv-SE')} kr
Churn-risk: ${data.churnRisk}%
Heta leads: ${data.hotLeads}

Rapporten skapad av AI Kundtjänst
  `.trim();

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `saljanalys_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  if (typeof toast === 'function') toast('Exporterad', 'Rapporten har laddats ner', 'success');
}

window.initSalesAnalytics = initSalesAnalytics;



/* =====================
   SCENARIOPLANERING V3 - Time Horizon & Hero Metrics
===================== */

const scenarioState = {
  workDaysPerMonth: 22,
  aiCostPerTicket: 2,
  favorites: JSON.parse(localStorage.getItem('scenarioFavorites') || '[]'),
  onboardingShown: localStorage.getItem('scenarioOnboardingShown') === 'true',
  currentMode: 'overview',
  timeHorizon: 12 // Months (default: 1 Year)
};

// Initialize Scenario Planner
async function initScenarioPlanner() {
  bindScenarioInputs();
  bindScenarioExport();

  // Check onboarding
  if (!scenarioState.onboardingShown) {
    document.getElementById('scenarioOnboarding').style.display = 'flex';
  }

  // Load favorites
  updateFavoriteButtons();

  // Set default time filter active
  setScenarioTime(12);

  // Try to load real data
  try {
    const slaData = await api("/sla/dashboard?days=30").catch(() => null);
    if (slaData && slaData.totalTickets) {
      document.getElementById('sc_tickets').value = slaData.totalTickets;
      document.getElementById('sc_tickets_val').textContent = slaData.totalTickets;
    }
  } catch (e) {
    console.log("Using default scenario values");
  }

  // Initial calc
  calculateScenario();
}

function setScenarioTime(months) {
  scenarioState.timeHorizon = months;

  // Update active class
  document.querySelectorAll('.timeFilterBtn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tf_${months}`)?.classList.add('active');

  // Update labels
  let label = months + " Mån";
  if (months === 12) label = "1 År";
  if (months === 36) label = "3 År";

  updateText('summary_save_label', `Besparing (${label})`);
  updateText('summary_time_label', `Sparad Tid (${label})`);

  // If overview hero cards exist
  updateText('hero_money_label', `Besparing (${label})`);
  updateText('hero_time_label', `Sparad Tid (${label})`);

  // Recalculate
  calculateScenario();
}

function updateText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Mode Switching
function setScenarioMode(mode) {
  scenarioState.currentMode = mode;

  document.querySelectorAll('.modeTab').forEach(tab => tab.classList.remove('active'));
  // Simple ID based toggle
  const btn = document.getElementById(`tab_${mode}`);
  if (btn) btn.classList.add('active');

  // Hide all sections first
  document.querySelectorAll('.scenarioModeSection').forEach(el => el.style.display = 'none');

  // Show selected section
  const target = document.getElementById(`sc_mode_${mode}`);
  if (target) {
    target.style.display = 'block';
    target.classList.add('fade-in');
    setTimeout(() => target.classList.remove('fade-in'), 500);
  }

  if (mode === 'myView') {
    renderFavorites();
  }
}

// Favorites System
function toggleFavorite(id, name) {
  const index = scenarioState.favorites.findIndex(f => f.id === id);

  if (index === -1) {
    scenarioState.favorites.push({ id, name });
    if (typeof toast === 'function') toast('Sparat', `${name} har lagts till i Min Vy`, 'success');
  } else {
    scenarioState.favorites.splice(index, 1);
    if (typeof toast === 'function') toast('Borttaget', `${name} har tagits bort från Min Vy`, 'info');
  }

  localStorage.setItem('scenarioFavorites', JSON.stringify(scenarioState.favorites));
  updateFavoriteButtons();
  if (scenarioState.currentMode === 'myView') renderFavorites();
}

function updateFavoriteButtons() {
  document.querySelectorAll('.favoriteBtn').forEach(btn => {
    btn.innerHTML = '<i class="fa-regular fa-star"></i>';
    btn.classList.remove('active');

    const onclick = btn.getAttribute('onclick');
    if (onclick) {
      const match = onclick.match(/'([^']+)'/);
      if (match) {
        const id = match[1];
        if (scenarioState.favorites.find(f => f.id === id)) {
          btn.innerHTML = '<i class="fa-solid fa-star"></i>';
          btn.classList.add('active');
        }
      }
    }
  });
}

function renderFavorites() {
  const container = document.getElementById('sc_favoritesContainer');
  if (!container) return;

  container.innerHTML = '';

  if (scenarioState.favorites.length === 0) {
    container.innerHTML = `
            <div class="emptyState">
                <i class="fa-regular fa-star"></i>
                <p>Du har inte valt några favoriter än. Klicka på stjärnan vid ett KPI för att lägga till det här.</p>
            </div>`;
    return;
  }

  scenarioState.favorites.forEach(fav => {
    const valEl = document.getElementById(fav.id);
    const card = valEl?.closest('.execKpiCard, .resultCard, .savingsCard, .growthCard, .timeStat, .heroCard');

    if (card) {
      const clone = card.cloneNode(true);
      // Remove hero-specific layout classes if needed, but grid adapts
      const favBtn = clone.querySelector('.favoriteBtn');
      if (favBtn) {
        favBtn.setAttribute('onclick', `toggleFavorite('${fav.id}', '${fav.name}')`);
        favBtn.classList.add('active');
        favBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        favBtn.title = "Ta bort från Min Vy";
      }
      container.appendChild(clone);
    }
  });
}

// Section Toggling
function toggleSection(contentId) {
  const content = document.getElementById(contentId);
  const header = content.previousElementSibling;

  if (content.style.display === 'none' || content.classList.contains('collapsed')) {
    content.style.display = 'block';
    content.classList.remove('collapsed');
    header.classList.remove('collapsed');
  } else {
    content.style.display = 'none';
    content.classList.add('collapsed');
    header.classList.add('collapsed');
  }
}

// Onboarding
function closeScenarioOnboarding() {
  document.getElementById('scenarioOnboarding').style.display = 'none';
  localStorage.setItem('scenarioOnboardingShown', 'true');
  scenarioState.onboardingShown = true;
}

function toggleScenarioOnboarding() {
  document.getElementById('scenarioOnboarding').style.display = 'flex';
}

function bindScenarioInputs() {
  const inputs = ['sc_tickets', 'sc_aiRate', 'sc_staffCost', 'sc_ticketsPerDay', 'sc_targetSla'];
  inputs.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.oninput = () => {
      updateSliderValue(id);
      calculateScenario();
    };
  });
}

function updateSliderValue(id) {
  const input = document.getElementById(id);
  const display = document.getElementById(id + '_val');
  if (!input || !display) return;
  let value = parseInt(input.value);
  if (id === 'sc_staffCost') {
    display.textContent = value.toLocaleString('sv-SE');
  } else {
    display.textContent = value;
  }
}

function bindScenarioExport() {
  // handled by onclick in HTML
}

function calculateScenario() {
  // Get inputs
  const tickets = parseInt(document.getElementById('sc_tickets')?.value || 500);
  const aiRate = parseInt(document.getElementById('sc_aiRate')?.value || 40) / 100;
  const staffCost = parseInt(document.getElementById('sc_staffCost')?.value || 45000);
  const ticketsPerDay = parseInt(document.getElementById('sc_ticketsPerDay')?.value || 12);
  const targetSla = parseInt(document.getElementById('sc_targetSla')?.value || 90);

  // Core Metrics
  const manualTickets = Math.round(tickets * (1 - aiRate));
  const aiTickets = Math.round(tickets * aiRate);

  const ticketsPerStaffPerMonth = ticketsPerDay * scenarioState.workDaysPerMonth;
  const requiredStaff = Math.ceil(manualTickets / ticketsPerStaffPerMonth);
  const optimalStaff = Math.max(1, requiredStaff);

  const staffTotalCost = optimalStaff * staffCost;
  const aiCost = aiTickets * scenarioState.aiCostPerTicket;
  const totalCost = staffTotalCost + aiCost;

  // Baseline (No AI)
  const baselineStaff = Math.ceil(tickets / ticketsPerStaffPerMonth);
  const baselineCost = baselineStaff * staffCost;
  const monthlySavings = baselineCost - totalCost;

  // Freed Capacity
  const freedStaff = (baselineStaff - optimalStaff).toFixed(1);

  // SLA Projection
  const capacity = optimalStaff * ticketsPerStaffPerMonth;
  const utilizationRate = manualTickets / capacity;
  let projectedSla = targetSla;
  if (utilizationRate > 1) {
    projectedSla = Math.max(70, targetSla - Math.round((utilizationRate - 1) * 30));
  } else if (utilizationRate < 0.8) {
    projectedSla = Math.min(99, targetSla + Math.round((0.8 - utilizationRate) * 10));
  }

  // -- TIME HORIZON CALCULATIONS --
  const months = scenarioState.timeHorizon;
  const periodSavings = monthlySavings * months;

  // Time calculations
  const avgHandleTime = 20; // minutes
  const hoursPerMonth = Math.round((aiTickets * avgHandleTime) / 60);
  const periodHours = hoursPerMonth * months;

  // ROI
  const aiMonthlyCost = 2000;
  const roi = aiMonthlyCost > 0 ? Math.round((monthlySavings / aiMonthlyCost) * 100) : 0;

  // --- UPDATE UI ---

  // 1. HERO CARDS (Overview)
  // Money
  updateResult('hero_money_val', formatCurrencyShort(Math.max(0, periodSavings)));
  // Time
  updateResult('hero_time_val', periodHours.toLocaleString('sv-SE') + " h");
  updateResult('hero_fte_val', freedStaff);
  // Volume (monthly * period?) usually people want monthly volume, but let's show period volume if filter is > 1 month?
  // No, "AI-hanterade ärenden" usually means "Capacity/Volume". Let's show Monthly Volume usually, OR Total Volume over period.
  // "Besparing (3 år)" implies TOTAL money. So "AI-ärenden" might imply TOTAL ärenden handled?
  // Let's stick to Monthly Volume for Hero if it says "AI-hanterade ärenden". BUT the user wants visualization of "hur många ärenden den sparar företaget".
  // "Sparar företaget" -> Cumulative.
  const periodTickets = aiTickets * months;
  updateResult('hero_vol_val', periodTickets.toLocaleString('sv-SE'));
  updateResult('hero_vol_label', `AI-ärenden (${months} mån)`); // Update label to be clear

  // Quality (constant)
  updateResult('sc_currentSla', projectedSla + '%');

  // 2. STICKY SUMMARY (Dynamic)
  updateResult('sc_summaryYearSave', formatCurrencyShort(Math.max(0, periodSavings)));
  updateResult('sc_summaryTime', periodHours.toLocaleString('sv-SE') + " h");
  updateResult('sc_summaryRoi', roi + '%');

  // 3. LEGACY / DETAILED SECTIONS
  updateExecKpi('sc_currentTickets', tickets);
  updateResult('sc_currentCost', formatCurrencyShort(baselineCost));
  updateResult('sc_currentAi', Math.round(aiRate * 100) + '%');

  updateResult('sc_reqStaff', optimalStaff);
  updateResult('sc_totalCost', formatCurrencyShort(totalCost));
  updateResult('sc_savings', formatCurrencyShort(Math.max(0, monthlySavings)));
  updateResult('sc_projectedSla', projectedSla + '%');

  // Savings Section (Finance)
  updateResult('sc_yearSavings', formatCurrencyShort(Math.max(0, monthlySavings * 12)));
  updateResult('sc_monthSavings', formatCurrencyShort(Math.max(0, monthlySavings)));
  updateResult('sc_roiPercent', roi + '%');
  updateResult('sc_costPerTicket', Math.round(totalCost / tickets) + ' kr');

  // Time Section
  updateResult('sc_hoursWeek', Math.round(hoursPerMonth / 4.33) + ' h');
  updateResult('sc_hoursMonth', hoursPerMonth + ' h');

  // Growth Section
  const maxCapacity = optimalStaff * ticketsPerStaffPerMonth;
  const maxTicketsWithAi = Math.round(maxCapacity / (1 - aiRate));
  updateResult('sc_maxTickets', maxTicketsWithAi);
  updateResult('sc_breakeven', Math.round(maxCapacity * 1.15 / (1 - aiRate)));

  const capacityPercent = Math.round(utilizationRate * 100);
  const capacityBar = document.getElementById('sc_capacityBar');
  if (capacityBar) {
    updateResult('sc_capacityPercent', capacityPercent + '%');
    capacityBar.style.width = Math.min(100, capacityPercent) + '%';
    capacityBar.style.background = capacityPercent > 90 ? 'var(--danger)' :
      capacityPercent > 75 ? 'var(--warn)' :
        'linear-gradient(90deg, var(--primary), #8b5cf6)';
  }

  // Recommendation
  updateRecommendation(optimalStaff, baselineStaff, monthlySavings, projectedSla, targetSla, utilizationRate);

  if (scenarioState.currentMode === 'myView') {
    renderFavorites();
  }
}

function updateExecKpi(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateResult(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatCurrencyShort(value) {
  return value.toLocaleString('sv-SE') + ' kr';
}

function updateRecommendation(optimalStaff, baselineStaff, savings, projectedSla, targetSla, utilization) {
  const recText = document.getElementById('sc_recText');
  const recCard = document.getElementById('sc_recommendation');
  if (!recText) return;

  let text = '';
  if (optimalStaff < baselineStaff && savings > 0) {
    text = `Strategi: Behåll ${Math.round(document.getElementById('sc_aiRate')?.value * 100) || 40}% AI. Det sparar ${formatCurrencyShort(savings)}/månad och frigör resurser för tillväxt.`;
  } else if (utilization > 1) {
    text = `Agera: Kapacitetsbrist! Öka AI-graden eller anställ 1 person för att säkra SLA.`;
  } else {
    text = `Status: Verksamheten är optimerad. Kostnaden är låg och kapacitet finns för att växa.`;
  }

  recText.textContent = text;
}

function exportScenarioReport() {
  alert("Exportfunktionen laddar ner rapport...");
}

// Global exports
window.initScenarioPlanner = initScenarioPlanner;
window.setScenarioMode = setScenarioMode;
window.setScenarioTime = setScenarioTime;
window.toggleFavorite = toggleFavorite;
window.toggleSection = toggleSection;
window.closeScenarioOnboarding = closeScenarioOnboarding;
window.toggleScenarioOnboarding = toggleScenarioOnboarding;


function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const btn = event.currentTarget;
  const icon = btn.querySelector('i');

  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
}

window.togglePasswordVisibility = togglePasswordVisibility;

/* =====================
   CRM 2.0 LOGIC
===================== */

function setCrmTab(tabId) {
  document.querySelectorAll('.crmTabContent').forEach(el => el.style.display = 'none');

  const content = document.getElementById('crm_' + tabId);
  if (content) content.style.display = 'block';

  document.querySelectorAll('.crmNavBtn').forEach(btn => btn.classList.remove('active'));

  const btn = document.getElementById('tab_crm_' + tabId);
  if (btn) btn.classList.add('active');

  if (tabId === 'pipeline') renderPipeline();
}

function allowDrop(ev) {
  ev.preventDefault();
}

function drag(ev) {
  ev.dataTransfer.setData("text", ev.target.id);
  ev.target.style.opacity = '0.5';
}

function drop(ev) {
  ev.preventDefault();
  var data = ev.dataTransfer.getData("text");
  var el = document.getElementById(data);

  if (el) {
    el.style.opacity = '1';
    var target = ev.target.closest('.pipelineBody');
    if (target) {
      target.appendChild(el);

      // Sync State & Stage
      const dealId = data;
      const stageId = target.id.replace('pipelineBody-', '');
      updateDealStageInsideStorage(dealId, stageId);

      updatePipelineCounts();
      if (typeof renderCrmDashboard === 'function') renderCrmDashboard();
      if (typeof toast === 'function') toast('Uppdaterad', 'Affären har flyttats', 'success');
    }
  }
}

function updateDealStageInsideStorage(id, stage) {
  let deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
  const idx = deals.findIndex(d => d.id === id);
  if (idx !== -1) {
    deals[idx].stage = stage;
    localStorage.setItem('crmDeals', JSON.stringify(deals));
    if (typeof crmState !== 'undefined') crmState.deals = deals;
  }
}

function updatePipelineCounts() {
  document.querySelectorAll('.pipelineColumn').forEach(col => {
    const body = col.querySelector('.pipelineBody');
    const badge = col.querySelector('.stageCount');
    if (badge && body) {
      badge.textContent = body.querySelectorAll('.dealCard').length;
    }
  });
}

function renderPipeline() {
  const stages = ['new', 'qualified', 'proposal', 'negotiation'];
  stages.forEach(s => {
    const body = document.getElementById('pipelineBody-' + s);
    if (body) body.innerHTML = '';
  });

  const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
  deals.forEach(deal => {
    const body = document.getElementById('pipelineBody-' + deal.stage);
    if (body) {
      const card = document.createElement('div');
      card.className = 'dealCard';
      card.draggable = true;
      card.id = deal.id;
      card.ondragstart = drag;
      card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div class="dealCompany"><b>${deal.company}</b></div>
                    <div style="display:flex; gap:5px;">
                        <button class="btn ghost small icon" onclick="openEditDealModal('${deal.id}')" title="Redigera"><i class="fa-solid fa-pen" style="font-size:10px;"></i></button>
                        <button class="btn ghost small icon" onclick="deleteDeal('${deal.id}')" title="Ta bort"><i class="fa-solid fa-trash" style="color:var(--danger); font-size:10px;"></i></button>
                    </div>
                </div>
                <div class="dealName small muted" style="margin-bottom:5px;">${deal.name}</div>
                <div class="dealValue" style="font-weight:bold; color:var(--primary);">${new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumSignificantDigits: 3 }).format(deal.value || 0)}</div>
                <div class="dealFooter" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div class="dealTags"><span class="dealTag tag-hot" style="font-size:9px;">${deal.type?.toUpperCase() || 'NY'}</span></div>
                    <div class="dealOwner" style="font-size:10px; opacity:0.7;">👤 ${deal.owner === 'me' ? 'MIG' : 'TEAM'}</div>
                </div>
            `;
      body.appendChild(card);
    }
  });
  updatePipelineCounts();
}

window.deleteDeal = function (id) {
  if (!confirm('Vill du verkligen radera denna affär?')) return;
  let deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
  deals = deals.filter(d => d.id !== id);
  localStorage.setItem('crmDeals', JSON.stringify(deals));
  if (typeof crmState !== 'undefined') crmState.deals = deals;
  renderPipeline();
  if (typeof renderCrmDashboard === 'function') renderCrmDashboard();
  if (typeof toast === 'function') toast("Raderad", "Affären har tagits bort.", "success");
};

window.openEditDealModal = function (id) {
  const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
  const deal = deals.find(d => d.id === id);
  if (!deal) return;

  document.getElementById('editDealId').value = deal.id;
  document.getElementById('editDealName').value = deal.name;
  document.getElementById('editDealCompany').value = deal.company;
  document.getElementById('editDealValue').value = deal.value;
  document.getElementById('editDealStage').value = deal.stage;
  document.getElementById('editDealDesc').value = deal.description || '';

  const modal = document.getElementById('crmEditDealModal');
  if (modal) modal.style.display = 'flex';
};

window.updateDeal = function () {
  const id = document.getElementById('editDealId').value;
  let deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
  const idx = deals.findIndex(d => d.id === id);
  if (idx === -1) return;

  deals[idx].name = document.getElementById('editDealName').value;
  deals[idx].value = parseInt(document.getElementById('editDealValue').value) || 0;
  deals[idx].stage = document.getElementById('editDealStage').value;
  deals[idx].description = document.getElementById('editDealDesc').value;

  localStorage.setItem('crmDeals', JSON.stringify(deals));
  if (typeof crmState !== 'undefined') crmState.deals = deals;

  closeCrmModal('crmEditDealModal');
  renderPipeline();
  if (typeof renderCrmDashboard === 'function') renderCrmDashboard();
  if (typeof toast === 'function') toast("Uppdaterad", "Affären har sparats.", "success");
};

function openCustomerModal(name) {
  const modal = document.getElementById('crmCustomerModal');
  if (modal) {
    modal.style.display = 'flex';
    // Mock title update
    const title = document.getElementById('crmModalCustomerName');
    if (title && name) title.textContent = name;

    // Mock specific data if needed
  }
}



// Close modal logic
document.addEventListener('click', function (e) {
  if (e.target.id === 'crmCloseModalBtn' || e.target.closest('#crmCloseModalBtn')) {
    const m = document.getElementById('crmCustomerModal');
    if (m) m.style.display = 'none';
  }
  if (e.target.id === 'crmCustomerModal') {
    e.target.style.display = 'none';
  }
});

// Expose to window
window.setCrmTab = setCrmTab;
window.allowDrop = allowDrop;
window.drag = drag;
window.drop = drop;
window.openCustomerModal = openCustomerModal;
window.openDealModal = openDealModal;
window.renderPipeline = renderPipeline;




/* =====================
   CRM 2.0 LOGIC (AI POWERED)
===================== */

// Enhanced State with persistence
const crmState = {
  customers: JSON.parse(localStorage.getItem('crmCustomers') || '[]'),
  deals: JSON.parse(localStorage.getItem('crmDeals') || '[]'),
};

// --- MODAL CONTROLLERS ---

function openDealModal() {
  const modal = document.getElementById('crmAddDealModal');
  if (modal) {
    // Populate Companies
    const dl = document.getElementById('dealCompanyList');
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    if (dl && customers.length > 0) {
      dl.innerHTML = customers.map(c => `<option value="${c.name}">`).join('');
    }
    const nameInput = document.getElementById('dealName');
    if (nameInput) nameInput.value = '';
    modal.style.display = 'flex';
  }
}

function saveNewDeal() {
  const name = document.getElementById('dealName')?.value;
  const company = document.getElementById('dealCompany')?.value;
  const value = document.getElementById('dealValue')?.value;
  const stage = document.getElementById('dealStage')?.value || 'new';

  if (!name || !company) {
    if (typeof toast === 'function') toast('Fel', 'Fyll i namn och företag', 'error');
    return;
  }

  const deal = {
    id: 'd' + Date.now(),
    name,
    company,
    value: parseInt(value) || 0,
    stage,
    created: new Date().toISOString()
  };

  crmState.deals.push(deal);
  localStorage.setItem('crmDeals', JSON.stringify(crmState.deals));

  closeCrmModal('crmAddDealModal');

  // Add to UI immediately if in pipeline view
  addDealToPipelineUI(deal);

  if (typeof toast === 'function') toast('Sparat', 'Affär skapad', 'success');
}

function addDealToPipelineUI(deal) {
  renderPipeline();
  if (typeof renderCrmDashboard === 'function') renderCrmDashboard();
}


function openAddCustomerModal() {
  const modal = document.getElementById('crmAddCustomerModal');
  if (modal) modal.style.display = 'flex';
}

function saveNewCustomer() {
  const name = document.getElementById('custName')?.value;
  const industry = document.getElementById('custIndustry')?.value;
  const contact = document.getElementById('custContactName')?.value;
  const email = document.getElementById('custEmail')?.value;
  const aiDeploy = document.getElementById('custAiDeploy')?.checked;

  if (!name) {
    if (typeof toast === 'function') toast('Fel', 'Företagsnamn krävs', 'error');
    return;
  }

  const customer = {
    id: 'c' + Date.now(),
    name,
    industry,
    contact,
    email,
    aiConfig: aiDeploy ? { status: 'active', model: 'gpt-4o', created: new Date().toISOString() } : null,
    created: new Date().toISOString()
  };

  if (aiDeploy) {
    const overlay = document.getElementById('aiDeployOverlay');
    const text = document.getElementById('aiDeployText');
    const sub = document.getElementById('aiDeploySub');

    if (overlay) overlay.style.display = 'flex';

    // Progress simulation
    setTimeout(() => { if (text) text.textContent = "Skapar AI-kunskapsbas..."; if (sub) sub.textContent = "Hämtar data..."; }, 1000);
    setTimeout(() => { if (text) text.textContent = "Konfigurerar agent..."; if (sub) sub.textContent = "Tränar modell..."; }, 2500);
    setTimeout(() => {
      if (overlay) overlay.style.display = 'none';
      finalizeCustomerSave(customer);
    }, 4000);
  } else {
    finalizeCustomerSave(customer);
  }
}

function finalizeCustomerSave(customer) {
  crmState.customers.push(customer);
  localStorage.setItem('crmCustomers', JSON.stringify(crmState.customers));

  closeCrmModal('crmAddCustomerModal');
  renderCustomerList();

  if (typeof toast === 'function') toast('Klar', `Kund tillagd${customer.aiConfig ? ' med AI-agent' : ''}`, 'success');

  // Reset form
  document.getElementById('custName').value = '';
  // ... reset others
}

function closeCrmModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// --- RENDERERS ---

function renderCustomerList() {
  const tbody = document.getElementById('crmAnalyticsTable');
  if (!tbody) return;

  // Merge default persistence if empty
  let displayList = crmState.customers;
  if (displayList.length === 0) {
    // Show demo rows from HTML if localStorage is empty?
    // Or keep empty. Let's keep empty state handling.
    // But the user might want to see the demo data from the HTML initially.
    // If we clear HTML on load, usage might be confused.
    // Let's append to existing if we detect they are static? No, clear and render is safer.
  }

  if (displayList.length > 0) {
    tbody.innerHTML = displayList.map(c => `
            <tr onclick="openCustomerModal('${c.id}')" style="cursor:pointer; border-bottom:1px solid var(--border);">
                <td style="padding:12px;"><b>${c.name}</b><br><span class="muted small">${c.industry || '-'}</span></td>
                <td style="padding:12px;">${c.contact || '-'}<br><span class="muted small">${c.email || '-'}</span></td>
                <td style="padding:12px;">${c.aiConfig ? '<span class="pill ok">AI Aktiv</span>' : '<span class="pill">Ingen AI</span>'}</td>
                <td style="padding:12px; text-align:right;">-</td>
                <td style="padding:12px; text-align:center;">
                    ${c.aiConfig ? '92' : '-'}
                </td>
                <td style="padding:12px; text-align:right;">
                    <button class="btn ghost small icon"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn ghost small icon" onclick="deleteCustomer('${c.id}', event)"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
  }
}

function deleteCustomer(id, event) {
  event.stopPropagation();
  if (confirm("Ta bort kund?")) {
    crmState.customers = crmState.customers.filter(c => c.id !== id);
    localStorage.setItem('crmCustomers', JSON.stringify(crmState.customers));
    renderCustomerList();
  }
}

// Override previous openCustomerModal to handle dynamic data
function openCustomerModal(idOrName) {
  // Try to find in state first
  let customer = crmState.customers.find(c => c.id === idOrName || c.name === idOrName);

  // Fallback for static demo rows in HTML (name based)
  if (!customer && typeof idOrName === 'string') {
    // Mock a customer object based on the name clicked in static HTML
    if (idOrName.includes('TechCorp')) customer = { name: 'TechCorp AB', industry: 'IT', contact: 'Maria A', email: 'maria@techcorp.se', aiConfig: { status: 'active' } };
    else if (idOrName.includes('Norrland')) customer = { name: 'Norrland Transport', industry: 'Logistik', contact: 'Per P', email: 'per@norrland.se', aiConfig: null };
  }

  if (!customer) return; // Should allow creating new one? No.

  const modal = document.getElementById('crmCustomerModal');
  if (!modal) return;

  modal.style.display = 'flex';

  // Reset content to view mode
  renderCustomerModalContent(customer, modal);
}

function renderCustomerModalContent(customer, modal) {
  const body = document.getElementById('crmModalBody');

  body.innerHTML = `
        <div class="customerProfileLayout">
            <div class="customerSidebar" style="border-right:1px solid var(--border);">
                <div class="topInfo" style="text-align:center; margin-bottom:20px;">
                    <div class="avatar-large" style="width:80px; height:80px; margin:0 auto 10px; background:#e0e7ff; color:var(--primary); font-size:32px; display:flex; align-items:center; justify-content:center; border-radius:50%;">${customer.name.substring(0, 2).toUpperCase()}</div>
                    <h2 style="font-size:20px; margin:0;">${customer.name}</h2>
                    <p class="muted">${customer.industry || 'Okänd bransch'} • Stockholm</p>
                    <div class="pill ${customer.aiConfig ? 'ok' : 'warn'}" style="margin-top:5px;">${customer.aiConfig ? 'AI Aktiv' : 'Ingen AI'}</div>
                </div>
                
                ${customer.aiConfig ? `
                <div class="aiInsightBox">
                    <div style="font-size:12px; text-transform:uppercase; color:var(--primary); font-weight:bold; margin-bottom:5px;">AI Status</div>
                    <div class="aiScore">ONLINE</div>
                    <p style="font-size:12px; margin-top:5px;">Agenten hanterar inkommande frågor.</p>
                    <button class="btn primary small full" style="margin-top:10px;">Konfigurera Agent</button>
                </div>` : ''}

                <div class="contactInfoList" style="margin-top:20px;">
                    <div style="margin-bottom:10px;">
                        <label style="font-size:11px; text-transform:uppercase;">Kontaktperson</label>
                        <div><i class="fa-solid fa-user" style="width:20px; color:var(--text-muted);"></i> ${customer.contact || '-'}</div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="font-size:11px; text-transform:uppercase;">E-post</label>
                        <div><i class="fa-solid fa-envelope" style="width:20px; color:var(--text-muted);"></i> ${customer.email || '-'}</div>
                    </div>
                </div>
            </div>
            
            <div class="customerMain" style="padding:20px;">
                <div class="crmNav" style="margin-bottom:20px;">
                    <button class="crmNavBtn active">Tidslinje</button>
                    <button class="crmNavBtn">Affärer</button>
                    <button class="crmNavBtn">Ärenden</button>
                    ${customer.aiConfig ? '<button class="crmNavBtn" style="color:var(--primary);"><i class="fa-solid fa-robot"></i> AI-Logg</button>' : ''}
                </div>
                
                <div class="activityTimeline">
                    <div class="activityItem meeting">
                        <div class="activityMeta">Idag • System</div>
                        <div>Kundprofil öppnad.</div>
                    </div>
                    ${customer.aiConfig ? `
                    <div class="activityItem call">
                        <div class="activityMeta">Nyss • AI System</div>
                        <div>AI-agent driftsatt och redo.</div>
                    </div>` : ''}
                     <div class="activityItem email">
                        <div class="activityMeta">Registrering</div>
                        <div>Kund registrerad i systemet.</div>
                    </div>
                </div>
            </div>
        </div>
    `;

  // Update Header 
  const title = document.getElementById('crmModalCustomerName');
  if (title) title.textContent = customer.name;

  // Bind Edit Button
  const editBtn = modal.querySelector('.modalActions .btn'); // The first button is Edit based on HTML structure
  // Actually, I need to be careful not to break close button.
  // The previous HTML had a specific edit button.
}


// Expose
window.openDealModal = openDealModal;
window.saveNewDeal = saveNewDeal;
window.openAddCustomerModal = openAddCustomerModal;
window.saveNewCustomer = saveNewCustomer;
window.closeCrmModal = closeCrmModal;
window.openCustomerModal = openCustomerModal;
window.deleteCustomer = deleteCustomer;

// Auto-render on load
document.addEventListener('DOMContentLoaded', () => {
  // If we are on customers tab, render.
  renderCustomerList();
});




/* =====================
   CRM 3.0 LOGIC (ENTERPRISE DATA)
===================== */

// Tab Switching in Modal
function setModalTab(tabId, btn) {
  const modal = btn.closest('.modalContent');
  if (!modal) return;
  modal.querySelectorAll('.modalTabContent').forEach(t => t.style.display = 'none');
  modal.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));

  const target = modal.querySelector('#' + tabId);
  if (target) target.style.display = 'block';
  btn.classList.add('active');
}

function saveNewCustomerExpanded() {
  // Basic Info
  const name = document.getElementById('custName')?.value;
  const org = document.getElementById('custOrg')?.value;
  const industry = document.getElementById('custIndustry')?.value;
  const web = document.getElementById('custWeb')?.value;
  const status = document.getElementById('custStatus')?.value;
  const owner = document.getElementById('custOwner')?.value;
  const notes = document.getElementById('custNotes')?.value;

  // Contact
  const first = document.getElementById('custContactFirst')?.value;
  const last = document.getElementById('custContactLast')?.value;
  const email = document.getElementById('custEmail')?.value;
  const phone = document.getElementById('custPhone')?.value;
  const role = document.getElementById('custRole')?.value;

  const contactName = (first || last) ? `${first || ''} ${last || ''}`.trim() : '';

  // Address
  const address = document.getElementById('custAddress')?.value;
  const zip = document.getElementById('custZip')?.value;
  const city = document.getElementById('custCity')?.value;
  const country = document.getElementById('custCountry')?.value;

  // AI
  const aiDeploy = document.getElementById('custAiDeploy')?.checked;
  const aiModel = document.getElementById('custAiModel')?.value;
  const aiLang = document.getElementById('custAiLang')?.value;

  if (!name) {
    if (typeof toast === 'function') toast('Fel', 'Företagsnamn krävs', 'error');
    else alert("Företagsnamn krävs");
    return;
  }

  const customer = {
    id: 'c' + Date.now(),
    name,
    org,
    industry,
    web,
    status,
    owner,
    notes,
    contact: contactName,
    email,
    phone,
    role,
    address: {
      street: address,
      zip,
      city,
      country
    },
    aiConfig: aiDeploy ? {
      status: 'active',
      model: aiModel,
      lang: aiLang,
      created: new Date().toISOString(),
      apiKey: 'sk-proj-' + Math.random().toString(36).substring(7)
    } : null,
    created: new Date().toISOString()
  };

  if (aiDeploy) {
    const overlay = document.getElementById('aiDeployOverlay');
    const text = document.getElementById('aiDeployText');
    const sub = document.getElementById('aiDeploySub');

    if (overlay) overlay.style.display = 'flex';

    // Extended Simulation
    setTimeout(() => { if (text) text.textContent = "Analyserar webbplats..."; if (sub) sub.textContent = web ? `Skannar ${web}...` : "Hämtar branschdata..."; }, 1500);
    setTimeout(() => { if (text) text.textContent = "Skapar kunskapsmodell..."; if (sub) sub.textContent = `Modell: ${aiModel}`; }, 3500);
    setTimeout(() => { if (text) text.textContent = "Genererar API-nycklar..."; if (sub) sub.textContent = "Sätter upp säkerhetspolicy..."; }, 5500);
    setTimeout(() => {
      if (overlay) overlay.style.display = 'none';
      finalizeCustomerSave(customer);
    }, 7000);
  } else {
    finalizeCustomerSave(customer);
  }
}

// Override renderCustomerModalContent to show rich data
function renderCustomerModalContent(customer, modal) {
  const body = document.getElementById('crmModalBody');
  const initials = customer.name.substring(0, 2).toUpperCase();

  // Safety check for address
  const street = customer.address?.street || '';
  const city = customer.address?.city || '';

  body.innerHTML = `
        <div class="customerProfileLayout">
            <!-- SIDEBAR -->
            <div class="customerSidebar" style="border-right:1px solid var(--border); overflow-y:auto; max-height:100%;">
                <div class="topInfo" style="text-align:center; margin-bottom:20px;">
                    <div class="avatar-large" style="width:80px; height:80px; margin:0 auto 10px; background:#e0e7ff; color:var(--primary); font-size:32px; display:flex; align-items:center; justify-content:center; border-radius:50%;">${initials}</div>
                    <h2 style="font-size:20px; margin:0;">${customer.name}</h2>
                    <p class="muted">${customer.industry || 'Okänd bransch'} • ${city || 'Ingen ort'}</p>
                    <div class="pill ${customer.aiConfig ? 'ok' : (customer.status === 'prospect' ? 'warn' : 'info')}" style="margin-top:5px;">
                        ${customer.status === 'prospect' ? 'Prospekt' : (customer.status === 'churn' ? 'Avslutad' : 'Aktiv Kund')}
                    </div>
                </div>
                
                ${customer.aiConfig ? `
                <div class="aiInsightBox">
                    <div style="font-size:12px; text-transform:uppercase; color:var(--primary); font-weight:bold; margin-bottom:5px; display:flex; justify-content:space-between;">
                        <span>AI Status</span> <span style="font-size:16px;">🟢</span>
                    </div>
                    <div class="aiScore">ONLINE</div>
                    <div style="font-size:11px; margin-top:5px; color:var(--text-muted);">
                        <b>Modell:</b> ${customer.aiConfig.model}<br>
                        <b>API Key:</b> ${customer.aiConfig.apiKey.substring(0, 8)}...
                    </div>
                    <button class="btn primary small full" style="margin-top:10px;">Hantera Agent</button>
                </div>` : ''}

                <div class="contactInfoList" style="margin-top:20px;">
                    <h5 style="text-transform:uppercase; color:var(--text-muted); font-size:11px; margin-bottom:10px;">Kontaktperson</h5>
                    <div style="margin-bottom:10px;">
                        <div style="font-weight:600;">${customer.contact || '-'}</div>
                        <div class="muted small">${customer.role || 'Ingen roll angiven'}</div>
                    </div>
                    <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-envelope muted"></i> 
                        <a href="mailto:${customer.email}" class="link small">${customer.email || '-'}</a>
                    </div>
                    <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-phone muted"></i> 
                        <a href="tel:${customer.phone}" class="link small">${customer.phone || '-'}</a>
                    </div>
                    
                    <h5 style="text-transform:uppercase; color:var(--text-muted); font-size:11px; margin:20px 0 10px;">Företagsinfo</h5>
                    <div class="infoRow small"><span class="muted">Org.nr:</span> <span>${customer.org || '-'}</span></div>
                    <div class="infoRow small"><span class="muted">Webb:</span> <a href="${customer.web}" target="_blank">${customer.web || '-'}</a></div>
                    
                    <h5 style="text-transform:uppercase; color:var(--text-muted); font-size:11px; margin:20px 0 10px;">Adress</h5>
                     <div class="small muted">
                        ${street ? street + '<br>' : ''}
                        ${customer.address?.zip || ''} ${city}<br>
                        ${customer.address?.country || ''}
                     </div>
                </div>
            </div>
            
            <!-- MAIN CONTENT -->
            <div class="customerMain" style="padding:20px; display:flex; flex-direction:column;">
                <div class="crmNav" style="margin-bottom:20px; flex-shrink:0;">
                    <button class="crmNavBtn active">Översikt</button>
                    <button class="crmNavBtn">Aktivitetslogg</button>
                    <button class="crmNavBtn">Anteckningar</button>
                    <button class="crmNavBtn">Affärer</button>
                    <button class="crmNavBtn">Ärenden</button>
                </div>
                
                <div style="flex:1; overflow-y:auto;">
                    <!-- NOTES SECTION -->
                    ${customer.notes ? `
                    <div class="panel" style="background:#fff9c4; color:#5f5a36; border:1px solid #eab308; margin-bottom:20px;">
                        <div style="font-weight:bold; font-size:12px; margin-bottom:5px;"><i class="fa-solid fa-note-sticky"></i> Anteckning</div>
                        ${customer.notes}
                    </div>` : ''}

                    <!-- TIMELINE -->
                    <h4 style="margin-bottom:15px;">Tidslinje</h4>
                    <div class="activityTimeline">
                        <div class="activityItem meeting">
                            <div class="activityMeta">Idag • System</div>
                            <div>Kundprofil öppnad av dig.</div>
                        </div>
                        ${customer.aiConfig ? `
                        <div class="activityItem call">
                            <div class="activityMeta">Nyss • AI System</div>
                            <div><b>AI-agent driftsatt</b><br>
                             Konfigurerad med modell ${customer.aiConfig.model} (${customer.aiConfig.lang || 'sv'}).<br>
                             Webbplatsanalys slutförd.
                            </div>
                        </div>` : ''}
                         <div class="activityItem email">
                            <div class="activityMeta">${new Date(customer.created).toLocaleDateString()} • System</div>
                            <div>Kund registrerad i systemet.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

  // Update Header 
  const title = document.getElementById('crmModalCustomerName');
  if (title) title.textContent = customer.name;

  // Update Action Buttons?
  // Could add Edit button action here
}

window.setModalTab = setModalTab;
window.saveNewCustomerExpanded = saveNewCustomerExpanded;




/* =====================
   CRM 4.0 LOGIC (ENTERPRISE DEPTH)
===================== */

const crmActivities = JSON.parse(localStorage.getItem('crmActivities') || '[]');

// --- DEAL LOGIC ---

// Override openDealModal to support Advanced options
function openDealModal() {
  const modal = document.getElementById('crmAddDealModal');
  if (!modal) return;

  // Clear form
  if (document.getElementById('dealName')) document.getElementById('dealName').value = '';
  if (document.getElementById('dealValue')) document.getElementById('dealValue').value = '';
  if (document.getElementById('dealCompanyInput')) document.getElementById('dealCompanyInput').value = '';

  // Populate DataList for Companies
  const dl = document.getElementById('dealCompanyList');
  if (dl && crmState.customers.length > 0) {
    dl.innerHTML = crmState.customers.map(c => `<option value="${c.name}">`).join('');
  }

  modal.style.display = 'flex';
}

function filterCompanyList(input) {
  // Client side filter handled by browser datalist natively
}

function saveNewDealAdvanced() {
  const name = document.getElementById('dealName')?.value;
  const company = document.getElementById('dealCompanyInput')?.value; // Using input not select
  const value = document.getElementById('dealValue')?.value;
  const stage = document.getElementById('dealStage')?.value;
  const prob = document.getElementById('dealProb')?.value;
  const closeDate = document.getElementById('dealCloseDate')?.value;
  const type = document.getElementById('dealType')?.value;
  const owner = document.getElementById('dealOwner')?.value;
  const desc = document.getElementById('dealDesc')?.value;
  const nextStep = document.getElementById('dealNextStep')?.value;

  if (!name || !company) {
    if (typeof toast === 'function') toast('Fel', 'Fyll i namn och företag', 'error');
    else alert("Fyll i namn och företag");
    return;
  }

  // Find linked customer ID if possible
  const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
  const linkedCustomer = customers.find(c => c.name === company);
  const customerId = linkedCustomer ? linkedCustomer.id : null;

  const deal = {
    id: 'd' + Date.now(),
    name,
    company,
    customerId,
    value: parseInt(value) || 0,
    stage,
    probability: parseInt(prob),
    closeDate,
    type,
    owner,
    description: desc,
    nextStep,
    created: new Date().toISOString()
  };

  crmState.deals.push(deal);
  localStorage.setItem('crmDeals', JSON.stringify(crmState.deals));

  closeCrmModal('crmAddDealModal');

  // Log creation activity automatically
  logActivity({
    type: 'system',
    subject: 'Affär skapad',
    description: `Affär "${name}" värd ${value} kr skapad i fas ${stage}.`,
    targetId: customerId || deal.id, // Log on customer if found, else deal
    date: new Date().toISOString(),
    status: 'done'
  });

  // Update UI
  renderPipeline();
  if (typeof toast === 'function') toast('Sparat', 'Affär skapad', 'success');
}

// --- ACTIVITY LOGIC ---

function openActivityModal(targetId) { // Customer ID or Deal ID
  const modal = document.getElementById('crmLogActivityModal');
  if (!modal) return;

  document.getElementById('actTargetId').value = targetId || '';
  modal.style.display = 'flex';
  // Set default date to today
  document.getElementById('actDate').valueAsDate = new Date();
}

function setActivityType(type, btn) {
  document.getElementById('actType').value = type;
  document.querySelectorAll('.activityTypeBtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function saveActivity() {
  const type = document.getElementById('actType').value;
  const subject = document.getElementById('actSubject').value;
  const desc = document.getElementById('actDesc').value;
  const date = document.getElementById('actDate').value;
  const status = document.getElementById('actStatus').value;
  const targetId = document.getElementById('actTargetId').value;

  if (!subject) { alert("Ange ämne"); return; }

  const activity = {
    id: 'act' + Date.now(),
    type,
    subject,
    description: desc,
    date,
    status,
    targetId, // Link to customer
    created: new Date().toISOString()
  };

  crmActivities.push(activity);
  localStorage.setItem('crmActivities', JSON.stringify(crmActivities));

  closeCrmModal('crmLogActivityModal');

  // If we are viewing a customer, refresh the timeline
  if (targetId) {
    // Refresh modal content if open
    const currentModal = document.getElementById('crmCustomerModal');
    if (currentModal && currentModal.style.display !== 'none') {
      const customer = crmState.customers.find(c => c.id === targetId);
      if (customer) renderCustomerModalContent(customer, currentModal);
    }
  }

  if (typeof toast === 'function') toast('Loggad', 'Aktivitet sparad', 'success');
}

function logActivity(act) {
  crmActivities.push({ ...act, id: 'act' + Date.now() });
  localStorage.setItem('crmActivities', JSON.stringify(crmActivities));
}

// Override renderCustomerModalContent again to include Activity Listing and Log Button
function renderCustomerModalContent(customer, modal) {
  const body = document.getElementById('crmModalBody');
  const initials = customer.name.substring(0, 2).toUpperCase();

  // Get Activities for this customer
  const activities = crmActivities.filter(a => a.targetId === customer.id).sort((a, b) => new Date(b.created) - new Date(a.created));

  // Safety
  const city = customer.address?.city || 'Ingen ort';

  body.innerHTML = `
        <div class="customerProfileLayout">
            <!-- SIDEBAR SAME AS BEFORE -->
            <div class="customerSidebar" style="border-right:1px solid var(--border); overflow-y:auto; max-height:100%;">
                 <div class="topInfo" style="text-align:center; margin-bottom:20px;">
                    <div class="avatar-large" style="width:80px; height:80px; margin:0 auto 10px; background:#e0e7ff; color:var(--primary); font-size:32px; display:flex; align-items:center; justify-content:center; border-radius:50%;">${initials}</div>
                    <h2 style="font-size:20px; margin:0;">${customer.name}</h2>
                    <p class="muted">${customer.industry || 'Okänd bransch'} • ${city}</p>
                    
                     <div class="row center gap" style="margin-top:15px;">
                        <button class="btn primary small" onclick="openActivityModal('${customer.id}')"><i class="fa-solid fa-plus"></i> Aktivitet</button>
                        <button class="btn ghost small"><i class="fa-solid fa-pen"></i></button>
                    </div>

                    <div class="pill ${customer.aiConfig ? 'ok' : (customer.status === 'prospect' ? 'warn' : 'info')}" style="margin-top:15px;">
                        ${customer.status === 'prospect' ? 'Prospekt' : (customer.status === 'churn' ? 'Avslutad' : 'Aktiv Kund')}
                    </div>
                </div>
                 
                 ${customer.aiConfig ? `
                <div class="aiInsightBox">
                    <div style="font-size:12px; text-transform:uppercase; color:var(--primary); font-weight:bold; margin-bottom:5px; display:flex; justify-content:space-between;">
                        <span>AI Status</span> <span style="font-size:16px;">🟢</span>
                    </div>
                    <div class="aiScore">ONLINE</div>
                    <div style="font-size:11px; margin-top:5px; color:var(--text-muted);">
                        <b>Modell:</b> ${customer.aiConfig.model}<br>
                        <b>API Key:</b> ${customer.aiConfig.apiKey.substring(0, 8)}...
                    </div>
                </div>` : ''}
                 
                 <div class="contactInfoList" style="margin-top:20px;">
                     <div style="margin-bottom:10px;">
                        <div style="font-weight:600;">${customer.contact || '-'}</div>
                        <div class="muted small">${customer.role || 'Ingen roll angiven'}</div>
                    </div>
                    <div style="margin-bottom:10px;">
                         <a href="mailto:${customer.email}" class="link small">${customer.email || '-'}</a>
                    </div>
                 </div>
            </div>
            
            <!-- MAIN CONTENT -->
            <div class="customerMain" style="padding:20px; display:flex; flex-direction:column;">
                 <div class="crmNav" style="margin-bottom:20px; flex-shrink:0;">
                    <button class="crmNavBtn active">Översikt</button>
                    <button class="crmNavBtn">Anteckningar</button>
                    <button class="crmNavBtn">Affärer</button>
                    <button class="crmNavBtn">Ärenden</button>
                </div>
                
                <div style="flex:1; overflow-y:auto;">
                    <h4 style="margin-bottom:15px;">Aktivitetslogg</h4>
                    <div class="activityTimeline">
                        <!-- Render Activities from State -->
                        ${activities.map(a => `
                        <div class="activityItem ${a.type === 'task' ? 'email' : a.type}"> <!-- Fallback style -->
                            <div class="activityMeta">${new Date(a.date || a.created).toLocaleDateString()} • ${translateType(a.type)}</div>
                            <div><b>${a.subject}</b><br>${a.description || ''}</div>
                        </div>`).join('')}
                        
                         <!-- Default logs -->
                        <div class="activityItem meeting">
                            <div class="activityMeta">Idag • System</div>
                            <div>Kundprofil öppnad.</div>
                        </div>
                         ${customer.aiConfig ? `
                        <div class="activityItem call">
                            <div class="activityMeta">Nyss • AI System</div>
                            <div><b>AI-agent driftsatt</b></div>
                        </div>` : ''}
                         <div class="activityItem email">
                            <div class="activityMeta">${new Date(customer.created).toLocaleDateString()} • System</div>
                            <div>Kund registrerad.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

  // Update Header 
  const title = document.getElementById('crmModalCustomerName');
  if (title) title.textContent = customer.name;
}

function translateType(t) {
  if (t === 'call') return 'Samtal';
  if (t === 'meeting') return 'Möte';
  if (t === 'email') return 'E-post';
  if (t === 'task') return 'Uppgift';
  if (t === 'system') return 'System';
  return t;
}

// Expose
window.saveNewDealAdvanced = saveNewDealAdvanced;
window.openActivityModal = openActivityModal;
window.setActivityType = setActivityType;
window.saveActivity = saveActivity;
window.filterCompanyList = filterCompanyList;






/* HOTFIX */
window.openAddCustomerModal = function () { console.log('OPENING CUSTOMER MODAL'); const modal = document.getElementById('crmAddCustomerModal'); if (modal) { modal.style.display = 'flex'; if (window.setModalTab && modal.querySelector('#modalTabBasic')) { const btn = modal.querySelector('.tabBtn'); if (btn) window.setModalTab('modalTabBasic', btn); } } else { alert('Kunde inte ppna formulr (ID saknas)'); } };
document.getElementById('addCustomerBtn').onclick = window.openAddCustomerModal;






/* =====================
   HOTFIX: SAFE RENDER (Crash Prevention)
===================== */
window.renderCustomerModalContent = function (customer, modal) {
  const body = document.getElementById('crmModalBody');
  if (!body || !customer) return;

  // Safety checks
  const name = customer.name || 'Okänd Kund';
  const initials = name.substring(0, 2).toUpperCase();
  const city = (customer.address && customer.address.city) ? customer.address.city : 'Ingen ort';

  // AI Config Safety
  let aiSection = '';
  if (customer.aiConfig) {
    const model = customer.aiConfig.model || 'Standard';
    let apiKeyDisplay = 'Genereras...';
    if (customer.aiConfig.apiKey && typeof customer.aiConfig.apiKey === 'string') {
      apiKeyDisplay = customer.aiConfig.apiKey.substring(0, 8) + '...';
    }

    aiSection = `
        <div class="aiInsightBox">
            <div style="font-size:12px; text-transform:uppercase; color:var(--primary); font-weight:bold; margin-bottom:5px; display:flex; justify-content:space-between;">
                <span>AI Status</span> <span style="font-size:16px;">🟢</span>
            </div>
            <div class="aiScore">ONLINE</div>
            <div style="font-size:11px; margin-top:5px; color:var(--text-muted);">
                <b>Modell:</b> ${model}<br>
                <b>API Key:</b> ${apiKeyDisplay}
            </div>
        </div>`;
  }

  // Activities Safety (assuming crmActivities exists globally)
  const activities = (window.crmActivities || [])
    .filter(a => a.targetId === customer.id)
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  body.innerHTML = `
        <div class="customerProfileLayout">
            <!-- SIDEBAR -->
            <div class="customerSidebar" style="border-right:1px solid var(--border); overflow-y:auto; max-height:100%;">
                 <div class="topInfo" style="text-align:center; margin-bottom:20px;">
                    <div class="avatar-large" style="width:80px; height:80px; margin:0 auto 10px; background:#e0e7ff; color:var(--primary); font-size:32px; display:flex; align-items:center; justify-content:center; border-radius:50%;">${initials}</div>
                    <h2 style="font-size:20px; margin:0;">${name}</h2>
                    <p class="muted">${customer.industry || 'Okänd bransch'} • ${city}</p>
                    
                     <div class="row center gap" style="margin-top:15px;">
                        <button class="btn primary small" onclick="openActivityModal('${customer.id}')"><i class="fa-solid fa-plus"></i> Aktivitet</button>
                    </div>

                    <div class="pill ${customer.aiConfig ? 'ok' : (customer.status === 'prospect' ? 'warn' : 'info')}" style="margin-top:15px;">
                        ${customer.status === 'prospect' ? 'Prospekt' : (customer.status === 'churn' ? 'Avslutad' : 'Aktiv Kund')}
                    </div>
                </div>
                 
                 ${aiSection}
                 
                 <div class="contactInfoList" style="margin-top:20px;">
                     <div style="margin-bottom:10px;">
                        <div style="font-weight:600;">${customer.contact || '-'}</div>
                        <div class="muted small">${customer.role || 'Ingen roll angiven'}</div>
                    </div>
                    <div style="margin-bottom:10px;">
                         <a href="mailto:${customer.email}" class="link small">${customer.email || '-'}</a>
                    </div>
                 </div>
            </div>
            
            <!-- MAIN CONTENT -->
            <div class="customerMain" style="padding:20px; display:flex; flex-direction:column;">
                 <div class="crmNav" style="margin-bottom:20px; flex-shrink:0;">
                    <button class="crmNavBtn active">Översikt</button>
                    <button class="crmNavBtn">Affärer</button>
                </div>
                
                <div style="flex:1; overflow-y:auto;">
                    <h4 style="margin-bottom:15px;">Aktivitetslogg</h4>
                    <div class="activityTimeline">
                        ${activities.map(a => `
                        <div class="activityItem ${a.type}">
                            <div class="activityMeta">${new Date(a.date || a.created).toLocaleDateString()} • ${a.type}</div>
                            <div><b>${a.subject}</b><br>${a.description || ''}</div>
                        </div>`).join('')}
                         <div class="activityItem meeting">
                            <div class="activityMeta">Idag • System</div>
                            <div>Kundprofil öppnad.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

  const title = document.getElementById('crmModalCustomerName');
  if (title) title.textContent = name;
}

