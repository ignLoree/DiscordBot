const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("server")
        .setDescription("Mostra delle informazioni sul server.")
        .addSubcommand(command =>
            command.setName('info')
                .setDescription(`Mostra delle informazioni sul server.`)
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()
        switch (sub) {
            case 'info':
                try {
                    const { guild } = interaction;
                    const owner = client.users.cache.get(guild.ownerId);
                    const { channels } = guild;
                    const getChannelTypeSize = type => channels.cache.filter(channel => type.includes(channel.type)).size;
                    const embed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setAuthor({ name: `${guild.name}`, iconURL: `${guild.iconURL()}` })
                        .setThumbnail(`${guild.iconURL()}`)
                        .addFields(
                            { name: 'Owner', value: owner.tag, inline: true },
                            { name: 'Membri', value: guild.memberCount.toString(), inline: true },
                            { name: 'Ruoli', value: guild.roles.cache.size.toString(), inline: true },
                            { name: 'Categorie', value: `${getChannelTypeSize([ChannelType.GuildCategory]) || 'Nessuna categoria'}`, inline: true },
                            { name: 'Canali Testuali', value: `${getChannelTypeSize([ChannelType.GuildText, ChannelType.GuildForum, ChannelType.GuildNews]) || 'Nessun canale'}`, inline: true },
                            { name: 'Canali Vocali', value: `${getChannelTypeSize([ChannelType.GuildVoice, ChannelType.GuildStageVoice]) || 'Nessun canale'}`, inline: true },
                            { name: 'Threads', value: `${getChannelTypeSize([ChannelType.GuildPublicThread, ChannelType.GuildPrivateThread, ChannelType.GuildNewsThread])}` || 'Nessun thread', inline: true },
                            { name: 'Boost Totali', value: `${guild.premiumSubscriptionCount || 'Nessun boost'} Boosts (Livello ${guild.premiumTier || "Nessuno"})`, inline: true },
                        )
                        .setFooter({ text: `ID: ${guild.id} | Server Creato il` })
                        .setTimestamp(new Date(guild.createdAt))
                    await interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    global.logger.error(error);
                };
        }
    }
}