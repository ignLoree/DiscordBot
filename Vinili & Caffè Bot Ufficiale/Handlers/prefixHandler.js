const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");
const config = require("../config.json");

function getBotRoots() {
    const cwd = process.cwd();
    const base = path.dirname(cwd);
    const isOfficial = cwd.toLowerCase().includes("ufficiale");
    const isDev = cwd.toLowerCase().includes("dev bot");
    const official = isOfficial ? cwd : path.join(base, "Vinili & Caffè Bot Ufficiale");
    const dev = isDev ? cwd : path.join(base, "Vinili & Caffè Dev Bot");
    return { official, dev, isOfficial };
}

function listPrefixFiles(root) {
    const out = new Map();
    const prefixRoot = path.join(root, "Prefix");
    if (!fs.existsSync(prefixRoot)) return out;
    const folders = fs.readdirSync(prefixRoot).filter((f) => {
        const full = path.join(prefixRoot, f);
        return fs.statSync(full).isDirectory();
    });
    for (const folder of folders) {
        const folderPath = path.join(prefixRoot, folder);
        const files = fs.readdirSync(folderPath).filter((f) => f.endsWith(".js"));
        out.set(folder, new Set(files));
    }
    return out;
}

function shouldLogOnce(tag) {
    return !isDev;
}

module.exports = (client) => {
    client.prefixCommands = async (folders) => {
        const disabledPrefixCommands = Array.isArray(config.disabledPrefixCommands)
            ? config.disabledPrefixCommands
            : [];
        const statusMap = new Map();
        for (const folder of folders) {
            const folderPath = `./Prefix/${folder}`;
            const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".js"));
            for (const file of files) {
                const filePath = `../Prefix/${folder}/${file}`;
                const key = `${folder}/${file}`;
                delete require.cache[require.resolve(filePath)];
                const command = require(filePath);
                if (!command || !command.name) {
                    statusMap.set(key, "Missing name");
                    continue;
                }
                if (command.skipLoad || command.skipPrefix) {
                    statusMap.set(key, "Skipped");
                    continue;
                }
                command.folder = command.folder || folder;
                if (typeof command.staffOnly === 'undefined') {
                    const folderName = String(folder).toLowerCase();
                    command.staffOnly = folderName === 'staff' || folderName === 'moderation';
                }
                if (typeof command.adminOnly === 'undefined') {
                    command.adminOnly = String(folder).toLowerCase() === 'admin';
                }
                if (String(folder).toLowerCase() === 'moderation') {
                    command.prefixOverride = '?';
                }
                client.pcommands.set(command.name, command);
                if (disabledPrefixCommands.includes(command.name)) {
                    statusMap.set(key, "Disabilitato");
                } else {
                    statusMap.set(key, "Loaded");
                }
                if (Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        client.aliases.set(alias, command.name);
                    }
                }
            }
        }

        const roots = getBotRoots();
        const officialMap = listPrefixFiles(roots.official);
        const devMap = listPrefixFiles(roots.dev);
        const allFolders = new Set([...officialMap.keys(), ...devMap.keys()]);
        const unified = new ascii().setHeading("Folder", "File", "Ufficiale", "Dev");
        const isOfficial = roots.isOfficial;

        for (const folder of Array.from(allFolders).sort()) {
            const uffFiles = officialMap.get(folder) || new Set();
            const devFiles = devMap.get(folder) || new Set();
            const allFiles = new Set([...uffFiles, ...devFiles]);
            for (const file of Array.from(allFiles).sort()) {
                const key = `${folder}/${file}`;
                const currentStatus = statusMap.get(key) || (isOfficial ? (uffFiles.has(file) ? "Loaded" : "-") : (devFiles.has(file) ? "Loaded" : "-"));
                const otherStatus = isOfficial ? (devFiles.has(file) ? "Loaded" : "-") : (uffFiles.has(file) ? "Loaded" : "-");
                if (isOfficial) {
                    unified.addRow(folder, file, currentStatus, otherStatus);
                } else {
                    unified.addRow(folder, file, otherStatus, currentStatus);
                }
            }
        }

        if (shouldLogOnce('prefix')) {
            global.logger.info(unified.toString());
            global.logger.info(`[PREFIX_COMMANDS] Loaded ${client.pcommands.size} PrefixCommands.`);
        }
        try {
            client.logs.success(`[FUNCTION] Successfully reloaded prefix commands.`);
        } catch (error) {
            global.logger.error(error);
        }
    };
};
