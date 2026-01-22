"use strict";

/**
 * AI Kundtjänst - server.js (CommonJS version)
 * ✅ Fixar Render-felet: "Cannot use import statement outside a module"
 * ✅ Kör direkt på Node 20 utan "type": "module"
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

const app = express();

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true }));

// =========================
// Serve static files
// =========================
app.use(express.static(path.join(__dirname)));

// =========================
// DB (simple json file)
// =========================
const DB_FILE = path.join(__dirname, "db.json");

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix = "") {
  return prefix + crypto.randomBytes(8).toString("hex");
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const seed = {
      users: [],
      categories: [
        { key: "demo", name: "Demo", systemPrompt: "Du är en hjälpsam AI kundtjänst." },
        { key: "law", name: "Juridik", systemPrompt: "Du är en professionell AI som hjälper med juridiska frågor." },
        { key: "tech", name: "Teknik", systemPrompt: "Du hjälper med tekniska problem steg för steg." },
        { key: "cleaning", name: "Städ", systemPrompt: "Du hjälper med städ-relaterade frågor och rutiner." },
      ],
      tickets: [],
      kbChunks: [],
      stats: {
        global: {
          totalTickets: 0,
          totalMessages: 0,
        },
      },
    };

    // Skapa default admin
    const adminId = makeId("usr_");
    seed.users.push({
      id: adminId,
      username: "admin",
      email: "admin@demo.se",
      passwordHash: hashPass("admin123"),
      role: "admin",
      createdAt: nowISO(),
      resetToken: null,
      resetTokenExp: null,
    });

    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
  }

  const raw = fs.readFileSync(DB_FILE, "utf8");
  return JSON.parse(raw);
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function hashPass(p) {
  return crypto.createHash("sha256").update(String(p)).digest("hex");
}

function safeUser(u) {
  return {
    id: u.id,
    _id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
  };
}

function getUserById(db, id) {
  return db.users.find((u) => u.id === id);
}

function getUserByUsername(db, username) {
  return db.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
}

function getCategory(db, key) {
  return db.categories.find((c) => c.key === key) || db.categories[0];
}

// =========================
// Auth middleware
// =========================
function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) return res.status(401).json({ error: "Ingen token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: "Ogiltig token" });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    const role = req.user?.role || "user";
    if (!roles.includes(role)) {
      return res.status(403).json({ error: "Ingen behörighet" });
    }
    next();
  };
}

// =========================
// SLA settings
// =========================
const SLA_FIRST_RESPONSE_MS = 2 * 60 * 60 * 1000; // 2h
const SLA_RESOLUTION_MS = 24 * 60 * 60 * 1000; // 24h

function updateSlaForTicket(t) {
  const created = new Date(t.createdAt).getTime();

  let firstAgent = t.metrics.firstAgentResponseAt ? new Date(t.metrics.firstAgentResponseAt).getTime() : null;
  let solvedAt = t.metrics.solvedAt ? new Date(t.metrics.solvedAt).getTime() : null;

  if (firstAgent) {
    t.sla.firstResponseMs = firstAgent - created;
    t.sla.firstResponseBreached = t.sla.firstResponseMs > SLA_FIRST_RESPONSE_MS;
  } else {
    t.sla.firstResponseMs = null;
    t.sla.firstResponseBreached = false;
  }

  if (solvedAt) {
    t.sla.resolutionMs = solvedAt - created;
    t.sla.resolutionBreached = t.sla.resolutionMs > SLA_RESOLUTION_MS;
  } else {
    t.sla.resolutionMs = null;
    t.sla.resolutionBreached = false;
  }
}

// =========================
// Routes
// =========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health
app.get("/health", (req, res) => {
  res.json({ ok: true, time: nowISO() });
});

// Categories
app.get("/categories", (req, res) => {
  const db = readDB();
  res.json(db.categories);
});

// =========================
// AUTH
// =========================
app.post("/register", (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username + password krävs" });

  const db = readDB();
  if (getUserByUsername(db, username)) return res.status(400).json({ error: "Användarnamn finns redan" });

  const userId = makeId("usr_");
  const u = {
    id: userId,
    username: String(username),
    email: String(email || ""),
    passwordHash: hashPass(password),
    role: "user",
    createdAt: nowISO(),
    resetToken: null,
    resetTokenExp: null,
  };

  db.users.push(u);
  writeDB(db);

  res.json({ message: "Registrering lyckades ✅" });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username + password krävs" });

  const db = readDB();
  const u = getUserByUsername(db, username);
  if (!u) return res.status(401).json({ error: "Fel användarnamn/lösenord" });

  if (u.passwordHash !== hashPass(password)) return res.status(401).json({ error: "Fel användarnamn/lösenord" });

  const token = jwt.sign({ sub: u.id, username: u.username, role: u.role }, JWT_SECRET, { expiresIn: "7d" });

  res.json({ token, user: safeUser(u) });
});

app.get("/me", authRequired, (req, res) => {
  const db = readDB();
  const u = getUserById(db, req.user.sub);
  if (!u) return res.status(404).json({ error: "User hittas ej" });
  res.json(safeUser(u));
});

// Forgot password (demo: returns link)
app.post("/auth/forgot-password", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email krävs" });

  const db = readDB();
  const u = db.users.find((x) => (x.email || "").toLowerCase() === String(email).toLowerCase());
  if (!u) return res.json({ message: "Om email finns skickas länk ✅" });

  const resetToken = crypto.randomBytes(20).toString("hex");
  u.resetToken = resetToken;
  u.resetTokenExp = Date.now() + 1000 * 60 * 30; // 30 min

  writeDB(db);

  // I riktig app mailar du den här länken, här returnerar vi den.
  res.json({
    message: "Reset-länk skapad ✅",
    resetUrl: `/index.html?resetToken=${resetToken}`,
  });
});

app.post("/auth/reset-password", (req, res) => {
  const { resetToken, newPassword } = req.body || {};
  if (!resetToken || !newPassword) return res.status(400).json({ error: "resetToken + newPassword krävs" });

  const db = readDB();
  const u = db.users.find((x) => x.resetToken === resetToken);

  if (!u) return res.status(400).json({ error: "Token ogiltig" });
  if (!u.resetTokenExp || Date.now() > u.resetTokenExp) return res.status(400).json({ error: "Token har gått ut" });

  u.passwordHash = hashPass(newPassword);
  u.resetToken = null;
  u.resetTokenExp = null;

  writeDB(db);
  res.json({ message: "Lösenord uppdaterat ✅" });
});

app.post("/auth/change-username", authRequired, (req, res) => {
  const { newUsername } = req.body || {};
  if (!newUsername) return res.status(400).json({ error: "newUsername krävs" });

  const db = readDB();
  const exists = getUserByUsername(db, newUsername);
  if (exists) return res.status(400).json({ error: "Användarnamn finns redan" });

  const u = getUserById(db, req.user.sub);
  if (!u) return res.status(404).json({ error: "User hittas ej" });

  u.username = String(newUsername);
  writeDB(db);

  res.json({ message: "Användarnamn uppdaterat ✅" });
});

app.post("/auth/change-password", authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Båda fält krävs" });

  const db = readDB();
  const u = getUserById(db, req.user.sub);
  if (!u) return res.status(404).json({ error: "User hittas ej" });

  if (u.passwordHash !== hashPass(currentPassword)) return res.status(400).json({ error: "Nuvarande lösenord fel" });

  u.passwordHash = hashPass(newPassword);
  writeDB(db);

  res.json({ message: "Lösenord uppdaterat ✅" });
});

// =========================
// CHAT -> creates/uses Ticket
// =========================
app.post("/chat", authRequired, (req, res) => {
  const { companyId, conversation, ticketId } = req.body || {};
  const db = readDB();

  const category = getCategory(db, companyId || "demo");
  const user = getUserById(db, req.user.sub);

  // hitta eller skapa ticket
  let t = null;

  if (ticketId) {
    t = db.tickets.find((x) => x.id === ticketId);
  }

  if (!t) {
    const id = makeId("tkt_");
    db.stats.global.totalTickets += 1;

    t = {
      id,
      ticketNumber: db.stats.global.totalTickets,
      companyId: companyId || "demo",
      title: conversation?.[conversation.length - 1]?.content?.slice(0, 40) || "Nytt ärende",
      status: "open",
      priority: "normal",
      createdAt: nowISO(),
      lastActivityAt: nowISO(),
      createdByUserId: user?.id,
      assignedToUserId: null,
      messages: [],
      internalNotes: [],
      metrics: {
        firstUserMessageAt: nowISO(),
        firstAgentResponseAt: null,
        solvedAt: null,
      },
      sla: {
        firstResponseMs: null,
        resolutionMs: null,
        firstResponseBreached: false,
        resolutionBreached: false,
      },
    };

    db.tickets.push(t);
  }

  // lägg sista user-meddelandet i ticket
  const lastUserMsg = (conversation || []).slice().reverse().find((m) => m.role === "user");
  if (lastUserMsg?.content) {
    t.messages.push({
      id: makeId("msg_"),
      role: "user",
      content: String(lastUserMsg.content),
      timestamp: nowISO(),
    });
    db.stats.global.totalMessages += 1;
  }

  t.lastActivityAt = nowISO();
  updateSlaForTicket(t);

  // AI reply (demo smart)
  const aiReply = makeSmartReply(category, conversation);

  t.messages.push({
    id: makeId("msg_"),
    role: "ai",
    content: aiReply,
    timestamp: nowISO(),
  });

  db.stats.global.totalMessages += 1;
  t.lastActivityAt = nowISO();

  writeDB(db);

  res.json({
    reply: aiReply,
    ticketId: t.id,
    ragUsed: false,
  });
});

function makeSmartReply(category, conversation = []) {
  const last = conversation.slice().reverse().find((m) => m.role === "user")?.content || "";

  // bättre, mer professionell men enkel AI-text
  return `✅ (${category.name}) Jag förstår!\n\nDu skrev: "${last}"\n\nHär är vad jag kan göra direkt:\n• Ge snabb diagnos\n• Föreslå nästa steg\n• Be om exakt info om något saknas\n\n👉 Skriv gärna: vilket system gäller det + vad du redan testat, så löser vi det snabbare.`;
}

// =========================
// MY tickets
// =========================
app.get("/my/tickets", authRequired, (req, res) => {
  const db = readDB();
  const userId = req.user.sub;

  const rows = db.tickets.filter((t) => t.createdByUserId === userId);
  rows.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  res.json(
    rows.map((t) => ({
      _id: t.id,
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      companyId: t.companyId,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      lastActivityAt: t.lastActivityAt,
    }))
  );
});

app.get("/my/tickets/:id", authRequired, (req, res) => {
  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  if (t.createdByUserId !== req.user.sub) return res.status(403).json({ error: "Ingen behörighet" });

  res.json({
    _id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    companyId: t.companyId,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    messages: t.messages,
  });
});

app.post("/my/tickets/:id/reply", authRequired, (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content krävs" });

  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  if (t.createdByUserId !== req.user.sub) return res.status(403).json({ error: "Ingen behörighet" });

  t.messages.push({
    id: makeId("msg_"),
    role: "user",
    content: String(content),
    timestamp: nowISO(),
  });

  t.lastActivityAt = nowISO();
  updateSlaForTicket(t);

  writeDB(db);
  res.json({ message: "Skickat ✅" });
});

// =========================
// ADMIN + SLA + KB + Export
// (din del 2 från tidigare)
// =========================

// ADMIN: tickets/inbox
app.get("/admin/tickets", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const db = readDB();

  const status = String(req.query.status || "").trim();
  const companyId = String(req.query.companyId || "").trim();

  let rows = db.tickets.slice();

  if (status) rows = rows.filter((t) => t.status === status);
  if (companyId) rows = rows.filter((t) => t.companyId === companyId);

  rows.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  res.json(
    rows.map((t) => ({
      _id: t.id,
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      companyId: t.companyId,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      lastActivityAt: t.lastActivityAt,
      assignedToUserId: t.assignedToUserId,
    }))
  );
});

app.get("/admin/tickets/:id", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  res.json({
    _id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    companyId: t.companyId,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    lastActivityAt: t.lastActivityAt,
    assignedToUserId: t.assignedToUserId,
    messages: t.messages,
    internalNotes: t.internalNotes,
    sla: t.sla,
  });
});

app.post("/admin/tickets/:id/status", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status krävs" });

  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  t.status = status;
  t.lastActivityAt = nowISO();

  if (status === "solved" && !t.metrics.solvedAt) {
    t.metrics.solvedAt = nowISO();
  }
  updateSlaForTicket(t);

  writeDB(db);
  res.json({ message: "Status uppdaterad ✅" });
});

app.post("/admin/tickets/:id/priority", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const { priority } = req.body || {};
  if (!priority) return res.status(400).json({ error: "priority krävs" });

  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  t.priority = priority;
  t.lastActivityAt = nowISO();

  writeDB(db);
  res.json({ message: "Prioritet uppdaterad ✅" });
});

app.post("/admin/tickets/:id/assign", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId krävs" });

  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  const target = getUserById(db, userId);
  if (!target) return res.status(404).json({ error: "Agent finns inte" });

  if (!["agent", "admin"].includes(target.role)) return res.status(400).json({ error: "Kan bara assigna agent/admin" });

  t.assignedToUserId = target.id;
  t.lastActivityAt = nowISO();

  t.internalNotes.push({
    id: makeId("note_"),
    content: `Assigned till ${target.username} (${target.role})`,
    createdAt: nowISO(),
    createdBy: req.user.username || "system",
  });

  writeDB(db);
  res.json({ message: "Assigned ✅" });
});

app.post("/admin/tickets/:id/agent-reply", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content krävs" });

  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  if (!t.metrics.firstAgentResponseAt) {
    t.metrics.firstAgentResponseAt = nowISO();
  }

  t.messages.push({
    id: makeId("msg_"),
    role: "agent",
    content: String(content),
    timestamp: nowISO(),
  });

  t.lastActivityAt = nowISO();
  updateSlaForTicket(t);
  writeDB(db);

  res.json({ message: "Svar skickat ✅" });
});

app.post("/admin/tickets/:id/internal-note", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content krävs" });

  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  t.internalNotes.push({
    id: makeId("note_"),
    content: String(content),
    createdAt: nowISO(),
    createdBy: req.user.username || "system",
  });

  t.lastActivityAt = nowISO();
  writeDB(db);

  res.json({ message: "Note sparad ✅", ticket: { internalNotes: t.internalNotes } });
});

app.delete("/admin/tickets/:id/internal-notes", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const db = readDB();
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Ticket finns inte" });

  t.internalNotes = [];
  writeDB(db);

  res.json({ message: "Notes rensade ✅" });
});

app.delete("/admin/tickets/:id", authRequired, roleRequired("admin"), (req, res) => {
  const db = readDB();
  const before = db.tickets.length;
  db.tickets = db.tickets.filter((x) => x.id !== req.params.id);
  writeDB(db);

  if (db.tickets.length === before) return res.status(404).json({ error: "Ticket finns inte" });

  res.json({ message: "Ticket borttagen ✅" });
});

app.post("/admin/tickets/solve-all", authRequired, roleRequired("admin"), (req, res) => {
  const db = readDB();
  db.tickets.forEach((t) => {
    t.status = "solved";
    if (!t.metrics.solvedAt) t.metrics.solvedAt = nowISO();
    updateSlaForTicket(t);
  });
  writeDB(db);
  res.json({ message: "Alla tickets lösta ✅" });
});

app.post("/admin/tickets/remove-solved", authRequired, roleRequired("admin"), (req, res) => {
  const db = readDB();
  db.tickets = db.tickets.filter((t) => t.status !== "solved");
  writeDB(db);
  res.json({ message: "Solved tickets borttagna ✅" });
});

// =========================
// Admin users
// =========================
app.get("/admin/users", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const db = readDB();
  res.json(db.users.map((u) => safeUser(u)));
});

app.post("/admin/users/:id/role", authRequired, roleRequired("admin"), (req, res) => {
  const { role } = req.body || {};
  if (!role) return res.status(400).json({ error: "role krävs" });

  const db = readDB();
  const u = getUserById(db, req.params.id);
  if (!u) return res.status(404).json({ error: "User finns inte" });

  if (!["user", "agent", "admin"].includes(role)) return res.status(400).json({ error: "Ogiltig roll" });

  u.role = role;
  writeDB(db);

  res.json({ message: "Roll uppdaterad ✅" });
});

app.delete("/admin/users/:id", authRequired, roleRequired("admin"), (req, res) => {
  const db = readDB();
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== req.params.id);
  writeDB(db);

  if (before === db.users.length) return res.status(404).json({ error: "User finns inte" });

  res.json({ message: "User borttagen ✅" });
});

// =========================
// SLA endpoints (overview/trend/agents/tickets/export)
// =========================
function withinDays(dateISO, days) {
  const ms = days * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(dateISO).getTime() <= ms;
}

function calcMedian(values) {
  const v = values.slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 0 ? Math.floor((v[mid - 1] + v[mid]) / 2) : v[mid];
}

function calcP90(values) {
  const v = values.slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const idx = Math.floor(v.length * 0.9) - 1;
  const safeIdx = Math.max(0, Math.min(v.length - 1, idx));
  return v[safeIdx];
}

function compliancePct(msValues, targetMs) {
  if (!msValues.length) return 0;
  const ok = msValues.filter((x) => x <= targetMs).length;
  return Math.round((ok / msValues.length) * 100);
}

app.get("/admin/sla/overview", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const days = Number(req.query.days || 30);
  const db = readDB();
  let tickets = db.tickets.filter((t) => withinDays(t.createdAt, days));

  if (req.user.role === "agent") {
    const myId = req.user.sub;
    tickets = tickets.filter((t) => t.assignedToUserId === myId || t.createdByUserId === myId);
  }

  const byPriority = { low: 0, normal: 0, high: 0 };
  tickets.forEach((t) => {
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
  });

  const firstValues = tickets.map((t) => t.sla.firstResponseMs).filter((x) => typeof x === "number");
  const resValues = tickets.map((t) => t.sla.resolutionMs).filter((x) => typeof x === "number");

  const firstBreaches = tickets.filter((t) => t.sla.firstResponseBreached).length;
  const resBreaches = tickets.filter((t) => t.sla.resolutionBreached).length;

  res.json({
    totalTickets: tickets.length,
    byPriority,
    firstResponse: {
      avgMs: firstValues.length ? Math.floor(firstValues.reduce((a, b) => a + b, 0) / firstValues.length) : null,
      medianMs: calcMedian(firstValues),
      p90Ms: calcP90(firstValues),
      breaches: firstBreaches,
      compliancePct: compliancePct(firstValues, SLA_FIRST_RESPONSE_MS),
    },
    resolution: {
      avgMs: resValues.length ? Math.floor(resValues.reduce((a, b) => a + b, 0) / resValues.length) : null,
      medianMs: calcMedian(resValues),
      p90Ms: calcP90(resValues),
      breaches: resBreaches,
      compliancePct: compliancePct(resValues, SLA_RESOLUTION_MS),
    },
  });
});

app.get("/admin/sla/trend/weekly", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const days = Number(req.query.days || 30);
  const db = readDB();

  let tickets = db.tickets.filter((t) => withinDays(t.createdAt, days));
  if (req.user.role === "agent") {
    const myId = req.user.sub;
    tickets = tickets.filter((t) => t.assignedToUserId === myId || t.createdByUserId === myId);
  }

  const map = new Map();
  for (const t of tickets) {
    const dt = new Date(t.createdAt);
    const onejan = new Date(dt.getFullYear(), 0, 1);
    const week = Math.ceil((((dt - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    const key = `${dt.getFullYear()}-V${week}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }

  const rows = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, arr]) => {
      const firstValues = arr.map((t) => t.sla.firstResponseMs).filter((x) => typeof x === "number");
      const resValues = arr.map((t) => t.sla.resolutionMs).filter((x) => typeof x === "number");

      return {
        week,
        firstCompliancePct: compliancePct(firstValues, SLA_FIRST_RESPONSE_MS),
        resolutionCompliancePct: compliancePct(resValues, SLA_RESOLUTION_MS),
      };
    });

  res.json({ rows });
});

app.get("/admin/sla/agents", authRequired, roleRequired("admin"), (req, res) => {
  const days = Number(req.query.days || 30);
  const db = readDB();

  const tickets = db.tickets.filter((t) => withinDays(t.createdAt, days));
  const rows = [];

  for (const u of db.users.filter((x) => x.role === "agent" || x.role === "admin")) {
    const mine = tickets.filter((t) => t.assignedToUserId === u.id);

    const open = mine.filter((t) => t.status === "open").length;
    const pending = mine.filter((t) => t.status === "pending").length;
    const solved = mine.filter((t) => t.status === "solved").length;

    const firstValues = mine.map((t) => t.sla.firstResponseMs).filter((x) => typeof x === "number");
    const resValues = mine.map((t) => t.sla.resolutionMs).filter((x) => typeof x === "number");

    rows.push({
      userId: u.id,
      username: u.username,
      role: u.role,
      tickets: mine.length,
      open,
      pending,
      solved,
      firstResponse: {
        avgMs: firstValues.length ? Math.floor(firstValues.reduce((a, b) => a + b, 0) / firstValues.length) : null,
        compliancePct: compliancePct(firstValues, SLA_FIRST_RESPONSE_MS),
      },
      resolution: {
        avgMs: resValues.length ? Math.floor(resValues.reduce((a, b) => a + b, 0) / resValues.length) : null,
        compliancePct: compliancePct(resValues, SLA_RESOLUTION_MS),
      },
    });
  }

  res.json({ rows });
});

app.get("/admin/sla/tickets", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const days = Number(req.query.days || 30);
  const db = readDB();

  let tickets = db.tickets.filter((t) => withinDays(t.createdAt, days));
  if (req.user.role === "agent") {
    const myId = req.user.sub;
    tickets = tickets.filter((t) => t.assignedToUserId === myId || t.createdByUserId === myId);
  }

  const rows = tickets.map((t) => ({
    _id: t.id,
    ticketId: t.id,
    companyId: t.companyId,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    sla: t.sla,
  }));

  res.json({ rows });
});

app.get("/admin/sla/export/csv", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const days = Number(req.query.days || 30);
  const db = readDB();
  let tickets = db.tickets.filter((t) => withinDays(t.createdAt, days));

  if (req.user.role === "agent") {
    const myId = req.user.sub;
    tickets = tickets.filter((t) => t.assignedToUserId === myId || t.createdByUserId === myId);
  }

  const headers = ["ticketId", "companyId", "status", "priority", "createdAt", "firstResponseMs", "resolutionMs", "firstBreached", "resolutionBreached"];
  const lines = [headers.join(",")];

  for (const t of tickets) {
    lines.push(
      [
        t.id,
        t.companyId,
        t.status,
        t.priority,
        t.createdAt,
        t.sla.firstResponseMs ?? "",
        t.sla.resolutionMs ?? "",
        t.sla.firstResponseBreached ? "1" : "0",
        t.sla.resolutionBreached ? "1" : "0",
      ].join(",")
    );
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="sla_export_${days}d.csv"`);
  res.send(lines.join("\n"));
});

// KB + Export
app.get("/kb/list/:companyId", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const companyId = req.params.companyId || "demo";
  const db = readDB();
  const rows = db.kbChunks.filter((c) => c.companyId === companyId);
  res.json(rows);
});

app.post("/kb/upload-text", authRequired, roleRequired("admin"), (req, res) => {
  const { companyId, title, content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content krävs" });

  const db = readDB();
  const id = makeId("kb_");

  db.kbChunks.push({
    id,
    companyId: companyId || "demo",
    sourceType: "text",
    sourceRef: title || "Text",
    title: title || "Text",
    chunkIndex: 1,
    content: String(content),
    createdAt: nowISO(),
  });

  writeDB(db);
  res.json({ message: "KB text uppladdad ✅" });
});

app.post("/kb/upload-url", authRequired, roleRequired("admin"), (req, res) => {
  const { companyId, url } = req.body || {};
  if (!url) return res.status(400).json({ error: "url krävs" });

  const db = readDB();
  const id = makeId("kb_");

  db.kbChunks.push({
    id,
    companyId: companyId || "demo",
    sourceType: "url",
    sourceRef: url,
    title: url,
    chunkIndex: 1,
    content: `URL saved: ${url}`,
    createdAt: nowISO(),
  });

  writeDB(db);
  res.json({ message: "KB URL uppladdad ✅" });
});

app.post("/kb/upload-pdf", authRequired, roleRequired("admin"), (req, res) => {
  const { companyId, filename, base64 } = req.body || {};
  if (!base64) return res.status(400).json({ error: "base64 krävs" });

  const db = readDB();
  const id = makeId("kb_");

  db.kbChunks.push({
    id,
    companyId: companyId || "demo",
    sourceType: "pdf",
    sourceRef: filename || "pdf",
    title: filename || "pdf",
    chunkIndex: 1,
    content: `PDF uploaded: ${filename || "pdf"} (stored as base64 length=${String(base64).length})`,
    createdAt: nowISO(),
  });

  writeDB(db);
  res.json({ message: "KB PDF uppladdad ✅" });
});

app.get("/admin/export/all", authRequired, roleRequired("admin"), (req, res) => {
  const db = readDB();
  res.json({
    users: db.users.map((u) => safeUser(u)),
    categories: db.categories,
    tickets: db.tickets,
    kbChunks: db.kbChunks,
    stats: db.stats,
  });
});

app.get("/admin/export/training", authRequired, roleRequired("admin"), (req, res) => {
  const companyId = String(req.query.companyId || "demo");
  const db = readDB();

  const cat = getCategory(db, companyId);
  const chunks = db.kbChunks.filter((x) => x.companyId === companyId);

  res.json({
    companyId,
    category: cat,
    kbChunks: chunks,
  });
});

// =========================
// Start
// =========================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
