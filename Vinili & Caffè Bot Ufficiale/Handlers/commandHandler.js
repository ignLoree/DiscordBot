const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const fs = require("fs");
const ascii = require("ascii-table");
const IDs = require("../Utils/Config/ids");

module.exports = (client) => {
  client.handleCommands = async (commandFolders, basePath) => {
    const statusMap = new Map();
    client.commandArray = [];

    const parseCommandMeta = (command) => {
      const commandJson =
        typeof command?.data?.toJSON === "function"
          ? command.data.toJSON()
          : null;
      const name =
        command?.data?.name || commandJson?.name || command?.name || null;
      const type = command?.data?.type ? commandJson?.type ? 1;
      return { name, type, json: commandJson };
    };

    const humanize = (value) =>
      String(value || "")
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const autoSlashDescription = (commandName, folder) => {
      const readable = humanize(commandName);
      const domain = String(folder || "").toLowerCase();
      if (domain === "moderation") return `Comando moderazione: ${readable}.`;
      if (domain === "utility") return `Comando utility: ${readable}.`;
      if (domain === "partner") return `Comando partner: ${readable}.`;
      if (domain === "community") return `Comando community: ${readable}.`;
      return `Comando slash: ${readable}.`;
    };

    const autoSubDescription = (commandName, subPath) => {
      const readableCommand = humanize(commandName);
      const parts = String(subPath || "")
        .toLowerCase()
        .split(".")
        .filter(Boolean);
      const leaf = parts[parts.length - 1] || "";
      const verbDescriptions = {
        add: "Aggiunge un elemento o un valore.",
        remove: "Rimuove un elemento o un valore.",
        list: "Mostra la lista degli elementi disponibili.",
        clear: "Pulisce o resetta i dati della sezione.",
        set: "Imposta un valore specifico.",
        get: "Recupera e mostra i dati richiesti.",
        create: "Crea una nuova configurazione o risorsa.",
        delete: "Elimina una risorsa esistente.",
        edit: "Modifica una configurazione esistente.",
        update: "Aggiorna lo stato o i dati correnti.",
        enable: "Attiva la funzionalita richiesta.",
        disable: "Disattiva la funzionalita richiesta.",
        lock: "Blocca la funzione indicata.",
        unlock: "Sblocca la funzione indicata.",
        claim: "Assegna a te la gestione dell'elemento.",
        unclaim: "Rilascia la gestione dell'elemento.",
        close: "Chiude l'elemento corrente.",
        rename: "Rinomina l'elemento corrente.",
        grant: "Assegna permessi o risorse.",
        revoke: "Revoca permessi o risorse.",
      };
      return (
        verbDescriptions[leaf] ||
        `Gestisce ${humanize(subPath)} per il comando ${readableCommand}.`
      );
    };

    const autoOptionDescription = (optionName) => {
      return `Parametro ${humanize(optionName)}.`;
    };

    const ensureSlashDescriptions = (commandName, folder, json) => {
      if (!json || Number(json.type || 1) !== 1) return json;
      const out = { ...json };
      if (!String(out.description || "").trim()) {
        out.description = autoSlashDescription(commandName, folder);
      }
      const normalizeOptions = (options = [], parentPath = "") =>
        options.map((opt) => {
          if (!opt || typeof opt !== "object") return opt;
          const fixed = { ...opt };
          const optionType = Number(fixed.type || 0);
          const pathKey = parentPath
            ? `${parentPath}.${String(fixed.name || "").trim()}`
            : String(fixed.name || "").trim();

          if (optionType === 1) {
            if (!String(fixed.description || "").trim()) {
              fixed.description = autoSubDescription(commandName, pathKey);
            }
          } else if (optionType === 2) {
            if (!String(fixed.description || "").trim()) {
              fixed.description = `Gruppo ${humanize(fixed.name)} di ${humanize(commandName)}.`;
            }
          } else if (optionType >= 3 && optionType <= 11) {
            if (!String(fixed.description || "").trim()) {
              fixed.description = autoOptionDescription(fixed.name);
            }
          }

          if (Array.isArray(fixed.options) && fixed.options.length) {
            fixed.options = normalizeOptions(fixed.options, pathKey);
          }
          return fixed;
        });

      if (Array.isArray(out.options) && out.options.length) {
        out.options = normalizeOptions(out.options, "");
      }
      return out;
    };

    const autoContextDescription = (commandName, type) => {
      const readable = humanize(commandName);
      if (Number(type) === 2) return `Context menu utente: ${readable}.`;
      if (Number(type) === 3) return `Context menu messaggio: ${readable}.`;
      return `Context menu: ${readable}.`;
    };

    for (const folder of commandFolders) {
      const commandFiles = fs
        .readdirSync(`${basePath}/${folder}`)
        .filter((f) => f.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = `../Commands/${folder}/${file}`;
        const key = `${folder}/${file}`;
        try {
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

          let deployJson = meta.json || command.data.toJSON();
          deployJson = ensureSlashDescriptions(meta.name, folder, deployJson);
          if (
            Number(deployJson?.type || meta.type || 1) === 1 &&
            !String(command.helpDescription || "").trim()
          ) {
            command.helpDescription = String(deployJson.description || "").trim();
          }
          if (
            (Number(deployJson?.type || meta.type || 1) === 2 ||
              Number(deployJson?.type || meta.type || 1) === 3) &&
            !String(command.helpDescription || "").trim()
          ) {
            command.helpDescription = autoContextDescription(
              meta.name,
              Number(deployJson?.type || meta.type || 1),
            );
          }
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

    const token =
      process.env.DISCORD_TOKEN ||
      process.env.DISCORD_TOKEN_OFFICIAL ||
      client?.config?.token;
    const clientId =
      process.env.DISCORD_CLIENT_ID ||
      process.env.DISCORD_CLIENT_ID_OFFICIAL ||
      IDs.bots.ViniliCaffeBot;
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
