/* =====================
   CRM ENHANCEMENTS V9: TRUE CLOUD SYNC & RESPONSIVE FIX
   ===================== */

// Ensure global state exists
if (typeof window.crmState === 'undefined') {
    window.crmState = {
        customers: JSON.parse(localStorage.getItem('crmCustomers') || '[]'),
        deals: JSON.parse(localStorage.getItem('crmDeals') || '[]'),
        activities: JSON.parse(localStorage.getItem('crmActivities') || '[]')
    };
}

/**
 * SYNC CRM DATA WITH BACKEND (Multi-device support)
 */
window.syncCrmData = async function (manual = false) {
    if (!window.api || !window.state || !window.state.token) return;
    const companyId = window.state.companyId || (window.state.me ? window.state.me.companyId : 'demo');

    if (manual) console.log("🔄 Manual Sync initiated...");

    try {
        const data = await api(`/crm/sync?companyId=${companyId}`);
        if (data) {
            // Priority: Backend data overwrites local if exists, ensuring sync
            if (data.customers) {
                localStorage.setItem('crmCustomers', JSON.stringify(data.customers));
                if (typeof crmState !== 'undefined') crmState.customers = data.customers;
            }
            if (data.deals) {
                localStorage.setItem('crmDeals', JSON.stringify(data.deals));
                if (typeof crmState !== 'undefined') crmState.deals = data.deals;
            }
            if (data.activities) {
                localStorage.setItem('crmActivities', JSON.stringify(data.activities));
                if (typeof crmState !== 'undefined') crmState.activities = data.activities;
            }

            if (typeof renderCrmDashboard === 'function') renderCrmDashboard();
            if (typeof renderCustomerList === 'function') renderCustomerList();
            if (typeof renderPipeline === 'function') renderPipeline();
            if (typeof populateAiCostCustomers === 'function') populateAiCostCustomers();
            if (typeof calculateAiMargins === 'function') calculateAiMargins();

            updateChatCategoriesFromCRM();
        }
    } catch (e) {
        console.error("CRM Sync Error:", e.message);
    }
};

/**
 * PUSH CRM DATA TO BACKEND
 */
window.pushCrmToBackend = async function (type) {
    if (!window.api || !window.state || !window.state.token || !window.state.me) return;
    const companyId = window.state.companyId || (window.state.me ? window.state.me.companyId : 'demo');

    try {
        if (type === 'customers' || !type) {
            const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
            await api('/crm/customers/sync', {
                method: 'POST',
                body: { companyId, customers }
            });
        }
        if (type === 'deals' || !type) {
            const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
            await api('/crm/deals/sync', {
                method: 'POST',
                body: { companyId, deals }
            });
        }
        if (type === 'activities' || !type) {
            const activities = JSON.parse(localStorage.getItem('crmActivities') || '[]');
            // Filter to only send recent ones if needed, or just send provide
            await api('/crm/activities/sync', {
                method: 'POST',
                body: { companyId, activities: activities.slice(0, 50) }
            });
        }
    } catch (e) {
        console.error("Cloud Push Failed:", e.message);
    }
};

// Auto-sync when window gains focus
window.addEventListener('focus', () => {
    if (window.state && window.state.token) {
        window.syncCrmData();
    }
});

/**
 * Sync CRM Customers (AI Active) to Chat Dropdown
 */
function updateChatCategoriesFromCRM() {
    const select = document.getElementById('categorySelect');
    if (!select) return;

    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    const aiCustomers = customers.filter(c => c.aiConfig && c.aiConfig.status === 'active');

    const existingOptions = Array.from(select.options).map(o => o.value);

    aiCustomers.forEach(c => {
        if (!existingOptions.includes(c.id) && !existingOptions.includes(c.name)) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.innerText = c.name + " (AI)";
            select.appendChild(opt);
        }
    });
}

/**
 * Helper for Accordion UI
 */
window.toggleAccordion = function (id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (el) {
        const isHidden = el.style.display === 'none';
        el.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            el.animate([{ opacity: 0, transform: 'translateY(-5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' });
        }
        if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
};

/**
 * Render CRM Dashboard Stats (Aggregated & Filtered)
 */
function renderCrmDashboard() {
    const dash = document.getElementById('crm_dashboard');
    if (!dash) return;

    let deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    let customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    let activities = JSON.parse(localStorage.getItem('crmActivities') || '[]');

    // Filter Logic based on Active Company (if applicable logic exists)
    const activeCompanyId = window.state?.companyId;
    if (activeCompanyId && activeCompanyId !== 'demo') {
        const hasLinkedData = customers.some(c => c.companyId === activeCompanyId || c.id === activeCompanyId);
        if (hasLinkedData) {
            customers = customers.filter(c => c.companyId === activeCompanyId || c.id === activeCompanyId);
            // Naive filter for deals - purely illustrative if linking exists
            deals = deals.filter(d => customers.some(c => c.id === d.customerId));
        }
    }

    // 1. Pipeline Value (Weighted Revenue if applicable, else raw)
    const totalValue = deals.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0);

    // 2. Open Deals Count
    const openDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;

    // 3. Hot Leads (Improved Logic: Activity + AI Score)
    const hotLeads = customers.filter(c => (c.aiScore || 0) > 70 && c.status === 'lead').length;

    // 4. Monthly Revenue (ARR/12 or MRR field)
    // We sum the 'value' field from Customers which represents their deal value / MRR
    const monthlyRevenue = customers.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);

    // Update UI Cards
    const cards = document.querySelectorAll('.crmStatCard');
    if (cards.length >= 3) {
        // Pipeline
        const val1 = cards[0].querySelector('.crmStatValue');
        if (val1) val1.innerText = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumSignificantDigits: 3 }).format(totalValue);

        // Hot Leads
        const val2 = cards[1].querySelector('.crmStatValue');
        if (val2) val2.innerText = hotLeads + " st";
        const trend2 = cards[1].querySelector('.crmStatTrend');
        if (trend2) trend2.innerText = hotLeads > 0 ? `${hotLeads} heta leads att bearbeta` : "Inga heta leads just nu";

        // Monthly Revenue
        const val3 = cards[2].querySelector('.crmStatValue');
        if (val3) val3.innerText = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(monthlyRevenue);
    }

    // Refresh Activity Timeline
    renderActivityTimeline(activities);
}

