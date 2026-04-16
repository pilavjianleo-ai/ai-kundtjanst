const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

const injectionCode = `
// ---------------------------------------------------------
// INJECT CHAT WIDGET INTO MAIN APP
// ---------------------------------------------------------
// We override the original chatView to use the global ChatWidget
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const mainChatView = document.getElementById("chatView");
    if (mainChatView && window.AiOsEngine) {
      // Clear out the static HTML
      mainChatView.innerHTML = \`<div id="global-chat-widget-container" style="height:100vh; width:100%; display:flex; flex-direction:column;"></div>\`;
      
      // Instantiate the global widget
      const container = document.getElementById("global-chat-widget-container");
      window.aiosMainAppWidget = new ChatWidget(
        container, 
        window.AiOsEngine.state.chatExperience, 
        window.AiOsEngine.simulateChat.bind(window.AiOsEngine),
        null,
        false // isPreview = false
      );
      
      // Hook into AiOsEngine to sync live updates
      window.AiOsEngine.subscribe(() => {
        if (window.aiosMainAppWidget) {
          window.aiosMainAppWidget.updateConfig(window.AiOsEngine.state.chatExperience);
        }
      });
    }
  }, 1000);
});
`;

if (!content.includes('global-chat-widget-container')) {
  content += '\n' + injectionCode;
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('ChatWidget injected into main app.');
}
