const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Inject the style tag for modern chat UI
const styleInject = `
<style>
  .cw-msg-area::-webkit-scrollbar { width: 6px; }
  .cw-msg-area::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
  .cw-bubble { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .cw-composer { box-shadow: 0 -4px 20px rgba(0,0,0,0.02); }
</style>
`;

if (!content.includes('.cw-msg-area')) {
  content = content.replace('class ChatWidget {', styleInject + '\nclass ChatWidget {');
  fs.writeFileSync(filePath, content, 'utf-8');
}
