const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const fs = require("fs");
const path = require("path");
const IDs = require("../Utils/Config/ids");

function toArrayUnique(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((x) => String(x))));
}

module.exports = (client) => {
  client.handleCommands = async (commandFolders = [], basePath) => {
    client.commandArray = [];
    client.commands.clear();

    for (const folder of commandFolders) {
      const folderPath = path.join(basePath, folder);
      if (!fs.existsSync(folderPath)) continue;
      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((f) => f.endsWith(".js"));

      for (const file of commandFiles) {
        const fullPath = path.join(folderPath, file);
        try {
          delete require.cache[require.resolve(fullPath)];
          const command = require(fullPath);
          const dataJson =
            typeof command?.data?.toJSON === "function"
              ? command.data.toJSON()
              : null;
          const name = command?.data?.name || dataJson?.name || command?.name;
          const type = command?.data?.type ?? dataJson?.type ?? 1;
          if (!name || !dataJson) continue;

          client.commands.set(`${name}:${type}`, command);
          if (!command.skipDeploy) client.commandArray.push(dataJson);
        } catch (error) {
          global.logger?.error?.(
            `[Bot Test][COMMANDS] Failed to load ${folder}/${file}:`,
            error,
          );
        }
      }
    }

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
        global.logger?.error?.(
          `[Bot Test][COMMANDS] Failed to deploy to guild ${guildId}:`,
          error,
        );
      }
    }

    global.logger?.info?.(
      `[Bot Test][COMMANDS] Loaded ${client.commands.size} slash command(s).`,
    );
  };
};