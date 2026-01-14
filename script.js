/*************************************************
 * ✅ API endpoints
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API_CHAT = `${API_BASE}/chat`;
const API_LOGIN = `${API_BASE}/login`;
const API_REGISTER = `${API_BASE}/register`;
const API_HISTORY = `${API_BASE}/history`;
const API_FEEDBACK = `${API_BASE}/feedback`;
const API_EXPORT_KB = `${API_BASE}/export/knowledgebase`;

/*************************************************
 * ✅ State
 *************************************************/
let companyId = "demo";
let token = localStorage.getItem("token");
let usernameSaved = localStorage.getItem("username") || "";

/*************************************************
 * ✅ Safe JSON fetch helper
 * Fixar "Unexpected token <" genom att läsa text först.
 *************************************************/
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // if server returned HTML etc
    throw new Error(`Servern svarade inte med JSON.\nURL: ${url}\nStatus: ${res.status}\nBody: ${text.slice(0, 120)}...`);
  }

  if (!res.ok) {
    const message = data?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data;
}

/*************************************************
 * ✅ UI helpers
 *************************************************/
function setLoggedInUI(isLoggedIn) {
  const auth = document.getElementById("auth");
  const chat = document.getElementById("chat");
  const logoutBtn = document.getElementById("logoutBtn");
  const userLabel = document.getElementById("userLabel");

  if (auth) auth.style.display = isLoggedIn ? "none" : "block";
  if (chat) chat.style.display = isLoggedIn ? "block" : "none";
  if (logoutBtn) logoutBtn.style.display = isLoggedIn ? "inline-flex" : "none";

  if (userLabel) {
    userLabel.style.display = isLoggedIn ? "block" : "none";
    userLabel.textContent = isLoggedIn ? `Inloggad som: ${usernameSaved}` : "";
  }
}

function updateTitle() {
  const titleEl = document.getElementById("pageTitle");
  const selectEl = document.getElementById("companySelect");

  const map = {
    demo: "AI Kundtjänst – Demo AB",
    tech: "AI Kundtjänst – Teknisk support",
    law: "AI Kundtjänst – Juridik",
    cleaning: "AI Kundtjänst – Städservice",
  };

  if (titleEl) titleEl.innerText = map[companyId] || map.demo;
  if (selectEl) selectEl.value = companyId;
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
 * ✅ Load history
 *************************************************/
async function loadHistory() {
  if (!token) return;

  const messages = await fetchJson(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

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

  // show user immediately
  messagesDiv.innerHTML += `
    <div class="msg user">
      <div class="avatar"><i class="fas fa-user"></i></div>
      <div class="content">${text}</div>
    </div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  input.value = "";

  showTypingIndicator();

  try {
    const history = await fetchJson(`${API_HISTORY}/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const conversation = history.map((m) => ({ role: m.role, content: m.content }));
    conversation.push({ role: "user", content: text });

    const data = await fetchJson(API_CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyId, conversation }),
    });

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
    }
  } catch (err) {
    console.error(err);
    removeTypingIndicator();
    messagesDiv.innerHTML += `
      <div class="msg ai">
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">Fel: ${err.message}</div>
      </div>`;
  }
}

/*************************************************
 * ✅ Feedback
 *************************************************/
async function giveFeedback(type) {
  if (!token) return;

  try {
    await fetchJson(API_FEEDBACK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type, companyId }),
    });

    alert(`Tack för feedback! (${type})`);
  } catch (err) {
    alert("Feedback gick inte att skicka: " + err.message);
  }
}

/*************************************************
 * ✅ Export chat (TXT)
 *************************************************/
async function exportChat() {
  if (!token) return;

  const messages = await fetchJson(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

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
 * ✅ Export knowledge base (JSON)
 *************************************************/
async function downloadKnowledgeBase() {
  if (!token) return;

  try {
    const res = await fetch(API_EXPORT_KB, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Export misslyckades (${res.status}) - ${text.slice(0, 80)}...`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `knowledge_base_${new Date().toISOString().split("T")[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Kunde inte ladda ner: " + err.message);
  }
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
 * ✅ Clear chat
 *************************************************/
async function clearChat() {
  if (!token) return;
  const ok = confirm("Vill du rensa chatthistoriken för denna kategori?");
  if (!ok) return;

  document.getElementById("messages").innerHTML = "";

  try {
    await fetchJson(`${API_HISTORY}/${companyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    alert("Kunde inte rensa DB: " + err.message);
  }
}

/*************************************************
 * ✅ Refresh category
 *************************************************/
async function refreshCategory() {
  updateTitle();
  if (token) await loadHistory();
}

/*************************************************
 * ✅ Logout
 *************************************************/
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  token = null;
  usernameSaved = "";
  setLoggedInUI(false);
  document.getElementById("messages").innerHTML = "";
}

/*************************************************
 * ✅ Auth actions
 *************************************************/
async function handleLogin() {
  const username = document.getElementById("username")?.value || "";
  const password = document.getElementById("password")?.value || "";
  const msg = document.getElementById("authMessage");

  try {
    const data = await fetchJson(API_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    localStorage.setItem("token", data.token);
    localStorage.setItem("username", username);

    token = data.token;
    usernameSaved = username;

    setLoggedInUI(true);
    updateTitle();
    await loadHistory();
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

async function handleRegister() {
  const username = document.getElementById("username")?.value || "";
  const password = document.getElementById("password")?.value || "";
  const msg = document.getElementById("authMessage");

  try {
    const data = await fetchJson(API_REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (msg) msg.textContent = data.message || "OK";
  } catch (err) {
    if (msg) msg.textContent = err.message;
  }
}

/*************************************************
 * ✅ Category dropdown change
 *************************************************/
async function onCompanyChange() {
  const selectEl = document.getElementById("companySelect");
  if (!selectEl) return;

  companyId = selectEl.value;
  updateTitle();

  if (token) await loadHistory();
}

/*************************************************
 * ✅ Init
 *************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) document.body.dataset.theme = savedTheme;

  const selectEl = document.getElementById("companySelect");
  if (selectEl) {
    companyId = selectEl.value || "demo";
    selectEl.addEventListener("change", onCompanyChange);
  }

  updateTitle();
  setLoggedInUI(!!token);

  document.getElementById("sendBtn")?.addEventListener("click", sendMessage);
  document.getElementById("exportChat")?.addEventListener("click", exportChat);
  document.getElementById("exportKnowledgeBtn")?.addEventListener("click", downloadKnowledgeBase);

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

  if (token) await loadHistory();
});
