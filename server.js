require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sanitizeHtml = require("sanitize-html");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();
app.set("trust proxy", 1);

// ✅ Body
app.use(express.json({ limit: "18mb" }));

// ✅ CORS (stabilare än default)
app.use(
  cors({
    origin: process.env.APP_URL || true, // tillåt din frontend eller allt under dev
    credentials: true,
  })
);

// ✅ Servera bara från public (inte hela projektmappen!)
app.use(express.static(path.join(__dirname, "public")));

/* =====================
   ENV CHECK
===================== */
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

console.log("✅ ENV CHECK:");
console.log("MONGO_URI:", mongoUri ? "OK" : "SAKNAS");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "OK" : "SAKNAS");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "OK" : "SAKNAS");
console.log("APP_URL:", process.env.APP_URL || "http://localhost:3000");

// ✅ Avbryt om viktiga saker saknas (så du slipper mystiska fel)
if (!mongoUri) {
  console.error("❌ MONGO_URI saknas – server stoppar");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET saknas – server stoppar");
  process.exit(1);
}

/* =====================
   MongoDB
===================== */
mongoose.set("strictQuery", true);
mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ MongoDB ansluten"))
  .catch((err) => {
    console.error("❌ MongoDB-fel:", err.message);
    process.exit(1);
  });

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB runtime error:", err);
});

/* =====================
   Helpers
===================== */
function cleanText(text) {
  return sanitizeHtml(text || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

function genPublicId(prefix = "T") {
  const rnd = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}-${rnd}`;
}

/* =====================
   MODELS (som du hade)
===================== */
const userSchema = new mongoose.Schema({
  publicUserId: { type: String, unique: true, index: true, default: () => genPublicId("U") },
  username: { type: String, unique: true, required: true, index: true },
  email: { type: String, default: "", index: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
  resetTokenHash: { type: String, default: "" },
  resetTokenExpiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

/* =====================
   Auth middleware
===================== */
const authenticate = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Ingen token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Ogiltig token" });
  }
};

/* =====================
   TEST ROUTES (för att UI inte ska låsa)
===================== */

// ✅ Healthcheck
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ✅ EXTREMT VIKTIGT: gör chat ok utan auth så du kan klicka igen
app.post("/chat", async (req, res) => {
  const msg = cleanText(req.body?.message || "");
  res.json({ reply: `✅ Servern funkar. Du skrev: "${msg}"` });
});

/* =====================
   Start
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server körs på http://localhost:${PORT}`);
});
