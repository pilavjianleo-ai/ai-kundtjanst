/* =========================================================
   AI Kundtjänst - server.js (FULL FIXED BACKEND)
   ✅ Fungerar direkt med index.html + script.js
   ✅ Inlogg / register / roller (user/agent/admin)
   ✅ Forgot password + reset token
   ✅ Tickets / Inbox / Assign / Notes / Status / Priority
   ✅ SLA dashboard endpoints (overview/trend/agents/tickets/export)
   ✅ Categories (list + create)
   ✅ Knowledge base upload/list/export
   ✅ Export all + training export
   ✅ Statistik (agent/admin)
   ========================================================= */

import express from "express";
import cors from "cors";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// ENV + CONFIG
// =========================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// SLA targets (ms)
const SLA_FIRST_RESPONSE_MS = Number(process.env.SLA_FIRST_RESPONSE_MS || 30 * 60 * 1000); // 30 min
const SLA_RESOLUTION_MS = Number(process.env.SLA_RESOLUTION_MS || 8 * 60 * 60 * 1000); // 8h

// Data store filer (enkelt, stabilt)
const DATA_DIR = path.join(__dirname, "data_store");
const DB_FILE = path.join(DATA_DIR, "db.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(
      {
        users: [],
        categories: [
          { key: "demo", name: "demo", systemPrompt: "Du är en hjälpsam support-assistent." },
          { key: "law", name: "law", systemPrompt: "Du hjälper med juridiska frågor på en allmän nivå." },
          { key: "tech", name: "tech", systemPrompt: "Du hjälper med tekniska frågor och felsökning." },
          { key: "cleaning", name: "cleaning", systemPrompt: "Du hjälper med städning, rutiner och tips." },
        ],
        tickets: [],
        kbChunks: [],
        passwordResets: [], // {tokenHash,email,expiresAt}
        stats: {
          feedbackUp: 0,
          feedbackDown: 0,
        },
      },
      null,
      2
    )
  );
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return {
      users: [],
      categories: [],
      tickets: [],
      kbChunks: [],
      passwordResets: [],
      stats: { feedbackUp: 0, feedbackDown: 0 },
    };
  }
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// =========================
// Helpers
// =========================
function makeId(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

function nowISO() {
  return new Date().toISOString();
}

function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    _id: u.id,
    username: u.username,
    email: u.email || "",
    role: u.role || "user",
    createdAt: u.createdAt,
  };
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) return res.status(401).json({ error: "Ej inloggad" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Ogiltig token" });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    const role = req.user?.role || "user";
    if (!roles.includes(role)) return res.status(403).json({ error: "Ingen behörighet" });
    next();
  };
}

function getUserById(db, id) {
  return db.users.find((u) => u.id === id);
}

function getUserByUsername(db, username) {
  return db.users.find((u) => String(u.username).toLowerCase() === String(username).toLowerCase());
}

function getUserByEmail(db, email) {
  return db.users.find((u) => String(u.email || "").toLowerCase() === String(email).toLowerCase());
}

function getCategory(db, key) {
  return db.categories.find((c) => c.key === key) || db.categories[0];
}

// =========================
// Seed admin if empty
// =========================
(function seedAdmin() {
  const db = readDB();
  if (db.users.length === 0) {
    const adminId = makeId("usr_");
    const pwHash = bcrypt.hashSync("admin123", 10);
    db.users.push({
      id: adminId,
      username: "admin",
      email: "admin@local",
      passwordHash: pwHash,
      role: "admin",
      createdAt: nowISO(),
    });

    const agentId = makeId("usr_");
    db.users.push({
      id: agentId,
      username: "agent",
      email: "agent@local",
      passwordHash: bcrypt.hashSync("agent123", 10),
      role: "agent",
      createdAt: nowISO(),
    });

    writeDB(db);
    console.log("✅ Seeded admin + agent:");
    console.log("admin / admin123");
    console.log("agent / agent123");
  }
})();

// =========================
// Static frontend
// =========================
app.use(express.static(__dirname));

