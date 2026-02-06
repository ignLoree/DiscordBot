const { safeEditReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchMemberSafe } = require('../../Utils/Moderation/discordFetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('modname')
        .setDescription('Modera il nome di un utente')
        .addUserOption((option =>
            option.setName('user')
                .setDescription('L\'utente di cui moderare il nome')
                .setRequired(true)
        )),

    async execute(interaction) {
        await interaction.deferReply()

        try {
            const user = interaction.options.getUser('user');
            const member = await fetchMemberSafe(interaction.guild, user.id);
            if (!member) {
                return await safeEditReply(interaction, { content: 'Utente non trovato.', flags: 1 << 6 });
            }
            const tagline = Math.floor(Math.random() * 1000) + 1;
            const embed = new EmbedBuilder()
                .setColor('#6f4e37')
                .setDescription(`<:discordstaff:1443651872258003005> Nickaname di ${user.username} cambiato in Moderated Nickname ${tagline}`);
            await member.setNickname(`Moderated Nickname ${tagline}`);
            await safeEditReply(interaction, { embeds: [embed], flags: 1 << 6 });
        } catch (error) {
            global.logger.error(error)
        }
    }
}
