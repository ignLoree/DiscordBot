const ascii = require('ascii-table');
const fs = require('fs');
const path = require('path');

function listJsFiles(dir) {
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
}

module.exports = (client) => {
    if (!client._eventHandlers) client._eventHandlers = new Map();

    client.handleEvents = async (baseDir) => {
        if (client._eventHandlers && client._eventHandlers.size) {
            for (const [eventName, handlers] of client._eventHandlers.entries()) {
                for (const handler of handlers) client.removeListener(eventName, handler);
            }
            client._eventHandlers.clear();
        }

        const absBase = path.resolve(baseDir);
        const statusMap = new Map();
        let loaded = 0;

        for (const file of listJsFiles(absBase)) {
            const rel = path.relative(absBase, file).replace(/\\/g, '/');
            try {
                delete require.cache[require.resolve(file)];
                const event = require(file);
                if (!event?.name) {
                    statusMap.set(rel, 'Missing name');
                    continue;
                }

                const handler = (...args) => event.execute(...args, client);
                if (event.once) client.once(event.name, handler);
                else client.on(event.name, handler);

                if (!client._eventHandlers.has(event.name)) client._eventHandlers.set(event.name, []);
                client._eventHandlers.get(event.name).push(handler);

                statusMap.set(rel, 'Loaded');
                loaded += 1;
            } catch (err) {
                statusMap.set(rel, 'Error loading');
                global.logger.error(`[EVENTS] Failed to load ${rel}:`, err);
            }
        }

        const table = new ascii().setHeading('Folder', 'File', 'Status');
        for (const [rel, status] of Array.from(statusMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
            const folder = path.dirname(rel).replace(/\\/g, '/');
            const file = path.basename(rel);
            table.addRow(folder === '.' ? 'root' : folder, file, status);
        }

        global.logger.info(table.toString());
        global.logger.info(`[EVENTS] Loaded ${loaded} events.`);
    };
};