// =========================
// Auth endpoints
// =========================
app.post("/register", async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username + password krävs" });

  const db = readDB();
  if (getUserByUsername(db, username)) return res.status(400).json({ error: "Användarnamn finns redan" });
  if (email && getUserByEmail(db, email)) return res.status(400).json({ error: "Email används redan" });

  const id = makeId("usr_");
  const user = {
    id,
    username,
    email: email || "",
    passwordHash: await bcrypt.hash(password, 10),
    role: "user",
    createdAt: nowISO(),
  };

  db.users.push(user);
  writeDB(db);

  return res.json({ message: "Registrerad ✅" });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username + password krävs" });

  const db = readDB();
  const user = getUserByUsername(db, username);
  if (!user) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Fel användarnamn eller lösenord" });

  const token = signToken(user);

  return res.json({
    token,
    user: safeUser(user),
  });
});

app.get("/me", authRequired, (req, res) => {
  const db = readDB();
  const user = getUserById(db, req.user.sub);
  if (!user) return res.status(401).json({ error: "Ej inloggad" });
  res.json(safeUser(user));
});

// Byt användarnamn (inloggad)
app.post("/auth/change-username", authRequired, (req, res) => {
  const { newUsername } = req.body || {};
  if (!newUsername || String(newUsername).trim().length < 3) return res.status(400).json({ error: "Ogiltigt användarnamn" });

  const db = readDB();
  const user = getUserById(db, req.user.sub);
  if (!user) return res.status(401).json({ error: "Ej inloggad" });

  const exists = getUserByUsername(db, newUsername);
  if (exists && exists.id !== user.id) return res.status(400).json({ error: "Användarnamn upptaget" });

  user.username = String(newUsername).trim();
  writeDB(db);

  return res.json({ message: "Användarnamn uppdaterat ✅" });
});

// Byt lösenord (inloggad)
app.post("/auth/change-password", authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Båda fält krävs" });
  if (String(newPassword).length < 6) return res.status(400).json({ error: "Nytt lösenord är för kort" });

  const db = readDB();
  const user = getUserById(db, req.user.sub);
  if (!user) return res.status(401).json({ error: "Ej inloggad" });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Nuvarande lösenord är fel" });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  writeDB(db);

  return res.json({ message: "Lösenord uppdaterat ✅" });
});

// Forgot password
app.post("/auth/forgot-password", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email krävs" });

  const db = readDB();
  const user = getUserByEmail(db, email);
  if (!user) return res.status(200).json({ message: "Om email finns så skickas en länk ✅" });

  // token
  const token = makeId("reset_");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const expiresAt = Date.now() + 1000 * 60 * 30; // 30 min

  db.passwordResets.push({
    tokenHash,
    email: user.email,
    expiresAt,
  });

  writeDB(db);

  // OBS: Vi skickar inte riktig mail – returnerar resetToken så du kan testa direkt.
  // Om du vill koppla e-post senare kan vi göra det.
  return res.json({
    message: "Återställningslänk skapad ✅",
    resetToken: token,
    hint: "Öppna sidan med ?resetToken=TOKEN",
  });
});

// Reset password
app.post("/auth/reset-password", async (req, res) => {
  const { resetToken, newPassword } = req.body || {};
  if (!resetToken || !newPassword) return res.status(400).json({ error: "Token + nytt lösenord krävs" });
  if (String(newPassword).length < 6) return res.status(400).json({ error: "Lösenord måste vara minst 6 tecken" });

  const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

  const db = readDB();
  const entry = db.passwordResets.find((x) => x.tokenHash === tokenHash);
  if (!entry) return res.status(400).json({ error: "Ogiltig token" });
  if (Date.now() > entry.expiresAt) return res.status(400).json({ error: "Token har gått ut" });

  const user = getUserByEmail(db, entry.email);
  if (!user) return res.status(400).json({ error: "Användare finns inte" });

  user.passwordHash = await bcrypt.hash(newPassword, 10);

  // ta bort reset entry
  db.passwordResets = db.passwordResets.filter((x) => x.tokenHash !== tokenHash);

  writeDB(db);

  return res.json({ message: "Lösenord uppdaterat ✅" });
});

// =========================
// Categories
// =========================
app.get("/categories", (req, res) => {
  const db = readDB();
  res.json(db.categories || []);
});

