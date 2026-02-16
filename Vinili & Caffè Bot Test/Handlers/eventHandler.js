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

    client.handleEvents = (baseDir) => {
        if (client._eventHandlers?.size) {
            for (const [eventName, handlers] of client._eventHandlers.entries()) {
                for (const handler of handlers) client.removeListener(eventName, handler);
            }
            client._eventHandlers.clear();
        }

        const absBase = path.resolve(baseDir);
        let loaded = 0;

        for (const file of listJsFiles(absBase)) {
            try {
                delete require.cache[require.resolve(file)];
                const event = require(file);
                if (!event?.name) continue;

                const handler = (...args) => event.execute(...args, client);
                if (event.once) client.once(event.name, handler);
                else client.on(event.name, handler);

                if (!client._eventHandlers.has(event.name)) client._eventHandlers.set(event.name, []);
                client._eventHandlers.get(event.name).push(handler);
                loaded++;
            } catch (err) {
                global.logger.error('[EVENTS] Failed to load ' + path.relative(absBase, file), err);
            }
        }

        global.logger.info('[Bot Test] Loaded ' + loaded + ' events.');
    };
};
