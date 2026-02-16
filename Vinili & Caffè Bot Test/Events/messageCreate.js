/**
 * Bot Test non ha comandi prefix/slash: gestisce solo ticket e verifica sui server sponsor.
 * Se qualcuno usa un prefix (es. + o ?) rispondiamo con un messaggio chiaro.
 */
const { EmbedBuilder } = require('discord.js');
const IDs = require('../Utils/Config/ids');

const PREFIXES = ['+', '?', '-'];
const BOT_MENTION_REGEX = /<@!?\d+>/;
const MAIN_GUILD_ID = IDs.guilds?.main || null;

function isSponsorGuild(guildId) {
    const list = IDs.guilds?.sponsorGuildIds || [];
    return Array.isArray(list) && list.includes(guildId);
}

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (!message?.guild || message.author?.bot) return;
        if (MAIN_GUILD_ID && message.guild.id === MAIN_GUILD_ID) return;

        const content = (message.content || '').trim();
        if (!content) return;

        const startsWithPrefix = PREFIXES.some((p) => content.startsWith(p));
        const isMention = client.user && BOT_MENTION_REGEX.test(content) && content.replace(BOT_MENTION_REGEX, '').trim().length > 0;

        if (!startsWithPrefix && !isMention) return;

        if (!isSponsorGuild(message.guild.id)) return;

        const embed = new EmbedBuilder()
            .setColor('#6f4e37')
            .setDescription(
                '<:vsl_ticket:1329520261053022208> **Bot Test** gestisce solo **ticket** e **verifica** su questo server.\n' +
                'I comandi (prefix e slash) sono sul **bot principale** (Vinili & Caffè Bot).\n' +
                'Usa i **bottoni** e il **menu** nel canale ticket per aprire un ticket.'
            );
        await message.reply({ embeds: [embed] }).catch(() => {});
    }
};