function renderActivityTimeline(activities) {
    const feed = document.querySelector('.activityTimeline');
    if (!feed) return;

    const sorted = activities.sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 20);
    if (sorted.length === 0) {
        feed.innerHTML = `<div class="muted center" style="padding:20px; font-size:13px;">Inga aktiviteter loggade än.</div>`;
        return;
    }

    const listItemsHtml = sorted.map((a) => {
        let iconClass = "fa-info-circle";
        if (a.type === 'chat') iconClass = "fa-comment-dots";
        if (a.type === 'ticket') iconClass = "fa-ticket";
        if (a.type === 'success') iconClass = "fa-check-circle";
        if (a.type === 'warning') iconClass = "fa-exclamation-triangle";
        if (a.type === 'deal') iconClass = "fa-handshake";

        return `
        <div class="activityItem" style="display:flex; align-items:flex-start; gap:12px; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border);">
            <div style="width:28px; height:28px; border-radius:50%; background:var(--panel2); display:flex; align-items:center; justify-content:center; border:1px solid var(--border); flex-shrink:0;">
                <i class="fa-solid ${iconClass}" style="font-size:12px; color:var(--primary);"></i>
            </div>
            <div style="flex:1;">
                <div style="font-weight:600; font-size:13px; color:var(--text);">${a.subject}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:3px;">
                    ${new Date(a.created).toLocaleString('sv-SE')} • ${a.type?.toUpperCase()}
                </div>
            </div>
        </div>`;
    }).join('');

    feed.innerHTML = `
        <div class="accordion-item" style="border:1px solid var(--border); border-radius:12px; background:var(--panel2); overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
            <div class="accordion-header" onclick="toggleAccordion('crmTimelineBody')" style="padding:15px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; background:var(--panel); transition:all 0.2s;">
                <div style="display:flex; align-items:center; gap:10px; font-weight:700; color:var(--text); font-size:14px;">
                    <i class="fa-solid fa-clock-rotate-left" style="color:var(--primary);"></i> 
                    Senaste Händelser
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="pill muted" style="font-size:10px; background:var(--bg); border:1px solid var(--border);">${sorted.length} st</span>
                    <i class="fa-solid fa-chevron-down accordion-icon" id="icon-crmTimelineBody" style="font-size:12px; transition:transform 0.3s; color:var(--muted);"></i>
                </div>
            </div>
            <div id="crmTimelineBody" class="accordion-content" style="display:none; padding:15px; max-height:420px; overflow-y:auto; background:var(--bg);">
                ${listItemsHtml}
            </div>
        </div>
    `;
}

// Populate AI Cost Analysis Customer Select
// Populate AI Cost Analysis Customer Select
window.populateAiCostCustomers = function () {
    const costSelect = document.getElementById('aiCostCustomerSelect');
    if (!costSelect) return;

    const customers = window.crmState?.customers || JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    const currentVal = costSelect.value || 'all';
    const categoryName = window.state?.currentCompany?.displayName || 'Kategorin';

    let html = `<option value="all">Hela ${categoryName} (Kategori)</option>`;
    customers.forEach(c => {
        // Use loose equality for safety if IDs are numbers/strings mixed
        const isSelected = c.id == currentVal;
        html += `<option value="${c.id}" ${isSelected ? 'selected' : ''}>${c.name}</option>`;
    });
    costSelect.innerHTML = html;

    // Add listener if not exists to auto-adjust chats per day
    if (!costSelect.dataset.listener) {
        costSelect.addEventListener('change', () => {
            const val = costSelect.value;
            if (val === 'all') {
                const totalTickets = window.crmData?.stats?.totalTickets || 0;
                // Default fallback if no stats
                const daily = totalTickets > 0 ? Math.round(totalTickets / 30) : 100;
                const volInput = document.getElementById('aiCostVolume');
                if (volInput) volInput.value = Math.max(1, daily);
            }
            if (typeof window.calculateAiMargins === 'function') {
                window.calculateAiMargins();
            }
        });
        costSelect.dataset.listener = "true";
    }
};

// INITIAL RUN
setTimeout(() => {
    window.populateAiCostCustomers();
    if (window.calculateAiMargins) window.calculateAiMargins();
}, 500);

/**
 * AI COST TOOL LOGIC - DATA DRIVEN CALCULATIONS
 */
const AI_CONFIG = {
    exchange_rate: 11.5, // 1 USD = 11.5 SEK
    // Prices in USD per 1,000,000 tokens (EXACT from user)
    model_prices: {
        mini: { in: 0.25, out: 2.00 },     // GPT-5-mini
        standard: { in: 1.25, out: 10.00 }, // GPT-5
        advanced: { in: 2.00, out: 8.00 }   // GPT-4.1
    }
};

window.syncAiSplits = function (source) {
    const miniVal = parseInt(document.getElementById('splitMini').value || 0);
    const gpt5Val = parseInt(document.getElementById('splitGpt5').value || 0);
    const gpt4Val = parseInt(document.getElementById('splitGpt4').value || 0);

    const total = miniVal + gpt5Val + gpt4Val;

    if (document.getElementById('valMini')) document.getElementById('valMini').innerText = miniVal + '%';
    if (document.getElementById('valGpt5')) document.getElementById('valGpt5').innerText = gpt5Val + '%';
    if (document.getElementById('valGpt4')) document.getElementById('valGpt4').innerText = gpt4Val + '%';

    const note = document.getElementById('marginNote');
    if (note) {
        if (total !== 100) {
            note.innerText = `OBS! Fördelningen är ${total}%. Måste vara 100% för korrekt routing.`;
            note.style.color = 'var(--danger)';
        } else {
            note.innerText = 'Beräknat efter viktad LLM-routing';
            note.style.color = 'var(--muted)';
        }
    }

    if (window.calculateAiMargins) {
        window.calculateAiMargins();
    } else {
        console.error("calculateAiMargins not found!");
    }
};

