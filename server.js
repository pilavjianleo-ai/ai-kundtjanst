// server.js (COMMONJS FIX - Render compatible)
// ✅ No "type": "module" needed
// ✅ Works with Node 20 on Render
// ✅ Includes endpoints your script.js expects (safe stable backend)

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   SIMPLE IN-MEMORY DB
   (Stable for demo / Render)
========================= */
const DB_PATH = path.join(__dirname, "db.json");

function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      users: [
        // default admin
        {
          id: "u_admin_0001",
          username: "admin",
          password: "admin123",
          email: "admin@demo.se",
          role: "admin",
          createdAt: new Date().toISOString(),
        },
      ],
      tickets: [],
      categories: [
        { key: "demo", name: "demo", systemPrompt: "Du är en professionell AI kundtjänst." },
      ],
      kb: [],
      resetTokens: [], // {token,email,expiresAt}
      feedback: [],
      stats: [], // for SLA demo
    };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("DB save error:", e.message);
  }
}

let db = loadDB();

/* =========================
   HELPERS
========================= */
function uid(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

function nowISO() {
  return new Date().toISOString();
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

const TOKENS = new Map(); // token => userId

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Not logged in" });

  const userId = TOKENS.get(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const user = db.users.find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: "User not found" });

  req.user = user;
  req.token = token;
  next();
}

function adminOrAgent(req, res, next) {
  const role = req.user?.role;
  if (role !== "admin" && role !== "agent") return res.status(403).json({ error: "Forbidden" });
  next();
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

function safeText(s) {
  return String(s || "").slice(0, 5000);
}

/* =========================
   STATIC FRONTEND
========================= */
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   AUTH
========================= */
app.post("/register", (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing username/password" });

  const exists = db.users.some((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (exists) return res.status(400).json({ error: "Username already exists" });

  const user = {
    id: uid("u_"),
    username: String(username).trim(),
    password: String(password),
    email: String(email || "").trim(),
    role: "user",
    createdAt: nowISO(),
  };

  db.users.push(user);
  saveDB(db);

  return res.json({ message: "Registered ✅" });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing credentials" });

  const user = db.users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase() && u.password === String(password)
  );
  if (!user) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const token = makeToken();
  TOKENS.set(token, user.id);

  return res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.createdAt },
  });
});

app.get("/me", authRequired, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt });
});

/* Forgot password */
app.post("/auth/forgot-password", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email saknas" });

  const user = db.users.find((u) => (u.email || "").toLowerCase() === String(email).toLowerCase());
  if (!user) return res.status(404).json({ error: "Email finns inte" });

  const token = uid("reset_");
  const expiresAt = Date.now() + 1000 * 60 * 30; // 30 min

  db.resetTokens = db.resetTokens.filter((t) => t.email !== user.email);
  db.resetTokens.push({ token, email: user.email, expiresAt });
  saveDB(db);

  // In real app: send email. Here: return link
  return res.json({
    message: "Återställningslänk skapad ✅",
    resetLink: `${req.protocol}://${req.get("host")}/?resetToken=${token}`,
  });
});

app.post("/auth/reset-password", (req, res) => {
  const { resetToken, newPassword } = req.body || {};
  if (!resetToken || !newPassword) return res.status(400).json({ error: "Saknar token/lösenord" });

  const rt = db.resetTokens.find((t) => t.token === resetToken);
  if (!rt) return res.status(400).json({ error: "Ogiltig token" });
  if (Date.now() > rt.expiresAt) return res.status(400).json({ error: "Token har gått ut" });

  const user = db.users.find((u) => u.email === rt.email);
  if (!user) return res.status(400).json({ error: "User finns inte" });

  user.password = String(newPassword);
  db.resetTokens = db.resetTokens.filter((t) => t.token !== resetToken);
  saveDB(db);

  return res.json({ message: "Lösenord uppdaterat ✅" });
});

/* Change username */
app.post("/auth/change-username", authRequired, (req, res) => {
  const { newUsername } = req.body || {};
  if (!newUsername || String(newUsername).length < 3) return res.status(400).json({ error: "Fel användarnamn" });

  const exists = db.users.some((u) => u.username.toLowerCase() === String(newUsername).toLowerCase());
  if (exists) return res.status(400).json({ error: "Användarnamn upptaget" });

  req.user.username = String(newUsername).trim();
  saveDB(db);
  return res.json({ message: "Användarnamn uppdaterat ✅" });
});

