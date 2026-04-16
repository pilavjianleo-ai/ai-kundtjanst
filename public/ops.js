const ops = {
  version: "2026.30",
  token: localStorage.getItem("token") || "",
  me: null,
  companies: [],
  companyId: localStorage.getItem("opsCompanyId") || "",
  route: (location.hash || "#overview").replace("#", ""),
  notifications: [],
  live: { typing: new Map(), lastTicketUpdateAt: null, lastImportantAt: null, selectedTicketId: null },
  socket: null,
  preview: false,
  rulesDraft: [],
  aiPreviewPreset: localStorage.getItem("opsAiPreviewPreset") || "professional"
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setTheme(next) {
  document.body.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

function toggleTheme() {
  const cur = document.body.getAttribute("data-theme") || "light";
  setTheme(cur === "dark" ? "light" : "dark");
}

function envLabel() {
  const host = location.hostname || "";
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) return { text: "Test Environment", pill: "warn" };
  return { text: "Production", pill: "ok" };
}

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (ops.token) headers.Authorization = "Bearer " + ops.token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `Server error (${res.status})`);
  return data;
}

function formatNumber(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0";
  return new Intl.NumberFormat("sv-SE").format(x);
}

function formatMoneySEK(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0 kr";
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(x);
}

function trendPill(delta) {
  const d = Number(delta || 0);
  if (!Number.isFinite(d) || d === 0) return { cls: "muted", text: "0%" };
  const pct = Math.round(d * 100);
  if (pct > 0) return { cls: "success", text: `+${pct}%` };
  return { cls: "danger", text: `${pct}%` };
}

function confidenceLabel(confidence) {
  const raw = Number(confidence);
  const pct = Number.isFinite(raw) ? (raw <= 1 ? Math.round(raw * 100) : Math.round(raw)) : 70;
  const clamped = Math.max(0, Math.min(100, pct));
  const label = clamped >= 82 ? "High" : clamped >= 62 ? "Medium" : "Low";
  return { label, pct: clamped };
}

function formatImpact(impact) {
  if (!impact) return "";
  if (typeof impact === "string") return impact;
  const n = Number(impact);
  if (Number.isFinite(n)) return formatMoneySEK(n) + "/month";
  return String(impact);
}

function setTopbar() {
  const env = envLabel();
  $("opsEnvBadge").innerHTML = `<span class="pill ${env.pill}">${escapeHtml(env.text)}</span>`;
  $("opsUserName").textContent = ops.me?.username || ops.me?.email || "User";
  const selected = ops.companies.find((c) => String(c.companyId) === String(ops.companyId));
  const name = ops.companyId ? (selected?.displayName || selected?.companyId || "Company") : "All companies";
  $("opsCompanyName").textContent = ops.preview ? `Preview • ${name}` : name;
}

function setCompanySelect() {
  const sel = $("opsCompanySelect");
  if (!sel) return;
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All companies";
  sel.appendChild(optAll);
  ops.companies.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.companyId;
    opt.textContent = `${c.displayName} (${c.companyId})`;
    sel.appendChild(opt);
  });
  sel.value = ops.companyId || "";
}

function setRoute(route) {
  ops.route = route || "overview";
  const items = document.querySelectorAll(".opsNavItem");
  items.forEach((b) => b.classList.toggle("active", b.getAttribute("data-route") === ops.route));
  location.hash = "#" + ops.route;
  renderPage().catch(() => {});
}

function pushNotification({ title, body, type = "info" }) {
  ops.notifications.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ts: new Date().toISOString(),
    title,
    body,
    type
  });
  ops.notifications = ops.notifications.slice(0, 25);
  renderNotifPopover();
}

function renderNotifPopover() {
  const panel = $("opsNotifPanel");
  if (!panel) return;
  const items = ops.notifications;
  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 6px 10px 6px;">
      <div style="font-weight:900;">Notifications</div>
      <button class="btn ghost small" id="opsNotifClearBtn" type="button"><i class="fa-solid fa-trash"></i> Clear</button>
    </div>
    ${items.length ? items.map((n) => {
      const when = n.ts ? new Date(n.ts).toLocaleString("sv-SE") : "";
      const pill = n.type === "danger" ? "danger" : n.type === "warn" ? "warn" : "ok";
      return `
        <div class="panel" style="margin-top:10px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div style="font-weight:900;">${escapeHtml(n.title)}</div>
            <span class="pill ${pill}">${escapeHtml(when)}</span>
          </div>
          <div class="muted small" style="margin-top:8px; line-height:1.45;">${escapeHtml(n.body)}</div>
        </div>
      `;
    }).join("") : `<div class="panel soft">No notifications yet. Live AI events and operational alerts will appear here.</div>`}
  `;
  $("opsNotifClearBtn")?.addEventListener("click", () => {
    ops.notifications = [];
    renderNotifPopover();
  });
}

function renderUserPopover() {
  const panel = $("opsUserPanel");
  if (!panel) return;
  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 6px 10px 6px;">
      <div style="font-weight:900;">${escapeHtml(ops.me?.username || "Account")}</div>
      <span class="pill">${escapeHtml(ops.me?.role || "")}</span>
    </div>
    <div class="panel soft" style="margin-top:10px;">
      <div style="font-weight:850;">Signed in</div>
      <div class="muted small" style="margin-top:6px;">Use the main app for profile management.</div>
      <div style="margin-top:12px; display:flex; gap:10px;">
        <a class="btn secondary" href="/" style="text-decoration:none;">Open App</a>
        <button class="btn danger" id="opsLogoutBtn" type="button">Log out</button>
      </div>
    </div>
  `;
  $("opsLogoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    location.href = "/";
  });
}

function mountKpis(kpis) {
  const strip = $("opsKpiStrip");
  if (!strip) return;
  strip.innerHTML = (kpis || []).map((k) => {
    const t = trendPill(k.trendPct);
    return `
      <div class="panel soft kpiCard">
        <div class="muted small">${escapeHtml(k.label)}</div>
        <div class="title" style="font-size:24px; margin-top:8px;">${escapeHtml(k.value)}</div>
        <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:12px; color:var(--muted);">
          <span style="color:var(--${t.cls}); font-weight:600;">${t.text}</span>
          <span>${escapeHtml(k.context || "")}</span>
        </div>
        <div class="kpiWhy muted small" style="margin-top:10px;">${escapeHtml(k.why || "")}</div>
      </div>
    `;
  }).join("");
}

function mountInsights(items) {
  const grid = $("opsInsightsGrid");
  if (!grid) return;
  grid.innerHTML = (items || []).map((i, idx) => {
    const pill = i.sev === "danger" ? "danger" : i.sev === "warn" ? "warn" : "ok";
    const impactText = formatImpact(i.impact || i.impactLabel) || (pill === "danger" ? "High impact" : pill === "warn" ? "Medium impact" : "Low impact");
    const c = confidenceLabel(i.confidence ?? i.confidencePct ?? (pill === "danger" ? 0.78 : pill === "warn" ? 0.70 : 0.64));
    const actionLabel = i.cta || i.actionLabel || "Open";
    return `
      <div class="panel">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div class="title" style="font-size:16px;">${escapeHtml(i.title)}</div>
          <span class="pill ${pill}">${escapeHtml(i.badge || "Insight")}</span>
        </div>
        <div class="muted small" style="margin-top:8px; line-height:1.45;">${escapeHtml(i.body)}</div>
        <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
          <span class="pill"><span style="font-weight:900; color:var(--text);">${escapeHtml(impactText)}</span></span>
          <span class="muted small" style="white-space:nowrap;">Confidence ${escapeHtml(String(c.label))} • ${escapeHtml(String(c.pct))}%</span>
        </div>
        <div style="margin-top:12px; display:flex; gap:10px; align-items:center; justify-content:space-between;">
          <div style="display:flex; gap:10px; align-items:center; min-width:0;">
            <span class="muted small" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(i.next || "")}</span>
          </div>
          <button class="btn primary small" type="button" data-insight-act="${idx}">${escapeHtml(actionLabel)}</button>
        </div>
      </div>
    `;
  }).join("");
  document.querySelectorAll("button[data-insight-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-insight-act"));
      const item = (items || [])[i];
      if (!item) return;
      if (item.route) setRoute(item.route);
      if (typeof item.action === "function") item.action();
    });
  });
}

async function fetchTicketsForOps() {
  if (ops.preview) {
    const now = Date.now();
    const mk = (i, p, status, assigned) => ({
      _id: "preview-" + i,
      publicTicketId: "P-" + String(1000 + i),
      title: i % 2 ? "Refund request: order #18402" : "Pricing question: enterprise plan",
      channel: i % 3 === 0 ? "chat" : i % 3 === 1 ? "email" : "sms",
      status,
      priority: p,
      assignedToUserId: assigned ? "agent-1" : null,
      lastActivityAt: new Date(now - i * 1000 * 60 * 13).toISOString(),
      events: i % 4 === 0 ? [{ type: "ai_error", timestamp: new Date(now - i * 1000 * 60 * 20).toISOString(), data: {} }] : [],
      stats: { firstResponseTimeMs: 1000 * 60 * (6 + i) }
    });
    return {
      tickets: [
        mk(1, "high", "open", false),
        mk(2, "normal", "pending", true),
        mk(3, "high", "open", true),
        mk(4, "normal", "pending", false),
        mk(5, "low", "open", false),
        mk(6, "normal", "solved", true)
      ],
      source: "preview"
    };
  }
  const isAgent = ["agent", "admin"].includes(ops.me?.role);
  if (!isAgent) return { tickets: [], source: "user" };
  const companyParam = encodeURIComponent(ops.companyId || "");
  const tickets = await api(`/inbox/tickets?status=&companyId=${companyParam}&channel=`);
  return { tickets: Array.isArray(tickets) ? tickets : [], source: "inbox" };
}

async function fetchUsageEvents(days = 30) {
  if (ops.preview) {
    const now = Date.now();
    return Array.from({ length: 18 }).map((_, i) => ({
      _id: "ev-" + i,
      companyId: ops.companyId || "demo",
      type: i % 3 === 0 ? "ai_chat" : "ai_summary",
      tokensApprox: 420 + i * 31,
      latencyMs: 420 + i * 17,
      ok: i % 11 !== 0,
      createdAt: new Date(now - i * 1000 * 60 * 40).toISOString()
    }));
  }
  try {
    const q = new URLSearchParams();
    if (ops.companyId) q.set("companyId", ops.companyId);
    q.set("days", String(days));
    q.set("limit", "200");
    return await api("/admin/usage/events?" + q.toString());
  } catch {
    return [];
  }
}

async function fetchCrmDeals() {
  if (ops.preview) {
    return [
      { stage: "lead", amount: 25000, status: "open" },
      { stage: "qualified", amount: 48000, status: "open" },
      { stage: "proposal", amount: 62000, status: "open" },
      { stage: "negotiation", amount: 92000, status: "open" },
      { stage: "won", amount: 78000, status: "won" },
      { stage: "lost", amount: 34000, status: "lost" }
    ];
  }
  if (!ops.companyId) return [];
  try {
    const data = await api("/crm/sync?companyId=" + encodeURIComponent(ops.companyId));
    return Array.isArray(data?.deals) ? data.deals : [];
  } catch {
    return [];
  }
}

async function fetchAbStats() {
  if (ops.preview) {
    return {
      companyId: ops.companyId || "demo",
      variants: [
        { name: "A", tickets: 42, solvedRate: 0.62, avgFirstResponseMin: 8, csatAvg: 4.3, escalationRate: 0.12 },
        { name: "B", tickets: 39, solvedRate: 0.67, avgFirstResponseMin: 7, csatAvg: 4.4, escalationRate: 0.10 }
      ]
    };
  }
  if (!ops.companyId) return { companyId: "", variants: [] };
  try {
    return await api("/ai/ab-stats?companyId=" + encodeURIComponent(ops.companyId));
  } catch {
    return { companyId: ops.companyId, variants: [] };
  }
}

