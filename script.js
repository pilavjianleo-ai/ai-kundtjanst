/* =========================
   AI Kundtjänst – script.js
   - Works with updated server.js endpoints
========================= */

const $ = (id) => document.getElementById(id);

const state = {
  apiBase: "", // same origin
  token: localStorage.getItem("token") || "",
  me: null,
  companyId: "demo",

  conversation: [],
  activeTicketId: null,
  activeTicketPublicId: null,

  categories: [],
  debug: false,

  myTickets: [],
  inboxTickets: [],
  inboxSelectedTicket: null,
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

/* =========================
   Toast
========================= */
function toast(title, text = "", type = "info") {
  const wrap = $("toastWrap");
  if (!wrap) return;

  const div = document.createElement("div");
  div.className = "toast";
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
  } catch {
    data = null;
  }

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
  const views = ["authView", "chatView", "myTicketsView", "inboxView", "adminView", "settingsView", "slaView"];
  for (const v of views) {
    const el = $(v);
    if (el) el.style.display = "none";
  }
}

function setActiveMenu(btnId) {
  const ids = ["openChatView", "openMyTicketsView", "openInboxView", "openAdminView", "openSettingsView", "openSlaView"];
  ids.forEach((id) => $(id)?.classList.remove("active"));
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
    $("slaClearAllStatsBtn").style.display = "";
  }
}

/* =========================
   Theme
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

/* =========================
   Debug panel
========================= */
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
  addMsg("assistant", "Hej! 👋 Vad kan jag hjälpa dig med?");
  renderDebug();
}

/* =========================
   Auth
========================= */
function showAuthError(msg) {
  const box = $("authMessage");
  box.style.display = "";
  box.textContent = msg;
}

function hideAuthError() {
  const box = $("authMessage");
  box.style.display = "none";
  box.textContent = "";
}

async function doLogin() {
  hideAuthError();

  const username = $("username").value.trim();
  const password = $("password").value.trim();

  if (!username || !password) return showAuthError("Fyll i användarnamn + lösenord.");

  try {
    const data = await api("/login", { method: "POST", auth: false, body: { username, password } });
    state.token = data.token;
    localStorage.setItem("token", state.token);
    toast("Inloggad", "Välkommen tillbaka ✅");

    await bootstrapAfterLogin();
  } catch (e) {
    showAuthError(e.message);
  }
}

async function doRegister() {
  hideAuthError();

  const username = $("username").value.trim();
  const password = $("password").value.trim();
  const email = $("email").value.trim();

  if (!username || !password) return showAuthError("Fyll i användarnamn + lösenord.");

  try {
    await api("/register", { method: "POST", auth: false, body: { username, password, email } });
    toast("Skapat konto", "Registrering lyckades ✅");
    await doLogin();
  } catch (e) {
    showAuthError(e.message);
  }
}

function doLogout() {
  state.token = "";
  state.me = null;
  localStorage.removeItem("token");
  updateRoleUI();
  resetConversation();
  showView("authView", "openChatView");
  toast("Utloggad", "Du är nu utloggad.");
}

/* Forgot / Reset password */
function openForgot() {
  $("forgotCard").style.display = "";
  $("resetCard").style.display = "none";
  $("forgotMsg").style.display = "none";
}
function closeForgot() {
  $("forgotCard").style.display = "none";
  $("forgotMsg").style.display = "none";
}
async function sendForgot() {
  const email = $("forgotEmail").value.trim();
  const msg = $("forgotMsg");
  msg.style.display = "";
  msg.textContent = "Skickar...";

  try {
    const data = await api("/auth/forgot-password", { method: "POST", auth: false, body: { email } });
    msg.classList.remove("error");
    msg.textContent = data.message || "Skickat ✅";
  } catch (e) {
    msg.classList.add("error");
    msg.textContent = e.message;
  }
}

async function resetPasswordFromToken(token) {
  $("resetCard").style.display = "";
  $("forgotCard").style.display = "none";
  $("authMessage").style.display = "none";

  $("resetSaveBtn").onclick = async () => {
    const newPassword = $("resetNewPass").value.trim();
    const msg = $("resetMsg");
    msg.style.display = "";
    msg.textContent = "Sparar...";

    try {
      const data = await api("/auth/reset-password", { method: "POST", auth: false, body: { resetToken: token, newPassword } });
      msg.classList.remove("error");
      msg.textContent = data.message || "Klart ✅";
      toast("Lösenord ändrat", "Logga in med ditt nya lösenord.");
    } catch (e) {
      msg.classList.add("error");
      msg.textContent = e.message;
    }
  };
}

