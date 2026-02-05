require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const sanitizeHtml = require("sanitize-html");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const speakeasy = require("speakeasy");
const { Client: ElasticClient } = require("@elastic/elasticsearch");
const { createClient } = require("redis");
const { Queue, Worker } = require("bullmq");
const Sentry = require("@sentry/node");
const { Server } = require("socket.io");
const http = require("http");
const { OpenAI } = require("openai");
const pdfParse = require("pdf-parse");
const fs = require("fs").promises;
const stripe = process.env.STRIPE_SECRET_KEY ? require("stripe")(process.env.STRIPE_SECRET_KEY) : null;

// Sentry init (optional)
/*
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    integrations: [
      Sentry.httpIntegration(),
    ]
  });
  console.log("✅ Sentry error tracking aktiverad");
} else {
  console.log("⚠️  Sentry DSN saknas - error tracking inaktiverad");
}
*/

// OpenAI init
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Redis (optional)
let redisClient = null;
let jobQueue = null;

const initRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: false
      }
    });

    await redisClient.connect();
    console.log("✅ Redis ansluten");

    // BullMQ (only if Redis is available)
    jobQueue = new Queue("jobs", { connection: redisClient });
    console.log("✅ BullMQ job queue aktiverad");
  } catch (err) {
    console.log("⚠️  Redis inte tillgänglig - caching och job queue inaktiverade");
    redisClient = null;
    jobQueue = null;
  }
};

initRedis();

// Elasticsearch (optional)
let esClient = null;
const initElasticsearch = async () => {
  try {
    esClient = new ElasticClient({
      node: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
      requestTimeout: 5000
    });
    await esClient.ping();
    console.log("✅ Elasticsearch ansluten");
  } catch (err) {
    console.log("⚠️  Elasticsearch inte tillgänglig - KB search inaktiverad");
    esClient = null;
  }
};

initElasticsearch();

// Mongo
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("✅ MongoDB ansluten");
}).catch((err) => {
  console.error("❌ MongoDB anslutning misslyckades:", err.message);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
});

// ──────────────────────────────────────────
// MongoDB Schemas
// ──────────────────────────────────────────

// User schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, enum: ["user", "admin", "agent"], default: "user" },
  companyId: { type: String, required: true },
  twoFactorSecret: String,
  twoFactorEnabled: { type: Boolean, default: false },
  backupCodes: [String],
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date
});

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const User = mongoose.model("User", userSchema);

// Company schema
const companySchema = new mongoose.Schema({
  companyId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, enum: ["active", "inactive", "trial"], default: "trial" },
  plan: { type: String, enum: ["free", "basic", "pro", "enterprise"], default: "free" },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  settings: {
    aiEnabled: { type: Boolean, default: true },
    ticketAutoAssign: { type: Boolean, default: false },
    theme: { type: String, default: "dark" }
  },
  createdAt: { type: Date, default: Date.now }
});

const Company = mongoose.model("Company", companySchema);

// Ticket schema
const ticketSchema = new mongoose.Schema({
  publicId: { type: String, required: true, unique: true },
  companyId: { type: String, required: true },
  subject: { type: String, required: true },
  status: { type: String, enum: ["open", "pending", "solved", "closed"], default: "open" },
  priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdBy: String,
  tags: [String],
  messages: [{
    sender: String,
    content: String,
    timestamp: { type: Date, default: Date.now },
    isAI: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model("Ticket", ticketSchema);

// Audit schema
const auditSchema = new mongoose.Schema({
  action: String,
  userId: String,
  timestamp: { type: Date, default: Date.now },
  details: Object
});
const Audit = mongoose.model("Audit", auditSchema);

// App
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "18mb" }));

// ──────────────────────────────────────────
// Middleware Functions
// ──────────────────────────────────────────

// Authenticate middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });

    try {
      req.user = await User.findById(decoded.id);
      if (!req.user) return res.status(401).json({ error: "User not found" });
      next();
    } catch (error) {
      res.status(500).json({ error: "Authentication failed" });
    }
  });
}

// Require admin role
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Audit middleware
app.use(async (req, res, next) => {
  if (req.user) {
    await Audit.create({
      action: req.method + " " + req.path,
      userId: req.user._id,
      details: req.body
    }).catch(err => console.error("Audit log failed:", err));
  }
  next();
});

// Socket auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next(new Error("Auth error"));
    socket.user = user;
    next();
  });
});

io.on("connection", (socket) => {
  socket.join(socket.user.companyId);
});

// ──────────────────────────────────────────
// Auth Endpoints
// ──────────────────────────────────────────

// Register new user
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, name, companyId } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create user (password will be hashed by pre-save hook)
    const user = new User({
      email,
      password,
      name,
      companyId: companyId || "demo",
      role: "user"
    });

    await user.save();

    // Create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Get current user
app.get("/auth/me", authenticate, async (req, res) => {
  res.json({
    id: req.user._id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    companyId: req.user.companyId
  });
});

// ──────────────────────────────────────────
// Ticket & Support Endpoints
// ──────────────────────────────────────────


// Fix: SLA clear (rensar gamla tickets)
app.delete("/sla/clear/all", authenticate, requireAdmin, async (req, res) => {
  const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await Ticket.deleteMany({ createdAt: { $lt: oldDate } });
  res.json({ message: "Stats cleared" });
});

