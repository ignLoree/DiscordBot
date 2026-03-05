const path = require("path");
const ascii = require("ascii-table");
const { listJsFilesRecursive } = require("./fsRuntime");

function logBootTable(categories = [], baseDir = process.cwd()) {
  const safeCategories = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const table = new ascii().setHeading("Folder", "File", "Status");

  for (const category of safeCategories) {
    const absBase = path.resolve(baseDir, category);
    const files = listJsFilesRecursive(absBase).map((file) => path.relative(absBase, file).replace(/\\/g, "/"));
    for (const rel of files) {
      const folder = path.dirname(rel).replace(/\\/g, "/");
      const file = path.basename(rel);
      const folderLabel = folder === "." ? category : `${category}/${folder}`;
      table.addRow(folderLabel, file, "Loaded");
    }
  }

  global.logger.info(table.toString());
}

module.exports = { logBootTable };