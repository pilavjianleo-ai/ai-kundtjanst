
/* Contact Logic & Modal */
const contactModalHTML = `
<div id="contactFormModal" class="modal" style="display:none; align-items:center; justify-content:center; backdrop-filter:blur(5px); z-index:9999; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5);">
  <div class="modalContent" style="width:100%; max-width:480px; padding:30px; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,0.3); background:var(--panel); color:var(--text); border:1px solid var(--border);">
    <div style="text-align:center; margin-bottom:24px;">
        <div style="width:64px; height:64px; background:var(--primary-fade); color:var(--primary); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
            <i class="fa-solid fa-address-card" style="font-size:28px;"></i>
        </div>
        <h3 style="margin:0 0 8px 0; font-size:20px;">Dina kontaktuppgifter</h3>
        <p class="muted" style="margin:0; font-size:14px; line-height:1.5;">För att vi ska kunna hjälpa dig bättre och följa upp ditt ärende.</p>
    </div>

    <form id="contactForm" onsubmit="submitDetails(event)">
        <div class="tabs" style="display:flex; gap:10px; margin-bottom:20px; background:var(--bg); padding:4px; border-radius:10px;">
            <button type="button" class="tab active" onclick="setMode('private')" id="tabPrivate" style="flex:1; padding:10px; border:none; background:var(--panel); border-radius:8px; cursor:pointer; color:var(--text); font-weight:600; box-shadow:0 2px 5px rgba(0,0,0,0.05);">Privat</button>
            <button type="button" class="tab" onclick="setMode('company')" id="tabCompany" style="flex:1; padding:10px; border:none; background:transparent; border-radius:8px; cursor:pointer; color:var(--muted); font-weight:600;">Företag</button>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
            <div>
                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--muted);">Förnamn</label>
                <input type="text" name="name" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); outline:none;" required placeholder="Ditt namn">
            </div>
            <div>
                <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--muted);">Efternamn</label>
                <input type="text" name="surname" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); outline:none;" placeholder="Efternamn">
            </div>
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--muted);">E-post</label>
            <input type="email" name="email" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); outline:none;" required placeholder="namn@exempel.se">
        </div>

        <div style="margin-bottom:15px;">
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--muted);">Telefon</label>
            <input type="tel" name="phone" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); outline:none;" required placeholder="070-123 45 67">
        </div>

        <div id="companyFields" style="display:none; margin-bottom:15px; border-top:1px solid var(--border); padding-top:15px;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div>
                     <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--muted);">Företagsnamn</label>
                     <input type="text" name="orgName" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); outline:none;" placeholder="Företaget AB">
                </div>
                <div>
                     <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--muted);">Org.nr</label>
                     <input type="text" name="orgNr" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); outline:none;" placeholder="556XXX-XXXX">
                </div>
            </div>
        </div>

        <div style="margin-bottom:25px;">
            <label style="display:block; font-size:12px; font-weight:600; margin-bottom:6px; color:var(--muted);">Ärende-ID (frivilligt)</label>
            <input type="text" name="ticketIdInput" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); outline:none;" placeholder="T.ex. T-12345">
        </div>

        <div style="display:flex; gap:12px;">
            <button type="button" class="btn ghost" onclick="skipDetails()" style="flex:1; background:transparent; border:1px solid var(--border); color:var(--text); padding:12px; border-radius:8px; cursor:pointer; transition:all 0.2s;">Hoppa över</button>
            <button type="submit" class="btn primary" style="flex:2; background:var(--primary); color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-weight:600; box-shadow:0 4px 12px var(--primary-fade); transition:all 0.2s;">Starta Chatt</button>
        </div>
    </form>
  </div>
</div>
`;

// Inject Modal
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', contactModalHTML));
} else {
    document.body.insertAdjacentHTML('beforeend', contactModalHTML);
}

let isCompany = false;

window.setMode = function (mode) {
    isCompany = mode === 'company';
    const btnPriv = document.getElementById('tabPrivate');
    const btnComp = document.getElementById('tabCompany');

    if (isCompany) {
        btnPriv.style.background = 'transparent';
        btnPriv.style.boxShadow = 'none';
        btnPriv.style.color = 'var(--muted)';

        btnComp.style.background = 'var(--panel)';
        btnComp.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
        btnComp.style.color = 'var(--text)';

        document.getElementById('companyFields').style.display = 'block';
    } else {
        btnPriv.style.background = 'var(--panel)';
        btnPriv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
        btnPriv.style.color = 'var(--text)';

        btnComp.style.background = 'transparent';
        btnComp.style.boxShadow = 'none';
        btnComp.style.color = 'var(--muted)';

        document.getElementById('companyFields').style.display = 'none';
    }

    const inputs = document.getElementById('companyFields').querySelectorAll('input');
    inputs.forEach(i => i.required = isCompany);
};

window.triggerContactForm = function () {
    if (window.state && window.state.currentView !== 'chatView') return;
    if (sessionStorage.getItem('contactInfoSkipped') || sessionStorage.getItem('contactInfo')) return;
    const modal = document.getElementById('contactFormModal');
    if (modal) modal.style.display = 'flex';
};

window.skipDetails = function () {
    sessionStorage.setItem('contactInfoSkipped', 'true');
    const modal = document.getElementById('contactFormModal');
    if (modal) modal.style.display = 'none';
};

window.submitDetails = function (e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    data.isCompany = isCompany;

    sessionStorage.setItem('contactInfo', JSON.stringify(data));
    if (window.state) window.state.userContactInfo = data;

    const modal = document.getElementById('contactFormModal');
    if (modal) modal.style.display = 'none';
};

// Initial triggers
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        // Show if chat is empty/start
        if (!document.querySelector(".msg")) {
            window.triggerContactForm();
        }
    }, 100);
});

// Patch global switchCompany to show modal again
// We use a small interval to check if switchCompany exists since script.js loads async
const patchInterval = setInterval(() => {
    if (window.switchCompany && !window.switchCompany._patched) {
        const originalSwitch = window.switchCompany;
        window.switchCompany = async function (id) {
            await originalSwitch(id);

            // Reset session state for new company
            sessionStorage.removeItem('contactInfoSkipped');
            sessionStorage.removeItem('contactInfo');
            if (window.state) window.state.userContactInfo = null;

            // Show form quickly
            setTimeout(window.triggerContactForm, 100);
        };
        window.switchCompany._patched = true;
        clearInterval(patchInterval);
    }
}, 500);
