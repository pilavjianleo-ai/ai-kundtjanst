const fs = require('fs');
let code = fs.readFileSync('public/ops.js', 'utf8');

code = code.replace(/class=\"opsCard\"/g, 'class=\"panel soft\"');
code = code.replace(/class=\"opsCardHead\"/g, 'class=\"panelHead\"');
code = code.replace(/class=\"opsCardTitle\"/g, 'class=\"title\" style=\"font-size:16px;\"');
code = code.replace(/class=\"opsCardBody\"/g, 'style=\"padding:16px;\"');
code = code.replace(/class=\"opsPill/g, 'class=\"pill');
code = code.replace(/class=\"opsMiniCard\"/g, 'class=\"panel soft\"');
code = code.replace(/class=\"opsInsightCard\"/g, 'class=\"panel\"');
code = code.replace(/class=\"opsFeedItem\"/g, 'class=\"listItem\"');
code = code.replace(/class=\"opsListItem\"/g, 'class=\"listItem\"');
code = code.replace(/class=\"opsEmpty\"/g, 'class=\"panel soft\"');

fs.writeFileSync('public/ops.js', code);
console.log('Done!');
