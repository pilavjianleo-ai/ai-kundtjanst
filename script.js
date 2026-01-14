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

function el(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSubtitle(text) {
  const s = el("subtitle");
  if (s) s.textContent = text || "";
}

function setView(view) {
  const chatView = el("chatView");
  const kbView = el("kbView");
  const navChat = el("navChat");
  const navKb = el("navKb");

  if (chatView) chatView.style.display = view === "chat" ? "flex" : "none";
  if (kbView) kbView.style.display = view === "kb" ? "flex" : "none";

  if (navChat) navChat.classList.toggle("active", view === "chat");
  if (navKb) navKb.classList.toggle("active", view === "kb");
}

function updateTitle() {
  const titleEl = el("title");
  if (!titleEl) return;

  const map = {
    law: "AI Kundtjänst – Juridik",
    tech: "AI Kundtjänst – Teknisk support",
    cleaning: "AI Kundtjänst – Städservice",
    demo: "AI Kundtjänst – Demo AB",
  };

  titleEl.textContent = map[companyId] || map.demo;
}

function setLoggedInUI(isLoggedIn) {
  const auth = el("authScreen");
  const app = el("mainApp");

  if (auth) auth.style.display = isLoggedIn ? "none" : "grid";
  if (app) app.style.display = isLoggedIn ? "grid" : "none";
}

function showTyping() {
  const messages = el("messages");
  if (!messages) return;

  const existing = document.getElementById("typing");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.className = "msg";
  wrap.id = "typing";
  wrap.innerHTML = `
    <div class="avatar"><i class="fas fa-robot"></i></div>
    <div class="bubble ai">AI skriver…</div>
  `;
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

function showRagBadge(text, good) {
  const badge = el("ragBadge");
  if (!badge) return;
  if (!text) {
    badge.style.display = "none";
    badge.innerHTML = "";
    return;
  }
  badge.style.display = "flex";
  badge.innerHTML = `<span class="dot ${good ? "good" : "warn"}"></span><span>${escapeHtml(text)}</span>`;
}

function addUserMessage(text) {
  const messages = el("messages");
  if (!messages) return;
  messages.innerHTML += `
    <div class="msg user">
      <div class="avatar"><i class="fas fa-user"></i></div>
      <div class="bubble user">${escapeHtml(text)}</div>
    </div>`;
  messages.scrollTop = messages.scrollHeight;
}

function addAiMessage(text) {
  const messages = el("messages");
  if (!messages) return;
  const safeCopy = String(text || "").replace(/'/g, "\\'");
  messages.innerHTML += `
    <div class="msg">
      <div class="avatar"><i class="fas fa-robot"></i></div>
      <div>
        <div class="bubble ai">${escapeHtml(text)}</div>
        <div class="bubbleActions">
          <button class="miniBtn" onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
          <button class="miniBtn" onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
          <button class="miniBtn" onclick="copyToClipboard('${safeCopy}')"><i class="fas fa-copy"></i></button>
        </div>
      </div>
    </div>`;
  messages.scrollTop = messages.scrollHeight;
}

async function loadHistory() {
  if (!token) return;

  const messages = el("messages");
  if (messages) messages.innerHTML = "";

  const res = await fetch(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return;

  const data = await res.json();

  for (const m of data) {
    if (m.role === "user") addUserMessage(m.content);
    if (m.role === "assistant") addAiMessage(m.content);
  }
}

async function sendMessage() {
  const input = el("messageInput");
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  addUserMessage(text);
  showTyping();
  showRagBadge("", false);

  try {
    const resHistory = await fetch(`${API_HISTORY}/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const history = resHistory.ok ? await resHistory.json() : [];

    const conversation = history.map((m) => ({ role: m.role, content: m.content }));
    conversation.push({ role: "user", content: text });

    const res = await fetch(API_CHAT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyId, conversation }),
    });

    const data = await res.json();
    removeTyping();

    if (!res.ok) {
      addAiMessage(`Serverfel: ${data.error || "okänt fel"}`);
      return;
    }

    addAiMessage(data.reply || "Inget svar.");
    if (data.ragUsed === true) showRagBadge("RAG användes ✅ (kunskapsdatabas)", true);
    else showRagBadge("", false);

  } catch (err) {
    console.error(err);
    removeTyping();
    addAiMessage("Tekniskt fel. Försök igen.");
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

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    setSubtitle("✅ Kopierat!");
    setTimeout(() => setSubtitle(""), 1200);
  });
}

async function exportChat() {
  if (!token) return;
  const res = await fetch(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = res.ok ? await res.json() : [];

  let out = `Chatt-historik (${companyId})\n\n`;
  for (const m of data) {
    const t = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";
    if (m.role === "user") out += `[${t}] Du: ${m.content}\n`;
    if (m.role === "assistant") out += `[${t}] AI: ${m.content}\n`;
  }

  const blob = new Blob([out], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat_${companyId}_${new Date().toISOString().split("T")[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearChat() {
  const messages = el("messages");
  if (messages) messages.innerHTML = "";
  setSubtitle("🗑️ Rensad (endast UI)");
  setTimeout(() => setSubtitle(""), 1200);
}

function toggleTheme() {
  const body = document.body;
  const current = body.getAttribute("data-theme") || "dark";
  body.setAttribute("data-theme", current === "dark" ? "light" : "dark");
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  token = null;
  userRole = null;
  setLoggedInUI(false);
}

/*************************************************
 * ✅ ADMIN: KB VIEW
 *************************************************/
function setAdminNavVisible(isAdmin) {
  const navKb = el("navKb");
  if (navKb) navKb.style.display = isAdmin ? "flex" : "none";
}

function updateKbTitle() {
  const t = el("kbTitle");
  if (t) t.textContent = `Kunskapsdatabas (${companyId})`;
}

async function loadKbList() {
  if (!token || userRole !== "admin") return;

  const list = el("kbList");
  const msg = el("kbMsg");

  if (list) list.innerHTML = "Laddar…";
  if (msg) msg.textContent = "";

  const res = await fetch(`${API_KB_LIST}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (!res.ok) {
    if (list) list.innerHTML = `❌ ${escapeHtml(data.error || "fel")}`;
    return;
  }

  if (!data.length) {
    if (list) list.innerHTML = `<div class="muted">Inga källor i denna kategori ännu.</div>`;
    return;
  }

  if (list) list.innerHTML = "";

  for (const it of data) {
    list.innerHTML += `
      <div class="kbItem">
        <div class="kbItemTop">
          <div>
            <div class="kbItemTitle">${escapeHtml(it.title || "Untitled")}</div>
            <div class="kbMeta">Typ: ${escapeHtml(it.sourceType)} • ${it.embeddingOk ? "✅ RAG-ready" : "⚠️ Ingen embedding"}</div>
          </div>
          <button class="btn danger small" onclick="deleteKbItem('${it._id}')">Ta bort</button>
        </div>
      </div>
    `;
  }

  if (msg) msg.textContent = `✅ ${data.length} källor laddade`;
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

  const input = el("kbUrlInput");
  const msg = el("kbMsg");
  const url = input?.value?.trim();
  if (!url) return;

  if (msg) msg.textContent = "⏳ Hämtar URL…";

  const res = await fetch(API_KB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, url }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (msg) msg.textContent = `❌ ${data.error || "Fel vid URL-upload"}`;
    return;
  }

  if (msg) msg.textContent = `✅ ${data.message}`;
  if (input) input.value = "";
  await loadKbList();
}

async function uploadKbText() {
  if (!token || userRole !== "admin") return;

  const input = el("kbTextInput");
  const msg = el("kbMsg");
  const content = input?.value?.trim();
  if (!content) return;

  if (msg) msg.textContent = "⏳ Laddar upp text…";

  const res = await fetch(API_KB_TEXT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ companyId, title: "Text", content }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (msg) msg.textContent = `❌ ${data.error || "Fel vid text-upload"}`;
    return;
  }

  if (msg) msg.textContent = `✅ ${data.message}`;
  if (input) input.value = "";
  await loadKbList();
}

async function uploadKbPdf() {
  if (!token || userRole !== "admin") return;

  const fileInput = el("kbPdfInput");
  const msg = el("kbMsg");
  if (!fileInput || !fileInput.files?.length) return;

  if (msg) msg.textContent = "⏳ Laddar upp PDF…";

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
    if (msg) msg.textContent = `❌ ${data.error || "Fel vid PDF-upload"}`;
    return;
  }

  if (msg) msg.textContent = `✅ ${data.message}`;
  fileInput.value = "";
  await loadKbList();
}

function exportCategoryKB() {
  if (!token || userRole !== "admin") return;
  window.location.href = `${API_EXPORT_KB_CATEGORY}/${companyId}`;
}

function exportAllAdmin() {
  if (!token || userRole !== "admin") return;
  if (!confirm("Vill du exportera ALLT?")) return;
  window.location.href = API_EXPORT_ALL;
}

/*************************************************
 * ✅ AUTH
 *************************************************/
async function handleLogin() {
  const username = el("username")?.value;
  const password = el("password")?.value;

  const res = await fetch(API_LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  const msg = el("authMessage");

  if (!res.ok) {
    if (msg) msg.textContent = data.error || "Fel vid login.";
    return;
  }

  localStorage.setItem("token", data.token);
  token = data.token;

  userRole = data.user?.role || "user";
  localStorage.setItem("role", userRole);

  setLoggedInUI(true);

  updateTitle();
  await loadHistory();
  setView("chat");

  setAdminNavVisible(userRole === "admin");
  if (userRole === "admin") {
    updateKbTitle();
    await loadKbList();
  }

  setSubtitle("✅ Inloggad");
  setTimeout(() => setSubtitle(""), 1200);
}

async function handleRegister() {
  const username = el("username")?.value;
  const password = el("password")?.value;

  const res = await fetch(API_REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  const msg = el("authMessage");

  if (!res.ok) {
    if (msg) msg.textContent = data.error || "Registrering misslyckades.";
    return;
  }

  if (msg) msg.textContent = "✅ Registrering lyckades! Logga in nu.";
}

/*************************************************
 * ✅ INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", async () => {
  companyId = getCompanyIdFromURL();
  updateTitle();

  setLoggedInUI(!!token);

  // UI binds
  el("loginBtn")?.addEventListener("click", handleLogin);
  el("registerBtn")?.addEventListener("click", handleRegister);

  el("sendBtn")?.addEventListener("click", sendMessage);
  el("messageInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  el("clearChat")?.addEventListener("click", clearChat);
  el("exportChat")?.addEventListener("click", exportChat);
  el("themeToggle")?.addEventListener("click", toggleTheme);
  el("logoutBtn")?.addEventListener("click", logout);

  // Category change
  el("companySelect")?.addEventListener("change", async (e) => {
    companyId = e.target.value;
    setCompanyIdInURL(companyId);
    updateTitle();
    updateKbTitle();

    if (token) {
      await loadHistory();
      if (userRole === "admin") await loadKbList();
    }

    setSubtitle(`✅ Bytte kategori: ${companyId}`);
    setTimeout(() => setSubtitle(""), 1000);
  });

  // Navigation
  el("navChat")?.addEventListener("click", () => setView("chat"));
  el("navKb")?.addEventListener("click", () => {
    setView("kb");
    updateKbTitle();
    loadKbList();
  });

  // KB actions
  el("kbReloadBtn")?.addEventListener("click", loadKbList);
  el("kbUploadUrlBtn")?.addEventListener("click", uploadKbUrl);
  el("kbUploadTextBtn")?.addEventListener("click", uploadKbText);
  el("kbUploadPdfBtn")?.addEventListener("click", uploadKbPdf);
  el("kbExportCategoryBtn")?.addEventListener("click", exportCategoryKB);
  el("kbExportAllBtn")?.addEventListener("click", exportAllAdmin);

  // If already logged in
  if (token) {
    setLoggedInUI(true);
    await loadHistory();

    // if role persisted
    setAdminNavVisible(userRole === "admin");
    if (userRole === "admin") {
      updateKbTitle();
      await loadKbList();
    } else {
      setView("chat");
    }
  }
});
