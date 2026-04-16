function errorHandler(err, req, res, next) {
  try {
    const status = Number(err?.statusCode || err?.status || 500);
    const message = status >= 500 ? "Internt fel" : String(err?.message || "Fel");
    if (process.env.NODE_ENV !== "test") {
      const safePath = req?.originalUrl || req?.url || "";
      const { logger } = require("../utils/logger");
      logger.error(`[ERROR] ${status} ${req?.method || ""} ${safePath} :: ${String(err?.message || err)}`);
    }
    res.status(status).json({ error: message });
  } catch {
    res.status(500).json({ error: "Internt fel" });
  }
}

module.exports = { errorHandler };