window.calculateAiMargins = function () {
    const customerId = document.getElementById('aiCostCustomerSelect')?.value || 'all';

    // READ USER INPUTS
    const volume_input = parseFloat(document.getElementById('aiCostVolume')?.value || 100);
    const tokens_input = parseFloat(document.getElementById('aiCostTokens')?.value || 1500);

    // Read Model Split from Sliders (User adjustable)
    let valMini = parseInt(document.getElementById('splitMini')?.value || 70);
    let valGpt5 = parseInt(document.getElementById('splitGpt5')?.value || 25);
    let valGpt4 = parseInt(document.getElementById('splitGpt4')?.value || 5);

    // Normalize to ensure strict 100% sum if user drags weirdly (optional safety, or just trust inputs)
    // For now, trust inputs but use them as weights
    const totalSplit = valMini + valGpt5 + valGpt4;
    const SHARE_MINI = valMini / 100;
    const SHARE_STD = valGpt5 / 100;
    const SHARE_ADV = valGpt4 / 100;

    const MOMS_SATS = 0.25;

    // 2. KOSTNADER (Hämta från config)
    const exch = AI_CONFIG.exchange_rate || 11.5;
    const p = AI_CONFIG.model_prices;

    // Hjälpfunktion: Kostnad per chatt för en modell
    const getCostPerChat = (modelPrice) => {
        // Pris i USD per 1M tokens. Snitt av in/ut.
        const avgPriceUsdPerMillion = (modelPrice.in + modelPrice.out) / 2;
        // (Tokens / 1M) * Pris * Växelkurs
        return (tokens_input / 1000000) * avgPriceUsdPerMillion * exch;
    };

    const cost_mini = getCostPerChat(p.mini);
    const cost_std = getCostPerChat(p.standard);
    const cost_adv = getCostPerChat(p.advanced);

    // 3A. VIKTAD LLM-KOSTNAD PER CHATT (EXKL. MOMS)
    // Cost based on user selected split
    const cost_per_chat_sek = (SHARE_MINI * cost_mini) +
        (SHARE_STD * cost_std) +
        (SHARE_ADV * cost_adv);

    // 4. DATAHÄMTNING (KATEGORI / KUND)
    const customers = window.crmState?.customers || [];
    let total_revenue_exkl_moms = 0;
    let total_chattar_manad = volume_input * 30; // Månadsvolym baserat på input

    if (customerId === 'all') {
        // "Hela kategorin" = SUMMERING av alla kunders värden
        total_revenue_exkl_moms = customers.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);
    } else {
        const c = customers.find(x => x.id == customerId);
        total_revenue_exkl_moms = parseFloat(c?.value || 0);
    }

    // 5. BERÄKNINGAR (Enligt spec)

    // C. Total LLM-kostnad (EXKL. moms)
    const total_llm_cost = cost_per_chat_sek * total_chattar_manad;

    // D. Intäkt
    const intakt_exkl_moms = total_revenue_exkl_moms;
    const moms_belopp = intakt_exkl_moms * MOMS_SATS;
    // Brutto Intäkt (mot kund) = Intäkt exkl moms + moms
    const intakt_inkl_moms = intakt_exkl_moms + moms_belopp;

    // E. Brutto & Netto (Enligt user def: Brutto=Intäkt, Netto=Vinst)
    const marginal_sek = intakt_exkl_moms - total_llm_cost;

    // F. Marginal % (Baseras ALLTID på exkl. moms)
    let marginal_procent = 0;
    if (intakt_exkl_moms > 0) {
        marginal_procent = (marginal_sek / intakt_exkl_moms) * 100;
    }

    // 6. UPDATE UI
    const fmt = (v) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(v);
    const fmtPct = (v) => v.toFixed(1) + '%';

    // Update Text Elements
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    // Mappa mot UI-elementen
    setTxt('resGrossRevenue', fmt(intakt_inkl_moms)); // UI Label: "Brutto Intäkt (Inkl. moms)"
    setTxt('resNetRevenue', fmt(intakt_exkl_moms));   // UI Label: "Netto Intäkt (Exkl. moms)"
    setTxt('resAiCost', fmt(total_llm_cost));
    setTxt('resMarginValue', fmt(marginal_sek));      // UI Label: "Netto Vinst (Månad)"
    setTxt('resMarginPercentBox', fmtPct(marginal_procent)); // UI Label: "Bruttomarginal (%)"

    setTxt('resAvgChatCost', cost_per_chat_sek.toFixed(2) + ' kr');
    setTxt('resExchRate', exch.toFixed(2));

    // Update UI Count
    const countEl = document.getElementById('ui_count');
    if (countEl) countEl.innerText = total_chattar_manad.toLocaleString();

    // UPDATE SLIDER LABELS ONLY (Do NOT force values)
    setTxt('valMini', valMini + '%');
    setTxt('valGpt5', valGpt5 + '%');
    setTxt('valGpt4', valGpt4 + '%');

    // Color coding for margin
    const pctBox = document.getElementById('resMarginPercentBox');
    if (pctBox) {
        pctBox.style.color = marginal_procent > 20 ? 'var(--ok)' : (marginal_procent > 0 ? 'var(--warn)' : 'var(--danger)');
    }

    const note = document.getElementById('marginNote');
    if (note) {
        if (totalSplit !== 100) {
            note.innerText = `OBS: Summan är ${totalSplit}% (Bör vara 100%)`;
            note.style.color = 'var(--warn)';
        } else {
            note.innerText = `Marginal beräknad på Netto Intäkt (Exkl. moms)`;
            note.style.color = 'var(--muted)';
        }
    }

    // Breakdown costs
    setTxt('breakMini', fmt(total_chattar_manad * SHARE_MINI * cost_mini));
    setTxt('breakGpt5', fmt(total_chattar_manad * SHARE_STD * cost_std));
    setTxt('breakGpt4', fmt(total_chattar_manad * SHARE_ADV * cost_adv));
};

