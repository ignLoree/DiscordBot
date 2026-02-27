const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const fs = require("fs");
const path = require("path");
const ascii = require("ascii-table");
const IDs = require("../Utils/Config/ids");

function toArrayUnique(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((x) => String(x))));
}

module.exports = (client) => {
  client.handleCommands = async (commandFolders = [], basePath) => {
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
      const folderPath = path.join(basePath, folder);
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
            statusMap.set(key, "Invalid");
            continue;
          }

          if (typeof command.category === "undefined") {
            command.category = folder;
          }
          if (!String(command.helpDescription || "").trim()) {
            command.helpDescription = String(command.description || "").trim();
          }

          client.commands.set(`${meta.name}:${meta.type}`, command);

          if (command.skipDeploy) {
            statusMap.set(key, "Skipped");
            continue;
          }

          const deployJson = meta.json || command.data.toJSON();
          command._helpDataJson = deployJson;
          client.commandArray.push(deployJson);
          statusMap.set(key, "Loaded");
        } catch (error) {
          statusMap.set(key, "Error loading");
          global.logger?.error?.(
            `[Bot Test][COMMANDS] Failed to load ${key}:`,
            error,
          );
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
      global.logger?.info?.(table.toString());
    }
    global.logger?.info?.(
      `[Bot Test][COMMANDS] Loaded ${client.commands.size} slash command(s).`,
    );

    const token = process.env.DISCORD_TOKEN_TEST || client?.config?.token;
    let clientId =
      process.env.DISCORD_CLIENT_ID_TEST ||
      process.env.DISCORD_CLIENT_ID ||
      null;
    if (!token) return;

    const rest = new REST({ version: "10" }).setToken(token);
    if (!clientId) {
      try {
        const app = await rest.get(Routes.currentApplication());
        clientId = app?.id || null;
      } catch (error) {
        global.logger?.error?.(
          "[Bot Test][COMMANDS] Unable to resolve application id from token:",
          error,
        );
      }
    }
    if (!clientId) return;

    const allowedGuildIds = toArrayUnique([IDs?.guilds?.main, IDs?.guilds?.test]);
    for (const guildId of allowedGuildIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
          body: client.commandArray,
        });
      } catch (error) {
        if (Number(error?.code) === 50001 || Number(error?.status) === 403) {
          global.logger?.warn?.(
            `[Bot Test][COMMANDS] Skip deploy guild ${guildId}: Missing Access (bot non presente o senza scope applications.commands).`,
          );
          continue;
        }
        global.logger?.error?.(
          `[Bot Test][COMMANDS] Failed to deploy to guild ${guildId}:`,
          error,
        );
      }
    }
  };
};
