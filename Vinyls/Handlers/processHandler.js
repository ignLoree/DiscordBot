const logs = require("../Utils/Moderation/logs");

function error(message) {
  logs.error(`[ERROR] ${message}`);
}

module.exports = () => {
  if (process.__viniliProcessHandlersInstalled) return;
  process.__viniliProcessHandlersInstalled = true;

  process.on("SIGINT", () => {
    error("SIGINT: Exiting...");
    process.exit();
  });

  process.on("uncaughtException", (err) => {
    error(`UNCAUGHT EXCEPTION: ${err?.stack || err}`);
  });

  process.on("SIGTERM", () => {
    error("SIGTERM: Closing database and exiting...");
    process.exit();
  });

  process.on("unhandledRejection", (err) => {
    error(`UNHANDLED REJECTION: ${err?.stack || err}`);
  });

  process.on("warning", (w) => {
    const msg = w?.message || String(w);
    const stack = w?.stack ? `\n${w.stack}` : "";
    logs.warn(`[PROCESS WARNING] ${msg}${stack}`);
  });

  logs.success("[PROCESS] Process handlers loaded.");
};