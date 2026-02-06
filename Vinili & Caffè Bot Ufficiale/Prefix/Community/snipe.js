const { safeMessageReply } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "snipe",
    
    async execute(message, args, client) {
        await message.channel.sendTyping();
        if (!client.snipes || !(client.snipes instanceof Map)) {
            client.snipes = new Map();
        }
        const snipe = client.snipes.get(message.channel.id);

        if (!message.guild) return;

        if (!snipe) {
            return safeMessageReply(message, {
                content: "<:vegax:1443934876440068179> Nessun messaggio eliminato recentemente.",
                allowedMentions: { repliedUser: false }
            });
        }
        const content =
            snipe.content && snipe.content.length > 1900
                ? snipe.content.slice(0, 1900) + "..."
                : snipe.content || "*<:vegax:1443934876440068179> Nessun contenuto*";
        const embed = new EmbedBuilder()
            .setColor("#6f4e37")
            .addFields(
                {
                    name: "<:member_role_icon:1330530086792728618> Messaggio inviato da:",
                    value: snipe.authorId
                        ? `<@${snipe.authorId}> (${snipe.authorTag})`
                        : "Sconosciuto",
                    inline: true
                },
                {
                    name: "<:VC_BlackPin:1448687216871084266> Canale:",
                    value: snipe.channel,
                    inline: true
                },
                {
                    name: "<:VC_Chat:1448694742237053061> Contenuto:",
                    value: `\`\`\`${content}\`\`\``
                }
            )
            .setTimestamp();
        if (snipe.attachment) {
            embed.setImage(snipe.attachment);
        }
        return safeMessageReply(message, {
            embeds: [embed],
            allowedMentions: { repliedUser: false }
        });
    }
};