// Fix: Billing history (från Stripe om aktiverad)
app.get("/billing/history", authenticate, async (req, res) => {
  if (!stripe) return res.json({ invoices: [] }); // Placeholder om ej konfig
  const company = await Company.findOne({ companyId: req.user.companyId });
  const invoices = await stripe.invoices.list({ customer: company.stripeCustomerId });
  res.json(invoices.data);
});

// Nytt: Stripe webhook (från docs)
app.post("/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.status(400).json({ error: "Stripe not configured" });

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    Sentry.captureException(err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    await Company.updateOne({ stripeSubscriptionId: sub.id }, { status: sub.status });
    io.to(sub.metadata.companyId).emit("subscriptionUpdate", { status: sub.status });
  }
  res.json({ received: true });
});

// Nytt: 2FA
app.post("/auth/2fa/setup", authenticate, async (req, res) => {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `AI Kundtjänst (${req.user.email})`
  });

  // Generera backup-koder
  const backupCodes = Array.from({ length: 8 }, () =>
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );

  await User.updateOne(
    { _id: req.user._id },
    {
      twoFactorSecret: secret.base32,
      twoFactorEnabled: true,
      backupCodes: backupCodes.map(code => bcrypt.hashSync(code, 10))
    }
  );

  res.json({
    secret: secret.base32,
    otpauth_url: secret.otpauth_url,
    backupCodes: backupCodes
  });
});

app.post("/auth/2fa/verify", authenticate, (req, res) => {
  const { token } = req.body;
  const verified = speakeasy.totp.verify({ secret: req.user.twoFactorSecret, encoding: "base32", token });
  res.json({ success: verified });
});

// Nytt: KB search med Elasticsearch
app.get("/kb/search", authenticate, async (req, res) => {
  if (!esClient) {
    return res.status(503).json({ error: "Knowledge base search inte tillgänglig - Elasticsearch krävs" });
  }

  const { query } = req.query;
  const cacheKey = `kb_${query}`;

  // Try cache first (if Redis available)
  if (redisClient) {
    try {
      let result = await redisClient.get(cacheKey);
      if (result) return res.json(JSON.parse(result));
    } catch (err) {
      console.error("Redis cache error:", err);
    }
  }

  const { body } = await esClient.search({ index: "kb", body: { query: { match: { content: query } } } });
  result = body.hits.hits;

  // Cache result (if Redis available)
  if (redisClient) {
    try {
      await redisClient.set(cacheKey, JSON.stringify(result), "EX", 3600);
    } catch (err) {
      console.error("Redis cache error:", err);
    }
  }

  res.json(result);
});

// Nytt: Chat med sentiment
app.post("/chat", authenticate, async (req, res) => {
  try {
    const { message, ticketId } = req.body;

    // Sentiment analysis
    const sentimentRes = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Analyze the sentiment of the following message. Reply with only: positive, negative, or neutral." },
        { role: "user", content: message }
      ],
      max_tokens: 10
    });

    const sentiment = sentimentRes.choices[0].message.content.toLowerCase();

    // Eskalera vid negativt sentiment
    if (sentiment.includes("negative")) {
      io.to(req.user.companyId).emit("escalate", { message, ticketId });
    }

    // Generera AI-svar
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "Du är en hjälpsam kundtjänstassistent. Svara professionellt och vänligt på svenska." },
        { role: "user", content: message }
      ],
      max_tokens: 500
    });

    res.json({
      reply: aiResponse.choices[0].message.content,
      sentiment: sentiment
    });
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({ error: "AI request failed" });
  }
});

// Nytt: GDPR
app.get("/gdpr/export", authenticate, async (req, res) => {
  const userData = await User.findById(req.user._id);
  res.json(userData);
});

app.delete("/gdpr/delete", authenticate, async (req, res) => {
  await User.deleteOne({ _id: req.user._id });
  res.json({ message: "Data deleted" });
});

// Background job worker: PDF parse (only if Redis available)
if (redisClient && jobQueue) {
  new Worker("jobs", async (job) => {
    if (job.name === "parsePdf") {
      try {
        const dataBuffer = await fs.readFile(job.data.filePath);
        const pdfData = await pdfParse(dataBuffer);

        if (esClient) {
          await esClient.index({
            index: "kb",
            body: {
              content: pdfData.text,
              filename: job.data.filename,
              createdAt: new Date()
            }
          });
        }

        console.log(`PDF parsed: ${job.data.filename}`);
      } catch (error) {
        console.error("PDF parse failed:", error);
        throw error;
      }
    }
  }, { connection: redisClient });

  console.log("✅ PDF parsing worker aktiverad");
} else {
  console.log("⚠️  PDF parsing worker inaktiverad - Redis krävs");
}

// Din befintliga static serve
app.use(express.static(__dirname));
app.use((req, res) => {
  const html = require("fs").readFileSync(require("path").join(__dirname, "index.html"), "utf-8");
  res.send(html);
});

// Sentry error handler (must be last) - TEMPORARILY DISABLED
// if (process.env.SENTRY_DSN) {
//   app.use(Sentry.errorHandler());
// }

server.listen(process.env.PORT, () => console.log(`Server on ${process.env.PORT}`));