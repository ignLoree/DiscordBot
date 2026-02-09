const { Client, GatewayIntentBits, EmbedBuilder, Collection, Events, Partials, ActivityType, ChannelType } = require(`discord.js`);
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
global.logger = require('./Utils/Moderation/logger');
const { installEmbedFooterPatch } = require('./Utils/Embeds/defaultFooter');
const Logs = require('discord-logs');
const { ClusterClient } = require('discord-hybrid-sharding');
const functions = fs.readdirSync("./Handlers").filter(file => file.endsWith(".js"));
const triggerFiles = fs.existsSync("./Triggers")
    ? fs.readdirSync("./Triggers").filter((file) => file.endsWith(".js"))
    : [];
const pcommandFolders = fs.existsSync("./Prefix") ? fs.readdirSync('./Prefix') : [];
const commandFolders = fs.existsSync("./Commands") ? fs.readdirSync("./Commands") : [];
const { checkAndInstallPackages } = require('./Utils/Moderation/checkPackages.js')
const child_process = require('child_process');
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
client.config2 = require('./config.js');
client.config = require('./config.json')
const isDev = __dirname.toLowerCase().includes('dev bot');
const envToken = isDev ? process.env.DISCORD_TOKEN_DEV : process.env.DISCORD_TOKEN_OFFICIAL;
if (envToken) client.config.token = envToken;
if (process.env.MONGO_URL) client.config.mongoURL = process.env.MONGO_URL;
const currentTarget = isDev ? 'dev' : 'official';
const currentTargetLabel = isDev ? 'Dev' : 'Ufficiale';
global.botClient = client;
const pullLatest = () => {
    try {
        const repoRoot = path.resolve(process.cwd(), '..');
        if (!fs.existsSync(path.join(repoRoot, '.git'))) return;
        const branch = process.env.GIT_BRANCH || 'main';
        child_process.spawnSync('git', ['pull', 'origin', branch, '--ff-only'], { cwd: repoRoot, stdio: 'inherit' });
        child_process.spawnSync('git', ['submodule', 'update', '--init', '--recursive'], { cwd: repoRoot, stdio: 'inherit' });
    } catch {}
};
const getChannelSafe = async (client, channelId) => {
    if (!channelId) return null;
    return client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
};
const reloadFlagPath = path.resolve(process.cwd(), '..', 'reload_dev.json');
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
    else if (scope === 'utils') clearCacheByDir('Utils');
    else if (scope === 'schemas') clearCacheByDir('Schemas');
    else if (scope === 'handlers') {
        await reloadCommands();
        await reloadPrefix();
        reloadEvents();
        reloadTriggers();
    } else if (scope === 'all') {
        clearCacheByDir('Utils');
        clearCacheByDir('Schemas');
        await reloadCommands();
        await reloadPrefix();
        reloadEvents();
        reloadTriggers();
    }
};

