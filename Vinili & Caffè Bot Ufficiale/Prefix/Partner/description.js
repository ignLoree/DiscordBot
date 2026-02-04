const { safeMessageReply } = require('../../Utils/Moderation/message');
module.exports = {
    name: 'desc',
    aliases: ['description'],
    async execute(message) {
        await message.channel.sendTyping();
        const allowedCategoryId = "1442569056795230279";
        const partnerRole = message.guild.roles.cache.find(r => r.id.toLowerCase() === "1442568905582317740");

        if (!message.channel.parent || message.channel.parent.id !== allowedCategoryId) {
            return safeMessageReply(message, "<:vegax:1443934876440068179> Questo comando può essere usato **solo nella categoria autorizzata**.");
        }

        if (!partnerRole) {
            return safeMessageReply(message, "<:vegax:1443934876440068179> Il ruolo **Partner Manager** non esiste nel server.");
        }
        if (!message.member.roles.cache.has(partnerRole.id)) {
            return safeMessageReply(message, "<:vegax:1443934876440068179> Non hai il permesso per usare questo comando. Solo i **Partner Manager** possono farlo.");
        }
        await safeMessageReply(message, {
            content:
                `
\`\`\`
_ _  
_ _`` ☕ ``        𓂃        **[Vinili & Caffè](<https://discord.gg/viniliecaffe>)**      ⟢  
_ _     𓎢      **social**       ⊹       **italia** **chill**       ୧                                             
                                       **gaming**                      
-# @everyone & @here_ _
\`\`\`
`,
            allowedMentions: { repliedUser: false }
        });
    }
}