/* Change password */
app.post("/auth/change-password", authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Fyll i båda fälten" });

  if (req.user.password !== String(currentPassword)) return res.status(400).json({ error: "Fel nuvarande lösenord" });

  req.user.password = String(newPassword);
  saveDB(db);
  return res.json({ message: "Lösenord uppdaterat ✅" });
});

/* =========================
   CATEGORIES
========================= */
app.get("/categories", (req, res) => {
  res.json(db.categories || []);
});

app.post("/admin/categories", authRequired, adminOnly, (req, res) => {
  const { key, name, systemPrompt } = req.body || {};
  if (!key || !name) return res.status(400).json({ error: "Missing key/name" });

  const exists = db.categories.some((c) => c.key === key);
  if (exists) return res.status(400).json({ error: "Category key already exists" });

  db.categories.push({
    key: String(key).trim(),
    name: String(name).trim(),
    systemPrompt: safeText(systemPrompt || ""),
  });
  saveDB(db);
  res.json({ message: "Kategori skapad ✅" });
});

/* =========================
   CHAT -> creates / updates ticket
========================= */
app.post("/chat", authRequired, (req, res) => {
  const { companyId, conversation, ticketId } = req.body || {};
  const cat = String(companyId || "demo");

  let ticket = null;

  if (ticketId) {
    ticket = db.tickets.find((t) => t.id === ticketId);
  }

  if (!ticket) {
    ticket = {
      id: uid("t_"),
      title: "Nytt ärende",
      companyId: cat,
      status: "open",
      priority: "normal",
      createdAt: nowISO(),
      lastActivityAt: nowISO(),
      createdByUserId: req.user.id,
      assignedToUserId: null,
      messages: [],
      internalNotes: [],
      sla: {
        firstResponseMs: null,
        resolutionMs: null,
        firstResponseBreach: false,
        resolutionBreach: false,
      },
    };
    db.tickets.unshift(ticket);
  }

  const lastUserMsg = (conversation || []).slice().reverse().find((m) => m.role === "user");
  if (lastUserMsg?.content) {
    ticket.messages.push({ role: "user", content: safeText(lastUserMsg.content), timestamp: nowISO() });
    ticket.lastActivityAt = nowISO();
  }

  // ✅ Simpel “smart AI” placeholder (stabil)
  const reply =
    `✅ Jag förstår.\n\n` +
    `Kategori: ${cat}\n` +
    `Jag hjälper dig med detta direkt.\n\n` +
    `📌 Beskriv gärna:\n- Vad exakt händer?\n- Får du felkod?\n- När började det?\n\n` +
    `Så löser jag det snabbast möjligt.`;

  // simulate AI response for ticket timeline
  ticket.messages.push({ role: "ai", content: reply, timestamp: nowISO() });
  ticket.lastActivityAt = nowISO();

  saveDB(db);

  return res.json({ reply, ticketId: ticket.id, ragUsed: false });
});

/* Feedback */
app.post("/feedback", authRequired, (req, res) => {
  const { type, companyId } = req.body || {};
  db.feedback.push({
    id: uid("fb_"),
    userId: req.user.id,
    type: String(type || ""),
    companyId: String(companyId || "demo"),
    createdAt: nowISO(),
  });
  saveDB(db);
  res.json({ message: "OK" });
});

/* =========================
   MY TICKETS
========================= */
app.get("/my/tickets", authRequired, (req, res) => {
  const items = db.tickets.filter((t) => t.createdByUserId === req.user.id);
  res.json(items.map(minTicket));
});

app.get("/my/tickets/:id", authRequired, (req, res) => {
  const t = db.tickets.find((x) => x.id === req.params.id && x.createdByUserId === req.user.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });
  res.json(fullTicket(t));
});