/* =========================
   Bootstrap
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

async function loadCategories() {
  const cats = await api("/categories", { auth: false });
  state.categories = cats || [];

  const sel = $("categorySelect");
  const sel2 = $("kbCategorySelect");
  const sel3 = $("inboxCategoryFilter");

  function fill(selectEl, includeAny = false) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    if (includeAny) {
      const optAny = document.createElement("option");
      optAny.value = "";
      optAny.textContent = "Alla kategorier";
      selectEl.appendChild(optAny);
    }
    for (const c of state.categories) {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.key} (${c.name})`;
      selectEl.appendChild(opt);
    }
  }

  fill(sel, false);
  fill(sel2, false);
  fill(sel3, true);

  // keep current
  if (sel) sel.value = state.companyId;
  if (sel2) sel2.value = state.companyId;

  renderChatHeader();
  renderWidgetCode();
}

function renderChatHeader() {
  const c = state.categories.find((x) => x.key === state.companyId);
  $("chatTitle").textContent = c ? `AI Kundtjänst – ${c.name}` : "AI Kundtjänst";
}

/* =========================
   Widget embed generator
========================= */
function renderWidgetCode() {
  const ta = $("widgetCode");
  if (!ta) return;

  const base = location.origin;
  const code = `
<!-- AI Kundtjänst Widget -->
<div id="ai-kundtjanst-widget"></div>
<script>
  (function(){
    var el = document.getElementById("ai-kundtjanst-widget");
    el.innerHTML = '<iframe src="${base}" style="width:420px;height:640px;border:0;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,0.35)"></iframe>';
  })();
</script>
<!-- /AI Kundtjänst Widget -->
`.trim();

  ta.value = code;
}

function copyWidget() {
  const ta = $("widgetCode");
  if (!ta) return;
  ta.select();
  document.execCommand("copy");
  toast("Kopierat", "Widget-koden är kopierad ✅");
}

/* =========================
   After login
========================= */
async function bootstrapAfterLogin() {
  await loadMe();
  updateRoleUI();
  renderDebug();

  showView("chatView", "openChatView");
  resetConversation();

  await refreshMyTickets();

  if (state.me?.role === "admin" || state.me?.role === "agent") {
    await refreshInbox();
  }
}

/* =========================
   Chat logic
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
    state.activeTicketPublicId = data.ticketPublicId || null;

    renderDebug();
    setDebugLine("dbgRag", data.ragUsed ? "JA" : "NEJ");

    const reply = data.reply || "Inget svar.";
    addMsg("assistant", reply, data.ragUsed ? "Svar baserat på kunskapsdatabas ✅" : "");
    state.conversation.push({ role: "assistant", content: reply });

    await refreshMyTickets();
  } catch (e) {
    addMsg("assistant", "❌ Fel: " + e.message);
  }
}

function exportChat() {
  const data = {
    companyId: state.companyId,
    ticketId: state.activeTicketPublicId || state.activeTicketId,
    conversation: state.conversation,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat_export_${Date.now()}.json`;
  a.click();
}

function clearChat() {
  resetConversation();
  toast("Rensat", "Chatten är rensad.");
}

function newTicket() {
  resetConversation();
  toast("Nytt ärende", "Skapat ny konversation ✅");
}

/* =========================
   Feedback
========================= */
async function sendFeedback(type) {
  if (!state.me) return toast("Inte inloggad", "Logga in först.");
  try {
    await api("/feedback", { method: "POST", body: { type, companyId: state.companyId } });
    $("fbMsg").textContent = "Tack för feedback ✅";
    setTimeout(() => ($("fbMsg").textContent = ""), 2200);
  } catch {
    $("fbMsg").textContent = "Kunde inte spara feedback";
  }
}

/* =========================
   My Tickets
========================= */
function pill(status) {
  if (status === "solved") return `<span class="pill ok"><i class="fa-solid fa-check"></i> solved</span>`;
  if (status === "pending") return `<span class="pill warn"><i class="fa-solid fa-clock"></i> pending</span>`;
  return `<span class="pill"><i class="fa-solid fa-circle"></i> open</span>`;
}

function prettyDate(d) {
  try {
    const dt = new Date(d);
    return dt.toLocaleString();
  } catch {
    return "";
  }
}

async function refreshMyTickets() {
  if (!state.me) return;
  try {
    const tickets = await api("/my/tickets");
    state.myTickets = tickets || [];
    renderMyTicketsList();
  } catch {
    // ignore
  }
}

