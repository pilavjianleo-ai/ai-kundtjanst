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

const API_EXPORT_KB_CATEGORY = `${API_BASE}/export/kb`;
const API_EXPORT_ALL = `${API_BASE}/admin/export/all`;

function getCompanyIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("company") || "demo";
}

function setCompanyIdInURL(newCompanyId) {
  const url = new URL(window.location.href);
  url.searchParams.set("company", newCompanyId);
  history.pushState({}, "", url.toString());
}

let companyId = getCompanyIdFromURL();
let token = localStorage.getItem("token");
let userRole = localStorage.getItem("role") || null;

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSubtitle(text) {
  const el = document.getElementById("subtitle");
  if (!el) return;
  el.textContent = text || "";
}

function updateTitle() {
  const titleEl = document.getElementById("title");
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

function showRagBadge(text, isGood) {
  const badge = document.getElementById("ragBadge");
  if (!badge) return;

  if (!text) {
    badge.style.display = "none";
    badge.innerHTML = "";
    return;
  }

  badge.style.display = "flex";
  badge.innerHTML = `
    <span class="dot ${isGood ? "good" : "warn"}"></span>
    <span>${escapeHtml(text)}</span>
  `;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    setSubtitle("✅ Kopierat!");
    setTimeout(() => setSubtitle(""), 1200);
  });
}

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
      const safeCopy = String(msg.content || "").replace(/'/g, "\\'");
      messagesDiv.innerHTML += `
        <div class="msg ai">
          <div class="avatar"><i class="fas fa-robot"></i></div>
          <div class="content">${escapeHtml(msg.content)}</div>

          <div class="feedback">
            <button class="miniBtn" onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
            <button class="miniBtn" onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
            <button class="miniBtn" onclick="copyToClipboard('${safeCopy}')"><i class="fas fa-copy"></i></button>
          </div>
        </div>`;
    }
  }

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function loadHistory() {
  if (!token) return;

  const res = await fetch(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return;
  const messages = await res.json();
  renderMessages(messages);
}

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
  showRagBadge("", false);

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

    if (!response.ok) {
      messagesDiv.innerHTML += `
        <div class="msg ai">
          <div class="avatar"><i class="fas fa-robot"></i></div>
          <div class="content">Serverfel: ${escapeHtml(data.error || "okänt fel")}</div>
        </div>`;
      return;
    }

    if (data.reply) {
      const safeReply = String(data.reply || "").replace(/'/g, "\\'");
      messagesDiv.innerHTML += `
        <div class="msg ai">
          <div class="avatar"><i class="fas fa-robot"></i></div>
          <div class="content">${escapeHtml(data.reply)}</div>

          <div class="feedback">
            <button class="miniBtn" onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
            <button class="miniBtn" onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
            <button class="miniBtn" onclick="copyToClipboard('${safeReply}')"><i class="fas fa-copy"></i></button>
          </div>
        </div>`;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    if (data.ragUsed === true) showRagBadge("RAG användes ✅ (kunskapsdatabas)", true);
    else showRagBadge("", false);

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

async function giveFeedback(type) {
  if (!token) return;

  await fetch(API_FEEDBACK, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, companyId }),
  });

  setSubtitle(`✅ Feedback skickad (${type})`);
  setTimeout(() => setSubtitle(""), 1200);
}

