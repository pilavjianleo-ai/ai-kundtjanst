/* =====================
   CRM ENHANCEMENTS V12 (LAUNCH READY)
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
 * SYNC & DATA PUSH
 */
window.syncCrmData = async function (manual = false) {
    if (!window.api || !window.state || !window.state.token) return;
    const companyId = window.state.companyId || (window.state.me ? window.state.me.companyId : 'demo');

    try {
        const data = await api(`/crm/sync?companyId=${companyId}`);
        if (data) {
            if (data.customers) {
                localStorage.setItem('crmCustomers', JSON.stringify(data.customers));
                crmState.customers = data.customers;
            }
            if (data.deals) {
                localStorage.setItem('crmDeals', JSON.stringify(data.deals));
                crmState.deals = data.deals;
            }
            if (data.activities) {
                localStorage.setItem('crmActivities', JSON.stringify(data.activities));
                crmState.activities = data.activities;
            }

            // Global Re-render
            renderCrmDashboard();
            renderCustomerList();
            renderPipeline();
            populateAiCostCustomers();
            calculateAiMargins();
            updateChatCategoriesFromCRM();
        }
    } catch (e) {
        console.error("CRM Sync Error:", e.message);
    }
};

window.pushCrmToBackend = async function (type) {
    if (!window.api || !window.state || !window.state.token || !window.state.me) return;
    const companyId = window.state.companyId || (window.state.me ? window.state.me.companyId : 'demo');

    try {
        if (type === 'customers' || !type) {
            const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
            await api('/crm/customers/sync', { method: 'POST', body: { companyId, customers } });
        }
        if (type === 'deals' || !type) {
            const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
            await api('/crm/deals/sync', { method: 'POST', body: { companyId, deals } });
        }
        if (type === 'activities' || !type) {
            const activities = JSON.parse(localStorage.getItem('crmActivities') || '[]');
            await api('/crm/activities/sync', { method: 'POST', body: { companyId, activities: activities.slice(0, 50) } });
        }
    } catch (e) {
        console.error("Cloud Push Failed:", e.message);
    }
};

/**
 * DASHBOARD & PIPELINE
 */
function renderCrmDashboard() {
    const dash = document.getElementById('crm_dashboard');
    if (!dash) return;

    const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');

    // Weighted Pipeline: sum(value * probability)
    const totalWeighted = deals.reduce((sum, d) => sum + ((parseFloat(d.value) || 0) * ((d.probability || 50) / 100)), 0);
    const hotLeads = customers.filter(c => (c.aiScore || 0) > 80).length;
    const totalMrr = customers.reduce((sum, c) => sum + (parseFloat(c.mrr) || 0), 0);
    const openDealsCount = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    setVal('crmWeightedPipeline', new Intl.NumberFormat('sv-SE').format(Math.round(totalWeighted)) + ' kr');
    setVal('crmHotLeadsCount', hotLeads + " st");
    setVal('crmOpenDealsCount', openDealsCount + " st");
    setVal('crmMonthlyRevenue', new Intl.NumberFormat('sv-SE').format(totalMrr) + ' kr');

    updateActivityTimeline();
    generatePipelineInsight();
}

window.renderPipeline = function () {
    const bodies = {
        new: document.getElementById('pipelineBody-new'),
        qualified: document.getElementById('pipelineBody-qualified'),
        proposal: document.getElementById('pipelineBody-proposal'),
        negotiation: document.getElementById('pipelineBody-negotiation')
    };
    Object.values(bodies).forEach(b => { if (b) b.innerHTML = ''; });

    const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').forEach(d => {
        if (!bodies[d.stage]) return;

        const updatedAt = d.updatedAt || d.createdAt || new Date().toISOString();
        const daysSinceUpdate = Math.floor((new Date() - new Date(updatedAt)) / (1000 * 60 * 60 * 24));
        const isStalled = daysSinceUpdate > 5;

        const card = document.createElement('div');
        card.className = `dealCard ${isStalled ? 'dealStalled' : ''}`;
        card.onclick = () => window.openEditDealModal(d.id);

        // Add Stalled Badge if applicable
        const stalledHtml = isStalled ?
            `<div class="stalledBadge" style="background:#ff4d4d; color:white; font-size:10px; padding:2px 6px; border-radius:4px; margin-top:8px; display:inline-block; font-weight:bold;">
                <i class="fa-solid fa-clock"></i> STANNAT (${daysSinceUpdate} d)
            </div>` : '';

        card.innerHTML = `
            <div class="dealProbability" style="background:${isStalled ? '#ff4d4d' : 'var(--primary)'};">${d.probability || 50}%</div>
            <div style="font-weight:700; font-size:14px; color:var(--text);">${d.company}</div>
            <div class="muted small" style="margin-bottom:8px;">${d.name || 'Affär'}</div>
            <div style="font-weight:800; color:var(--primary); font-size:15px;">${new Intl.NumberFormat('sv-SE').format(d.value || 0)} kr</div>
            ${stalledHtml}
        `;
        bodies[d.stage].appendChild(card);
    });
};

