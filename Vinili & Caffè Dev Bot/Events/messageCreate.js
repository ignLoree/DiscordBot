const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const GuildSettings = require('../Schemas/GuildSettings/guildSettingsSchema');
const countschema = require('../Schemas/Counting/countingSchema');
const AFK = require('../Schemas/Afk/afkSchema');
const LastFmUser = require('../Schemas/LastFm/lastFmSchema');
const math = require('mathjs');
const { handleTtsMessage } = require('../Services/TTS/ttsService');
const { recordBump } = require('../Services/Disboard/disboardReminderService');
const { applyDefaultFooterToEmbeds } = require('../Utils/Embeds/defaultFooter');
const { buildWelcomePayload } = require('../Utils/Music/lastfmLoginUi');
const { recordMessage } = require('../Services/Stats/statsService');

const VOTE_MANAGER_BOT_ID = '959699003010871307';
const VOTE_CHANNEL_ID = '1442569123426074736';
const VOTE_ROLE_ID = '1468266342682722679';
const VOTE_URL = 'https://discadia.com/server/viniliecaffe/';

function getRandomExp() {
    const values = [100, 150, 200, 250];
    return values[Math.floor(Math.random() * values.length)];
}

function extractVoteCountFromText(text) {
    const match = (text || '').match(/got\s+(\d+)\s+votes/i);
    if (match) return Number(match[1]);
    const matchAlt = (text || '').match(/(\d+)\s+votes/i);
    if (matchAlt) return Number(matchAlt[1]);
    return null;
}
function extractUserIdFromText(text) {
    if (!text) return null;
    const match = text.match(/<@!?(\d+)>/);
    return match ? match[1] : null;
}

function extractNameFromText(text) {
    if (!text) return null;
    const match = text.match(/(?:^|[\r\n])\s*!?\s*([^\s]+)\s+has voted/i)
        || text.match(/!?\s*([^\s]+)\s+has voted/i);
    return match?.[1] || null;
}

