const ascii = require("ascii-table");
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
    const statusMap = new Map();
    let loaded = 0;

    for (const file of files) {
      try {
        const triggerPath = path.join(triggersRoot, file);
        delete require.cache[require.resolve(triggerPath)];
        const trigger = require(triggerPath);
        if (!trigger?.name) {
          statusMap.set(file, "Missing name");
          continue;
        }

        const eventName = normalizeEventName(trigger.name);
        const handler = (...args) => trigger.execute(...args, client);

        if (trigger.once) {
          if (eventName === READY_EVENT_ALIAS && client.isReady()) {
            Promise.resolve(handler(client)).catch((err) => {
              global.logger.error(
                `[TRIGGERS] Failed to run ${file} on hot-reload:`,
                err,
              );
            });
          } else {
            client.once(eventName, handler);
          }
        } else {
          client.on(eventName, handler);
        }

        trackBoundHandler(client, "_triggerHandlers", eventName, handler);
        statusMap.set(
          file,
          eventName === trigger.name ? "Loaded" : `Loaded as ${eventName}`,
        );
        loaded += 1;
      } catch (err) {
        statusMap.set(file, "Error loading");
        global.logger.error(`[TRIGGERS] Failed to load ${file}:`, err);
      }
    }

    const table = new ascii().setHeading("Folder", "File", "Status");
    for (const [file, status] of Array.from(statusMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      table.addRow("root", file, status);
    }

    global.logger.info(table.toString());
    global.logger.info(`[TRIGGERS] Loaded ${loaded} triggers.`);
  };
};
