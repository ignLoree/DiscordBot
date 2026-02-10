const { Client, GatewayIntentBits, EmbedBuilder, Collection, Events, Partials, ActivityType, ChannelType } = require(`discord.js`);
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
global.logger = require('./Utils/Moderation/logger');
const { installEmbedFooterPatch } = require('./Utils/Embeds/defaultFooter');
const cron = require("node-cron");
const Logs = require('discord-logs');
const { ClusterClient } = require('discord-hybrid-sharding');
const functions = fs.readdirSync("./Handlers").filter((file) => file.endsWith(".js"));
const triggerFiles = fs.existsSync("./Triggers")
    ? fs.readdirSync("./Triggers").filter((file) => file.endsWith(".js"))
    : [];
const pcommandFolders = fs.existsSync("./Prefix") ? fs.readdirSync('./Prefix') : [];
const commandFolders = fs.existsSync("./Commands") ? fs.readdirSync("./Commands") : [];
const { checkAndInstallPackages } = require('./Utils/Moderation/checkPackages.js')
const reactions = require('./Schemas/ReactionRole/reactionroleSchema.js')
const child_process = require('child_process');
const IDs = require('./Utils/Config/ids');
const POLL_REMINDER_ROLE_ID = '1442568894349840435';
const POLL_REMINDER_CHANNEL_ID = '1442569285909217301';
const STAFF_LIST_MARKER = 'staff list';
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
const isDev = __dirname.toLowerCase().includes('dev bot');
const envToken = isDev
    ? (process.env.DISCORD_TOKEN_DEV || process.env.DISCORD_TOKEN)
    : (process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN);
const envMongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
client.config.token = envToken || client.config.token;
client.config.mongoURL = envMongoUrl || client.config.mongoURL;
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
    } catch { }
};
const getChannelSafe = async (client, channelId) => {
    if (!channelId) return null;
    return client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
};
const reloadFlagPath = path.resolve(process.cwd(), '..', 'reload_dev.json');
const restartWatchDevPath = path.resolve(process.cwd(), '..', 'restart_watch_dev.json');
const restartNotifyDevPath = path.resolve(process.cwd(), '..', 'restart_notify_dev.json');
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