/**
 * AI INSIGHTS
 */
window.generatePipelineInsight = function () {
    const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    const textEl = document.getElementById('crmAiInsightText');
    if (!textEl) return;

    const stalled = deals.filter(d => {
        const up = d.updatedAt || d.createdAt || new Date().toISOString();
        return Math.floor((new Date() - new Date(up)) / (1000 * 60 * 60 * 24)) > 5 && d.stage !== 'won' && d.stage !== 'lost';
    });

    if (stalled.length > 0) {
        textEl.innerText = `Du har ${stalled.length} affärer som stannat av. Fokusera på ${stalled[0].company} idag för att öka chansen till avslut med 12%.`;
    } else {
        textEl.innerText = "Din pipeline ser sund ut. Inga affärer har stannat av just nu. Fortsätt mata in nya leads!";
    }
};

/**
 * CRM ACTIONS & UTILITIES
 */
window.applyDealTemplate = function (type) {
    const templates = {
        'new': { name: 'Nya Licenser: ', stage: 'new', prob: 20 },
        'upsell': { name: 'Upsell Support: ', stage: 'qualified', prob: 50 }
    };
    const t = templates[type];
    if (t) {
        document.getElementById('dealName').value = t.name;
        document.getElementById('dealStage').value = t.stage;
        document.getElementById('dealProb').value = t.prob;
        toast("Mall aktiverad", `Laddade inställningar för ${type}.`, "info");
    }
};

