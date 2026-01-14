/*************************************************
 * companyId från URL (?company=law / tech / cleaning)
 *************************************************/
const urlParams = new URLSearchParams(window.location.search);
let companyId = urlParams.get("company") || "demo";

/*************************************************
 * Skapa / hämta sessionId (per besökare)
 *************************************************/
let sessionId = localStorage.getItem("sessionId");

if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("sessionId", sessionId);
}

console.log("companyId:", companyId);
console.log("sessionId:", sessionId);

/*************************************************
 * Titel-uppdatering baserat på companyId
 *************************************************/
const titleEl = document.querySelector("h2");

function updateTitle() {
  if (companyId === "law") {
    titleEl.innerText = "AI Kundtjänst – Juridik";
  } else if (companyId === "tech") {
    titleEl.innerText = "AI Kundtjänst – Teknisk support";
  } else if (companyId === "cleaning") {
    titleEl.innerText = "AI Kundtjänst – Städservice";
  } else {
    titleEl.innerText = "AI Kundtjänst – Demo AB";
  }
}

updateTitle();

/*************************************************
 * API-endpoint
 *************************************************/
const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/chat"
    : "/chat";

/*************************************************
 * Ladda sparad historik från localStorage (per kategori)
 *************************************************/
function loadHistory() {
  const historyKey = `chatHistory_${sessionId}_${companyId}`;
  const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
  const messagesDiv = document.getElementById("messages");
  history.forEach(msg => {
    messagesDiv.innerHTML += msg.html;
  });
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/*************************************************
 * Spara meddelande till historik (per kategori)
 *************************************************/
function saveToHistory(html) {
  const historyKey = `chatHistory_${sessionId}_${companyId}`;
  const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
  history.push({ html, timestamp: Date.now() });
  if (history.length > 50) history.shift(); // Behåll max 50 meddelanden
  localStorage.setItem(historyKey, JSON.stringify(history));
}

/*************************************************
 * Typing-indicator
 *************************************************/
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

/*************************************************
 * Kopiera text till urklipp
 *************************************************/
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("Text kopierad!");
  }).catch(err => {
    console.error("Kunde inte kopiera:", err);
  });
}

/*************************************************
 * Exportera chatt-historik som textfil
 *************************************************/
