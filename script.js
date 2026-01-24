/* =========================
   AI Kundtjänst – script.js (UPPDATERAD 2025 med CRM)
   - Fullt stöd för kundbas / CRM
   - Matchar uppdaterad server.js
========================= */

const $ = id => document.getElementById(id);

const state = {
  apiBase: "", // same origin
  token: localStorage.getItem("token") || "",
  me: null,
  companyId: "demo",

  conversation: [],
  activeTicketId: null,
  activeTicketPublicId: null,

  categories: [],
  customers: [],              // Alla laddade kunder
  selectedCustomerId: null,   // Vald kund i chatt/ticket

  debug: false,

  myTickets: [],
  inboxTickets: [],
  inboxSelectedTicket: null,
};

/* =========================
   Hjälpfunktioner
========================= */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(title, text = "", type = "info") {
  const container = $("toastContainer") || $("toastWrap");
  if (!container) return;

  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.innerHTML = `<div class="toastTitle">${escapeHtml(title)}</div><div class="toastText">${escapeHtml(text)}</div>`;
  container.appendChild(div);
  setTimeout(() => div.remove(), 4500);
}

/* API-hjälp */
async function api(path, options = {}) {
  const { method = "GET", body, auth = true } = options;
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(state.apiBase + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try { data = await res.json(); } catch {}

  if (!res.ok) {
    throw new Error(data?.error || `Serverfel (${res.status})`);
  }
  return data;
}

/* Vy-hantering */
function hideAllViews() {
  document.querySelectorAll(".view").forEach(v => v.hidden = true);
}

function showView(viewId, menuBtnId) {
  hideAllViews();
  $(viewId).hidden = false;
  if (menuBtnId) {
    document.querySelectorAll(".menu-item").forEach(b => b.classList.remove("active"));
    $(menuBtnId)?.classList.add("active");
  }
}

function updateRoleUI() {
  if (!state.me) {
    $("roleBadge").textContent = "Inte inloggad";
    $("logoutBtn").style.display = "none";
    document.querySelectorAll(".agent-only, .admin-only").forEach(el => el.style.display = "none");
    return;
  }

  $("roleBadge").textContent = `${state.me.username} (${state.me.role})`;
  $("logoutBtn").style.display = "";

  const isAgentAdmin = ["agent", "admin"].includes(state.me.role);
  document.querySelectorAll(".agent-only").forEach(el => el.style.display = isAgentAdmin ? "" : "none");
  document.querySelectorAll(".admin-only").forEach(el => el.style.display = state.me.role === "admin" ? "" : "none");

  // Visa kundbas för agent & admin
  $("openCustomersView").style.display = isAgentAdmin ? "" : "none";
}

/* Theme & Debug */
function toggleTheme() {
  const current = document.body.dataset.theme || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.body.dataset.theme = next;
  localStorage.setItem("theme", next);
}

function loadTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  document.body.dataset.theme = saved;
}

function renderDebug() {
  setDebugLine("dbgApi", location.origin);
  setDebugLine("dbgLogged", state.token ? "JA" : "NEJ");
  setDebugLine("dbgRole", state.me?.role || "-");
  setDebugLine("dbgTicket", state.activeTicketPublicId || "-");
  setDebugLine("dbgCustomer", state.selectedCustomerId ? state.customers.find(c => c._id === state.selectedCustomerId)?.companyName || "vald" : "ingen");
  setDebugLine("dbgRag", "-");
}

/* =========================
   KUNDBAS / CRM
========================= */
async function loadCustomers() {
  if (!["agent", "admin"].includes(state.me?.role)) return;

  try {
    const { customers } = await api("/admin/customers?page=1&limit=100");
    state.customers = customers || [];
    renderCustomersList();
    renderCustomerSelect(); // Uppdatera dropdown i chatt
  } catch (err) {
    toast("Fel", "Kunde inte ladda kunder: " + err.message, "error");
  }
}