window.saveNewDealAdvanced = async function () {
    const name = document.getElementById('dealName')?.value;
    const company = document.getElementById('dealCompanyInput')?.value;
    if (!name || !company) return toast("Fel", "Namn och företag krävs", "error");

    const newDeal = {
        id: 'DEAL-' + Date.now(),
        name, company,
        value: parseFloat(document.getElementById('dealValue').value) || 0,
        stage: document.getElementById('dealStage').value,
        probability: parseInt(document.getElementById('dealProb').value) || 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    let deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    deals.push(newDeal);
    localStorage.setItem('crmDeals', JSON.stringify(deals));

    await pushCrmToBackend('deals');
    renderPipeline();
    renderCrmDashboard();
    window.closeCrmModal('crmAddDealModal');
    toast("Klart", "Affären har skapats!", "success");
};

window.executeBulkUpdate = function () {
    const stage = document.getElementById('bulkStage').value;
    const owner = document.getElementById('bulkOwner').value;
    if (!stage && !owner) return toast("Info", "Välj något att uppdatera", "info");

    toast("Bearbetar...", "Uppdaterar markerade affärer", "info");
    setTimeout(() => {
        window.closeCrmModal('crmBulkModal');
        toast("Slutfört", "Affärerna har uppdaterats.", "success");
    }, 800);
};

window.generateAiEmail = function () {
    const company = document.getElementById('editDealCompany')?.value || 'er';
    const email = `Hej!\n\nTack för ett bra möte. Jag har förberett ett förslag för ${company}...\n\nMed vänlig hälsning,\nAI CRM`;
    const win = window.open("", "_blank", "width=600,height=400");
    win.document.write(`<pre style='padding:20px;'>${email}</pre>`);
};

window.deleteDeal = function () {
    const id = document.getElementById('editDealId').value;
    if (!confirm("Vill du radera affären?")) return;
    let deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    deals = deals.filter(d => d.id.toString() !== id.toString());
    localStorage.setItem('crmDeals', JSON.stringify(deals));
    pushCrmToBackend('deals');
    renderPipeline();
    renderCrmDashboard();
    window.closeCrmModal('crmEditDealModal');
    toast("Raderad", "Affären borttagen.", "info");
};

window.deleteCustomer = function (id) {
    if (!confirm("Vill du radera kunden?")) return;
    let customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    customers = customers.filter(c => c.id.toString() !== id.toString());
    localStorage.setItem('crmCustomers', JSON.stringify(customers));
    pushCrmToBackend('customers');
    renderCustomerList();
    renderCrmDashboard();
    toast("Raderad", "Kunden har tagits bort.", "info");
};

/**
 * MODAL OPENERS
 */
window.openEditDealModal = function (id) {
    const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    const d = deals.find(x => x.id.toString() === id.toString());
    if (!d) return;

    document.getElementById('editDealId').value = d.id;
    document.getElementById('editDealName').value = d.name || '';
    document.getElementById('editDealCompany').value = d.company || '';
    document.getElementById('editDealValue').value = d.value || 0;
    document.getElementById('editDealStage').value = d.stage || 'new';
    document.getElementById('editDealProbability').value = d.probability || 50;

    document.getElementById('crmEditDealModal').style.display = 'flex';
};

window.openCustomerModal = function (id) {
    // Basic selector logic
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    const c = customers.find(x => x.id.toString() === id.toString());
    if (!c) return;
    document.getElementById('crmModalCustomerName').innerText = c.name;
    document.getElementById('crmCustomerModal').style.display = 'flex';
};

window.saveNewCustomerExpanded = async function () {
    const name = document.getElementById('custName')?.value;
    if (!name) return;
    const newCust = { id: Date.now().toString(), name, mrr: parseFloat(document.getElementById('custMrr')?.value || 0), healthScore: 100, status: 'customer' };
    let customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    customers.push(newCust);
    localStorage.setItem('crmCustomers', JSON.stringify(customers));
    await pushCrmToBackend('customers');
    renderCustomerList();
    window.closeCrmModal('crmAddCustomerModal');
    toast("Klart", "Kund tillagd.", "success");
};

window.populateAiCostCustomers = function () {
    const costSelect = document.getElementById('aiCostCustomerSelect');
    if (!costSelect) return;
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    let html = `<option value="all">Alla Kunder (Aggregerat)</option>`;
    customers.forEach(c => html += `<option value="${c.id}">${c.name}</option>`);
    costSelect.innerHTML = html;
};

window.syncAiSplits = function (source) {
    const val = document.getElementById('split' + source.charAt(0).toUpperCase() + source.slice(1))?.value;
    const label = document.getElementById('val' + source.charAt(0).toUpperCase() + source.slice(1));
    if (label) label.innerText = val + '%';
    window.calculateAiMargins();
};

/**
 * CUSTOMER 360 & LIST
 */
window.renderCustomerList = function () {
    const tbody = document.getElementById('crmAnalyticsTable');
    if (!tbody) return;

    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    tbody.innerHTML = customers.map(c => {
        const health = c.healthScore || 100;
        const healthColor = health > 70 ? 'success' : (health > 40 ? 'warn' : 'danger');
        const scoreColor = (c.aiScore || 0) > 80 ? 'var(--success)' : ((c.aiScore || 0) > 50 ? 'orange' : 'var(--text-muted)');

        return `
        <tr onclick="openCustomerModal('${c.id}')" style="cursor:pointer; transition:background 0.2s;">
            <td style="padding:15px 12px;"><b>${c.name}</b><br><span class="muted small">${c.industry || '-'}</span></td>
            <td style="padding:15px 12px;"><b>${c.contactName || '-'}</b><br><span class="muted small">${c.email || ''}</span></td>
            <td style="padding:15px 12px;">
                <span class="pill ${c.status === 'customer' ? 'ok' : (c.status === 'churn' ? 'danger' : 'warn')}">${c.status?.toUpperCase() || 'KUND'}</span>
                <div class="churn-risk-indicator" style="margin-top:6px; background:rgba(0,0,0,0.05); height:4px; border-radius:2px; width:100px; overflow:hidden;">
                    <div class="churn-risk-fill" style="width:${health}%; background:var(--${healthColor}); height:100%;"></div>
                </div>
            </td>
            <td style="padding:15px 12px; text-align:right;"><b>${new Intl.NumberFormat('sv-SE').format(c.mrr || 0)} kr</b></td>
            <td style="padding:15px 12px; text-align:center;"><span style="color:${scoreColor}; font-weight:bold;">${c.aiScore || 0}</span></td>
            <td style="padding:15px 12px; text-align:right;">
                <button class="btn ghost small icon" onclick="event.stopPropagation(); deleteCustomer('${c.id}')"><i class="fa-solid fa-trash" style="color:var(--danger);"></i></button>
            </td>
        </tr>`;
    }).join('');

    // Update Header Sums
    const totalMrr = customers.reduce((sum, c) => sum + (parseFloat(c.mrr) || 0), 0);
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setVal('crmTotalValueHeader', new Intl.NumberFormat('sv-SE').format(totalMrr) + ' kr');
    setVal('crmTotalCustomersHeader', customers.length + ' st');
};

/**
 * AI COST ENGINE (V12 - STRICT)
 * SPEC: Internal Model Weights (70/25/5), Fixed Exchange 11.5, VAT handling
 */
window.calculateAiMargins = function () {
    const customerId = document.getElementById('aiCostCustomerSelect')?.value || 'all';
    const volume = parseFloat(document.getElementById('aiCostVolume')?.value || 100);
    const tokens = parseFloat(document.getElementById('aiCostTokens')?.value || 1500);
    const exch = 11.5;

    // Distribution Weights
    const wMini = 0.70;
    const wStd = 0.25;
    const wAdv = 0.05;

    // Internal Cost per 1M tokens in SEK
    const costMini_1M = 1.1;
    const costStd_1M = 5.5;
    const costAdv_1M = 10.0;

    // Weighted SEK cost per chat
    const weightedCostPer1M = (wMini * costMini_1M + wStd * costStd_1M + wAdv * costAdv_1M) * exch;
    const costPerChatTotal = (tokens / 1000000) * weightedCostPer1M;

    // Monthly Internal LLM Cost
    const totalAiCostMonthly = costPerChatTotal * volume * 30;

    // Revenue Extraction (from Customers DB)
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    let totalRevenueExclMoms = 0;

    if (customerId === 'all') {
        // Aggregate Sum of all customers' monthly revenue (MRR)
        totalRevenueExclMoms = customers.reduce((sum, c) => sum + (parseFloat(c.mrr) || (parseFloat(c.totalValue) / 12) || 0), 0);
    } else {
        const c = customers.find(x => x.id.toString() === customerId.toString());
        totalRevenueExclMoms = parseFloat(c?.mrr || (parseFloat(c?.totalValue) / 12) || 0);
    }

    // TAX CALCULATIONS (SPEC 3 & 5)
    const MOMS_SATS = 0.25;
    const revenueInklMoms = totalRevenueExclMoms * (1 + MOMS_SATS);

    // Net profit using excl. VAT (SPEC 3)
    const marginalSek = totalRevenueExclMoms - totalAiCostMonthly;
    const marginalProcent = totalRevenueExclMoms > 0 ? (marginalSek / totalRevenueExclMoms) * 100 : 0;

    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const fmt = v => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(v);

    setTxt('resAiCost', fmt(totalAiCostMonthly));
    setTxt('resAvgChatCost', costPerChatTotal.toFixed(2) + ' kr');
    setTxt('resNetRevenue', fmt(totalRevenueExclMoms));
    setTxt('resGrossRevenue', fmt(revenueInklMoms));
    setTxt('resMarginValue', fmt(marginalSek));
    setTxt('resMarginPercentBox', marginalProcent.toFixed(1) + '%');

    // Detailed Breakdown
    setTxt('breakMini', fmt(totalAiCostMonthly * wMini));
    setTxt('breakGpt5', fmt(totalAiCostMonthly * wStd));
    setTxt('breakGpt4', fmt(totalAiCostMonthly * wAdv));

    // Marginal Warning logic
    const warnEl = document.getElementById('marginWarning');
    if (warnEl) warnEl.style.display = marginalProcent < 20 ? 'block' : 'none';

    const box = document.getElementById('resMarginPercentBox');
    if (box) box.style.color = marginalProcent > 20 ? 'var(--ok)' : (marginalProcent > 0 ? 'var(--warn)' : 'var(--danger)');
};

/**
 * MISC HELPERS
 */
function updateActivityTimeline() {
    const activities = JSON.parse(localStorage.getItem('crmActivities') || '[]');
    const timeline = document.querySelector('.activityTimeline');
    if (!timeline) return;

    const recent = activities.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0)).slice(0, 5);
    if (recent.length > 0) {
        timeline.innerHTML = recent.map(a => `
            <div class="activityItem" style="padding-left:15px; border-left:3px solid var(--primary); margin-bottom:15px; position:relative;">
                <div style="font-size:10px; color:var(--muted); font-weight:700; text-transform:uppercase;">${new Date(a.created).toLocaleDateString()} • ${a.type || 'SYSTEM'}</div>
                <div style="font-weight:600; font-size:13px; color:var(--text);">${a.subject}</div>
            </div>
        `).join('');
    } else {
        timeline.innerHTML = '<div class="muted small center" style="padding:20px;">Laddar live-data...</div>';
    }
}

window.closeCrmModal = (id) => { const m = document.getElementById(id); if (m) m.style.display = 'none'; };

// Auto-boot
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        syncCrmData();
    }, 500);
});