function exportChat() {
  const historyKey = `chatHistory_${sessionId}_${companyId}`;
  const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
  let chatText = `Chatt-historik för ${companyId} (Session: ${sessionId})\n\n`;
  history.forEach(item => {
    const timestamp = new Date(item.timestamp).toLocaleString();
    if (item.html.includes('class="msg user"')) {
      const userText = item.html.match(/<div class="content">([^<]+)<\/div>/)?.[1] || "";
      chatText += `[${timestamp}] Du: ${userText}\n`;
    } else if (item.html.includes('class="msg ai"') && !item.html.includes("AI skriver…")) {
      const aiText = item.html.match(/<div class="content">([^<]+)<\/div>/)?.[1] || "";
      chatText += `[${timestamp}] AI: ${aiText}\n`;
    }
  });
  const blob = new Blob([chatText], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat_${companyId}_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/*************************************************
 * Skicka meddelande
 *************************************************/
async function sendMessage() {
  const input = document.getElementById("messageInput");
  const messagesDiv = document.getElementById("messages");

  const text = input.value.trim();
  if (!text) return;

  // Visa användarens meddelande
  const userMsg = `<div class="msg user">
    <div class="avatar"><i class="fas fa-user"></i></div>
    <div class="content">${text}</div>
  </div>`;
  messagesDiv.innerHTML += userMsg;
  saveToHistory(userMsg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  input.value = "";

  // Visa typing
  showTypingIndicator();

  // Ladda hela historiken för sammanhang (per kategori)
  const historyKey = `chatHistory_${sessionId}_${companyId}`;
  const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
  const conversation = [{ role: "system", content: getSystemPrompt(companyId) }]; // Starta med systemPrompt

  // Bygg konversation från historik (hoppa över system-meddelanden)
  history.forEach(item => {
    if (item.html.includes('class="msg user"')) {
      const userText = item.html.match(/<div class="content">([^<]+)<\/div>/)?.[1] || "";
      conversation.push({ role: "user", content: userText });
    } else if (item.html.includes('class="msg ai"') && !item.html.includes("AI skriver…")) {
      const aiText = item.html.match(/<div class="content">([^<]+)<\/div>/)?.[1] || "";
      conversation.push({ role: "assistant", content: aiText });
    }
  });

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        companyId: companyId,
        sessionId: sessionId,
        conversation: conversation, // Skicka hela konversationen
      }),
    });

    const data = await response.json();

    removeTypingIndicator();

    if (data.reply) {
      const aiMsg = `<div class="msg ai">
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">${data.reply}</div>
        <div class="feedback">
          <button onclick="giveFeedback('positive')"><i class="fas fa-thumbs-up"></i></button>
          <button onclick="giveFeedback('negative')"><i class="fas fa-thumbs-down"></i></button>
          <button onclick="copyToClipboard('${data.reply.replace(/'/g, "\\'")}')"><i class="fas fa-copy"></i></button>
        </div>
      </div>`;
      messagesDiv.innerHTML += aiMsg;
      saveToHistory(aiMsg);
    } else {
      const errorMsg = `<div class="msg ai">
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">AI: Något gick fel.</div>
      </div>`;
      messagesDiv.innerHTML += errorMsg;
      saveToHistory(errorMsg);
    }

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (error) {
    console.error("Fetch-fel:", error);
    removeTypingIndicator();
    const errorMsg = `<div class="msg ai">
      <div class="avatar"><i class="fas fa-robot"></i></div>
      <div class="content">AI: Tekniskt fel.</div>
    </div>`;
    messagesDiv.innerHTML += errorMsg;
    saveToHistory(errorMsg);
  }
}

/*************************************************
 * Feedback-funktion
 *************************************************/
function giveFeedback(type) {
  // Här kan du skicka feedback till servern eller bara logga
  console.log(`Feedback: ${type} för session ${sessionId}`);
  alert(`Tack för feedback! (${type})`);
}

/*************************************************
 * Uppdatera kategori dynamiskt vid URL-ändring
 *************************************************/
function updateCategory() {
  console.log("updateCategory started");
  const newUrlParams = new URLSearchParams(window.location.search);
  const newCompanyId = newUrlParams.get("company") || "demo";
  console.log("newCompanyId:", newCompanyId, "old companyId:", companyId);

  if (newCompanyId !== companyId) {
    // Uppdatera companyId
    companyId = newCompanyId;
    updateTitle();

    // Rensa meddelanden och ladda rätt historik
    document.getElementById("messages").innerHTML = "";
    loadHistory();

    // Visa välkomstmeddelande om ingen historik
    const historyKey = `chatHistory_${sessionId}_${companyId}`;
    if (!localStorage.getItem(historyKey)) {
      let welcomeText = "Hej! Hur kan jag hjälpa dig idag?";
      if (companyId === "law") {
        welcomeText = "Hej! Jag är juridisk rådgivare. Hur kan jag hjälpa dig?";
      } else if (companyId === "tech") {
        welcomeText = "Hej! Jag är teknisk support. Vad behöver du hjälp med?";
      } else if (companyId === "cleaning") {
        welcomeText = "Hej! Jag hjälper gärna med frågor om städning.";
      }
      const messagesDiv = document.getElementById("messages");
      const welcomeMsg = `<div class="msg ai">
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">${welcomeText}</div>
      </div>`;
      messagesDiv.innerHTML += welcomeMsg;
      saveToHistory(welcomeMsg);
    }
  }

  console.log("updateCategory finished, companyId is now:", companyId);
}

