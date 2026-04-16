const fs = require('fs');

let code = fs.readFileSync('public/ai_os.js', 'utf8');

code = code.replace(/\\\`/g, '`');

fs.writeFileSync('public/ai_os.js', code);
console.log('Fixed backticks');