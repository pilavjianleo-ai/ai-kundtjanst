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
  const el = $("chatTitle");
  if (el) el.textContent = c ? `AI Kundtjänst – ${c.displayName}` : "AI Kundtjänst";
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

  state.currentCompany =
    state.companies.find((c) => c.companyId === state.companyId) || state.companies[0] || null;

  renderChatHeader();
}

async function bootstrapAfterLogin() {
  showView("chatView", "openChatView");
  resetConversation();
  renderSuggestions(["Hur fungerar det?", "Vilka priser har ni?", "Skapa konto"]);
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

  // Show notes if any
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

    // Update History Table
    const list = $("billingHistoryList");
    if (list) {
      list.innerHTML = history.invoices.length ? history.invoices.map(inv => `
            <tr>
                <td>${inv.date}</td>
                <td><b>${inv.amount}</b></td>
                <td><span class="pill ok">${inv.status}</span></td>
                <td style="text-align:right">
                    <a href="${inv.url}" class="btn ghost small"><i class="fa-solid fa-download"></i></a>
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
  } catch (e) {
    toast("Fel", e.message, "error");
  }
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
    // Special params for FormData
    const res = await fetch(state.apiBase + "/admin/kb/pdf", {
      method: "POST",
      headers: { "Authorization": "Bearer " + state.token }, // No Content-Type, browser sets boundary
      body: formData
    });

    if (!res.ok) throw new Error("Upload failed");

    toast("Klar", "PDF sparad", "info");
    fileInput.value = "";
    await loadKb();
  } catch (e) {
    toast("Fel", e.message, "error");
  }
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
    if (state.currentView === "inboxView") {
      loadInboxTickets();
    }
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