/*************************************************
 * Hämta systemPrompt baserat på companyId
 *************************************************/
function getSystemPrompt(companyId) {
  if (companyId === "demo") {
    return "Du är kundtjänst för Demo AB. Du är vänlig, tydlig och hjälpsam.";
  } else if (companyId === "law") {
    return "Du är en juridisk rådgivare. Ge allmänna råd baserat på svensk lag, men rekommendera alltid att konsultera en professionell jurist för specifika fall.";
  } else if (companyId === "tech") {
    return "Du är teknisk support. Hjälp användaren med tekniska problem, felsökning och allmän IT-frågor.";
  } else if (companyId === "cleaning") {
    return "Du är kundtjänst för städservice. Hjälp med frågor om städning, bokningar och allmänna tjänster.";
  }
  return "Du är en professionell, vänlig och hjälpsam AI-kundtjänst.";
}

/*************************************************
 * Rensa chatt (per kategori)
 *************************************************/
function clearChat() {
  document.getElementById("messages").innerHTML = "";
  const historyKey = `chatHistory_${sessionId}_${companyId}`;
  localStorage.removeItem(historyKey);
}

/*************************************************
 * Växla tema
 *************************************************/
function toggleTheme() {
  const body = document.body;
  const icon = document.querySelector("#themeToggle i");
  if (body.dataset.theme === "light") {
    body.dataset.theme = "dark";
    icon.className = "fas fa-sun";
  } else {
    body.dataset.theme = "light";
    icon.className = "fas fa-moon";
  }
}

/*************************************************
 * Event listeners
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendBtn");
  const input = document.getElementById("messageInput");
  const messagesDiv = document.getElementById("messages");
  const clearBtn = document.getElementById("clearChat");
  const themeBtn = document.getElementById("themeToggle");
  const refreshBtn = document.getElementById("refreshCategory");
  const exportBtn = document.getElementById("exportChat");

  // Ladda historik
  loadHistory();

  // Välkomstmeddelande (bara om ingen historik)
  const historyKey = `chatHistory_${sessionId}_${companyId}`;
  if (!localStorage.getItem(historyKey)) {
    let welcomeText = "Hej! Hur kan jag hjälpa dig idag?";
    if (companyId === "law") {
      welcomeText = "Hej! Jag är juridisk rådgivare. Hur kan jag hjälpa dig?";
    } else if (companyId === "tech") {
      welcomeText = "Hej! Jag är teknisk support. Vad behöver du hjälp med?";
    } else if (companyId === "cleaning") {
      welcomeText = "Hej! Jag hjälper gärna med frågor om städning.";
    }
    const welcomeMsg = `<div class="msg ai">
      <div class="avatar"><i class="fas fa-robot"></i></div>
      <div class="content">${welcomeText}</div>
    </div>`;
    messagesDiv.innerHTML += welcomeMsg;
    saveToHistory(welcomeMsg);
  }

  // Event listeners
  sendBtn.addEventListener("click", sendMessage);
  clearBtn.addEventListener("click", clearChat);
  themeBtn.addEventListener("click", toggleTheme);
  refreshBtn.addEventListener("click", updateCategory);
  exportBtn.addEventListener("click", exportChat);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // Lyssna på URL-ändringar (för dynamisk uppdatering)
  window.addEventListener("popstate", updateCategory);
  window.addEventListener("hashchange", updateCategory); // För säkerhets skull

  // Kontrollera URL-ändringar varje sekund (för direkt URL-byte)
  setInterval(() => {
    const currentParams = new URLSearchParams(window.location.search);
    const currentCompanyId = currentParams.get("company") || "demo";
    console.log("Checking URL - current companyId:", companyId, "detected:", currentCompanyId);
    if (currentCompanyId !== companyId) {
      console.log("URL changed, calling updateCategory");
      updateCategory();
    }
  }, 1000);
});