module.exports = function installProcessHandlers() {
  if (process.__viniliTestProcessHandlersInstalled) return;
  process.__viniliTestProcessHandlersInstalled = true;

  const logs = require("../Utils/Moderation/logs");

  const error = (msg) => {
    try {
      logs.error(`[ERROR] ${msg}`);
    } catch {}
  };

  process.on("SIGINT", () => {
    error("SIGINT: Exiting...");
    process.exit();
  });

  process.on("uncaughtException", (err) => {
    error("UNCAUGHT EXCEPTION: " + (err?.stack || err));
  });

  process.on("SIGTERM", () => {
    error("SIGTERM: Exiting...");
    process.exit();
  });

  process.on("unhandledRejection", (err) => {
    error("UNHANDLED REJECTION: " + (err?.stack || err));
  });

  process.on("warning", () => {});

  logs.success("[PROCESS] Process handlers loaded.");
};
