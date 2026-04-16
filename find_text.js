const fs = require('fs');
const s = fs.readFileSync('old_script.js', 'utf8');
const lines = s.split('\n');
let capturing = false;
for (let l of lines) {
  if (l.includes('function kbEditorGetText()')) capturing = true;
  if (capturing) {
    console.log(l);
    if (l.includes('async function searchKb()')) break;
  }
}
