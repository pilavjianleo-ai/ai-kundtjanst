/*************************************************
 * ✅ API endpoints
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API_CHAT = `${API_BASE}/chat`;
const API_LOGIN = `${API_BASE}/login`;
const API_REGISTER = `${API_BASE}/register`;
const API_HISTORY = `${API_BASE}/history`;
const API_FEEDBACK = `${API_BASE}/feedback`;

/*************************************************
 * ✅ companyId från URL (?company=law / tech / cleaning)
 *************************************************/
const urlParams = new URLSearchParams(window.location.search);
let companyId = urlParams.get("company") || "demo";

/*************************************************
 * ✅ Auth
 *************************************************/
let token = localStorage.getItem("token");

/*************************************************
 * ✅ UI helpers
 *************************************************/
function updateTitle() {
  const titleEl = document.querySelector("h2");
  const label = document.getElementById("companyLabel");

  const map = {
    law: "AI Kundtjänst – Juridik",
    tech: "AI Kundtjänst – Teknisk support",
    cleaning: "AI Kundtjänst – Städservice",
    demo: "AI Kundtjänst – Demo AB",
  };

  if (titleEl) titleEl.innerText = map[companyId] || map.demo;
  if (label) label.innerText = companyId;
}

function setLoggedInUI(isLoggedIn) {
  const auth = document.getElementById("auth");
  const chat = document.getElementById("chat");
  const logoutBtn = document.getElementById("logoutBtn");

  if (auth) auth.style.display = isLoggedIn ? "none" : "block";
  if (chat) chat.style.display = isLoggedIn ? "block" : "none";
  if (logoutBtn) logoutBtn.style.display = isLoggedIn ? "inline-flex" : "none";
}

function showTypingIndicator() {
  const messagesDiv = document.getElementById("messages");
  if (!messagesDiv) return;

  const existing = document.getElementById("typing");
  if (existing) existing.remove();

  const typing = document.createElement("div");
  typing.id = "typing";
  typing.className = "msg ai";
  typing.innerHTML = `
    <div class="avatar"><i class="fas fa-robot"></i></div>
    <div class="content">AI skriver…</div>
  `;
  messagesDiv.appendChild(typing);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
  const typing = document.getElementById("typing");
  if (typing) typing.remove();
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => alert("Text kopierad!"));
}

/*************************************************
 * ✅ Render messages
 *************************************************/
function renderMessages(messages) {
  const messagesDiv = document.getElementById("messages");
  if (!messagesDiv) return;

  messagesDiv.innerHTML = "";

  for (const msg of messages) {
    if (msg.role === "user") {
      messagesDiv.innerHTML += `
        <div class="msg user">
          <div class="avatar"><i class="fas fa-user"></i></div>
          <div class="content">${msg.content}</div>
        </div>`;
    } else if (msg.role === "assistant") {
      const safeContent = String(msg.content || "").replace(/'/g, "\\'");
      messagesDiv.innerHTML += `
        <div class="msg ai">
          <div class="avatar"><i class="fas fa-robot"></i></div>
          <div class="content">${msg.content}</div>
          <div class="feedback">
            <button onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
            <button onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
            <button onclick="copyToClipboard('${safeContent}')"><i class="fas fa-copy"></i></button>
          </div>
        </div>`;
    }
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/*************************************************
 * ✅ Fetch history
 *************************************************/
async function loadHistory() {
  if (!token) return;

  const res = await fetch(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return;
  const messages = await res.json();
  renderMessages(messages);
}

/*************************************************
 * ✅ Send message
 *************************************************/
async function sendMessage() {
  const input = document.getElementById("messageInput");
  const messagesDiv = document.getElementById("messages");
  if (!input || !messagesDiv) return;

  const text = input.value.trim();
  if (!text) return;

  // show user immediately in UI
  messagesDiv.innerHTML += `
    <div class="msg user">
      <div class="avatar"><i class="fas fa-user"></i></div>
      <div class="content">${text}</div>
    </div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  input.value = "";

  showTypingIndicator();

  try {
    // load existing conversation from DB
    const resHistory = await fetch(`${API_HISTORY}/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const history = resHistory.ok ? await resHistory.json() : [];

    const conversation = history.map((m) => ({ role: m.role, content: m.content }));
    conversation.push({ role: "user", content: text });

    const response = await fetch(API_CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyId, conversation }),
    });

    const data = await response.json();
    removeTypingIndicator();

    if (data.reply) {
      const safeReply = String(data.reply || "").replace(/'/g, "\\'");
      messagesDiv.innerHTML += `
        <div class="msg ai">
          <div class="avatar"><i class="fas fa-robot"></i></div>
          <div class="content">${data.reply}</div>
          <div class="feedback">
            <button onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
            <button onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
            <button onclick="copyToClipboard('${safeReply}')"><i class="fas fa-copy"></i></button>
          </div>
        </div>`;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else {
      messagesDiv.innerHTML += `
        <div class="msg ai">
          <div class="avatar"><i class="fas fa-robot"></i></div>
          <div class="content">AI: Något gick fel.</div>
        </div>`;
    }
  } catch (err) {
    console.error("Chat-fel:", err);
    removeTypingIndicator();
    messagesDiv.innerHTML += `
      <div class="msg ai">
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">AI: Tekniskt fel.</div>
      </div>`;
  }
}

/*************************************************
 * ✅ Feedback
 *************************************************/
async function giveFeedback(type) {
  if (!token) return;

  await fetch(API_FEEDBACK, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, companyId }),
  });

  alert(`Tack för feedback! (${type})`);
}

