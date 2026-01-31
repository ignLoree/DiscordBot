const { SlashCommandBuilder } = require('discord.js');
const AFK = require('../../Schemas/Afk/afkSchema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Imposta il tuo stato AFK')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Il messaggio che il bot invierà quando sarai AFK')
                .setRequired(true)
        ),
        
    async execute(interaction) {
        const afkMessage = interaction.options.getString('message')
        const userId = interaction.user.id
        const member = await interaction.guild.members.fetch(userId).catch(() => null)
        await interaction.deferReply()
        if (afkMessage.includes('@everyone') || afkMessage.includes('@here'))
            return await interaction.editReply({ content: '<:vegax:1443934876440068179> Non puoi usare @everyone o @here nel messaggio.', flags: 1 << 6 });
        const originalName = member?.nickname || interaction.user.username;
        try {
            await AFK.findOneAndUpdate(
                { userId },
                { message: afkMessage, timestamp: Date.now(), originalName },
                { upsert: true }
            );
            if (member && !originalName.startsWith("[AFK]")) {
                await member.setNickname(`[AFK] ${originalName}`).catch(() => { });
            }
            await interaction.editReply({ content: `<@${userId}> Ho impostato il tuo stato AFK: __${afkMessage}__` });
        } catch (error) {
            global.logger.error(error);
        }
    }
}