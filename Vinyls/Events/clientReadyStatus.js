const { checkAndInstallPackages } = require("../Utils/Moderation/checkPackages");
const { startAutoPollLoop } = require("../Services/Community/autoPollService");

function logError(client, label, error) {
  const detail = error?.stack || error?.message || error;
  if (client?.logs?.error) client.logs.error(label, detail);
  if (global?.logger?.error) global.logger.error(label, detail);
  else console.error(label, detail);
}

function setPresence(client) {
  if (!client?.user) return;
  try {
    const status = String(client?.config?.status || "online");
    client.user.setPresence({
      status,
      activities: [
        { type: 4, name: "irrelevant", state: "☕📀 discord.gg/viniliecaffe" },
      ],
    });
  } catch (error) {
    logError(client, "[STATUS] Failed to set presence.", error);
  }
}

function maybeCheckPackages(client) {
  if (typeof checkAndInstallPackages !== "function") return;
  if (process.env.CHECK_PACKAGES_ON_READY !== "1") return;

  Promise.resolve(checkAndInstallPackages(client)).catch((err) => {
    logError(client, "[PACKAGES] Check failed:", err);
  });
}

module.exports = {
  name: "clientReady",
  once: true,
  async execute(client) {
    try {
      setPresence(client);
      maybeCheckPackages(client);
      startAutoPollLoop(client);
    } catch (error) {
      logError(client, "[STATUS] Error while loading bot status.", error);
    }
  },
};