const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

const API_LOGIN = `${API_BASE}/login`;
const API_REGISTER = `${API_BASE}/register`;
const API_CHAT = `${API_BASE}/chat`;
const API_HISTORY = `${API_BASE}/history`;
const API_FEEDBACK = `${API_BASE}/feedback`;

const API_EXPORT_ALL = `${API_BASE}/export/knowledgebase`;
const API_EXPORT_CATEGORY = (companyId) => `${API_BASE}/export/knowledgebase/${companyId}`;
const API_ADMIN_EXPORT_ALL = `${API_BASE}/admin/export/all`;

const API_KB_TEXT = `${API_BASE}/kb/upload-text`;
const API_KB_URL = `${API_BASE}/kb/upload-url`;
const API_KB_PDF = `${API_BASE}/kb/upload-pdf`;
const API_KB_LIST = (companyId) => `${API_BASE}/kb/list/${companyId}`;
const API_KB_DELETE = (id) => `${API_BASE}/kb/item/${id}`;

let token = localStorage.getItem("token");
let user = JSON.parse(localStorage.getItem("user") || "null");
let companyId = "demo";

// safe JSON helper
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Servern svarade inte med JSON.\nStatus: ${res.status}\nBody: ${text.slice(0, 120)}...`);
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function setLoggedInUI(isLoggedIn) {
  document.getElementById("auth").style.display = isLoggedIn ? "none" : "block";
  document.getElementById("chat").style.display = isLoggedIn ? "block" : "none";
  document.getElementById("logoutBtn").style.display = isLoggedIn ? "inline-flex" : "none";

  const label = document.getElementById("userLabel");
  if (isLoggedIn && user) {
    label.style.display = "block";
    label.textContent = `Inloggad som: ${user.username} (${user.role})`;
  } else {
    label.style.display = "none";
    label.textContent = "";
  }

  const adminPanel = document.getElementById("adminPanel");
  if (adminPanel) {
    adminPanel.style.display = isLoggedIn && user?.role === "admin" ? "block" : "none";
  }
}

function updateTitle() {
  const titleEl = document.getElementById("pageTitle");
  const map = {
    demo: "AI Kundtjänst – Demo AB",
    tech: "AI Kundtjänst – Teknisk support",
    law: "AI Kundtjänst – Juridik",
    cleaning: "AI Kundtjänst – Städservice",
  };
  titleEl.textContent = map[companyId] || map.demo;

  const selectEl = document.getElementById("companySelect");
  if (selectEl) selectEl.value = companyId;
}

function showTypingIndicator() {
  const messagesDiv = document.getElementById("messages");
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

function renderMessages(messages) {
  const messagesDiv = document.getElementById("messages");
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

async function loadHistory() {
  if (!token) return;
  const messages = await fetchJson(`${API_HISTORY}/${companyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  renderMessages(messages);
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const messagesDiv = document.getElementById("messages");
  const text = input.value.trim();
  if (!text) return;

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

    messagesDiv.innerHTML += `
      <div class="msg ai">
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">${data.reply}</div>
        <div class="feedback">
          <button onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
          <button onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
          <button onclick="copyToClipboard('${String(data.reply).replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i></button>
        </div>
      </div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (err) {
    removeTypingIndicator();
    console.error(err);
    messagesDiv.innerHTML += `
      <div class="msg ai">
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">Fel: ${err.message}</div>
      </div>`;
  }
}

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
    alert("Feedback misslyckades: " + err.message);
  }
}

function toggleTheme() {
  const body = document.body;
  const icon = document.querySelector("#themeToggle i");
  const current = body.dataset.theme || "dark";
  const next = current === "dark" ? "light" : "dark";
  body.dataset.theme = next;
  localStorage.setItem("theme", next);
  if (icon) icon.className = next === "dark" ? "fas fa-moon" : "fas fa-sun";
}

async function clearChat() {
  const ok = confirm("Vill du rensa chatthistoriken för denna kategori?");
  if (!ok) return;

  document.getElementById("messages").innerHTML = "";

  await fetchJson(`${API_HISTORY}/${companyId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function refreshCategory() {
  updateTitle();
  await loadHistory();
}

async function exportAll() {
  const res = await fetch(API_EXPORT_ALL, { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my_export_all_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCategory() {
  const res = await fetch(API_EXPORT_CATEGORY(companyId), { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my_export_${companyId}_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function refreshKbList() {
  if (!token) return;
  const list = document.getElementById("kbList");
  if (!list) return;

  list.innerHTML = "Laddar KB...";

  try {
    const items = await fetchJson(API_KB_LIST(companyId), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!items.length) {
      list.innerHTML = `<p class="smallMuted">Ingen kunskap sparad för denna kategori ännu.</p>`;
      return;
    }

    list.innerHTML = items
      .map((i) => {
        const when = new Date(i.createdAt).toLocaleString();
        const src = i.sourceRef ? ` • ${i.sourceRef}` : "";
        return `
          <div class="kbItem">
            <div class="kbMeta">
              <b>${i.title}</b>
              <span class="smallMuted">${i.sourceType.toUpperCase()} • ${when}${src}</span>
            </div>
            <button class="btn danger" onclick="deleteKbItem('${i._id}')">
              <i class="fas fa-trash"></i>
            </button>
          </div>`;
      })
      .join("");
  } catch (err) {
    list.innerHTML = `<p class="smallMuted">KB fel: ${err.message}</p>`;
  }
}

async function deleteKbItem(id) {
  const ok = confirm("Vill du ta bort detta från kunskapsdatabasen?");
  if (!ok) return;

  try {
    await fetchJson(API_KB_DELETE(id), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await refreshKbList();
  } catch (err) {
    alert("Kunde inte ta bort: " + err.message);
  }
}

async function uploadText() {
  const title = document.getElementById("kbTitle").value.trim();
  const content = document.getElementById("kbText").value.trim();
  if (!content) return alert("Klistra in text först.");

  try {
    await fetchJson(API_KB_TEXT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyId, title, content }),
    });

    document.getElementById("kbText").value = "";
    alert("✅ Text uppladdad!");
    await refreshKbList();
  } catch (err) {
    alert("Fel: " + err.message);
  }
}

async function uploadUrl() {
  const url = document.getElementById("kbUrl").value.trim();
  if (!url) return alert("Skriv en URL först.");

  try {
    await fetchJson(API_KB_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ companyId, url }),
    });

    document.getElementById("kbUrl").value = "";
    alert("✅ URL uppladdad!");
    await refreshKbList();
  } catch (err) {
    alert("Fel: " + err.message);
  }
}

async function uploadPdf() {
  const fileInput = document.getElementById("kbPdf");
  if (!fileInput.files || !fileInput.files[0]) return alert("Välj en PDF först.");

  const form = new FormData();
  form.append("companyId", companyId);
  form.append("pdf", fileInput.files[0]);

  try {
    const res = await fetch(API_KB_PDF, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Servern svarade inte med JSON.");
    }

    if (!res.ok) throw new Error(data.error || "Fel vid PDF upload");

    fileInput.value = "";
    alert("✅ PDF uppladdad!");
    await refreshKbList();
  } catch (err) {
    alert("Fel: " + err.message);
  }
}

async function adminExportAll() {
  try {
    const res = await fetch(API_ADMIN_EXPORT_ALL, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ADMIN_EXPORT_ALL_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Admin export fail: " + err.message);
  }
}

async function handleLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("authMessage");

  try {
    const data = await fetchJson(API_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    token = data.token;
    user = data.user;

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    msg.textContent = "";
    setLoggedInUI(true);
    updateTitle();
    await loadHistory();
  } catch (err) {
    msg.textContent = err.message;
  }
}

async function handleRegister() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("authMessage");

  try {
    const data = await fetchJson(API_REGISTER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    msg.textContent = data.message || "OK";
  } catch (err) {
    msg.textContent = err.message;
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  token = null;
  user = null;
  setLoggedInUI(false);
  document.getElementById("messages").innerHTML = "";
}

document.addEventListener("DOMContentLoaded", async () => {
  const theme = localStorage.getItem("theme");
  if (theme) document.body.dataset.theme = theme;

  updateTitle();
  setLoggedInUI(!!token);

  document.getElementById("companySelect").addEventListener("change", async (e) => {
    companyId = e.target.value;
    updateTitle();
    if (token) await loadHistory();
  });

  document.getElementById("loginBtn").addEventListener("click", handleLogin);
  document.getElementById("registerBtn").addEventListener("click", handleRegister);
  document.getElementById("logoutBtn").addEventListener("click", logout);

  document.getElementById("sendBtn").addEventListener("click", sendMessage);
  document.getElementById("messageInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("clearChat").addEventListener("click", clearChat);
  document.getElementById("refreshCategory").addEventListener("click", refreshCategory);

  document.getElementById("exportAllBtn").addEventListener("click", exportAll);
  document.getElementById("exportCategoryBtn").addEventListener("click", exportCategory);

  // ✅ Toggle KB section (hidden by default)
  document.getElementById("toggleKbBtn")?.addEventListener("click", async () => {
    const sec = document.getElementById("kbSection");
    if (!sec) return;
    const open = sec.style.display !== "none";
    sec.style.display = open ? "none" : "block";
    if (!open && token) await refreshKbList();
  });

  document.getElementById("uploadTextBtn")?.addEventListener("click", uploadText);
  document.getElementById("uploadUrlBtn")?.addEventListener("click", uploadUrl);
  document.getElementById("uploadPdfBtn")?.addEventListener("click", uploadPdf);
  document.getElementById("refreshKbBtn")?.addEventListener("click", refreshKbList);
  document.getElementById("downloadKbBtn")?.addEventListener("click", exportCategory);

  document.getElementById("adminExportAllBtn")?.addEventListener("click", adminExportAll);

  if (token) await loadHistory();
});
