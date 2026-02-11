const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const ascii = require('ascii-table');
const config = require('../config.json');

module.exports = (client) => {
    client.handleCommands = async (commandFolders, basePath) => {
        const statusMap = new Map();
        client.commandArray = [];

        for (const folder of commandFolders) {
            const commandFiles = fs
                .readdirSync(`${basePath}/${folder}`)
                .filter((f) => f.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = `../Commands/${folder}/${file}`;
                const key = `${folder}/${file}`;
                try {
                    const command = require(filePath);
                    if (!command?.data?.name) {
                        global.logger.error(`[COMMANDS] Invalid command file ${file}`);
                        statusMap.set(key, 'Invalid');
                        continue;
                    }

                    if (typeof command.category === 'undefined') {
                        command.category = folder;
                    }

                    const commandType = command.data?.type ?? 1;
                    client.commands.set(`${command.data.name}:${commandType}`, command);

                    if (command.skipDeploy) {
                        statusMap.set(key, 'Skipped');
                        continue;
                    }

                    client.commandArray.push(command.data.toJSON());
                    statusMap.set(key, 'Loaded');
                } catch (err) {
                    global.logger.error(`[COMMANDS] Failed to load ${file}:`, err);
                    statusMap.set(key, 'Error loading');
                }
            }
        }

        const table = new ascii().setHeading('Folder', 'File', 'Status');
        for (const [key, status] of Array.from(statusMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
            const [folder, file] = key.split('/');
            table.addRow(folder, file, status);
        }

        global.logger.info(table.toString());
        global.logger.info(`[COMMANDS] Loaded ${client.commands.size} SlashCommands.`);

        const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || config.token;
        const clientId = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID_OFFICIAL || config.clientid;
        const rest = new REST({ version: '9' }).setToken(token);

        try {
            client.logs.info('[FUNCTION] Refreshing application (/) commands...');
            await rest.put(Routes.applicationCommands(clientId), { body: client.commandArray });
            client.logs.success('[FUNCTION] Successfully reloaded application (/) commands.');
        } catch (error) {
            global.logger.error('[COMMANDS] Failed to deploy commands:', error);
            client.logs.error('[FUNCTION] Error loading slash commands.');
        }
    };
};
