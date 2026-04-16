const fs = require('fs');
let code = fs.readFileSync('public/ops.js', 'utf8');

code = code.replace(/class=\"opsGrid2\"/g, 'class=\"grid2\"');
code = code.replace(/class=\"opsGrid3\"/g, 'class=\"grid3\"');
code = code.replace(/class=\"opsTable\"/g, 'class=\"table\"');
code = code.replace(/class=\"opsContent\"/g, 'style=\"display:grid; grid-template-columns: 1fr 380px; gap:14px; margin-top:14px;\"');

fs.writeFileSync('public/ops.js', code);
console.log('Done Grids!');