/**
 * Log Helper for CRM Activities
 */
function logCrmActivity(subject, type = 'system') {
    const activities = JSON.parse(localStorage.getItem('crmActivities') || '[]');
    activities.push({
        type,
        subject,
        created: new Date().toISOString()
    });
    localStorage.setItem('crmActivities', JSON.stringify(activities));
    renderCrmDashboard();

    // CRM Cloud Push
    if (window.pushCrmToBackend) window.pushCrmToBackend('activities');
}

/**
 * Enhanced Loader for AI Deployment
 */
async function runDeploymentSequence(customerName) {
    const overlay = document.getElementById('aiDeployOverlay');
    const text = document.getElementById('aiDeployText');
    const sub = document.getElementById('aiDeploySub');
    const bar = document.getElementById('aiDeployBar');
    if (!overlay) return;

    overlay.style.display = 'flex';
    if (bar) bar.style.width = '0%';

    const steps = [
        { t: "Initierar backend...", s: `Registrerar ${customerName} i databasen`, p: '20%' },
        { t: "Konfigurerar AI-modell...", s: "Optimerar GPT-4o för kundservice", p: '40%' },
        { t: "Skapar kunskapsbas...", s: "Förbereder vektor-databas för KB", p: '65%' },
        { t: "Aktiverar Chat-widget...", s: "Genererar unika API-nycklar", p: '85%' },
        { t: "Slutför installation...", s: "Nästan klar...", p: '100%' }
    ];

    for (let i = 0; i < steps.length; i++) {
        text.innerText = steps[i].t;
        sub.innerText = steps[i].s;
        if (bar) bar.style.width = steps[i].p;
        await new Promise(r => setTimeout(r, 700));
    }

    await new Promise(r => setTimeout(r, 300));
    overlay.style.display = 'none';
}

// === OVERRIDES & INTEGRATION ===

window.saveNewCustomerExpanded = async function () {
    const name = document.getElementById('custName')?.value?.trim();
    const orgNr = document.getElementById('custOrgNr')?.value?.trim();
    const industry = document.getElementById('custIndustry')?.value?.trim();
    const web = document.getElementById('custWeb')?.value?.trim();
    const status = document.getElementById('custStatus')?.value || 'customer';
    const owner = document.getElementById('custOwner')?.value || 'me';
    const notes = document.getElementById('custNotes')?.value?.trim();

    const contactFirst = document.getElementById('custContactFirst')?.value?.trim();
    const contactLast = document.getElementById('custContactLast')?.value?.trim();
    const email = document.getElementById('custEmail')?.value?.trim();
    const phone = document.getElementById('custPhone')?.value?.trim();
    const role = document.getElementById('custRole')?.value?.trim();

    const address = document.getElementById('custAddress')?.value?.trim();
    const zip = document.getElementById('custZip')?.value?.trim();
    const city = document.getElementById('custCity')?.value?.trim();
    const country = document.getElementById('custCountry')?.value || 'SE';

    const aiDeploy = document.getElementById('custAiDeploy')?.checked;
    const aiModel = document.getElementById('custAiModel')?.value;
    const aiLang = document.getElementById('custAiLang')?.value;

    if (!name) {
        toast("Fel", "Företagsnamn krävs!", "error");
        return;
    }

    const companyId = name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);

    // Create in Backend
    try {
        if (typeof api === 'function' && state.token) {
            await api("/admin/companies", {
                method: "POST",
                body: {
                    displayName: name,
                    companyId: companyId,
                    contactEmail: email,
                    phone: phone,
                    industry: industry,
                    orgNr: orgNr,
                    notes: notes || `Skapad via CRM. Bransch: ${industry}`
                }
            });
        }
    } catch (e) {
        console.error("Backend creation failed:", e.message);
        toast("System-notis", "Kunde inte registrera i backend, men sparar lokalt.", "warning");
    }

    const newCustomer = {
        id: companyId,
        name, email, phone, industry, web, orgNr,
        contactName: `${contactFirst} ${contactLast}`.trim(),
        contactFirst: contactFirst || '',
        contactLast: contactLast || '',
        role: role || '',
        address: { street: address, zip, city, country },
        status: status,
        owner: owner,
        notes: notes,
        value: 0,
        aiScore: Math.floor(Math.random() * 40) + 60,
        aiConfig: aiDeploy ? {
            status: 'active',
            model: aiModel,
            lang: aiLang,
            deployedAt: new Date().toISOString()
        } : { status: 'inactive' },
        created: new Date().toISOString()
    };

    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    customers.push(newCustomer);
    localStorage.setItem('crmCustomers', JSON.stringify(customers));

    // CRM Cloud Push
    if (window.pushCrmToBackend) window.pushCrmToBackend('customers');

    logCrmActivity(`Ny kund och systembolag skapat: ${name}`, 'success');

    if (aiDeploy) {
        await runDeploymentSequence(name);
    }

    if (window.closeCrmModal) window.closeCrmModal('crmAddCustomerModal');

    if (typeof loadCompanies === 'function') await loadCompanies();
    updateChatCategoriesFromCRM();
    renderCrmDashboard();
    if (window.renderCustomerList) window.renderCustomerList();

    toast("Klart!", `Kund ${name} är nu skapad och integrerad.`, "success");
}

/**
 * Render Pipeline Board
 */