function renderMyTicketsList() {
  const list = $("myTicketsList");
  const hint = $("myTicketsHint");
  if (!list) return;

  list.innerHTML = "";
  hint.textContent = state.myTickets.length ? `${state.myTickets.length} st` : "Inga ärenden ännu.";

  for (const t of state.myTickets) {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTitle">
        ${escapeHtml(t.title || "(utan titel)")}
        <span style="margin-left:auto">${pill(t.status)}</span>
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${escapeHtml(t.ticketPublicId || t.publicTicketId || "")} • ${escapeHtml(t.companyId)} • ${prettyDate(
      t.lastActivityAt
    )}
      </div>
    `;
    div.onclick = () => openMyTicket(t._id);
    list.appendChild(div);
  }
}

async function openMyTicket(ticketId) {
  try {
    const t = await api(`/my/tickets/${ticketId}`);
    state.activeTicketId = t._id;
    state.activeTicketPublicId = t.ticketPublicId || t.publicTicketId || null;
    renderDebug();

    const box = $("myTicketDetails");
    box.innerHTML = `
      <div><b>${escapeHtml(t.title || "(utan titel)")}</b></div>
      <div class="muted small" style="margin-top:4px;">
        ${escapeHtml(t.ticketPublicId || t.publicTicketId || "")} • ${escapeHtml(t.companyId)} • status: ${escapeHtml(
      t.status
    )}
      </div>
      <div class="divider"></div>
      ${renderTicketMessages(t.messages || [])}
    `;

    toast("Ticket öppnad", t.ticketPublicId || ticketId);
  } catch (e) {
    toast("Fel", e.message);
  }
}

function renderTicketMessages(msgs) {
  if (!msgs.length) return `<div class="muted small">Inga meddelanden.</div>`;
  return msgs
    .map((m) => {
      const role = m.role || "user";
      const cls = role === "agent" ? "agent" : role === "assistant" ? "ai" : "user";
      const who = role === "agent" ? "Agent" : role === "assistant" ? "AI" : "Du";
      return `
        <div class="ticketMsg ${cls}">
          <div class="ticketMsgHead">
            <span>${who}</span>
            <span>${escapeHtml(prettyDate(m.timestamp))}</span>
          </div>
          <div class="ticketMsgBody">${escapeHtml(m.content || "")}</div>
        </div>
      `;
    })
    .join("");
}

async function replyMyTicket() {
  const ticketId = state.activeTicketId;
  if (!ticketId) return toast("Välj ticket", "Öppna ett ärende först.");

  const text = $("myTicketReplyText").value.trim();
  if (!text) return;

  $("myTicketReplyText").value = "";

  try {
    await api(`/my/tickets/${ticketId}/reply`, { method: "POST", body: { content: text } });
    toast("Skickat", "Meddelande skickat ✅");
    await openMyTicket(ticketId);
    await refreshMyTickets();
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* =========================
   Inbox (Agent/Admin)
========================= */
async function refreshInbox() {
  if (!state.me) return;
  if (!(state.me.role === "admin" || state.me.role === "agent")) return;

  try {
    const status = $("inboxStatusFilter")?.value || "";
    const companyId = $("inboxCategoryFilter")?.value || "";

    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (companyId) query.set("companyId", companyId);

    const tickets = await api(`/admin/tickets?${query.toString()}`);
    state.inboxTickets = tickets || [];
    renderInboxList();
    updateInboxNotif();
  } catch (e) {
    const box = $("inboxMsg");
    box.style.display = "";
    box.textContent = e.message;
  }
}

function updateInboxNotif() {
  const dot = $("inboxNotifDot");
  const btn = $("openInboxView");
  if (!dot || !btn) return;

  const hasOpen = state.inboxTickets.some((t) => t.status === "open");
  dot.style.display = hasOpen ? "" : "none";
  btn.classList.toggle("hasNotif", hasOpen);
}

function renderInboxList() {
  const list = $("inboxTicketsList");
  if (!list) return;

  const q = ($("inboxSearchInput")?.value || "").trim().toLowerCase();
  list.innerHTML = "";

  const filtered = state.inboxTickets.filter((t) => {
    if (!q) return true;
    const s = `${t.title || ""} ${t.ticketPublicId || t.publicTicketId || ""} ${t.companyId || ""}`.toLowerCase();
    return s.includes(q);
  });

  for (const t of filtered) {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div class="listItemTitle">
        ${escapeHtml(t.title || "(utan titel)")}
        <span style="margin-left:auto">${pill(t.status)}</span>
      </div>
      <div class="muted small" style="margin-top:6px;">
        ${escapeHtml(t.ticketPublicId || t.publicTicketId || "")} • ${escapeHtml(t.companyId)} • prio: ${escapeHtml(
      t.priority || "normal"
    )}
      </div>
    `;
    div.onclick = () => openInboxTicket(t._id);
    list.appendChild(div);
  }
}

async function openInboxTicket(ticketId) {
  try {
    const t = await api(`/admin/tickets/${ticketId}`);
    state.inboxSelectedTicket = t;

    $("ticketPrioritySelect").value = t.priority || "normal";

    $("ticketDetails").innerHTML = `
      <div><b>${escapeHtml(t.title || "(utan titel)")}</b></div>
      <div class="muted small" style="margin-top:4px;">
        ${escapeHtml(t.ticketPublicId || t.publicTicketId || "")} • ${escapeHtml(t.companyId)} • status: ${escapeHtml(
      t.status
    )}
      </div>

      <div class="divider"></div>
      ${renderTicketMessages(t.messages || [])}
    `;

    await loadAgentsForAssign();
  } catch (e) {
    $("inboxTicketMsg").style.display = "";
    $("inboxTicketMsg").textContent = e.message;
  }
}

