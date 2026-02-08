
/* =====================
   CRM ENHANCEMENTS V5: INTEGRATION & DASHBOARD
===================== */

/**
 * Sync CRM Customers (AI Active) to Chat Dropdown
 */
function updateChatCategoriesFromCRM() {
    const select = document.getElementById('categorySelect');
    if(!select) return;

    // Remove existing CRM options to avoid duplicates
    Array.from(select.options).forEach(opt => {
        if(opt.getAttribute('data-origin') === 'crm') {
            select.removeChild(opt);
        }
    });

    // Get Active AI Customers
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    const aiCustomers = customers.filter(c => c.aiConfig && c.aiConfig.status === 'active');
    
    if(aiCustomers.length > 0) {
        aiCustomers.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.name; // Use Name so Chat displays it nicely and Backend receives it
            opt.innerText = c.name + " (AI)";
            opt.setAttribute('data-origin', 'crm');
            select.appendChild(opt);
        });
    }
}

/**
 * Render Real Dashboard Stats logic
 */
function renderCrmDashboard() {
    const dash = document.getElementById('crm_dashboard');
    // Allow rendering even if hidden, to update values in background
    if(!dash) return;
    
    const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    const activities = JSON.parse(localStorage.getItem('crmActivities') || '[]');
    
    // 1. Total Pipeline Value
    const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
    
    // 2. Open Deals
    const openDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;
    
    // 3. Total Customers
    const totalCustomers = customers.length;
    
    // Find DOM elements .crmStatCard -> .crmStatValue
    const cards = document.querySelectorAll('.crmStatCard');
    
    if(cards.length >= 3) {
        // Card 1: Pipeline
        const val1 = cards[0].querySelector('.crmStatValue');
        if(val1) val1.innerText = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumSignificantDigits: 3 }).format(totalValue);
        
        // Card 2: Open Deals
        const val2 = cards[1].querySelector('.crmStatValue');
        if(val2) val2.innerText = openDeals + " st";
        
        // Card 3: Total Customers
        const title3 = cards[2].querySelector('.crmStatTitle');
        if(title3) title3.innerHTML = 'Totalt Antal Kunder <i class="fa-solid fa-users"></i>';
        
        const val3 = cards[2].querySelector('.crmStatValue');
        if(val3) val3.innerText = totalCustomers + " st";
    }
    
    // Recent Activity Feed
    const feed = document.querySelector('.crmActivityFeed'); // Need to ensure class/id matches HTML
    // HTML in CRM view for feed?
    // In Step 4178: <div class="crmActivityFeed">...</div>
    if(feed) {
        const sorted = activities.sort((a,b) => new Date(b.created) - new Date(a.created)).slice(0, 5);
        
        if(sorted.length > 0) {
            feed.innerHTML = sorted.map(a => `
                <div class="activityItem ${a.type}" style="padding:10px; border-bottom:1px solid var(--border);">
                    <div class="activityMeta" style="font-size:11px; color:var(--text-muted);">${new Date(a.created).toLocaleDateString()} • ${a.type}</div>
                    <div style="font-weight:bold; font-size:13px;">${a.subject}</div>
                </div>
            `).join('');
        } else {
             feed.innerHTML = `<div class="muted center" style="padding:20px; font-size:13px;">Inga aktiviteter loggade än.</div>`;
        }
    }
}

// Hook into Save functions to refresh Chat & Dashboard
// We need to overwrite the window functions but keep reference
(function() {
    const _originalSaveCust = window.saveNewCustomerExpanded;
    window.saveNewCustomerExpanded = function() {
        if(_originalSaveCust) _originalSaveCust();
        setTimeout(() => {
            updateChatCategoriesFromCRM();
            renderCrmDashboard();
        }, 800);
    };

    const _originalSaveDeal = window.saveNewDealAdvanced;
    window.saveNewDealAdvanced = function() {
        if(_originalSaveDeal) _originalSaveDeal();
        setTimeout(renderCrmDashboard, 800);
    };
    
    const _originalSetCrmTab = window.setCrmTab;
    window.setCrmTab = function(tab) {
        if(_originalSetCrmTab) _originalSetCrmTab(tab);
        if(tab === 'dashboard') renderCrmDashboard();
    };
})();

// Auto-run
document.addEventListener('DOMContentLoaded', () => {
    updateChatCategoriesFromCRM();
    renderCrmDashboard();
});
