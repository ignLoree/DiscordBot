const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');

module.exports = {
    skipDeploy: true,
    data: new SlashCommandBuilder()
        .setName('verify-panel')
        .setDescription('Invia il pannello di verifica')
        .addChannelOption((opt) =>
            opt
                .setName('canale')
                .setDescription('Il canale in cui inviare il pannello')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: 1 << 6 })
        const target = interaction.options.getChannel('canale') || interaction.channel;

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.')
                    .setColor("Red")
            ]
        });

        if (!target || !target.isTextBased()) {
            return interaction.reply({ content: '<:vegax:1443934876440068179> Canale non valido.', flags: 1 << 6 });
        }

        const serverName = target.guild?.name || 'this server';
        const color = client?.config2?.embedVerify || '#6f4e37';
        const infoEmbed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`<:verification:1461725843125571758> **\`Verification Required!\`**`)
            .setDescription(
                `<:space:1461733157840621608> <:alarm:1461725841451909183> **Per accedere a \`${serverName}\` devi prima verificarti.**\n` +
                `<:space:1461733157840621608><:space:1461733157840621608> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.`
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('verify_start')
                .setLabel('Verify')
                .setStyle(ButtonStyle.Success)
        );
        await target.send({ embeds: [infoEmbed], components: [row] });
        return interaction.reply({ content: '<:vegacheckmark:1443666279058772028> Pannello di verifica inviato.', flags: 1 << 6 });
    }
};