app.post("/my/tickets/:id/reply", authRequired, (req, res) => {
  const t = db.tickets.find((x) => x.id === req.params.id && x.createdByUserId === req.user.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });

  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "Missing content" });

  t.messages.push({ role: "user", content: safeText(content), timestamp: nowISO() });
  t.lastActivityAt = nowISO();
  saveDB(db);
  res.json({ message: "Skickat ✅" });
});

/* =========================
   ADMIN / INBOX TICKETS
========================= */
app.get("/admin/tickets", authRequired, adminOrAgent, (req, res) => {
  const { status, companyId } = req.query || {};
  let items = [...db.tickets];

  if (status) items = items.filter((t) => t.status === status);
  if (companyId) items = items.filter((t) => t.companyId === companyId);

  // agent should see all open tickets too (inbox)
  res.json(items.map(minTicket));
});

function minTicket(t) {
  return {
    _id: t.id,
    ticketId: t.id,
    title: t.title,
    companyId: t.companyId,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    assignedToUserId: t.assignedToUserId,
    sla: t.sla || {},
  };
}

function fullTicket(t) {
  return {
    _id: t.id,
    ticketId: t.id,
    title: t.title,
    companyId: t.companyId,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    assignedToUserId: t.assignedToUserId,
    createdByUserId: t.createdByUserId,
    messages: t.messages,
    internalNotes: t.internalNotes || [],
    sla: t.sla || {},
  };
}
/* =========================
   ADMIN - TICKET DETAILS
========================= */
app.get("/admin/tickets/:id", authRequired, adminOrAgent, (req, res) => {
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });
  res.json(fullTicket(t));
});

app.delete("/admin/tickets/:id", authRequired, adminOnly, (req, res) => {
  const before = db.tickets.length;
  db.tickets = db.tickets.filter((t) => t.id !== req.params.id);
  saveDB(db);
  if (db.tickets.length === before) return res.status(404).json({ error: "Ticket not found" });
  res.json({ message: "Deleted ✅" });
});

app.post("/admin/tickets/:id/status", authRequired, adminOrAgent, (req, res) => {
  const { status } = req.body || {};
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });

  const allowed = ["open", "pending", "solved"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Bad status" });

  t.status = status;
  t.lastActivityAt = nowISO();

  // if solved, set resolution time if not already set
  if (status === "solved" && t.sla && t.sla.resolutionMs == null) {
    const created = new Date(t.createdAt).getTime();
    const resolved = Date.now();
    t.sla.resolutionMs = resolved - created;
  }

  saveDB(db);
  res.json({ message: "Status updated ✅", ticket: fullTicket(t) });
});

app.post("/admin/tickets/:id/priority", authRequired, adminOrAgent, (req, res) => {
  const { priority } = req.body || {};
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });

  const allowed = ["low", "normal", "high"];
  if (!allowed.includes(priority)) return res.status(400).json({ error: "Bad priority" });

  t.priority = priority;
  t.lastActivityAt = nowISO();
  saveDB(db);
  res.json({ message: "Priority updated ✅", ticket: fullTicket(t) });
});

app.post("/admin/tickets/:id/agent-reply", authRequired, adminOrAgent, (req, res) => {
  const { content } = req.body || {};
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });
  if (!content) return res.status(400).json({ error: "Missing content" });

  // First response SLA (simulate timing)
  if (t.sla && t.sla.firstResponseMs == null) {
    const created = new Date(t.createdAt).getTime();
    t.sla.firstResponseMs = Date.now() - created;
  }

  t.messages.push({ role: "agent", content: safeText(content), timestamp: nowISO() });
  t.lastActivityAt = nowISO();
  saveDB(db);

  res.json({ message: "Reply sent ✅", ticket: fullTicket(t) });
});

app.post("/admin/tickets/:id/assign", authRequired, adminOrAgent, (req, res) => {
  const { userId } = req.body || {};
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });

  const u = db.users.find((x) => x.id === userId);
  if (!u) return res.status(404).json({ error: "User not found" });

  t.assignedToUserId = u.id;
  t.lastActivityAt = nowISO();
  saveDB(db);

  res.json({ message: "Assigned ✅", ticket: fullTicket(t) });
});

