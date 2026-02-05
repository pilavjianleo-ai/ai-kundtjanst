/* AI Kundtjänst – script.js
   Fullständig uppdaterad version – kopiera & klistra in hela filen
   Innehåller: socket.io, onboarding, theme toggle, infinite scroll, 2FA setup
   Senast uppdaterad: Februari 2026
*/

const $ = (id) => document.getElementById(id);

// ────────────────────────────────────────────────
// Global state
// ────────────────────────────────────────────────
const state = {
  apiBase: window.location.origin,      // använder nuvarande origin
  token: localStorage.getItem("token") || "",
  me: null,
  companyId: "demo",
  socket: io.connect(window.location.origin, {
    auth: { token: localStorage.getItem("token") }
  }),
  currentPage: 1,
  currentActivePage: 'inbox',
  theme: localStorage.getItem('theme') || 'dark',
  onboardingStep: 0,
  loadingMore: false,
  tickets: [],
};

// ────────────────────────────────────────────────
// Socket.io events
// ────────────────────────────────────────────────
state.socket.on('connect', () => {
  console.log('Real-time ansluten (Socket.io)');
});

state.socket.on('newTicket', (ticket) => {
  toast('Ny ticket skapad', ticket.publicId || ticket._id || 'okänd');
  loadInboxTickets();
});

state.socket.on('message', (msg) => {
  renderMessage(msg);
});

state.socket.on('subscriptionUpdate', (data) => {
  toast('Abonnemang ändrat', data.status || 'okänd status');
});

// ────────────────────────────────────────────────
// Theme (light/dark) hantering
// ────────────────────────────────────────────────
document.body.setAttribute('data-theme', state.theme);

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
  console.log(`Tema ändrat till: ${state.theme}`);
}

// ────────────────────────────────────────────────
// Onboarding wizard – visas första gången
// ────────────────────────────────────────────────
if (!localStorage.getItem('onboarded')) {
  const onboardingEl = $('onboarding');
  if (onboardingEl) {
    onboardingEl.style.display = 'flex';
    renderOnboardingStep();
  } else {
    console.warn('Onboarding-div hittades inte i DOM');
  }
}

function renderOnboardingStep() {
  const steps = [
    {
      title: 'Välkommen till AI Kundtjänst!',
      content: 'Hantera supportärenden smartare med AI – låt oss komma igång.',
      button: 'Nästa'
    },
    {
      title: 'Steg 1 – Logga in',
      content: 'Använd din e-post och starka lösenord (2FA rekommenderas starkt).',
      button: 'Nästa'
    },
    {
      title: 'Steg 2 – Börja chatta eller hantera tickets',
      content: 'Skapa ny ticket eller svara i befintlig chatt – AI hjälper dig skriva svar.',
      button: 'Nästa'
    },
    {
      title: 'Klart! 🎉',
      content: 'Du är nu redo att använda systemet. Lycka till!',
      button: 'Stäng och börja'
    }
  ];

  const step = steps[state.onboardingStep] || steps[0];
  const contentEl = $('onboarding-content');

  if (contentEl) {
    contentEl.innerHTML = `
      <h2>${step.title}</h2>
      <p>${step.content}</p>
      <button id="nextOnboardingBtn">${step.button}</button>
      ${state.onboardingStep < steps.length - 1 ? '<button id="skipOnboardingBtn">Hoppa över guide</button>' : ''}
    `;

    document.getElementById('nextOnboardingBtn').onclick = () => {
      state.onboardingStep++;
      if (state.onboardingStep >= steps.length) {
        finishOnboarding();
      } else {
        renderOnboardingStep();
      }
    };

    const skipBtn = document.getElementById('skipOnboardingBtn');
    if (skipBtn) {
      skipBtn.onclick = finishOnboarding;
    }
  }
}

function finishOnboarding() {
  const el = $('onboarding');
  if (el) el.style.display = 'none';
  localStorage.setItem('onboarded', 'true');
  console.log('Onboarding avslutad');
}

$('closeOnboarding')?.addEventListener('click', finishOnboarding);

// ────────────────────────────────────────────────
// Event listeners & bindings
// ────────────────────────────────────────────────
function bindEvents() {
  // Theme toggle
  $('themeToggle')?.addEventListener('click', toggleTheme);

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      switchPage(page);
    });
  });

  // Infinite scroll på inbox-listan
  const inboxList = $('inboxTicketsList');
  if (inboxList) {
    inboxList.classList.add('infinite-scroll');
    inboxList.addEventListener('scroll', debounce(() => {
      if (inboxList.scrollTop + inboxList.clientHeight >= inboxList.scrollHeight - 100) {
        loadMoreTickets();
      }
    }, 300));
  }

  // Chat send button
  $('sendChatBtn')?.addEventListener('click', sendChatMessage);
  $('chatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // 2FA setup
  $('setup2faBtn')?.addEventListener('click', async () => {
    try {
      const data = await api('/auth/2fa/setup', { method: 'POST' });

      if (data.secret) {
        alert(
          `2FA hemlighet (lägg till i Google Authenticator / Authy):\n\n` +
          `${data.secret}\n\n` +
          (data.otpauth_url ? `QR-länk: ${data.otpauth_url}` : '')
        );
      }

      if (data.backupCodes && data.backupCodes.length > 0) {
        alert(
          '⚠️ BACKUP-KODER (spara på säkert ställe – visas bara EN GÅNG!)\n\n' +
          data.backupCodes.join('\n') +
          '\n\nSkriv ner dem nu!'
        );
      }

      toast('2FA konfiguration klar', 'success');
    } catch (err) {
      console.error('2FA setup misslyckades:', err);
      toast('Kunde inte aktivera 2FA', 'error');
    }
  });
}