function sanitizeName(name) {
    if (!name) return null;
    return name.replace(/^[!@#:_*~\\-\\.]+|[!@#:_*~\\-\\.]+$/g, '');
}

function getMessageTextParts(message) {
    const embed = message.embeds?.[0];
    const fieldsText = Array.isArray(embed?.fields)
        ? embed.fields.map(f => `${f?.name || ''}\n${f?.value || ''}`).join('\n')
        : '';
    return {
        content: message.content || '',
        embedText: embed?.description || '',
        embedTitle: embed?.title || '',
        fieldsText
    };
}

async function resolveUserFromMessage(message) {
    const mentioned = message.mentions?.users?.first();
    if (mentioned) return mentioned;

    const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
    const idFromContent = extractUserIdFromText(content)
        || extractUserIdFromText(embedText)
        || extractUserIdFromText(fieldsText);
    if (idFromContent) {
        return message.guild.members.fetch(idFromContent).then(m => m.user).catch(() => null);
    }

    const nameRaw = extractNameFromText(content)
        || extractNameFromText(embedText)
        || extractNameFromText(embedTitle)
        || extractNameFromText(fieldsText);
    const nameClean = sanitizeName(nameRaw);
    if (nameClean) {
        const name = nameClean.toLowerCase();
        const cached = message.guild.members.cache.find(m =>
            m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name
        );
        if (cached) return cached.user;
        const searched = await message.guild.members.fetch({ query: nameClean, limit: 5 }).catch(() => null);
        if (searched?.size) {
            const exact = searched.find(m =>
                m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name
            );
            return (exact || searched.first()).user || null;
        }
    }

    return null;
}

async function handleVoteManagerMessage(message) {
    if (!message.guild) return false;
    if (message.channel?.id !== VOTE_CHANNEL_ID) return false;
    const isVoteManagerAuthor = message.author?.id === VOTE_MANAGER_BOT_ID;
    const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
    const looksLikeVote = /has voted/i.test(content + ' ' + embedText + ' ' + embedTitle + ' ' + fieldsText);
    if (!isVoteManagerAuthor && !looksLikeVote) return false;

    const user = await resolveUserFromMessage(message);
    const nameRaw = extractNameFromText(content)
        || extractNameFromText(embedText)
        || extractNameFromText(embedTitle)
        || extractNameFromText(fieldsText);
    const nameClean = sanitizeName(nameRaw) || 'Utente';

    const voteCount =
        extractVoteCountFromText(content) ??
        extractVoteCountFromText(embedText) ??
        extractVoteCountFromText(embedTitle) ??
        extractVoteCountFromText(fieldsText);
    const voteLabel = typeof voteCount === 'number' ? `${voteCount}°` : '';
    const expValue = getRandomExp();

    const embed = new EmbedBuilder()
        .setColor('#6f4e37')
        .setAuthor({
            name: user?.username || nameClean,
            iconURL: user?.displayAvatarURL?.({ size: 256 }) || message.guild.iconURL?.({ size: 256 }) || undefined
        })
        .setTitle('Un nuovo voto! 💕')
        .setDescription([
            `Grazie ${user || nameClean} per aver votato su [Discadia](<https://discadia.com/server/viniliecaffe/>) il server! 📌`,
            '',
            '\`Hai guadagnato:\`',
            `⭐ • **${expValue} EXP** per ${voteLabel ? `${voteLabel} ` : ''}voto`,
            `🪪 • Il ruolo <@&${VOTE_ROLE_ID}> per 24 ore`,
            '💎 • e aura sul server!',
            '',
            '⭐ Vota di nuovo tra __24 ore__ per ottenere **altri exp** dal **bottone sottostante**.',
        ].join('\n'))
        .setThumbnail(user?.displayAvatarURL?.({ size: 256 }) || message.guild.iconURL?.({ size: 256 }) || null)
        .setFooter({ text: '🌍 Ogni volta che voterai il valore dell\'exp guadagnata varierà: a volte sarà più alto, altre volte più basso, mentre altre ancora uguale al precedente ☘️' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji('💗')
            .setLabel('Vota cliccando qui')
            .setURL(VOTE_URL)
    );

    const mention = user ? `${user}` : '';
    let sent = null;
    try {
        sent = await message.channel.send({ content: mention, embeds: [embed], components: [row] });
    } catch (error) {
        const detail = error?.message || error?.code || error;
        global.logger.error('[VOTE EMBED] Failed to send embed:', detail);
    }
    if (sent) {
        await message.delete().catch(() => {});
    }
    return true;
}

module.exports = {
    name: "messageCreate",
    async execute(message, client) {
        try {
            if (message.author?.id !== client?.user?.id) {
                const handledVote = await handleVoteManagerMessage(message);
                if (handledVote) return;
            }
            const handledDisboard = await handleDisboardBump(message, client);
            if (handledDisboard) return;
        } catch (error) {
            logEventError(client, 'DISBOARD REMINDER ERROR', error);
        }
        if (message.author.bot || !message.guild || message.system || message.webhookId)
            return;
        try {
            await recordMessage(message);
        } catch (error) {
            logEventError(client, 'STATS MESSAGE ERROR', error);
        }
        try {
            await handleAfk(message);
        } catch (error) {
            logEventError(client, 'AFK ERROR', error);
        }
        try {
            await handleCounting(message, client);
        } catch (error) {
            logEventError(client, 'COUNTING ERROR', error);
        }
        const guildSettings = await GuildSettings.findOneAndUpdate(
            { Guild: message.guild.id },
            { $setOnInsert: { Prefix: client.config2.prefix } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const defaultPrefix = guildSettings.Prefix || client.config2.prefix;
        const musicPrefix = client.config2.musicPrefix || defaultPrefix;
        const verifyPrefix = 'w!';
        let overrideCommand = null;
        let overridePrefix = null;

        for (const cmd of client.pcommands.values()) {
            if (!cmd.prefixOverride) continue;
            if (message.content.startsWith(cmd.prefixOverride)) {
                overrideCommand = cmd;
                overridePrefix = cmd.prefixOverride;
                break;
            }
        }
        try {
            await handleTtsMessage(message, client, defaultPrefix);
        } catch (error) {
            logEventError(client, 'TTS ERROR', error);
        }
        const startsWithMusic = musicPrefix && message.content.startsWith(musicPrefix);
        const modPrefix = client.config2.moderationPrefix || '?';
        const startsWithMod = modPrefix && message.content.startsWith(modPrefix);
        const startsWithDefault = message.content.startsWith(defaultPrefix);
        const startsWithVerify = verifyPrefix && message.content.startsWith(verifyPrefix);
        const shouldDeleteCommandMessage = !startsWithMod;
        const deleteCommandMessage = async () => {
            if (!shouldDeleteCommandMessage) return;
            await message.delete().catch(() => { });
        };
        if (
            !overridePrefix &&
            !startsWithMusic &&
            !startsWithDefault &&
            !startsWithMod &&
            !startsWithVerify
        ) return;

        const usedPrefix = overridePrefix
            || (startsWithVerify
                ? verifyPrefix
                : startsWithMod
                    ? modPrefix
                    : startsWithMusic
                        ? musicPrefix
                        : defaultPrefix);

        const args = message.content.slice(usedPrefix.length).trim().split(/\s+/);
        const cmd = overrideCommand
            ? overrideCommand.name
            : args.shift()?.toLowerCase();

        if (!cmd) return;
        if (startsWithMusic && cmd !== "login" && cmd !== "help") {
            const lastfmUser = await LastFmUser.findOne({ discordId: message.author.id });
            if (!lastfmUser || !lastfmUser.lastFmUsername || lastfmUser.lastFmUsername === "pending") {
                await message.channel.send(buildWelcomePayload());
                return;
            }
        }
        let command = overrideCommand
            || client.pcommands.get(cmd)
            || client.pcommands.get(client.aliases.get(cmd));
            
        if (!command) {
            const embed = new EmbedBuilder()
                .setColor("Red")
                .setDescription(`<:attentionfromvega:1443651874032062505> Il comando che hai provato ad eseguire **non esiste**.`);
            await deleteCommandMessage();
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => { }), 2000);
            return;
        }
        if (startsWithVerify && command?.name !== 'verify') return;
        if (command?.folder === "Music" && !startsWithMusic) return;
        if (command?.folder !== "Music" && startsWithMusic) return;
        if (String(command?.folder).toLowerCase() === "moderation" && !startsWithMod && !startsWithVerify) return;
        if (String(command?.folder).toLowerCase() !== "moderation" && startsWithMod) return;
        if (String(command?.folder).toLowerCase() !== "moderation" && startsWithVerify) return;
        if (!client.prefixCommandLocks) client.prefixCommandLocks = new Set();
        if (!client.prefixCommandQueue) client.prefixCommandQueue = new Map();
        const userId = message.author.id;
        const enqueueCommand = async () => {
            const emoji = message.client?.emojis?.cache?.get('1443934440614264924');
            if (emoji) {
                await message.react(emoji).catch(() => { });
            } else {
                await message.react('<a:VC_Loading:1462504528774430962>').catch(() => { });
            }
            if (!client.prefixCommandQueue.has(userId)) {
                client.prefixCommandQueue.set(userId, []);
            }
            client.prefixCommandQueue.get(userId).push({ message, args, command });
        };
        if (client.prefixCommandLocks.has(userId)) {
            await enqueueCommand();
            return;
        }
        const disabledPrefixCommands = Array.isArray(client.config?.disabledPrefixCommands)
            ? client.config.disabledPrefixCommands
            : [];
        if (disabledPrefixCommands.includes(command.name)) {
            const embed = new EmbedBuilder()
                .setColor("Red")
                .setDescription("<:attentionfromvega:1443651874032062505> Questo comando Ã¨ disabilitato al momento.");
            await deleteCommandMessage();
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => { }), 2000);
            return;
        }
        if (command.staffOnly) {
            const isPrefixStaff = String(command.folder).toLowerCase() === 'staff';
            const staffRoleIds = Array.isArray(client.config?.staffRoleIds)
                ? client.config.staffRoleIds
                : [];
            const prefixStaffRoleIds = Array.isArray(client.config?.prefixStaffRoleIds)
                ? client.config.prefixStaffRoleIds
                : [];
            const roleIdsToCheck = isPrefixStaff && prefixStaffRoleIds.length > 0
                ? prefixStaffRoleIds
                : staffRoleIds;
            const hasStaffRole = roleIdsToCheck.some(roleId => message.member?.roles?.cache?.has(roleId));
            const isAdmin = message.member?.permissions?.has("Administrator");
            if (!hasStaffRole && !isAdmin) {
                const embed = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription("<:attentionfromvega:1443651874032062505> Questo comando Ã¨ solo per lo staff.");
                await deleteCommandMessage();
                const msg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => { }), 2000);
                return;
            }
        }
        if (command.adminOnly) {
            const adminRoleIds = Array.isArray(client.config?.adminRoleIds)
                ? client.config.adminRoleIds
                : [];
            const hasAdminRole = adminRoleIds.some(roleId => message.member?.roles?.cache?.has(roleId));
            const isAdmin = message.member?.permissions?.has("Administrator");
            if (!hasAdminRole && !isAdmin) {
                const embed = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription("<:attentionfromvega:1443651874032062505> Questo comando Ã¨ solo per lo staff.");
                await deleteCommandMessage();
                const msg = await message.channel.send({ embeds: [embed] });
                setTimeout(() => msg.delete().catch(() => { }), 2000);
                return;
            }
        }
        if (command?.args && !args.length) {
            const embed = new EmbedBuilder()
                .setColor("Red")
                .setDescription(`<:attentionfromvega:1443651874032062505> Non hai **aggiunto** nessun argomento.`);
            await deleteCommandMessage();
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => { }), 2000);
        }
        const executePrefixCommand = async (payload) => {
            const { message: execMessage, args: execArgs, command: execCommand } = payload;
            const originalReply = execMessage.reply.bind(execMessage);
            execMessage.reply = (payload) => originalReply(applyDefaultFooterToEmbeds(payload, execMessage.guild));
            const originalChannelSend = execMessage.channel?.send?.bind(execMessage.channel);
            if (originalChannelSend) {
                execMessage.channel.send = (payload) => originalChannelSend(applyDefaultFooterToEmbeds(payload, execMessage.guild));
            }
            const originalSendTyping = execMessage.channel?.sendTyping?.bind(execMessage.channel);
            let typingTimer = null;
            let commandFinished = false;
            if (originalSendTyping) {
                execMessage.channel.sendTyping = async () => {
                    if (typingTimer || commandFinished) return;
                    typingTimer = setTimeout(async () => {
                        if (commandFinished) return;
                        try {
                            await originalSendTyping();
                        } catch { }
                    }, 3000);
                };
            }
            try {
                await execCommand.execute(execMessage, execArgs, client);
            } catch (error) {
                logEventError(client, 'PREFIX COMMAND ERROR', error);
                const channelID = client.config2.commandErrorChannel;
                const errorChannel = client.channels.cache.get(channelID);
                if (!errorChannel) {
                    logEventError(client, 'PREFIX COMMAND ERROR', error);
                    return;
                }
                const errorEmbed = new EmbedBuilder()
                    .setColor("#6f4e37")
                    .addFields(
                        { name: '<:dot:1443660294596329582> Comando', value: `\`${cmd}\`` },
                        { name: '<:dot:1443660294596329582> Utente', value: `${message.author.tag}` },
                        { name: '<:dot:1443660294596329582> Errore', value: `\`\`\`${error}\`\`\`` }
                    );
                const pendingBtn = new ButtonBuilder()
                    .setCustomId('error_pending')
                    .setLabel('In risoluzione')
                    .setStyle(ButtonStyle.Primary);
                const solvedBtn = new ButtonBuilder()
                    .setCustomId('error_solved')
                    .setLabel('Risolto')
                    .setStyle(ButtonStyle.Success);
                const unsolvedBtn = new ButtonBuilder()
                    .setCustomId('error_unsolved')
                    .setLabel('Irrisolto')
                    .setStyle(ButtonStyle.Danger);
                const row = new ActionRowBuilder().addComponents(pendingBtn, solvedBtn, unsolvedBtn);
                const sentError = await errorChannel.send({ embeds: [errorEmbed], components: [row] });
                const collector = sentError.createMessageComponentCollector({ time: 1000 * 60 * 60 * 24 });
                collector.on("collect", async (btn) => {
                    if (!["error_pending", "error_solved", "error_unsolved"].includes(btn.customId)) return;
                    if (btn.customId === "error_pending") {
                        errorEmbed.setColor("Yellow");
                        await btn.reply({ content: "In risoluzione.", flags: 1 << 6 });
                    }
                    if (btn.customId === "error_solved") {
                        errorEmbed.setColor("Green");
                        await btn.reply({ content: "Risolto.", flags: 1 << 6 });
                    }
                    if (btn.customId === "error_unsolved") {
                        errorEmbed.setColor("Red");
                        await btn.reply({ content: "Irrisolto.", flags: 1 << 6 });
                    }
                    await msg.edit({ embeds: [errorEmbed], components: [row] });
                });
                const feedback = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription(`<:vegax:1443934876440068179> C'Ã¨ stato un errore nell'esecuzione del comando.
                \`\`\`${error}\`\`\``);
                return execMessage.reply({ embeds: [feedback], flags: 1 << 6 });
            } finally {
                commandFinished = true;
                if (typingTimer) clearTimeout(typingTimer);
                if (originalSendTyping) {
                    execMessage.channel.sendTyping = originalSendTyping;
                }
            }
        };
        const lockId = userId;
        client.prefixCommandLocks.add(lockId);
        try {
            await executePrefixCommand({ message, args, command });
        } finally {
            client.prefixCommandLocks.delete(lockId);
            const removeLoadingReaction = async (msg) => {
                try {
                    const emoji = msg.client?.emojis?.cache?.get('1443934440614264924');
                    if (emoji) {
                        const react = msg.reactions.resolve(emoji.id);
                        if (react) await react.users.remove(client.user.id);
                    }
                    const fallback = msg.reactions.resolve('VC_Loading') || msg.reactions.resolve('1462504528774430962');
                    if (fallback) await fallback.users.remove(client.user.id);
                } catch { }
            };
            let queue = client.prefixCommandQueue.get(lockId);
            while (queue && queue.length > 0) {
                const next = queue.shift();
                await removeLoadingReaction(next.message);
                client.prefixCommandLocks.add(lockId);
                try {
                    await executePrefixCommand(next);
                } finally {
                    client.prefixCommandLocks.delete(lockId);
                }
                queue = client.prefixCommandQueue.get(lockId);
            }
            if (queue && queue.length === 0) {
                client.prefixCommandQueue.delete(lockId);
            }
        }
    },
};

