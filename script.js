/*************************************************
 * ✅ API endpoints
 *************************************************/
const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API_CHAT = `${API_BASE}/chat`;
const API_LOGIN = `${API_BASE}/login`;
const API_REGISTER = `${API_BASE}/register`;
const API_HISTORY = `${API_BASE}/history`;
const API_FEEDBACK = `${API_BASE}/feedback`;

const API_KB_TEXT = `${API_BASE}/kb/upload-text`;
const API_KB_URL = `${API_BASE}/kb/upload-url`;
const API_KB_PDF = `${API_BASE}/kb/upload-pdf`;
const API_KB_LIST = `${API_BASE}/kb/list`;
const API_KB_DELETE = `${API_BASE}/kb/item`;

const API_EXPORT_MY = `${API_BASE}/export/knowledgebase`;
const API_EXPORT_ALL = `${API_BASE}/admin/export/all`;

/*************************************************
 * ✅ companyId från URL (?company=law / tech / cleaning)
 *************************************************/
const urlParams = new URLSearchParams(window.location.search);
let companyId = urlParams.get("company") || "demo";

/*************************************************
 * ✅ Auth
 *************************************************/
let token = localStorage.getItem("token");
let userRole = localStorage.getItem("role") || null;

/*************************************************
 * ✅ UI helpers
 *************************************************/
function updateTitle() {
  const titleEl = document.querySelector("h2");
  if (!titleEl) return;

  const map = {
    law: "AI Kundtjänst – Juridik",
    tech: "AI Kundtjänst – Teknisk support",
    cleaning: "AI Kundtjänst – Städservice",
    demo: "AI Kundtjänst – Demo AB",
  };

  titleEl.innerText = map[companyId] || map.demo;
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

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
          <div class="content">${escapeHtml(msg.content)}</div>
        </div>`;
    } else if (msg.role === "assistant") {
      const safeContent = String(msg.content || "").replace(/'/g, "\\'");
      messagesDiv.innerHTML += `
        <div class="msg ai">
          <div class="avatar"><i class="fas fa-robot"></i></div>
          <div class="content">${escapeHtml(msg.content)}</div>
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

  messagesDiv.innerHTML += `
    <div class="msg user">
      <div class="avatar"><i class="fas fa-user"></i></div>
      <div class="content">${escapeHtml(text)}</div>
    </div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  input.value = "";

  showTypingIndicator();

  try {
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
          <div class="content">${escapeHtml(data.reply)}</div>
          <div class="feedback">
            <button onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
            <button onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
            <button onclick="copyToClipboard('${safeReply}')"><i class="fas fa-copy"></i></button>
          </div>
        </div>`;

      if (typeof data.ragUsed !== "undefined") {
        messagesDiv.innerHTML += `
          <div class="msg ai">
            <div class="avatar"><i class="fas fa-info-circle"></i></div>
            <div class="content"><small>RAG användes: <b>${data.ragUsed ? "JA ✅" : "NEJ ⚠️"}</b></small></div>
          </div>`;
      }

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
 * ✅ Logout
 *************************************************/
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  token = null;
  userRole = null;

  setLoggedInUI(false);
  showKbPanel(false);

  const messagesDiv = document.getElementById("messages");
  if (messagesDiv) messagesDiv.innerHTML = "";
}

/*************************************************
 * ✅ Category change
 *************************************************/
