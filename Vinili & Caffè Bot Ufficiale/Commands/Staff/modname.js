const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modname')
        .setDescription('Modera il nome di un utente')
        .addUserOption((option =>
            option.setName('user')
                .setDescription('L\'utente di cui moderare il nome')
                .setRequired(true)
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

    async execute(interaction) {
        try {
            await interaction.deferReply()
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`<:attentionfromvega:1443651874032062505> Non puoi fare questo comando!`)
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
            const user = interaction.options.getUser('user');
            const member = await fetchMemberSafe(interaction.guild, user.id);
            if (!member) {
                return await interaction.editReply({ content: 'Utente non trovato.', flags: 1 << 6 });
            }
            const tagline = Math.floor(Math.random() * 1000) + 1;
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:discordstaff:1443651872258003005> Nickaname di ${user.username} cambiato in Moderated Nickname ${tagline}`);
            await member.setNickname(`Moderated Nickname ${tagline}`);
            await interaction.editReply({ embeds: [embed], flags: 1 << 6 });
        } catch (error) {
            global.logger.error(error)
        }
    }
}