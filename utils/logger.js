function formatMeta(meta) {
  try {
    if (!meta) return "";
    const s = typeof meta === "string" ? meta : JSON.stringify(meta);
    return s ? " " + s : "";
  } catch {
    return "";
  }
}

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${String(message || "")}${formatMeta(meta)}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

const logger = {
  info: (message, meta) => log("INFO", message, meta),
  warn: (message, meta) => log("WARN", message, meta),
  error: (message, meta) => log("ERROR", message, meta),
  ai: (message, meta) => log("AI", message, meta)
};

module.exports = { logger };
