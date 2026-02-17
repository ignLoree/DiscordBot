const fs = require('fs');
const path = require('path');

function listTriggerFiles(root) {
    const triggersRoot = path.join(root, 'Triggers');
    if (!fs.existsSync(triggersRoot)) return [];
    return fs.readdirSync(triggersRoot).filter((f) => f.endsWith('.js'));
}

module.exports = (client) => {
    if (!client._triggerHandlers) client._triggerHandlers = new Map();

    client.handleTriggers = async (_triggerFilesArg, basePath) => {
        if (client._triggerHandlers?.size) {
            for (const [eventName, handlers] of client._triggerHandlers.entries()) {
                for (const handler of handlers) client.removeListener(eventName, handler);
            }
            client._triggerHandlers.clear();
        }

        const root = basePath || process.cwd();
        const files = listTriggerFiles(root);
        const triggersRoot = path.join(root, 'Triggers');
        const statusRows = [];
        let loaded = 0;

        for (const file of files) {
            try {
                const triggerPath = path.join(triggersRoot, file);
                delete require.cache[require.resolve(triggerPath)];
                const trigger = require(triggerPath);
                if (!trigger?.name || typeof trigger.execute !== 'function') {
                    statusRows.push({ file, status: 'Skipped non-trigger module' });
                    continue;
                }

                const eventName = trigger.name === 'ready' ? 'clientReady' : trigger.name;
                const handler = (...args) => trigger.execute(...args, client);
                if (trigger.once) client.once(eventName, handler);
                else client.on(eventName, handler);

                if (!client._triggerHandlers.has(eventName)) client._triggerHandlers.set(eventName, []);
                client._triggerHandlers.get(eventName).push(handler);
                statusRows.push({ file, status: eventName === trigger.name ? 'Loaded' : `Loaded as ${eventName}` });
                loaded += 1;
            } catch (err) {
                statusRows.push({ file, status: 'Error loading' });
                global.logger.error(`[Bot Test][TRIGGERS] Failed to load ${file}:`, err);
            }
        }

        for (const row of statusRows.sort((a, b) => a.file.localeCompare(b.file))) {
            global.logger.info(`[Bot Test][TRIGGERS] ${row.status} ${row.file}`);
        }
        global.logger.info(`[Bot Test][TRIGGERS] Loaded ${loaded} trigger(s).`);
    };
};
