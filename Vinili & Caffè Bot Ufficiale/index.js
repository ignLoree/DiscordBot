const { Client, GatewayIntentBits, EmbedBuilder, Collection, Events, Partials, ActivityType, ChannelType } = require(`discord.js`);
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
global.logger = require('./Utils/Moderation/logger');
const { installEmbedFooterPatch } = require('./Utils/Embeds/defaultFooter');
const cron = require("node-cron");
const Logs = require('discord-logs');
const { ClusterClient } = require('discord-hybrid-sharding');
const functions = fs.readdirSync("./Handlers").filter(file => file.endsWith(".js"));
const triggerFiles = fs.readdirSync("./Triggers").filter(file => file.endsWith(".js"))
const pcommandFolders = fs.readdirSync('./Prefix');
const commandFolders = fs.readdirSync("./Commands");
const { getActiveSeason } = require('./Services/Pass/seasonService.js');
const { getOrCreatePassUser } = require('./Services/Pass/passService.js');
const { grantRewards } = require('./Services/Pass/rewardService.js');
const { startVoiceTicker } = require('./Services/Pass/voiceService.js');
const { isGoodMessage } = require('./Utils/Pass/antiSpam.js');
const { registerProgress } = require('./Services/Pass/objectiveService.js');
const { registerMissionProgress } = require('./Services/Pass/missionService.js');
const { updateAutoNodes } = require('./Services/Pass/passProgressService');
const { checkAndInstallPackages } = require('./Utils/Moderation/checkPackages.js')
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

