const { Client, GatewayIntentBits, Collection, Partials } = require(`discord.js`);
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
global.logger = require('./Utils/Moderation/logger');
const { installEmbedFooterPatch } = require('./Utils/Embeds/defaultFooter');
const Logs = require('discord-logs');
const functions = fs.readdirSync("./Handlers").filter((file) => file.endsWith(".js"));
const triggerFiles = fs.existsSync("./Triggers")
    ? fs.readdirSync("./Triggers").filter((file) => file.endsWith(".js"))
    : [];
const pcommandFolders = fs.existsSync("./Prefix") ? fs.readdirSync('./Prefix') : [];
const commandFolders = fs.existsSync("./Commands") ? fs.readdirSync("./Commands") : [];
let client;

try {
    installEmbedFooterPatch();
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.DirectMessageTyping,
            GatewayIntentBits.GuildEmojisAndStickers,
            GatewayIntentBits.GuildScheduledEvents,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildIntegrations,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildModeration,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.DirectMessageReactions,
            GatewayIntentBits.GuildBans,
            GatewayIntentBits.GuildInvites,
            GatewayIntentBits.GuildMessageTyping,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildWebhooks,
            GatewayIntentBits.AutoModerationExecution,
            GatewayIntentBits.AutoModerationConfiguration
        ], partials: [
            Partials.Message,
            Partials.Channel,
            Partials.Reaction,
            Partials.User,
            Partials.GuildMember,
            Partials.GuildScheduledEvent,
            Partials.ThreadMember
        ]
    })
} catch (error) {
    global.logger.error('[ERROR] Error while creating the client.', error);
};
client.logs = require('./Utils/Moderation/logs');
client.config = require('./config.json');
const envToken = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
const envMongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
client.config.token = envToken || client.config.token;
client.config.mongoURL = envMongoUrl || client.config.mongoURL;
global.botClient = client;
client.reloadScope = async (scope) => {
    const baseDir = process.cwd();
    const clearCacheByDir = (dirName) => {
        const abs = path.join(baseDir, dirName);
        if (!fs.existsSync(abs)) return;
        for (const key of Object.keys(require.cache)) {
            if (key.startsWith(abs)) {
                delete require.cache[key];
            }
        }
    };
    const reloadCommands = async () => {
        clearCacheByDir('Commands');
        const commandFolders = fs.readdirSync(path.join(baseDir, 'Commands'));
        await client.handleCommands(commandFolders, './Commands');
    };
    const reloadPrefix = async () => {
        clearCacheByDir('Prefix');
        const folders = fs.readdirSync(path.join(baseDir, 'Prefix'));
        await client.prefixCommands(folders, './Prefix');
    };
    const reloadEvents = () => {
        clearCacheByDir('Events');
        client.handleEvents('./Events');
    };
    const reloadTriggers = () => {
        clearCacheByDir('Triggers');
        const triggerFiles = fs.readdirSync(path.join(baseDir, 'Triggers')).filter((f) => f.endsWith('.js'));
        client.handleTriggers(triggerFiles, './Triggers');
    };
    if (scope === 'commands') await reloadCommands();
    else if (scope === 'prefix') await reloadPrefix();
    else if (scope === 'events') reloadEvents();
    else if (scope === 'triggers') reloadTriggers();
    else if (scope === 'services') clearCacheByDir('Services');
    else if (scope === 'utils') clearCacheByDir('Utils');
    else if (scope === 'schemas') clearCacheByDir('Schemas');
    else if (scope === 'handlers') {
        await reloadCommands();
        await reloadPrefix();
        reloadEvents();
        reloadTriggers();
    } else if (scope === 'all') {
        clearCacheByDir('Services');
        clearCacheByDir('Utils');
        clearCacheByDir('Schemas');
        await reloadCommands();
        await reloadPrefix();
        reloadEvents();
        reloadTriggers();
    }
};

client.commands = new Collection();
client.pcommands = new Collection();
client.aliases = new Collection();
client.buttons = new Collection();
client.snipes = new Map();
(async () => {
    for (const file of functions) {
        require(`./Handlers/${file}`)(client);
    }
    client.handleEvents("./Events");
    client.handleTriggers(triggerFiles, "./Triggers");
    await client.handleCommands(commandFolders, "./Commands");
    await client.prefixCommands(pcommandFolders, './Prefix');
    if (typeof client.logBootTables === 'function') {
        client.logBootTables();
    }
    client.login(client.config.token).catch((error) => {
        global.logger.error('[LOGIN] Error while logging in. Check if your token is correct or double check your also using the correct intents.', error);
    });
})();

Logs(client, {
    debug: false
});