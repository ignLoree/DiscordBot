const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const GuildSettings = require('../Schemas/GuildSettings/guildSettingsSchema');
const countschema = require('../Schemas/Counting/countingSchema');
const AFK = require('../Schemas/Afk/afkSchema');
const math = require('mathjs');
const { handleTtsMessage } = require('../Services/TTS/ttsService');
const { recordBump } = require('../Services/Disboard/disboardReminderService');
const { recordDiscadiaBump } = require('../Services/Discadia/discadiaReminderService');
const { recordDiscadiaVote } = require('../Services/Discadia/discadiaVoteReminderService');
const { handleMinigameMessage } = require('../Services/Minigames/minigameService');
const { recordReminderActivity } = require('../Services/Community/chatReminderService');
const { recordMessageActivity } = require('../Services/Community/activityService');
const { addExpWithLevel } = require('../Services/Community/expService');
const { applyDefaultFooterToEmbeds } = require('../Utils/Embeds/defaultFooter');
const { checkPrefixPermission } = require('../Utils/Moderation/commandPermissions');

const VOTE_MANAGER_BOT_ID = '959699003010871307';
const VOTE_CHANNEL_ID = '1442569123426074736';
const VOTE_ROLE_ID = '1468266342682722679';
const VOTE_URL = 'https://discadia.com/server/viniliecaffe/';
const VOTE_ROLE_DURATION_MS = 24 * 60 * 60 * 1000;
const { upsertVoteRole } = require('../Services/Community/voteRoleService');
const COUNTING_CHANNEL_ID = '1442569179743125554';
const COUNTING_ALLOWED_REGEX = /^[0-9+\-*/x:() ]+$/;
const GUILD_SETTINGS_CACHE_TTL_MS = 60 * 1000;
const guildSettingsCache = new Map();

const MEDIA_BLOCK_ROLE_IDS = [
    "1468938195348754515"
];
const MEDIA_BLOCK_EXEMPT_CATEGORY_ID = "1442569056795230279";
const MEDIA_BLOCK_EXEMPT_CHANNEL_IDS = new Set([
    "1442569136067575809"
]);

function hasMediaPermission(member) {
    return MEDIA_BLOCK_ROLE_IDS.some(roleId => member?.roles?.cache?.has(roleId));
}

function channelAllowsMedia(message) {
    const channel = message?.channel;
    const member = message?.member;
    if (!channel || !member) return false;
    const perms = channel.permissionsFor(member);
    if (!perms) return false;
    const hasAttachment = Boolean(message.attachments?.size);
    const hasLink = /https?:\/\/\S+/i.test(String(message.content || "")) || /discord\.gg\/\S+|\.gg\/\S+/i.test(String(message.content || ""));
    if (hasAttachment) return perms.has('AttachFiles');
    if (hasLink) return perms.has('EmbedLinks');
    return perms.has('AttachFiles') || perms.has('EmbedLinks');
}

function isMediaMessage(message) {
    if (message.attachments?.size) return true;
    const content = String(message.content || "");
    if (/https?:\/\/\S+/i.test(content)) return true;
    if (/discord\.gg\/\S+|\.gg\/\S+/i.test(content)) return true;
    return false;
}

function getRandomExp() {
    const min = 100;
    const max = 250;
    const step = 5;
    const count = Math.floor((max - min) / step) + 1;
    return min + Math.floor(Math.random() * count) * step;
}