setInterval(async () => {
    if (!fs.existsSync(reloadFlagPath)) return;
    try {
        const payload = JSON.parse(fs.readFileSync(reloadFlagPath, 'utf8'));
        if (payload?.target && payload.target !== currentTarget) return;
        fs.unlinkSync(reloadFlagPath);
        const scope = payload?.scope || 'all';
        if (payload?.gitPull) pullLatest();
        await client.reloadScope(scope);
        client.logs?.success?.(`[RELOAD] ${scope} reloaded (remote).`);
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

setInterval(async () => {
    if (currentTarget !== 'official') return;
    if (!fs.existsSync(restartWatchDevPath)) return;
    if (fs.existsSync(restartNotifyDevPath)) return;
    try {
        const data = JSON.parse(fs.readFileSync(restartWatchDevPath, "utf8"));
        const channel = await getChannelSafe(client, data?.channelId);
        if (channel) {
            const elapsedMs = data?.at ? Date.now() - Date.parse(data.at) : null;
            const elapsed = Number.isFinite(elapsedMs) ? ` in ${Math.max(1, Math.round(elapsedMs / 1000))}s` : '';
            await channel.send(`<:vegacheckmark:1443666279058772028> Bot Dev riavviato con successo${elapsed}.`);
        }
    } catch (err) {
        global.logger.error('[RESTART WATCH] Failed to send dev restart confirmation:', err);
    } finally {
        try { fs.unlinkSync(restartWatchDevPath); } catch {}
    }
}, 5000);

client.on("clientReady", async (client) => {
    try {
        client.user.setStatus(client.config.status);
        client.logs.success(`[STATUS] Bot status loaded as ${client.config.status}.`);
        client.user.setActivity({
            type: ActivityType.Custom,
            name: "irrelevant",
            state: "☕📀 discord.gg/viniliecaffe"
        })
        if (typeof checkAndInstallPackages === 'function' && process.env.CHECK_PACKAGES_ON_READY === '1') {
            Promise.resolve(checkAndInstallPackages(client)).catch((err) => {
                global.logger.error('[PACKAGES] Check failed:', err);
            });
        }
        cron.schedule("0 19 * * *", async () => {
            const guild = client.guilds.cache.get(IDs.guilds.main) || await client.guilds.fetch(IDs.guilds.main).catch(() => null);
            if (!guild) return;
            const channel = guild.channels.cache.get(POLL_REMINDER_CHANNEL_ID)
                || await guild.channels.fetch(POLL_REMINDER_CHANNEL_ID).catch(() => null);
            if (!channel) return;
            await channel.send({
                content: `<:attentionfromvega:1443651874032062505> <@&${POLL_REMINDER_ROLE_ID}> ricordatevi di mettere il poll usando il comando dedicato! </poll create:1467597234387419478>`
            });
        }, {
            timezone: "Europe/Rome"
        });
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
client.commands = new Collection();
client.pcommands = new Collection();
client.aliases = new Collection();
client.buttons = new Collection();
client.snipes = new Map();
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
    for (const file of functions) {
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
        .setFooter({ text: `Log Comandi ${client.config.devBy}`, iconURL: userAvatarUrl });
    await channel.send({ embeds: [embed] });
};

client.on("messageDelete", async message => {
    if (!message) return;
    let msg = message;
    try {
        if (message.partial) {
            msg = await message.fetch();
        }
    } catch {
        msg = message;
    }
    if (!msg.guild) return;
    if (msg.author?.bot) return;
    const channelId = msg.channel?.id || msg.channelId;
    if (!channelId) return;
    client.snipes.set(channelId, {
        content: msg.content || "Nessun contenuto.",
        authorId: msg.author?.id || null,
        authorTag: msg.author?.tag || "Sconosciuto",
        channel: msg.channel?.toString?.() || `<#${channelId}>`,
        attachment: msg.attachments?.first?.()
            ? msg.attachments.first().proxyURL
            : null
    });
});

client.on(Events.ThreadCreate, async thread => {
    try {
        if (!thread?.parent || thread.parent.type !== ChannelType.GuildForum) return;
        const forumRoleId = IDs.roles.forumNotify;
        await thread.send({
            content: `<@&${forumRoleId}>`
        });
    } catch (error) {
        global.logger.error(error);
    }
},
)

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction) return;
    if (!interaction.isChatInputCommand()) return;
    else {
        try {
            const logChannelId = client.config.slashCommandLoggingChannel;
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
        } catch {
            client.logs.error(`[SLASH_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.`);
        }
    };
});

client.on(Events.MessageCreate, async message => {
    if (!message || message.author?.bot) return;
    const content = message.content || '';
    if (!content) return;
    const prefix = client.config.prefix;
    const musicPrefix = client.config.musicPrefix || prefix;
    const modPrefix = client.config.moderationPrefix || '?';
    if (content.startsWith(prefix) || content.startsWith(musicPrefix) || content.startsWith(modPrefix)) {
        try {
            const logChannelId = client.config.prefixCommandLoggingChannel;
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
        } catch {
            client.logs.error(`[PREFIX_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.`);
        }
    };
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
        if (reaction.partial) {
            const fetchedReaction = await reaction.fetch().catch((err) => {
                if (err?.code === 10008 || err?.code === 10062) return null;
                throw err;
            });
            if (!fetchedReaction) return;
        }
        if (reaction.message.partial) {
            const fetchedMessage = await reaction.message.fetch().catch((err) => {
                if (err?.code === 10008 || err?.code === 10062) return null;
                throw err;
            });
            if (!fetchedMessage) return;
        }
        if (!reaction.message.guildId) return;
        if (user.bot) return;
        const animatedPrefix = reaction.emoji.animated ? 'a' : '';
        let cID = `<${animatedPrefix}:${reaction.emoji.name}:${reaction.emoji.id}>`;
        if (!reaction.emoji.id) cID = reaction.emoji.name;
        const data = await reactions.findOne({ Guild: reaction.message.guildId, Message: reaction.message.id, Emoji: cID });
        if (!data) return
        const guild = client.guilds.cache.get(reaction.message.guildId) || await client.guilds.fetch(reaction.message.guildId).catch(() => null);
        if (!guild) return;
        const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;
        await member.roles.add(data.Role);
    } catch (e) {
        if (e?.code === 10008 || e?.code === 10062) return;
        global.logger.error(e)
        return;
    }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
        if (reaction.partial) {
            const fetchedReaction = await reaction.fetch().catch((err) => {
                if (err?.code === 10008 || err?.code === 10062) return null;
                throw err;
            });
            if (!fetchedReaction) return;
        }
        if (reaction.message.partial) {
            const fetchedMessage = await reaction.message.fetch().catch((err) => {
                if (err?.code === 10008 || err?.code === 10062) return null;
                throw err;
            });
            if (!fetchedMessage) return;
        }
        if (!reaction.message.guildId) return;
        if (user.bot) return;
        const animatedPrefix = reaction.emoji.animated ? 'a' : '';
        let cID = `<${animatedPrefix}:${reaction.emoji.name}:${reaction.emoji.id}>`;
        if (!reaction.emoji.id) cID = reaction.emoji.name;
        const data = await reactions.findOne({ Guild: reaction.message.guildId, Message: reaction.message.id, Emoji: cID });
        if (!data) return
        const guild = client.guilds.cache.get(reaction.message.guildId) || await client.guilds.fetch(reaction.message.guildId).catch(() => null);
        if (!guild) return;
        const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;
        await member.roles.remove(data.Role);
    } catch (e) {
        if (e?.code === 10008 || e?.code === 10062) return;
        global.logger.error(e)
        return;
    }
});

const SERVER_ID = IDs.guilds.main;
const CHANNEL_ID = IDs.channels.staffListChannel;
let staffListMessageId = null;
const ROLE_EMOJIS = {
    [IDs.roles.partnerManager]: { emoji: '<:partnermanager:1443651916838998099>', number: '∞' },
    [IDs.roles.helper]: { emoji: '<:helper:1443651909448630312>', number: '∞' },
    [IDs.roles.moderator]: { emoji: '<:mod:1443651914209165454>', number: '6' },
    [IDs.roles.coordinator]: { emoji: '<:coordinator:1443651923168202824>', number: '4' },
    [IDs.roles.supervisor]: { emoji: '<:supervisor:1443651907900932157>', number: '4' },
    [IDs.roles.admin]: { emoji: '<:admin:1443651911059247225>', number: '4' },
    [IDs.roles.manager]: { emoji: '<:manager:1443651919829536940>', number: '1' },
    [IDs.roles.coOwner]: { emoji: '<:cofounder:1443651915752804392>', number: '2' },
    [IDs.roles.owner]: { emoji: '<:founder:1443651924674216128>', number: '1' },
}
const ID_LORE = {
    [IDs.roles.partnerManager]: ['1442568907801100419'],
};
const STAFF_ROLES_ID = Object.keys(ROLE_EMOJIS);
async function aggiornaListaStaff() {
    const guild = client.guilds.cache.get(SERVER_ID) || await client.guilds.fetch(SERVER_ID).catch(() => null);
    if (!guild) return global.logger.error('Server non trovato');
    const channel = guild.channels.cache.get(CHANNEL_ID) || await guild.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) return global.logger.error('Canale non trovato');
    const staffListContent = await generateStaffListContent(guild);
    if (staffListMessageId) {
        const existing = channel.messages.cache.get(staffListMessageId) || null;
        if (existing) {
            await existing.edit(staffListContent);
            return;
        }
        staffListMessageId = null;
    }
    const messages = await channel.messages.fetch({ limit: 100 });
    const lastMessage = messages.find((message) =>
        message.author.id === client.user.id
        && String(message.content || '').toLowerCase().includes(STAFF_LIST_MARKER)
    );
    if (lastMessage) {
        staffListMessageId = lastMessage.id;
        await lastMessage.edit(staffListContent);
    } else {
        const sent = await channel.send(staffListContent);
        staffListMessageId = sent?.id || null;
    }
}
async function generateStaffListContent(guild) {
    await guild.members.fetch().catch(() => { });
    const staffRoleIds = Object.keys(ROLE_EMOJIS).reverse();
    let staffListContent = `<:pinnednew:1443670849990430750> La __**staff list**__ serve per sapere i __**limiti di ogni ruolo**__, per capire __**quanti staffer ci sono**__ e per poter capire a chi __**chiedere assistenza**__.\n\n`;
    for (const roleId of staffRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;
        const staffMembers = guild.members.cache.filter(member => member.roles.cache.has(roleId));
        const excludedMembers = ID_LORE[roleId] || [];
        const filteredMembers = staffMembers.filter(member => !excludedMembers.includes(member.id));
        const member_count = filteredMembers.size;
        const { emoji, number } = ROLE_EMOJIS[roleId];
        const staffMembersList = filteredMembers.map(member => `<:dot:1443660294596329582> <@${member.id}>`).join('\n') || '<:dot:1443660294596329582>';
        staffListContent += `${emoji} • **<@&${roleId}>︲\`${member_count}/${number}\`**\n\n${staffMembersList}\n\n`;
    }
    return staffListContent;
}
client.on(Events.GuildMemberUpdate, async (membroVecchio, membroNuovo) => {
    if (membroNuovo.guild.id !== SERVER_ID) return;
    const ruoliAggiunti = membroNuovo.roles.cache.difference(membroVecchio.roles.cache);
    const ruoliRimossi = membroVecchio.roles.cache.difference(membroNuovo.roles.cache);
    const ruoliDiStaffAggiunti = ruoliAggiunti.filter(ruolo => STAFF_ROLES_ID.includes(ruolo.id));
    const ruoliDiStaffRimossi = ruoliRimossi.filter(ruolo => STAFF_ROLES_ID.includes(ruolo.id));
    if (ruoliDiStaffAggiunti.size > 0 || ruoliDiStaffRimossi.size > 0) {
        await aggiornaListaStaff();
    }
}
)

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

