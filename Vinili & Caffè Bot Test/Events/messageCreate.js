const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const IDs = require('../Utils/Config/ids');

const PREFIXES = ['+', '?', '-'];
const BOT_MENTION_REGEX = /<@!?\d+>/;
const MAIN_GUILD_ID = IDs.guilds?.main || null;
const TEST_GUILD_ID = IDs.guilds?.test || '1462458562507964584';
const DEV_ID = '295500038401163264';
const RESTART_FLAG = 'restart.json';

function isSponsorGuild(guildId) {
    const list = IDs.guilds?.sponsorGuildIds || [];
    return Array.isArray(list) && list.includes(guildId);
}

function isAllowedGuildTest(guildId) {
    if (!guildId) return false;
    if (guildId === MAIN_GUILD_ID) return false;
    return guildId === TEST_GUILD_ID || isSponsorGuild(guildId);
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
            if (message.guild?.id !== TEST_GUILD_ID) {
                await message.reply({
                    embeds: [new EmbedBuilder().setColor('Red').setDescription('<:vegax:1472992044140990526> Il comando `+rs` è utilizzabile solo nel **server test**.')],
                    allowedMentions: { repliedUser: false }
                }).catch(() => {});
                return;
            }
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

        if (!isAllowedGuildTest(message.guild.id)) return;

        const usedPrefix = PREFIXES.find((p) => content.startsWith(p));
        const args = usedPrefix ? content.slice(usedPrefix.length).trim().split(/\s+/).filter(Boolean) : [];
        const firstToken = (args[0] || '').toLowerCase();
        const { runTicketCommand, TICKET_FIRST_TOKENS } = require('../Utils/Ticket/prefixTicketCommand');
        if (TICKET_FIRST_TOKENS.has(firstToken)) {
            try {
                const handled = await runTicketCommand(message, args, client);
                if (handled) return;
            } catch (err) {
                global.logger?.error?.('[Bot Test] prefixTicketCommand', err);
            }
        }
        if (isSponsorGuild(message.guild.id) && firstToken === 'verify') {
            try {
                const { runVerifyCommand } = require('../Utils/Verify/prefixVerifyCommand');
                const handled = await runVerifyCommand(message, args, client);
                if (handled) return;
            } catch (err) {
                global.logger?.error?.('[Bot Test] prefixVerifyCommand', err);
            }
        }
        if (message.guild.id === TEST_GUILD_ID && (firstToken === 'to-do' || firstToken === 'todo')) {
            try {
                const { runTodoCommand } = require('../Utils/Todo/prefixTodoCommand');
                const handled = await runTodoCommand(message, args, client);
                if (handled) return;
            } catch (err) {
                global.logger?.error?.('[Bot Test] prefixTodoCommand', err);
            }
        }
        if (message.guild.id === TEST_GUILD_ID && firstToken === 'bug') {
            try {
                const { runBugCommand } = require('../Utils/Bug/prefixBugCommand');
                const handled = await runBugCommand(message, args, client);
                if (handled) return;
            } catch (err) {
                global.logger?.error?.('[Bot Test] prefixBugCommand', err);
            }
        }

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