function extractVoteCountFromText(text) {
    const cleaned = (text || '').replace(/\*\*/g, '');
    const match = cleaned.match(/(?:have\s+)?got\s+(\d+)\s+votes?/i);
    if (match) return Number(match[1]);
    const matchHave = cleaned.match(/have\s+(\d+)\s+votes?/i);
    if (matchHave) return Number(matchHave[1]);
    const matchAlt = cleaned.match(/(\d+)\s+(?:votes?|voti)/i);
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
    return name.replace(/^[!@#:_*`~\\-\\.]+|[!@#:_*`~\\-\\.]+$/g, '');
}

function flattenEmbedText(embed) {
    if (!embed) return '';
    const parts = [];
    const push = (value) => {
        if (typeof value === 'string' && value.trim()) parts.push(value);
    };
    push(embed.title);
    push(embed.description);
    push(embed.url);
    push(embed.author?.name);
    push(embed.footer?.text);
    if (Array.isArray(embed.fields)) {
        for (const field of embed.fields) {
            push(field?.name);
            push(field?.value);
        }
    }
    const data = embed.data || embed._data;
    if (data) {
        push(data.title);
        push(data.description);
        push(data.url);
        push(data.author?.name);
        push(data.footer?.text);
        if (Array.isArray(data.fields)) {
            for (const field of data.fields) {
                push(field?.name);
                push(field?.value);
            }
        }
    }
    return parts.join('\n');
}

function getMessageTextParts(message) {
    const embed = message.embeds?.[0];
    const embedText = flattenEmbedText(embed);
    return {
        content: message.content || '',
        embedText,
        embedTitle: embed?.title || '',
        fieldsText: ''
    };
}
function getPrefixOverrideMap(client) {
    const size = client.pcommands?.size || 0;
    const cached = client._prefixOverrideCache;
    if (cached && cached.size === size && cached.map) return cached.map;
    const map = new Map();
    for (const cmd of client.pcommands.values()) {
        if (!cmd?.prefixOverride) continue;
        if (!map.has(cmd.prefixOverride)) {
            map.set(cmd.prefixOverride, new Map());
        }
        map.get(cmd.prefixOverride).set(cmd.name, cmd);
        if (Array.isArray(cmd.aliases)) {
            for (const alias of cmd.aliases) {
                map.get(cmd.prefixOverride).set(alias, cmd);
            }
        }
    }
    client._prefixOverrideCache = { map, size };
    return map;
}
async function getGuildSettingsCached(guildId, defaultPrefix) {
    const cached = guildSettingsCache.get(guildId);
    const now = Date.now();
    if (cached && (now - cached.at) < GUILD_SETTINGS_CACHE_TTL_MS) {
        return cached.value;
    }
    const value = await GuildSettings.findOneAndUpdate(
        { Guild: guildId },
        { $setOnInsert: { Prefix: defaultPrefix } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    guildSettingsCache.set(guildId, { value, at: now });
    return value;
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
    const voteText = `${content} ${embedText} ${embedTitle} ${fieldsText}`.toLowerCase();
    const looksLikeVote =
        /has voted|voted/i.test(voteText) ||
        /ha votato|votato/i.test(voteText) ||
        (voteText.includes('discadia') && /(vote|voto|votato)/i.test(voteText));
    if (!isVoteManagerAuthor && !looksLikeVote) return false;

    const user = await resolveUserFromMessage(message);
    const nameRaw = extractNameFromText(content)
        || extractNameFromText(embedText)
        || extractNameFromText(embedTitle)
        || extractNameFromText(fieldsText);
    const nameClean = sanitizeName(nameRaw) || 'Utente';

    const fullText = `${content} ${embedText} ${embedTitle} ${fieldsText}`;
    const voteCount =
        extractVoteCountFromText(content) ??
        extractVoteCountFromText(embedText) ??
        extractVoteCountFromText(embedTitle) ??
        extractVoteCountFromText(fieldsText) ??
        extractVoteCountFromText(fullText);
    if (voteCount === null) {
        global.logger.warn('[VOTE EMBED] Vote count not found. Text:', fullText);
    }
    let expValue = getRandomExp();
    let resolvedVoteCount = voteCount;
    if (user?.id && message.guild?.id) {
        try {
            const count = await recordDiscadiaVote(message.guild.id, user.id);
            if (typeof count === 'number') {
                resolvedVoteCount = count;
            }
            if (count === 1) {
                expValue = 250;
            }
        } catch {}
        try {
            await addExpWithLevel(message.guild, user.id, Number(expValue || 0), false);
        } catch {}
        try {
            const expiresAt = new Date(Date.now() + VOTE_ROLE_DURATION_MS);
            await upsertVoteRole(message.guild.id, user.id, expiresAt);
            const member = message.guild.members.cache.get(user.id) || await message.guild.members.fetch(user.id).catch(() => null);
            if (member && !member.roles.cache.has(VOTE_ROLE_ID)) {
                await member.roles.add(VOTE_ROLE_ID).catch(() => {});
            }
        } catch {}
    }
    const voteLabel = typeof resolvedVoteCount === 'number' ? `${resolvedVoteCount}°` : '';
    const embed = new EmbedBuilder()
            .setColor('#6f4e37')
            .setTitle('Un nuovo voto! <a:VC_StarPink:1330194976440848500>')
            .setDescription([
                `Grazie ${user ? `${user}` : nameClean} per aver votato su [Discadia](<https://discadia.com/server/viniliecaffe/>) il server! <a:VC_WingYellow:1448687141604298822>`,
                '',
                '\`Hai guadagnato:\`',
                `<a:VC_Events:1448688007438667796> • **${expValue} EXP** per il tuo ${voteLabel ? `**${voteLabel} voto**` : '**voto**'}`,
                `<a:VC_Money:1448671284748746905> • Il ruolo <@&${VOTE_ROLE_ID}> per 24 ore`,
                '',
                '<:cutesystar:1443651906370142269> Vota di nuovo tra __24 ore__ per ottenere **altri exp** dal **bottone sottostante**.',
            ].join('\n'))
            .setFooter({ text: 'Ogni volta che voterai il valore dell\'exp guadagnata varierà: a volte sarà più alto, altre volte più basso, mentre altre ancora uguale al precedente ☘️' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setEmoji('<a:VC_HeartPink:1448673486603292685>')
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
            if (
                message.guild &&
                message.member &&
                !message.author?.bot &&
                isMediaMessage(message) &&
                !hasMediaPermission(message.member) &&
                !channelAllowsMedia(message) &&
                message.channel?.parentId !== MEDIA_BLOCK_EXEMPT_CATEGORY_ID &&
                !MEDIA_BLOCK_EXEMPT_CHANNEL_IDS.has(message.channel?.id)
            ) {
                await message.delete().catch(() => { });
                const embed = new EmbedBuilder()
                    .setColor("#6f4e37")
                    .setDescription(
                        [
                            `<:attentionfromvega:1443651874032062505> ➳ Ciao ${message.author}, __non hai i permessi__ per inviare \`FOTO, GIF, LINK, VIDEO O AUDIO\` in chat.`,
                            "",
                            "<a:VC_StarPink:1330194976440848500> • **__Sblocca il permesso:__**",
                            `<a:VC_Arrow:1448672967721615452> ottieni il ruolo: <@&1468938195348754515>.`
                        ].join("\n")
                    );
                await message.channel.send({ content: `${message.author}`, embeds: [embed] });
                return;
            }
            if (message.author?.id !== client?.user?.id) {
                const handledVote = await handleVoteManagerMessage(message);
                if (handledVote) return;
            }
            const handledDisboard = await handleDisboardBump(message, client);
            if (handledDisboard) return;
            const handledDiscadia = await handleDiscadiaBump(message, client);
            if (handledDiscadia) return;
        } catch (error) {
            logEventError(client, 'DISBOARD REMINDER ERROR', error);
        }
        if (message.author.bot || !message.guild || message.system || message.webhookId)
            return;
        try {
            if (message.channelId === '1442569130573303898') {
                recordReminderActivity(message.channelId);
            }
        } catch (error) {
            logEventError(client, 'REMINDER ACTIVITY ERROR', error);
        }
        try {
            await recordMessageActivity(message);
        } catch (error) {
            logEventError(client, 'ACTIVITY MESSAGE ERROR', error);
        }
        try {
            await handleMinigameMessage(message, client);
        } catch (error) {
            logEventError(client, 'MINIGAME ERROR', error);
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
        const defaultPrefix = '+';
        let overrideCommand = null;
        let overridePrefix = null;

        const overrideMap = getPrefixOverrideMap(client);
        for (const prefix of overrideMap.keys()) {
            if (message.content.startsWith(prefix)) {
                if (!overridePrefix || prefix.length > overridePrefix.length) {
                    overridePrefix = prefix;
                }
            }
        }
        try {
            await handleTtsMessage(message, client, defaultPrefix);
        } catch (error) {
            logEventError(client, 'TTS ERROR', error);
        }
        const startsWithDefault = message.content.startsWith(defaultPrefix);
        const shouldDeleteCommandMessage = true;
        const deleteCommandMessage = async () => {
            if (!shouldDeleteCommandMessage) return;
            await message.delete().catch(() => { });
        };
        if (
            !overridePrefix &&
            !startsWithDefault
        ) return;

        const usedPrefix = overridePrefix || defaultPrefix;

        const args = message.content.slice(usedPrefix.length).trim().split(/\s+/).filter(Boolean);
        let cmd = overrideCommand
            ? overrideCommand.name
            : args.shift()?.toLowerCase();
        if (!cmd) return;
        if (overridePrefix) {
            const prefixCommands = overrideMap.get(overridePrefix);
            overrideCommand = prefixCommands?.get(cmd) || null;
        }
        let command = overrideCommand
            || client.pcommands.get(cmd)
            || client.pcommands.get(client.aliases.get(cmd));
            
        if (!command) {
            const embed = new EmbedBuilder()
                .setColor("Red")
                .setDescription(`<:vegax:1443934876440068179> Il comando che hai provato ad eseguire **non esiste**.`);
            await deleteCommandMessage();
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => { }), 2000);
            return;
        }
        if (!checkPrefixPermission(message, command.name)) {
            const embed = new EmbedBuilder()
                .setColor("Red")
                .setDescription("<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.");
            await deleteCommandMessage();
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => { }), 2000);
            return;
        }
        if (command?.args && !args.length) {
            const embed = new EmbedBuilder()
                .setColor("Red")
                .setDescription(`<:vegax:1443934876440068179> Non hai **aggiunto** nessun argomento.`);
            await deleteCommandMessage();
            const msg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => msg.delete().catch(() => { }), 2000);
            return;
        }
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
        const executePrefixCommand = async (payload) => {
            const { message: execMessage, args: execArgs, command: execCommand } = payload;
            const originalReply = execMessage.reply.bind(execMessage);
            execMessage.reply = (payload) => originalReply(applyDefaultFooterToEmbeds(payload, execMessage.guild));
            const originalChannelSend = execMessage.channel?.send?.bind(execMessage.channel);
            if (originalChannelSend) {
                execMessage.channel.send = (payload) => originalChannelSend(applyDefaultFooterToEmbeds(payload, execMessage.guild));
            }
            const originalSendTyping = execMessage.channel?.sendTyping?.bind(execMessage.channel);
            let typingStartTimer = null;
            let typingPulseTimer = null;
            let commandFinished = false;
            if (originalSendTyping) {
                const sendTypingSafe = async () => {
                    if (commandFinished) return;
                    try {
                        await originalSendTyping();
                    } catch { }
                };
                typingStartTimer = setTimeout(async () => {
                    if (commandFinished) return;
                    await sendTypingSafe();
                    typingPulseTimer = setInterval(() => {
                        void sendTypingSafe();
                    }, 8000);
                }, 2500);
                execMessage.channel.sendTyping = async () => {
                    await sendTypingSafe();
                };
            }
            try {
                await execCommand.execute(execMessage, execArgs, client);
            } catch (error) {
                logEventError(client, 'PREFIX COMMAND ERROR', error);
                const channelID = client.config2.commandErrorChannel;
                const errorChannel = client.channels.cache.get(channelID);
                const errorEmbed = new EmbedBuilder()
                    .setColor("#6f4e37")
                    .addFields(
                        { name: '<:dot:1443660294596329582> Comando', value: `\`${cmd}\`` },
                        { name: '<:dot:1443660294596329582> Utente', value: `${message.author.tag}` },
                        { name: '<:dot:1443660294596329582> Errore', value: `\`\`\`${error}\`\`\`` }
                    );
                if (errorChannel) {
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
                }
                const feedback = new EmbedBuilder()
                    .setColor("Red")
                    .setDescription(`<:vegax:1443934876440068179> C'è stato un errore nell'esecuzione del comando.
                \`\`\`${error}\`\`\``);
                return execMessage.reply({ embeds: [feedback], flags: 1 << 6 });
            } finally {
                commandFinished = true;
                if (typingStartTimer) clearTimeout(typingStartTimer);
                if (typingPulseTimer) clearInterval(typingPulseTimer);
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
        await message.reply(`\`${user.username}\` è AFK: **${data.message}** - ${timeAgo}`);
    }
}
async function handleCounting(message, client) {
    const countdata = await countschema.findOne({ Guild: message.guild.id });
    if (!countdata) return;
    const member = message.member;
    if (!member) return;
    const countchannel = message.guild.channels.cache.get(COUNTING_CHANNEL_ID);
    if (!countchannel) {
        logEventError(client, 'COUNTING', `Counting channel not found for guild: ${message.guild.id}`);
        return;
    }
    if (message.channel.id !== countchannel.id) return;
    if (!COUNTING_ALLOWED_REGEX.test(message.content)) {
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

async function handleDiscadiaBump(message, client) {
    const discadia = client?.config2?.discadia;
    if (!discadia) return false;
    if (!message.guild) return false;
    const isDiscadiaAuthor = message.author?.id === discadia.botId;
    const isDiscadiaApp = message.applicationId === discadia.botId;
    const patterns = Array.isArray(discadia.bumpSuccessPatterns)
        ? discadia.bumpSuccessPatterns.map(p => String(p).toLowerCase())
        : ['has been successfully bumped', 'successfully bumped', 'bumped successfully'];
    const haystacks = [];
    if (message.content) haystacks.push(message.content);
    if (Array.isArray(message.embeds)) {
        for (const embed of message.embeds) {
            if (embed?.description) haystacks.push(embed.description);
            if (embed?.title) haystacks.push(embed.title);
            if (embed?.footer?.text) haystacks.push(embed.footer.text);
            if (embed?.author?.name) haystacks.push(embed.author.name);
            if (Array.isArray(embed?.fields)) {
                for (const field of embed.fields) {
                    if (field?.name) haystacks.push(field.name);
                    if (field?.value) haystacks.push(field.value);
                }
            }
        }
    }
    const normalized = haystacks.map(text => String(text).toLowerCase());
    const hasPattern = patterns.some((pattern) =>
        normalized.some((text) => text.includes(pattern))
    );
    const isBump = hasPattern;
    if (!isBump) return false;
    if (!isDiscadiaAuthor && !isDiscadiaApp) return false;
    const bumpUserId = message.interaction?.user?.id;
    const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
    const thanksMessage = "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server su Discadia!__**\n" +
        "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **24 ore!**\n" +
        bumpMention;
    await message.channel.send({ content: thanksMessage.trim() });
    await recordDiscadiaBump(client, message.guild.id, bumpUserId || null);
    return true;
}