window.renderPipeline = function () {
    // Map internal stage IDs to DOM IDs used in index.html (e.g. pipelineBody-new)
    // Based on HTML structure seen in view_file.
    const stageMap = {
        'new': 'pipelineBody-new', // Assuming ID exists or we need to find mapped element
        'contact': 'contact', // Verify if this matches HTML 
        'demo': 'pipelineBody-demo', // Seen in HTML? No, let's check structure
        // Actually, HTML showed: id="pipelineBody-proposal", "pipelineBody-negotiation"
        // So pattern is likely pipelineBody-[stage]
    };

    const stages = [
        { id: 'new', label: 'Nytt Lead', prob: 10 },
        { id: 'contact', label: 'Kontakt Etablerad', prob: 30 },
        { id: 'demo', label: 'Demo / Möte', prob: 50 },
        { id: 'proposal', label: 'Offert Skickad', prob: 70 },
        { id: 'negotiation', label: 'Förhandling', prob: 90 },
        { id: 'won', label: 'Stängd Affär', prob: 100 },
        { id: 'lost', label: 'Förlorad', prob: 0 }
    ];

    let deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    let customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');

    // FILTER BY ACTIVE COMPANY
    const activeCompanyId = window.state?.companyId;
    if (activeCompanyId && activeCompanyId !== 'demo') {
        const companyCustomers = customers.filter(c => c.companyId === activeCompanyId || c.id === activeCompanyId);
        const customerIds = companyCustomers.map(c => c.id);
        deals = deals.filter(d => customerIds.includes(d.customerId) || d.companyId === activeCompanyId);
    }

    stages.forEach(stage => {
        // Find container by ID pattern
        let container = document.getElementById('pipelineBody-' + stage.id);

        // Fallback: Try finding by class if IDs are missing (Common in some templates)
        // usage: <div class="pipelineColumn"> ... <div class="pipelineBody">
        // But we need to know WHICH column. Let's assume IDs exist as per previous view_file.

        if (!container) return; // Skip if DOM element missing

        const stageDeals = deals.filter(d => d.stage === stage.id);
        const stageSum = stageDeals.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0);

        // INJECT SUMMARY INTO HEADER
        // The header is the previous sibling of the body container
        // <div class="pipelineHeader">...</div>
        // <div id="pipelineBody-..." ...>
        const header = container.previousElementSibling;
        if (header && header.classList.contains('pipelineHeader')) {
            // Check for existing sum element or create
            let sumEl = header.querySelector('.stageSum');
            if (!sumEl) {
                sumEl = document.createElement('span');
                sumEl.className = 'stageSum';
                sumEl.style.fontSize = '11px';
                sumEl.style.color = 'var(--muted)';
                sumEl.style.marginLeft = '10px';
                sumEl.style.float = 'right';
                header.appendChild(sumEl);
            }
            sumEl.innerText = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumSignificantDigits: 2 }).format(stageSum);

            // Update count
            let countEl = header.querySelector('.stageCount');
            if (countEl) countEl.innerText = stageDeals.length;
        }

        // RENDER CARDS
        container.innerHTML = stageDeals.map(d => {
            const c = customers.find(cust => cust.id === d.customerId);
            const customerName = c ? c.name : (d.customerName || 'Okänd Kund');

            // Churn/Stagnant Warning (Simulated)
            let warningHtml = '';
            if (d.stage !== 'won' && Math.random() > 0.8) {
                warningHtml = `<i class="fa-solid fa-triangle-exclamation" style="color:orange; margin-left:5px;" title="Varning: Ingen aktivitet"></i>`;
            }

            return `
            <div class="dealCard" draggable="true" ondragstart="drag(event, '${d.id}')" onclick="openDealModal('${d.id}')" id="deal-${d.id}" style="
                background:var(--panel); 
                padding:12px; 
                margin-bottom:10px; 
                border-radius:8px; 
                border:1px solid var(--border); 
                cursor:grab; 
                box-shadow:0 2px 5px rgba(0,0,0,0.02);
                transition:transform 0.2s;
            ">
                <div class="dealCompany" style="font-size:13px; font-weight:600; margin-bottom:4px; display:flex; justify-content:space-between;">
                    ${d.title} ${warningHtml}
                </div>
                <div style="font-size:11px; color:var(--muted); margin-bottom:8px;">${customerName}</div>
                
                <div class="dealFooter" style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                     <div class="dealValue" style="font-weight:700; color:var(--primary); font-size:12px;">
                        ${new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumSignificantDigits: 3 }).format(d.value)}
                     </div>
                     <div class="dealTags">
                        <span class="pill small" style="background:rgba(0,0,0,0.05); color:var(--text-muted); font-size:9px; padding:2px 6px;">${stage.prob}%</span>
                     </div>
                </div>
            </div>`;
        }).join('');
    });
};

