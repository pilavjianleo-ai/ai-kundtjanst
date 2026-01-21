/* =========================================================
   AI Kundtjänst – script.js (VAL 2)
   ✅ Inbox highlight + notify polling
   ✅ SLA widgets + KPI + trends + filters
   ✅ Agent sees only his SLA + no admin panel
   ✅ AI smarter UX: welcome, typing, quick actions
   ✅ Category edit support (admin)
========================================================= */

(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const API_BASE = ""; // same origin
  const LS_TOKEN = "ak_token";
  const LS_USER = "ak_user";
  const LS_THEME = "ak_theme";
  const LS_DEBUG = "ak_debug";
  const LS_ACTIVE_TICKET = "ak_active_ticket";
  const LS_CATEGORY = "ak_category";

  const NOTIFY_POLL_MS = 5500;
  const SLA_POLL_MS = 9000;

  /* =========================
     DOM HELPERS
  ========================= */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function show(el) {
    if (!el) return;
    el.style.display = "";
  }
  function hide(el) {
    if (!el) return;
    el.style.display = "none";
  }
  function setText(el, text) {
    if (!el) return;
    el.textContent = text ?? "";
  }

  function toast(el, msg, type = "") {
    if (!el) return;
    el.classList.remove("error");
    if (type === "error") el.classList.add("error");
    setText(el, msg);
    show(el);
    setTimeout(() => {
      try {
        hide(el);
      } catch {}
    }, 2600);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function nowTime() {
    const d = new Date();
    return d.toLocaleString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /* =========================
     STATE
  ========================= */
  const state = {
    token: localStorage.getItem(LS_TOKEN) || "",
    user: safeParse(localStorage.getItem(LS_USER)) || null,
    debug: localStorage.getItem(LS_DEBUG) === "1",
    theme: localStorage.getItem(LS_THEME) || "dark",
    categories: [],
    companyId: localStorage.getItem(LS_CATEGORY) || "demo",

    chat: {
      conversation: [],
      ticketId: localStorage.getItem(LS_ACTIVE_TICKET) || "",
      ragUsed: false,
    },

    myTickets: {
      list: [],
      selectedId: "",
    },

    inbox: {
      list: [],
      selectedId: "",
      unreadCount: 0,
      lastUnreadCount: 0,
    },

    sla: {
      days: 30,
      compareMode: "none",
      overview: null,
      agents: [],
      tickets: [],
      chart: null,
      lastUpdateAt: 0,
    },
  };

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function saveAuth(token, user) {
    state.token = token || "";
    state.user = user || null;
    if (state.token) localStorage.setItem(LS_TOKEN, state.token);
    else localStorage.removeItem(LS_TOKEN);

    if (state.user) localStorage.setItem(LS_USER, JSON.stringify(state.user));
    else localStorage.removeItem(LS_USER);
  }

  function isLoggedIn() {
    return !!state.token;
  }

  function isAdmin() {
    return state.user?.role === "admin";
  }

  function isAgentOrAdmin() {
    return state.user?.role === "admin" || state.user?.role === "agent";
  }

  /* =========================
     API
  ========================= */
  async function apiFetch(path, opts = {}) {
    const headers = Object.assign(
      {
        "Content-Type": "application/json",
      },
      opts.headers || {}
    );

    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    const res = await fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    // try parse json
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const errMsg = data?.error || `HTTP ${res.status}`;
      const err = new Error(errMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* =========================
     VIEWS
  ========================= */
  const views = {
    authView: $("#authView"),
    chatView: $("#chatView"),
    myTicketsView: $("#myTicketsView"),
    slaView: $("#slaView"),
    inboxView: $("#inboxView"),
    adminView: $("#adminView"),
    settingsView: $("#settingsView"),
  };

  function openView(viewId) {
    Object.keys(views).forEach((k) => hide(views[k]));
    show(views[viewId]);

    // menu active state
    $$(".menuBtn").forEach((b) => b.classList.remove("active"));
    if (viewId === "chatView") $("#openChatView")?.classList.add("active");
    if (viewId === "myTicketsView") $("#openMyTicketsView")?.classList.add("active");
    if (viewId === "inboxView") $("#openInboxView")?.classList.add("active");
    if (viewId === "slaView") $("#openSlaView")?.classList.add("active");
    if (viewId === "adminView") $("#openAdminView")?.classList.add("active");
    if (viewId === "settingsView") $("#openSettingsView")?.classList.add("active");

    updateDebugPanel();
  }

  /* =========================
     UI: ROLE BADGE + MENU ACL
  ========================= */
  function updateRoleUI() {
    const roleBadge = $("#roleBadge");
    const logoutBtn = $("#logoutBtn");
    const openSettingsBtn = $("#openSettingsView");

    if (!isLoggedIn()) {
      setText(roleBadge, "Inte inloggad");
      hide(logoutBtn);
      hide(openSettingsBtn);

      // hide protected
      hide($("#openInboxView"));
      hide($("#openSlaView"));
      hide($("#openAdminView"));
      return;
    }

    const r = state.user?.role || "user";
    setText(roleBadge, `${state.user?.username || "User"} • ${r.toUpperCase()}`);
    show(logoutBtn);
    show(openSettingsBtn);

    // agent/admin sees inbox + SLA
    if (isAgentOrAdmin()) {
      show($("#openInboxView"));
      show($("#openSlaView"));
    } else {
      hide($("#openInboxView"));
      hide($("#openSlaView"));
    }

    // ✅ ONLY admin sees admin panel (hard UI block)
    if (isAdmin()) {
      show($("#openAdminView"));
    } else {
      hide($("#openAdminView"));
    }
  }

  /* =========================
     THEME
  ========================= */
  function applyTheme() {
    document.body.setAttribute("data-theme", state.theme);
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem(LS_THEME, state.theme);
    applyTheme();
  }

  /* =========================
     DEBUG PANEL
  ========================= */
  function updateDebugPanel() {
    const dbg = $("#debugPanel");
    if (!dbg) return;
    if (!state.debug) {
      hide(dbg);
      return;
    }
    show(dbg);

    setText($("#dbgApi"), window.location.origin);
    setText($("#dbgLogged"), isLoggedIn() ? "JA" : "NEJ");
    setText($("#dbgRole"), state.user?.role || "-");
    setText($("#dbgTicket"), state.chat.ticketId || "-");
    setText($("#dbgRag"), state.chat.ragUsed ? "YES" : "NO");
  }

  function toggleDebug() {
    state.debug = !state.debug;
    localStorage.setItem(LS_DEBUG, state.debug ? "1" : "0");
    updateDebugPanel();
  }

  /* =========================
     CATEGORIES
  ========================= */
  async function loadCategories() {
    try {
      const cats = await apiFetch("/categories");
      state.categories = cats || [];

      // sidebar select
      const select = $("#categorySelect");
      if (select) {
        select.innerHTML = "";
        for (const c of state.categories) {
          const opt = document.createElement("option");
          opt.value = c.key;
          opt.textContent = c.name || c.key;
          select.appendChild(opt);
        }
        select.value = state.companyId;
      }

      // admin KB select
      const kbSel = $("#kbCategorySelect");
      if (kbSel) {
        kbSel.innerHTML = "";
        for (const c of state.categories) {
          const opt = document.createElement("option");
          opt.value = c.key;
          opt.textContent = c.name || c.key;
          kbSel.appendChild(opt);
        }
        kbSel.value = state.companyId;
      }

      // inbox category filter
      const inboxCat = $("#inboxCategoryFilter");
      if (inboxCat) {
        inboxCat.innerHTML = `<option value="">Alla kategorier</option>`;
        for (const c of state.categories) {
          const opt = document.createElement("option");
          opt.value = c.key;
          opt.textContent = c.name || c.key;
          inboxCat.appendChild(opt);
        }
      }
    } catch (e) {
      console.warn("loadCategories fail:", e.message);
    }
  }

  function onCategoryChange(key) {
    state.companyId = key || "demo";
    localStorage.setItem(LS_CATEGORY, state.companyId);

    // reset active ticket (new category = new conversation context)
    state.chat.ticketId = "";
    localStorage.removeItem(LS_ACTIVE_TICKET);
    state.chat.conversation = [];
    renderChatMessages(true);
  }

  /* =========================
     CHAT UI
  ========================= */
  function pushMsg(role, content, meta = "") {
    state.chat.conversation.push({ role, content: String(content ?? ""), meta });
    renderChatMessages();
  }

  function renderChatMessages(forceScrollBottom = false) {
    const box = $("#messages");
    if (!box) return;

    box.innerHTML = "";

    for (const msg of state.chat.conversation) {
      const row = document.createElement("div");
      row.className = "msg " + (msg.role === "user" ? "user" : "assistant");

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.innerHTML =
        msg.role === "user" ? `<i class="fa-solid fa-user"></i>` : `<i class="fa-solid fa-headset"></i>`;

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = escapeHtml(msg.content);

      const meta = document.createElement("div");
      meta.className = "msgMeta";
      meta.textContent = msg.meta || nowTime();

      const wrap = document.createElement("div");
      wrap.appendChild(bubble);
      wrap.appendChild(meta);

      row.appendChild(avatar);
      row.appendChild(wrap);

      box.appendChild(row);
    }

    if (forceScrollBottom) {
      box.scrollTop = box.scrollHeight;
    } else {
      // soft stick to bottom
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
      if (nearBottom) box.scrollTop = box.scrollHeight;
    }
  }

  function setChatTitleDefault() {
    setText($("#chatTitle"), "AI Kundtjänst");
    setText($("#chatSubtitle"), "Ställ en fråga så hjälper jag dig direkt.");
  }

  function resetChat() {
    state.chat.conversation = [];
    state.chat.ticketId = "";
    state.chat.ragUsed = false;
    localStorage.removeItem(LS_ACTIVE_TICKET);
    renderChatMessages(true);
    setChatTitleDefault();
  }

  /* ✅ Typing indicator */
  let typingMsgActive = false;

  function showTyping() {
    if (typingMsgActive) return;
    typingMsgActive = true;
    pushMsg("assistant", "⏳ AI skriver…", nowTime());
  }

  function hideTyping() {
    if (!typingMsgActive) return;
    typingMsgActive = false;
    // remove last assistant typing msg if exists
    const last = state.chat.conversation[state.chat.conversation.length - 1];
    if (last && last.role !== "user" && String(last.content).includes("AI skriver")) {
      state.chat.conversation.pop();
      renderChatMessages();
    }
  }

  /* ✅ Quick actions (small UX helper) */
  function insertQuickPrompts() {
    // only if empty chat
    if (state.chat.conversation.length > 0) return;

    pushMsg(
      "assistant",
      "Hej! 👋 Välkommen!\n\nSkriv vad du behöver hjälp med så löser vi det.\n\n👉 Snabba val:\n1) Leverans / order\n2) Faktura / betalning\n3) Tekniskt problem\n4) Reklamation / retur\n\nSkriv t.ex. **1** eller beskriv problemet.",
      nowTime()
    );
  }

  /* =========================
     CHAT SEND
  ========================= */
  async function sendChat() {
    const input = $("#messageInput");
    const text = (input?.value || "").trim();
    if (!text) return;

    input.value = "";

    // show user msg immediately
    pushMsg("user", text, nowTime());

    // build conversation payload
    const payloadConversation = state.chat.conversation.map((m) => ({
      role: m.role === "assistant" ? "assistant" : m.role,
      content: m.content,
    }));

    showTyping();

    try {
      const data = await apiFetch("/chat", {
        method: "POST",
        body: {
          companyId: state.companyId,
          conversation: payloadConversation,
          ticketId: state.chat.ticketId || undefined,
        },
      });

      hideTyping();

      const reply = data?.reply || "Inget svar från AI.";
      const ticketId = data?.ticketId || "";

      state.chat.ragUsed = !!data?.ragUsed;
      if (ticketId) {
        state.chat.ticketId = ticketId;
        localStorage.setItem(LS_ACTIVE_TICKET, ticketId);
      }

      pushMsg("assistant", reply, nowTime());
      updateDebugPanel();
    } catch (e) {
      hideTyping();
      pushMsg("assistant", `❌ Serverfel: ${e.message}`, nowTime());
    }
  }

  /* =========================
     EXPORT CHAT
  ========================= */
  function exportChat() {
    const rows = state.chat.conversation.map((m) => ({
      time: m.meta || "",
      role: m.role,
      content: m.content,
    }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), rows }, null, 2)], {
      type: "application/json",
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `chat_export_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* =========================
     FEEDBACK
  ========================= */
  async function sendFeedback(type) {
    if (!isLoggedIn()) return;
    try {
      await apiFetch("/feedback", { method: "POST", body: { type, companyId: state.companyId } });
      setText($("#fbMsg"), "Tack! ✅");
      setTimeout(() => setText($("#fbMsg"), ""), 1600);
    } catch {
      setText($("#fbMsg"), "Kunde inte spara.");
      setTimeout(() => setText($("#fbMsg"), ""), 1600);
    }
  }

  /* =========================
     AUTH
  ========================= */
  async function doLogin() {
    const username = ($("#username")?.value || "").trim();
    const password = ($("#password")?.value || "").trim();
    const msg = $("#authMessage");

    if (!username || !password) {
      toast(msg, "Fyll i användarnamn och lösenord.", "error");
      return;
    }

    try {
      const data = await apiFetch("/login", {
        method: "POST",
        body: { username, password },
      });

      saveAuth(data.token, data.user);
      updateRoleUI();

      // load categories after login
      await loadCategories();

      // prepare chat
      resetChat();
      insertQuickPrompts();

      openView("chatView");
    } catch (e) {
      toast(msg, e.message || "Inloggning misslyckades", "error");
    }
  }

  async function doRegister() {
    const username = ($("#username")?.value || "").trim();
    const password = ($("#password")?.value || "").trim();
    const email = ($("#email")?.value || "").trim();
    const msg = $("#authMessage");

    if (!username || !password) {
      toast(msg, "Fyll i användarnamn och lösenord.", "error");
      return;
    }

    try {
      const data = await apiFetch("/register", {
        method: "POST",
        body: { username, password, email },
      });

      toast(msg, data?.message || "Registrering klar ✅");
    } catch (e) {
      toast(msg, e.message || "Registrering misslyckades", "error");
    }
  }

  async function doMeRefresh() {
    if (!isLoggedIn()) return;
    try {
      const me = await apiFetch("/me");
      saveAuth(state.token, me);
      updateRoleUI();
    } catch (e) {
      console.warn("me refresh failed:", e.message);
      // token invalid => logout
      doLogout(true);
    }
  }

  function doLogout(silent = false) {
    saveAuth("", null);
    resetChat();

    // clear views
    state.myTickets.list = [];
    state.inbox.list = [];
    state.inbox.unreadCount = 0;

    updateRoleUI();
    if (!silent) toast($("#authMessage"), "Utloggad ✅");
    openView("authView");
  }

  /* =========================
     FORGOT / RESET PASS
  ========================= */
  function openForgotCard() {
    hide($("#forgotCard")?.previousElementSibling);
    show($("#forgotCard"));
  }

  function closeForgotCard() {
    hide($("#forgotCard"));
  }

  async function sendForgot() {
    const email = ($("#forgotEmail")?.value || "").trim();
    const msg = $("#forgotMsg");

    if (!email) {
      toast(msg, "Skriv en email.", "error");
      return;
    }

    try {
      const data = await apiFetch("/auth/forgot-password", { method: "POST", body: { email } });
      toast(msg, data?.message || "Skickat ✅");
    } catch (e) {
      toast(msg, e.message, "error");
    }
  }

  function getResetTokenFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get("resetToken") || "";
  }

  function showResetCardIfNeeded() {
    const token = getResetTokenFromUrl();
    if (!token) return;

    // show reset
    hide($("#authView")?.querySelector(".authCard"));
    hide($("#forgotCard"));
    show($("#resetCard"));
  }

  async function resetPassword() {
    const token = getResetTokenFromUrl();
    const pass = ($("#resetNewPass")?.value || "").trim();
    const msg = $("#resetMsg");

    if (!token || !pass) {
      toast(msg, "Token eller lösenord saknas.", "error");
      return;
    }

    try {
      const data = await apiFetch("/auth/reset-password", {
        method: "POST",
        body: { resetToken: token, newPassword: pass },
      });

      toast(msg, data?.message || "Lösenord uppdaterat ✅");

      // clean URL token
      const url = new URL(window.location.href);
      url.searchParams.delete("resetToken");
      window.history.replaceState({}, "", url.toString());

      // go back to login
      hide($("#resetCard"));
      show($("#authView")?.querySelector(".authCard"));
    } catch (e) {
      toast(msg, e.message, "error");
    }
  }

  /* =========================
     SETTINGS
  ========================= */
  async function changeUsername() {
    const newUsername = ($("#newUsernameInput")?.value || "").trim();
    const msg = $("#settingsMsg");

    if (!newUsername || newUsername.length < 3) {
      toast(msg, "Nytt username måste vara minst 3 tecken.", "error");
      return;
    }

    try {
      const data = await apiFetch("/auth/change-username", {
        method: "POST",
        body: { newUsername },
      });

      toast(msg, data?.message || "Uppdaterat ✅");
      await doMeRefresh();
    } catch (e) {
      toast(msg, e.message, "error");
    }
  }

  async function changePassword() {
    const currentPassword = ($("#currentPassInput")?.value || "").trim();
    const newPassword = ($("#newPassInput")?.value || "").trim();
    const msg = $("#settingsMsg");

    if (!currentPassword || !newPassword) {
      toast(msg, "Fyll i båda fälten.", "error");
      return;
    }

    try {
      const data = await apiFetch("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      toast(msg, data?.message || "Lösenord uppdaterat ✅");
    } catch (e) {
      toast(msg, e.message, "error");
    }
  }

  /* =========================
     MY TICKETS
  ========================= */
  async function loadMyTickets() {
    if (!isLoggedIn()) return;
    const hint = $("#myTicketsHint");
    try {
      const list = await apiFetch("/my/tickets");
      state.myTickets.list = list || [];
      setText(hint, `${state.myTickets.list.length} st`);
      renderMyTicketsList();
    } catch (e) {
      setText(hint, `Fel: ${e.message}`);
    }
  }

  function renderMyTicketsList() {
    const box = $("#myTicketsList");
    if (!box) return;

    box.innerHTML = "";
    const list = state.myTickets.list || [];

    if (!list.length) {
      box.innerHTML = `<div class="muted small">Inga tickets ännu.</div>`;
      return;
    }

    for (const t of list) {
      const item = document.createElement("div");
      item.className = "listItem";
      if (String(t._id) === String(state.myTickets.selectedId)) item.classList.add("selected");

      const title = t.title || "(utan titel)";
      const status = t.status || "open";
      const prio = t.priority || "normal";

      item.innerHTML = `
        <div class="listItemTitle">
          <span>${escapeHtml(title)}</span>
          <span class="pill">${escapeHtml(status)}</span>
          <span class="pill">${escapeHtml(prio)}</span>
          <span class="pill">${escapeHtml(t.companyId || "")}</span>
        </div>
        <div class="muted small">ID: ${escapeHtml(String(t._id))}</div>
      `;

      item.addEventListener("click", async () => {
        state.myTickets.selectedId = String(t._id);
        renderMyTicketsList();
        await openMyTicket(String(t._id));
      });

      box.appendChild(item);
    }
  }

  async function openMyTicket(ticketId) {
    const box = $("#myTicketDetails");
    if (!box) return;

    try {
      const t = await apiFetch(`/my/tickets/${ticketId}`);
      box.innerHTML = renderTicketDetailsHtml(t, true);
    } catch (e) {
      box.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    }
  }

  async function replyMyTicket() {
    const tid = state.myTickets.selectedId;
    if (!tid) return;

    const txt = ($("#myTicketReplyText")?.value || "").trim();
    const msg = $("#myTicketReplyMsg");
    if (!txt) {
      toast(msg, "Skriv ett meddelande.", "error");
      return;
    }

    try {
      const data = await apiFetch(`/my/tickets/${tid}/reply`, {
        method: "POST",
        body: { content: txt },
      });

      $("#myTicketReplyText").value = "";
      toast(msg, data?.message || "Skickat ✅");
      await openMyTicket(tid);
      await loadMyTickets();

      // inbox notify will catch unread for agent
    } catch (e) {
      toast(msg, e.message, "error");
    }
  }

  /* =========================
     TICKET DETAILS HTML
  ========================= */
  function renderTicketDetailsHtml(t, includeMessages = false) {
    const sla = t?.sla || null;

    const slaFirstState = sla?.firstResponseState || "";
    const slaResState = sla?.resolutionState || "";

    const statePill = (s) => {
      if (s === "breached") return `<span class="pill danger">BREACHED</span>`;
      if (s === "at_risk") return `<span class="pill warn">AT RISK</span>`;
      if (s === "ok") return `<span class="pill ok">OK</span>`;
      if (s === "waiting") return `<span class="pill">WAITING</span>`;
      return `<span class="pill">-</span>`;
    };

    const head = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
        <b>${escapeHtml(t.title || "(utan titel)")}</b>
        <span class="pill">${escapeHtml(t.status || "")}</span>
        <span class="pill">${escapeHtml(t.priority || "")}</span>
        <span class="pill">${escapeHtml(t.companyId || "")}</span>
      </div>

      <div class="muted small" style="margin-top:6px;">
        Ticket ID: <b>${escapeHtml(String(t._id || ""))}</b><br/>
        Skapad: ${escapeHtml(new Date(t.createdAt).toLocaleString("sv-SE"))}<br/>
        Senast aktiv: ${escapeHtml(new Date(t.lastActivityAt).toLocaleString("sv-SE"))}
      </div>

      <div class="divider"></div>

      <div class="row gap" style="flex-wrap:wrap;">
        <div>
          <div class="muted small">First response</div>
          <div style="font-weight:900;">
            ${escapeHtml(sla?.pretty?.firstResponse || "-")}
            ${statePill(slaFirstState)}
          </div>
          <div class="muted small">Kvar: ${escapeHtml(sla?.pretty?.firstRemaining || "-")}</div>
        </div>

        <div>
          <div class="muted small">Resolution</div>
          <div style="font-weight:900;">
            ${escapeHtml(sla?.pretty?.resolution || "-")}
            ${statePill(slaResState)}
          </div>
          <div class="muted small">Kvar: ${escapeHtml(sla?.pretty?.resolutionRemaining || "-")}</div>
        </div>

        <div>
          <div class="muted small">Pending paus</div>
          <div style="font-weight:900;">${escapeHtml(sla?.pretty?.pendingTotal || "-")}</div>
          <div class="muted small">Effektiv tid: ${escapeHtml(sla?.pretty?.effectiveRunning || "-")}</div>
        </div>
      </div>
    `;

    if (!includeMessages) return head;

    const msgs = (t.messages || [])
      .map((m) => {
        const role = m.role || "user";
        const cls = role === "user" ? "user" : role === "agent" ? "agent" : "ai";
        const when = m.timestamp ? new Date(m.timestamp).toLocaleString("sv-SE") : "";
        return `
          <div class="ticketMsg ${cls}">
            <div class="ticketMsgHead">
              <span><b>${escapeHtml(role.toUpperCase())}</b></span>
              <span>${escapeHtml(when)}</span>
            </div>
            <div class="ticketMsgBody">${escapeHtml(m.content || "")}</div>
          </div>
        `;
      })
      .join("");

    return `
      ${head}
      <div class="divider"></div>
      <div>
        <b>Konversation</b>
        <div style="margin-top:10px;">
          ${msgs || `<div class="muted small">Inga meddelanden.</div>`}
        </div>
      </div>
    `;
  }

  /* =========================
     BIND EVENTS (DEL 1)
  ========================= */
  function bindBaseEvents() {
    // menu
    $("#openChatView")?.addEventListener("click", () => openView("chatView"));
    $("#openMyTicketsView")?.addEventListener("click", async () => {
      openView("myTicketsView");
      await loadMyTickets();
    });

    $("#openInboxView")?.addEventListener("click", async () => {
      openView("inboxView");
      await loadInboxTickets();
      await refreshNotify(); // mark UI correct
    });

    $("#openSlaView")?.addEventListener("click", async () => {
      openView("slaView");
      await loadSlaAll();
    });

    $("#openAdminView")?.addEventListener("click", async () => {
      // ✅ strict UI block: only admin
      if (!isAdmin()) return;
      openView("adminView");
      await loadAdminUsers();
      await loadCatsAdmin();
      await loadKbList();
    });

    $("#openSettingsView")?.addEventListener("click", () => {
      openView("settingsView");
    });

    // theme
    $("#themeToggle")?.addEventListener("click", toggleTheme);

    // debug
    $("#toggleDebugBtn")?.addEventListener("click", toggleDebug);

    // logout
    $("#logoutBtn")?.addEventListener("click", () => doLogout(false));

    // category select
    $("#categorySelect")?.addEventListener("change", (e) => {
      onCategoryChange(e.target.value);
    });

    // auth
    $("#loginBtn")?.addEventListener("click", doLogin);
    $("#registerBtn")?.addEventListener("click", doRegister);

    $("#togglePassBtn")?.addEventListener("click", () => {
      const i = $("#password");
      if (!i) return;
      i.type = i.type === "password" ? "text" : "password";
    });

    // forgot
    $("#openForgotBtn")?.addEventListener("click", () => show($("#forgotCard")));
    $("#closeForgotBtn")?.addEventListener("click", () => hide($("#forgotCard")));
    $("#sendForgotBtn")?.addEventListener("click", sendForgot);

    // reset
    $("#toggleResetPassBtn")?.addEventListener("click", () => {
      const i = $("#resetNewPass");
      if (!i) return;
      i.type = i.type === "password" ? "text" : "password";
    });
    $("#resetSaveBtn")?.addEventListener("click", resetPassword);

    // chat send
    $("#sendBtn")?.addEventListener("click", sendChat);
    $("#messageInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });

    // chat actions
    $("#clearChatBtn")?.addEventListener("click", resetChat);
    $("#exportChatBtn")?.addEventListener("click", exportChat);

    // "new ticket" -> resets + welcome
    $("#newTicketBtn")?.addEventListener("click", () => {
      resetChat();
      insertQuickPrompts();
    });

    // feedback
    $("#fbUp")?.addEventListener("click", () => sendFeedback("up"));
    $("#fbDown")?.addEventListener("click", () => sendFeedback("down"));

    // my tickets reply
    $("#myTicketReplyBtn")?.addEventListener("click", replyMyTicket);

    // settings
    $("#changeUsernameBtn")?.addEventListener("click", changeUsername);
    $("#changePasswordBtn")?.addEventListener("click", changePassword);

    // top refresh
    $("#myTicketsRefreshBtn")?.addEventListener("click", loadMyTickets);
  }

  /* =========================
     DEL 2 PREVIEW (stubs)
     - these functions are implemented in PART 2
  ========================= */
  async function loadInboxTickets() {}
  async function refreshNotify() {}
  async function loadSlaAll() {}
  async function loadAdminUsers() {}
  async function loadCatsAdmin() {}
  async function loadKbList() {}

  /* =========================
     BOOT
  ========================= */
  async function boot() {
    applyTheme();
    bindBaseEvents();
    showResetCardIfNeeded();

    // public categories load
    await loadCategories();

    // if token exists -> refresh /me
    if (isLoggedIn()) {
      await doMeRefresh();

      // open chat by default
      openView("chatView");

      // welcome
      if (!state.chat.conversation.length) insertQuickPrompts();
    } else {
      openView("authView");
    }

    updateRoleUI();
    updateDebugPanel();

    // start notify poll (agent/admin only)
    setInterval(() => {
      if (isLoggedIn() && isAgentOrAdmin()) refreshNotify().catch(() => {});
    }, NOTIFY_POLL_MS);

    // SLA poll when SLA is open
    setInterval(() => {
      if (!isLoggedIn() || !isAgentOrAdmin()) return;
      const slaVisible = views.slaView && views.slaView.style.display !== "none";
      if (!slaVisible) return;
      loadSlaAll().catch(() => {});
    }, SLA_POLL_MS);
  }

  window.addEventListener("load", boot);
})();


// =========================
// ✅ INBOX + SLA + ADMIN IMPLEMENTATION
// =========================

// Because we are continuing in the same file scope, we can now define
// the functions that were stubs in DEL 1.
// eslint-disable-next-line no-undef
const __AK_CONTINUE__ = true;

/* =========================
   INBOX
========================= */
// eslint-disable-next-line no-undef
async function loadInboxTickets() {
  // eslint-disable-next-line no-undef
  if (!isLoggedIn() || !isAgentOrAdmin()) return;

  const msg = $("#inboxMsg");
  const listBox = $("#inboxTicketsList");

  try {
    hide(msg);

    // filters
    const status = ($("#inboxStatusFilter")?.value || "").trim();
    const companyId = ($("#inboxCategoryFilter")?.value || "").trim();
    const q = ($("#inboxSearchInput")?.value || "").trim().toLowerCase();

    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (companyId) qs.set("companyId", companyId);

    const data = await apiFetch(`/admin/tickets${qs.toString() ? "?" + qs.toString() : ""}`);
    state.inbox.list = Array.isArray(data) ? data : [];

    // apply search locally
    let rows = state.inbox.list.slice();
    if (q) {
      rows = rows.filter((t) => {
        const title = String(t.title || "").toLowerCase();
        const id = String(t._id || "").toLowerCase();
        const cat = String(t.companyId || "").toLowerCase();
        return title.includes(q) || id.includes(q) || cat.includes(q);
      });
    }

    renderInboxTickets(rows);

    // refresh assign dropdown (admin only)
    if (isAdmin()) await loadAssignUsers();
  } catch (e) {
    toast(msg, e.message || "Fel vid inbox", "error");
    if (listBox) listBox.innerHTML = "";
  }
}

// eslint-disable-next-line no-undef
function renderInboxTickets(rows) {
  const box = $("#inboxTicketsList");
  if (!box) return;

  box.innerHTML = "";

  if (!rows.length) {
    box.innerHTML = `<div class="muted small">Inga tickets matchar.</div>`;
    return;
  }

  for (const t of rows) {
    const item = document.createElement("div");
    item.className = "listItem";
    if (String(t._id) === String(state.inbox.selectedId)) item.classList.add("selected");

    const title = t.title || "(utan titel)";
    const status = t.status || "open";
    const prio = t.priority || "normal";

    // unread indicator for agent/admin
    const unread = !!t.unreadForAgent;
    const unreadPill = unread ? `<span class="pill warn"><i class="fa-solid fa-bell"></i> NY</span>` : "";

    // SLA quick health
    const sla = t.sla || {};
    const firstState = sla.firstResponseState || "";
    const resState = sla.resolutionState || "";
    const health = (s) => {
      if (s === "breached") return `<span class="pill danger">BREACH</span>`;
      if (s === "at_risk") return `<span class="pill warn">RISK</span>`;
      if (s === "ok") return `<span class="pill ok">OK</span>`;
      return `<span class="pill">WAIT</span>`;
    };

    item.innerHTML = `
      <div class="listItemTitle">
        <span>${escapeHtml(title)}</span>
        ${unreadPill}
        <span class="pill">${escapeHtml(status)}</span>
        <span class="pill">${escapeHtml(prio)}</span>
        <span class="pill">${escapeHtml(t.companyId || "")}</span>
      </div>

      <div class="muted small" style="margin-top:6px;">
        ID: <b>${escapeHtml(String(t._id))}</b> •
        Senast: ${escapeHtml(new Date(t.lastActivityAt).toLocaleString("sv-SE"))}
      </div>

      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        <span class="muted small">First:</span> ${health(firstState)}
        <span class="muted small">Res:</span> ${health(resState)}
      </div>
    `;

    item.addEventListener("click", async () => {
      state.inbox.selectedId = String(t._id);
      renderInboxTickets(rows);
      await openInboxTicket(String(t._id));
    });

    box.appendChild(item);
  }
}

// eslint-disable-next-line no-undef
async function openInboxTicket(ticketId) {
  const msg = $("#inboxTicketMsg");
  const details = $("#ticketDetails");

  try {
    hide(msg);

    const t = await apiFetch(`/admin/tickets/${ticketId}`);
    details.innerHTML = renderTicketDetailsHtml(t, true);

    // fill notes UI
    renderInternalNotes(t.internalNotes || []);

    // store current ticket in state list
    state.inbox.selectedId = String(ticketId);

    // clear unread highlight in UI will happen on next notify poll
    await refreshNotify().catch(() => {});
  } catch (e) {
    toast(msg, e.message || "Fel vid öppna ticket", "error");
    if (details) details.innerHTML = `<div class="muted small">Välj en ticket.</div>`;
  }
}

// eslint-disable-next-line no-undef
function renderInternalNotes(notes) {
  const box = $("#internalNotesList");
  if (!box) return;

  if (!notes.length) {
    box.innerHTML = `<div class="muted small">Inga interna notes.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="noteList">
      ${notes
        .map((n) => {
          const when = n.createdAt ? new Date(n.createdAt).toLocaleString("sv-SE") : "";
          return `
          <div class="noteItem">
            <div class="noteMeta">${escapeHtml(when)}</div>
            <div class="noteText">${escapeHtml(n.content || "")}</div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

// eslint-disable-next-line no-undef
async function inboxSetStatus(status) {
  const id = state.inbox.selectedId;
  if (!id) return;

  try {
    await apiFetch(`/admin/tickets/${id}/status`, { method: "POST", body: { status } });
    await loadInboxTickets();
    await openInboxTicket(id);
  } catch (e) {
    toast($("#inboxTicketMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function inboxSetPriority(priority) {
  const id = state.inbox.selectedId;
  if (!id) return;

  try {
    await apiFetch(`/admin/tickets/${id}/priority`, { method: "POST", body: { priority } });
    await loadInboxTickets();
    await openInboxTicket(id);
  } catch (e) {
    toast($("#inboxTicketMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function sendAgentReplyInbox() {
  const id = state.inbox.selectedId;
  const txt = ($("#agentReplyTextInbox")?.value || "").trim();
  if (!id) return;
  if (!txt) return toast($("#inboxTicketMsg"), "Skriv ett svar.", "error");

  try {
    await apiFetch(`/admin/tickets/${id}/agent-reply`, { method: "POST", body: { content: txt } });
    $("#agentReplyTextInbox").value = "";
    await loadInboxTickets();
    await openInboxTicket(id);
  } catch (e) {
    toast($("#inboxTicketMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function saveInternalNote() {
  const id = state.inbox.selectedId;
  const txt = ($("#internalNoteText")?.value || "").trim();
  if (!id) return;
  if (!txt) return toast($("#inboxTicketMsg"), "Skriv en intern notering.", "error");

  try {
    await apiFetch(`/admin/tickets/${id}/internal-note`, { method: "POST", body: { content: txt } });
    $("#internalNoteText").value = "";
    await openInboxTicket(id);
  } catch (e) {
    toast($("#inboxTicketMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function clearInternalNotes() {
  if (!isAdmin()) return toast($("#inboxTicketMsg"), "Endast admin kan rensa notes.", "error");
  const id = state.inbox.selectedId;
  if (!id) return;

  try {
    await apiFetch(`/admin/tickets/${id}/internal-notes`, { method: "DELETE" });
    await openInboxTicket(id);
  } catch (e) {
    toast($("#inboxTicketMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function deleteInboxTicket() {
  const id = state.inbox.selectedId;
  if (!id) return;

  if (!confirm("Ta bort ticket permanent?")) return;

  try {
    await apiFetch(`/admin/tickets/${id}`, { method: "DELETE" });
    state.inbox.selectedId = "";
    $("#ticketDetails").innerHTML = `<div class="muted small">Välj en ticket.</div>`;
    renderInternalNotes([]);
    await loadInboxTickets();
  } catch (e) {
    toast($("#inboxTicketMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function solveAllTickets() {
  if (!isAdmin()) return toast($("#inboxMsg"), "Solve ALL kräver admin.", "error");
  if (!confirm("Solve ALL? Detta markerar alla tickets som solved.")) return;

  try {
    const data = await apiFetch("/admin/tickets/solve-all", { method: "POST" });
    toast($("#inboxMsg"), data?.message || "Klart ✅");
    await loadInboxTickets();
  } catch (e) {
    toast($("#inboxMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function removeSolvedTickets() {
  if (!isAdmin()) return toast($("#inboxMsg"), "Remove solved kräver admin.", "error");
  if (!confirm("Ta bort ALLA solved tickets permanent?")) return;

  try {
    const data = await apiFetch("/admin/tickets/remove-solved", { method: "POST" });
    toast($("#inboxMsg"), data?.message || "Klart ✅");
    await loadInboxTickets();
  } catch (e) {
    toast($("#inboxMsg"), e.message, "error");
  }
}

/* =========================
   ASSIGN USERS (ADMIN ONLY)
========================= */
// eslint-disable-next-line no-undef
async function loadAssignUsers() {
  if (!isAdmin()) {
    // hide assign UI if agent
    const sel = $("#assignUserSelect");
    if (sel) sel.innerHTML = `<option value="">Välj agent...</option>`;
    return;
  }

  try {
    const users = await apiFetch("/admin/users");
    const sel = $("#assignUserSelect");
    if (!sel) return;

    const agents = (users || []).filter((u) => u.role === "agent" || u.role === "admin");
    sel.innerHTML = `<option value="">Välj agent...</option>`;
    for (const u of agents) {
      const opt = document.createElement("option");
      opt.value = String(u._id);
      opt.textContent = `${u.username} (${u.role})`;
      sel.appendChild(opt);
    }
  } catch (e) {
    console.warn("assign users fail:", e.message);
  }
}

// eslint-disable-next-line no-undef
async function assignTicketToUser() {
  if (!isAdmin()) return toast($("#inboxTicketMsg"), "Assign kräver admin.", "error");
  const ticketId = state.inbox.selectedId;
  const userId = ($("#assignUserSelect")?.value || "").trim();
  if (!ticketId) return;
  if (!userId) return toast($("#inboxTicketMsg"), "Välj en agent.", "error");

  try {
    await apiFetch(`/admin/tickets/${ticketId}/assign`, { method: "POST", body: { userId } });
    toast($("#inboxTicketMsg"), "Ticket assignad ✅");
    await loadInboxTickets();
    await openInboxTicket(ticketId);
  } catch (e) {
    toast($("#inboxTicketMsg"), e.message, "error");
  }
}

/* =========================
   ✅ INBOX NOTIFY POLLING (FIX 500)
   - If backend returns 500 => do NOT spam console
========================= */
// eslint-disable-next-line no-undef
async function refreshNotify() {
  if (!isLoggedIn() || !isAgentOrAdmin()) return;

  const dot = $("#inboxNotifDot");
  const btn = $("#openInboxView");

  try {
    const data = await apiFetch("/admin/tickets/notify");

    const count = Number(data?.unreadCount || 0);
    state.inbox.unreadCount = count;

    // highlight inbox if unread
    if (count > 0) {
      show(dot);
      btn?.classList.add("hasNotif");
    } else {
      hide(dot);
      btn?.classList.remove("hasNotif");
    }

    // also highlight category select (optional)
    const cs = $("#categorySelect");
    if (cs) {
      if (count > 0) cs.classList.add("categoryNotif");
      else cs.classList.remove("categoryNotif");
    }

    state.inbox.lastUnreadCount = count;
  } catch (e) {
    // ✅ swallow notify errors (prevents "500 spam")
    hide(dot);
    btn?.classList.remove("hasNotif");
    // no toast here, just debug silently
    if (state.debug) console.warn("notify error:", e.message);
  }
}

/* =========================
   SLA DASHBOARD
========================= */
// eslint-disable-next-line no-undef
function prettyMs(ms) {
  if (ms == null || ms === "" || !Number.isFinite(ms)) return "-";
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

// eslint-disable-next-line no-undef
function pct(v) {
  if (v == null) return "-";
  return `${clamp(Number(v), 0, 100)}%`;
}

// eslint-disable-next-line no-undef
function kpiCard(label, value, sub = "", delta = null) {
  const deltaHtml =
    delta && delta.type
      ? `<div class="kpiDelta ${escapeHtml(delta.type)}">
          <i class="fa-solid ${delta.type === "up" ? "fa-arrow-trend-up" : "fa-arrow-trend-down"}"></i>
          <span>${escapeHtml(delta.text || "")}</span>
        </div>`
      : "";

  return `
    <div class="slaCard">
      <div class="slaLabel">${escapeHtml(label)}</div>
      <div class="slaValue">${escapeHtml(value)}</div>
      <div class="slaSubValue">${escapeHtml(sub)}</div>
      ${deltaHtml}
    </div>
  `;
}

// eslint-disable-next-line no-undef
async function loadSlaAll() {
  if (!isLoggedIn() || !isAgentOrAdmin()) return;

  state.sla.days = Number($("#slaDaysSelect")?.value || 30);
  state.sla.compareMode = $("#slaCompareMode")?.value || "none";

  await Promise.all([loadSlaOverview(), loadSlaAgents(), loadSlaTickets(), loadSlaTrend()]);
}

// eslint-disable-next-line no-undef
async function loadSlaOverview() {
  try {
    const data = await apiFetch(`/admin/sla/overview?days=${encodeURIComponent(state.sla.days)}`);
    state.sla.overview = data;
    renderSlaOverview();
  } catch (e) {
    console.warn("sla overview fail:", e.message);
    $("#slaOverviewBox").innerHTML = `<div class="alert error">SLA overview: ${escapeHtml(e.message)}</div>`;
  }
}

// eslint-disable-next-line no-undef
function renderSlaOverview() {
  const box = $("#slaOverviewBox");
  const d = state.sla.overview;
  if (!box) return;

  if (!d) {
    box.innerHTML = `<div class="muted small">Ingen data ännu.</div>`;
    return;
  }

  const first = d.firstResponse || {};
  const res = d.resolution || {};

  const gridWide = `
    <div class="slaGrid kpiWide">
      ${kpiCard("Tickets", String(d.totalTickets || 0), `${state.sla.days} dagar`)}
      ${kpiCard("First compliance", pct(first.compliancePct), `Breaches: ${first.breaches ?? 0} • Risk: ${first.atRisk ?? 0}`)}
      ${kpiCard("Resolution compliance", pct(res.compliancePct), `Breaches: ${res.breaches ?? 0} • Risk: ${res.atRisk ?? 0}`)}
      ${kpiCard("Prioritet (H/N/L)", `${d.byPriority?.high || 0}/${d.byPriority?.normal || 0}/${d.byPriority?.low || 0}`, "Fördelning")}
    </div>
  `;

  const dist = `
    <div class="divider"></div>
    <div class="slaGrid">
      ${kpiCard("First avg", prettyMs(first.avgMs), "Genomsnitt")}
      ${kpiCard("First median", prettyMs(first.medianMs), "Median")}
      ${kpiCard("First p90", prettyMs(first.p90Ms), "90-percentil")}
    </div>

    <div class="divider"></div>
    <div class="slaGrid">
      ${kpiCard("Res avg", prettyMs(res.avgMs), "Genomsnitt")}
      ${kpiCard("Res median", prettyMs(res.medianMs), "Median")}
      ${kpiCard("Res p90", prettyMs(res.p90Ms), "90-percentil")}
    </div>
  `;

  box.innerHTML = gridWide + dist;
}

// eslint-disable-next-line no-undef
async function loadSlaTrend() {
  try {
    const data = await apiFetch(`/admin/sla/trend/weekly?days=${encodeURIComponent(state.sla.days)}`);
    const rows = data?.rows || [];

    renderSlaTrendChart(rows);
  } catch (e) {
    $("#slaTrendHint").textContent = `Trend: ${e.message}`;
  }
}

// eslint-disable-next-line no-undef
function renderSlaTrendChart(rows) {
  const hint = $("#slaTrendHint");
  const canvas = $("#slaTrendChart");
  if (!canvas) return;

  const labels = rows.map((r) => r.week);
  const first = rows.map((r) => Number(r.firstCompliancePct || 0));
  const res = rows.map((r) => Number(r.resolutionCompliancePct || 0));

  setText(hint, `Visar ${rows.length} datapunkter.`);

  // Chart.js
  if (state.sla.chart) {
    state.sla.chart.destroy();
    state.sla.chart = null;
  }

  // eslint-disable-next-line no-undef
  state.sla.chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "First compliance %",
          data: first,
          tension: 0.35,
        },
        {
          label: "Resolution compliance %",
          data: res,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: { enabled: true },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { callback: (v) => `${v}%` },
        },
      },
    },
  });
}

// eslint-disable-next-line no-undef
async function loadSlaAgents() {
  const box = $("#slaAgentsBox");
  try {
    const data = await apiFetch(`/admin/sla/agents?days=${encodeURIComponent(state.sla.days)}`);
    const rows = data?.rows || [];
    state.sla.agents = rows;

    if (!rows.length) {
      box.innerHTML = `<div class="muted small">Inga agents-data ännu.</div>`;
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
              <th>First OK%</th>
              <th>Res OK%</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((r) => {
                const risk = (r.firstRisk || 0) + (r.resRisk || 0);
                return `
                  <tr>
                    <td>${escapeHtml(r.username)} <span class="pill admin">${escapeHtml(r.role)}</span></td>
                    <td>${escapeHtml(String(r.tickets || 0))}</td>
                    <td>${escapeHtml(String(r.open || 0))}</td>
                    <td>${escapeHtml(String(r.pending || 0))}</td>
                    <td>${escapeHtml(String(r.solved || 0))}</td>
                    <td>${escapeHtml(pct(r.firstResponse?.compliancePct))}</td>
                    <td>${escapeHtml(pct(r.resolution?.compliancePct))}</td>
                    <td>${risk > 0 ? `<span class="pill warn">${risk}</span>` : `<span class="pill ok">0</span>`}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<div class="alert error">Agents: ${escapeHtml(e.message)}</div>`;
  }
}

// eslint-disable-next-line no-undef
async function loadSlaTickets() {
  const box = $("#slaTicketsBox");
  try {
    const data = await apiFetch(`/admin/sla/tickets?days=${encodeURIComponent(state.sla.days)}`);
    const rows = data?.rows || [];
    state.sla.tickets = rows;

    renderSlaTickets(rows);
  } catch (e) {
    box.innerHTML = `<div class="alert error">Tickets: ${escapeHtml(e.message)}</div>`;
  }
}

// eslint-disable-next-line no-undef
function renderSlaTickets(rows) {
  const box = $("#slaTicketsBox");
  if (!box) return;

  // filters
  const breachedFilter = $("#slaBreachedFilter")?.value || "all";
  const breachType = $("#slaBreachTypeFilter")?.value || "any";
  const sortMode = $("#slaSortTickets")?.value || "newest";

  let r = rows.slice();

  if (breachedFilter === "breachedOnly") {
    r = r.filter((x) => x?.sla?.breachedFirstResponse || x?.sla?.breachedResolution);
  }
  if (breachedFilter === "okOnly") {
    r = r.filter((x) => !x?.sla?.breachedFirstResponse && !x?.sla?.breachedResolution);
  }

  if (breachType === "first") r = r.filter((x) => !!x?.sla?.breachedFirstResponse);
  if (breachType === "resolution") r = r.filter((x) => !!x?.sla?.breachedResolution);

  if (sortMode === "newest") r.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sortMode === "oldest") r.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (sortMode === "worstFirst") {
    r.sort((a, b) => {
      const aa = Number(a?.sla?.effectiveRunningMs || 0);
      const bb = Number(b?.sla?.effectiveRunningMs || 0);
      return bb - aa;
    });
  }

  if (!r.length) {
    box.innerHTML = `<div class="muted small">Inga tickets matchar filtren.</div>`;
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
            <th>First</th>
            <th>Resolution</th>
            <th>Pending</th>
            <th>Skapad</th>
          </tr>
        </thead>
        <tbody>
          ${r
            .map((x) => {
              const sla = x.sla || {};
              const f = sla.pretty?.firstResponse || "-";
              const rr = sla.pretty?.effectiveRunning || "-";
              const pend = sla.pretty?.pendingTotal || "-";

              const firstPill = sla.breachedFirstResponse
                ? `<span class="pill danger">BREACH</span>`
                : sla.firstResponseState === "at_risk"
                ? `<span class="pill warn">RISK</span>`
                : `<span class="pill ok">OK</span>`;

              const resPill = sla.breachedResolution
                ? `<span class="pill danger">BREACH</span>`
                : sla.resolutionState === "at_risk"
                ? `<span class="pill warn">RISK</span>`
                : `<span class="pill ok">OK</span>`;

              return `
                <tr>
                  <td><b>${escapeHtml(String(x.ticketId || ""))}</b></td>
                  <td>${escapeHtml(x.companyId || "")}</td>
                  <td>${escapeHtml(x.status || "")}</td>
                  <td>${escapeHtml(x.priority || "")}</td>
                  <td>${escapeHtml(f)} ${firstPill}</td>
                  <td>${escapeHtml(rr)} ${resPill}</td>
                  <td>${escapeHtml(pend)}</td>
                  <td>${escapeHtml(new Date(x.createdAt).toLocaleString("sv-SE"))}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* =========================
   SLA EXPORT + CLEAR
========================= */
// eslint-disable-next-line no-undef
async function slaExportCsv() {
  try {
    // open in new tab so token auth does not apply (backend requires auth)
    // we do a fetch to get blob with auth.
    const data = await fetch(`/admin/sla/export.csv?days=${encodeURIComponent(state.sla.days)}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });

    if (!data.ok) {
      let j = null;
      try {
        j = await data.json();
      } catch {}
      throw new Error(j?.error || `HTTP ${data.status}`);
    }

    const blob = await data.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sla_export_${state.sla.days}d.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    toast($("#slaTrendHint"), `Export: ${e.message}`, "error");
  }
}

// eslint-disable-next-line no-undef
async function slaClearMyStats() {
  if (!confirm("Radera din SLA-statistik?")) return;
  try {
    const data = await apiFetch("/admin/sla/clear/my", { method: "DELETE" });
    toast($("#slaTrendHint"), data?.message || "Raderat ✅");
    await loadSlaAll();
  } catch (e) {
    toast($("#slaTrendHint"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function slaClearAllStats() {
  if (!isAdmin()) return toast($("#slaTrendHint"), "Endast admin kan rensa ALLT.", "error");
  if (!confirm("Radera ALL SLA-statistik?")) return;
  try {
    const data = await apiFetch("/admin/sla/clear/all", { method: "DELETE" });
    toast($("#slaTrendHint"), data?.message || "Raderat ✅");
    await loadSlaAll();
  } catch (e) {
    toast($("#slaTrendHint"), e.message, "error");
  }
}

/* =========================
   ADMIN USERS
========================= */
// eslint-disable-next-line no-undef
async function loadAdminUsers() {
  if (!isAdmin()) return;

  const msg = $("#adminUsersMsg");
  const box = $("#adminUsersList");
  try {
    hide(msg);
    const users = await apiFetch("/admin/users");
    renderAdminUsers(users || []);
  } catch (e) {
    toast(msg, e.message, "error");
    box.innerHTML = "";
  }
}

// eslint-disable-next-line no-undef
function renderAdminUsers(users) {
  const box = $("#adminUsersList");
  if (!box) return;

  if (!users.length) {
    box.innerHTML = `<div class="muted small">Inga users.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Roll</th>
            <th>Skapad</th>
            <th>Åtgärd</th>
          </tr>
        </thead>
        <tbody>
          ${users
            .map((u) => {
              const me = String(u._id) === String(state.user?.id || state.user?._id || "");
              return `
              <tr>
                <td><b>${escapeHtml(u.username)}</b><div class="muted small">${escapeHtml(String(u._id))}</div></td>
                <td>${escapeHtml(u.email || "")}</td>
                <td>
                  ${me ? `<span class="pill admin">${escapeHtml(u.role)}</span>` : roleSelectHtml(u)}
                </td>
                <td>${u.createdAt ? escapeHtml(new Date(u.createdAt).toLocaleString("sv-SE")) : ""}</td>
                <td>
                  ${me ? `<span class="muted small">Du</span>` : `<button class="btn danger small" data-del="${escapeHtml(String(u._id))}"><i class="fa-solid fa-trash"></i> Ta bort</button>`}
                </td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  // bind role change + delete
  box.querySelectorAll("select[data-role]").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const userId = e.target.getAttribute("data-role");
      const role = e.target.value;
      try {
        const data = await apiFetch(`/admin/users/${userId}/role`, { method: "POST", body: { role } });
        toast($("#adminUsersMsg"), data?.message || "Uppdaterat ✅");
        await loadAdminUsers();
      } catch (err) {
        toast($("#adminUsersMsg"), err.message, "error");
      }
    });
  });

  box.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-del");
      if (!confirm("Ta bort användare?")) return;

      try {
        const data = await apiFetch(`/admin/users/${userId}`, { method: "DELETE" });
        toast($("#adminUsersMsg"), data?.message || "Borttagen ✅");
        await loadAdminUsers();
      } catch (err) {
        toast($("#adminUsersMsg"), err.message, "error");
      }
    });
  });
}

// eslint-disable-next-line no-undef
function roleSelectHtml(u) {
  const roles = ["user", "agent", "admin"];
  return `
    <select class="input smallInput" data-role="${escapeHtml(String(u._id))}">
      ${roles
        .map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>`)
        .join("")}
    </select>
  `;
}

/* =========================
   ADMIN EXPORT BUTTONS
========================= */
// eslint-disable-next-line no-undef
async function adminExportAll() {
  if (!isAdmin()) return;
  try {
    const res = await fetch("/admin/export/all", { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `export_all_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    toast($("#adminUsersMsg"), `Export fail: ${e.message}`, "error");
  }
}

// eslint-disable-next-line no-undef
async function adminTrainingExport() {
  if (!isAdmin()) return;
  try {
    const res = await fetch("/admin/export/training", { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `training_export_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    toast($("#adminUsersMsg"), `Training export fail: ${e.message}`, "error");
  }
}

/* =========================
   ADMIN: KB LIST + UPLOAD
========================= */
// eslint-disable-next-line no-undef
async function loadKbList() {
  if (!isAdmin()) return;

  const companyId = ($("#kbCategorySelect")?.value || state.companyId || "demo").trim();
  const msg = $("#kbMsg");
  const box = $("#kbList");

  try {
    hide(msg);
    const items = await apiFetch(`/kb/list/${encodeURIComponent(companyId)}`);
    renderKbList(items || []);
  } catch (e) {
    toast(msg, e.message, "error");
    box.innerHTML = "";
  }
}

// eslint-disable-next-line no-undef
function renderKbList(items) {
  const box = $("#kbList");
  if (!box) return;

  if (!items.length) {
    box.innerHTML = `<div class="muted small">Ingen KB-data ännu.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="tableWrap">
      <table class="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Ref</th>
            <th>Chunk</th>
            <th>Skapad</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((x) => {
              return `
              <tr>
                <td><b>${escapeHtml(x.title || "")}</b></td>
                <td>${escapeHtml(x.sourceType || "")}</td>
                <td class="muted small">${escapeHtml(x.sourceRef || "")}</td>
                <td>${escapeHtml(String(x.chunkIndex ?? ""))}</td>
                <td>${x.createdAt ? escapeHtml(new Date(x.createdAt).toLocaleString("sv-SE")) : ""}</td>
              </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

// eslint-disable-next-line no-undef
async function kbUploadText() {
  if (!isAdmin()) return;
  const companyId = ($("#kbCategorySelect")?.value || state.companyId || "demo").trim();
  const title = ($("#kbTextTitle")?.value || "").trim();
  const content = ($("#kbTextContent")?.value || "").trim();
  const msg = $("#kbMsg");

  if (!content) return toast(msg, "Ingen text.", "error");

  try {
    const data = await apiFetch("/kb/upload-text", { method: "POST", body: { companyId, title, content } });
    toast(msg, data?.message || "Uppladdat ✅");
    $("#kbTextContent").value = "";
    await loadKbList();
  } catch (e) {
    toast(msg, e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function kbUploadUrl() {
  if (!isAdmin()) return;
  const companyId = ($("#kbCategorySelect")?.value || state.companyId || "demo").trim();
  const url = ($("#kbUrlInput")?.value || "").trim();
  const msg = $("#kbMsg");

  if (!url) return toast(msg, "Ingen URL.", "error");

  try {
    const data = await apiFetch("/kb/upload-url", { method: "POST", body: { companyId, url } });
    toast(msg, data?.message || "Uppladdat ✅");
    $("#kbUrlInput").value = "";
    await loadKbList();
  } catch (e) {
    toast(msg, e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function kbUploadPdf() {
  if (!isAdmin()) return;
  const companyId = ($("#kbCategorySelect")?.value || state.companyId || "demo").trim();
  const file = $("#kbPdfFile")?.files?.[0];
  const msg = $("#kbMsg");

  if (!file) return toast(msg, "Välj en PDF.", "error");

  try {
    const base64 = await fileToBase64(file);
    const data = await apiFetch("/kb/upload-pdf", {
      method: "POST",
      body: { companyId, filename: file.name, base64 },
    });

    toast(msg, data?.message || "Uppladdat ✅");
    $("#kbPdfFile").value = "";
    await loadKbList();
  } catch (e) {
    toast(msg, e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function kbExport() {
  if (!isAdmin()) return;
  const companyId = ($("#kbCategorySelect")?.value || state.companyId || "demo").trim();
  try {
    const res = await fetch(`/export/kb/${encodeURIComponent(companyId)}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kb_${companyId}_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    toast($("#kbMsg"), e.message, "error");
  }
}

// eslint-disable-next-line no-undef
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const base64 = s.includes(",") ? s.split(",")[1] : s;
      resolve(base64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* =========================
   ADMIN: CATEGORIES (EDIT)
========================= */
// eslint-disable-next-line no-undef
async function loadCatsAdmin() {
  if (!isAdmin()) return;
  const msg = $("#catsMsg");
  try {
    hide(msg);
    await loadCategories();
    renderCatsListAdmin();
  } catch (e) {
    toast(msg, e.message, "error");
  }
}

// eslint-disable-next-line no-undef
function renderCatsListAdmin() {
  const list = $("#catsList");
  if (!list) return;

  const cats = state.categories || [];
  if (!cats.length) {
    list.innerHTML = `<div class="muted small">Inga kategorier.</div>`;
    return;
  }

  list.innerHTML = cats
    .map((c) => {
      return `
      <div class="listItem" style="cursor:default;">
        <div class="listItemTitle">
          <b>${escapeHtml(c.key)}</b>
          <span class="pill">${escapeHtml(c.name || "")}</span>
        </div>
        <div class="muted small" style="margin-top:6px;">Prompt:</div>
        <div class="muted small" style="white-space:pre-wrap;">${escapeHtml(c.systemPrompt || "")}</div>

        <div class="divider"></div>
        <div class="grid2">
          <div>
            <label>Namn</label>
            <input class="input" data-catname="${escapeHtml(c.key)}" value="${escapeHtml(c.name || "")}" />
          </div>
          <div>
            <label>System Prompt</label>
            <textarea class="input textarea" data-catprompt="${escapeHtml(c.key)}">${escapeHtml(c.systemPrompt || "")}</textarea>
          </div>
        </div>

        <button class="btn secondary full" style="margin-top:10px;" data-catsave="${escapeHtml(c.key)}">
          <i class="fa-solid fa-floppy-disk"></i> Spara ändringar
        </button>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll("button[data-catsave]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-catsave");
      const name = list.querySelector(`input[data-catname="${CSS.escape(key)}"]`)?.value || "";
      const systemPrompt = list.querySelector(`textarea[data-catprompt="${CSS.escape(key)}"]`)?.value || "";
      await saveCategoryEdit(key, name, systemPrompt);
    });
  });
}

// eslint-disable-next-line no-undef
async function saveCategoryEdit(key, name, systemPrompt) {
  const msg = $("#catsMsg");
  try {
    const data = await apiFetch(`/admin/categories/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { name, systemPrompt },
    });
    toast(msg, data?.message || "Sparat ✅");
    await loadCategories();
    renderCatsListAdmin();
  } catch (e) {
    toast(msg, e.message, "error");
  }
}

// eslint-disable-next-line no-undef
async function createCategoryAdmin() {
  const key = ($("#newCatKey")?.value || "").trim();
  const name = ($("#newCatName")?.value || "").trim();
  const systemPrompt = ($("#newCatPrompt")?.value || "").trim();
  const msg = $("#catsMsg");

  if (!key || !name) return toast(msg, "Key + namn krävs.", "error");

  try {
    const data = await apiFetch("/admin/categories", { method: "POST", body: { key, name, systemPrompt } });
    toast(msg, data?.message || "Skapad ✅");
    $("#newCatKey").value = "";
    $("#newCatName").value = "";
    $("#newCatPrompt").value = "";
    await loadCatsAdmin();
  } catch (e) {
    toast(msg, e.message, "error");
  }
}

/* =========================
   BIND EVENTS (DEL 2)
========================= */
(function bindDel2() {
  // Inbox actions
  $("#inboxRefreshBtn")?.addEventListener("click", loadInboxTickets);
  $("#setStatusOpen")?.addEventListener("click", () => inboxSetStatus("open"));
  $("#setStatusPending")?.addEventListener("click", () => inboxSetStatus("pending"));
  $("#setStatusSolved")?.addEventListener("click", () => inboxSetStatus("solved"));

  $("#setPriorityBtn")?.addEventListener("click", () => {
    const p = $("#ticketPrioritySelect")?.value || "normal";
    inboxSetPriority(p);
  });

  $("#sendAgentReplyInboxBtn")?.addEventListener("click", sendAgentReplyInbox);

  $("#saveInternalNoteBtn")?.addEventListener("click", saveInternalNote);
  $("#clearInternalNotesBtn")?.addEventListener("click", clearInternalNotes);

  $("#assignTicketBtn")?.addEventListener("click", assignTicketToUser);

  $("#deleteTicketBtn")?.addEventListener("click", deleteInboxTicket);

  $("#solveAllBtn")?.addEventListener("click", solveAllTickets);
  $("#removeSolvedBtn")?.addEventListener("click", removeSolvedTickets);

  // Inbox filters
  $("#inboxStatusFilter")?.addEventListener("change", loadInboxTickets);
  $("#inboxCategoryFilter")?.addEventListener("change", loadInboxTickets);
  $("#inboxSearchInput")?.addEventListener("input", () => {
    // debounce-like
    clearTimeout(bindDel2._t);
    bindDel2._t = setTimeout(loadInboxTickets, 220);
  });

  // SLA
  $("#slaRefreshBtn")?.addEventListener("click", loadSlaAll);
  $("#slaDaysSelect")?.addEventListener("change", loadSlaAll);
  $("#slaCompareMode")?.addEventListener("change", loadSlaAll);

  $("#slaBreachedFilter")?.addEventListener("change", () => renderSlaTickets(state.sla.tickets || []));
  $("#slaBreachTypeFilter")?.addEventListener("change", () => renderSlaTickets(state.sla.tickets || []));
  $("#slaSortTickets")?.addEventListener("change", () => renderSlaTickets(state.sla.tickets || []));

  $("#slaExportCsvBtn")?.addEventListener("click", slaExportCsv);
  $("#slaClearMyStatsBtn")?.addEventListener("click", slaClearMyStats);

  // show admin-only clear all
  if (typeof isAdmin === "function" && isAdmin()) show($("#slaClearAllStatsBtn"));
  $("#slaClearAllStatsBtn")?.addEventListener("click", slaClearAllStats);

  // Admin export buttons
  $("#adminExportAllBtn")?.addEventListener("click", adminExportAll);
  $("#trainingExportBtn")?.addEventListener("click", adminTrainingExport);

  // Admin KB
  $("#kbRefreshBtn")?.addEventListener("click", loadKbList);
  $("#kbExportBtn")?.addEventListener("click", kbExport);
  $("#kbUploadTextBtn")?.addEventListener("click", kbUploadText);
  $("#kbUploadUrlBtn")?.addEventListener("click", kbUploadUrl);
  $("#kbUploadPdfBtn")?.addEventListener("click", kbUploadPdf);

  $("#kbCategorySelect")?.addEventListener("change", loadKbList);

  // Admin cats
  $("#catsRefreshBtn")?.addEventListener("click", loadCatsAdmin);
  $("#createCatBtn")?.addEventListener("click", createCategoryAdmin);
})();

/* =========================================================
   ✅ END DEL 2/2
========================================================= */
