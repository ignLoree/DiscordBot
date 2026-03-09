const path = require("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime");

const IDS_SUBFOLDER = path.sep + "ids" + path.sep;

/** File che non sono handler (aggregatori, librerie componenti): da non caricare come button handler. */
function isNonHandlerFile(relativeKey) {
  if (relativeKey === "index.js") return true;
  const sep = path.sep;
  if (relativeKey === "topChannel" + sep + "components.js" || relativeKey.endsWith(sep + "components.js")) return true;
  return false;
}

module.exports = (client) => {
  client.buttonHandlers = client.buttonHandlers || [];

  client.loadButtonHandlers = async (basePath) => {
    const dir = basePath || path.resolve(__dirname, "..", "Buttons");
    const allPaths = listJsFilesRecursive(dir)
      .filter((fullPath) => !fullPath.includes(IDS_SUBFOLDER))
      .filter((fullPath) => !isNonHandlerFile(path.relative(dir, fullPath)));
    const loaded = [];

    for (const fullPath of allPaths) {
      const key = path.relative(dir, fullPath);
      try {
        delete require.cache[require.resolve(fullPath)];
        const mod = require(fullPath);
        if (!mod || typeof mod.match !== "function" || typeof mod.execute !== "function") {
          global.logger?.warn?.(`[BUTTON_HANDLERS] ${key}: missing match/execute, skipped.`);
          continue;
        }
        const name = mod.name || path.basename(fullPath, ".js");
        loaded.push({
          name,
          order: typeof mod.order === "number" ? mod.order : 100,
          match: mod.match,
          execute: mod.execute,
        });
      } catch (err) {
        global.logger?.error?.(`[BUTTON_HANDLERS] Failed to load ${key}:`, err);
      }
    }

    loaded.sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
    client.buttonHandlers = loaded;
    global.logger?.info?.(`[BUTTON_HANDLERS] Loaded ${client.buttonHandlers.length} button handlers.`);
    return client.buttonHandlers;
  };
};