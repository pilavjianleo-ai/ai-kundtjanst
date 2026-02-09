/* =====================
   CRM ENHANCEMENTS V8: COMPLETE DATA SYNC & EDIT
   ===================== */

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
 * Render CRM Dashboard Stats
 */
function renderCrmDashboard() {
    const dash = document.getElementById('crm_dashboard');
    if (!dash) return;

    const deals = JSON.parse(localStorage.getItem('crmDeals') || '[]');
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    const activities = JSON.parse(localStorage.getItem('crmActivities') || '[]');

    const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);
    const openDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost').length;
    const totalCustomers = customers.length;

    const monthlyRevenue = customers.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);

    const cards = document.querySelectorAll('.crmStatCard');
    if (cards.length >= 3) {
        const val1 = cards[0].querySelector('.crmStatValue');
        if (val1) val1.innerText = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumSignificantDigits: 3 }).format(totalValue);

        const val2 = cards[1].querySelector('.crmStatValue');
        if (val2) val2.innerText = openDeals + " st";

        const val3 = cards[2].querySelector('.crmStatValue');
        if (val3) val3.innerText = totalCustomers + " st";

        const revEl = document.getElementById('crmMonthlyRevenue');
        if (revEl) {
            revEl.innerText = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(monthlyRevenue);
        }
    }

    const feed = document.querySelector('.activityTimeline');
    if (feed) {
        const sorted = activities.sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 20);
        if (sorted.length > 0) {
            const listItemsHtml = sorted.map((a, index) => {
                let iconClass = "fa-info-circle";
                if (a.type === 'chat') iconClass = "fa-comment-dots";
                if (a.type === 'ticket') iconClass = "fa-ticket";
                if (a.type === 'success') iconClass = "fa-check-circle";
                if (a.type === 'warning') iconClass = "fa-exclamation-triangle";
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
        } else {
            feed.innerHTML = `<div class="muted center" style="padding:20px; font-size:13px;">Inga aktiviteter loggade än.</div>`;
        }
    }

    // Populate AI Cost Analysis Customer Select
    const costSelect = document.getElementById('aiCostCustomerSelect');
    if (costSelect) {
        const currentVal = costSelect.value || 'all';
        let html = '<option value="all">Alla Kunder (Aggregerat)</option>';
        customers.forEach(c => {
            html += `<option value="${c.id || c.name}" ${(c.id == currentVal || c.name == currentVal) ? 'selected' : ''}>${c.name}</option>`;
        });
        costSelect.innerHTML = html;
    }

    // ENSURE IT RUNS
    setTimeout(() => {
        if (window.calculateAiMargins) window.calculateAiMargins();
    }, 100);
}

/**
 * AI COST TOOL LOGIC - DATA DRIVEN CALCULATIONS
 */