window.renderCustomerList = function () {
    const tbody = document.getElementById('crmAnalyticsTable');
    if (!tbody) return;

    let customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');

    // FILTER BY CURRENT COMPANY CONTEXT
    const activeCompanyId = window.state?.companyId;
    if (activeCompanyId && activeCompanyId !== 'demo') {
        const hasLinkedData = customers.some(c => c.companyId === activeCompanyId || c.id === activeCompanyId);
        if (hasLinkedData) {
            customers = customers.filter(c => c.companyId === activeCompanyId || c.id === activeCompanyId);
        }
    }

    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="muted center" style="padding:20px;">Inga kunder hittades för ${window.state?.currentCompany?.displayName || 'detta företag'}.</td></tr>`;
        ['crmTotalValueHeader', 'crmTotalValueFooter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = '0 kr';
        });
        const countHeader = document.getElementById('crmTotalCustomersHeader');
        if (countHeader) countHeader.innerText = '0 st';
        return;
    }

    let totalValue = 0;
    tbody.innerHTML = customers.map(c => {
        const val = parseFloat(c.value) || 0;
        totalValue += val;
        let scoreColor = c.aiScore > 80 ? 'var(--success)' : (c.aiScore > 50 ? 'orange' : 'var(--text-muted)');
        let statusClass = 'pill ' + (c.status === 'customer' ? 'ok' : (c.status === 'lead' ? 'warn' : 'muted'));

        return `
        <tr onclick="openCustomerModal('${c.id}')" style="cursor:pointer; border-bottom:1px solid var(--border);">
            <td style="padding:12px;"><b>${c.name}</b><br><span class="muted small">${c.industry || '-'}</span></td>
            <td style="padding:12px;"><b>${c.email || '-'}</b><br><span class="muted small">${c.phone || ''} ${c.orgNr ? '• ' + c.orgNr : ''}</span></td>
            <td style="padding:12px;"><span class="${statusClass}">${c.status?.toUpperCase() || 'P'}</span></td>
            <td style="padding:12px; text-align:right;">${new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumSignificantDigits: 3 }).format(val)}</td>
            <td style="padding:12px; text-align:center;"><span style="color:${scoreColor}; font-weight:bold;">${c.aiScore || '-'}</span></td>
            <td style="padding:12px; text-align:right;">
                <button class="btn ghost small icon" onclick="event.stopPropagation(); deleteCustomer('${c.id}')"><i class="fa-solid fa-trash" style="color:var(--danger);"></i></button>
            </td>
        </tr>`;
    }).join('');

    ['crmTotalValueHeader', 'crmTotalValueFooter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(totalValue);
    });
    const countHeader = document.getElementById('crmTotalCustomersHeader');
    if (countHeader) {
        countHeader.innerText = customers.length + " st";
    }
};

window.openCustomerModal = function (id) {
    const modal = document.getElementById('crmCustomerModal');
    if (!modal) return;

    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    const c = customers.find(c => c.id === id);
    if (!c) return;

    document.getElementById('crmModalCustomerName').innerText = c.name;

    // AI LOGIC: Churn Risk & Next Best Action
    // Simulated logic based on activity/status
    let churnRisk = 'Låg';
    let churnColor = 'var(--success)';
    if (c.status === 'customer' && (!c.value || c.value < 5000)) {
        churnRisk = 'Medium';
        churnColor = 'orange';
    }
    if (c.status === 'customer' && (c.aiScore < 50)) {
        churnRisk = 'Hög';
        churnColor = 'var(--danger)';
    }

    let nextAction = "Följ upp avtal";
    if (c.status === 'lead') nextAction = "Boka demo-möte";
    if (c.aiScore > 80) nextAction = "Föreslå uppgradering (Upsell)";
    if (churnRisk === 'Hög') nextAction = "Boka krismöte / Erbjud rabatt";

    const sidebar = modal.querySelector('.customerSidebar');
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="topInfo" style="text-align:center; margin-bottom:20px;">
                <div class="avatar-large" style="width:80px; height:80px; margin:0 auto 10px; background:var(--bg); color:var(--primary); font-size:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--border);">
                    ${c.name.charAt(0)}
                </div>
                <h2 style="font-size:20px; margin:0;">${c.name}</h2>
                <p class="muted">${c.industry || 'Bransch'} • ${c.address?.city || 'Stad'}</p>
                <div class="pill ${c.status === 'customer' ? 'ok' : 'warn'}" style="margin-top:5px;">${c.status ? c.status.toUpperCase() : 'LEAD'}</div>
            </div>

            <div class="aiInsightBox" style="background:var(--primary-fade); padding:15px; border-radius:12px; text-align:center; margin-bottom:15px; border:1px solid var(--border);">
                <div style="font-size:11px; text-transform:uppercase; color:var(--primary); font-weight:bold; margin-bottom:5px;">AI Lead Score</div>
                <div class="aiScore" style="font-size:32px; font-weight:800; color:var(--primary);">${c.aiScore || 0}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:5px;">Baserat på engagemang</div>
            </div>

            <div class="panel soft" style="padding:15px; margin-bottom:15px; border:1px solid var(--border);">
                <div style="font-size:11px; text-transform:uppercase; color:var(--text); font-weight:bold; margin-bottom:8px;">Next Best Action <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary);"></i></div>
                <div style="font-size:13px; font-weight:600; color:var(--primary);">${nextAction}</div>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
                <button class="btn primary full" onclick="saveCustomerEdits('${c.id}')"><i class="fa-solid fa-save"></i> SPARA ÄNDRINGAR</button>
                <button class="btn ghost full" onclick="goToCustomerKB('${c.id}')"><i class="fa-solid fa-book"></i> HANTERA KB</button>
            </div>
        `;
    }

    const main = modal.querySelector('.customerMain');
    if (main) {
        // Fallback for names
        let firstName = c.contactFirst || '';
        let lastName = c.contactLast || '';
        if (!firstName && !lastName && c.contactName) {
            const parts = c.contactName.split(' ');
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
        }

        // TABS NAVIGATION (Simple Implementation)
        const tabHtml = `
            <div class="crmTabs" style="display:flex; gap:15px; border-bottom:1px solid var(--border); margin-bottom:20px;">
                <button class="tabLink active" onclick="switchCrmTab(this, 'tabOverview')">Översikt</button>
                <button class="tabLink" onclick="switchCrmTab(this, 'tabEconomy')">Avtal & Ekonomi</button>
                <button class="tabLink" onclick="switchCrmTab(this, 'tabAiChurn')">AI & Churn Analys</button>
            </div>
        `;

        // TAB 1: OVERVIEW (Existing fields)
        const overviewContent = `
            <div id="tabOverview" class="crmTabContent" style="display:block;">
                <div class="panel soft" style="margin-bottom:20px;">
                    <div class="panelHead"><b>Profil & Kontakt</b></div>
                    <div class="grid2" style="padding:15px; gap:15px;">
                        <div><label class="small-label">Företagsnamn</label><input type="text" id="editCustName" class="input" value="${c.name || ''}"></div>
                        <div><label class="small-label">Org.nr</label><input type="text" id="editCustOrgNr" class="input" value="${c.orgNr || ''}"></div>
                        
                        <div><label class="small-label">Förnamn (Kontakt)</label><input type="text" id="editCustContactFirst" class="input" value="${firstName}"></div>
                        <div><label class="small-label">Efternamn (Kontakt)</label><input type="text" id="editCustContactLast" class="input" value="${lastName}"></div>
                        <div><label class="small-label">Roll/Titel</label><input type="text" id="editCustRole" class="input" value="${c.role || ''}"></div>

                        <div><label class="small-label">E-post</label><input type="text" id="editCustEmail" class="input" value="${c.email || ''}"></div>
                        <div><label class="small-label">Telefon</label><input type="text" id="editCustPhone" class="input" value="${c.phone || ''}"></div>
                        <div><label class="small-label">Webbplats</label><input type="text" id="editCustWeb" class="input" value="${c.web || ''}"></div>
                        <div><label class="small-label">Bransch</label><input type="text" id="editCustIndustry" class="input" value="${c.industry || ''}"></div>
                        
                        <div><label class="small-label">Typ</label>
                             <select id="editCustStatus" class="input">
                                <option value="customer" ${c.status === 'customer' ? 'selected' : ''}>Kund</option>
                                <option value="lead" ${c.status === 'lead' ? 'selected' : ''}>Lead</option>
                            </select>
                        </div>
                    </div>
                </div>
                <!-- Address moved here for simpler overview -->
                 <div class="panel soft" style="margin-bottom:20px;">
                    <div class="panelHead"><b>Adressuppgifter</b></div>
                    <div class="grid2" style="padding:15px; gap:15px;">
                        <div><label class="small-label">Postnummer</label><input type="text" id="editCustZip" class="input" value="${c.address?.zip || ''}"></div>
                        <div><label class="small-label">Stad</label><input type="text" id="editCustCity" class="input" value="${c.address?.city || ''}"></div>
                        <div><label class="small-label">Land</label>
                            <select id="editCustCountry" class="input">
                                <option value="SE" ${c.address?.country === 'SE' ? 'selected' : ''}>Sverige</option>
                                <option value="NO" ${c.address?.country === 'NO' ? 'selected' : ''}>Norge</option>
                                <option value="DK" ${c.address?.country === 'DK' ? 'selected' : ''}>Danmark</option>
                                <option value="FI" ${c.address?.country === 'FI' ? 'selected' : ''}>Finland</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // TAB 2: ECONOMY (Expanded fields)
        const economyContent = `
            <div id="tabEconomy" class="crmTabContent" style="display:none;">
                 <div class="panel soft" style="margin-bottom:20px;">
                    <div class="panelHead"><b>Intäkter & Avtal</b></div>
                    <div class="grid2" style="padding:15px; gap:15px;">
                        <div><label class="small-label">Avtalsvärde (ARR/Total)</label><input type="number" id="editCustValue" class="input" value="${c.value || 0}"></div>
                        <div><label class="small-label">Valuta</label><input type="text" class="input" value="SEK" disabled></div>
                        <div><label class="small-label">MRR (Månadsintäkt)</label><input type="text" class="input" value="${Math.round((c.value || 0) / 12)} kr" disabled></div>
                        <div><label class="small-label">Bruttomarginal %</label><input type="text" class="input" value="Uppdateras..." disabled></div>
                    </div>
                    <div style="padding:0 15px 15px;">
                        <button class="btn tiny ghost"><i class="fa-solid fa-plus"></i> Lägg till abonnemang</button>
                    </div>
                </div>
            </div>
        `;

        // TAB 3: AI & CHURN (Advanced Analysis)
        const aiContent = `
            <div id="tabAiChurn" class="crmTabContent" style="display:none;">
                 <div class="panel soft" style="margin-bottom:20px;">
                    <div class="panelHead"><b>AI-Konfiguration</b></div>
                    <div class="grid2" style="padding:15px; gap:15px;">
                        <div><label class="small-label">AI Status</label>
                            <select id="editCustAiStatus" class="input">
                                <option value="active" ${c.aiConfig?.status === 'active' ? 'selected' : ''}>Aktiv</option>
                                <option value="inactive" ${c.aiConfig?.status === 'inactive' ? 'selected' : ''}>Inaktiv</option>
                            </select>
                        </div>
                        <div><label class="small-label">AI Modell</label>
                            <select id="editCustAiModel" class="input">
                                <option value="gpt-4o" ${c.aiConfig?.model === 'gpt-4o' ? 'selected' : ''}>GPT-4o (Standard)</option>
                                <option value="gpt-4-turbo" ${c.aiConfig?.model === 'gpt-4-turbo' ? 'selected' : ''}>GPT-4 Turbo</option>
                                <option value="gpt-3.5-turbo" ${c.aiConfig?.model === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo</option>
                            </select>
                        </div>
                        <div><label class="small-label">Språk</label>
                            <select id="editCustAiLang" class="input">
                                <option value="sv" ${c.aiConfig?.lang === 'sv' ? 'selected' : ''}>Svenska</option>
                                <option value="en" ${c.aiConfig?.lang === 'en' ? 'selected' : ''}>Engelska</option>
                                <option value="multi" ${c.aiConfig?.lang === 'multi' ? 'selected' : ''}>Multi (Auto)</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="panel soft" style="border:1px solid ${churnColor}; background:rgba(0,0,0,0.02);">
                    <div class="panelHead" style="color:${churnColor};"><b>Churn Risk Analys</b></div>
                    <div style="padding:15px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <span>Riskbedömning:</span>
                            <strong style="color:${churnColor};">${churnRisk.toUpperCase()}</strong>
                        </div>
                         <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <span>NPS (Estimerad):</span>
                            <strong>${c.aiScore > 70 ? '9 (Promoter)' : '6 (Detractor)'}</strong>
                        </div>
                        <p class="muted small">Analysen baseras på engagemang, supportärenden och intäktsutveckling.</p>
                    </div>
                </div>
            </div>
        `;

        main.innerHTML = tabHtml + overviewContent + economyContent + aiContent;

        // Helper to switch tabs inside modal
        window.switchCrmTab = function (btn, tabId) {
            const parent = btn.parentElement;
            parent.querySelectorAll('.tabLink').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');

            const container = main;
            container.querySelectorAll('.crmTabContent').forEach(c => c.style.display = 'none');
            document.getElementById(tabId).style.display = 'block';
        };
    }
    modal.style.display = 'flex';
};

window.saveCustomerEdits = async function (id) {
    let customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    let cIndex = customers.findIndex(c => c.id === id);
    if (cIndex === -1) return;

    const c = customers[cIndex];

    c.name = document.getElementById('editCustName').value.trim();
    c.email = document.getElementById('editCustEmail').value.trim();
    c.phone = document.getElementById('editCustPhone').value.trim();
    c.orgNr = document.getElementById('editCustOrgNr').value.trim();
    c.web = document.getElementById('editCustWeb').value.trim();
    c.industry = document.getElementById('editCustIndustry').value.trim();
    c.value = parseFloat(document.getElementById('editCustValue').value) || 0;
    c.status = document.getElementById('editCustStatus').value;

    const fName = document.getElementById('editCustContactFirst')?.value?.trim() || '';
    const lName = document.getElementById('editCustContactLast')?.value?.trim() || '';
    c.contactFirst = fName;
    c.contactLast = lName;
    c.contactName = `${fName} ${lName}`.trim();
    c.role = document.getElementById('editCustRole')?.value?.trim() || '';

    if (!c.address) c.address = {};
    c.address.zip = document.getElementById('editCustZip').value.trim();
    c.address.city = document.getElementById('editCustCity').value.trim();
    c.address.country = document.getElementById('editCustCountry').value;

    if (!c.aiConfig) c.aiConfig = {};
    c.aiConfig.status = document.getElementById('editCustAiStatus').value;
    c.aiConfig.model = document.getElementById('editCustAiModel').value;
    c.aiConfig.lang = document.getElementById('editCustAiLang').value;

    try {
        if (typeof api === 'function' && state.token) {
            await api(`/admin/companies/${id}`, {
                method: "PUT",
                body: {
                    displayName: c.name,
                    contactEmail: c.email,
                    phone: c.phone,
                    industry: c.industry,
                    orgNr: c.orgNr,
                    status: c.aiConfig.status === 'active' ? 'active' : 'inactive',
                    notes: `Uppdaterad via CRM. Värde: ${c.value}. Modell: ${c.aiConfig.model}`
                }
            });
        }
    } catch (e) {
        console.error("Backend sync failed:", e.message);
    }

    localStorage.setItem('crmCustomers', JSON.stringify(customers));

    // CRM Cloud Push
    if (window.pushCrmToBackend) window.pushCrmToBackend('customers');

    toast("Uppdaterad", `All information sparad och synkad för ${c.name}.`, "success");
    logCrmActivity(`Fullständig uppdatering av ${c.name}`, 'info');

    renderCustomerList();
    renderCrmDashboard();
    updateChatCategoriesFromCRM();
    if (typeof loadCompanies === 'function') await loadCompanies();
    window.closeCrmModal('crmCustomerModal');
};

window.goToCustomerKB = function (companyId) {
    window.closeCrmModal('crmCustomerModal');
    if (typeof showView === 'function') {
        showView('adminView');
        const tabBtn = document.querySelector('.tabBtn[data-tab="tabKB"]');
        if (tabBtn) tabBtn.click();
        setTimeout(() => {
            const kbSel = document.getElementById('kbCategorySelect');
            if (kbSel) {
                kbSel.value = companyId;
                const refreshBtn = document.getElementById('kbRefreshBtn');
                if (refreshBtn) refreshBtn.click();
            }
        }, 150);
    }
    toast("Kunskapsbas", `Hanterar data för ${companyId}`, "info");
};

window.deleteCustomer = async function (id) {
    if (!confirm('VARNING: Detta kommer att radera kunden och ALL tillhörande data (biljetter, dokument, AI-inställningar) permanent från hela systemet. Vill du fortsätta?')) return;

    try {
        if (typeof api === 'function' && state.token) {
            await api(`/admin/companies/${id}`, {
                method: "DELETE"
            });
            console.log("Company deleted from backend.");
        }
    } catch (e) {
        console.error("Backend deletion failed:", e.message);
        toast("System-fel", "Kunde inte radera från backend, men tar bort lokalt.", "warning");
    }

    let customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    customers = customers.filter(c => c.id !== id);
    localStorage.setItem('crmCustomers', JSON.stringify(customers));

    // CRM Cloud Push
    if (window.pushCrmToBackend) window.pushCrmToBackend('customers');

    renderCustomerList();
    renderCrmDashboard();
    updateChatCategoriesFromCRM();
    if (typeof loadCompanies === 'function') await loadCompanies();

    toast("Raderad", "Kunden har raderats helt från systemet.", "success");
    logCrmActivity(`Raderade kund: ${id}`, 'warning');
};

window.closeCrmModal = function (id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
};

window.openAddCustomerModal = function () {
    const m = document.getElementById('crmAddCustomerModal');
    if (m) m.style.display = 'flex';
};

document.addEventListener('DOMContentLoaded', () => {
    // Initial CRM Sync from Cloud
    setTimeout(() => {
        if (window.syncCrmData) window.syncCrmData();
    }, 1000);

    updateChatCategoriesFromCRM();
    renderCrmDashboard();
    if (window.renderCustomerList) window.renderCustomerList();
    setInterval(() => updateChatCategoriesFromCRM(), 3000);

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            const input = document.getElementById('messageInput');
            if (input && input.value.trim().length > 0) {
                logCrmActivity(`Chatt-meddelande skickat`, 'chat');
            }
        });
    }

    const newTicketBtn = document.getElementById('newTicketBtn');
    if (newTicketBtn) {
        newTicketBtn.addEventListener('click', () => {
            logCrmActivity(`Nytt ärende via Chatt`, 'ticket');
        });
    }
});