setInterval(async () => {
    const flagPath = path.resolve(process.cwd(), '..', 'reload_dev.json');
    if (!fs.existsSync(flagPath)) return;
    try {
        const payload = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
        fs.unlinkSync(flagPath);
        const scope = payload?.scope || 'all';
        await client.reloadScope(scope);
        client.logs?.success?.(`[RELOAD] ${scope} reloaded (remote).`);
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
        if (typeof startVoiceTicker === 'function') {
            startVoiceTicker(client);
        }
        cron.schedule("0 19 * * *", async () => {
            const guild = client.guilds.cache.get("1329080093599076474");
            if (!guild) return;
            const role = guild.roles.cache.find(r => r.id === "1442568889052430609");
            if (!role) return;
            const channel = guild.channels.cache.get("1442569285909217301");
            if (!channel) return;
            await channel.send({
                content: `<:attentionfromvega:1443651874032062505> ${role} ricordatevi di mettere il poll usando il comando dedicato! </poll create:1445747424843923560>`
            });
        }, {
            timezone: "Europe/Rome"
        });
        if (fs.existsSync("./restart.json")) {
            try {
                const data = JSON.parse(fs.readFileSync("./restart.json", "utf8"));
                const channel = await client.channels.fetch(data.channelID);
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
    for (file of functions) {
        require(`./Handlers/${file}`)(client);
    }
    client.handleEvents("./Events");
    client.handleTriggers(triggerFiles, "./Triggers")
    await client.handleCommands(commandFolders, "./Commands");
    await client.prefixCommands(pcommandFolders, './Prefix');
    if (typeof client.logBootTables === 'function') {
        client.logBootTables();
    }
    client.login(client.config.token).catch((error) => {
        global.logger.error('[LOGIN] Error while logging in. Check if your token is correct or double check your also using the correct intents.', error);
    });
})();
client.on(Events.MessageCreate, async message => {
    try {
        if (!message.guild) return;
        if (message.author.bot) return;
        const CONFIG = client.config2 || {};
        const passConfig = CONFIG.pass;
        if (!passConfig) return;
        if (!isGoodMessage(message.content, passConfig.minMsgLen)) return;
        const allowedChatChannels = passConfig.chatAllowedChannelIds || [];
        if (allowedChatChannels.length > 0 && !allowedChatChannels.includes(message.channel.id)) {
            return;
        }
        const season = await getActiveSeason(message.guild.id);
        if (!season) return;
        const u = await getOrCreatePassUser({
            guildId: message.guild.id,
            seasonId: season.seasonId,
            userId: message.author.id
        });
        u.stats.chatCountToday += 1;
        const channelId = message.channel.id;
        const channelsToday = Array.isArray(u.stats.chatChannelsToday)
            ? u.stats.chatChannelsToday
            : [];
        const isNewChannel = !channelsToday.includes(channelId);
        if (isNewChannel) channelsToday.push(channelId);
        u.stats.chatChannelsToday = channelsToday;
        await u.save();
        if (isNewChannel) {
            await registerProgress({
                guildId: message.guild.id,
                seasonId: season.seasonId,
                passUser: u,
                type: 'chat_variety',
                amount: 1
            });
        }
        await registerMissionProgress({
            guildId: message.guild.id,
            seasonId: season.seasonId,
            passUser: u,
            type: 'chat_unique',
            amount: 1
        });
        const now = new Date();
        if (
            u.cooldowns.lastChatRewardAt &&
            now - u.cooldowns.lastChatRewardAt < passConfig.chatRewardCooldownSec * 1000
        ) return;
        if (u.stats.chatTicketsToday >= passConfig.chatTicketCapPerDay) return;
        u.stats.chatTicketsToday += 1;
        u.cooldowns.lastChatRewardAt = now;
        await u.save();
        await updateAutoNodes({
            guildId: message.guild.id,
            seasonId: season.seasonId,
            passUser: u
        });
        await grantRewards({
            guildId: message.guild.id,
            seasonId: season.seasonId,
            userId: message.author.id,
            passUser: u,
            rewards: { tickets: 1, fragments: { common: 1 } },
            reason: 'chat_ticket'
        });
    } catch (err) {
        global.logger.error(err);
    }
});
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
        if (thread.parent.type !== ChannelType.GuildForum) return;
        const forumRoleId = "1447597930944008376";
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
            const logChannelId = client.config2.slashCommandLoggingChannel;
            if (!logChannelId) return;
            const channel = client.channels.cache.get(logChannelId) || await client.channels.fetch(logChannelId).catch(() => null);
            if (!channel) return;
            const server = interaction.guild?.name || "DM";
            const user = interaction.user.username;
            const userID = interaction.user.id;
            const embed = new EmbedBuilder()
                .setColor("#6f4e37")
                .setAuthor({ name: `${user} ha usato un comando.`, iconURL: client.user.avatarURL({ dynamic: true }) })
                .setTitle(`${client.user.username} Log Comandi`)
                .addFields({ name: 'Nome Server', value: `${server}` })
                .addFields({ name: 'Comando', value: `\`\`\`${interaction}\`\`\`` })
                .addFields({ name: 'Utente', value: `${user} | ${userID}` })
                .setTimestamp()
                .setFooter({ text: `Log Comandi ${client.config2.devBy}`, iconURL: interaction.user.avatarURL({ dynamic: true }) })
            await channel.send({ embeds: [embed] });
        } catch (error) {
            client.logs.error(`[SLASH_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.`);
        }
    };
});
client.on(Events.MessageCreate, async message => {
    const prefix = client.config2.prefix
    const musicPrefix = client.config2.musicPrefix || prefix
    const modPrefix = client.config2.moderationPrefix || '?'
    const startsWithPrefix = message.content.startsWith(prefix)
    const startsWithMusic = message.content.startsWith(musicPrefix)
    const startsWithMod = message.content.startsWith(modPrefix)
    if (!message.author.bot && (startsWithPrefix || startsWithMusic || startsWithMod)) {
        try {
            const logChannelId = client.config2.prefixCommandLoggingChannel;
            if (!logChannelId) return;
            const channel = client.channels.cache.get(logChannelId) || await client.channels.fetch(logChannelId).catch(() => null);
            if (!channel) return;
            const server = message.guild?.name || "DM";
            const user = message.author.username;
            const userID = message.author.id;
            const embed = new EmbedBuilder()
                .setColor("#6f4e37")
                .setAuthor({ name: `${user} ha usato un comando.`, iconURL: client.user.avatarURL({ dynamic: true }) })
                .setTitle(`${client.user.username} Log Comandi`)
                .addFields({ name: 'Nome Server', value: `${server}` })
                .addFields({ name: 'Comando', value: `\`\`\`${message.content}\`\`\`` })
                .addFields({ name: 'Utente', value: `${user} | ${userID}` })
                .setTimestamp()
                .setFooter({ text: `Log Comandi ${client.config2.devBy}`, iconURL: message.author.avatarURL({ dynamic: true }) })
            await channel.send({ embeds: [embed] });
        } catch (error) {
            client.logs.error(`[PREFIX_COMMAND_USED] Error while logging command usage. Check if you have the correct channel ID in your config.`);
        }
    };
});
const reactions = require('./Schemas/ReactionRole/reactionroleSchema.js')
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (reaction.message.partial) await reaction.message.fetch();
    if (reaction.partial) await reaction.fetch();
    if (!reaction.message.guildId) return;
    if (user.bot) return;
    let cID = `<:${reaction.emoji.name}:${reaction.emoji.id}>`;
    if (!reaction.emoji.id) cID = reaction.emoji.name;
    const data = await reactions.findOne({ Guild: reaction.message.guildId, Message: reaction.message.id, Emoji: cID });
    if (!data) return
    const guild = await client.guilds.cache.get(reaction.message.guildId);
    const member = await guild.members.cache.get(user.id);
    try {
        await member.roles.add(data.Role);
    } catch (e) {
        global.logger.error(e)
        return;
    }
});
client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (reaction.message.partial) await reaction.message.fetch();
    if (reaction.partial) await reaction.fetch();
    if (!reaction.message.guildId) return;
    if (user.bot) return;
    let cID = `<:${reaction.emoji.name}:${reaction.emoji.id}>`;
    if (!reaction.emoji.id) cID = reaction.emoji.name;
    const data = await reactions.findOne({ Guild: reaction.message.guildId, Message: reaction.message.id, Emoji: cID });
    if (!data) return
    const guild = await client.guilds.cache.get(reaction.message.guildId);
    const member = await guild.members.cache.get(user.id);
    try {
        await member.roles.remove(data.Role);
    } catch (e) {
        global.logger.error(e)
        return;
    }
});
const SERVER_ID = '1329080093599076474';
const CHANNEL_ID = '1442569235426705653';
const ROLE_EMOJIS = {
    '1442568905582317740': { emoji: '<:partnermanager:1443651916838998099>', number: '8' },
    '1442568904311570555': { emoji: '<:helper:1443651909448630312>', number: '8' },
    '1442568901887000618': { emoji: '<:mod:1443651914209165454>', number: '6' },
    '1442568897902678038': { emoji: '<:coordinator:1443651923168202824>', number: '4' },
    '1442568896237277295': { emoji: '<:supervisor:1443651907900932157>', number: '4' },
    '1442568893435478097': { emoji: '<:admin:1443651911059247225>', number: '4' },
    '1442568891875201066': { emoji: '<:manager:1443651919829536940>', number: '1' },
    '1442568889052430609': { emoji: '<:cofounder:1443651915752804392>', number: '2' },
    '1442568886988963923': { emoji: '<:founder:1443651924674216128>', number: '1' },
}
const ID_LORE = {
    '1329080093653471300': ['1442568907801100419'],
};
const STAFF_ROLES_ID = Object.keys(ROLE_EMOJIS);
async function aggiornaListaStaff() {
    const guild = client.guilds.cache.get(SERVER_ID);
    if (!guild) return global.logger.error('Server non trovato');
    const channel = guild.channels.cache.get(CHANNEL_ID);
    if (!channel) return global.logger.error('Canale non trovato');
    const messages = await channel.messages.fetch({ limit: 100 });
    const lastMessage = messages.find(message => message.author.id === client.user.id && message.content.includes("3/3"));
    const staffListContent = await generateStaffListContent(guild);
    if (lastMessage) {
        await lastMessage.edit(staffListContent);
    } else {
        await channel.send(staffListContent);
    }
}
async function generateStaffListContent(guild) {
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
        staffListContent += `${emoji}・**<@&${roleId}>︲\`${member_count}/${number}\`**\n\n${staffMembersList}\n\n`;
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