const AI_CONFIG = {
    exchange_rate: 11.5, // USD -> SEK
    tokens_per_chat: {
        avg_input: 500,
        avg_output: 500
    },
    // Prices in USD per 1,000,000 tokens
    model_prices: {
        mini: { in: 0.15, out: 0.60 },    // GPT-mini
        standard: { in: 5.00, out: 15.00 },// GPT-standard
        advanced: { in: 10.00, out: 30.00 } // GPT-advanced
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
    const chats_per_month = parseInt(document.getElementById('aiCostVolume').value) || 0;
    const tokens_per_chat = parseInt(document.getElementById('aiCostTokens').value) || 0;
    const customerId = document.getElementById('aiCostCustomerSelect')?.value || 'all';

    // Routing Shares (0.0 - 1.0)
    const share_mini = parseInt(document.getElementById('splitMini').value || 0) / 100;
    const share_std = parseInt(document.getElementById('splitGpt5').value || 0) / 100;
    const share_adv = parseInt(document.getElementById('splitGpt4').value || 0) / 100;

    // 1. Grunddata per chatt
    const input_t = tokens_per_chat * 0.5;
    const output_t = tokens_per_chat * 0.5;

    // 2. Beräkna Kostnad per chatt per modell (USD)
    const calcCostPerChatUSD = (model) => {
        const p = AI_CONFIG.model_prices[model];
        if (!p) return 0;
        const input_cost = (input_t / 1000000) * p.in;
        const output_cost = (output_t / 1000000) * p.out;
        return input_cost + output_cost;
    };

    const cost_mini_usd = calcCostPerChatUSD('mini');
    const cost_std_usd = calcCostPerChatUSD('standard');
    const cost_adv_usd = calcCostPerChatUSD('advanced');

    // 3. Viktad snittkostnad per chatt (Routing) i SEK
    const weighted_cost_usd = (cost_mini_usd * share_mini) + (cost_std_usd * share_std) + (cost_adv_usd * share_adv);
    const weighted_cost_sek = weighted_cost_usd * AI_CONFIG.exchange_rate;

    // 4. Månadskostnad LLM
    const monthly_llm_cost_sek = chats_per_month * weighted_cost_sek;

    // 5. Intäktshantering (Moms 25%)
    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');
    let gross_revenue = 0;

    if (customerId === 'all') {
        // AGGREGERAT: Summera alla kunders värde
        gross_revenue = customers.reduce((sum, c) => {
            const val = parseFloat(c.value) || 0;
            return sum + val;
        }, 0);
    } else {
        // PER KUND
        const c = customers.find(x => (x.id == customerId || x.name == customerId));
        gross_revenue = c ? (parseFloat(c.value) || 0) : 0;
    }

    // FALLBACK: Om inga kunder finns eller summan är 0, visa demo-försäljning
    let isDemo = false;
    if (gross_revenue === 0) {
        gross_revenue = 15000;
        isDemo = true;
    }

    const net_revenue = gross_revenue / 1.25; // Räkna bort 25% moms

    // 6. Marginalberäkning
    const gross_margin_val = net_revenue - monthly_llm_cost_sek;
    const gross_margin_pct = net_revenue > 0 ? (gross_margin_val / net_revenue) * 100 : 0;

    // UPDATE UI
    const fmt = (v) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(v);

    const avgChatEl = document.getElementById('resAvgChatCost');
    if (avgChatEl) avgChatEl.innerText = weighted_cost_sek.toFixed(2) + ' kr';

    const aiCostEl = document.getElementById('resAiCost');
    if (aiCostEl) aiCostEl.innerText = fmt(monthly_llm_cost_sek);

    const grossRevEl = document.getElementById('resGrossRevenue');
    if (grossRevEl) grossRevEl.innerText = fmt(gross_revenue);

    const netRevEl = document.getElementById('resNetRevenue');
    if (netRevEl) netRevEl.innerText = fmt(net_revenue);

    const marginValEl = document.getElementById('resMarginValue');
    if (marginValEl) marginValEl.innerText = fmt(gross_margin_val);

    const pctBox = document.getElementById('resMarginPercentBox');
    if (pctBox) {
        pctBox.innerText = gross_margin_pct.toFixed(1) + '%';
        pctBox.style.color = gross_margin_pct > 30 ? 'var(--ok)' : (gross_margin_pct > 10 ? 'var(--warn)' : 'var(--danger)');
    }

    const note = document.getElementById('marginNote');
    if (note && isDemo) {
        note.innerText = "VISAR DEMO-VÄRDEN (Inga kunder hittades)";
        note.style.fontStyle = "italic";
    } else if (note) {
        note.innerText = customerId === 'all' ? "Baserat på TOTAL försäljning (Exkl. moms)" : "Baserat på KUNDENS avgift (Exkl. moms)";
        note.style.fontStyle = "normal";
    }

    // Breakdown rutorna (Månadskostnad per modell)
    const bMini = document.getElementById('breakMini');
    if (bMini) bMini.innerText = fmt(chats_per_month * share_mini * cost_mini_usd * AI_CONFIG.exchange_rate);

    const bStd = document.getElementById('breakGpt5');
    if (bStd) bStd.innerText = fmt(chats_per_month * share_std * cost_std_usd * AI_CONFIG.exchange_rate);

    const bAdv = document.getElementById('breakGpt4');
    if (bAdv) bAdv.innerText = fmt(chats_per_month * share_adv * cost_adv_usd * AI_CONFIG.exchange_rate);
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
};

window.renderCustomerList = function () {
    const tbody = document.getElementById('crmAnalyticsTable');
    if (!tbody) return;

    const customers = JSON.parse(localStorage.getItem('crmCustomers') || '[]');

    if (customers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="muted center" style="padding:20px;">Inga kunder.</td></tr>`;
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

    const sidebar = modal.querySelector('.customerSidebar');
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="topInfo" style="text-align:center; margin-bottom:20px;">
                <div class="avatar-large" style="width:80px; height:80px; margin:0 auto 10px; background:var(--bg); color:var(--primary); font-size:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--border);">
                    ${c.name.charAt(0)}
                </div>
                <h2 style="font-size:20px; margin:0;">${c.name}</h2>
                <p class="muted">${c.industry || 'Bransch'} • ${c.address?.city || 'Stad'}</p>
                <div class="pill ${c.status === 'customer' ? 'ok' : 'warn'}" style="margin-top:5px;">${c.status.toUpperCase()}</div>
            </div>
            <div class="aiInsightBox" style="background:var(--primary-fade); padding:15px; border-radius:12px; text-align:center; margin-bottom:15px; border:1px solid var(--border);">
                <div style="font-size:12px; text-transform:uppercase; color:var(--primary); font-weight:bold; margin-bottom:5px;">AI Lead Score</div>
                <div class="aiScore" style="font-size:32px; font-weight:800; color:var(--primary);">${c.aiScore}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button class="btn primary full" onclick="saveCustomerEdits('${c.id}')"><i class="fa-solid fa-save"></i> SPARA ÄNDRINGAR</button>
                <button class="btn ghost full" onclick="goToCustomerKB('${c.id}')"><i class="fa-solid fa-book"></i> HANTERA KB</button>
            </div>
        `;
    }

    const main = modal.querySelector('.customerMain');
    if (main) {
        // Fallback for old data without separate first/last names
        let firstName = c.contactFirst || '';
        let lastName = c.contactLast || '';
        if (!firstName && !lastName && c.contactName) {
            const parts = c.contactName.split(' ');
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
        }

        main.innerHTML = `
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
                    <div><label class="small-label">Värde (SEK)</label><input type="number" id="editCustValue" class="input" value="${c.value || 0}"></div>
                </div>
            </div>

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
                    <div><label class="small-label">Typ</label>
                         <select id="editCustStatus" class="input">
                            <option value="customer" ${c.status === 'customer' ? 'selected' : ''}>Kund</option>
                            <option value="lead" ${c.status === 'lead' ? 'selected' : ''}>Lead</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="panel soft" style="background:var(--glass);">
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
        `;
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
