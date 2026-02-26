const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");
const IDs = require("../Utils/Config/ids");
const {
  inferGuildIdFromEventArgs,
  isEventExecutionAllowed,
  maybeMirrorEventToRoute,
} = require("../Services/Dashboard/controlCenterService");

const LEGACY_READY_EVENT = "ready";
const READY_EVENT_ALIAS = "clientReady";
const BLOCKED_TEST_GUILD_ID = String(IDs?.guilds?.test || "");

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

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

function findGuildFromArgs(args = [], guildId = "") {
  if (guildId) {
    const direct = args.find(
      (x) => String(x?.id || "") === guildId && x?.channels?.cache,
    );
    if (direct) return direct;

    const byNested = args.find((x) => String(x?.guild?.id || "") === guildId);
    if (byNested?.guild) return byNested.guild;
  }

  for (const arg of args) {
    if (arg?.channels?.cache && arg?.members?.cache && arg?.id) return arg;
    if (arg?.guild?.channels?.cache && arg?.guild?.id) return arg.guild;
  }
  return null;
}

module.exports = (client) => {
  if (!client._eventHandlers) client._eventHandlers = new Map();

  client.handleEvents = async (baseDir) => {
    clearBoundHandlers(client, "_eventHandlers");

    const absBase = path.resolve(baseDir);
    const statusMap = new Map();
    let loaded = 0;

    for (const file of listJsFiles(absBase)) {
      const rel = path.relative(absBase, file).replace(/\\/g, "/");
      try {
        delete require.cache[require.resolve(file)];
        const event = require(file);
        if (!event?.name || typeof event.execute !== "function") {
          statusMap.set(rel, "Skipped (not event)");
          continue;
        }

        const eventName = normalizeEventName(event.name);
        const handler = async (...args) => {
          const guildId = inferGuildIdFromEventArgs(args);
          if (
            BLOCKED_TEST_GUILD_ID &&
            String(guildId || "") === BLOCKED_TEST_GUILD_ID
          ) {
            return;
          }
          const gate = isEventExecutionAllowed({ eventName, guildId });
          await maybeMirrorEventToRoute({
            guild: findGuildFromArgs(args, guildId),
            guildId,
            eventName,
            args,
            allowed: gate.allowed,
          }).catch(() => null);
          if (!gate.allowed) return;

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
    for (const [rel, status] of Array.from(statusMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const folder = path.dirname(rel).replace(/\\/g, "/");
      const file = path.basename(rel);
      const folderLabel = folder === "." ? "Events" : `Events/${folder}`;
      table.addRow(folderLabel, file, status);
    }

    global.logger.info(table.toString());
    global.logger.info(`[EVENTS] Loaded ${loaded} events.`);
  };
};