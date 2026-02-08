const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { handleMinigameButton } = require('../../Services/Minigames/minigameService');

async function handleButtonInteraction(interaction, client) {
    if (!interaction.isButton()) return false;
    try {
        const handled = await handleMinigameButton(interaction, client);
        if (handled) return true;
    } catch (error) {
        global.logger.error('[MINIGAME BUTTON ERROR]', error);
    }
    const button = client.buttons.get(interaction.customId);
    if (!button) return false;
    const color = {
        red: '\x1b[31m',
        orange: '\x1b[38;5;202m',
        yellow: '\x1b[33m',
        green: '\x1b[32m',
        blue: '\x1b[34m',
        reset: '\x1b[0m'
    };
    function getTimestamp() {
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    try {
        await button.execute(interaction, client);
    } catch (error) {
        global.logger.error(`${color.red}[${getTimestamp()}] [BUTTON_CREATE]:`, error);
        const channelID = `${client.config.commandErrorChannel}`;
        const channel = client.channels.cache.get(channelID);
        if (!channel) return global.logger.error("Errore: Canale errori non trovato!");

        const embed = new EmbedBuilder()
            .setColor('#6f4e37')
            .addFields(
                { name: '<:dot:1443660294596329582> Bottone', value: `\`\`\`${interaction.customId}\`\`\`` },
                { name: '<:dot:1443660294596329582> Utente', value: `\`\`\`${interaction.user.username}#${interaction.user.discriminator}\`\`\`` },
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
        const msg = await channel.send({ embeds: [embed], components: [row] });
        const collector = msg.createMessageComponentCollector({ componentType: 2, time: 86400000 });

        collector.on('collect', async (btn) => {
            if (!['error_pending', 'error_solved', 'error_unsolved'].includes(btn.customId)) return;
            if (btn.customId === 'error_pending') {
                embed.setColor('Yellow');
                await btn.reply({ content: 'In risoluzione.', flags: 1 << 6 });
            }
            if (btn.customId === 'error_solved') {
                embed.setColor('Green');
                await btn.reply({ content: 'Risolto.', flags: 1 << 6 });
            }
            if (btn.customId === 'error_unsolved') {
                embed.setColor('Red');
                await btn.reply({ content: 'Irrisolto.', flags: 1 << 6 });
            }
            await msg.edit({ embeds: [embed], components: [row] });
        });

        const errorEmbed = new EmbedBuilder()
            .setColor('Red')
            .setDescription(`<:vegax:1443934876440068179> Si è verificato un errore durante l'esecuzione del bottone!
            \`\`\`${error}\`\`\``);
            
        await interaction.reply({ embeds: [errorEmbed], flags: 1 << 6 });
    }
    return true;
}
module.exports = { handleButtonInteraction };
