const path = require("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime");
const EMBEDS_DIR = __dirname;
const SECTION_MENU = "menu";
const SECTION_EMBED_WITH_BUTTONS = "embedWithButtons";
const SECTION_EMBED_ONLY = "embedOnly";
/** @type {{ name: string, order: number, section: string, run: (client: import("discord.js").Client) => Promise<void> }[]} */
let panels = [];
const byName = {};

function loadPanels() {
  panels = [];
  Object.keys(byName).forEach((k) => delete byName[k]);
  const files = listJsFilesRecursive(EMBEDS_DIR).filter((p) => {
    const rel = path.relative(EMBEDS_DIR, p);
    const base = path.basename(rel, ".js");
    return rel !== "index.js" && rel.endsWith(".js") && !rel.includes(path.sep) && !base.endsWith("Helpers");
  });
  for (const filePath of files) {
    try {
      delete require.cache[require.resolve(filePath)];
      const mod = require(filePath);
      if (!mod || typeof mod.run !== "function" || !mod.section) {
        global.logger?.warn?.("[EMBEDS] Skip (no run/section):", path.basename(filePath));
        continue;
      }
      const name = mod.name || path.basename(filePath, ".js");
      const order = typeof mod.order === "number" ? mod.order : 50;
      panels.push({ name, order, section: mod.section, run: mod.run });
      byName[name] = mod;
    } catch (err) {
      global.logger?.error?.("[EMBEDS] Failed to load " + path.basename(filePath) + ":", err);
    }
  }
  panels.sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
  return panels;
}

if (panels.length === 0) loadPanels();

/**
 * @param {"menu"|"embedWithButtons"|"embedOnly"} section
 * @returns {{ name: string, run: (client: import("discord.js").Client) => Promise<void> }[]}
 */
function getPanelsBySection(section) {
  if (panels.length === 0) loadPanels();
  return panels.filter((p) => p.section === section).map((p) => ({ name: p.name, run: p.run }));
}

module.exports = { getPanelsBySection, loadPanels, byName, SECTION_MENU, SECTION_EMBED_WITH_BUTTONS, SECTION_EMBED_ONLY };