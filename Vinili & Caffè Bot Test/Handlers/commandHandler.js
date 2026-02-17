const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    client.handleCommands = async (commandFolders = [], basePath) => {
        const commandsPath = basePath || path.join(process.cwd(), 'Commands');
        const statusRows = [];
        client.commands.clear();

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.existsSync(folderPath)) continue;
            const commandFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith('.js'));

            for (const file of commandFiles) {
                const fullPath = path.join(folderPath, file);
                const key = `${folder}/${file}`;
                try {
                    delete require.cache[require.resolve(fullPath)];
                    const command = require(fullPath);
                    const commandName = command?.data?.name || command?.name;
                    if (!commandName) {
                        statusRows.push({ key, status: 'Missing name' });
                        continue;
                    }
                    const commandType = command?.data?.type ?? 1;
                    client.commands.set(`${commandName}:${commandType}`, command);
                    statusRows.push({ key, status: 'Loaded' });
                } catch (err) {
                    statusRows.push({ key, status: 'Error loading' });
                    global.logger.error(`[Bot Test][COMMANDS] Failed to load ${key}:`, err);
                }
            }
        }

        global.logger.info(`[Bot Test][COMMANDS] Loaded ${client.commands.size} command(s).`);
        return statusRows;
    };
};