/* =========================
   INTERNAL NOTES
========================= */
app.post("/admin/tickets/:id/internal-note", authRequired, adminOrAgent, (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "Missing content" });

  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });

  t.internalNotes = t.internalNotes || [];
  t.internalNotes.push({
    id: uid("note_"),
    content: safeText(content),
    createdAt: nowISO(),
    createdBy: req.user.username,
  });

  saveDB(db);
  res.json({ message: "Saved ✅", ticket: fullTicket(t) });
});

app.delete("/admin/tickets/:id/internal-notes", authRequired, adminOrAgent, (req, res) => {
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket not found" });

  t.internalNotes = [];
  saveDB(db);
  res.json({ message: "Cleared ✅" });
});

/* =========================
   ADMIN BULK ACTIONS
========================= */
app.post("/admin/tickets/solve-all", authRequired, adminOnly, (req, res) => {
  const now = Date.now();
  db.tickets.forEach((t) => {
    if (t.status !== "solved") {
      t.status = "solved";
      t.lastActivityAt = nowISO();
      if (t.sla && t.sla.resolutionMs == null) {
        t.sla.resolutionMs = now - new Date(t.createdAt).getTime();
      }
    }
  });
  saveDB(db);
  res.json({ message: "Solved all ✅" });
});

app.post("/admin/tickets/remove-solved", authRequired, adminOnly, (req, res) => {
  const before = db.tickets.length;
  db.tickets = db.tickets.filter((t) => t.status !== "solved");
  saveDB(db);
  res.json({ message: `Removed solved ✅ (${before - db.tickets.length})` });
});

/* =========================
   ADMIN USERS
========================= */
app.get("/admin/users", authRequired, adminOrAgent, (req, res) => {
  const out = db.users.map((u) => ({
    _id: u.id,
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
  }));
  res.json(out);
});

app.post("/admin/users/:id/role", authRequired, adminOnly, (req, res) => {
  const { role } = req.body || {};
  const allowed = ["user", "agent", "admin"];
  if (!allowed.includes(role)) return res.status(400).json({ error: "Bad role" });

  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: "User not found" });

  u.role = role;
  saveDB(db);
  res.json({ message: "Role updated ✅" });
});

app.delete("/admin/users/:id", authRequired, adminOnly, (req, res) => {
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== req.params.id);
  saveDB(db);

  if (db.users.length === before) return res.status(404).json({ error: "User not found" });
  res.json({ message: "User deleted ✅" });
});

/* =========================
   SLA (Simple but compatible)
========================= */
function withinDays(dateISO, days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(dateISO).getTime() <= ms;
}

function calcSlaOverview(days) {
  const items = db.tickets.filter((t) => withinDays(t.createdAt, days));
  const totalTickets = items.length;

  const byPriority = { low: 0, normal: 0, high: 0 };
  items.forEach((t) => {
    byPriority[t.priority || "normal"] = (byPriority[t.priority || "normal"] || 0) + 1;
  });

  const firstArr = items.map((t) => t.sla?.firstResponseMs).filter((x) => Number.isFinite(x));
  const resArr = items.map((t) => t.sla?.resolutionMs).filter((x) => Number.isFinite(x));

  function stats(arr) {
    if (!arr.length) return { avgMs: null, medianMs: null, p90Ms: null };
    const sorted = arr.slice().sort((a, b) => a - b);
    const avgMs = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p90Ms = sorted[Math.floor(sorted.length * 0.9) - 1] || sorted[sorted.length - 1];
    return { avgMs, medianMs, p90Ms };
  }

  // compliance thresholds (demo)
  const firstLimit = 1000 * 60 * 15; // 15 min
  const resLimit = 1000 * 60 * 60 * 24; // 24h

  const firstBreaches = firstArr.filter((x) => x > firstLimit).length;
  const resBreaches = resArr.filter((x) => x > resLimit).length;

  const firstCompliancePct = firstArr.length ? Math.round(((firstArr.length - firstBreaches) / firstArr.length) * 100) : 0;
  const resCompliancePct = resArr.length ? Math.round(((resArr.length - resBreaches) / resArr.length) * 100) : 0;

  return {
    totalTickets,
    byPriority,
    firstResponse: {
      ...stats(firstArr),
      breaches: firstBreaches,
      compliancePct: firstCompliancePct,
    },
    resolution: {
      ...stats(resArr),
      breaches: resBreaches,
      compliancePct: resCompliancePct,
    },
  };
}

