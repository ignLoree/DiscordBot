const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    client.prefixCommands = async (folders = [], basePath) => {
        const prefixPath = basePath || path.join(process.cwd(), 'Prefix');
        client.pcommands.clear();
        client.aliases.clear();
        const statusRows = [];

        for (const folder of folders) {
            const folderPath = path.join(prefixPath, folder);
            if (!fs.existsSync(folderPath)) continue;
            const commandFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith('.js'));

            for (const file of commandFiles) {
                const fullPath = path.join(folderPath, file);
                const key = `${folder}/${file}`;
                try {
                    delete require.cache[require.resolve(fullPath)];
                    const command = require(fullPath);
                    if (!command?.name) {
                        statusRows.push({ key, status: 'Missing name' });
                        continue;
                    }
                    client.pcommands.set(command.name, command);
                    if (Array.isArray(command.aliases)) {
                        for (const alias of command.aliases) {
                            client.aliases.set(alias, command.name);
                        }
                    }
                    statusRows.push({ key, status: 'Loaded' });
                } catch (err) {
                    statusRows.push({ key, status: 'Error loading' });
                    global.logger.error(`[Bot Test][PREFIX] Failed to load ${key}:`, err);
                }
            }
        }

        global.logger.info(`[Bot Test][PREFIX] Loaded ${client.pcommands.size} prefix command(s).`);
        return statusRows;
    };
};
