const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const fs = require("fs");
const path = require("path");
const ascii = require("ascii-table");
const IDs = require("../Utils/Config/ids");
const{isCommandDeployRequired,markCommandDeployComplete,}=require("../../shared/runtime/commandDeployCache");

const BOT_DEPLOY_CACHE_KEY = "official";

function shouldForceSlashDeploy() {
  const value = String(process.env.FORCE_SLASH_DEPLOY || process.env.FORCE_COMMAND_DEPLOY || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

module.exports = (client) => {
  client.handleCommands = async (commandFolders, basePath) => {
    const statusMap = new Map();
    client.commandArray = [];
    client.commands.clear();

    const parseCommandMeta=(command) => {const commandJson=typeof command?.data?.toJSON==="function"?command.data.toJSON():null;const name=command?.data?.name||commandJson?.name||command?.name||null;const type=command?.data?.type??commandJson?.type??1;return{name,type,json:commandJson};};for(const folder of commandFolders){const folderPath = path.join(basePath, folder);
      if (!fs.existsSync(folderPath)) continue;
      const commandFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const key = `${folder}/${file}`;
        try {
          delete require.cache[require.resolve(filePath)];
          const command = require(filePath);
          const meta = parseCommandMeta(command);
          if (!meta.name) {
            global.logger.error(`[COMMANDS] Invalid command file ${file}`);
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
        } catch (err) {
          global.logger.error(`[COMMANDS] Failed to load ${file}:`, err);
          statusMap.set(key, "Error loading");
        }
      }
    }

    const table = new ascii().setHeading("Folder", "File", "Status");
    for (const [key, status] of Array.from(statusMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const [folder, file] = key.split("/");
      table.addRow(folder, file, status);
    }

    global.logger.info(table.toString());
    global.logger.info(
      `[COMMANDS] Loaded ${client.commands.size} SlashCommands.`,
    );

    const token=process.env.DISCORD_TOKEN||process.env.DISCORD_TOKEN_OFFICIAL||client?.config?.token;
    const clientId=process.env.DISCORD_CLIENT_ID||process.env.DISCORD_CLIENT_ID_OFFICIAL||IDs.bots.ViniliCaffeBot;
    const isPrimary = !client.shard || client.shard.ids?.[0] === 0;
    if (!isPrimary) {
      global.logger.info(`[COMMANDS] Deploy slash eseguito solo sul primary shard, skip su questo processo.`);
      return;
    }
    const deployCheck=isCommandDeployRequired(BOT_DEPLOY_CACHE_KEY,{clientId},client.commandArray,);
    const forceDeploy = shouldForceSlashDeploy();
    if (!deployCheck.required && !forceDeploy) {
      global.logger.info(`[COMMANDS] Nessuna modifica ai comandi globali, deploy REST saltato. scope=${deployCheck.scopeKey} hash=${deployCheck.hash}`);
      return;
    }
    global.logger.info(`[COMMANDS] Deploy slash richiesto. scope=${deployCheck.scopeKey} prev=${deployCheck.previousHash || "none"} next=${deployCheck.hash}${forceDeploy ? " force=true" : ""}`);

    const rest = new REST({ version: "10" }).setToken(token);

    try {
      const me = await rest.get(Routes.currentApplication());
      const tokenAppId = me?.id || null;
      if (tokenAppId && String(tokenAppId) !== String(clientId)) {
        global.logger.warn(
          `[COMMANDS] Token appartiene all'app ${tokenAppId}, ma in codice usi clientId ${clientId}. Imposta DISCORD_CLIENT_ID uguale all'Application ID dell'app del token.`,
        );
      }
    } catch (e) {
      global.logger.warn(
        "[COMMANDS] Impossibile verificare app del token:",
        e?.message || e,
      );
    }

    try {
      client.logs.info("[FUNCTION] Refreshing application (/) commands...");
      await rest.put(Routes.applicationCommands(clientId), {
        body: client.commandArray,
      });
      markCommandDeployComplete(
        BOT_DEPLOY_CACHE_KEY,
        { clientId },
        deployCheck.hash,
      );
      client.logs.success(
        "[FUNCTION] Successfully reloaded application (/) commands.",
      );
    } catch (error) {
      global.logger.error("[COMMANDS] Failed to deploy commands:", error);
      if (error?.code === 20012 || error?.status === 403) {
        global.logger.error(
          '[COMMANDS] 20012/403: Se token e ID sono giusti, controlla su Developer Portal che l\'app NON sia in un Team, oppure che il tuo account abbia permesso "Admin" sul Team. Le app in Team possono registrare comandi solo da chi ha i permessi sul Team.',
        );
      }
      client.logs.error("[FUNCTION] Error loading slash commands.");
    }
  };
};