app.get("/admin/sla/overview", authRequired, adminOrAgent, (req, res) => {
  const days = Number(req.query.days || 30);
  const o = calcSlaOverview(days);
  res.json(o);
});

app.get("/admin/sla/agents", authRequired, adminOrAgent, (req, res) => {
  const days = Number(req.query.days || 30);
  const items = db.tickets.filter((t) => withinDays(t.createdAt, days));

  const map = new Map(); // userId => row
  const users = db.users.filter((u) => u.role === "agent" || u.role === "admin");

  users.forEach((u) => {
    map.set(u.id, {
      userId: u.id,
      username: u.username,
      role: u.role,
      tickets: 0,
      open: 0,
      pending: 0,
      solved: 0,
      firstResponse: { avgMs: null, compliancePct: 0 },
      resolution: { avgMs: null, compliancePct: 0 },
    });
  });

  items.forEach((t) => {
    const assigned = t.assignedToUserId;
    if (!assigned || !map.has(assigned)) return;

    const row = map.get(assigned);
    row.tickets += 1;
    row[t.status] = (row[t.status] || 0) + 1;
  });

  // Very simplified averages
  map.forEach((row) => {
    const myTickets = items.filter((t) => t.assignedToUserId === row.userId);
    const fr = myTickets.map((t) => t.sla?.firstResponseMs).filter((x) => Number.isFinite(x));
    const rs = myTickets.map((t) => t.sla?.resolutionMs).filter((x) => Number.isFinite(x));

    const frAvg = fr.length ? Math.round(fr.reduce((a, b) => a + b, 0) / fr.length) : null;
    const rsAvg = rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : null;

    const firstLimit = 1000 * 60 * 15;
    const resLimit = 1000 * 60 * 60 * 24;

    const frBreaches = fr.filter((x) => x > firstLimit).length;
    const rsBreaches = rs.filter((x) => x > resLimit).length;

    row.firstResponse.avgMs = frAvg;
    row.firstResponse.compliancePct = fr.length ? Math.round(((fr.length - frBreaches) / fr.length) * 100) : 0;

    row.resolution.avgMs = rsAvg;
    row.resolution.compliancePct = rs.length ? Math.round(((rs.length - rsBreaches) / rs.length) * 100) : 0;
  });

  res.json({ rows: Array.from(map.values()) });
});

app.get("/admin/sla/tickets", authRequired, adminOrAgent, (req, res) => {
  const days = Number(req.query.days || 30);
  const items = db.tickets.filter((t) => withinDays(t.createdAt, days));
  res.json({ rows: items.map(minTicket) });
});

