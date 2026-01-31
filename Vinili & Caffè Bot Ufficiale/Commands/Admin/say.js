const { SlashCommandBuilder, PermissionsBitField, PermissionFlagsBits, EmbedBuilder } = require('discord.js')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Quello che vorresti che il bot dicesse al posto tuo')
        .addStringOption(option => option.setName('messaggio').setDescription('Il messaggio che vuoi che scriva il bot').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 6 })
        const mensaje = interaction.options.getString('messaggio');
        const channel = interaction.channel;

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.')
                    .setColor("Red")
            ]
        });

        await interaction.editReply({ content: `Messaggio invitato`, flags: 1 << 6});
        await channel.send({ content: `${mensaje}` })
    },
};
