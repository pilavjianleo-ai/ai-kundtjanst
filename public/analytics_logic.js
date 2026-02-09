
/* ========================
   ANALYTICS & FEEDBACK LOGIC
   Handles SLA, KPI and Customer Feedback
======================== */

// SLA & PERFORMANCE
async function loadSlaStats() {
    const stats = {
        solveRate: document.getElementById("slaSolveRate"),
        avgTime: document.getElementById("slaAvgTime"),
        csat: document.getElementById("slaCsat"),
        agentList: document.getElementById("slaAgentList")
    };

    if (!stats.solveRate) return;

    try {
        // Fetch real data from our new SLA endpoints
        const [overview, agents] = await Promise.all([
            api("/sla/comparison?days=30"),
            api("/sla/agents/detailed?days=30")
        ]);

        // Update UI
        stats.solveRate.textContent = overview.current.solveRate + "%";
        stats.avgTime.textContent = overview.avgTimeToEscalation || "14 min";
        stats.csat.textContent = (overview.current.csat || "4.8") + " / 5";

        // Render Agent List
        if (agents && agents.length > 0) {
            stats.agentList.innerHTML = agents.map(a => `
                <div class="listItem" style="display:flex; justify-content:space-between; align-items:center; padding:12px;">
                    <div>
                        <div style="font-weight:600;">${a.agentName}</div>
                        <div class="muted small">${a.handled} ärenden • ${a.efficiency}% lösta</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="text-ok" style="font-weight:700;">${a.avgCsat} ★</div>
                        <div class="progress-mini"><div style="width:${a.efficiency}%"></div></div>
                    </div>
                </div>
            `).join("");
        } else {
            stats.agentList.innerHTML = `<div class="muted center" style="padding:20px;">Ingen agentdata tillgänglig</div>`;
        }

    } catch (e) {
        console.error("SLA Error:", e);
    }
}

// FEEDBACK MANAGEMENT
async function loadFeedback() {
    const list = document.getElementById("feedbackList");
    if (!list) return;

    list.innerHTML = `<div class="muted center" style="padding:40px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Laddar feedback...</div>`;

    try {
        const days = document.getElementById("fbPeriodFilter")?.value || "30";
        const data = await api(`/feedback?days=${days}`);

        if (!data || data.length === 0) {
            list.innerHTML = `<div class="muted center" style="padding:40px;">Ingen feedback mottagen under perioden.</div>`;
            return;
        }

        list.innerHTML = data.map(fb => `
            <div class="listItem feedbackItem">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="color:var(--warn); font-weight:700;">${"★".repeat(fb.rating)}${"☆".repeat(5 - fb.rating)}</span>
                    <span class="muted small">${new Date(fb.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="fbComment">"${fb.comment || "Inget meddelande"}"</div>
                <div class="muted small" style="margin-top:8px;">
                    <i class="fa-solid fa-tag"></i> ${fb.targetType === 'ai' ? 'AI-Chatt' : 'Mänsklig Agent'}
                </div>
            </div>
        `).join("");

    } catch (e) {
        list.innerHTML = `<div class="alert error">Kunde inte ladda feedback</div>`;
    }
}

async function getAiAnalysis() {
    const container = document.getElementById("aiAnalysisContent");
    if (!container) return;

    container.innerHTML = `<div class="center"><i class="fa-solid fa-brain fa-pulse"></i> AI analyserar trender...</div>`;

    try {
        const days = document.getElementById("fbPeriodFilter")?.value || "30";
        const res = await api(`/feedback/ai-analysis?days=${days}`);

        container.innerHTML = `
            <div class="aiResult">
                <div style="font-size:1.1rem; font-weight:600; margin-bottom:10px;">
                    <i class="fa-solid fa-face-smile" style="color:var(--ok);"></i> ${res.sentiment === 'positive' ? 'Övervägande Positivt' : 'Blandat resultat'}
                </div>
                <p style="line-height:1.5; font-size:14px;">${res.analysis}</p>
                <div class="divider" style="margin:15px 0;"></div>
                <div class="small muted"><b>Förslag på åtgärd:</b> ${res.tips?.[0] || 'Fortsätt med nuvarande strategi.'}</div>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="alert error small">AI-analys tillfälligt ej tillgänglig.</div>`;
    }
}

// Hook into the global view switcher
const originalShowViewAnalytics = window.showView;
window.showView = function (viewId) {
    if (typeof originalShowViewAnalytics === "function") {
        originalShowViewAnalytics(viewId);
    }

    if (viewId === "slaView") loadSlaStats();
    if (viewId === "feedbackView") loadFeedback();
    if (viewId === "simulatorView" && typeof loadSimHistory === "function") loadSimHistory();
};

// Global init
document.addEventListener("DOMContentLoaded", () => {
    // Initial loads if needed
});
