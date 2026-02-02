const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Avatar')
        .addSubcommand(sub => sub
            .setName('get')
            .setDescription('Ottieni l\'avatar di un utente.')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('L\'utente di cui vuoi vedere l\'avatar.')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('server')
            .setDescription('Ottieni l\'avatar di un utente impostato solo per questo server, se ne disponde di uno.')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('L\'utente di cui vuoi vedere l\'avatar.')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('user')
            .setDescription('Ottieni l\'avatar principale di un utente.')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('L\'utente di cui vuoi vedere l\'avatar.')
                .setRequired(false))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()
        let user, embed

        switch (sub) {
            case 'get':
                try {
                    user = interaction.options.getMember('user') || interaction.member;
                    embed = new EmbedBuilder()
                        .setTitle('Server Avatar')
                        .setImage(user.displayAvatarURL({ size: 4096 }))
                        .setAuthor({ name: `${user.user.tag}`, iconURL: user.displayAvatarURL() })
                        .setColor("#6f4e37")
                    await interaction.editReply({ embeds: [embed] })
                } catch (error) {
                    global.logger.error(error);
                }
                break;
            case 'server':
                try {
                    user = interaction.options.getMember('user') || interaction.member;
                    const user2 = interaction.options.getUser('user') || interaction.user;
                    if (user.displayAvatarURL() == user2.displayAvatarURL()) return await interaction.editReply({ embeds: [new EmbedBuilder().setColor('Red').setDescription(`<:attentionfromvega:1443651874032062505> Non ha un avatar impostato solo per questo server.`)], flags: 1 << 6 });
                    embed = new EmbedBuilder()
                        .setTitle('Server Avatar')
                        .setImage(user.displayAvatarURL({ size: 4096 }))
                        .setAuthor({ name: `${user.user.tag}`, iconURL: user.displayAvatarURL() })
                        .setColor("#6f4e37")
                    await interaction.editReply({ embeds: [embed] })
                } catch (error) {
                    global.logger.error(error);
                }
            case 'user':
                try {
                    user = interaction.options.getUser('user') || interaction.user;
                    embed = new EmbedBuilder()
                        .setTitle('User Avatar')
                        .setImage(user.displayAvatarURL({ size: 4096 }))
                        .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL() })
                        .setColor("#6f4e37")
                    await interaction.editReply({ embeds: [embed] })
                } catch (error) {
                    global.logger.error(error);
                }
        }
    }
}