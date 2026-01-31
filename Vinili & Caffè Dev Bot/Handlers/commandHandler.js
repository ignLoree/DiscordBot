const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const fs = require("fs");
const path = require("path");
const ascii = require("ascii-table");
const config = require("../config.json");
const isDev = __dirname.toLowerCase().includes("dev bot");
const envToken = isDev ? process.env.DISCORD_TOKEN_DEV : process.env.DISCORD_TOKEN_OFFICIAL;

function getBotRoots() {
    const cwd = process.cwd();
    const base = path.dirname(cwd);
    const isOfficial = cwd.toLowerCase().includes("ufficiale");
    const isDev = cwd.toLowerCase().includes("dev bot");
    const official = isOfficial ? cwd : path.join(base, "Vinili & Caffè Bot Ufficiale");
    const dev = isDev ? cwd : path.join(base, "Vinili & Caffè Dev Bot");
    return { official, dev, isOfficial };
}

function listCommandFiles(root) {
    const out = new Map();
    const commandsRoot = path.join(root, "Commands");
    if (!fs.existsSync(commandsRoot)) return out;
    const folders = fs.readdirSync(commandsRoot).filter((f) => {
        const full = path.join(commandsRoot, f);
        return fs.statSync(full).isDirectory();
    });
    for (const folder of folders) {
        const folderPath = path.join(commandsRoot, folder);
        const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".js"));
        out.set(folder, new Set(files));
    }
    return out;
}

function shouldLogOnce(tag) {
    const lockPath = path.join(path.dirname(process.cwd()), `.log_${tag}`);
    if (fs.existsSync(lockPath)) return false;
    try {
        fs.writeFileSync(lockPath, `${new Date().toISOString()}\n`, 'utf8');
    } catch {
        return true;
    }
    return true;
}

module.exports = (client) => {
    client.handleCommands = async (commandFolders, basePath) => {
        const statusMap = new Map();
        client.commandArray = [];
        const disabledCommands = Array.isArray(config.disabledCommands)
            ? config.disabledCommands
            : [];

        for (const folder of commandFolders) {
            const commandFiles = fs
                .readdirSync(`${basePath}/${folder}`)
                .filter((f) => f.endsWith(".js"));

            for (const file of commandFiles) {
                const filePath = `../Commands/${folder}/${file}`;
                const key = `${folder}/${file}`;
                try {
                    const command = require(filePath);
                    if (!command?.data?.name) {
                        global.logger.error(`[COMMANDS] Invalid command file ${file}`);
                        statusMap.set(key, "Invalid");
                        continue;
                    }

                    if (typeof command.staffOnly === "undefined") {
                        const folderName = folder.toLowerCase();
                        command.staffOnly = folderName === "staff" || folderName === "moderation";
                    }
                    if (typeof command.adminOnly === "undefined") {
                        command.adminOnly = folder.toLowerCase() === "admin";
                    }
                    if (typeof command.partnerManagerOnly === "undefined") {
                        command.partnerManagerOnly = folder.toLowerCase() === "partnermanager";
                    }
                    if (typeof command.category === "undefined") {
                        command.category = folder;
                    }

                    const commandType = command.data?.type ?? 1;
                    client.commands.set(`${command.data.name}:${commandType}`, command);

                    const isDisabled = disabledCommands.includes(command.data.name);
                    if (isDisabled) {
                        statusMap.set(key, "Disabilitato");
                    }

                    if (command.skipDeploy) {
                        if (!isDisabled) {
                            statusMap.set(key, "Skipped");
                        }
                        continue;
                    }

                    client.commandArray.push(command.data.toJSON());
                    if (!isDisabled) {
                        statusMap.set(key, "Loaded");
                    }
                } catch (err) {
                    global.logger.error(`[COMMANDS] Failed to load ${file}:`, err);
                    statusMap.set(key, "Error loading");
                }
            }
        }

        const roots = getBotRoots();
        const officialMap = listCommandFiles(roots.official);
        const devMap = listCommandFiles(roots.dev);
        const allFolders = new Set([...officialMap.keys(), ...devMap.keys()]);

        const unified = new ascii().setHeading("Folder", "File", "Ufficiale", "Dev");
        const isOfficial = roots.isOfficial;

        for (const folder of Array.from(allFolders).sort()) {
            const uffFiles = officialMap.get(folder) || new Set();
            const devFiles = devMap.get(folder) || new Set();
            const allFiles = new Set([...uffFiles, ...devFiles]);

            for (const file of Array.from(allFiles).sort()) {
                const key = `${folder}/${file}`;
                const currentStatus = statusMap.get(key) || (isOfficial ? (uffFiles.has(file) ? "Present" : "-") : (devFiles.has(file) ? "Present" : "-"));
                const otherStatus = isOfficial ? (devFiles.has(file) ? "Present" : "-") : (uffFiles.has(file) ? "Present" : "-");

                if (isOfficial) {
                    unified.addRow(folder, file, currentStatus, otherStatus);
                } else {
                    unified.addRow(folder, file, otherStatus, currentStatus);
                }
            }
        }

        if (shouldLogOnce('commands')) {
            global.logger.info(unified.toString());
            global.logger.info(`[COMMANDS] Loaded ${client.commands.size} SlashCommands.`);
        }

        const rest = new REST({ version: "9" }).setToken(envToken || config.token);

        try {
            client.logs.info(`[FUNCTION] Refreshing application (/) commands...`);
            await rest.put(
                Routes.applicationCommands(config.clientid),
                { body: client.commandArray }
            );
            client.logs.success(`[FUNCTION] Successfully reloaded application (/) commands.`);
        } catch (error) {
            global.logger.error("[COMMANDS] Failed to deploy commands:", error);
            client.logs.error("[FUNCTION] Error loading slash commands.");
        }
    };
};
