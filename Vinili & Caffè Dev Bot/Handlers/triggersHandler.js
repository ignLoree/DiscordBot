const ascii = require("ascii-table");
const fs = require("fs");
const path = require("path");
const isDev = process.cwd().toLowerCase().includes("dev bot");

function shouldLogOnce() {
    return !isDev;
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

        const unified = new ascii().setHeading("Folder", "File", "Dev");
        for (const file of Array.from(triggerFiles).sort()) {
            const status = statusMap.get(file) || "-";
            unified.addRow("root", file, status);
        }

        if (shouldLogOnce()) {
            global.logger.info(unified.toString());
            global.logger.info(`[TRIGGERS] Loaded ${loaded} triggers.`);
        }
    };
};
