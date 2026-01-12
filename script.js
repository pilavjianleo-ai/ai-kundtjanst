/**********************************************************
 * E7.1 + E7.2 – company via URL + tema + välkomstmeddelande
 **********************************************************/

// ===== 1. Läs companyId från URL =====
const urlParams = new URLSearchParams(window.location.search);
const companyId = urlParams.get("company") || "demo";

// ===== 2. Session-hantering =====
let sessionId = localStorage.getItem("sessionId");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("sessionId", sessionId);
}

// ===== 3. API-endpoint =====
const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/chat"
    : "/chat";

// ===== 4. När sidan är redo =====
document.addEventListener("DOMContentLoaded", () => {
  const messagesDiv = document.getElementById("messages");
  const input = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const title = document.querySelector("h2");

  // ===== 5. Tema + rubrik + välkomsttext =====
  let welcomeText = "Hej! Hur kan jag hjälpa dig idag?";
  let bgColor = "#7d7cf3";

  if (companyId === "law") {
    title.innerText = "AI Kundtjänst – Juridik";
    welcomeText = "Hej! Jag är juridisk rådgivare. Hur kan jag hjälpa dig?";
    bgColor = "#2c2f4a";
  }

  if (companyId === "tech") {
    title.innerText = "AI Kundtjänst – Teknisk support";
    welcomeText = "Hej! Jag är teknisk support. Vad behöver du hjälp med?";
    bgColor = "#0f766e";
  }

  if (companyId === "cleaning") {
    title.innerText = "AI Kundtjänst – Städservice";
    welcomeText = "Hej! Jag hjälper gärna med frågor om städning och tjänster.";
    bgColor = "#4d7c0f";
  }

  document.body.style.backgroundColor = bgColor;

  // Visa välkomstmeddelande EN gång
  messagesDiv.innerHTML =
    `<div class="msg ai">AI: ${welcomeText}</div>`;

  // ===== 6. Event listeners =====
  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
});

// ===== 7. Typing indicator =====
function showTypingIndicator() {
  const messagesDiv = document.getElementById("messages");
  if (document.getElementById("typing")) return;

  const typing = document.createElement("div");
  typing.id = "typing";
  typing.className = "msg ai";
  typing.innerText = "AI skriver…";

  messagesDiv.appendChild(typing);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeTypingIndicator() {
  const typing = document.getElementById("typing");
  if (typing) typing.remove();
}

// ===== 8. Skicka meddelande =====
async function sendMessage() {
  const input = document.getElementById("messageInput");
  const messagesDiv = document.getElementById("messages");
  const text = input.value.trim();

  if (!text) return;

  // Visa användarens meddelande
  messagesDiv.innerHTML += `<div class="msg user">${text}</div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  input.value = "";

  showTypingIndicator();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: companyId,
        sessionId: sessionId,
        message: text
      })
    });

    const data = await response.json();
    removeTypingIndicator();

    messagesDiv.innerHTML +=
      `<div class="msg ai">AI: ${data.reply}</div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

  } catch (err) {
    console.error("Fetch-fel:", err);
    removeTypingIndicator();
    messagesDiv.innerHTML +=
      `<div class="msg ai">AI: Tekniskt fel. Försök igen.</div>`;
  }
}
