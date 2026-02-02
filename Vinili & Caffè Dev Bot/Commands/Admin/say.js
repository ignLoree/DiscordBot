const { SlashCommandBuilder, PermissionsBitField, PermissionFlagsBits, EmbedBuilder } = require('discord.js')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Quello che vorresti che il bot dicesse al posto tuo')
        .addStringOption(option => option.setName('messaggio').setDescription('Il messaggio che vuoi che scriva il bot').setRequired(true))
        .addStringOption(option => option.setName('message_id').setDescription('ID del messaggio a cui rispondere (stesso canale)').setRequired(false))
        .addStringOption(option => option.setName('message_link').setDescription('Link del messaggio a cui rispondere').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 6 })
        const mensaje = interaction.options.getString('messaggio');
        const messageId = interaction.options.getString('message_id')?.trim();
        const messageLink = interaction.options.getString('message_link')?.trim();
        let channel = interaction.channel;
        let replyTo = null;

        const linkMatch = messageLink
            ? messageLink.match(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/)
            : null;

        if (linkMatch) {
            const [, guildId, channelId, msgId] = linkMatch;
            if (interaction.guild?.id !== guildId) {
                return interaction.editReply({ content: "<:vegax:1443934876440068179> Il link non appartiene a questo server.", flags: 1 << 6 });
            }
            const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
            if (!targetChannel || !targetChannel.isTextBased()) {
                return interaction.editReply({ content: "<:vegax:1443934876440068179> Canale non valido per rispondere.", flags: 1 << 6 });
            }
            const targetMessage = await targetChannel.messages.fetch(msgId).catch(() => null);
            if (!targetMessage) {
                return interaction.editReply({ content: "<:vegax:1443934876440068179> Messaggio non trovato.", flags: 1 << 6 });
            }
            channel = targetChannel;
            replyTo = targetMessage;
        } else if (messageId) {
            const targetMessage = await channel.messages.fetch(messageId).catch(() => null);
            if (!targetMessage) {
                return interaction.editReply({ content: "<:vegax:1443934876440068179> Messaggio non trovato in questo canale.", flags: 1 << 6 });
            }
            replyTo = targetMessage;
        }

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.')
                    .setColor("Red")
            ]
        });

        await interaction.editReply({ content: `Messaggio inviato`, flags: 1 << 6});
        const payload = { content: `${mensaje}` };
        if (replyTo) {
            payload.reply = { messageReference: replyTo.id, failIfNotExists: false };
            payload.allowedMentions = { repliedUser: true };
        }
        await channel.send(payload);
    },
};