function renderCustomersList() {
  const list = $("customersList");
  if (!list) return;

  const search = ($("customerSearchInput")?.value || "").trim().toLowerCase();
  list.innerHTML = "";

  const filtered = state.customers.filter(c =>
    !search ||
    c.companyName?.toLowerCase().includes(search) ||
    c.orgNumber?.includes(search) ||
    c.email?.toLowerCase().includes(search)
  );

  if (!filtered.length) {
    list.innerHTML = '<div class="muted small center">Inga kunder hittades.</div>';
    return;
  }

  filtered.forEach(c => {
    const item = document.createElement("div");
    item.className = "listItem customer-item";
    item.innerHTML = `
      <div class="listItemTitle">
        ${escapeHtml(c.companyName)}
        <span class="pill ${c.status}">${c.status}</span>
      </div>
      <div class="muted small">
        ${c.orgNumber ? `Org: ${escapeHtml(c.orgNumber)} • ` : ""}
        ${c.email || c.phone ? `${c.email || c.phone}` : "Ingen kontaktinfo"}
      </div>
      <div class="row gap" style="margin-top:10px;">
        <button class="btn ghost small" data-edit-customer="${c._id}">Redigera</button>
        <button class="btn danger small" data-delete-customer="${c._id}">Ta bort</button>
      </div>
    `;
    list.appendChild(item);
  });

  // Event listeners
  list.querySelectorAll("[data-edit-customer]").forEach(btn =>
    btn.onclick = () => editCustomer(btn.dataset.editCustomer)
  );

  list.querySelectorAll("[data-delete-customer]").forEach(btn =>
    btn.onclick = () => deleteCustomer(btn.dataset.deleteCustomer)
  );
}

function openCustomerModal(customer = null) {
  const modal = $("customerModal");
  const title = $("customerModalTitle");
  const form = $("customerForm");

  title.textContent = customer ? "Redigera kund" : "Ny kund";

  // Fyll formulär
  $("custCompanyName").value = customer?.companyName || "";
  $("custOrgNumber").value = customer?.orgNumber || "";
  $("custAddress").value = customer?.address || "";
  $("custContactPerson").value = customer?.contactPerson || "";
  $("custEmail").value = customer?.email || "";
  $("custPhone").value = customer?.phone || "";
  $("custStatus").value = customer?.status || "active";

  // Submit-hantering
  form.onsubmit = async e => {
    e.preventDefault();
    const data = {
      companyName: $("custCompanyName").value.trim(),
      orgNumber: $("custOrgNumber").value.trim(),
      address: $("custAddress").value.trim(),
      contactPerson: $("custContactPerson").value.trim(),
      email: $("custEmail").value.trim(),
      phone: $("custPhone").value.trim(),
      status: $("custStatus").value,
    };

    try {
      if (customer) {
        await api(`/admin/customers/${customer._id}`, { method: "PATCH", body: data });
        toast("Uppdaterad", "Kund sparad");
      } else {
        await api("/admin/customers", { method: "POST", body: data });
        toast("Skapad", "Ny kund tillagd");
      }
      modal.close();
      await loadCustomers();
    } catch (err) {
      toast("Fel", err.message, "error");
    }
  };

  modal.showModal();
}

function editCustomer(id) {
  const customer = state.customers.find(c => c._id === id);
  if (customer) openCustomerModal(customer);
}

async function deleteCustomer(id) {
  if (!confirm("Är du säker på att du vill ta bort kunden?")) return;
  try {
    await api(`/admin/customers/${id}`, { method: "DELETE" });
    toast("Borttagen", "Kund borttagen");
    await loadCustomers();
  } catch (err) {
    toast("Fel", err.message, "error");
  }
}

