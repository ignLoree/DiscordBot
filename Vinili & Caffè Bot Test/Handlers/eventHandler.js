const fs = require("fs");
const path = require("path");

const LEGACY_READY_EVENT = "ready";
const READY_EVENT_ALIAS = "clientReady";

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "interaction") continue;
      files.push(...listJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
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
  if (!client._eventHandlers) client._eventHandlers = new Map();

  client.handleEvents = (baseDir) => {
    clearBoundHandlers(client, "_eventHandlers");

    const absBase = path.resolve(baseDir);
    const statusRows = [];
    let loaded = 0;

    for (const file of listJsFiles(absBase)) {
      const rel = path.relative(absBase, file).replace(/\\/g, "/");
      try {
        delete require.cache[require.resolve(file)];
        const event = require(file);
        if (!event?.name) {
          statusRows.push({ rel, status: "Missing name" });
          continue;
        }

        const eventName = normalizeEventName(event.name);
        const handler = (...args) => event.execute(...args, client);
        const bind = event.once
          ? client.once.bind(client)
          : client.on.bind(client);
        bind(eventName, handler);

        trackBoundHandler(client, "_eventHandlers", eventName, handler);
        loaded += 1;
        statusRows.push({
          rel,
          status:
            eventName === event.name ? "Loaded" : `Loaded as ${eventName}`,
        });
      } catch (err) {
        statusRows.push({ rel, status: "Error loading" });
        global.logger.error("[EVENTS] Failed to load " + rel, err);
      }
    }

    for (const row of statusRows.sort((a, b) => a.rel.localeCompare(b.rel))) {
      global.logger.info(`[Bot Test][EVENTS] ${row.status} ${row.rel}`);
    }
    global.logger.info("[Bot Test] Loaded " + loaded + " events.");
  };
};
