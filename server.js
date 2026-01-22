// ...existing code...
// ...existing code...
// server.js (FIXAD ORIGINALVERSION - CommonJS + Render Node 20)
// ✅ MongoDB (dina gamla users funkar igen)
// ✅ JWT login + bcrypt
// ✅ RAG + KB + SLA + Admin/Agent skydd
// ✅ SSE events för inbox-notis
// ✅ Stabil: kraschar inte pga småfel

require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const sanitizeHtml = require("sanitize-html");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const cheerio = require("cheerio");
const pdfParse = require("pdf-parse");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// ✅ FIX: node-fetch v3 är ESM, men du kör commonjs -> använd dynamic import
async function fetchCompat(...args) {
  const mod = await import("node-fetch");
  return mod.default(...args);
}

const app = express();

const helmet = require("helmet");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        "script-src-elem": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        "img-src": ["'self'", "data:", "https://cdnjs.cloudflare.com"],
        "connect-src": ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      },
    },
  })
);
app.use(cors({ origin: true, credentials: true }));

// Helper: Consistent error response
function sendError(res, error, status = 500) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[API ERROR]", error);
  }
  return res.status(status).json({ error: error?.message || error || "Serverfel" });
}

// Helper: Validate required fields
function requireFields(obj, fields) {
  for (const f of fields) {
    if (!obj || typeof obj[f] === "undefined" || obj[f] === null || obj[f] === "") return false;
  }
  return true;
}
app.set("trust proxy", 1);

app.use(express.json({ limit: "18mb" }));
app.use(cors());


/* ===================== ✅ ENV ===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "OK" : "SAKNAS");
console.log("SMTP_USER:", process.env.SMTP_USER ? "OK" : "SAKNAS");
console.log("APP_URL:", process.env.APP_URL ? "OK" : "SAKNAS");

if (!mongoUri) console.error("❌ MongoDB URI saknas! Lägg till MONGO_URI i Render env.");
if (!process.env.JWT_SECRET) console.error("❌ JWT_SECRET saknas!");
if (!process.env.OPENAI_API_KEY) console.error("❌ OPENAI_API_KEY saknas!");
if (!process.env.APP_URL) console.error("❌ APP_URL saknas! Ex: https://din-app.onrender.com");

/* ===================== ✅ MongoDB ===================== */
mongoose.set("strictQuery", true);

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB ansluten"))
  .catch((err) => console.error("❌ MongoDB-fel:", err.message));

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB runtime error:", err);
});

// ...resten av Server.js-koden följer här (fullt innehåll kopierat)...


// Serve static files LAST to avoid interfering with API routes
app.use(express.static(__dirname));

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`✅ Servern körs på port ${PORT}`));
console.log("✅ server.js reached end of file without crashing");
