const { ChannelType, PermissionsBitField } = require('discord.js');

const SUPERSCRIPT_MAP = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹'
};

const INDEX_PREFIX_RE = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/;
const guildTimers = new Map();
let loopHandle = null;

function toSuperscriptNumber(value) {
    const normalized = Math.max(1, Number(value) || 1).toString().padStart(2, '0');
    return normalized
        .split('')
        .map((digit) => SUPERSCRIPT_MAP[digit] || digit)
        .join('');
}

function replaceNumberPrefixOnly(name, nextNumber) {
    const value = String(name || '');
    if (INDEX_PREFIX_RE.test(value)) {
        return value.replace(INDEX_PREFIX_RE, nextNumber);
    }
    return `${nextNumber} ${value}`;
}

async function renumberGuildCategories(guild) {
    if (!guild) return;
    const me = guild.members.me;
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;

    const categories = guild.channels.cache
        .filter((channel) => channel.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.rawPosition - b.rawPosition) || a.id.localeCompare(b.id))
        .map((channel) => channel);

    for (let index = 0; index < categories.length; index += 1) {
        const category = categories[index];
        if (!category?.manageable) continue;

        const expectedName = replaceNumberPrefixOnly(
            category.name,
            toSuperscriptNumber(index + 1)
        );

        if (category.name === expectedName) continue;
        await category.setName(expectedName).catch(() => {});
    }
}

function queueCategoryRenumber(client, guildId, delayMs = 1200) {
    if (!client || !guildId) return;
    const pending = guildTimers.get(guildId);
    if (pending) clearTimeout(pending);

    const timeout = setTimeout(async () => {
        guildTimers.delete(guildId);
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;
        await guild.channels.fetch().catch(() => {});
        await renumberGuildCategories(guild);
    }, delayMs);

    guildTimers.set(guildId, timeout);
}

async function runAllGuilds(client) {
    if (!client) return;
    for (const guild of client.guilds.cache.values()) {
        await guild.channels.fetch().catch(() => {});
        await renumberGuildCategories(guild);
    }
}

function startCategoryNumberingLoop(client, intervalMs = 10 * 60 * 1000) {
    if (loopHandle) return;
    loopHandle = setInterval(() => {
        runAllGuilds(client).catch(() => {});
    }, intervalMs);
}

module.exports = {
    queueCategoryRenumber,
    runAllGuilds,
    startCategoryNumberingLoop
};