async function exportChat() {
  if (!token) return;

  const res = await fetch(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const messages = res.ok ? await res.json() : [];

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

function clearChat() {
  const messagesDiv = document.getElementById("messages");
  if (messagesDiv) messagesDiv.innerHTML = "";
  showRagBadge("", false);
  setSubtitle("🗑️ Rensad (endast UI)");
  setTimeout(() => setSubtitle(""), 1200);
}

function toggleTheme() {
  const body = document.body;
  const icon = document.querySelector("#themeToggle i");
  const current = body.getAttribute("data-theme") || "dark";

  if (current === "dark") {
    body.setAttribute("data-theme", "light");
    if (icon) icon.className = "fas fa-sun";
  } else {
    body.setAttribute("data-theme", "dark");
    if (icon) icon.className = "fas fa-moon";
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  token = null;
  userRole = null;

  setLoggedInUI(false);
  setKbButtonVisible(false);
  closeKbModal();

  const messagesDiv = document.getElementById("messages");
  if (messagesDiv) messagesDiv.innerHTML = "";

  setSubtitle("✅ Utloggad");
  setTimeout(() => setSubtitle(""), 1200);
}

/*************************************************
 * ✅ CATEGORY DROPDOWN
 *************************************************/
async function handleCompanyChange(newCompanyId) {
  companyId = newCompanyId;
  setCompanyIdInURL(companyId);

  updateTitle();
  showRagBadge("", false);

  if (token) {
    await loadHistory();
    if (userRole === "admin") await loadKbList();
  }

  setSubtitle(`✅ Bytte kategori: ${companyId}`);
  setTimeout(() => setSubtitle(""), 1000);
}

/*************************************************
 * ✅ KB MODAL (Admin only)
 *************************************************/
function setKbButtonVisible(show) {
  const btn = document.getElementById("kbOpenBtn");
  if (btn) btn.style.display = show ? "inline-flex" : "none";
}

function openKbModal() {
  const modal = document.getElementById("kbModal");
  if (modal) modal.style.display = "block";
  updateKbTitle();
  loadKbList();
}

function closeKbModal() {
  const modal = document.getElementById("kbModal");
  if (modal) modal.style.display = "none";
}

function updateKbTitle() {
  const title = document.getElementById("kbTitle");
  const sub = document.getElementById("kbSub");
  if (title) title.textContent = `Kunskapsdatabas (kategori: ${companyId})`;
  if (sub) sub.textContent = `Du jobbar just nu med ${companyId}`;
}

async function loadKbList() {
  if (!token || userRole !== "admin") return;

  const kbList = document.getElementById("kbList");
  const kbMsg = document.getElementById("kbMsg");
  if (!kbList) return;

  kbList.innerHTML = `<div class="kbEmpty">Laddar…</div>`;
  if (kbMsg) kbMsg.textContent = "";

  const res = await fetch(`${API_KB_LIST}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (!res.ok) {
    kbList.innerHTML = `<div class="kbEmpty">❌ ${escapeHtml(data.error || "Kunde inte ladda KB")}</div>`;
    return;
  }

  if (!data.length) {
    kbList.innerHTML = `<div class="kbEmpty">Inga källor i denna kategori ännu.</div>`;
    return;
  }

  kbList.innerHTML = "";

  for (const it of data) {
    kbList.innerHTML += `
      <div class="kbItem">
        <div class="kbItemTop">
          <div>
            <div class="kbItemTitle">${escapeHtml(it.title || "Untitled")}</div>
            <div class="kbMeta">
              Typ: ${escapeHtml(it.sourceType)} • ${it.embeddingOk ? "✅ RAG-ready" : "⚠️ Ingen embedding"}
            </div>
          </div>
          <button class="btn danger small" onclick="deleteKbItem('${it._id}')">Ta bort</button>
        </div>
      </div>
    `;
  }

  if (kbMsg) kbMsg.textContent = `✅ ${data.length} källor laddade`;
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
  const url = input?.value?.trim();
  if (!url) return;

  kbMsg.textContent = "⏳ Hämtar URL…";

  const res = await fetch(API_KB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, url }),
  });

  const data = await res.json();

  if (!res.ok) {
    kbMsg.textContent = `❌ ${data.error || "Fel vid URL-upload"}`;
    return;
  }

  kbMsg.textContent = `✅ ${data.message}`;
  input.value = "";
  await loadKbList();
}

async function uploadKbText() {
  if (!token || userRole !== "admin") return;

  const input = document.getElementById("kbTextInput");
  const kbMsg = document.getElementById("kbMsg");
  const content = input?.value?.trim();
  if (!content) return;

  kbMsg.textContent = "⏳ Laddar upp text…";

  const res = await fetch(API_KB_TEXT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, title: "Text", content }),
  });

  const data = await res.json();

  if (!res.ok) {
    kbMsg.textContent = `❌ ${data.error || "Fel vid text-upload"}`;
    return;
  }

  kbMsg.textContent = `✅ ${data.message}`;
  input.value = "";
  await loadKbList();
}

async function uploadKbPdf() {
  if (!token || userRole !== "admin") return;

  const fileInput = document.getElementById("kbPdfInput");
  const kbMsg = document.getElementById("kbMsg");
  if (!fileInput || !fileInput.files?.length) return;

  kbMsg.textContent = "⏳ Laddar upp PDF…";

  const form = new FormData();
  form.append("pdf", fileInput.files[0]);
  form.append("companyId", companyId);

  const res = await fetch(API_KB_PDF, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json();

  if (!res.ok) {
    kbMsg.textContent = `❌ ${data.error || "Fel vid PDF-upload"}`;
    return;
  }

  kbMsg.textContent = `✅ ${data.message}`;
  fileInput.value = "";
  await loadKbList();
}

function exportCategoryKB() {
  if (!token || userRole !== "admin") return;
  window.location.href = `${API_EXPORT_KB_CATEGORY}/${companyId}`;
}

function exportAllAdmin() {
  if (!token || userRole !== "admin") return;
  const ok = confirm("Vill du exportera ALLT? (admin)");
  if (!ok) return;
  window.location.href = API_EXPORT_ALL;
}

/*************************************************
 * ✅ INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  companyId = getCompanyIdFromURL();
  updateTitle();
  setLoggedInUI(!!token);

  const dropdown = document.getElementById("companySelect");
  if (dropdown) {
    dropdown.value = companyId;
    dropdown.addEventListener("change", (e) => handleCompanyChange(e.target.value));
  }

  document.getElementById("sendBtn")?.addEventListener("click", sendMessage);
  document.getElementById("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  document.getElementById("clearChat")?.addEventListener("click", clearChat);
  document.getElementById("exportChat")?.addEventListener("click", exportChat);
  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  document.getElementById("loginBtn")?.addEventListener("click", handleLogin);
  document.getElementById("registerBtn")?.addEventListener("click", handleRegister);

  // KB Modal events
  document.getElementById("kbOpenBtn")?.addEventListener("click", openKbModal);
  document.getElementById("kbCloseBtn")?.addEventListener("click", closeKbModal);
  document.getElementById("kbCloseBackdrop")?.addEventListener("click", closeKbModal);

  document.getElementById("kbReloadBtn")?.addEventListener("click", loadKbList);
  document.getElementById("kbUploadUrlBtn")?.addEventListener("click", uploadKbUrl);
  document.getElementById("kbUploadTextBtn")?.addEventListener("click", uploadKbText);
  document.getElementById("kbUploadPdfBtn")?.addEventListener("click", uploadKbPdf);

  document.getElementById("kbExportCategoryBtn")?.addEventListener("click", exportCategoryKB);
  document.getElementById("kbExportAllBtn")?.addEventListener("click", exportAllAdmin);

  // If already logged in: show chat + admin features
  if (token) {
    setLoggedInUI(true);
    await loadHistory();

    // ✅ show KB button only if admin
    if (userRole === "admin") {
      setKbButtonVisible(true);
    } else {
      setKbButtonVisible(false);
    }
  } else {
    setKbButtonVisible(false);
  }
});

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

    if (userRole === "admin") setKbButtonVisible(true);
    else setKbButtonVisible(false);

    setSubtitle("✅ Inloggad");
    setTimeout(() => setSubtitle(""), 1200);
  } else {
    if (msg) msg.textContent = data.error || "Fel vid login.";
  }
}
