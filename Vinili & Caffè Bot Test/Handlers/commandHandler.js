const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  client.handleCommands = async (commandFolders = [], basePath) => {
    const commandsPath = basePath || path.join(process.cwd(), "Commands");
    const statusRows = [];
    client.commands.clear();

    const parseCommandMeta = (command) => {
      const commandJson =
        typeof command?.data?.toJSON === "function"
          ? command.data.toJSON()
          : null;
      const name =
        command?.data?.name || commandJson?.name || command?.name || null;
      const type = command?.data?.type ?? commandJson?.type ?? 1;
      return { name, type };
    };

    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);
      if (!fs.existsSync(folderPath)) continue;
      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((f) => f.endsWith(".js"));

      for (const file of commandFiles) {
        const fullPath = path.join(folderPath, file);
        const key = `${folder}/${file}`;
        try {
          delete require.cache[require.resolve(fullPath)];
          const command = require(fullPath);
          const meta = parseCommandMeta(command);
          if (!meta.name) {
            statusRows.push({ key, status: "Missing name" });
            continue;
          }
          client.commands.set(`${meta.name}:${meta.type}`, command);
          statusRows.push({ key, status: "Loaded" });
        } catch (err) {
          statusRows.push({ key, status: "Error loading" });
          global.logger.error(
            `[Bot Test][COMMANDS] Failed to load ${key}:`,
            err,
          );
        }
      }
    }

    global.logger.info(
      `[Bot Test][COMMANDS] Loaded ${client.commands.size} command(s).`,
    );
    return statusRows;
  };
};