function renderCustomerSelect() {
  const sel = $("chatCustomerSelect");
  if (!sel) return;

  sel.innerHTML = '<option value="">Ingen kund vald</option>';
  state.customers.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c._id;
    opt.textContent = `${c.companyName}${c.orgNumber ? ` (${c.orgNumber})` : ""}`;
    if (c._id === state.selectedCustomerId) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* =========================
   CHATT – med kundval
========================= */
async function sendChat() {
  const input = $("messageInput");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  addMsg("user", text);
  state.conversation.push({ role: "user", content: text });

  try {
    const body = {
      companyId: state.companyId,
      conversation: state.conversation,
      ticketId: state.activeTicketId || undefined,
      customerId: $("chatCustomerSelect")?.value || undefined,
    };

    const data = await api("/chat", { method: "POST", body });

    state.activeTicketId = data.ticketId;
    state.activeTicketPublicId = data.ticketPublicId;

    addMsg("assistant", data.reply, data.ragUsed ? "Baserat på KB" : "");
    state.conversation.push({ role: "assistant", content: data.reply });

    await refreshMyTickets();
  } catch (err) {
    addMsg("assistant", "Fel: " + err.message);
  }
}

/* =========================
   TICKET-VISNING – visa kund
========================= */
function renderTicketDetails(ticket, containerId = "ticketDetails") {
  const box = $(containerId);
  if (!box) return;

  const customer = state.customers.find(c => c._id === ticket.customerId);

  box.innerHTML = `
    <div><strong>${escapeHtml(ticket.title || "(ingen titel)")}</strong></div>
    <div class="muted small">
      ${escapeHtml(ticket.ticketPublicId || ticket.publicTicketId || "")} • 
      ${escapeHtml(ticket.companyId)} • 
      ${escapeHtml(ticket.status)}
      ${customer ? `<br><strong>Kund:</strong> ${escapeHtml(customer.companyName)} (${customer.orgNumber || "ingen org"})` : ""}
    </div>
    <div class="divider"></div>
    ${renderTicketMessages(ticket.messages || [])}
  `;
}

/* =========================
   INIT & EVENT BINDING
========================= */
async function init() {
  loadTheme();
  bindEvents();
  renderDebug();

  const params = new URLSearchParams(location.search);
  if (params.has("resetToken")) {
    showView("authView");
    // hantera reset här om du vill
  }

  await loadCategories();
  const me = await loadMe();
  updateRoleUI();

  if (me) {
    await bootstrapAfterLogin();
  } else {
    showView("authView");
  }
}

async function bootstrapAfterLogin() {
  await loadMe();
  updateRoleUI();
  await loadCustomers();           // Ladda kunder direkt efter login
  await refreshMyTickets();

  if (["agent", "admin"].includes(state.me.role)) {
    await refreshInbox();
  }

  showView("chatView", "openChatView");
  resetConversation();
}

function bindEvents() {
  // Tema
  $("themeToggle").onclick = toggleTheme;

  // Debug
  $("toggleDebugBtn").onclick = () => {
    state.debug = !state.debug;
    $("debugPanel").style.display = state.debug ? "" : "none";
    renderDebug();
  };

  // Logga ut
  $("logoutBtn").onclick = () => {
    localStorage.removeItem("token");
    location.reload();
  };

  // Meny
  document.querySelectorAll("[data-view]").forEach(btn => {
    btn.onclick = async () => {
      const view = btn.dataset.view;
      showView(view, btn.id);

      if (view === "customersView") await loadCustomers();
      if (view === "myTicketsView") await refreshMyTickets();
      if (view === "inboxView") await refreshInbox();
      if (view === "slaView") await refreshSla();
      if (view === "adminView") {
        // ladda users, kb, categories etc.
      }
    };
  });

  // Chatt
  $("sendBtn").onclick = sendChat;
  $("messageInput").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } };

  $("chatCustomerSelect").onchange = e => {
    state.selectedCustomerId = e.target.value || null;
    renderDebug();
  };

  // Kundbas
  $("newCustomerBtn").onclick = () => openCustomerModal();
  $("customersRefreshBtn").onclick = loadCustomers;
  $("customerSearchInput").oninput = () => renderCustomersList();

  // ... lägg till dina andra events här (login, register, inbox, sla, admin etc.)
}

init().catch(err => {
  console.error("Init error:", err);
  toast("Fel vid start", err.message, "error");
});