async function buildInsights({ tickets, events }) {
  const open = tickets.filter((t) => t.status !== "solved");
  const highPriOpen = open.filter((t) => t.priority === "high");
  const withoutAgent = open.filter((t) => !t.assignedToUserId);
  const aiErrors = open.filter((t) => (t.events || []).some((e) => e.type === "ai_error"));

  const failedEscalations = Math.max(0, highPriOpen.length + aiErrors.length);
  const revenueLeak = failedEscalations * 6200;
  const estLift = open.length ? Math.min(0.18, (open.length / 120) * 0.08) : 0.04;

  const items = [
    {
      sev: failedEscalations ? "danger" : "ok",
      badge: "Revenue",
      title: failedEscalations ? "Revenue leakage detected" : "Revenue protected",
      body: failedEscalations
        ? "Failed escalations and high-risk conversations are reducing conversion and increasing churn risk."
        : "Escalation signals look stable for the selected scope.",
      impact: failedEscalations ? revenueLeak : "Low impact",
      confidence: failedEscalations ? 0.82 : 0.66,
      cta: failedEscalations ? "Fix in AI Control Center" : "Review in AI Control Center",
      next: failedEscalations ? "Update Intent Routing to catch edge cases." : "Monitor high-risk intents in Logs.",
      route: "ai-control-center"
    },
    {
      sev: withoutAgent.length ? "warn" : "ok",
      badge: "Operations",
      title: withoutAgent.length ? "Ownership gap detected" : "Ownership healthy",
      body: withoutAgent.length
        ? "Unassigned conversations increase time-to-resolution and reduce customer trust."
        : "Ownership coverage is stable for the selected scope.",
      impact: withoutAgent.length ? `${withoutAgent.length} unowned conversations` : "Low impact",
      confidence: 0.74,
      cta: "Fix in AI Control Center",
      action: () => { window.gotoAiOs("flows"); }
    },
    {
      sev: "ok",
      badge: "Growth",
      title: "Response time drives conversion",
      body: "Reducing first response time improves trust and reduces purchase drop-offs.",
      impact: `${Math.round(estLift * 100)}% conversion lift`,
      confidence: 0.68,
      cta: "Optimize in AI Control Center",
      action: () => { window.gotoAiOs("behavior"); }
    }
  ];

  return items;
}

function buildActivityFeed({ tickets, events }) {
  const items = [];
  const now = Date.now();

  const open = (tickets || []).filter((t) => t.status !== "solved");
  const high = open.filter((t) => t.priority === "high");
  const aiErrors = open.filter((t) => (t.events || []).some((e) => e.type === "ai_error"));

  if (high.length) {
    items.push({
      icon: "fa-triangle-exclamation",
      title: `${high.length} high-risk conversations need attention`,
      meta: "Protect revenue by escalating and assigning ownership.",
      ts: new Date(now).toISOString()
    });
  }

  if (aiErrors.length) {
    items.push({
      icon: "fa-robot",
      title: `AI reliability alert (${aiErrors.length})`,
      meta: "Review failures and add escalation rules for edge cases.",
      ts: new Date(now - 1000 * 60 * 9).toISOString()
    });
  }

  const usage = Array.isArray(events) ? events.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) : [];
  usage.slice(0, 8).forEach((e) => {
    const ok = e.ok === false ? "danger" : "ok";
    items.push({
      icon: ok === "danger" ? "fa-circle-xmark" : "fa-wand-magic-sparkles",
      title: e.type === "ai_chat" ? "AI handled a conversation" : "AI generated an internal insight",
      meta: `${formatNumber(e.tokensApprox || 0)} tok • ${formatNumber(e.latencyMs || 0)} ms`,
      ts: e.createdAt || new Date().toISOString()
    });
  });

  if (items.length === 0) {
    items.push({
      icon: "fa-bolt",
      title: "No activity yet",
      meta: "Start conversations or connect integrations to generate operational signals.",
      ts: new Date(now).toISOString()
    });
  }

  return items.slice(0, 10);
}

function renderPrimaryCta({ label, icon, onClick }) {
  const slot = $("opsPrimaryCta");
  if (!slot) return;
  slot.innerHTML = `<button class="btn primary" type="button" id="opsCtaBtn"><i class="fa-solid ${escapeHtml(icon || "fa-bolt")}"></i> ${escapeHtml(label || "Action")}</button>`;
  $("opsCtaBtn")?.addEventListener("click", onClick || (() => {}));
}

function renderEmpty({ title, body, actions = [] }) {
  return `
    <div class="panel soft">
      <div style="font-weight:900;">${escapeHtml(title || "No data yet")}</div>
      <div class="muted small" style="margin-top:8px; line-height:1.45;">${escapeHtml(body || "Connect data sources or generate sample activity to get started.")}</div>
      ${actions.length ? `<div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        ${actions.map((a, i) => `<button class="btn ${a.variant || "secondary"} small" type="button" data-empty-act="${i}"><i class="fa-solid ${escapeHtml(a.icon || "fa-bolt")}"></i> ${escapeHtml(a.label || "Action")}</button>`).join("")}
      </div>` : ""}
    </div>
  `;
}

async function renderOverview({ tickets, events }) {
  $("opsPageTitle").textContent = "Performance Overview";
  $("opsPageSub").textContent = "Revenue impact, automation performance, and operational efficiency — in one view.";
  renderPrimaryCta({ label: "View opportunities", icon: "fa-bullseye", onClick: () => setRoute("opportunities") });

  const open = tickets.filter((t) => t.status !== "solved");
  const solved = tickets.filter((t) => t.status === "solved");
  const aiEvents = Array.isArray(events) ? events.filter((e) => String(e.type || "").startsWith("ai_")) : [];
  const tokens = aiEvents.reduce((a, e) => a + Number(e.tokensApprox || 0), 0);

  const openTrend = tickets.length ? (open.length / tickets.length) - 0.25 : 0.04;
  const tokensTrend = 0.08;
  const solvedTrend = tickets.length ? (solved.length / tickets.length) - 0.18 : 0.06;

  mountKpis([
    { label: "Revenue impact", value: `${formatMoneySEK(Math.max(0, (open.length - 4) * 4200))}`, trendPct: 0.06, context: "estimated", why: "Shows what is at risk if operational signals are ignored." },
    { label: "Active conversations", value: `${formatNumber(open.length)}`, trendPct: openTrend, context: "open/pending", why: "Active load drives response time and customer trust." },
    { label: "Resolved conversations", value: `${formatNumber(solved.length)}`, trendPct: solvedTrend, context: "solved", why: "Resolution throughput indicates operational efficiency." },
    { label: "AI handled conversations", value: `${formatNumber(aiEvents.length)}`, trendPct: 0.12, context: "vs last period", why: "Automation volume drives throughput and margin." }
  ]);

  const insights = await buildInsights({ tickets, events });
  mountInsights(insights);

  const left = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Status</div>
        <span class="pill">${escapeHtml(ops.companyId || "All companies")}</span>
      </div>
      <div style="padding:16px;">
        <div class="grid2">
          <div class="panel soft">
            <div class="muted small">AI handling now</div>
            <div style="font-weight:920; font-size:22px; margin-top:8px;">${formatNumber(Math.min(open.length, 12))} conversations</div>
            <div class="muted small" style="margin-top:8px;">Live signals update in real-time.</div>
          </div>
          <div class="panel soft">
            <div class="muted small">Escalation pressure</div>
            <div style="font-weight:920; font-size:22px; margin-top:8px;">${formatNumber(open.filter((t) => t.priority === "high").length)} high priority</div>
            <div class="muted small" style="margin-top:8px;">Prioritize to protect revenue and CX.</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="muted small">Next best actions</div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" id="opsGoLiveAi"><i class="fa-solid fa-signal"></i> Live AI</button>
          <button class="btn secondary" type="button" id="opsGoRules"><i class="fa-solid fa-microchip"></i> Open AI Control Center</button>
        </div>
      </div>
    </div>
  `;

  const feed = buildActivityFeed({ tickets, events });
  const right = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div class="panel soft">
        <div class="panelHead">
          <div class="title" style="font-size:16px;">Executive signals</div>
          <span class="pill ok"><i class="fa-solid fa-shield"></i> High trust</span>
        </div>
        <div style="padding:16px;">
          <div class="panel soft">
            <div style="font-weight:900;">Operate with clarity</div>
            <div class="muted small" style="margin-top:8px;">Use Insights to identify what to fix next. Use Live AI to intervene when outcomes are at risk.</div>
          </div>
          <div class="divider"></div>
          <div class="muted small">System signals</div>
          <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
            <div class="pill"><i class="fa-solid fa-clock"></i> Ticket activity <span style="margin-left:auto;">${escapeHtml(ops.live.lastTicketUpdateAt ? new Date(ops.live.lastTicketUpdateAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "—")}</span></div>
            <div class="pill"><i class="fa-solid fa-bolt"></i> AI typing <span style="margin-left:auto;">${formatNumber(ops.live.typing.size)}</span></div>
            <div class="pill"><i class="fa-solid fa-coins"></i> Tokens (30d) <span style="margin-left:auto;">${escapeHtml(formatNumber(tokens))}</span></div>
          </div>
        </div>
      </div>

      <div class="panel soft">
        <div class="panelHead">
          <div class="title" style="font-size:16px;">Activity feed</div>
          <span class="pill">signals</span>
        </div>
        <div style="padding:16px;">
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${feed.map((it) => {
              const when = it.ts ? new Date(it.ts).toLocaleString("sv-SE") : "";
              return `
                <div class="listItem">
                  <div style="width:30px; height:30px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:var(--primary-fade); color:var(--primary); flex:0 0 30px;"><i class="fa-solid ${escapeHtml(it.icon || "fa-bolt")}"></i></div>
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:900; letter-spacing:-0.01em;">${escapeHtml(it.title || "")}</div>
                    <div class="muted small" style="margin-top:4px;">${escapeHtml(it.meta || "")} • ${escapeHtml(when)}</div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  $("opsContent").innerHTML = left + right;
  $("opsGoLiveAi")?.addEventListener("click", () => setRoute("live-ai"));
  $("opsGoRules")?.addEventListener("click", () => setRoute("ai-control-center"));
}

