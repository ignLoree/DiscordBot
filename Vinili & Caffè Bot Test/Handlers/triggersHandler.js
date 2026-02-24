const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");

const LEGACY_READY_EVENT = "ready";
const READY_EVENT_ALIAS = "clientReady";

function listTriggerFiles(root) {
  const triggersRoot = path.join(root, "Triggers");
  if (!fs.existsSync(triggersRoot)) return [];

  const listJsFiles = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...listJsFiles(fullPath));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(fullPath);
      }
    }
    return files;
  };

  return listJsFiles(triggersRoot).map((fullPath) =>
    path.relative(triggersRoot, fullPath).replace(/\\/g, "/"),
  );
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

    for (const rel of files) {
      try {
        const triggerPath = path.join(triggersRoot, rel);
        delete require.cache[require.resolve(triggerPath)];
        const trigger = require(triggerPath);
        if (!trigger?.name || typeof trigger.execute !== "function") {
          statusMap.set(rel, "Skipped (not trigger)");
          continue;
        }

        const eventName = normalizeEventName(trigger.name);
        const handler = (...args) => trigger.execute(...args, client);

        if (trigger.once) {
          if (eventName === READY_EVENT_ALIAS && client.isReady()) {
            Promise.resolve(handler(client)).catch((err) => {
              global.logger.error(`[TRIGGERS] Failed to run ${rel} on hot-reload:`, err);
            });
          } else {
            client.once(eventName, handler);
          }
        } else {
          client.on(eventName, handler);
        }

        trackBoundHandler(client, "_triggerHandlers", eventName, handler);
        statusMap.set(
          rel,
          eventName === trigger.name ? "Loaded" : `Loaded as ${eventName}`,
        );
        loaded += 1;
      } catch (err) {
        statusMap.set(rel, "Error loading");
        global.logger.error(`[TRIGGERS] Failed to load ${rel}:`, err);
      }
    }

    if (statusMap.size > 0) {
      const table = new ascii().setHeading("Folder", "File", "Status");
      for (const [rel, status] of Array.from(statusMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      )) {
        const folder = path.dirname(rel).replace(/\\/g, "/");
        const file = path.basename(rel);
        const folderLabel = folder === "." ? "Triggers" : `Triggers/${folder}`;
        table.addRow(folderLabel, file, status);
      }
      global.logger.info(table.toString());
    }
    global.logger.info(`[TRIGGERS] Loaded ${loaded} triggers.`);
  };
};
