const fs = require("fs");
const path = require("path");

const LEGACY_READY_EVENT = "ready";
const READY_EVENT_ALIAS = "clientReady";

function listTriggerFiles(root) {
  const triggersRoot = path.join(root, "Triggers");
  if (!fs.existsSync(triggersRoot)) return [];
  return fs.readdirSync(triggersRoot).filter((file) => file.endsWith(".js"));
}

function normalizeEventName(eventName) {
  return eventName === LEGACY_READY_EVENT ? READY_EVENT_ALIAS : eventName;
}

function clearBoundHandlers(client, mapKey) {
  if (!client[mapKey]?.size) return;

  for (const [eventName, handlers] of client[mapKey].entries()) {
    for (const handler of handlers) client.removeListener(eventName, handler);
  }
  client[mapKey].clear();
}

function trackBoundHandler(client, mapKey, eventName, handler) {
  if (!client[mapKey].has(eventName)) client[mapKey].set(eventName, []);
  client[mapKey].get(eventName).push(handler);
}

module.exports = (client) => {
  if (!client._triggerHandlers) client._triggerHandlers = new Map();

  client.handleTriggers = async (_triggerFilesArg, basePath) => {
    clearBoundHandlers(client, "_triggerHandlers");

    const root = basePath || process.cwd();
    const files = listTriggerFiles(root);
    const triggersRoot = path.join(root, "Triggers");
    const statusRows = [];
    let loaded = 0;

    for (const file of files) {
      try {
        const triggerPath = path.join(triggersRoot, file);
        delete require.cache[require.resolve(triggerPath)];
        const trigger = require(triggerPath);
        if (!trigger?.name || typeof trigger.execute !== "function") {
          statusRows.push({ file, status: "Skipped non-trigger module" });
          continue;
        }

        const eventName = normalizeEventName(trigger.name);
        const handler = (...args) => trigger.execute(...args, client);
        const bind = trigger.once
          ? client.once.bind(client)
          : client.on.bind(client);
        bind(eventName, handler);

        trackBoundHandler(client, "_triggerHandlers", eventName, handler);
        statusRows.push({
          file,
          status:
            eventName === trigger.name ? "Loaded" : `Loaded as ${eventName}`,
        });
        loaded += 1;
      } catch (err) {
        statusRows.push({ file, status: "Error loading" });
        global.logger.error(
          `[Bot Test][TRIGGERS] Failed to load ${file}:`,
          err,
        );
      }
    }

    for (const row of statusRows.sort((a, b) => a.file.localeCompare(b.file))) {
      global.logger.info(`[Bot Test][TRIGGERS] ${row.status} ${row.file}`);
    }
    global.logger.info(`[Bot Test][TRIGGERS] Loaded ${loaded} trigger(s).`);
  };
};
