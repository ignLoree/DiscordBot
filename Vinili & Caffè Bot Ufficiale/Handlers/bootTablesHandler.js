const path = require("path");
const ascii = require("ascii-table");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime");

module.exports = (client) => {
  client.logBootTables = () => {
    const categories = ["Handlers", "Services", "Utils", "Schemas"];
    const table = new ascii().setHeading("Folder", "File", "Status");

    for (const category of categories) {
      const absBase = path.resolve(process.cwd(), category);
      const files=listJsFilesRecursive(absBase).map((file) => path.relative(absBase,file).replace(/\\/g,"/"),);
      for (const rel of files) {
        const folder = path.dirname(rel).replace(/\\/g, "/");
        const file = path.basename(rel);
        const folderLabel = folder === "." ? category : `${category}/${folder}`;
        table.addRow(folderLabel, file, "Loaded");
      }
    }

    global.logger.info(table.toString());
  };
};