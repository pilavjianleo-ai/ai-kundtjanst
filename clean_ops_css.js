const fs = require('fs');
let code = fs.readFileSync('public/ops.css', 'utf8');

const regexesToRemove = [
  /\.opsInsights\s*{[\s\S]*?}/,
  /\.opsInsightsHead\s*{[\s\S]*?}/,
  /\.opsInsightsGrid\s*{[\s\S]*?}/,
  /\.opsInsightCard\s*{[\s\S]*?}/,
  /\.opsInsightMeta\s*{[\s\S]*?}/,
  /\.opsInsightFooter\s*{[\s\S]*?}/,
  /\.opsInsightFooterLeft\s*{[\s\S]*?}/,
  /\.opsConfidence\s*{[\s\S]*?}/,
  /\.opsImpact\s*{[\s\S]*?}/,
  /\.opsFeed\s*{[\s\S]*?}/,
  /\.opsFeedItem\s*{[\s\S]*?}/,
  /\.opsFeedIcon\s*{[\s\S]*?}/,
  /\.opsFeedBody\s*{[\s\S]*?}/,
  /\.opsFeedTitle\s*{[\s\S]*?}/,
  /\.opsFeedMeta\s*{[\s\S]*?}/,
  /\.opsList\s*{[\s\S]*?}/,
  /\.opsListItem[^{]*{[\s\S]*?}/g, // matches hover, active etc
  /\.opsInsightTitle\s*{[\s\S]*?}/,
  /\.opsInsightBody\s*{[\s\S]*?}/,
  /\.opsInsightCta\s*{[\s\S]*?}/,
  /\.opsContent\s*{[\s\S]*?}/,
  /\.opsGrid2\s*{[\s\S]*?}/,
  /\.opsGrid3\s*{[\s\S]*?}/,
  /\.opsMiniCard\s*{[\s\S]*?}/,
  /\.opsCard[^{]*{[\s\S]*?}/g,
  /\.opsTable[^{]*{[\s\S]*?}/g,
  /\.opsKpiCard[^{]*{[\s\S]*?}/g,
  /\.opsKpiLabel\s*{[\s\S]*?}/,
  /\.opsKpiValue\s*{[\s\S]*?}/,
  /\.opsKpiMeta\s*{[\s\S]*?}/,
  /\.opsKpiWhy\s*{[\s\S]*?}/,
  /\.opsKpiStrip\s*{[\s\S]*?}/,
  /\.opsTrend[^{]*{[\s\S]*?}/g,
];

for(const rx of regexesToRemove) {
  code = code.replace(rx, '');
}

fs.writeFileSync('public/ops.css', code);
console.log('Cleaned ops.css');