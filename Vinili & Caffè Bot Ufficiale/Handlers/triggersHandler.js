const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");

function getBotRoots() {
    const cwd = process.cwd();
    const base = path.dirname(cwd);
    const isOfficial = cwd.toLowerCase().includes("ufficiale");
    const isDev = cwd.toLowerCase().includes("dev bot");
    const official = isOfficial ? cwd : path.join(base, "Vinili & Caffè Bot Ufficiale");
    const dev = isDev ? cwd : path.join(base, "Vinili & Caffè Dev Bot");
    return { official, dev, isOfficial };
}

function listTriggerFiles(root) {
    const triggersRoot = path.join(root, "Triggers");
    if (!fs.existsSync(triggersRoot)) return new Set();
    const files = fs.readdirSync(triggersRoot).filter((f) => f.endsWith(".js"));
    return new Set(files);
}

function shouldLogOnce(tag) {
    const isPrimary = process.cwd().toLowerCase().includes("ufficiale");
    if (!isPrimary) return false;
    const lockPath = path.join(path.dirname(process.cwd()), `.log_${tag}`);
    try {
        if (fs.existsSync(lockPath)) {
            const age = Date.now() - fs.statSync(lockPath).mtimeMs;
            if (age < 30000) return false;
        }
        fs.writeFileSync(lockPath, `${new Date().toISOString()}\n`, 'utf8');
    } catch {
        return true;
    }
    return true;
}

module.exports = (client) => {
    if (!client._triggerHandlers) client._triggerHandlers = new Map();
    client.handleTriggers = async (triggerFiles, pathArg) => {
        if (client._triggerHandlers && client._triggerHandlers.size) {
            for (const [eventName, handlers] of client._triggerHandlers.entries()) {
                for (const handler of handlers) {
                    client.removeListener(eventName, handler);
                }
            }
            client._triggerHandlers.clear();
        }
        const statusMap = new Map();
        let loaded = 0;
        for (const file of triggerFiles) {
            try {
                const trigger = require(`../Triggers/${file}`);
                if (!trigger?.name) {
                    statusMap.set(file, "Missing name");
                    continue;
                }
                const handler = (...args) => trigger.execute(...args, client);
                if (trigger.once) {
                    client.once(trigger.name, handler);
                } else {
                    client.on(trigger.name, handler);
                }
                if (!client._triggerHandlers.has(trigger.name)) {
                    client._triggerHandlers.set(trigger.name, []);
                }
                client._triggerHandlers.get(trigger.name).push(handler);
                statusMap.set(file, "Loaded");
                loaded += 1;
            } catch (err) {
                statusMap.set(file, "Error loading");
                global.logger.error(`[TRIGGERS] Failed to load ${file}:`, err);
            }
        }

        const roots = getBotRoots();
        const uffFiles = listTriggerFiles(roots.official);
        const devFiles = listTriggerFiles(roots.dev);
        const allFiles = new Set([...uffFiles, ...devFiles]);
        const unified = new ascii().setHeading("Folder", "File", "Ufficiale", "Dev");
        const isOfficial = roots.isOfficial;

        for (const file of Array.from(allFiles).sort()) {
            const folderLabel = "root";
            const currentStatus = statusMap.get(file) || (isOfficial ? (uffFiles.has(file) ? "Loaded" : "-") : (devFiles.has(file) ? "Loaded" : "-"));
            const otherStatus = isOfficial ? (devFiles.has(file) ? "Loaded" : "-") : (uffFiles.has(file) ? "Loaded" : "-");
            if (isOfficial) {
                unified.addRow(folderLabel, file, currentStatus, otherStatus);
            } else {
                unified.addRow(folderLabel, file, otherStatus, currentStatus);
            }
        }

        if (shouldLogOnce('triggers')) {
            global.logger.info(unified.toString());
            global.logger.info(`[TRIGGERS] Loaded ${loaded} triggers.`);
        }
    };
}
