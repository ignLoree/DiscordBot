const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const fs = require("fs");
const path = require("path");
const ascii = require("ascii-table");

module.exports = (client) => {
  client.handleCommands = async (commandFolders = [], basePath) => {
    const commandsPath = basePath || path.join(process.cwd(), "Commands");
    const statusMap = new Map();
    client.commandArray = [];
    client.commands.clear();

    const parseCommandMeta = (command) => {
      const commandJson =
        typeof command?.data?.toJSON === "function"
          ? command.data.toJSON()
          : null;
      const name =
        command?.data?.name || commandJson?.name || command?.name || null;
      const type = command?.data?.type ?? commandJson?.type ?? 1;
      return { name, type, json: commandJson };
    };

    for (const folder of commandFolders) {
      const folderPath = path.join(commandsPath, folder);
      if (!fs.existsSync(folderPath)) continue;
      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const fullPath = path.join(folderPath, file);
        const key = `${folder}/${file}`;
        try {
          delete require.cache[require.resolve(fullPath)];
          const command = require(fullPath);
          const meta = parseCommandMeta(command);

          if (!meta.name) {
            statusMap.set(key, "Missing name");
            continue;
          }

          client.commands.set(`${meta.name}:${meta.type}`, command);

          if (command.skipDeploy) {
            statusMap.set(key, "Skipped");
            continue;
          }

          if (meta.json) {
            client.commandArray.push(meta.json);
          }
          statusMap.set(key, "Loaded");
        } catch (err) {
          statusMap.set(key, "Error loading");
          global.logger.error(`[COMMANDS] Failed to load ${key}:`, err);
        }
      }
    }

    if (statusMap.size > 0) {
      const table = new ascii().setHeading("Folder", "File", "Status");
      for (const [key, status] of Array.from(statusMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      )) {
        const [folder, file] = key.split("/");
        table.addRow(folder, file, status);
      }
      global.logger.info(table.toString());
    }

    global.logger.info(`[COMMANDS] Loaded ${client.commands.size} SlashCommands.`);

    const token =
      process.env.DISCORD_TOKEN ||
      process.env.DISCORD_TOKEN_TEST ||
      client?.config?.token;
    const clientId =
      process.env.DISCORD_CLIENT_ID ||
      process.env.DISCORD_CLIENT_ID_TEST ||
      client?.config?.clientId ||
      null;

    if (!token || !clientId || !client.commandArray.length) {
      global.logger.info(
        "[COMMANDS] Skip slash deploy (missing token/clientId or no slash commands).",
      );
      return;
    }

    const rest = new REST({ version: "10" }).setToken(token);
    try {
      client.logs?.info?.("[FUNCTION] Refreshing application (/) commands...");
      await rest.put(Routes.applicationCommands(clientId), {
        body: client.commandArray,
      });
      client.logs?.success?.(
        "[FUNCTION] Successfully reloaded application (/) commands.",
      );
    } catch (error) {
      global.logger.error("[COMMANDS] Failed to deploy commands:", error);
      client.logs?.error?.("[FUNCTION] Error loading slash commands.");
    }
  };
};
