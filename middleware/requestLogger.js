const crypto = require("crypto");
const { logger } = require("../utils/logger");

function requestLogger(req, res, next) {
  const start = Date.now();
  const id = crypto.randomBytes(6).toString("hex");
  req.requestId = id;
  res.setHeader("X-Request-Id", id);

  res.on("finish", () => {
    if (process.env.NODE_ENV === "test") return;
    const ms = Date.now() - start;
    const path = req.originalUrl || req.url || "";
    const status = res.statusCode;
    const method = req.method;
    logger.info(`[REQ] ${status} ${method} ${path} ${ms}ms rid=${id}`);
  });

  next();
}

module.exports = { requestLogger };
