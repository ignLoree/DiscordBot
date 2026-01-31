const { getOrCreateWallet } = require('../../Services/Economy/economyService');

module.exports = {
    skipPrefix: true,
    name: "wallet",
    aliases: ["saldo", "portafoglio"],
    async execute(message) {
    await message.channel.sendTyping();
        if (!message.guild) return;
        const target = message.mentions.users.first() || message.author;
        const wallet = await getOrCreateWallet({ guildId: message.guild.id, userId: target.id });
        
        return message.reply({
            content: `<:VC_Wallet:1462794843746205815> Wallet di <@${target.id}>: ☕ Caffè ${wallet.coffee || 0} | 📀 Vinili ${wallet.vinyl || 0}`,
            allowedMentions: { users: [target.id] }
        });
    }
};