async function setTicketStatus(status) {
  const t = state.inboxSelectedTicket;
  if (!t) return toast("Välj ticket", "Öppna en ticket i inboxen först.");

  try {
    await api(`/admin/tickets/${t._id}/status`, { method: "POST", body: { status } });
    toast("Uppdaterat", "Status ändrad ✅");
    await refreshInbox();
    await openInboxTicket(t._id);
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function setTicketPriority() {
  const t = state.inboxSelectedTicket;
  if (!t) return toast("Välj ticket", "Öppna en ticket i inboxen först.");

  const priority = $("ticketPrioritySelect").value;

  try {
    await api(`/admin/tickets/${t._id}/priority`, { method: "POST", body: { priority } });
    toast("Uppdaterat", "Prioritet sparad ✅");
    await refreshInbox();
    await openInboxTicket(t._id);
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function sendAgentReplyInbox() {
  const t = state.inboxSelectedTicket;
  if (!t) return toast("Välj ticket", "Öppna en ticket först.");

  const content = $("agentReplyTextInbox").value.trim();
  if (!content) return;

  $("agentReplyTextInbox").value = "";

  try {
    await api(`/admin/tickets/${t._id}/agent-reply`, { method: "POST", body: { content } });
    toast("Skickat", "Agent-svar skickat ✅");
    await refreshInbox();
    await openInboxTicket(t._id);
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* Notes */
async function saveInternalNote() {
  const t = state.inboxSelectedTicket;
  if (!t) return toast("Välj ticket", "Öppna en ticket först.");

  const content = $("internalNoteText").value.trim();
  if (!content) return;

  $("internalNoteText").value = "";

  try {
    await api(`/admin/tickets/${t._id}/internal-note`, { method: "POST", body: { content } });
    toast("Sparat", "Intern notering sparad ✅");
    await openInboxTicket(t._id);
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function clearInternalNotes() {
  const t = state.inboxSelectedTicket;
  if (!t) return toast("Välj ticket", "Öppna en ticket först.");

  try {
    await api(`/admin/tickets/${t._id}/internal-notes`, { method: "DELETE" });
    toast("Rensat", "Noteringar borttagna ✅");
    await openInboxTicket(t._id);
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function deleteTicket() {
  const t = state.inboxSelectedTicket;
  if (!t) return;

  try {
    await api(`/admin/tickets/${t._id}`, { method: "DELETE" });
    toast("Borttagen", "Ticket borttagen ✅");
    state.inboxSelectedTicket = null;
    $("ticketDetails").textContent = "Välj en ticket.";
    await refreshInbox();
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* Assign */
async function loadAgentsForAssign() {
  if (!(state.me?.role === "admin" || state.me?.role === "agent")) return;
  const sel = $("assignUserSelect");
  if (!sel) return;

  try {
    const agents = await api("/admin/agents");
    sel.innerHTML = `<option value="">Välj agent...</option>`;
    for (const u of agents) {
      const opt = document.createElement("option");
      opt.value = u._id;
      opt.textContent = `${u.username} (${u.role})`;
      sel.appendChild(opt);
    }
  } catch {
    // ignore
  }
}

async function assignTicket() {
  const t = state.inboxSelectedTicket;
  if (!t) return toast("Välj ticket", "Öppna en ticket först.");
  const userId = $("assignUserSelect").value;
  if (!userId) return toast("Välj agent", "Du måste välja en agent.");

  try {
    await api(`/admin/tickets/${t._id}/assign`, { method: "POST", body: { userId } });
    toast("Assignad", "Ticket tilldelad ✅");
    await refreshInbox();
    await openInboxTicket(t._id);
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* Solve all / remove solved */
async function solveAll() {
  try {
    await api("/admin/tickets/solve-all", { method: "POST" });
    toast("Klart", "Solve ALL ✅");
    await refreshInbox();
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function removeSolved() {
  try {
    await api("/admin/tickets/remove-solved", { method: "POST" });
    toast("Klart", "Solved tickets borttagna ✅");
    await refreshInbox();
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* =========================
   Admin: Users / Export / KB / Cats / AI Settings
========================= */
async function refreshUsers() {
  const msg = $("adminUsersMsg");
  const list = $("adminUsersList");
  if (!msg || !list) return;

  msg.style.display = "none";
  list.innerHTML = "";

  try {
    const users = await api("/admin/users");
    for (const u of users) {
      const div = document.createElement("div");
      div.className = "listItem";
      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(u.username)}
          <span style="margin-left:auto" class="pill admin">${escapeHtml(u.role)}</span>
        </div>
        <div class="muted small" style="margin-top:6px;">${escapeHtml(u.email || "")}</div>
        <div class="row gap" style="margin-top:10px; flex-wrap:wrap;">
          <select class="input smallInput" data-role="${u._id}">
            <option value="user" ${u.role === "user" ? "selected" : ""}>user</option>
            <option value="agent" ${u.role === "agent" ? "selected" : ""}>agent</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>admin</option>
          </select>
          <button class="btn ghost small" data-save="${u._id}"><i class="fa-solid fa-floppy-disk"></i> Spara roll</button>
          <button class="btn danger small" data-del="${u._id}"><i class="fa-solid fa-trash"></i> Ta bort</button>
        </div>
      `;
      list.appendChild(div);
    }

    list.querySelectorAll("[data-save]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-save");
        const sel = list.querySelector(`[data-role="${id}"]`);
        const role = sel.value;
        try {
          await api(`/admin/users/${id}/role`, { method: "POST", body: { role } });
          toast("Sparat", "Roll uppdaterad ✅");
          await refreshUsers();
        } catch (e) {
          toast("Fel", e.message);
        }
      };
    });

    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-del");
        try {
          await api(`/admin/users/${id}`, { method: "DELETE" });
          toast("Borttagen", "Användare borttagen ✅");
          await refreshUsers();
        } catch (e) {
          toast("Fel", e.message);
        }
      };
    });
  } catch (e) {
    msg.style.display = "";
    msg.textContent = e.message;
  }
}

function openAdminTab(tabId) {
  document.querySelectorAll(".tabPanel").forEach((p) => (p.style.display = "none"));
  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
  $(tabId).style.display = "";
  document.querySelector(`.tabBtn[data-tab="${tabId}"]`)?.classList.add("active");
}

async function exportAll() {
  try {
    const res = await fetch("/admin/export/all", { headers: { Authorization: "Bearer " + state.token } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `export_all_${Date.now()}.json`;
    a.click();
  } catch {
    toast("Fel", "Kunde inte exportera.");
  }
}

async function exportTraining() {
  try {
    const url = `/admin/export/training?companyId=${encodeURIComponent(state.companyId)}`;
    const res = await fetch(url, { headers: { Authorization: "Bearer " + state.token } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `training_export_${state.companyId}_${Date.now()}.json`;
    a.click();
  } catch {
    toast("Fel", "Kunde inte exportera training.");
  }
}

/* KB */
async function kbRefresh() {
  const box = $("kbList");
  const msg = $("kbMsg");
  if (!box || !msg) return;

  msg.style.display = "none";
  box.innerHTML = "";

  try {
    const companyId = $("kbCategorySelect").value;
    const items = await api(`/kb/list/${companyId}`);

    for (const it of items) {
      const div = document.createElement("div");
      div.className = "listItem";

      div.innerHTML = `
        <div class="listItemTitle" style="gap:8px; align-items:center;">
          <span>${escapeHtml(it.title || it.sourceRef || "KB")}</span>
          <span class="muted small" style="margin-left:auto;">chunk ${it.chunkIndex}</span>
          <button class="btn danger small" data-kbdel="${it._id}" type="button" style="margin-left:8px;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
        <div class="muted small" style="margin-top:6px;">
          ${escapeHtml(it.sourceType)} • ${escapeHtml(it.sourceRef || "")}
        </div>
      `;
      box.appendChild(div);
    }

    box.querySelectorAll("[data-kbdel]").forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-kbdel");
        try {
          await api(`/kb/item/${id}`, { method: "DELETE" });
          toast("Borttagen", "KB item borttagen ✅");
          await kbRefresh();
        } catch (err) {
          toast("Fel", err.message);
        }
      };
    });
  } catch (e) {
    msg.style.display = "";
    msg.textContent = e.message;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const base64 = s.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function kbUploadText() {
  try {
    const companyId = $("kbCategorySelect").value;
    const title = $("kbTextTitle").value.trim();
    const content = $("kbTextContent").value.trim();

    if (!content) return toast("Saknas", "Klistra in text först.");

    const r = await api("/kb/upload-text", { method: "POST", body: { companyId, title, content } });
    toast("Uppladdat", r.message || "Text uppladdad ✅");
    $("kbTextContent").value = "";
    await kbRefresh();
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function kbUploadUrl() {
  try {
    const companyId = $("kbCategorySelect").value;
    const url = $("kbUrlInput").value.trim();
    if (!url) return toast("Saknas", "Skriv URL först.");

    const r = await api("/kb/upload-url", { method: "POST", body: { companyId, url } });
    toast("Uppladdat", r.message || "URL uppladdad ✅");
    $("kbUrlInput").value = "";
    await kbRefresh();
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function kbUploadPdf() {
  try {
    const companyId = $("kbCategorySelect").value;
    const input = $("kbPdfFile");
    const file = input.files?.[0];
    if (!file) return toast("Saknas", "Välj en PDF först.");

    const base64 = await fileToBase64(file);
    const r = await api("/kb/upload-pdf", { method: "POST", body: { companyId, filename: file.name, base64 } });
    toast("Uppladdat", r.message || "PDF uppladdad ✅");
    input.value = "";
    await kbRefresh();
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function kbExport() {
  try {
    const companyId = $("kbCategorySelect").value;
    const res = await fetch(`/export/kb/${companyId}`, { headers: { Authorization: "Bearer " + state.token } });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kb_${companyId}_${Date.now()}.json`;
    a.click();
  } catch {
    toast("Fel", "Kunde inte exportera KB.");
  }
}

/* Categories manager */
async function catsRefresh() {
  const box = $("catsList");
  const msg = $("catsMsg");
  if (!box || !msg) return;

  msg.style.display = "none";
  box.innerHTML = "";

  try {
    await loadCategories();

    for (const c of state.categories) {
      const div = document.createElement("div");
      div.className = "listItem";

      div.innerHTML = `
        <div class="listItemTitle">
          ${escapeHtml(c.key)} - ${escapeHtml(c.name)}
          <span style="margin-left:auto" class="muted small">tone: ${escapeHtml(c.settings?.tone || "professional")}</span>
        </div>

        <div class="row gap" style="margin-top:10px; flex-wrap:wrap;">
          <button class="btn ghost small" data-cat-edit="${escapeHtml(c.key)}" type="button">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn danger small" data-cat-del="${escapeHtml(c.key)}" type="button">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>
      `;
      box.appendChild(div);
    }

    box.querySelectorAll("[data-cat-del]").forEach((btn) => {
      btn.onclick = async () => {
        const key = btn.getAttribute("data-cat-del");
        if (["demo", "law", "tech", "cleaning"].includes(key)) {
          return toast("Blockerat", "Default-kategorier kan inte tas bort.");
        }

        if (!confirm(`Ta bort kategori "${key}"? Detta tar även bort KB + tickets för kategorin.`)) return;

        try {
          await api(`/admin/categories/${encodeURIComponent(key)}`, { method: "DELETE" });
          toast("Borttagen", "Kategori borttagen ✅");
          await catsRefresh();
        } catch (e) {
          toast("Fel", e.message);
        }
      };
    });

    box.querySelectorAll("[data-cat-edit]").forEach((btn) => {
      btn.onclick = async () => {
        const key = btn.getAttribute("data-cat-edit");
        const cat = state.categories.find((x) => x.key === key);
        if (!cat) return;

        const newName = prompt("Nytt namn:", cat.name || "");
        if (newName == null) return;

        const newPrompt = prompt("Ny system prompt:", cat.systemPrompt || "");
        if (newPrompt == null) return;

        try {
          await api(`/admin/categories/${encodeURIComponent(key)}`, {
            method: "PATCH",
            body: {
              name: newName,
              systemPrompt: newPrompt,
              settings: {
                tone: cat.settings?.tone || "professional",
                language: "sv",
                allowEmojis: cat.settings?.allowEmojis !== false,
              },
            },
          });
          toast("Sparat", "Kategori uppdaterad ✅");
          await catsRefresh();
        } catch (e) {
          toast("Fel", e.message);
        }
      };
    });
  } catch (e) {
    msg.style.display = "";
    msg.textContent = e.message;
  }
}

async function createCategory() {
  const key = $("newCatKey").value.trim();
  const name = $("newCatName").value.trim();
  const systemPrompt = $("newCatPrompt").value.trim();

  const tone = $("newCatTone")?.value || "professional";
  const allowEmojis = ($("newCatEmojis")?.value || "true") === "true";

  if (!key || !name) return toast("Saknas", "key + namn krävs");

  try {
    await api("/admin/categories", {
      method: "POST",
      body: { key, name, systemPrompt, settings: { tone, language: "sv", allowEmojis } },
    });

    toast("Skapat", "Kategori skapad ✅");
    $("newCatKey").value = "";
    $("newCatName").value = "";
    $("newCatPrompt").value = "";
    await catsRefresh();
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* AI Settings */
async function aiSettingsRefresh() {
  const msg = $("aiSettingsMsg");
  if (msg) msg.style.display = "none";

  try {
    const s = await api("/ai/settings");
    $("aiGreeting").value = s.greeting || "";
    $("aiTips").value = s.tips || "";
    $("aiShortcuts").value = (s.shortcuts || []).join("\n");
  } catch (e) {
    if (msg) {
      msg.style.display = "";
      msg.textContent = e.message;
    }
  }
}

async function aiSettingsSave() {
  try {
    const greeting = $("aiGreeting").value.trim();
    const tips = $("aiTips").value.trim();
    const shortcuts = $("aiShortcuts")
      .value.split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);

    await api("/ai/settings", { method: "POST", body: { greeting, tips, shortcuts } });
    toast("Sparat", "AI Settings sparade ✅");
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* =========================
   Settings view
========================= */
async function changeUsername() {
  const newUsername = $("newUsernameInput").value.trim();
  if (!newUsername) return;

  try {
    await api("/auth/change-username", { method: "POST", body: { newUsername } });
    toast("Sparat", "Username uppdaterat ✅");
    await bootstrapAfterLogin();
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function changePassword() {
  const currentPassword = $("currentPassInput").value.trim();
  const newPassword = $("newPassInput").value.trim();
  if (!currentPassword || !newPassword) return toast("Saknas", "Fyll i båda fälten.");

  try {
    await api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
    toast("Sparat", "Lösenord uppdaterat ✅");
    $("currentPassInput").value = "";
    $("newPassInput").value = "";
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* =========================
   SLA (render)
========================= */
async function refreshSla() {
  const box = $("slaOverviewBox");
  if (!box) return;
  box.innerHTML = `<div class="muted small">Laddar SLA...</div>`;

  const days = $("slaDaysSelect").value || "30";

  try {
    const ov = await api(`/admin/sla/overview?days=${encodeURIComponent(days)}`);
    box.innerHTML = `
      <div class="slaGrid">
        <div class="slaCard">
          <div class="slaLabel">Totalt tickets</div>
          <div class="slaValue">${ov.totalTickets ?? "-"}</div>
        </div>
        <div class="slaCard">
          <div class="slaLabel">First response compliance</div>
          <div class="slaValue">${ov.firstResponse?.compliancePct ?? "-"}%</div>
        </div>
        <div class="slaCard">
          <div class="slaLabel">Resolution compliance</div>
          <div class="slaValue">${ov.resolution?.compliancePct ?? "-"}%</div>
        </div>
        <div class="slaCard">
          <div class="slaLabel">Open / Pending / Solved</div>
          <div class="slaValue">${ov.statusCounts?.open ?? 0} / ${ov.statusCounts?.pending ?? 0} / ${ov.statusCounts?.solved ?? 0}</div>
        </div>
      </div>
    `;

    const trend = await api(`/admin/sla/trend/weekly?days=${encodeURIComponent(days)}`);
    renderSlaTrendChart(trend.rows || []);

    const agents = await api(`/admin/sla/agents?days=${encodeURIComponent(days)}`);
    renderSlaAgents(agents.rows || []);

    const t = await api(`/admin/sla/tickets?days=${encodeURIComponent(days)}`);
    renderSlaTickets(t.rows || []);
  } catch (e) {
    box.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

async function renderSlaTrendChart(rows) {
  if (!window.Chart) {
    $("slaTrendHint").textContent = "Chart.js saknas.";
    return;
  }

  const labels = rows.map((r) => r.week);
  const first = rows.map((r) => r.firstCompliancePct);
  const res = rows.map((r) => r.resolutionCompliancePct);

  const canvas = $("slaTrendChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (window.__slaChart) window.__slaChart.destroy();

  window.__slaChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "First response %", data: first },
        { label: "Resolution %", data: res },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100 } },
    },
  });

  $("slaTrendHint").textContent = `Visar ${rows.length} veckor.`;
}

function renderSlaAgents(rows) {
  const box = $("slaAgentsBox");
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `<div class="muted small">Ingen agent-data.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Tickets</th>
            <th>Open</th>
            <th>Pending</th>
            <th>Solved</th>
            <th>First compliance</th>
            <th>Res compliance</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
              <tr>
                <td>${escapeHtml(r.username)} (${escapeHtml(r.role)})</td>
                <td>${r.tickets}</td>
                <td>${r.open}</td>
                <td>${r.pending}</td>
                <td>${r.solved}</td>
                <td>${r.firstResponse?.compliancePct ?? "-"}%</td>
                <td>${r.resolution?.compliancePct ?? "-"}%</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSlaTickets(rows) {
  const box = $("slaTicketsBox");
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `<div class="muted small">Ingen ticket-data.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Kategori</th>
            <th>Status</th>
            <th>Prio</th>
            <th>First ms</th>
            <th>Res ms</th>
            <th>Breached first</th>
            <th>Breached res</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 500)
            .map(
              (r) => `
              <tr>
                <td>${escapeHtml(r.ticketPublicId)}</td>
                <td>${escapeHtml(r.companyId)}</td>
                <td>${escapeHtml(r.status)}</td>
                <td>${escapeHtml(r.priority)}</td>
                <td>${r.sla?.firstResponseMs ?? ""}</td>
                <td>${r.sla?.resolutionMs ?? ""}</td>
                <td>${r.sla?.breachedFirstResponse ? "YES" : "NO"}</td>
                <td>${r.sla?.breachedResolution ? "YES" : "NO"}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function slaExportCsv() {
  const days = $("slaDaysSelect").value || "30";
  try {
    const res = await fetch(`/admin/sla/export/csv?days=${encodeURIComponent(days)}`, {
      headers: { Authorization: "Bearer " + state.token },
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sla_export_${days}d_${Date.now()}.csv`;
    a.click();
  } catch {
    toast("Fel", "Kunde inte exportera CSV.");
  }
}

async function slaClearMyStats() {
  try {
    await api(`/admin/sla/clear/my`, { method: "POST" });
    toast("Rensat", "Din SLA statistik raderad ✅");
    await refreshSla();
  } catch (e) {
    toast("Fel", e.message);
  }
}

async function slaClearAllStats() {
  try {
    await api(`/admin/sla/clear/all`, { method: "POST" });
    toast("Rensat", "ALL SLA statistik raderad ✅");
    await refreshSla();
  } catch (e) {
    toast("Fel", e.message);
  }
}

/* =========================
   Events
========================= */
function bindEvents() {
  $("themeToggle").onclick = toggleTheme;

  $("toggleDebugBtn").onclick = () => {
    state.debug = !state.debug;
    $("debugPanel").style.display = state.debug ? "" : "none";
    renderDebug();
  };

  // Auth
  $("loginBtn").onclick = doLogin;
  $("registerBtn").onclick = doRegister;
  $("logoutBtn").onclick = doLogout;

  $("togglePassBtn").onclick = () => {
    const p = $("password");
    p.type = p.type === "password" ? "text" : "password";
  };
  $("toggleResetPassBtn").onclick = () => {
    const p = $("resetNewPass");
    p.type = p.type === "password" ? "text" : "password";
  };

  $("openForgotBtn").onclick = openForgot;
  $("closeForgotBtn").onclick = closeForgot;
  $("sendForgotBtn").onclick = sendForgot;

  // Menu navigation
  $("openChatView").onclick = () => showView("chatView", "openChatView");

  $("openMyTicketsView").onclick = async () => {
    showView("myTicketsView", "openMyTicketsView");
    await refreshMyTickets();
  };

  $("openInboxView").onclick = async () => {
    showView("inboxView", "openInboxView");
    await refreshInbox();
  };

  $("openAdminView").onclick = async () => {
    showView("adminView", "openAdminView");
    openAdminTab("tabUsers");
    await refreshUsers();
    await catsRefresh();
    await kbRefresh();
  };

  $("openSettingsView").onclick = () => showView("settingsView", "openSettingsView");

  $("openSlaView").onclick = async () => {
    showView("slaView", "openSlaView");
    await refreshSla();
  };

  // Category select
  $("categorySelect").onchange = async () => {
    state.companyId = $("categorySelect").value;
    renderChatHeader();
    resetConversation();
    await refreshMyTickets();
    toast("Kategori", `Bytte till ${state.companyId}`);
  };

  // Chat
  $("sendBtn").onclick = sendChat;
  $("messageInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChat();
    }
  });

  $("clearChatBtn").onclick = clearChat;
  $("exportChatBtn").onclick = exportChat;
  $("newTicketBtn").onclick = newTicket;

  // Feedback
  $("fbUp").onclick = () => sendFeedback("up");
  $("fbDown").onclick = () => sendFeedback("down");

  // My tickets
  $("myTicketsRefreshBtn").onclick = refreshMyTickets;
  $("myTicketReplyBtn").onclick = replyMyTicket;

  // Inbox filters
  $("inboxRefreshBtn").onclick = refreshInbox;
  $("inboxSearchInput").addEventListener("input", renderInboxList);
  $("inboxStatusFilter").onchange = refreshInbox;
  $("inboxCategoryFilter").onchange = refreshInbox;

  $("setStatusOpen").onclick = () => setTicketStatus("open");
  $("setStatusPending").onclick = () => setTicketStatus("pending");
  $("setStatusSolved").onclick = () => setTicketStatus("solved");
  $("setPriorityBtn").onclick = setTicketPriority;
  $("sendAgentReplyInboxBtn").onclick = sendAgentReplyInbox;

  $("saveInternalNoteBtn").onclick = saveInternalNote;
  $("clearInternalNotesBtn").onclick = clearInternalNotes;
  $("assignTicketBtn").onclick = assignTicket;
  $("deleteTicketBtn").onclick = deleteTicket;

  $("solveAllBtn").onclick = solveAll;
  $("removeSolvedBtn").onclick = removeSolved;

  // Admin tabs
  document.querySelectorAll(".tabBtn").forEach((b) => {
    b.onclick = async () => {
      const tab = b.getAttribute("data-tab");
      openAdminTab(tab);

      if (tab === "tabUsers") await refreshUsers();
      if (tab === "tabKB") await kbRefresh();
      if (tab === "tabCats") await catsRefresh();
      if (tab === "tabAI") await aiSettingsRefresh();
      if (tab === "tabWidget") renderWidgetCode();
    };
  });

  // Admin
  $("adminExportAllBtn").onclick = exportAll;
  $("trainingExportBtn").onclick = exportTraining;
  $("adminUsersRefreshBtn").onclick = refreshUsers;

  // KB
  $("kbRefreshBtn").onclick = kbRefresh;
  $("kbUploadTextBtn").onclick = kbUploadText;
  $("kbUploadUrlBtn").onclick = kbUploadUrl;
  $("kbUploadPdfBtn").onclick = kbUploadPdf;
  $("kbExportBtn").onclick = kbExport;

  // Cats
  $("catsRefreshBtn").onclick = catsRefresh;
  $("createCatBtn").onclick = createCategory;

  // Settings
  $("changeUsernameBtn").onclick = changeUsername;
  $("changePasswordBtn").onclick = changePassword;

  // SLA
  $("slaRefreshBtn").onclick = refreshSla;
  $("slaExportCsvBtn").onclick = slaExportCsv;
  $("slaClearMyStatsBtn").onclick = slaClearMyStats;
  $("slaClearAllStatsBtn").onclick = slaClearAllStats;

  // Widget
  $("copyWidgetBtn").onclick = copyWidget;

  // AI settings
  $("aiSettingsRefreshBtn").onclick = aiSettingsRefresh;
  $("aiSettingsSaveBtn").onclick = aiSettingsSave;
}

/* =========================
   Init
========================= */
async function init() {
  loadTheme();
  bindEvents();
  renderDebug();

  // Reset token flow
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("resetToken");
  if (resetToken) {
    showView("authView", "openChatView");
    await resetPasswordFromToken(resetToken);
  }

  await loadCategories();

  const me = await loadMe();
  updateRoleUI();

  if (me) {
    await bootstrapAfterLogin();
  } else {
    showView("authView", "openChatView");
  }
}

init().catch((e) => {
  console.error(e);
  toast("Init-fel", e.message);
});