/*************************************************
 * ✅ Export chat
 *************************************************/
async function exportChat() {
  if (!token) return;

  const res = await fetch(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const messages = await res.json();

  let text = `Chatt-historik (${companyId})\n\n`;
  for (const m of messages) {
    const t = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";
    if (m.role === "user") text += `[${t}] Du: ${m.content}\n`;
    if (m.role === "assistant") text += `[${t}] AI: ${m.content}\n`;
  }

  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `chat_${companyId}_${new Date().toISOString().split("T")[0]}.txt`;
  a.click();

  URL.revokeObjectURL(url);
}

/*************************************************
 * ✅ Theme toggle
 *************************************************/
function toggleTheme() {
  const body = document.body;
  const icon = document.querySelector("#themeToggle i");
  if (!body || !icon) return;

  const current = body.dataset.theme || "dark";
  const next = current === "dark" ? "light" : "dark";

  body.dataset.theme = next;
  localStorage.setItem("theme", next);

  icon.className = next === "dark" ? "fas fa-moon" : "fas fa-sun";
}

/*************************************************
 * ✅ Clear chat (UI + DB)
 *************************************************/
async function clearChat() {
  if (!token) return;
  const ok = confirm("Vill du rensa chatthistoriken för denna kategori?");
  if (!ok) return;

  // UI
  const messagesDiv = document.getElementById("messages");
  if (messagesDiv) messagesDiv.innerHTML = "";

  // DB (kräver backend route)
  try {
    await fetch(`${API_HISTORY}/${companyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.warn("Kunde inte rensa DB (endpoints saknas?)", e);
  }
}

/*************************************************
 * ✅ Refresh category
 *************************************************/
async function refreshCategory() {
  const newParams = new URLSearchParams(window.location.search);
  companyId = newParams.get("company") || "demo";
  updateTitle();
  if (token) await loadHistory();
}

/*************************************************
 * ✅ Logout
 *************************************************/
function logout() {
  localStorage.removeItem("token");
  token = null;
  setLoggedInUI(false);

  const messagesDiv = document.getElementById("messages");
  if (messagesDiv) messagesDiv.innerHTML = "";
}

/*************************************************
 * ✅ Auth actions
 *************************************************/
async function handleLogin() {
  const username = document.getElementById("username")?.value;
  const password = document.getElementById("password")?.value;

  const res = await fetch(API_LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  const msg = document.getElementById("authMessage");

  if (data.token) {
    localStorage.setItem("token", data.token);
    token = data.token;

    setLoggedInUI(true);
    updateTitle();
    await loadHistory();
  } else {
    if (msg) msg.textContent = data.error || "Fel vid login.";
  }
}

async function handleRegister() {
  const username = document.getElementById("username")?.value;
  const password = document.getElementById("password")?.value;

  const res = await fetch(API_REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  const msg = document.getElementById("authMessage");
  if (msg) msg.textContent = data.message || data.error || "Ok";
}

/*************************************************
 * ✅ Init
 *************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  // restore theme
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.body.dataset.theme = savedTheme;

  updateTitle();
  setLoggedInUI(!!token);

  // events
  document.getElementById("sendBtn")?.addEventListener("click", sendMessage);
  document.getElementById("exportChat")?.addEventListener("click", exportChat);
  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  document.getElementById("clearChat")?.addEventListener("click", clearChat);
  document.getElementById("refreshCategory")?.addEventListener("click", refreshCategory);

  document.getElementById("loginBtn")?.addEventListener("click", handleLogin);
  document.getElementById("registerBtn")?.addEventListener("click", handleRegister);

  document.getElementById("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // load messages if logged in
  if (token) await loadHistory();
});