// ────────────────────────────────────────────────
// Infinite scroll – ladda fler tickets
// ────────────────────────────────────────────────
async function loadMoreTickets() {
  if (state.loadingMore) return;
  state.loadingMore = true;

  try {
    state.currentPage++;
    console.log(`Hämtar tickets – sida ${state.currentPage}`);

    // ← Här ska din riktiga API-anrop in
    // Exempel:
    // const tickets = await api(`/tickets?page=${state.currentPage}&limit=20`);
    // tickets.forEach(t => {
    //   const li = document.createElement('li');
    //   li.textContent = t.subject || t.publicId;
    //   $('inboxTicketsList').appendChild(li);
    // });

    // Temporär simulering
    await new Promise(r => setTimeout(r, 1200));
    console.log('Simulerade hämtning klar');
  } catch (err) {
    console.error('Fel vid infinite scroll:', err);
  } finally {
    state.loadingMore = false;
  }
}

// ────────────────────────────────────────────────
// Hjälpfunktioner
// ────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ────────────────────────────────────────────────
// Placeholder-funktioner – ersätt med dina riktiga implementationer
// ────────────────────────────────────────────────
function toast(message, type = 'info') {
  const container = $('toastContainer') || createToastContainer();

  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;
  toastEl.innerHTML = `
    <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toastEl);

  setTimeout(() => {
    toastEl.style.opacity = '0';
    setTimeout(() => toastEl.remove(), 300);
  }, 3000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function renderMessage(msg) {
  const chatMessages = $('chatMessages');
  if (!chatMessages) return;

  const messageEl = document.createElement('div');
  messageEl.className = `message ${msg.isAI ? 'ai-message' : 'user-message'}`;
  messageEl.innerHTML = `
    <div class="message-avatar">
      <i class="fas ${msg.isAI ? 'fa-robot' : 'fa-user'}"></i>
    </div>
    <div class="message-content">
      <p>${msg.content || msg.message}</p>
      <span class="message-time">${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  `;

  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function api(endpoint, options = {}) {
  try {
    const res = await fetch(state.apiBase + endpoint, {
      ...options,
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

function loadInboxTickets() {
  // Simulerar att ladda tickets (ersätt med din riktiga API-call)
  console.log('Laddar inbox tickets...');

  // Exempel: lägg till en ny ticket i listan
  const ticketsList = $('inboxTicketsList');
  if (!ticketsList) return;

  // Här skulle du anropa din API och rendera tickets
  // const tickets = await api('/tickets');
  // tickets.forEach(ticket => renderTicket(ticket));
}

// ────────────────────────────────────────────────
// Page Navigation
// ────────────────────────────────────────────────
function switchPage(pageName) {
  // Dölj alla pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  // Visa vald page
  const targetPage = $(`${pageName}-page`);
  if (targetPage) {
    targetPage.classList.add('active');
  }

  // Uppdatera navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.page === pageName) {
      item.classList.add('active');
    }
  });

  // Uppdatera page title
  const pageTitle = $('pageTitle');
  if (pageTitle) {
    const titles = {
      inbox: 'Inbox',
      chat: 'Chat',
      tickets: 'Tickets',
      settings: 'Inställningar'
    };
    pageTitle.textContent = titles[pageName] || pageName;
  }

  state.currentActivePage = pageName;
}

// ────────────────────────────────────────────────
// Chat Functions
// ────────────────────────────────────────────────
async function sendChatMessage() {
  const input = $('chatInput');
  if (!input || !input.value.trim()) return;

  const message = input.value.trim();
  input.value = '';

  // Visa användarens meddelande
  renderMessage({ content: message, isAI: false });

  try {
    // Skicka till AI (om token finns)
    if (state.token) {
      const response = await api('/chat', {
        method: 'POST',
        body: JSON.stringify({ message })
      });

      // Visa AI-svar
      renderMessage({ content: response.reply, isAI: true });

      // Visa sentiment om negativt
      if (response.sentiment === 'negative') {
        toast('Negativt sentiment upptäckt - ärendet eskaleras', 'warning');
      }
    } else {
      // Demo-svar om ingen token
      setTimeout(() => {
        renderMessage({
          content: 'Hej! Detta är en demo. Logga in för att använda AI-assistenten.',
          isAI: true
        });
      }, 500);
    }
  } catch (error) {
    console.error('Chat error:', error);
    toast('Kunde inte skicka meddelande', 'error');
  }
}

// ────────────────────────────────────────────────
// Start / init
// ────────────────────────────────────────────────
function init() {
  bindEvents();
  loadInboxTickets();
  console.log('AI Kundtjänst frontend startad – version 2026');
  toast('Välkommen till AI Kundtjänst!', 'info');
}

init();