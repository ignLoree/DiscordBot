const ascii = require("ascii-table");
const path = require("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime");
const { clearBoundHandlers, normalizeLifecycleEventName, trackBoundHandler } = require("../../shared/runtime/loaderRuntime");

module.exports = (client) => {
  if (!client._eventHandlers) client._eventHandlers = new Map();

  client.handleEvents = async (baseDir) => {
    clearBoundHandlers(client, "_eventHandlers");

    const absBase = path.resolve(baseDir);
    const statusMap = new Map();
    let loaded = 0;

    for (const file of listJsFilesRecursive(absBase)) {
      const rel = path.relative(absBase, file).replace(/\\/g, "/");
      try {
        delete require.cache[require.resolve(file)];
        const event = require(file);
        if (!event?.name || typeof event.execute !== "function") {
          statusMap.set(rel, "Skipped (not event)");
          continue;
        }

        const eventName = normalizeLifecycleEventName(event.name);
        const handler = async (...args) => {
          return Promise.resolve(event.execute(...args, client)).catch((err) => {
            global.logger?.error?.(`[EVENT ${eventName}]`, err);
          });
        };

        const bind = event.once ? client.once.bind(client) : client.on.bind(client);
        bind(eventName, handler);

        trackBoundHandler(client, "_eventHandlers", eventName, handler);

        statusMap.set(
          rel,
          eventName === event.name ? "Loaded" : `Loaded as ${eventName}`,
        );
        loaded += 1;
      } catch (err) {
        statusMap.set(rel, "Error loading");
        global.logger.error(`[EVENTS] Failed to load ${rel}:`, err);
      }
    }

    const table = new ascii().setHeading("Folder", "File", "Status");
    const maxFolder = 18;
    const maxFile = 32;
    const maxStatus = 18;
    for (const [rel, status] of Array.from(statusMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const folder = path.dirname(rel).replace(/\\/g, "/");
      const file = path.basename(rel);
      let folderLabel = folder === "." ? "Events" : `Events/${folder}`;
      if (folderLabel.length > maxFolder) folderLabel = folderLabel.slice(0, maxFolder - 1) + "…";
      const fileShort = file.length > maxFile ? file.slice(0, maxFile - 1) + "…" : file;
      const statusShort = status.length > maxStatus ? status.slice(0, maxStatus - 1) + "…" : status;
      table.addRow(folderLabel, fileShort, statusShort);
    }

    const tableStr = table.toString();
    tableStr.split("\n").forEach((line) => global.logger.info(line));
    global.logger.info(`[EVENTS] Loaded ${loaded} events.`);
  };
};