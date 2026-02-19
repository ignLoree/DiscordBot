const baseLogs = require("./logs");
const config = require("../../config.json");

const levels = {
  debug: 0,
  info: 1,
  success: 1,
  logging: 1,
  warn: 2,
  error: 3,
};
function getMinLevel() {
  const configured = (config.logLevel || "info").toLowerCase();
  if (configured === "silent") return Infinity;
  return levels[configured] ?? levels.info;
}
function shouldLog(level) {
  if ((config.logLevel || "").toLowerCase() === "silent") {
    return level === "error";
  }
  return (levels[level] ?? levels.info) >= getMinLevel();
}
function buildPayload(args) {
  if (!args.length) return "";
  if (args.length === 1) return args[0];
  return args;
}
function write(level, clientOrMessage, ...rest) {
  let logger = baseLogs;
  let args = [clientOrMessage, ...rest];
  if (
    clientOrMessage?.logs &&
    typeof clientOrMessage.logs[level] === "function"
  ) {
    logger = clientOrMessage.logs;
    args = rest;
  }
  if (!shouldLog(level)) return;
  const payload = buildPayload(args);
  if (typeof logger[level] === "function") {
    return logger[level](payload);
  }
  return baseLogs.info(payload);
}
const logger = {
  info: (...args) => write("info", ...args),
  log: (...args) => write("info", ...args),
  warn: (...args) => write("warn", ...args),
  error: (...args) => write("error", ...args),
  debug: (...args) => write("debug", ...args),
  success: (...args) => write("success", ...args),
  logging: (...args) => write("logging", ...args),
};

module.exports = logger;