async function renderLiveAi({ tickets }) {
  $("opsPageTitle").textContent = "Live AI";
  $("opsPageSub").textContent = "Real-time conversations and intervention controls to protect revenue and CX.";
  renderPrimaryCta({ label: "Open Inbox", icon: "fa-inbox", onClick: () => (location.href = "/#inbox") });

  const open = tickets
    .filter((t) => t.status !== "solved")
    .slice()
    .sort((a, b) => new Date(b.lastActivityAt || 0) - new Date(a.lastActivityAt || 0))
    .slice(0, 60);

  const high = open.filter((t) => t.priority === "high");
  const unowned = open.filter((t) => !t.assignedToUserId);
  mountKpis([
    { label: "AI handling now", value: `${formatNumber(Math.min(12, open.length))}`, trendPct: 0.08, context: "live", why: "This is the live operational load currently handled by AI." },
    { label: "High-risk conversations", value: `${formatNumber(high.length)}`, trendPct: 0.11, context: "priority=high", why: "High-risk conversations correlate with churn and lost revenue." },
    { label: "Ownership gaps", value: `${formatNumber(unowned.length)}`, trendPct: 0.07, context: "unassigned", why: "Unowned conversations increase response time and escalation failures." },
    { label: "AI live signals", value: `${formatNumber(ops.live.typing.size)}`, trendPct: 0.02, context: "typing", why: "Live signals indicate in-flight AI activity and routing." }
  ]);

  mountInsights(await buildInsights({ tickets, events: [] }));

  const selectedId = ops.live.selectedTicketId && open.some((t) => String(t._id) === String(ops.live.selectedTicketId))
    ? ops.live.selectedTicketId
    : (open[0]?._id || null);
  ops.live.selectedTicketId = selectedId;
  const selected = selectedId ? open.find((t) => String(t._id) === String(selectedId)) : null;

  const listHtml = open.length
    ? `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${open.map((t) => {
          const last = t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleString("sv-SE") : "";
          const pri = t.priority === "high" ? "danger" : t.priority === "low" ? "" : "warn";
          const status = t.status === "pending" ? "warn" : t.status === "solved" ? "ok" : "";
          const owned = t.assignedToUserId ? "ok" : "warn";
          const active = selectedId && String(t._id) === String(selectedId) ? "active" : "";
          return `
            <div class="listItem ${active}" data-live-id="${escapeHtml(String(t._id || ""))}">
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                  <div style="font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.title || "Conversation")}</div>
                  <div class="muted tiny">#${escapeHtml(t.publicTicketId || "")} • ${escapeHtml(t.channel || "chat")} • ${escapeHtml(last)}</div>
                </div>
                <span class="pill ${pri}">${escapeHtml(String(t.priority || ""))}</span>
              </div>
              <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
                <span class="pill ${status}">Status: ${escapeHtml(String(t.status || ""))}</span>
                <span class="pill ${owned}">${t.assignedToUserId ? "Owned" : "Unassigned"}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `
    : renderEmpty({
        title: "No live conversations",
        body: "Start a conversation in Chat or ingest Email/SMS to generate live operational signals.",
        actions: [
          { label: "Open Chat", variant: "primary", icon: "fa-comments" },
          { label: "View Opportunities", variant: "secondary", icon: "fa-bullseye" }
        ]
      });

  const left = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Live feed</div>
        <span class="pill"><i class="fa-solid fa-signal"></i> realtime</span>
      </div>
      <div style="padding:16px;">
        ${listHtml}
      </div>
    </div>
  `;

  const risk = selected?.priority === "high" ? "danger" : selected?.status === "pending" ? "warn" : "ok";
  const hasAiError = selected ? (selected.events || []).some((e) => e.type === "ai_error") : false;
  const explain = selected
    ? `
      <div class="panel soft" style="margin-top:12px;">
        <div style="font-weight:900;">Summary</div>
        <div class="muted small" style="margin-top:8px;">${escapeHtml(hasAiError ? "AI failed or was uncertain. This conversation needs human review." : "AI is handling the conversation and routing based on risk signals.")}</div>
        <div class="divider"></div>
        <div style="font-weight:900;">Recommended action</div>
        <div class="muted small" style="margin-top:8px;">${escapeHtml(selected.assignedToUserId ? "Review and close the loop. If needed, update rules to prevent repeats." : "Take over or assign ownership. Add an escalation rule if this intent repeats.")}</div>
      </div>
    `
    : renderEmpty({ title: "Select a conversation", body: "Pick a conversation from the live feed to see AI reasoning and recommended actions." });

  const eventsList = selected && Array.isArray(selected.events) && selected.events.length
    ? selected.events.slice().sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, 6)
      .map((e) => `<div class="pill">${escapeHtml(String(e.type || ""))}</div>`).join("")
    : `<div class="pill">No explainability events yet</div>`;

  const right = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">AI reasoning</div>
        <span class="pill ${risk}">${escapeHtml(selected ? (risk === "danger" ? "High risk" : risk === "warn" ? "Medium risk" : "Low risk") : "—")}</span>
      </div>
      <div style="padding:16px;">
        ${selected ? `
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <span class="pill">${escapeHtml(selected.channel || "chat")}</span>
            <span class="pill">Status: ${escapeHtml(String(selected.status || ""))}</span>
            <span class="pill">Priority: ${escapeHtml(String(selected.priority || ""))}</span>
          </div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn primary" type="button" id="opsTakeoverBtn"><i class="fa-solid fa-hand"></i> Take over</button>
            <button class="btn secondary" type="button" id="opsRefreshLive"><i class="fa-solid fa-rotate"></i> Refresh</button>
            <button class="btn ghost" type="button" id="opsViewRules"><i class="fa-solid fa-diagram-project"></i> Automation</button>
          </div>
        ` : ""}
        ${explain}
        <div class="divider"></div>
        <div class="muted small">Explainability log</div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          ${eventsList}
        </div>
      </div>
    </div>
  `;

  $("opsContent").innerHTML = left + right;

  document.querySelectorAll("[data-live-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-live-id");
      if (!id) return;
      ops.live.selectedTicketId = id;
      renderPage().catch(() => {});
    });
  });

  async function doTakeover() {
    if (!selected?._id) return;
    const btn = $("opsTakeoverBtn");
    if (btn) btn.disabled = true;
    try {
      await api("/inbox/tickets/" + encodeURIComponent(selected._id) + "/assign", { method: "PATCH", body: { userId: ops.me?._id || ops.me?.id || "" } });
      pushNotification({ title: "Take over", body: "Conversation assigned.", type: "ok" });
      await renderPage();
    } catch (e) {
      pushNotification({ title: "Take over failed", body: e.message, type: "danger" });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  $("opsTakeoverBtn")?.addEventListener("click", doTakeover);
  $("opsRefreshLive")?.addEventListener("click", () => renderPage());
  $("opsViewRules")?.addEventListener("click", () => setRoute("automation-rules"));
}

async function renderConversations({ tickets }) {
  $("opsPageTitle").textContent = "Conversations";
  $("opsPageSub").textContent = "Track outcomes across customer conversations — not just messages.";
  renderPrimaryCta({ label: "Open Inbox", icon: "fa-inbox", onClick: () => (location.href = "/#inbox") });

  const open = tickets.filter((t) => t.status !== "solved");
  mountKpis([
    { label: "Total conversations", value: `${formatNumber(tickets.length)}`, trendPct: 0.06, context: "scope", why: "Volume indicates demand and growth." },
    { label: "Open", value: `${formatNumber(open.length)}`, trendPct: 0.05, context: "workload", why: "Open load impacts speed and CX." },
    { label: "Solved", value: `${formatNumber(tickets.length - open.length)}`, trendPct: 0.04, context: "throughput", why: "Resolution shows operational efficiency." },
    { label: "High priority", value: `${formatNumber(open.filter((t) => t.priority === "high").length)}`, trendPct: 0.11, context: "risk", why: "High priority impacts retention and revenue." },
    { label: "Unassigned", value: `${formatNumber(open.filter((t) => !t.assignedToUserId).length)}`, trendPct: 0.09, context: "latency", why: "Ownership reduces time-to-resolution." }
  ]);
  mountInsights(await buildInsights({ tickets, events: [] }));

  const list = tickets.slice(0, 120).map((t) => {
    const ts = t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleString("sv-SE") : "";
    const pill = t.status === "solved" ? "ok" : t.status === "pending" ? "warn" : "";
    return `
      <div class="panel" style="margin-top:10px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div>
            <div style="font-weight:900;">${escapeHtml(t.title || "Conversation")}</div>
            <div class="muted tiny">#${escapeHtml(t.publicTicketId || "")} • ${escapeHtml(t.channel || "chat")} • ${escapeHtml(ts)}</div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <span class="pill ${pill}">${escapeHtml(t.status || "")}</span>
            <button class="btn ghost small" type="button" data-open-ticket="${escapeHtml(String(t._id || ""))}">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Conversation list</div>
        <span class="pill">${escapeHtml(ops.companyId || "All companies")}</span>
      </div>
      <div style="padding:16px;">
        ${tickets.length ? list : renderEmpty({ title: "No conversations", body: "Create conversations through Chat or Inbox to populate this view." })}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Action</div>
        <span class="pill warn">recommended</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Improve business outcomes</div>
          <div class="muted small" style="margin-top:8px;">Use Opportunities to prioritize changes by impact on revenue, cost, and customer experience.</div>
          <div style="margin-top:12px;">
            <button class="btn primary" type="button" id="opsGoOpp"><i class="fa-solid fa-bullseye"></i> Open Opportunities</button>
          </div>
        </div>
      </div>
    </div>
  `;
  $("opsGoOpp")?.addEventListener("click", () => setRoute("opportunities"));
  document.querySelectorAll("button[data-open-ticket]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-ticket");
      if (!id) return;
      location.href = "/#inbox";
      pushNotification({ title: "Open conversation", body: "Use Inbox to view full ticket history and timeline.", type: "info" });
    });
  });
}

async function renderSupportPerformance({ tickets }) {
  $("opsPageTitle").textContent = "Support Performance";
  $("opsPageSub").textContent = "Protect customer trust with faster first response and fewer unresolved escalations.";
  renderPrimaryCta({ label: "Improve rules", icon: "fa-diagram-project", onClick: () => setRoute("automation-rules") });

  const open = tickets.filter((t) => t.status !== "solved");
  const firstResp = open.map((t) => t.stats?.firstResponseTimeMs).filter((x) => Number.isFinite(Number(x)));
  const avgFirst = firstResp.length ? firstResp.reduce((a, b) => a + Number(b), 0) / firstResp.length : null;

  mountKpis([
    { label: "Active support load", value: `${formatNumber(open.length)}`, trendPct: 0.06, context: "open/pending", why: "High load increases wait time and churn risk." },
    { label: "Avg first response", value: avgFirst === null ? "—" : `${Math.round(avgFirst / 60000)} min`, trendPct: -0.04, context: "estimated", why: "Fast response increases trust and conversion." },
    { label: "High priority", value: `${formatNumber(open.filter((t) => t.priority === "high").length)}`, trendPct: 0.09, context: "risk", why: "High risk conversations need escalation." },
    { label: "Unowned", value: `${formatNumber(open.filter((t) => !t.assignedToUserId).length)}`, trendPct: 0.08, context: "latency", why: "Ownership reduces resolution time." },
    { label: "AI errors", value: `${formatNumber(open.filter((t) => (t.events || []).some((e) => e.type === "ai_error")).length)}`, trendPct: 0.05, context: "quality", why: "AI failures correlate with escalations and refunds." }
  ]);
  mountInsights(await buildInsights({ tickets, events: [] }));

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Where time is lost</div>
        <span class="pill">business language</span>
      </div>
      <div style="padding:16px;">
        ${open.length ? `
          <div class="grid2">
            <div class="panel soft">
              <div class="muted small">Biggest bottleneck</div>
              <div style="font-weight:920; font-size:20px; margin-top:8px;">Unassigned conversations</div>
              <div class="muted small" style="margin-top:8px;">Assign ownership faster to reduce wait time and escalation rate.</div>
              <div style="margin-top:12px;">
                <button class="btn primary" type="button" id="opsGoLive"><i class="fa-solid fa-signal"></i> Take over in Live AI</button>
              </div>
            </div>
            <div class="panel soft">
              <div class="muted small">Quick wins</div>
              <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
                <div class="pill"><i class="fa-solid fa-check"></i> Route refunds to humans</div>
                <div class="pill"><i class="fa-solid fa-check"></i> Reduce AI uncertainty handoffs</div>
                <div class="pill"><i class="fa-solid fa-check"></i> Escalate VIP faster</div>
              </div>
            </div>
          </div>
        ` : renderEmpty({ title: "No support data", body: "Generate some conversations first to unlock performance insights." })}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Recommendation</div>
        <span class="pill warn">action</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Build a high-trust support motion</div>
          <div class="muted small" style="margin-top:8px;">Use Automation Rules to ensure the right conversations escalate automatically.</div>
          <div style="margin-top:12px;">
            <button class="btn secondary" type="button" id="opsGoRules2"><i class="fa-solid fa-diagram-project"></i> Open Rules</button>
          </div>
        </div>
      </div>
    </div>
  `;
  $("opsGoLive")?.addEventListener("click", () => setRoute("live-ai"));
  $("opsGoRules2")?.addEventListener("click", () => setRoute("automation-rules"));
}

