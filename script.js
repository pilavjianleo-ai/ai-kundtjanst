/*************************************************
 * ✅ API base
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API = {
  ME: `${API_BASE}/me`,
  LOGIN: `${API_BASE}/login`,
  REGISTER: `${API_BASE}/register`,
  FORGOT: `${API_BASE}/auth/forgot-password`,
  RESET: `${API_BASE}/auth/reset-password`,
  CHAT: `${API_BASE}/chat`,
};

let token = localStorage.getItem("token") || null;
let currentUser = null;
let companyId = "demo";
let ticketId = null;

/*************************************************
 * ✅ DOM helpers
 *************************************************/
const $ = (id) => document.getElementById(id);

function show(el, yes = true) {
  if (!el) return;
  el.style.display = yes ? "" : "none";
}

function setText(el, txt) {
  if (el) el.textContent = txt;
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
    .replaceAll(">", "&gt;");
}

/*************************************************
 * ✅ Theme
 *************************************************/
function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  body.setAttribute("data-theme", next);

  const icon = $("themeToggle")?.querySelector("i");
  if (icon) icon.className = next === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
}

/*************************************************
 * ✅ Title map
 *************************************************/
function titleForCompany(c) {
  const map = {
    demo: { title: "AI Kundtjänst – Demo AB", sub: "Ställ en fråga så hjälper jag dig direkt." },
    law: { title: "AI Kundtjänst – Juridik", sub: "Allmän vägledning (inte juridisk rådgivning)." },
    tech: { title: "AI Kundtjänst – Teknisk support", sub: "Felsökning och IT-hjälp." },
    cleaning: { title: "AI Kundtjänst – Städservice", sub: "Frågor om städ, tjänster, rutiner." }
  };
  return map[c] || map.demo;
}

function applyCompanyToUI() {
  const t = titleForCompany(companyId);
  setText($("chatTitle"), t.title);
  setText($("chatSubtitle"), t.sub);

  if ($("categorySelect")) $("categorySelect").value = companyId;
}

/*************************************************
 * ✅ Auth UI
 *************************************************/
function applyAuthUI() {
  const roleBadge = $("roleBadge");
  const logoutBtn = $("logoutBtn");

  if (!token || !currentUser) {
    show($("authView"), true);
    show($("forgotView"), false);
    show($("resetView"), false);
    show($("chatView"), false);

    setText(roleBadge, "Inte inloggad");
    show(logoutBtn, false);
  } else {
    show($("authView"), false);
    show($("forgotView"), false);
    show($("resetView"), false);
    show($("chatView"), true);

    setText(roleBadge, `${currentUser.username} • ${currentUser.role.toUpperCase()}`);
    show(logoutBtn, true);
  }
}

/*************************************************
 * ✅ Fetch /me
 *************************************************/
async function fetchMe() {
  if (!token) return null;

  const res = await fetch(API.ME, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    token = null;
    localStorage.removeItem("token");
    return null;
  }

  return await res.json();
}

/*************************************************
 * ✅ Chat rendering
 *************************************************/