// Admin create category
app.post("/admin/categories", authRequired, roleRequired("admin"), (req, res) => {
  const { key, name, systemPrompt } = req.body || {};
  if (!key || !name) return res.status(400).json({ error: "key + name krävs" });

  const db = readDB();
  if (db.categories.some((c) => c.key === key)) return res.status(400).json({ error: "Key finns redan" });

  db.categories.push({
    key: String(key).trim(),
    name: String(name).trim(),
    systemPrompt: String(systemPrompt || "").trim(),
  });

  writeDB(db);
  res.json({ message: "Kategori skapad ✅" });
});

// =========================
// Feedback
// =========================
app.post("/feedback", authRequired, (req, res) => {
  const { type } = req.body || {};
  const db = readDB();

  if (type === "up") db.stats.feedbackUp = (db.stats.feedbackUp || 0) + 1;
  if (type === "down") db.stats.feedbackDown = (db.stats.feedbackDown || 0) + 1;

  writeDB(db);
  return res.json({ message: "ok" });
});

// =========================
// Chat + Tickets
// =========================
function ensureTicket(db, ticketId, userId, companyId) {
  let ticket = null;

  if (ticketId) {
    ticket = db.tickets.find((t) => t.id === ticketId);
  }

  if (!ticket) {
    ticket = {
      id: makeId("tkt_"),
      ticketNumber: Math.floor(Math.random() * 900000 + 100000), // 6 siffror
      companyId: companyId || "demo",
      createdByUserId: userId || null,
      assignedToUserId: null,
      title: "Support ärende",
      status: "open",
      priority: "normal",
      createdAt: nowISO(),
      lastActivityAt: nowISO(),
      messages: [],
      internalNotes: [],
      sla: {
        firstResponseMs: null,
        resolutionMs: null,
        firstResponseBreached: false,
        resolutionBreached: false,
      },
      metrics: {
        firstUserMessageAt: null,
        firstAgentResponseAt: null,
        solvedAt: null,
      },
    };
    db.tickets.push(ticket);
  }

  return ticket;
}

function updateSlaForTicket(ticket) {
  const firstUserAt = ticket.metrics.firstUserMessageAt ? new Date(ticket.metrics.firstUserMessageAt).getTime() : null;
  const firstAgentAt = ticket.metrics.firstAgentResponseAt ? new Date(ticket.metrics.firstAgentResponseAt).getTime() : null;
  const solvedAt = ticket.metrics.solvedAt ? new Date(ticket.metrics.solvedAt).getTime() : null;

  if (firstUserAt && firstAgentAt) {
    ticket.sla.firstResponseMs = firstAgentAt - firstUserAt;
    ticket.sla.firstResponseBreached = ticket.sla.firstResponseMs > SLA_FIRST_RESPONSE_MS;
  }

  if (firstUserAt && solvedAt) {
    ticket.sla.resolutionMs = solvedAt - firstUserAt;
    ticket.sla.resolutionBreached = ticket.sla.resolutionMs > SLA_RESOLUTION_MS;
  }
}

function aiReplySimple(userText, category) {
  const sys = category?.systemPrompt || "Du är en hjälpsam support-assistent.";
  // super-stabil baseline AI (utan externa API-krav)
  // vill du koppla OpenAI senare gör vi det i ett steg.
  return `🧠 (${category?.name || category?.key || "AI"})\n\nJag förstår!\n\nDu skrev:\n"${userText}"\n\n✅ Förslag:\n1) Beskriv exakt vad som händer\n2) Säg vilken enhet/webbläsare du använder\n3) Kopiera ev felmeddelande\n\n${sys ? "📌 Info: " + sys : ""}`;
}

