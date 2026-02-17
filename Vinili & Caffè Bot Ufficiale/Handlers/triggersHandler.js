const ascii = require('ascii-table');
const fs = require('fs');
const path = require('path');

function listTriggerFiles(root) {
    const triggersRoot = path.join(root, 'Triggers');
    if (!fs.existsSync(triggersRoot)) return [];
    return fs.readdirSync(triggersRoot).filter((f) => f.endsWith('.js'));
}

module.exports = (client) => {
    if (!client._triggerHandlers) client._triggerHandlers = new Map();

    client.handleTriggers = async (triggerFilesArg, basePath) => {
        if (client._triggerHandlers && client._triggerHandlers.size) {
            for (const [eventName, handlers] of client._triggerHandlers.entries()) {
                for (const handler of handlers) client.removeListener(eventName, handler);
            }
            client._triggerHandlers.clear();
        }

        const root = basePath || process.cwd();
        const files = listTriggerFiles(root);
        const statusMap = new Map();
        let loaded = 0;
        const triggersRoot = path.join(root, 'Triggers');

        for (const file of files) {
            try {
                const triggerPath = path.join(triggersRoot, file);
                delete require.cache[require.resolve(triggerPath)];
                const trigger = require(triggerPath);
                if (!trigger?.name) {
                    statusMap.set(file, 'Missing name');
                    continue;
                }

                const eventName = trigger.name === 'ready' ? 'clientReady' : trigger.name;
                const handler = (...args) => trigger.execute(...args, client);
                if (trigger.once) {
                    if (eventName === 'clientReady' && client.isReady()) {
                        Promise.resolve(handler(client)).catch((err) => {
                            global.logger.error(`[TRIGGERS] Failed to run ${file} on hot-reload:`, err);
                        });
                    } else {
                        client.once(eventName, handler);
                    }
                } else {
                    client.on(eventName, handler);
                }

                if (!client._triggerHandlers.has(eventName)) client._triggerHandlers.set(eventName, []);
                client._triggerHandlers.get(eventName).push(handler);

                statusMap.set(file, eventName === trigger.name ? 'Loaded' : `Loaded as ${eventName}`);
                loaded += 1;
            } catch (err) {
                statusMap.set(file, 'Error loading');
                global.logger.error(`[TRIGGERS] Failed to load ${file}:`, err);
            }
        }

        const table = new ascii().setHeading('Folder', 'File', 'Status');
        for (const [file, status] of Array.from(statusMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
            table.addRow('root', file, status);
        }

        global.logger.info(table.toString());
        global.logger.info(`[TRIGGERS] Loaded ${loaded} triggers.`);
    };
};
