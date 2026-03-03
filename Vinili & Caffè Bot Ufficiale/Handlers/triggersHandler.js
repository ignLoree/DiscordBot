const ascii = require("ascii-table");
const path = require("path");
const { READY_EVENT_ALIAS, clearBoundHandlers, listRelativeJsFiles, normalizeLifecycleEventName, trackBoundHandler, } = require("../../shared/runtime/loaderRuntime");

module.exports = (client) => {
  if (!client._triggerHandlers) client._triggerHandlers = new Map();

  client.handleTriggers = async (basePath) => {
    clearBoundHandlers(client, "_triggerHandlers");

    const root = basePath || process.cwd();
    const triggersRoot = path.join(root, "Triggers");
    const files = listRelativeJsFiles(triggersRoot);
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

        const eventName = normalizeLifecycleEventName(trigger.name);
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
        statusMap.set(rel, eventName === trigger.name ? "Loaded" : `Loaded as ${eventName}`);
        loaded += 1;
      } catch (err) {
        statusMap.set(rel, "Error loading");
        global.logger.error(`[TRIGGERS] Failed to load ${rel}:`, err);
      }
    }

    const table = new ascii().setHeading("Folder", "File", "Status");
    for (const [rel, status] of Array.from(statusMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const folder = path.dirname(rel).replace(/\\/g, "/");
      const file = path.basename(rel);
      const folderLabel = folder === "." ? "Triggers" : `Triggers/${folder}`;
      table.addRow(folderLabel, file, status);
    }

    global.logger.info(table.toString());
    global.logger.info(`[TRIGGERS] Loaded ${loaded} triggers.`);
  };
};
