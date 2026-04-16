const fs = require('fs');
let code = fs.readFileSync('public/ops.js', 'utf8');

code = code.replace(/class=\"opsKpiCard\"/g, 'class=\"panel soft kpiCard\"');
code = code.replace(/class=\"opsKpiLabel\"/g, 'class=\"muted small\"');
code = code.replace(/class=\"opsKpiValue\"/g, 'class=\"title\" style=\"font-size:24px; margin-top:8px;\"');
code = code.replace(/class=\"opsKpiMeta\"/g, 'style=\"display:flex; justify-content:space-between; margin-top:10px; font-size:12px; color:var(--muted);\"');
code = code.replace(/class=\"opsKpiWhy\"/g, 'class=\"kpiWhy muted small\" style=\"margin-top:10px;\"');
code = code.replace(/class=\"opsTrend/g, 'class=\"trend');

fs.writeFileSync('public/ops.js', code);
console.log('Done KPIs!');