function addMessage(role, content) {
  const messagesDiv = $("messages");
  if (!messagesDiv) return;

  const safe = escapeHtml(content);
  const isUser = role === "user";
  const icon = isUser ? "fa-user" : "fa-robot";

  const wrapper = document.createElement("div");
  wrapper.className = `msg ${isUser ? "user" : "ai"}`;

  wrapper.innerHTML = `
    <div class="avatar"><i class="fa-solid ${icon}"></i></div>
    <div>
      <div class="bubble">${safe}</div>
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

/*************************************************
 * ✅ Export / Clear
 *************************************************/
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

function clearChat() {
  if ($("messages")) $("messages").innerHTML = "";
}

/*************************************************
 * ✅ Send message
 *************************************************/
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

    const res = await fetch(API.CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ companyId, conversation, ticketId })
    });

    const data = await res.json();
    hideTyping();

    if (!res.ok) {
      addMessage("assistant", `Serverfel: ${data?.error || "Okänt fel"}`);
      return;
    }

    ticketId = data.ticketId || ticketId;
    addMessage("assistant", data.reply || "Inget svar.");

  } catch (e) {
    hideTyping();
    addMessage("assistant", "Tekniskt fel. Försök igen.");
    console.error(e);
  }
}

/*************************************************
 * ✅ Category
 *************************************************/
function setCompanyFromSelect(value) {
  companyId = value || "demo";
  applyCompanyToUI();

  ticketId = null;
  clearChat();
  addMessage("assistant", `Du bytte kategori till "${companyId}". Vad vill du fråga?`);
}

/*************************************************
 * ✅ Auth actions
 *************************************************/
async function login() {
  const username = $("username")?.value?.trim();
  const password = $("password")?.value?.trim();

  setAlert($("authMessage"), "");
  if (!username || !password) {
    setAlert($("authMessage"), "Fyll i både användarnamn och lösenord.", true);
    return;
  }

  try {
    const res = await fetch(API.LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      setAlert($("authMessage"), data?.error || "Login misslyckades", true);
      return;
    }

    token = data.token;
    localStorage.setItem("token", token);

    currentUser = await fetchMe();
    applyAuthUI();

    applyCompanyToUI();
    clearChat();
    addMessage("assistant", "Välkommen! Vad kan jag hjälpa dig med?");
  } catch (e) {
    setAlert($("authMessage"), "Serverfel vid login", true);
  }
}

async function register() {
  const username = $("username")?.value?.trim();
  const email = $("email")?.value?.trim();
  const password = $("password")?.value?.trim();

  setAlert($("authMessage"), "");
  if (!username || !email || !password) {
    setAlert($("authMessage"), "Fyll i användarnamn, email och lösenord.", true);
    return;
  }

  try {
    const res = await fetch(API.REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      setAlert($("authMessage"), data?.error || "Registrering misslyckades", true);
      return;
    }

    setAlert($("authMessage"), "Registrering klar ✅ Logga in nu.");
  } catch (e) {
    setAlert($("authMessage"), "Serverfel vid registrering", true);
  }
}

function logout() {
  localStorage.removeItem("token");
  token = null;
  currentUser = null;
  ticketId = null;
  clearChat();
  applyAuthUI();
}

/*************************************************
 * ✅ Forgot / Reset password
 *************************************************/
async function openForgot() {
  show($("authView"), false);
  show($("forgotView"), true);
  show($("resetView"), false);
  show($("chatView"), false);
  setAlert($("forgotMessage"), "");
}

function backToLogin() {
  show($("authView"), true);
  show($("forgotView"), false);
  show($("resetView"), false);
  show($("chatView"), false);
}

async function sendResetLink() {
  const username = $("forgotUsername")?.value?.trim();
  if (!username) {
    setAlert($("forgotMessage"), "Skriv ditt användarnamn.", true);
    return;
  }

  setAlert($("forgotMessage"), "Skickar...", false);

  try {
    const res = await fetch(API.FORGOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    const data = await res.json();

    if (!res.ok) {
      setAlert($("forgotMessage"), data?.error || "Kunde inte skicka länk.", true);
      return;
    }

    setAlert($("forgotMessage"), data.message || "Länk skickad ✅");
  } catch (e) {
    setAlert($("forgotMessage"), "Serverfel vid återställning.", true);
  }
}

function openResetUI(token) {
  show($("authView"), false);
  show($("forgotView"), false);
  show($("resetView"), true);
  show($("chatView"), false);

  window.__resetToken = token;
  setAlert($("resetMessage"), "");
}

async function resetPasswordSubmit() {
  const newPassword = $("resetPassword")?.value?.trim();
  const resetToken = window.__resetToken;

  if (!resetToken) {
    setAlert($("resetMessage"), "Reset-token saknas.", true);
    return;
  }

  if (!newPassword || newPassword.length < 6) {
    setAlert($("resetMessage"), "Lösenord måste vara minst 6 tecken.", true);
    return;
  }

  setAlert($("resetMessage"), "Sparar...", false);

  try {
    const res = await fetch(API.RESET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, newPassword })
    });

    const data = await res.json();

    if (!res.ok) {
      setAlert($("resetMessage"), data?.error || "Kunde inte spara lösenord.", true);
      return;
    }

    setAlert($("resetMessage"), data.message || "Lösenord uppdaterat ✅");
    setTimeout(() => {
      // rensa token från url
      const url = new URL(window.location.href);
      url.searchParams.delete("resetToken");
      window.history.replaceState({}, "", url.toString());
      backToLogin();
    }, 1200);
  } catch (e) {
    setAlert($("resetMessage"), "Serverfel vid reset.", true);
  }
}

/*************************************************
 * ✅ Toggle password visibility
 *************************************************/
function togglePassword(inputId, iconBtnId) {
  const input = $(inputId);
  const btn = $(iconBtnId);
  if (!input || !btn) return;

  const icon = btn.querySelector("i");

  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.className = "fa-solid fa-eye-slash";
  } else {
    input.type = "password";
    if (icon) icon.className = "fa-solid fa-eye";
  }
}

/*************************************************
 * ✅ Init
 *************************************************/
async function init() {
  // URL token -> show reset UI automatically
  const url = new URL(window.location.href);
  const resetToken = url.searchParams.get("resetToken");
  if (resetToken) {
    openResetUI(resetToken);
  }

  // If token exists, fetch /me
  if (token) currentUser = await fetchMe();

  applyAuthUI();
  applyCompanyToUI();

  // EVENTS
  $("themeToggle")?.addEventListener("click", toggleTheme);
  $("logoutBtn")?.addEventListener("click", logout);

  $("loginBtn")?.addEventListener("click", login);
  $("registerBtn")?.addEventListener("click", register);

  $("sendBtn")?.addEventListener("click", sendMessage);
  $("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  $("categorySelect")?.addEventListener("change", (e) => setCompanyFromSelect(e.target.value));
  $("exportChatBtn")?.addEventListener("click", exportChat);
  $("clearChatBtn")?.addEventListener("click", clearChat);

  $("togglePw")?.addEventListener("click", () => togglePassword("password", "togglePw"));
  $("toggleResetPw")?.addEventListener("click", () => togglePassword("resetPassword", "toggleResetPw"));

  $("openForgotBtn")?.addEventListener("click", openForgot);
  $("backToLoginBtn")?.addEventListener("click", backToLogin);
  $("sendResetBtn")?.addEventListener("click", sendResetLink);

  $("resetSubmitBtn")?.addEventListener("click", resetPasswordSubmit);
  $("resetCancelBtn")?.addEventListener("click", () => {
    const u = new URL(window.location.href);
    u.searchParams.delete("resetToken");
    window.history.replaceState({}, "", u.toString());
    backToLogin();
  });

  // show welcome if logged in
  if (token && currentUser && !resetToken) {
    clearChat();
    addMessage("assistant", "Välkommen tillbaka! Vad kan jag hjälpa dig med?");
  }
}

document.addEventListener("DOMContentLoaded", init);
