const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'ai_os.js');
let content = fs.readFileSync(filePath, 'utf-8');

const missingFunctions = `

// ---------------------------------------------------------
// CORE RENDER AND ROUTING LOGIC
// ---------------------------------------------------------

function renderAiOsNav() {
  const nav = document.getElementById("aiOsNav");
  if (!nav) return;

  const routes = [
    { id: 'live-studio', icon: 'fa-flask', label: 'Live Studio' },
    { id: 'chat-experience', icon: 'fa-message', label: 'Chat Experience' },
    { id: 'conversations', icon: 'fa-inbox', label: 'Conversations' },
    { id: 'behavior', icon: 'fa-masks-theater', label: 'AI Behavior' },
    { id: 'rules', icon: 'fa-scale-balanced', label: 'Rule Engine' },
    { id: 'flows', icon: 'fa-network-wired', label: 'Flow Builder' },
    { id: 'knowledge', icon: 'fa-book', label: 'Knowledge' },
    { id: 'training', icon: 'fa-dumbbell', label: 'Training' },
    { id: 'experiments', icon: 'fa-vial', label: 'Experiments' },
    { id: 'performance', icon: 'fa-chart-line', label: 'Performance' }
  ];

  nav.innerHTML = routes.map(r => \`
    <div class="listItem \${currentAiOsRoute === r.id ? 'active' : ''}" 
         onclick="currentAiOsRoute='\${r.id}'; renderAiOsNav(); renderAiOsModule();" 
         style="padding:12px 16px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:12px; font-weight:\${currentAiOsRoute === r.id ? '700' : '500'}; color:\${currentAiOsRoute === r.id ? 'var(--primary)' : 'var(--text)'};">
      <div style="width:24px; text-align:center;"><i class="fa-solid \${r.icon}"></i></div>
      \${r.label}
    </div>
  \`).join('');
}

function renderAiOsModule() {
  const main = document.getElementById("aiOsMainWorkspace");
  const right = document.getElementById("aiOsRightPanel");
  if (!main || !right) return;

  switch(currentAiOsRoute) {
    case 'live-studio': renderOsLiveStudio(main, right); break;
    case 'chat-experience': renderOsChatExperience(main, right); break;
    case 'conversations': renderOsConversations(main, right); break;
    case 'behavior': renderOsBehavior(main, right); break;
    case 'rules': renderOsRules(main, right); break;
    case 'flows': renderOsFlows(main, right); break;
    case 'knowledge': renderOsKnowledge(main, right); break;
    case 'training': renderOsTraining(main, right); break;
    case 'experiments': renderOsExperiments(main, right); break;
    case 'performance': renderOsPerformance(main, right); break;
    case 'logs': renderOsLogs(main, right); break;
    default: renderOsLiveStudio(main, right); break;
  }
}

window.initAiOs = async function() {
  if (!aiOsInitialized) {
    await window.AiOsEngine.loadConfig();
    aiOsInitialized = true;
  }
  renderAiOsNav();
  renderAiOsModule();
};

window.gotoAiOs = async function(route) {
  if (typeof ops !== 'undefined') ops.route = "ai-control-center";
  currentAiOsRoute = route || "live-studio";
  const aiOsView = document.getElementById("aiOsView");
  if (aiOsView) {
    aiOsView.style.display = "flex";
  }
  await initAiOs();
};

window.closeAiOs = function() {
  const aiOsView = document.getElementById("aiOsView");
  if (aiOsView) aiOsView.style.display = "none";
  if (typeof setRoute === 'function') setRoute("overview");
};
`;

if (!content.includes('function renderAiOsNav()')) {
  content += missingFunctions;
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Restored missing render functions');
}
