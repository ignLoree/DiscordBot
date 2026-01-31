const { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { setBumpAt } = require('../../Services/Disboard/disboardReminderService');

module.exports = {
    skipDeploy: true,
    data: new SlashCommandBuilder()
        .setName('disboard')
        .setDescription('Gestione DISBOARD')
        .addSubcommand((sub) =>
            sub.setName('setbump')
                .setDescription('Imposta manualmente l\'ultimo bump')
                .addStringOption((opt) =>
                    opt.setName('ora')
                        .setDescription('Ora HH:MM (default 00:30)')
                        .setRequired(false)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply()
        if (sub !== 'setbump') return;

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.')
                    .setColor("Red")
            ],
            flags: 1 << 6
        });

        const timeStr = interaction.options.getString('ora') || '00:30';
        const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr);
        if (!match) {
            return interaction.editReply({
                content: "<:vegax:1443934876440068179> Formato ora non valido. Usa HH:MM (es. 00:30).",
                flags: 1 << 6
            });
        }
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const now = new Date();
        const bumpAt = new Date(now);
        bumpAt.setHours(hours, minutes, 0, 0);
        if (bumpAt > now) bumpAt.setDate(bumpAt.getDate() - 1);
        await setBumpAt(client, interaction.guild.id, bumpAt, interaction.user.id);

        return interaction.editReply({
            content: `<:vegacheckmark:1443666279058772028> Ultimo bump impostato a \`${formatDate(bumpAt)}\`. Reminder schedulato.`,
            flags: 1 << 6
        });
    }
};

function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}