async function updateCategory() {
  const newParams = new URLSearchParams(window.location.search);
  const newCompanyId = newParams.get("company") || "demo";

  if (newCompanyId !== companyId) {
    companyId = newCompanyId;
    updateTitle();
    if (token) {
      await loadHistory();
      if (userRole === "admin") await loadKbList();
    }
  }
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

    userRole = data.user?.role || "user";
    localStorage.setItem("role", userRole);

    setLoggedInUI(true);
    await loadHistory();

    // ✅ Admin-only KB
    if (userRole === "admin") {
      ensureKbPanel();
      showKbPanel(true);
      await loadKbList();
    } else {
      showKbPanel(false);
    }
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
 * ✅ Knowledge Base UI (Admin-only)
 *************************************************/
function ensureKbPanel() {
  if (document.getElementById("kbPanel")) return;

  const container = document.querySelector(".container") || document.body;

  const panel = document.createElement("div");
  panel.id = "kbPanel";
  panel.className = "card";
  panel.style.display = "none";

  panel.innerHTML = `
    <h3 style="margin-top:0;">Admin: Kunskapsdatabas (kategori: ${companyId})</h3>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
      <button id="kbReloadBtn" class="btn secondary">🔄 Uppdatera</button>
      <button id="kbExportMyBtn" class="btn secondary">⬇️ Exportera min KB</button>
      <button id="kbExportAllBtn" class="btn danger">🛡️ Admin Export ALLT</button>
    </div>

    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
      <input id="kbUrlInput" placeholder="Klistra in URL..." />
      <button id="kbUploadUrlBtn" class="btn primary">Ladda upp URL</button>

      <textarea id="kbTextInput" rows="4" placeholder="Klistra in text..."></textarea>
      <button id="kbUploadTextBtn" class="btn primary">Ladda upp Text</button>

      <input id="kbPdfInput" type="file" accept="application/pdf" />
      <button id="kbUploadPdfBtn" class="btn primary">Ladda upp PDF</button>

      <div id="kbMsg" class="msgtext"></div>
    </div>

    <div>
      <h4 style="margin:6px 0;">Mina källor</h4>
      <div id="kbList" style="display:flex; flex-direction:column; gap:8px;"></div>
    </div>
  `;

  container.appendChild(panel);

  document.getElementById("kbReloadBtn")?.addEventListener("click", loadKbList);
  document.getElementById("kbExportMyBtn")?.addEventListener("click", exportMyKB);
  document.getElementById("kbExportAllBtn")?.addEventListener("click", exportAllAdmin);
  document.getElementById("kbUploadUrlBtn")?.addEventListener("click", uploadKbUrl);
  document.getElementById("kbUploadTextBtn")?.addEventListener("click", uploadKbText);
  document.getElementById("kbUploadPdfBtn")?.addEventListener("click", uploadKbPdf);
}

function showKbPanel(show) {
  const panel = document.getElementById("kbPanel");
  if (panel) panel.style.display = show ? "block" : "none";
}

async function loadKbList() {
  if (!token || userRole !== "admin") return;

  const kbList = document.getElementById("kbList");
  const kbMsg = document.getElementById("kbMsg");
  if (!kbList) return;

  kbList.innerHTML = "Laddar...";
  if (kbMsg) kbMsg.textContent = "";

  const res = await fetch(`${API_KB_LIST}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    kbList.innerHTML = "Kunde inte ladda KB.";
    return;
  }

  const items = await res.json();
  kbList.innerHTML = "";

  if (!items.length) {
    kbList.innerHTML = `<div style="opacity:0.8;">Inga källor ännu.</div>`;
    return;
  }

  for (const it of items) {
    kbList.innerHTML += `
      <div style="border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:10px;">
        <div><b>${escapeHtml(it.title || "Untitled")}</b></div>
        <div style="font-size:13px; opacity:0.9;">
          Typ: ${escapeHtml(it.sourceType)} • ${it.embeddingOk ? "✅ RAG-ready" : "⚠️ No embeddings"}
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn danger" onclick="deleteKbItem('${it._id}')">Ta bort</button>
        </div>
      </div>
    `;
  }
}

async function deleteKbItem(id) {
  if (!token || userRole !== "admin") return;
  await fetch(`${API_KB_DELETE}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await loadKbList();
}

async function uploadKbUrl() {
  if (!token || userRole !== "admin") return;

  const input = document.getElementById("kbUrlInput");
  const kbMsg = document.getElementById("kbMsg");
  if (!input) return;

  const url = input.value.trim();
  if (!url) return;

  kbMsg.textContent = "Laddar upp URL...";
  const res = await fetch(API_KB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, url }),
  });

  const data = await res.json();

  if (!res.ok) {
    kbMsg.textContent = `❌ ${data.error || "Fel vid URL-upload"}`;
  } else {
    kbMsg.textContent = `✅ ${data.message} (embeddingOk=${data.embeddingOk})`;
    input.value = "";
    await loadKbList();
  }
}

async function uploadKbText() {
  if (!token || userRole !== "admin") return;

  const input = document.getElementById("kbTextInput");
  const kbMsg = document.getElementById("kbMsg");
  if (!input) return;

  const content = input.value.trim();
  if (!content) return;

  kbMsg.textContent = "Laddar upp text...";
  const res = await fetch(API_KB_TEXT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, title: "Text", content }),
  });

  const data = await res.json();

  if (!res.ok) {
    kbMsg.textContent = `❌ ${data.error || "Fel vid text-upload"}`;
  } else {
    kbMsg.textContent = `✅ ${data.message} (embeddingOk=${data.embeddingOk})`;
    input.value = "";
    await loadKbList();
  }
}

async function uploadKbPdf() {
  if (!token || userRole !== "admin") return;

  const fileInput = document.getElementById("kbPdfInput");
  const kbMsg = document.getElementById("kbMsg");
  if (!fileInput || !fileInput.files?.length) return;

  const file = fileInput.files[0];
  kbMsg.textContent = "Laddar upp PDF...";

  const form = new FormData();
  form.append("pdf", file);
  form.append("companyId", companyId);

  const res = await fetch(API_KB_PDF, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json();

  if (!res.ok) {
    kbMsg.textContent = `❌ ${data.error || "Fel vid PDF-upload"}`;
  } else {
    kbMsg.textContent = `✅ ${data.message} (embeddingOk=${data.embeddingOk})`;
    fileInput.value = "";
    await loadKbList();
  }
}

async function exportMyKB() {
  if (!token || userRole !== "admin") return;
  window.location.href = API_EXPORT_MY;
}

async function exportAllAdmin() {
  if (!token || userRole !== "admin") return;

  const ok = confirm("Vill du ladda ner ALLT? (users + chats + KB + feedback + training)");
  if (!ok) return;

  window.location.href = API_EXPORT_ALL;
}

/*************************************************
 * ✅ Init
 *************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  updateTitle();
  setLoggedInUI(!!token);

  document.getElementById("sendBtn")?.addEventListener("click", sendMessage);
  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  document.getElementById("loginBtn")?.addEventListener("click", handleLogin);
  document.getElementById("registerBtn")?.addEventListener("click", handleRegister);

  document.getElementById("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  window.addEventListener("popstate", updateCategory);
  window.addEventListener("hashchange", updateCategory);

  if (token) {
    setLoggedInUI(true);
    await loadHistory();

    if (userRole === "admin") {
      ensureKbPanel();
      showKbPanel(true);
      await loadKbList();
    } else {
      showKbPanel(false);
    }
  } else {
    showKbPanel(false);
  }
});
