const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");
const isDev = process.cwd().toLowerCase().includes("dev bot");

function getBotRoots() {
    const cwd = process.cwd();
    const base = path.dirname(cwd);
    const isOfficial = cwd.toLowerCase().includes("ufficiale");
    const isDev = cwd.toLowerCase().includes("dev bot");
    const official = isOfficial ? cwd : path.join(base, "Vinili & Caffè Bot Ufficiale");
    const dev = isDev ? cwd : path.join(base, "Vinili & Caffè Dev Bot");
    return { official, dev, isOfficial };
}

function listEventFiles(root) {
    const out = new Set();
    const eventsRoot = path.join(root, "Events");
    if (!fs.existsSync(eventsRoot)) return out;
    const listJsFiles = (dir) => {
        if (!fs.existsSync(dir)) return [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name.toLowerCase() === 'interaction') continue;
                files.push(...listJsFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(fullPath);
            }
        }
        return files;
    };
    const files = listJsFiles(eventsRoot);
    for (const file of files) {
        const rel = path.relative(eventsRoot, file).replace(/\\/g, '/');
        out.add(rel);
    }
    return out;
}

function shouldLogOnce(tag) {
    return !isDev;
}

module.exports = (client) => {
    if (!client._eventHandlers) client._eventHandlers = new Map();
    const listJsFiles = (dir) => {
        if (!fs.existsSync(dir)) return [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const files = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name.toLowerCase() === 'interaction') continue;
                files.push(...listJsFiles(fullPath));
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(fullPath);
            }
        }
        return files;
    };
    client.handleEvents = async (baseDir) => {
        if (client._eventHandlers && client._eventHandlers.size) {
            for (const [eventName, handlers] of client._eventHandlers.entries()) {
                for (const handler of handlers) {
                    client.removeListener(eventName, handler);
                }
            }
            client._eventHandlers.clear();
        }
        const absBase = path.resolve(baseDir);
        let loaded = 0;
        const statusMap = new Map();
        const eventFiles = listJsFiles(absBase);
        for (const file of eventFiles) {
            const rel = path.relative(absBase, file).replace(/\\/g, '/');
            try {
                const relFromHandlers = path.relative(__dirname, file).replace(/\\/g, '/');
                const event = require(`./${relFromHandlers}`);
                if (!event?.name) {
                    statusMap.set(rel, "Missing name");
                    continue;
                }
                const handler = (...args) => event.execute(...args, client);
                if (event.once) {
                    client.once(event.name, handler);
                } else {
                    client.on(event.name, handler);
                }
                if (!client._eventHandlers.has(event.name)) {
                    client._eventHandlers.set(event.name, []);
                }
                client._eventHandlers.get(event.name).push(handler);
                statusMap.set(rel, "Loaded");
                loaded += 1;
            } catch (err) {
                statusMap.set(rel, "Error loading");
                global.logger.error(`[EVENTS] Failed to load ${rel}:`, err);
            }
        }

        const roots = getBotRoots();
        const uffFiles = listEventFiles(roots.official);
        const devFiles = listEventFiles(roots.dev);
        const allFiles = new Set([...uffFiles, ...devFiles]);
        const unified = new ascii().setHeading("Folder", "File", "Ufficiale", "Dev");
        const isOfficial = roots.isOfficial;

        for (const rel of Array.from(allFiles).sort()) {
            const folder = path.dirname(rel).replace(/\\/g, '/');
            const file = path.basename(rel);
            const folderLabel = folder === "." ? "root" : folder;
            const currentStatus = statusMap.get(rel) || (isOfficial ? (uffFiles.has(rel) ? "Loaded" : "-") : (devFiles.has(rel) ? "Loaded" : "-"));
            const otherStatus = isOfficial ? (devFiles.has(rel) ? "Loaded" : "-") : (uffFiles.has(rel) ? "Loaded" : "-");
            if (isOfficial) {
                unified.addRow(folderLabel, file, currentStatus, otherStatus);
            } else {
                unified.addRow(folderLabel, file, otherStatus, currentStatus);
            }
        }

        if (shouldLogOnce('events')) {
            global.logger.info(unified.toString());
            global.logger.info(`[EVENTS] Loaded ${loaded} events.`);
        }
    };
}
