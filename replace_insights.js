const fs = require('fs');
let code = fs.readFileSync('public/ops.js', 'utf8');

code = code.replace(/class=\"opsInsightTitle\"/g, 'class=\"title\" style=\"font-size:16px;\"');
code = code.replace(/class=\"opsInsightBody\"/g, 'class=\"muted small\" style=\"margin-top:8px; line-height:1.45;\"');
code = code.replace(/class=\"opsInsightMeta\"/g, 'style=\"margin-top:10px; display:flex; gap:10px; align-items:center;\"');
code = code.replace(/class=\"opsInsightFooter\"/g, 'style=\"margin-top:12px; display:flex; gap:10px; align-items:center; justify-content:space-between;\"');
code = code.replace(/class=\"opsInsightFooterLeft\"/g, 'style=\"display:flex; gap:10px; align-items:center; min-width:0;\"');
code = code.replace(/class=\"opsImpact\"/g, 'style=\"font-weight:900; color:var(--text);\"');
code = code.replace(/class=\"opsConfidence\"/g, 'class=\"muted small\" style=\"white-space:nowrap;\"');
code = code.replace(/class=\"opsInsightCta\"/g, 'style=\"margin-top:12px; display:flex; gap:10px; align-items:center;\"');
code = code.replace(/class=\"opsFeed\"/g, 'style=\"display:flex; flex-direction:column; gap:10px;\"');
code = code.replace(/class=\"opsFeedIcon\"/g, 'style=\"width:30px; height:30px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:var(--primary-fade); color:var(--primary); flex:0 0 30px;\"');
code = code.replace(/class=\"opsFeedBody\"/g, 'style=\"flex:1; min-width:0;\"');
code = code.replace(/class=\"opsFeedTitle\"/g, 'style=\"font-weight:900; letter-spacing:-0.01em;\"');
code = code.replace(/class=\"opsFeedMeta\"/g, 'class=\"muted small\" style=\"margin-top:4px;\"');
code = code.replace(/class=\"opsList\"/g, 'style=\"display:flex; flex-direction:column; gap:10px;\"');

fs.writeFileSync('public/ops.js', code);
console.log('Done Insights!');