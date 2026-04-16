const { features } = require("./features");

const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || "",
  appUrl: process.env.APP_URL || "",
  jwtSecret: process.env.JWT_SECRET || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  features
};

module.exports = { config };