app.post("/chat", authRequired, (req, res) => {
  const { companyId, conversation, ticketId } = req.body || {};

  const db = readDB();
  const user = getUserById(db, req.user.sub);
  if (!user) return res.status(401).json({ error: "Ej inloggad" });

  const cat = getCategory(db, companyId || "demo");
  const lastUserMsg = Array.isArray(conversation)
    ? [...conversation].reverse().find((m) => m.role === "user")?.content
    : null;

  if (!lastUserMsg) return res.status(400).json({ error: "Meddelande saknas" });

  const ticket = ensureTicket(db, ticketId, user.id, companyId || "demo");

  // första user msg timestamp
  if (!ticket.metrics.firstUserMessageAt) {
    ticket.metrics.firstUserMessageAt = nowISO();
  }

  // lägg in user message i ticket
  ticket.messages.push({
    id: makeId("msg_"),
    role: "user",
    content: String(lastUserMsg),
    timestamp: nowISO(),
  });

  ticket.lastActivityAt = nowISO();

  // AI svar
  const reply = aiReplySimple(String(lastUserMsg), cat);

  // markera first agent response timestamp (AI räknas som first response)
  if (!ticket.metrics.firstAgentResponseAt) {
    ticket.metrics.firstAgentResponseAt = nowISO();
  }

  ticket.messages.push({
    id: makeId("msg_"),
    role: "ai",
    content: reply,
    timestamp: nowISO(),
  });

  updateSlaForTicket(ticket);

  writeDB(db);

  res.json({
    reply,
    ticketId: ticket.id,
    ragUsed: false,
  });
});

// =========================
// MY TICKETS endpoints
// =========================
app.get("/my/tickets", authRequired, (req, res) => {
  const db = readDB();
  const userId = req.user.sub;

  const my = db.tickets
    .filter((t) => t.createdByUserId === userId)
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    .map((t) => ({
      _id: t.id,
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      companyId: t.companyId,
      createdAt: t.createdAt,
      lastActivityAt: t.lastActivityAt,
    }));

  res.json(my);
});

app.get("/my/tickets/:id", authRequired, (req, res) => {
  const db = readDB();
  const userId = req.user.sub;
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t || t.createdByUserId !== userId) return res.status(404).json({ error: "Ticket finns inte" });

  res.json({
    _id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt,
    messages: t.messages,
  });
});

app.post("/my/tickets/:id/reply", authRequired, (req, res) => {
  const { content } = req.body || {};
  if (!content) return res.status(400).json({ error: "content krävs" });

  const db = readDB();
  const userId = req.user.sub;
  const t = db.tickets.find((x) => x.id === req.params.id);
  if (!t || t.createdByUserId !== userId) return res.status(404).json({ error: "Ticket finns inte" });

  t.messages.push({
    id: makeId("msg_"),
    role: "user",
    content: String(content),
    timestamp: nowISO(),
  });

  t.lastActivityAt = nowISO();
  writeDB(db);

  res.json({ message: "Skickat ✅" });
});

/* =========================================================
   DEL 2 fortsätter med:
   ✅ Admin tickets/inbox endpoints
   ✅ Status/priority/assign/notes/delete
   ✅ SLA endpoints
   ✅ Admin users endpoints + export endpoints
   ✅ KB endpoints + export kb
   ✅ Start server listen
========================================================= */
// =========================
// ADMIN: Tickets / Inbox
// =========================
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

  // intern note logg
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

  // markera first agent response om saknas
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

// Solve all (admin)
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

// Remove solved (admin)
app.post("/admin/tickets/remove-solved", authRequired, roleRequired("admin"), (req, res) => {
  const db = readDB();
  db.tickets = db.tickets.filter((t) => t.status !== "solved");
  writeDB(db);
  res.json({ message: "Solved tickets borttagna ✅" });
});

// =========================
// ADMIN: Users
// =========================
app.get("/admin/users", authRequired, roleRequired("admin", "agent"), (req, res) => {
  const db = readDB();

  // Agent får se users men inte admin-panelen ändå (frontend döljer den)
  // Admin kan se allt
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
// SLA endpoints
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

  // ✅ agent ska bara se sin egen statistik
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

  // gruppera på veckonummer (enkel)
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

// =========================
// EXPORT endpoints
// =========================
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
// KB endpoints
// =========================
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

app.get("/export/kb/:companyId", authRequired, roleRequired("admin"), (req, res) => {
  const companyId = req.params.companyId || "demo";
  const db = readDB();
  const rows = db.kbChunks.filter((x) => x.companyId === companyId);

  res.json({
    companyId,
    kbChunks: rows,
  });
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