setInterval(async () => {
    if (!fs.existsSync(reloadFlagPath)) return;
    try {
        const payload = JSON.parse(fs.readFileSync(reloadFlagPath, 'utf8'));
        if (payload?.target && payload.target !== currentTarget) return;
        fs.unlinkSync(reloadFlagPath);
        const scope = payload?.scope || 'all';
        if (payload?.gitPull) pullLatest();
        await client.reloadScope(scope);
        client.logs?.success?.(`[RELOAD] ${scope} reloaded.`);
        if (payload?.channelId) {
            const channel = await getChannelSafe(client, payload.channelId);
            if (channel) {
                const elapsedMs = payload?.at ? Date.now() - Date.parse(payload.at) : null;
                const elapsed = Number.isFinite(elapsedMs) ? ` in ${Math.max(1, Math.round(elapsedMs / 1000))}s` : '';
                await channel.send(`<:vegacheckmark:1443666279058772028> Reload ${scope} completato su ${currentTargetLabel}${elapsed}.`);
            }
        }
    } catch (err) {
        global.logger.error('[RELOAD] Failed to process reload flag:', err);
    }
}, 5000);
client.on("clientReady", async (client) => {
    try {
        client.user.setStatus(client.config2.status);
        client.logs.success(`[STATUS] Bot status loaded as ${client.config2.status}.`);
        client.user.setActivity({
            type: ActivityType.Custom,
            name: "irrelevant",
            state: "☕📀 discord.gg/viniliecaffe"
        })
        if (typeof checkAndInstallPackages === 'function') {
            await checkAndInstallPackages(client);
        }
        const restartNotifyPath = path.resolve(process.cwd(), '..', `restart_notify_${currentTarget}.json`);
        if (fs.existsSync(restartNotifyPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(restartNotifyPath, "utf8"));
                const channel = await getChannelSafe(client, data?.channelId);
                if (channel) {
                    const elapsedMs = data?.at ? Date.now() - Date.parse(data.at) : null;
                    const elapsed = Number.isFinite(elapsedMs) ? ` in ${Math.max(1, Math.round(elapsedMs / 1000))}s` : '';
                    await channel.send(`<:vegacheckmark:1443666279058772028> Bot ${currentTargetLabel} riavviato con successo${elapsed}.`);
                }
                fs.unlinkSync(restartNotifyPath);
            } catch (err) {
                global.logger.error("Errore durante il post-restart:", err);
            }
        } else if (fs.existsSync("./restart.json")) {
            try {
                const data = JSON.parse(fs.readFileSync("./restart.json", "utf8"));
                const channel = await getChannelSafe(client, data?.channelID);
                await channel.send("<:vegacheckmark:1443666279058772028> Il bot è stato riavviato con successo!");
                fs.unlinkSync("./restart.json");
            } catch (err) {
                global.logger.error("Errore durante il post-restart:", err);
            }
        }
    } catch (error) {
        const detail = error?.stack || error?.message || error;
        client.logs.error(`[STATUS] Error while loading bot status.`, detail);
        global.logger.error(`[STATUS] Error while loading bot status.`, detail);
    };
});
require('./Handlers/processHandler')();
client.commands = new Collection();
client.pcommands = new Collection();
client.aliases = new Collection();
client.buttons = new Collection();
const shouldUseCluster = Boolean(
    process.env.CLUSTER_MANAGER_MODE ||
    process.env.CLUSTER_ID ||
    process.env.SHARDING_MANAGER ||
    process.send
);
if (shouldUseCluster) {
    client.cluster = new ClusterClient(client);
} else {
    client.cluster = null;
}
(async () => {
    for (file of functions) {
        require(`./Handlers/${file}`)(client);
    }
    client.handleEvents("./Events");
    client.handleTriggers(triggerFiles, "./Triggers");
    await client.handleCommands(commandFolders, "./Commands");
    await client.prefixCommands(pcommandFolders, './Prefix');
    if (!isDev && typeof client.logBootTables === 'function') {
        client.logBootTables();
    }
    client.login(client.config.token).catch((error) => {
        global.logger.error('[LOGIN] Error while logging in. Check if your token is correct or double check your also using the correct intents.', error);
    });
})();

const logCommandUsage = async (client, channelId, serverName, user, userId, content, userAvatarUrl) => {
    if (!channelId) return;
    const channel = await getChannelSafe(client, channelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setAuthor({ name: `${user} ha usato un comando.`, iconURL: client.user.avatarURL({ dynamic: true }) })
        .setTitle(`${client.user.username} Log Comandi`)
        .addFields({ name: 'Nome Server', value: `${serverName}` })
        .addFields({ name: 'Comando', value: `\`\`\`${content}\`\`\`` })
        .addFields({ name: 'Utente', value: `${user} | ${userId}` })
        .setTimestamp()
        .setFooter({ text: `Log Comandi ${client.config2.devBy}`, iconURL: userAvatarUrl });
    await channel.send({ embeds: [embed] });
};


client.on(Events.InteractionCreate, async interaction => {
    if (!interaction) return;
    if (!interaction.isChatInputCommand()) return;
    else {
        try {
            const logChannelId = client.config2.slashCommandLoggingChannel;
            const server = interaction.guild?.name || "DM";
            const user = interaction.user.username;
            const userID = interaction.user.id;
            await logCommandUsage(
                client,
                logChannelId,
                server,
                user,
                userID,
                `${interaction}`,
                interaction.user.avatarURL({ dynamic: true })
            );
        } catch (error) {
            client.logs.error(`[SLASH_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.`);
        }
    };
});
client.on(Events.MessageCreate, async message => {
    if (!message || message.author?.bot) return;
    const content = message.content || '';
    if (!content) return;
    const prefix = client.config2.prefix;
    const musicPrefix = client.config2.musicPrefix || prefix;
    const modPrefix = client.config2.moderationPrefix || '?';
    if (content.startsWith(prefix) || content.startsWith(musicPrefix) || content.startsWith(modPrefix)) {
        try {
            const logChannelId = client.config2.prefixCommandLoggingChannel;
            const server = message.guild?.name || "DM";
            const user = message.author.username;
            const userID = message.author.id;
            await logCommandUsage(
                client,
                logChannelId,
                server,
                user,
                userID,
                content,
                message.author.avatarURL({ dynamic: true })
            );
        } catch (error) {
            client.logs.error(`[PREFIX_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.`);
        }
    };
});

client.on('error', (error) => {
    global.logger.error("[CLIENT ERROR]", error);
});
client.on('shardError', (error) => {
    global.logger.error("[SHARD ERROR]", error);
});
process.on('unhandledRejection', (reason, promise) => {
    global.logger.warn('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on("uncaughtException", (err) => {
    global.logger.error("Uncaught Exception:", err);
});
Logs(client, {
    debug: false
});