async function handleAfk(message) {
    const userId = message.author.id;
    const afkData = await AFK.findOne({ userId: userId });
    if (afkData) {
        const member = message.guild.members.cache.get(userId);
        if (member && afkData.originalName) {
            await member.setNickname(afkData.originalName).catch(() => { });
        }
        await AFK.deleteOne({ userId: userId });
        const msg = await message.reply(`<:VC_PepeWave:1331589315175907412> Bentornato <@${userId}>! Ho rimosso il tuo stato AFK.`);
        setTimeout(() => {
            msg.delete().catch(() => { });
        }, 5000);
    }
    const mentionedUsers = message.mentions.users;
    for (const user of mentionedUsers.values()) {
        if (user.bot) continue;
        const data = await AFK.findOne({ userId: user.id });
        if (!data) continue;
        const now = Date.now();
        const diff = Math.floor((now - data.timestamp) / 1000);
        let timeAgo = "";
        if (diff < 60) timeAgo = `${diff}s fa`;
        else if (diff < 3600) timeAgo = `${Math.floor(diff / 60)}m fa`;
        else if (diff < 86400) timeAgo = `${Math.floor(diff / 3600)}h fa`;
        else timeAgo = `${Math.floor(diff / 86400)} giorni fa`;
        await message.reply(`\`${user.username}\` Ã¨ AFK: **${data.message}** - ${timeAgo}`);
    }
}
async function handleCounting(message, client) {
    const countdata = await countschema.findOne({ Guild: message.guild.id });
    if (!countdata) return;
    const member = message.member;
    if (!member) return;
    const countchannel = message.guild.channels.cache.get('1442569179743125554');
    if (!countchannel) {
        logEventError(client, 'COUNTING', `Counting channel not found for guild: ${message.guild.id}`);
        return;
    }
    if (message.channel.id !== countchannel.id) return;
    const regex = /^[0-9+\-*/x:() ]+$/;
    if (!regex.test(message.content)) {
        return message.delete().catch(() => { });
    }
    let messageValue;
    try {
        const expression = message.content
            .replace(/\s+/g, '')
            .replace(/x/g, '*')
            .replace(/:/g, '/');
        messageValue = math.evaluate(expression);
    } catch (err) {
        return message.delete().catch(() => { });
    }
    let reaction = '<:vegacheckmark:1443666279058772028>';
    if (message.author.id === countdata.LastUser) {
        message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`<:vegax:1443934876440068179> Non puoi contare da solo! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`)
                    .setColor('#6f4e37')
            ]
        });
        countdata.Count = 0;
        countdata.LastUser = ' ';
        message.react('<:vegax:1443934876440068179>').catch((err) => logEventError(client, 'COUNTING', err));
    } else if (messageValue - 1 !== countdata.Count || messageValue === countdata.Count || messageValue > countdata.Count + 1) {
        message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`<:vegax:1443934876440068179> Hai sbagliato numero! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`)
                    .setColor('#6f4e37')
            ]
        });
        countdata.Count = 0;
        message.react('<:vegax:1443934876440068179>').catch((err) => logEventError(client, 'COUNTING', err));
    } else {
        countdata.Count += 1;
        countdata.LastUser = message.author.id;
        message.react(reaction).catch((err) => logEventError(client, 'COUNTING', err));
    }
    await countdata.save();
}

function logEventError(client, label, error) {
    if (client?.logs?.error) {
        client.logs.error(`[${label}]`, error);
        return;
    }
    global.logger.error(`[${label}]`, error);
}

async function handleDisboardBump(message, client) {
    const disboard = client?.config2?.disboard;
    if (!disboard) return false;
    if (!message.guild) return false;
    if (!message.author || message.author.id !== disboard.botId) return false;
    const patterns = Array.isArray(disboard.bumpSuccessPatterns)
        ? disboard.bumpSuccessPatterns
        : [];
    const haystacks = [];
    if (message.content) haystacks.push(message.content);
    if (Array.isArray(message.embeds)) {
        for (const embed of message.embeds) {
            if (embed?.description) haystacks.push(embed.description);
            if (embed?.title) haystacks.push(embed.title);
        }
    }
    const isBump = patterns.some((pattern) =>
        haystacks.some((text) => text.includes(pattern))
    );
    if (!isBump) return false;
    const bumpUserId = message.interaction?.user?.id;
    const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
    const thanksMessage = "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server!__**\n" +
        "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **due ore!**\n" +
        bumpMention;
    await message.channel.send({ content: thanksMessage.trim() });
    await recordBump(client, message.guild.id, bumpUserId || null);
    return true;
}



