const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'membercount',
    async execute(message) {
        await message.channel.sendTyping();
        const guild = message.guild;
        const totalMembers = guild.memberCount;

        const role = message.guild.roles.cache.find(r => r.id.toLowerCase() === "1442568894349840435");
        if (!role) {
            return message.reply("<:vegax:1443934876440068179> Il ruolo **High Staff** non esiste nel server.");
        }

        if (!message.member.roles.cache.has(role.id)) {
            return message.reply("<:vegax:1443934876440068179> Non hai il permesso per usare questo comando. Solo l'**High Staff** possono farlo.");
        }

        const embed = new EmbedBuilder()
            .setColor('#6f4e37')
            .addFields(
                {
                    name: `**<:member_role_icon:1330530086792728618> Members**`,
                    value: `${totalMembers}`
                }
            )
            .setTimestamp()

        await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    }
}