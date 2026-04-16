const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

// Fix handleIncomingMessage in AiOsEngine
const handlerRegex = /handleIncomingMessage\(msg\) \{[\s\S]*?\}\n  \},/m;
const newHandler = `handleIncomingMessage(msg) {
    // Prevent duplicates
    let conv = this.state.conversations.find(c => c.id === msg.conversationId);
    if (!conv) {
      conv = { id: msg.conversationId, messages: [] };
      this.state.conversations.push(conv);
    }
    
    if (!conv.messages.find(m => m.id === msg.id)) {
      conv.messages.push(msg);
      
      // Update UI widgets if they match the conversation
      // We assume Live Studio and Main App use 'default' sessionId for now
      if (msg.conversationId === 'default') {
        const uiMsg = { role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content, id: msg.id, source: msg.role };
        
        [window.aiosLiveWidget, window.aiosMainAppWidget, window.aiosActiveWidget].forEach(widget => {
          if (widget && !widget.messages.find(m => m.id === msg.id)) {
             // Don't duplicate if widget already optimistic added it
             if (widget._lastOptimisticText === msg.content) {
               widget._lastOptimisticText = null;
               // tag it with id
               const lastMsg = widget.messages[widget.messages.length - 1];
               if(lastMsg) lastMsg.id = msg.id;
             } else {
               widget.messages.push(uiMsg);
               widget.render();
             }
          }
        });
      }
      
      this.notify(); // Re-render inbox
    }
  },`;

if(content.match(handlerRegex)) {
  content = content.replace(handlerRegex, newHandler);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Fixed message handler duplication logic.');
} else {
  console.log('Could not find handleIncomingMessage regex');
}
