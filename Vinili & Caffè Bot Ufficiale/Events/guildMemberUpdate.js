const { EmbedBuilder } = require("discord.js");
const config = require("../config.json");
const boostCountCache = new Map();
const boostAnnounceCache = new Map();

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        try {
            const boostAnnounceChannel =
                newMember.guild.channels.cache.get(config.boostChannelId);
            if (!boostAnnounceChannel) return;
            const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
            const newBoostTs = newMember.premiumSinceTimestamp || 0;
            const guildId = newMember.guild.id;
            const currentCount = Number(newMember.guild.premiumSubscriptionCount || 0);
            const prevCount = boostCountCache.get(guildId);
            const countIncreased = typeof prevCount === 'number' && currentCount > prevCount;
            if (newBoostTs && (newBoostTs !== oldBoostTs || countIncreased)) {
                const boostKey = `${guildId}:${newMember.id}`;
                const lastAnnouncedCount = boostAnnounceCache.get(boostKey);
                if (countIncreased && lastAnnouncedCount === currentCount) {
                    boostCountCache.set(guildId, currentCount);
                    return;
                }
                const boostAnnounceEmbed = new EmbedBuilder()
                    .setAuthor({ name: newMember.user.username })
                    .setTitle(`<a:vegarightarrow:1443673039156936837> **__GRAZIE PER IL BOOST!__**`)
                    .setDescription(
                        `<a:ThankYou:1329504268369002507> **Grazie** ${newMember.user} per aver **boostato** **${newMember.guild.name}**!
<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.
> <a:Boost_Cycle:1329504283007385642> Ora hai dei **nuovi** <#1442569159237177385>, vai a __controllarli__!`
                    )
                    .setColor("#6f4e37")
                    .setFooter({
                        text: `Ã°Å¸Å¡â‚¬ Ora siamo a ${newMember.guild.premiumSubscriptionCount} boost!`,
                    })
                    .setThumbnail(newMember.user.displayAvatarURL());
                await boostAnnounceChannel.send({
                    content: `<a:VC_Boost:1448670271115497617> \`Ã¢â€Å \`  ${newMember.user} \`Ã¢â€Å \` <@&1442568910070349985>`,
                    embeds: [boostAnnounceEmbed],
                });
                boostAnnounceCache.set(boostKey, currentCount);
            }
            boostCountCache.set(guildId, currentCount);
        } catch (error) {
            global.logger.error(error);
        }
    }
};