async function renderSalesPerformance({ tickets }) {
  $("opsPageTitle").textContent = "Sales Performance";
  $("opsPageSub").textContent = "Identify conversion drop-offs and recover revenue with AI recommendations.";
  renderPrimaryCta({ label: "View ROI", icon: "fa-coins", onClick: () => setRoute("roi") });

  const open = tickets.filter((t) => t.status !== "solved");
  const deals = await fetchCrmDeals();
  const wonAmount = deals.filter((d) => String(d.status || "").toLowerCase() === "won").reduce((a, d) => a + Number(d.amount || d.value || 0), 0);
  const lostAmount = deals.filter((d) => String(d.status || "").toLowerCase() === "lost").reduce((a, d) => a + Number(d.amount || d.value || 0), 0);
  const estRevenue = deals.length ? wonAmount : Math.max(0, (tickets.length * 1100) - (open.length * 300));
  const lostRevenue = deals.length ? lostAmount : Math.max(0, open.filter((t) => t.priority === "high").length * 5200);
  const aiRevenue = deals.length ? Math.round(wonAmount * 0.42) : estRevenue;

  mountKpis([
    { label: "Revenue generated by AI", value: formatMoneySEK(aiRevenue), trendPct: 0.08, context: deals.length ? "from CRM (estimated AI share)" : "estimated", why: "Shows business outcomes, not model outputs." },
    { label: "Lost revenue risk", value: formatMoneySEK(lostRevenue), trendPct: 0.12, context: "open high-risk", why: "Protect conversion and renewals by intervening." },
    { label: "Drop-off signals", value: `${formatNumber(Math.max(0, open.length - 3))}`, trendPct: 0.06, context: "conversations", why: "Drop-offs indicate friction and uncertainty." },
    { label: "AI recommendations", value: `${formatNumber(Math.min(8, open.length))}`, trendPct: 0.04, context: "today", why: "Recommendations should drive action." },
    { label: "Speed to first response", value: "Improve", trendPct: -0.05, context: "driver", why: "Faster response increases conversion." }
  ]);

  mountInsights([
    {
      sev: lostRevenue ? "danger" : "ok",
      badge: "Revenue",
      title: lostRevenue ? `Recover ${formatMoneySEK(lostRevenue)} this month` : "Revenue stable",
      body: "Prioritize high-risk customer conversations. Move from analysis to action with one-click takeovers.",
      cta: "Go to Live AI",
      next: "Assign ownership for high-risk tickets.",
      route: "live-ai"
    },
    {
      sev: "warn",
      badge: "Funnel",
      title: "Conversion drop-offs detected",
      body: "Long response times correlate with drop-offs. Improve first response to lift conversion.",
      cta: "Improve support performance",
      next: "Reduce handoff latency.",
      route: "support-performance"
    },
    {
      sev: "ok",
      badge: "AI",
      title: "AI can drive upsell with clearer CTAs",
      body: "Use Sales-driven preset to consistently ask for next steps without sounding pushy.",
      cta: "Configure AI",
      next: "Apply a preset for revenue impact.",
      route: "ai-configuration"
    }
  ]);

  const stageOrder = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];
  const stageStats = stageOrder.map((s) => {
    const items = deals.filter((d) => String(d.stage || "").toLowerCase() === s);
    const amount = items.reduce((a, d) => a + Number(d.amount || d.value || 0), 0);
    return { stage: s, count: items.length, amount };
  });
  const maxCount = Math.max(1, ...stageStats.map((x) => x.count));
  const stageLabel = (s) => ({ lead: "Lead", qualified: "Qualified", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost" }[s] || s);

  const funnelHtml = deals.length
    ? `
      <div class="grid2">
        <div class="panel soft">
          <div class="muted small">Pipeline (count)</div>
          <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
            ${stageStats.map((x) => `
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:110px; font-weight:800;">${escapeHtml(stageLabel(x.stage))}</div>
                <div style="flex:1; height:10px; border-radius:999px; background: color-mix(in srgb, var(--border) 80%, transparent); overflow:hidden;">
                  <div style="height:100%; width:${Math.round((x.count / maxCount) * 100)}%; background:${x.stage === "won" ? "var(--success)" : x.stage === "lost" ? "var(--danger)" : "var(--primary)"};"></div>
                </div>
                <div class="muted small" style="width:52px; text-align:right;">${escapeHtml(String(x.count))}</div>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="panel soft">
          <div class="muted small">Conversion drop-offs</div>
          <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
            <div class="pill warn"><i class="fa-solid fa-arrow-trend-down"></i> Biggest drop: Proposal → Negotiation</div>
            <div class="pill danger"><i class="fa-solid fa-triangle-exclamation"></i> Lost value ${escapeHtml(formatMoneySEK(lostAmount))}</div>
            <div class="pill ok"><i class="fa-solid fa-arrow-trend-up"></i> Won value ${escapeHtml(formatMoneySEK(wonAmount))}</div>
          </div>
          <div class="divider"></div>
          <div class="muted small">AI recommendation</div>
          <div style="margin-top:10px;" class="panel soft">
            <div style="font-weight:900;">Improve first response in pricing journeys</div>
            <div class="muted small" style="margin-top:6px;">Shorter response time reduces drop-offs. Use Sales-driven preset + takeover for VIP leads.</div>
          </div>
        </div>
      </div>
    `
    : `
      <div class="panel soft">
        <div style="font-weight:900;">Funnel needs CRM data</div>
        <div class="muted small" style="margin-top:8px;">Connect CRM or ingest deal events to show pipeline, conversion drop-offs, and true revenue attribution.</div>
        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" id="opsGoIntegrations"><i class="fa-solid fa-plug"></i> Connect integrations</button>
          <button class="btn secondary" type="button" id="opsGoOpp2"><i class="fa-solid fa-bullseye"></i> Opportunities</button>
        </div>
      </div>
    `;

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Funnel</div>
        <span class="pill">visual</span>
      </div>
      <div style="padding:16px;">
        ${funnelHtml}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">AI recommendations</div>
        <span class="pill warn">action</span>
      </div>
      <div style="padding:16px;">
        <div class="panel">
          <div class="title" style="font-size:16px;">Add a proactive next-step question</div>
          <div class="muted small" style="margin-top:8px; line-height:1.45;">When pricing is requested, ask for timeline and use-case. This increases conversion with minimal friction.</div>
          <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
            <button class="btn primary small" type="button" id="opsApplySalesPreset"><i class="fa-solid fa-wand-magic-sparkles"></i> Apply Sales-driven preset</button>
            <span class="muted small">Instantly updates tone and CTA behavior.</span>
          </div>
        </div>
        <div class="panel" style="margin-top:12px;">
          <div class="title" style="font-size:16px;">Route refunds to human</div>
          <div class="muted small" style="margin-top:8px; line-height:1.45;">Refund intents have high churn risk. Escalate immediately to protect trust.</div>
          <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
            <button class="btn secondary small" type="button" id="opsGoRules3"><i class="fa-solid fa-diagram-project"></i> Add rule</button>
            <span class="muted small">IF intent=refund → THEN escalate</span>
          </div>
        </div>
      </div>
    </div>
  `;
  $("opsGoIntegrations")?.addEventListener("click", () => setRoute("integrations"));
  $("opsGoOpp2")?.addEventListener("click", () => setRoute("opportunities"));
  $("opsGoRules3")?.addEventListener("click", () => setRoute("automation-rules"));
  $("opsApplySalesPreset")?.addEventListener("click", async () => {
    try {
      await applyPersonalityPreset("sales");
      pushNotification({ title: "Preset applied", body: "Sales-driven preset saved for selected company.", type: "ok" });
    } catch (e) {
      pushNotification({ title: "Preset failed", body: e.message, type: "danger" });
    }
  });
}

async function applyPersonalityPreset(preset) {
  if (!ops.companyId) throw new Error("Select a company to apply a preset.");
  const current = await api("/company/settings?companyId=" + encodeURIComponent(ops.companyId));
  const ai = current?.ai || {};
  const profiles = ai.profiles || {};
  const activeProfile = ai.activeProfile || Object.keys(profiles)[0] || "default";
  const base = profiles[activeProfile] || {};

  const map = {
    professional: { style: "professionell", verbosity: "kort", tone_level: 55, empathy_level: 35, politeness_level: 75, assertiveness: "medel" },
    friendly: { style: "vänlig", verbosity: "kort", tone_level: 65, empathy_level: 70, politeness_level: 80, assertiveness: "låg" },
    sales: { style: "professionell", verbosity: "kort", tone_level: 60, empathy_level: 50, politeness_level: 75, assertiveness: "hög" },
    expert: { style: "professionell", verbosity: "normal", tone_level: 55, empathy_level: 35, politeness_level: 70, assertiveness: "hög" }
  };
  const next = map[preset] || map.professional;

  const updatedProfile = {
    ...base,
    style: next.style,
    verbosity: next.verbosity,
    tone_level: next.tone_level,
    empathy_level: next.empathy_level,
    politeness_level: next.politeness_level,
    assertiveness: next.assertiveness,
    sales: preset === "sales" ? { ...(base.sales || {}), enable_cta: true, offer_demo: true, offer_offert: true, request_contact: true } : (base.sales || {})
  };

  const mergedSettings = {
    ...current,
    ai: {
      ...ai,
      profiles: { ...profiles, [activeProfile]: updatedProfile }
    }
  };

  await api("/company/settings", { method: "PATCH", body: { companyId: ops.companyId, settings: mergedSettings } });
}

async function renderAiConfiguration() {
  $("opsPageTitle").textContent = "AI Configuration";
  $("opsPageSub").textContent = "Choose a business-ready personality preset. Use advanced settings only when necessary.";
  renderPrimaryCta({ label: "Apply Professional preset", icon: "fa-wand-magic-sparkles", onClick: async () => {
    try { await applyPersonalityPreset("professional"); pushNotification({ title: "Preset applied", body: "Professional preset saved.", type: "ok" }); }
    catch (e) { pushNotification({ title: "Preset failed", body: e.message, type: "danger" }); }
  }});

  mountKpis([
    { label: "Consistency", value: "High", trendPct: 0.03, context: "tone", why: "Consistency improves trust." },
    { label: "Business clarity", value: "Improving", trendPct: 0.05, context: "language", why: "Business language reduces confusion." },
    { label: "Escalation safety", value: "Enabled", trendPct: 0.02, context: "guardrails", why: "Protects customers and revenue." },
    { label: "Configuration risk", value: "Low", trendPct: -0.02, context: "controls", why: "Presets reduce misconfiguration." }
  ]);

  mountInsights([
    { sev: "ok", badge: "Trust", title: "Presets reduce misconfiguration risk", body: "Presets keep tone consistent and stable across teams and channels.", impact: "High trust", confidence: 0.78, cta: "Apply", next: "Start with Professional, then segment by intent.", action: () => applyPersonalityPreset("professional").catch(() => {}) },
    { sev: "warn", badge: "Revenue", title: "Sales preset improves conversion", body: "Sales-driven tone adds a clear next step in pricing journeys without sounding pushy.", impact: "Conversion uplift", confidence: 0.72, cta: "Apply", next: "Use for pricing and demo flows.", action: () => applyPersonalityPreset("sales").catch(() => {}) }
  ]);

  const previewMap = {
    professional: {
      title: "Professional",
      user: "I’m considering your enterprise plan. What’s included and how do we get started?",
      ai: "We can help. The enterprise plan includes priority support, security controls, and automation rules. If you share your company size and use case, I’ll recommend the best rollout and next steps."
    },
    friendly: {
      title: "Friendly",
      user: "I’m considering your enterprise plan. What’s included and how do we get started?",
      ai: "Absolutely — happy to help. The enterprise plan includes priority support, security controls, and automation rules. If you tell me your company size and use case, I’ll recommend the best next step."
    },
    sales: {
      title: "Sales-driven",
      user: "I’m considering your enterprise plan. What’s included and how do we get started?",
      ai: "The enterprise plan includes security controls, automation rules, and priority support. To recommend the right setup, what’s your timeline and primary use case? If you want, I can suggest a short demo flow."
    },
    expert: {
      title: "Expert advisor",
      user: "We have multiple channels and strict compliance. Can AI operate safely?",
      ai: "Yes — with governance. Use RBAC, audit logs, data minimization, and explainability logs. Then add rules for high-risk intents (refunds, outages, VIP) to ensure safe escalation and traceability."
    }
  };

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Personality presets</div>
        <span class="pill">business-ready</span>
      </div>
      <div style="padding:16px;">
        <div class="grid2">
          <div class="panel">
            <div class="title" style="font-size:16px;">Professional</div>
            <div class="muted small" style="margin-top:8px; line-height:1.45;">High trust, short answers, consistent tone. Recommended default.</div>
            <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
              <button class="btn primary" type="button" id="presetProfessional"><i class="fa-solid fa-wand-magic-sparkles"></i> Apply</button>
              <span class="muted small">Best baseline</span>
            </div>
          </div>
          <div class="panel">
            <div class="title" style="font-size:16px;">Friendly</div>
            <div class="muted small" style="margin-top:8px; line-height:1.45;">Warm and empathetic while staying concise. Great for retention.</div>
            <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
              <button class="btn secondary" type="button" id="presetFriendly"><i class="fa-solid fa-heart"></i> Apply</button>
              <span class="muted small">CX uplift</span>
            </div>
          </div>
          <div class="panel">
            <div class="title" style="font-size:16px;">Sales-driven</div>
            <div class="muted small" style="margin-top:8px; line-height:1.45;">Proactive next steps. Optimized for pricing, demos and conversions.</div>
            <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
              <button class="btn secondary" type="button" id="presetSales"><i class="fa-solid fa-chart-line"></i> Apply</button>
              <span class="muted small">Revenue uplift</span>
            </div>
          </div>
          <div class="panel">
            <div class="title" style="font-size:16px;">Expert advisor</div>
            <div class="muted small" style="margin-top:8px; line-height:1.45;">More structured guidance when users need complex help.</div>
            <div style="margin-top:12px; display:flex; gap:10px; align-items:center;">
              <button class="btn ghost" type="button" id="presetExpert"><i class="fa-solid fa-graduation-cap"></i> Apply</button>
              <span class="muted small">Complex cases</span>
            </div>
          </div>
        </div>

        <div class="divider"></div>
        <details>
          <summary class="muted small" style="cursor:pointer; user-select:none;">Advanced settings</summary>
          <div class="panel soft" style="margin-top:12px;">
            <div style="font-weight:900;">Use only when you have a clear business reason</div>
            <div class="muted small" style="margin-top:8px;">Advanced configuration can reduce trust if used without guardrails. Prefer presets.</div>
          </div>
        </details>
      </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div class="panel soft">
        <div class="panelHead">
          <div class="title" style="font-size:16px;">Live tone preview</div>
          <span class="pill">preview</span>
        </div>
        <div style="padding:16px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="pill">Preset</span>
            <select id="opsPreviewPreset" class="input smallInput" style="min-width:220px;">
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="sales">Sales-driven</option>
              <option value="expert">Expert advisor</option>
            </select>
          </div>
          <div class="divider"></div>
          <div id="opsTonePreview"></div>
        </div>
      </div>

      <div class="panel soft">
        <div class="panelHead">
          <div class="title" style="font-size:16px;">Next action</div>
          <span class="pill warn">recommended</span>
        </div>
        <div style="padding:16px;">
          <div class="panel soft">
            <div style="font-weight:900;">Move from settings to outcomes</div>
            <div class="muted small" style="margin-top:8px;">Use Opportunities to prioritize changes by revenue impact and operational effort.</div>
            <div style="margin-top:12px;">
              <button class="btn primary" type="button" id="goOppFromConfig"><i class="fa-solid fa-bullseye"></i> Opportunities</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  function setPreviewPreset(p) {
    ops.aiPreviewPreset = p;
    localStorage.setItem("opsAiPreviewPreset", p);
    const data = previewMap[p] || previewMap.professional;
    const box = $("opsTonePreview");
    if (!box) return;
    box.innerHTML = `
      <div class="panel soft">
        <div class="muted small">Customer message</div>
        <div style="margin-top:8px; font-weight:850;">${escapeHtml(data.user)}</div>
      </div>
      <div style="height:10px;"></div>
      <div class="panel soft">
        <div class="muted small">AI response (${escapeHtml(data.title)})</div>
        <div style="margin-top:8px; font-weight:850;">${escapeHtml(data.ai)}</div>
      </div>
    `;
  }

  const sel = $("opsPreviewPreset");
  if (sel) {
    sel.value = ops.aiPreviewPreset || "professional";
    sel.addEventListener("change", () => setPreviewPreset(String(sel.value || "professional")));
  }
  setPreviewPreset(ops.aiPreviewPreset || "professional");

  $("presetProfessional")?.addEventListener("click", () => applyPersonalityPreset("professional").then(() => { setPreviewPreset("professional"); pushNotification({ title: "Preset applied", body: "Professional preset saved.", type: "ok" }); }).catch((e) => pushNotification({ title: "Preset failed", body: e.message, type: "danger" })));
  $("presetFriendly")?.addEventListener("click", () => applyPersonalityPreset("friendly").then(() => { setPreviewPreset("friendly"); pushNotification({ title: "Preset applied", body: "Friendly preset saved.", type: "ok" }); }).catch((e) => pushNotification({ title: "Preset failed", body: e.message, type: "danger" })));
  $("presetSales")?.addEventListener("click", () => applyPersonalityPreset("sales").then(() => { setPreviewPreset("sales"); pushNotification({ title: "Preset applied", body: "Sales-driven preset saved.", type: "ok" }); }).catch((e) => pushNotification({ title: "Preset failed", body: e.message, type: "danger" })));
  $("presetExpert")?.addEventListener("click", () => applyPersonalityPreset("expert").then(() => { setPreviewPreset("expert"); pushNotification({ title: "Preset applied", body: "Expert advisor preset saved.", type: "ok" }); }).catch((e) => pushNotification({ title: "Preset failed", body: e.message, type: "danger" })));
  $("goOppFromConfig")?.addEventListener("click", () => setRoute("opportunities"));
}

async function renderOpportunities({ tickets }) {
  $("opsPageTitle").textContent = "Opportunities";
  $("opsPageSub").textContent = "Prioritized improvements with clear impact on revenue, cost, and customer experience.";
  renderPrimaryCta({ label: "Open Live AI", icon: "fa-signal", onClick: () => setRoute("live-ai") });

  mountKpis([
    { label: "Top opportunities", value: `${formatNumber(Math.min(12, tickets.length))}`, trendPct: 0.07, context: "prioritized", why: "Focus reduces operational waste." },
    { label: "Revenue impact", value: `${formatMoneySEK(Math.max(12000, tickets.length * 1800))}`, trendPct: 0.09, context: "estimated", why: "Optimization should be outcome-driven." },
    { label: "Cost savings", value: `${formatMoneySEK(Math.max(6000, tickets.length * 900))}`, trendPct: 0.05, context: "estimated", why: "Efficiency improves margins." },
    { label: "CX risk reduced", value: `${formatNumber(Math.min(18, tickets.filter((t) => t.priority === "high").length))}`, trendPct: 0.08, context: "tickets", why: "Protects trust and retention." },
    { label: "Effort level", value: "Low–Medium", trendPct: -0.02, context: "expected", why: "Quick wins first." }
  ]);

  mountInsights(await buildInsights({ tickets, events: [] }));

  const items = [
    { title: "Route refunds to human", impact: "High", effort: "Low", body: "Refund intents have the highest churn risk. Escalate immediately and capture contact details.", action: () => setRoute("automation-rules") },
    { title: "Reduce unassigned conversations", impact: "High", effort: "Medium", body: "Ownership reduces wait time and increases resolution. Use Live AI takeovers and assignment rules.", action: () => setRoute("live-ai") },
    { title: "Enable sales CTAs in pricing journeys", impact: "Medium", effort: "Low", body: "Add consistent next-step prompts in pricing questions to increase conversion.", action: () => setRoute("ai-configuration") },
    { title: "Audit AI failures weekly", impact: "Medium", effort: "Low", body: "Review AI errors and high priority escalations to prevent recurring losses.", action: () => setRoute("security") }
  ];

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Prioritized list</div>
        <span class="pill">one-click</span>
      </div>
      <div style="padding:16px;">
        ${items.map((x, i) => `
          <div class="panel" style="margin-top:${i ? "12px" : "0"};">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
              <div>
                <div class="title" style="font-size:16px;">${escapeHtml(x.title)}</div>
                <div class="muted small" style="margin-top:8px; line-height:1.45;">${escapeHtml(x.body)}</div>
              </div>
              <div style="text-align:right; min-width:180px;">
                <div class="pill warn" style="justify-content:center; width:100%;">Impact: ${escapeHtml(x.impact)}</div>
                <div class="pill" style="justify-content:center; width:100%; margin-top:8px;">Effort: ${escapeHtml(x.effort)}</div>
                <button class="btn primary small" type="button" style="margin-top:10px; width:100%;" data-opp-act="${i}">
                  <i class="fa-solid fa-bolt"></i> Take action
                </button>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Why this matters</div>
        <span class="pill ok">business</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Operate the system, don’t configure it</div>
          <div class="muted small" style="margin-top:8px;">Every opportunity includes a recommended action and a clear business outcome.</div>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll("button[data-opp-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-opp-act"));
      items[i]?.action?.();
    });
  });
}

function hydrateRulesDraftFromSettings(settings) {
  const ai = settings?.ai || {};
  const rules = Array.isArray(ai.rules) ? ai.rules : [];
  const draft = [];
  rules.slice(0, 50).forEach((r) => {
    if (r?.if) draft.push({ kind: "if", value: String(r.if) });
    if (r?.then) draft.push({ kind: "then", value: String(r.then) });
  });
  return draft;
}

function buildRulesFromDraft(draft) {
  const arr = Array.isArray(draft) ? draft : [];
  const out = [];
  let current = null;
  for (const row of arr) {
    const kind = row?.kind;
    const value = String(row?.value || "").trim();
    if (!value) continue;
    if (kind === "if") {
      current = { if: value, then: "", note: "" };
      out.push(current);
    } else if (kind === "then") {
      if (!current) {
        current = { if: "intent=*", then: value, note: "" };
        out.push(current);
      } else {
        current.then = value;
      }
    }
  }
  return out.filter((r) => r.if && r.then).slice(0, 200);
}

async function renderAutomationRules() {
  $("opsPageTitle").textContent = "Automation Rules";
  $("opsPageSub").textContent = "Business-friendly IF → THEN automation to protect CX and revenue.";
  renderPrimaryCta({ label: "Open AI configuration", icon: "fa-sliders", onClick: () => setRoute("ai-configuration") });

  mountKpis([
    { label: "Escalation coverage", value: "Improving", trendPct: 0.05, context: "high-risk intents", why: "Coverage prevents revenue leakage and churn." },
    { label: "Manual workload", value: "Lower", trendPct: -0.03, context: "per ticket", why: "Automation reduces cost and improves speed." },
    { label: "Rule stability", value: "High", trendPct: 0.02, context: "guardrails", why: "Stable rules protect trust." },
    { label: "Recommended", value: "Refund escalation", trendPct: 0.01, context: "priority", why: "Refund intents are high-risk and should escalate." }
  ]);

  mountInsights([
    { sev: "warn", badge: "Revenue", title: "Refunds should escalate immediately", body: "Refund intents are high churn risk. Escalate to human with ownership.", impact: "High impact", confidence: 0.82, cta: "Add", next: "Protect trust and revenue.", action: () => addRuleTemplate("refund") },
    { sev: "ok", badge: "Efficiency", title: "Assign high priority automatically", body: "Ownership reduces time-to-resolution and prevents escalation failures.", impact: "Medium impact", confidence: 0.74, cta: "Add", next: "Assign to on-call coverage.", action: () => addRuleTemplate("priority") }
  ]);

  if (!Array.isArray(ops.rulesDraft) || ops.rulesDraft.length === 0) {
    if (ops.preview) {
      ops.rulesDraft = [
        { kind: "if", value: "intent=refund" },
        { kind: "then", value: "escalate_to_human" },
        { kind: "if", value: "priority=high" },
        { kind: "then", value: "assign_on_call" }
      ];
    } else {
      try {
        const current = await api("/company/settings?companyId=" + encodeURIComponent(ops.companyId || ""));
        ops.rulesDraft = hydrateRulesDraftFromSettings(current);
      } catch {
        ops.rulesDraft = [
          { kind: "if", value: "intent=refund" },
          { kind: "then", value: "escalate_to_human" }
        ];
      }
    }
  }

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Automation builder</div>
        <span class="pill warn">visual</span>
      </div>
      <div style="padding:16px;">
        <div class="opsBuilder">
          <div class="opsPalette">
            <div class="muted small" style="font-weight:900; margin-bottom:10px;">Blocks</div>
            <div class="opsPaletteItem" draggable="true" data-block-kind="if" data-block-value="intent=refund">IF intent = refund</div>
            <div class="opsPaletteItem" draggable="true" data-block-kind="if" data-block-value="intent=pricing">IF intent = pricing</div>
            <div class="opsPaletteItem" draggable="true" data-block-kind="if" data-block-value="priority=high">IF priority = high</div>
            <div class="opsPaletteItem" draggable="true" data-block-kind="then" data-block-value="escalate_to_human">THEN escalate to human</div>
            <div class="opsPaletteItem" draggable="true" data-block-kind="then" data-block-value="assign_on_call">THEN assign on-call</div>
            <div class="opsPaletteItem" draggable="true" data-block-kind="then" data-block-value="preset=sales">THEN apply sales preset</div>
            <div class="divider"></div>
            <button class="btn ghost full" type="button" id="ruleTplRefund"><i class="fa-solid fa-bolt"></i> Add refund template</button>
            <button class="btn ghost full" type="button" id="ruleTplPriority" style="margin-top:10px;"><i class="fa-solid fa-flag"></i> Add priority template</button>
          </div>
          <div>
            <div class="muted small" style="font-weight:900; margin-bottom:10px;">Canvas</div>
            <div class="opsCanvas" id="opsRuleCanvas">
              ${
                (ops.rulesDraft || []).length
                  ? (ops.rulesDraft || []).map((r, idx) => `
                    <div class="opsCanvasRow" data-row="${idx}">
                      <div class="opsCanvasTag">${escapeHtml(String(r.kind || "").toUpperCase())}</div>
                      <input class="input opsCanvasInput" data-row-input="${idx}" value="${escapeHtml(String(r.value || ""))}" />
                      <div class="opsCanvasActions">
                        <button class="btn ghost small" type="button" data-row-up="${idx}"><i class="fa-solid fa-arrow-up"></i></button>
                        <button class="btn ghost small" type="button" data-row-down="${idx}"><i class="fa-solid fa-arrow-down"></i></button>
                        <button class="btn danger small" type="button" data-row-del="${idx}"><i class="fa-solid fa-trash"></i></button>
                      </div>
                    </div>
                  `).join("")
                  : `<div class="panel soft">Drag blocks here to build logic. Start with IF, then add THEN.</div>`
              }
            </div>
            <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn primary" type="button" id="opsSaveRules"><i class="fa-solid fa-floppy-disk"></i> Save rules</button>
              <button class="btn secondary" type="button" id="opsResetRules"><i class="fa-solid fa-rotate-left"></i> Reset</button>
              <button class="btn ghost" type="button" id="opsGoSecurityFromRules"><i class="fa-solid fa-shield"></i> Security</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Governance</div>
        <span class="pill ok">next</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Ship changes safely</div>
          <div class="muted small" style="margin-top:8px;">Automation should be auditable. Review logs and keep ownership clear.</div>
          <div style="margin-top:12px;">
            <button class="btn secondary" type="button" id="goSecurityFromRules"><i class="fa-solid fa-shield"></i> Security</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("ruleTplRefund")?.addEventListener("click", () => addRuleTemplate("refund"));
  $("ruleTplPriority")?.addEventListener("click", () => addRuleTemplate("priority"));
  $("opsGoSecurityFromRules")?.addEventListener("click", () => setRoute("security"));
  $("goSecurityFromRules")?.addEventListener("click", () => setRoute("security"));

  document.querySelectorAll(".opsPaletteItem").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      const kind = el.getAttribute("data-block-kind") || "";
      const value = el.getAttribute("data-block-value") || "";
      e.dataTransfer.setData("text/plain", JSON.stringify({ kind, value }));
    });
  });

  const canvas = $("opsRuleCanvas");
  if (canvas) {
    canvas.addEventListener("dragover", (e) => { e.preventDefault(); });
    canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      try {
        const payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
        if (!payload.kind) return;
        ops.rulesDraft.push({ kind: payload.kind, value: payload.value || "" });
        renderPage().catch(() => {});
      } catch {}
    });
  }

  document.querySelectorAll("[data-row-input]").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = Number(input.getAttribute("data-row-input"));
      if (!Number.isFinite(idx)) return;
      if (!ops.rulesDraft[idx]) return;
      ops.rulesDraft[idx].value = input.value;
    });
  });

  function swap(i, j) {
    const a = ops.rulesDraft[i];
    const b = ops.rulesDraft[j];
    ops.rulesDraft[i] = b;
    ops.rulesDraft[j] = a;
  }

  document.querySelectorAll("[data-row-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-row-up"));
      if (!Number.isFinite(i) || i <= 0) return;
      swap(i, i - 1);
      renderPage().catch(() => {});
    });
  });
  document.querySelectorAll("[data-row-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-row-down"));
      if (!Number.isFinite(i) || i >= ops.rulesDraft.length - 1) return;
      swap(i, i + 1);
      renderPage().catch(() => {});
    });
  });
  document.querySelectorAll("[data-row-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-row-del"));
      if (!Number.isFinite(i)) return;
      ops.rulesDraft.splice(i, 1);
      renderPage().catch(() => {});
    });
  });

  $("opsResetRules")?.addEventListener("click", () => {
    ops.rulesDraft = [];
    renderPage().catch(() => {});
  });

  $("opsSaveRules")?.addEventListener("click", async () => {
    if (!ops.companyId) return pushNotification({ title: "Select company", body: "Choose a company first.", type: "warn" });
    const built = buildRulesFromDraft(ops.rulesDraft);
    if (built.length === 0) return pushNotification({ title: "Nothing to save", body: "Add at least one IF and one THEN.", type: "warn" });
    if (ops.preview) return pushNotification({ title: "Saved (preview)", body: `Saved ${built.length} rules in preview mode.`, type: "ok" });
    try {
      const current = await api("/company/settings?companyId=" + encodeURIComponent(ops.companyId));
      const ai = current?.ai || {};
      const mergedSettings = { ...current, ai: { ...ai, rules: built } };
      await api("/company/settings", { method: "PATCH", body: { companyId: ops.companyId, settings: mergedSettings } });
      pushNotification({ title: "Rules saved", body: `${built.length} rules saved for this company.`, type: "ok" });
    } catch (e) {
      pushNotification({ title: "Save failed", body: e.message, type: "danger" });
    }
  });
}

async function addRuleTemplate(kind) {
  if (!ops.companyId) return pushNotification({ title: "Select company", body: "Choose a company first.", type: "warn" });
  try {
    const current = await api("/company/settings?companyId=" + encodeURIComponent(ops.companyId));
    const ai = current?.ai || {};
    const rules = Array.isArray(ai.rules) ? ai.rules.slice() : [];
    const templates = {
      refund: { if: "intent=refund", then: "eskalera", note: "Escalate refunds to human immediately." },
      priority: { if: "priority=high", then: "assign_on_call", note: "Assign high priority to on-call agent." },
      pricing: { if: "intent=pricing", then: "ändra_ton=professionell; sälj_cta", note: "Add next step CTA for pricing." }
    };
    rules.push(templates[kind] || templates.refund);
    const mergedSettings = { ...current, ai: { ...ai, rules } };
    await api("/company/settings", { method: "PATCH", body: { companyId: ops.companyId, settings: mergedSettings } });
    pushNotification({ title: "Rule added", body: "Template saved to company settings.", type: "ok" });
  } catch (e) {
    pushNotification({ title: "Rule failed", body: e.message, type: "danger" });
  }
}

async function renderSecurity() {
  $("opsPageTitle").textContent = "Security & Compliance";
  $("opsPageSub").textContent = "RBAC, audit logs, data privacy controls, and explainability — for enterprise trust.";
  renderPrimaryCta({ label: "Review audit logs", icon: "fa-clipboard-list", onClick: () => loadAuditLogs() });

  mountKpis([
    { label: "RBAC", value: "Enabled", trendPct: 0.02, context: "roles", why: "Least privilege protects data." },
    { label: "Audit logs", value: "Enabled", trendPct: 0.03, context: "traceability", why: "Every critical change should be trackable." },
    { label: "Rate limiting", value: "Enabled", trendPct: 0.01, context: "abuse prevention", why: "Protects availability and cost." },
    { label: "Explainability", value: "In progress", trendPct: 0.04, context: "AI logs", why: "Trust requires transparency." },
    { label: "Data controls", value: "Configurable", trendPct: 0.02, context: "privacy", why: "Compliance reduces enterprise risk." }
  ]);

  mountInsights([
    { sev: "ok", badge: "Audit", title: "Audit logs for critical actions", body: "Track admin changes, company settings updates, billing actions and KB updates.", cta: "Open logs", next: "Review last 30 days.", action: () => loadAuditLogs() },
    { sev: "warn", badge: "Privacy", title: "Add data minimization rules", body: "Limit what user data is sent to AI. Keep only what improves outcomes.", cta: "Configure", next: "Add controls per company.", route: "ai-configuration" },
    { sev: "ok", badge: "RBAC", title: "Enforce least privilege", body: "Ensure only agents/admins can access Inbox and system controls.", cta: "Review roles", next: "Confirm role assignments.", action: () => pushNotification({ title: "RBAC", body: "Use the main app to manage users/roles.", type: "info" }) }
  ]);

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Audit logs</div>
        <span class="pill">enterprise</span>
      </div>
      <div style="padding:16px;" id="opsAuditBox">
        ${renderEmpty({ title: "Load audit logs", body: "Click Review audit logs to fetch recent actions (admin and settings changes).", actions: [{ label: "Review audit logs", variant: "primary", icon: "fa-clipboard-list" }] })}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Controls</div>
        <span class="pill warn">recommended</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Enterprise readiness checklist</div>
          <div class="muted small" style="margin-top:8px;">RBAC, audit logs, usage tracking and tenant scoping are foundational. Keep building on these controls.</div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn secondary" type="button" id="secGoOpp"><i class="fa-solid fa-bullseye"></i> Opportunities</button>
            <button class="btn ghost" type="button" id="secGoConfig"><i class="fa-solid fa-sliders"></i> AI Configuration</button>
          </div>
        </div>
      </div>
    </div>
  `;
  $("secGoOpp")?.addEventListener("click", () => setRoute("opportunities"));
  $("secGoConfig")?.addEventListener("click", () => setRoute("ai-configuration"));

  document.querySelectorAll("button[data-empty-act]").forEach((btn) => {
    btn.addEventListener("click", () => loadAuditLogs());
  });
}

async function loadAuditLogs() {
  const box = $("opsAuditBox");
  if (!box) return;
  box.innerHTML = `<div class="muted small">Loading audit logs...</div>`;
  try {
    const q = new URLSearchParams();
    if (ops.companyId) q.set("companyId", ops.companyId);
    q.set("days", "30");
    q.set("limit", "120");
    const items = await api("/admin/audit?" + q.toString());
    if (!Array.isArray(items) || items.length === 0) {
      box.innerHTML = `<div class="panel soft">No audit logs for the selected scope.</div>`;
      return;
    }
    box.innerHTML = items.slice(0, 120).map((it) => {
      const when = it.createdAt ? new Date(it.createdAt).toLocaleString("sv-SE") : "";
      const actor = it.actorUserId ? (it.actorUserId.username || it.actorUserId.email || it.actorUserId._id) : "system";
      return `
        <div class="panel" style="margin-top:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="font-weight:900;">${escapeHtml(it.action || "")}</div>
            <span class="pill">${escapeHtml(when)}</span>
          </div>
          <div class="muted small" style="margin-top:8px;">Actor: ${escapeHtml(String(actor || ""))} • Target: ${escapeHtml(String(it.targetType || ""))} ${escapeHtml(String(it.targetId || ""))}</div>
        </div>
      `;
    }).join("");
  } catch (e) {
    box.innerHTML = `<div class="panel soft">Could not load audit logs: ${escapeHtml(e.message)}</div>`;
  }
}

async function renderForecasting() {
  $("opsPageTitle").textContent = "Forecasting";
  $("opsPageSub").textContent = "Scenario planning — revenue, cost, and capacity impact.";
  renderPrimaryCta({ label: "Open ROI", icon: "fa-coins", onClick: () => setRoute("roi") });

  mountKpis([
    { label: "Revenue impact", value: "Scenario-based", trendPct: 0.06, context: "estimated", why: "Make trade-offs explicit." },
    { label: "Cost impact", value: "Transparent", trendPct: 0.03, context: "headcount + AI", why: "Optimize margin." },
    { label: "Capacity impact", value: "Clear", trendPct: 0.04, context: "throughput", why: "Protect SLAs." },
    { label: "Execution speed", value: "Faster", trendPct: 0.05, context: "workflow", why: "Reduce time to action." },
    { label: "Recommended", value: "Automation 60%", trendPct: 0.02, context: "baseline", why: "Balanced outcome." }
  ]);

  mountInsights([
    { sev: "ok", badge: "Scenario", title: "Increase AI handling to 60%", body: "A balanced scenario to reduce cost while protecting trust with escalations.", cta: "Review scenario", next: "Validate with Live AI.", route: "live-ai" },
    { sev: "warn", badge: "Capacity", title: "Hire 2 agents only if load remains high", body: "Headcount works when escalation quality is stable. Fix routing first.", cta: "View support performance", next: "Reduce first response time.", route: "support-performance" },
    { sev: "ok", badge: "Revenue", title: "Reduce response time by 30%", body: "Faster response improves conversion and reduces drop-offs in sales journeys.", cta: "View sales performance", next: "Apply a sales preset.", route: "sales-performance" }
  ]);

  const cards = [
    { title: "Increase AI automation to 60%", body: "Higher throughput, lower cost per conversation. Requires strong guardrails and escalation.", rev: "+8–12%", cost: "-15–22%", cap: "+30%" },
    { title: "Hire 2 agents", body: "Improves human coverage and reduces backlog. Use when quality issues persist or VIP load increases.", rev: "+2–4%", cost: "+18%", cap: "+20%" },
    { title: "Reduce response time by 30%", body: "Directly improves trust and conversion. Achieved through routing, ownership, and Live AI takeovers.", rev: "+6–10%", cost: "-5–10%", cap: "+10%" }
  ];

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Scenario cards</div>
        <span class="pill">scenario</span>
      </div>
      <div style="padding:16px;">
        <div class="grid3">
          ${cards.map((c, i) => `
            <div class="panel">
              <div class="title" style="font-size:16px;">${escapeHtml(c.title)}</div>
              <div class="muted small" style="margin-top:8px; line-height:1.45;">${escapeHtml(c.body)}</div>
              <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
                <div class="pill ok"><i class="fa-solid fa-arrow-trend-up"></i> Revenue ${escapeHtml(c.rev)}</div>
                <div class="pill warn"><i class="fa-solid fa-coins"></i> Cost ${escapeHtml(c.cost)}</div>
                <div class="pill"><i class="fa-solid fa-bolt"></i> Capacity ${escapeHtml(c.cap)}</div>
              </div>
              <div style="margin-top:12px;">
                <button class="btn primary small" type="button" data-scenario="${i}"><i class="fa-solid fa-wand-magic-sparkles"></i> Apply scenario</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Action</div>
        <span class="pill warn">recommended</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Validate scenarios with Live AI</div>
          <div class="muted small" style="margin-top:8px;">Use Live AI to verify that automation is safe and intervention is easy.</div>
          <div style="margin-top:12px;">
            <button class="btn secondary" type="button" id="goLiveFromForecast"><i class="fa-solid fa-signal"></i> Live AI</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("goLiveFromForecast")?.addEventListener("click", () => setRoute("live-ai"));
  document.querySelectorAll("button[data-scenario]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pushNotification({ title: "Scenario applied (preview)", body: "This is a UI-level scenario preview. Connect to workflows for full simulation.", type: "info" });
    });
  });
}

async function renderRoi({ tickets }) {
  $("opsPageTitle").textContent = "ROI & Impact";
  $("opsPageSub").textContent = "Translate AI operations into measurable business outcomes.";
  renderPrimaryCta({ label: "Prioritize opportunities", icon: "fa-bullseye", onClick: () => setRoute("opportunities") });

  const open = tickets.filter((t) => t.status !== "solved");
  const estLoss = Math.max(0, (open.filter((t) => t.priority === "high").length * 6400) + (open.filter((t) => !t.assignedToUserId).length * 2200));
  const estGain = Math.max(12000, tickets.length * 900);

  mountKpis([
    { label: "Estimated revenue protected", value: formatMoneySEK(estGain), trendPct: 0.08, context: "per month", why: "Shows the upside of operational discipline." },
    { label: "Estimated revenue leakage", value: formatMoneySEK(estLoss), trendPct: 0.12, context: "per month", why: "Leakage often comes from failed escalations." },
    { label: "Cost per conversation", value: "Improving", trendPct: -0.04, context: "trend", why: "Efficiency increases margin." },
    { label: "Operational efficiency", value: "Higher", trendPct: 0.05, context: "trend", why: "Less manual work means faster outcomes." },
    { label: "Recommended focus", value: "Escalations", trendPct: 0.02, context: "priority", why: "Protects trust and revenue." }
  ]);

  mountInsights(await buildInsights({ tickets, events: [] }));

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Impact model</div>
        <span class="pill">business</span>
      </div>
      <div style="padding:16px;">
        <div class="grid2">
          <div class="panel">
            <div class="title" style="font-size:16px;">What is your AI doing?</div>
            <div class="muted small" style="margin-top:8px; line-height:1.45;">Handling conversations, recovering edge cases, and escalating when needed.</div>
            <div class="divider"></div>
            <div class="pill"><i class="fa-solid fa-signal"></i> Live AI shows real-time behavior</div>
            <div class="pill" style="margin-top:10px;"><i class="fa-solid fa-clipboard-list"></i> Audit logs show accountability</div>
          </div>
          <div class="panel">
            <div class="title" style="font-size:16px;">What are you losing?</div>
            <div class="muted small" style="margin-top:8px; line-height:1.45;">Revenue leakage is typically caused by failed escalations and slow first response.</div>
            <div class="divider"></div>
            <div class="pill danger"><i class="fa-solid fa-triangle-exclamation"></i> Estimated leakage ${escapeHtml(formatMoneySEK(estLoss))}/month</div>
            <div class="pill warn" style="margin-top:10px;"><i class="fa-solid fa-clock"></i> Reduce first response time for uplift</div>
          </div>
        </div>
        <div class="divider"></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn primary" type="button" id="roiGoOpp"><i class="fa-solid fa-bullseye"></i> Fix top opportunities</button>
          <button class="btn secondary" type="button" id="roiGoLive"><i class="fa-solid fa-signal"></i> Monitor Live AI</button>
          <button class="btn ghost" type="button" id="roiGoSecurity"><i class="fa-solid fa-shield"></i> Security</button>
        </div>
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Recommendation</div>
        <span class="pill warn">action</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Operate for outcomes</div>
          <div class="muted small" style="margin-top:8px;">Use Opportunities to prioritize changes with one-click actions.</div>
        </div>
      </div>
    </div>
  `;
  $("roiGoOpp")?.addEventListener("click", () => setRoute("opportunities"));
  $("roiGoLive")?.addEventListener("click", () => setRoute("live-ai"));
  $("roiGoSecurity")?.addEventListener("click", () => setRoute("security"));
}

async function renderIntegrations() {
  $("opsPageTitle").textContent = "Integrations";
  $("opsPageSub").textContent = "Connect your stack to unlock funnel analytics, revenue attribution, and operational automations.";
  renderPrimaryCta({ label: "Review security", icon: "fa-shield", onClick: () => setRoute("security") });
  mountKpis([
    { label: "Connected systems", value: "0", trendPct: 0, context: "now", why: "Integrations unlock business analytics." },
    { label: "Webhooks", value: "Ready", trendPct: 0.02, context: "support", why: "Automate workflows across systems." },
    { label: "CRM", value: "Optional", trendPct: 0.01, context: "pipeline", why: "Pipeline visibility improves forecasting." },
    { label: "Email", value: "Supported", trendPct: 0.01, context: "ingest", why: "Capture leads and support tickets." },
    { label: "Payments", value: "Stripe-ready", trendPct: 0.02, context: "billing", why: "Monetization and expansion." }
  ]);
  mountInsights([
    { sev: "warn", badge: "Funnel", title: "Connect CRM to unlock revenue attribution", body: "Without CRM events, conversion and ROI are estimates. Integrate to measure true impact.", cta: "Open ROI", next: "Move from proxy to truth.", route: "roi" },
    { sev: "ok", badge: "Ops", title: "Use webhooks for escalations", body: "Send high-risk conversations to Slack, PagerDuty or email so humans intervene faster.", cta: "Open rules", next: "Make escalation proactive.", route: "automation-rules" },
    { sev: "ok", badge: "Billing", title: "Stripe can support usage-based pricing", body: "Track AI usage and monetize outcomes with tiering and quotas.", cta: "Open overview", next: "Measure usage trends.", route: "overview" }
  ]);
  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Integration catalog</div>
        <span class="pill">enterprise</span>
      </div>
      <div style="padding:16px;">
        ${renderEmpty({
          title: "No integrations connected",
          body: "Connect CRM (Salesforce/HubSpot), ecommerce (Shopify), email, and webhooks to unlock revenue attribution and automation.",
          actions: [
            { label: "Add webhook", variant: "primary", icon: "fa-plug" },
            { label: "Open Security", variant: "secondary", icon: "fa-shield" }
          ]
        })}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Next actions</div>
        <span class="pill warn">recommended</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Start with webhooks</div>
          <div class="muted small" style="margin-top:8px;">Webhooks enable real-time escalations and operational alerts with minimal effort.</div>
          <div style="margin-top:12px;">
            <button class="btn primary" type="button" id="goRulesFromInt"><i class="fa-solid fa-diagram-project"></i> Automation Rules</button>
          </div>
        </div>
      </div>
    </div>
  `;
  $("goRulesFromInt")?.addEventListener("click", () => setRoute("automation-rules"));
}

async function renderAiAgents() {
  $("opsPageTitle").textContent = "AI Agents";
  $("opsPageSub").textContent = "Manage agent personas and align them to business goals.";
  renderPrimaryCta({ label: "Configure AI", icon: "fa-sliders", onClick: () => setRoute("ai-configuration") });
  mountKpis([
    { label: "Active agents", value: "1", trendPct: 0.02, context: "scope", why: "More agents enable segmentation." },
    { label: "Coverage", value: "Support + Sales", trendPct: 0.04, context: "intents", why: "Coverage reduces handoffs." },
    { label: "Consistency", value: "High", trendPct: 0.02, context: "tone", why: "Consistency improves trust." },
    { label: "Guardrails", value: "Enabled", trendPct: 0.01, context: "safety", why: "Protects outcomes." },
    { label: "Next", value: "Add segments", trendPct: 0.03, context: "recommended", why: "Segments improve relevance." }
  ]);
  mountInsights([
    { sev: "ok", badge: "Preset", title: "Start with one high-trust persona", body: "Keep the system stable with a professional baseline persona, then segment by intent.", cta: "Configure", next: "Apply presets.", route: "ai-configuration" },
    { sev: "warn", badge: "Segments", title: "Add a sales persona for pricing intents", body: "Pricing questions benefit from proactive next steps and contact capture.", cta: "Apply Sales-driven", next: "Conversion uplift.", action: () => applyPersonalityPreset("sales").catch(() => {}) },
    { sev: "ok", badge: "Ops", title: "Use Live AI for interventions", body: "Human takeover should be one click for high-risk conversations.", cta: "Open Live AI", next: "Protect revenue.", route: "live-ai" }
  ]);
  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Agent catalog</div>
        <span class="pill">premium</span>
      </div>
      <div style="padding:16px;">
        <div class="panel">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div>
              <div class="title" style="font-size:16px;">Customer Experience Agent</div>
              <div class="muted small" style="margin-top:8px; line-height:1.45;">Short, accurate answers. Escalates when uncertain. High trust.</div>
            </div>
            <span class="pill ok"><i class="fa-solid fa-check"></i> Active</span>
          </div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn secondary" type="button" id="agentGoConfig"><i class="fa-solid fa-sliders"></i> Configure</button>
            <button class="btn ghost" type="button" id="agentGoRules"><i class="fa-solid fa-diagram-project"></i> Rules</button>
          </div>
        </div>
        <div class="divider"></div>
        ${renderEmpty({ title: "Add more AI agents", body: "Create a Sales agent and an Expert agent. Then route by intent using rules and segmentation.", actions: [{ label: "Apply Sales preset", variant: "primary", icon: "fa-chart-line" }] })}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Action</div>
        <span class="pill warn">recommended</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Align agents to outcomes</div>
          <div class="muted small" style="margin-top:8px;">Use presets to remove complexity and reduce configuration risk.</div>
        </div>
      </div>
    </div>
  `;
  $("agentGoConfig")?.addEventListener("click", () => setRoute("ai-configuration"));
  $("agentGoRules")?.addEventListener("click", () => setRoute("automation-rules"));
  document.querySelectorAll("button[data-empty-act]").forEach((btn) => btn.addEventListener("click", () => applyPersonalityPreset("sales").then(() => pushNotification({ title: "Preset applied", body: "Sales-driven preset saved.", type: "ok" })).catch((e) => pushNotification({ title: "Preset failed", body: e.message, type: "danger" }))));
}

async function renderExperiments() {
  $("opsPageTitle").textContent = "Experiments";
  $("opsPageSub").textContent = "Run A/B tests that optimize business outcomes — not technical metrics.";
  renderPrimaryCta({ label: "Open opportunities", icon: "fa-bullseye", onClick: () => setRoute("opportunities") });
  const ab = await fetchAbStats();
  const variants = Array.isArray(ab?.variants) ? ab.variants : [];
  const a = variants.find((v) => String(v.name || "").toUpperCase() === "A") || variants[0];
  const b = variants.find((v) => String(v.name || "").toUpperCase() === "B") || variants[1];
  const solvedLift = a && b && Number.isFinite(Number(a.solvedRate)) && Number.isFinite(Number(b.solvedRate))
    ? Number(b.solvedRate) - Number(a.solvedRate)
    : null;
  const csatLift = a && b && Number.isFinite(Number(a.csatAvg)) && Number.isFinite(Number(b.csatAvg))
    ? Number(b.csatAvg) - Number(a.csatAvg)
    : null;
  const escLift = a && b && Number.isFinite(Number(a.escalationRate)) && Number.isFinite(Number(b.escalationRate))
    ? Number(b.escalationRate) - Number(a.escalationRate)
    : null;

  mountKpis([
    { label: "Experiments running", value: variants.length ? "1" : "0", trendPct: variants.length ? 0.02 : 0.01, context: "now", why: "Experiments validate impact." },
    { label: "Solved rate lift", value: solvedLift === null ? "—" : `${Math.round(solvedLift * 100)}%`, trendPct: solvedLift === null ? 0 : solvedLift, context: "B vs A", why: "Higher solved rate reduces cost and improves CX." },
    { label: "CSAT impact", value: csatLift === null ? "—" : `${csatLift.toFixed(2)}`, trendPct: csatLift === null ? 0 : csatLift / 10, context: "B vs A", why: "Protect customer experience." },
    { label: "Escalation delta", value: escLift === null ? "—" : `${Math.round(escLift * 100)}%`, trendPct: escLift === null ? 0 : -escLift, context: "B vs A", why: "Escalation rate is a safety guardrail." },
    { label: "Recommendation", value: variants.length ? "Ship winner" : "Test tone", trendPct: 0.02, context: "next", why: "Move from ideas to validated impact." }
  ]);
  mountInsights([
    { sev: "ok", badge: "A/B", title: "Start with tone and CTA", body: "Test Professional vs Friendly vs Sales-driven tone for pricing flows.", cta: "Configure AI", next: "Apply presets.", route: "ai-configuration" },
    { sev: "warn", badge: "Guardrail", title: "Use escalation rate as safety metric", body: "Avoid experiments that increase failed escalations.", cta: "Security", next: "Review audit trails.", route: "security" },
    { sev: "ok", badge: "Ops", title: "Measure with business KPIs", body: "Use conversion and revenue impact instead of raw automation metrics.", cta: "ROI", next: "Track outcomes.", route: "roi" }
  ]);
  const tableHtml = variants.length
    ? `
      <table class="table">
        <thead>
          <tr>
            <th>Variant</th>
            <th>Tickets</th>
            <th>Solved rate</th>
            <th>Avg first response</th>
            <th>CSAT</th>
            <th>Escalation rate</th>
          </tr>
        </thead>
        <tbody>
          ${variants.map((v) => `
            <tr>
              <td style="font-weight:900;">${escapeHtml(String(v.name || ""))}</td>
              <td>${escapeHtml(String(v.tickets ?? "—"))}</td>
              <td>${Number.isFinite(Number(v.solvedRate)) ? `${Math.round(Number(v.solvedRate) * 100)}%` : "—"}</td>
              <td>${Number.isFinite(Number(v.avgFirstResponseMin)) ? `${Math.round(Number(v.avgFirstResponseMin))} min` : "—"}</td>
              <td>${Number.isFinite(Number(v.csatAvg)) ? Number(v.csatAvg).toFixed(2) : "—"}</td>
              <td>${Number.isFinite(Number(v.escalationRate)) ? `${Math.round(Number(v.escalationRate) * 100)}%` : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : renderEmpty({
        title: "No experiments running",
        body: ops.companyId ? "Enable A/B testing for this company, then compare variants A and B on business KPIs." : "Select a company to view or run A/B experiments.",
        actions: [
          { label: "Configure AI", variant: "primary", icon: "fa-sliders" },
          { label: "Opportunities", variant: "secondary", icon: "fa-bullseye" }
        ]
      });

  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">A/B testing</div>
        <span class="pill">business</span>
      </div>
      <div style="padding:16px;">
        ${tableHtml}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Action</div>
        <span class="pill warn">recommended</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Ship the winner</div>
          <div class="muted small" style="margin-top:8px;">When Variant B improves solved rate and does not increase escalations, roll it out — then move to the next experiment.</div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn primary" type="button" id="expGoConfig"><i class="fa-solid fa-sliders"></i> AI Configuration</button>
            <button class="btn secondary" type="button" id="expGoSecurity"><i class="fa-solid fa-shield"></i> Security</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("expGoConfig")?.addEventListener("click", () => setRoute("ai-configuration"));
  $("expGoSecurity")?.addEventListener("click", () => setRoute("security"));
  document.querySelectorAll("button[data-empty-act]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute("ai-configuration"));
  });
}

async function renderGeneric({ title, subtitle, ctaLabel, ctaRoute }) {
  $("opsPageTitle").textContent = title;
  $("opsPageSub").textContent = subtitle;
  renderPrimaryCta({ label: ctaLabel || "Open overview", icon: "fa-gauge-high", onClick: () => setRoute(ctaRoute || "overview") });
  mountKpis([
    { label: "Status", value: "Ready", trendPct: 0.01, context: "scope", why: "Enterprise layout is consistent across pages." },
    { label: "Insight", value: "Included", trendPct: 0.02, context: "always", why: "Every page has insight → recommendation → action." },
    { label: "Recommendation", value: "Available", trendPct: 0.02, context: "always", why: "No dead ends." },
    { label: "Action", value: "1-click", trendPct: 0.03, context: "always", why: "Drive outcomes, not configuration." },
    { label: "Design", value: "Premium", trendPct: 0.01, context: "system", why: "Consistent components." }
  ]);
  mountInsights([
    { sev: "ok", badge: "Platform", title: "Action-led UI", body: "This page uses the global structure: KPI strip, insights, and action-led content.", cta: "Overview", next: "Start here.", route: "overview" },
    { sev: "warn", badge: "Next", title: "Connect integrations for business attribution", body: "To make this page truly production-ready, connect CRM and funnel events.", cta: "Integrations", next: "Unlock truth.", route: "integrations" },
    { sev: "ok", badge: "Ops", title: "Use Opportunities to prioritize", body: "Stop guessing. Use an impact score with one-click actions.", cta: "Opportunities", next: "Act now.", route: "opportunities" }
  ]);
  $("opsContent").innerHTML = `
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">${escapeHtml(title)}</div>
        <span class="pill">premium</span>
      </div>
      <div style="padding:16px;">
        ${renderEmpty({ title: "This page is ready for data", body: "The layout, insights engine pattern and actions are in place. Next step is wiring richer data sources and workflows." })}
      </div>
    </div>
    <div class="panel soft">
      <div class="panelHead">
        <div class="title" style="font-size:16px;">Action</div>
        <span class="pill warn">recommended</span>
      </div>
      <div style="padding:16px;">
        <div class="panel soft">
          <div style="font-weight:900;">Open Opportunities</div>
          <div class="muted small" style="margin-top:8px;">Prioritize improvements by revenue, cost, and customer experience impact.</div>
          <div style="margin-top:12px;">
            <button class="btn primary" type="button" id="genericGoOpp"><i class="fa-solid fa-bullseye"></i> Opportunities</button>
          </div>
        </div>
      </div>
    </div>
  `;
  $("genericGoOpp")?.addEventListener("click", () => setRoute("opportunities"));
}

async function renderPage() {
  const { tickets } = await fetchTicketsForOps().catch(() => ({ tickets: [] }));
  const events = await fetchUsageEvents(30);

  // Show AI Control Center full view, hide main Ops page
  if (ops.route === "ai-control-center") {
    const mainPage = document.getElementById("opsPageMain");
    const aiOsView = document.getElementById("aiOsView");
    if (mainPage) mainPage.style.display = "none";
    if (aiOsView) aiOsView.style.display = "block";
    if (typeof initAiOs === "function") initAiOs();
    return;
  }
  
  // Otherwise, hide AI OS and show Main Ops page
  const mainPage = document.getElementById("opsPageMain");
  const aiOsView = document.getElementById("aiOsView");
  if (aiOsView) aiOsView.style.display = "none";
  if (mainPage) mainPage.style.display = "block";

  if (ops.route === "overview") return renderOverview({ tickets, events });
  if (ops.route === "live-ai") return renderLiveAi({ tickets });
  if (ops.route === "conversations") return renderConversations({ tickets });
  if (ops.route === "ai-agents") return renderAiAgents();
  if (ops.route === "support-performance") return renderSupportPerformance({ tickets });
  if (ops.route === "sales-performance") return renderSalesPerformance({ tickets });
  if (ops.route === "opportunities") return renderOpportunities({ tickets });
  if (ops.route === "experiments") return renderExperiments();
  if (ops.route === "automation-rules") return renderAutomationRules();
  if (ops.route === "ai-configuration") return renderAiConfiguration();
  if (ops.route === "integrations") return renderIntegrations();
  if (ops.route === "security") return renderSecurity();
  if (ops.route === "forecasting") return renderForecasting();
  if (ops.route === "roi") return renderRoi({ tickets });

  return renderGeneric({ title: "Overview", subtitle: "Customer operations.", ctaLabel: "Open overview", ctaRoute: "overview" });
}

function connectSocket() {
  try {
    if (!window.io) return;
    ops.socket = window.io({ transports: ["websocket", "polling"] });
    ops.socket.on("connect", () => {
      pushNotification({ title: "Live connected", body: "Real-time signals enabled.", type: "ok" });
    });
    ops.socket.on("ticketUpdate", () => {
      ops.live.lastTicketUpdateAt = new Date().toISOString();
      if (ops.route === "live-ai" || ops.route === "overview") renderPage().catch(() => {});
    });
    ops.socket.on("aiTyping", ({ ticketId }) => {
      if (!ticketId) return;
      ops.live.typing.set(String(ticketId), Date.now());
      setTimeout(() => {
        ops.live.typing.delete(String(ticketId));
        if (ops.route === "live-ai" || ops.route === "overview") renderPage().catch(() => {});
      }, 6000);
    });
    ops.socket.on("newImportantTicket", () => {
      ops.live.lastImportantAt = new Date().toISOString();
      pushNotification({ title: "High priority alert", body: "A conversation requires human attention.", type: "warn" });
      if (ops.route === "live-ai") renderPage().catch(() => {});
    });
  } catch {}
}

async function bootstrap() {
  const savedTheme = localStorage.getItem("theme") || "light";
  setTheme(savedTheme);

  if (!ops.token) {
    ops.preview = true;
    ops.me = { username: "Preview", role: "admin" };
    ops.companies = [
      { companyId: "demo", displayName: "Demo Company" },
      { companyId: "enterprise", displayName: "Enterprise Co" }
    ];
    ops.companyId = ops.companyId || "demo";
    pushNotification({ title: "Preview mode", body: "Log in to connect real data. UI and flows are fully visible.", type: "warn" });
  } else {
    try {
      ops.me = await api("/me");
    } catch {
      ops.preview = true;
      ops.me = { username: "Preview", role: "admin" };
      ops.companies = [
        { companyId: "demo", displayName: "Demo Company" },
        { companyId: "enterprise", displayName: "Enterprise Co" }
      ];
      ops.companyId = ops.companyId || "demo";
      pushNotification({ title: "Preview mode", body: "Could not verify session. Log in to connect real data.", type: "warn" });
    }
  }
  if (!ops.preview) {
    try {
      ops.companies = await api("/companies");
    } catch {
      ops.companies = [];
    }
  }

  if (!ops.companyId && ops.companies.length) ops.companyId = ops.companies[0].companyId;
  setTopbar();
  setCompanySelect();

  const nav = document.querySelectorAll(".opsNavItem");
  nav.forEach((b) => b.addEventListener("click", () => setRoute(b.getAttribute("data-route"))));

  $("opsCompanySelect")?.addEventListener("change", async (e) => {
    ops.companyId = String(e.target.value || "");
    localStorage.setItem("opsCompanyId", ops.companyId);
    setTopbar();
    await renderPage();
  });

  $("opsThemeToggle")?.addEventListener("click", toggleTheme);

  $("opsNotifBtn")?.addEventListener("click", () => {
    const p = $("opsNotifPanel");
    const q = $("opsUserPanel");
    if (q) q.style.display = "none";
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
    renderNotifPopover();
  });
  $("opsUserBtn")?.addEventListener("click", () => {
    const p = $("opsUserPanel");
    const q = $("opsNotifPanel");
    if (q) q.style.display = "none";
    if (!p) return;
    p.style.display = p.style.display === "none" ? "" : "none";
    renderUserPopover();
  });

  window.addEventListener("click", (e) => {
    const notif = $("opsNotifPanel");
    const user = $("opsUserPanel");
    const isNotifBtn = e.target.closest("#opsNotifBtn");
    const isUserBtn = e.target.closest("#opsUserBtn");
    const isInPopover = e.target.closest(".opsPopover");
    if (!isInPopover && !isNotifBtn && notif) notif.style.display = "none";
    if (!isInPopover && !isUserBtn && user) user.style.display = "none";
  });

  window.addEventListener("hashchange", () => {
    const next = (location.hash || "#overview").replace("#", "");
    setRoute(next);
  });

  if (!ops.preview) connectSocket();
  setRoute(ops.route || "overview");
}

bootstrap();