app.get("/admin/sla/trend/weekly", authRequired, adminOrAgent, (req, res) => {
  const days = Number(req.query.days || 30);
  const items = db.tickets.filter((t) => withinDays(t.createdAt, days));

  // group by week number
  const weekMap = new Map();
  items.forEach((t) => {
    const dt = new Date(t.createdAt);
    const onejan = new Date(dt.getFullYear(), 0, 1);
    const week = Math.ceil((((dt - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    const key = `${dt.getFullYear()}-V${week}`;

    if (!weekMap.has(key)) {
      weekMap.set(key, { week: key, firstCompliancePct: 0, resolutionCompliancePct: 0, fr: [], rs: [] });
    }
    const w = weekMap.get(key);
    if (Number.isFinite(t.sla?.firstResponseMs)) w.fr.push(t.sla.firstResponseMs);
    if (Number.isFinite(t.sla?.resolutionMs)) w.rs.push(t.sla.resolutionMs);
  });

  const firstLimit = 1000 * 60 * 15;
  const resLimit = 1000 * 60 * 60 * 24;

  const rows = Array.from(weekMap.values())
    .sort((a, b) => (a.week > b.week ? 1 : -1))
    .map((w) => {
      const frBreaches = w.fr.filter((x) => x > firstLimit).length;
      const rsBreaches = w.rs.filter((x) => x > resLimit).length;

      w.firstCompliancePct = w.fr.length ? Math.round(((w.fr.length - frBreaches) / w.fr.length) * 100) : 0;
      w.resolutionCompliancePct = w.rs.length ? Math.round(((w.rs.length - rsBreaches) / w.rs.length) * 100) : 0;
      return { week: w.week, firstCompliancePct: w.firstCompliancePct, resolutionCompliancePct: w.resolutionCompliancePct };
    });

  res.json({ rows });
});

app.get("/admin/sla/export/csv", authRequired, adminOrAgent, (req, res) => {
  const days = Number(req.query.days || 30);
  const items = db.tickets.filter((t) => withinDays(t.createdAt, days));

  const header = "ticketId,companyId,status,priority,createdAt,lastActivityAt,firstResponseMs,resolutionMs\n";
  const lines = items
    .map((t) =>
      [
        t.id,
        t.companyId,
        t.status,
        t.priority,
        t.createdAt,
        t.lastActivityAt,
        t.sla?.firstResponseMs ?? "",
        t.sla?.resolutionMs ?? "",
      ].join(",")
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="sla_export_${days}d.csv"`);
  res.send(header + lines);
});

/* =========================
   EXPORT ALL / TRAINING
========================= */
app.get("/admin/export/all", authRequired, adminOnly, (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="export_all.json"`);
  res.send(JSON.stringify(db, null, 2));
});

app.get("/admin/export/training", authRequired, adminOnly, (req, res) => {
  const companyId = String(req.query.companyId || "demo");
  const kb = db.kb.filter((x) => x.companyId === companyId);
  const cats = db.categories.filter((x) => x.key === companyId);

  const out = { companyId, categories: cats, kb };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="training_${companyId}.json"`);
  res.send(JSON.stringify(out, null, 2));
});

/* =========================
   KB ENDPOINTS (simple compatible)
========================= */
app.get("/kb/list/:companyId", authRequired, adminOrAgent, (req, res) => {
  const companyId = String(req.params.companyId || "demo");
  const items = db.kb.filter((x) => x.companyId === companyId);
  res.json(items);
});

app.post("/kb/upload-text", authRequired, adminOnly, (req, res) => {
  const { companyId, title, content } = req.body || {};
  if (!companyId || !content) return res.status(400).json({ error: "Missing data" });

  db.kb.unshift({
    id: uid("kb_"),
    companyId: String(companyId),
    sourceType: "text",
    sourceRef: String(title || "Text"),
    title: String(title || "Text"),
    content: safeText(content),
    chunkIndex: 0,
    createdAt: nowISO(),
  });

  saveDB(db);
  res.json({ message: "KB text uppladdad ✅" });
});

app.post("/kb/upload-url", authRequired, adminOnly, (req, res) => {
  const { companyId, url } = req.body || {};
  if (!companyId || !url) return res.status(400).json({ error: "Missing data" });

  db.kb.unshift({
    id: uid("kb_"),
    companyId: String(companyId),
    sourceType: "url",
    sourceRef: String(url),
    title: String(url),
    content: `URL: ${url}\n\n(Demo backend sparar bara URL som text.)`,
    chunkIndex: 0,
    createdAt: nowISO(),
  });

  saveDB(db);
  res.json({ message: "KB URL uppladdad ✅" });
});

app.post("/kb/upload-pdf", authRequired, adminOnly, (req, res) => {
  const { companyId, filename, base64 } = req.body || {};
  if (!companyId || !filename || !base64) return res.status(400).json({ error: "Missing data" });

  db.kb.unshift({
    id: uid("kb_"),
    companyId: String(companyId),
    sourceType: "pdf",
    sourceRef: String(filename),
    title: String(filename),
    content: `(PDF: ${filename})\n\n(Demo backend: sparar PDF metadata, ej OCR.)`,
    chunkIndex: 0,
    createdAt: nowISO(),
  });

  saveDB(db);
  res.json({ message: "KB PDF uppladdad ✅" });
});

app.get("/export/kb/:companyId", authRequired, adminOrAgent, (req, res) => {
  const companyId = String(req.params.companyId || "demo");
  const items = db.kb.filter((x) => x.companyId === companyId);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="kb_${companyId}.json"`);
  res.send(JSON.stringify(items, null, 2));
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
