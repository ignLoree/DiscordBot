const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const IDs = require('../Utils/Config/ids');

const PREFIXES = ['+', '?', '-'];
const BOT_MENTION_REGEX = /<@!?\d+>/;
const MAIN_GUILD_ID = IDs.guilds?.main || null;
const DEV_ID = '295500038401163264';
const RESTART_FLAG = 'restart.json';

function isSponsorGuild(guildId) {
    const list = IDs.guilds?.sponsorGuildIds || [];
    return Array.isArray(list) && list.includes(guildId);
}

function isRestartCommand(content) {
    const lower = (content || '').trim().toLowerCase();
    return lower === '+rs' || lower === '+restart' || lower.startsWith('+rs ') || lower.startsWith('+restart ');
}

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (!message?.guild || message.author?.bot) return;

        const content = (message.content || '').trim();
        if (!content) return;

        const startsWithPrefix = PREFIXES.some((p) => content.startsWith(p));
        const isMention = client.user && BOT_MENTION_REGEX.test(content) && content.replace(BOT_MENTION_REGEX, '').trim().length > 0;

        if (!startsWithPrefix && !isMention) return;

        if (message.author.id === DEV_ID && isRestartCommand(content)) {
            try {
                const flagPath = path.resolve(process.cwd(), '..', RESTART_FLAG);
                fs.writeFileSync(flagPath, JSON.stringify({
                    at: new Date().toISOString(),
                    by: message.author.id,
                    bot: 'test'
                }, null, 2), 'utf8');
                await message.reply({
                    embeds: [new EmbedBuilder().setColor('#6f4e37').setDescription('<:vegacheckmark:1443666279058772028> Riavvio **Bot Test** richiesto. Il loader riavvierà solo questo bot.')],
                    allowedMentions: { repliedUser: false }
                }).catch(() => {});
            } catch (err) {
                global.logger?.error?.('[Bot Test] +rs write flag:', err);
                await message.reply({ content: 'Errore durante la scrittura del flag di restart.', allowedMentions: { repliedUser: false } }).catch(() => {});
            }
            return;
        }

        if (MAIN_GUILD_ID && message.guild.id === MAIN_GUILD_ID) return;
        if (!isSponsorGuild(message.guild.id)) return;

        const embed = new EmbedBuilder()
            .setColor('#6f4e37')
            .setDescription(
                '<:ticket:1472994083524837396> **Bot Test** gestisce solo **ticket** e **verifica** su questo server.\n' +
                'I comandi (prefix e slash) sono sul **bot principale** (Vinili & Caffè Bot).\n' +
                'Usa i **bottoni** e il **menu** nel canale ticket per aprire un ticket.'
            );
        await message.reply({ embeds: [embed] }).catch(() => {});
    }
};
