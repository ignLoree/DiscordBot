const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const config = require("../config.json");
const boostCountCache = new Map();
const boostAnnounceCache = new Map();
const boostFollowupLocks = new Map();
const PERK_ROLE_ID = '1468938195348754515';
const PLUS_COLOR_REQUIRED_ROLE_IDS = ['1329497467481493607', '1442568932136587297'];
const PLUS_COLOR_ROLE_IDS = [
    '1469759694930182284',
    '1469759700944814231',
    '1469759704380084384',
    '1469759708742160537',
    '1469759714094088327',
    '1469759719194230906',
    '1469759723418026233',
    '1469759731945177182',
    '1469760931113336864',
    '1469761030417809675',
    '1469761114140315831'
];

async function addPerkRoleIfPossible(member) {
    const me = member.guild.members.me;
    if (!me) return;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;
    const role = member.guild.roles.cache.get(PERK_ROLE_ID);
    if (!role) return;
    if (role.position >= me.roles.highest.position) return;
    if (member.roles.cache.has(PERK_ROLE_ID)) return;
    await member.roles.add(role).catch(() => {});
}

async function removePlusColorsIfNotEligible(member) {
    const me = member.guild.members.me;
    if (!me) return;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

    const hasRequiredRole = PLUS_COLOR_REQUIRED_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
    if (hasRequiredRole) return;

    const heldPlusRoles = PLUS_COLOR_ROLE_IDS.filter((roleId) => member.roles.cache.has(roleId));
    if (!heldPlusRoles.length) return;

    const removableRoleIds = heldPlusRoles.filter((roleId) => {
        const role = member.guild.roles.cache.get(roleId);
        return role && role.position < me.roles.highest.position;
    });
    if (!removableRoleIds.length) return;

    await member.roles.remove(removableRoleIds).catch(() => {});
}

async function sendBoostEmbeds(channel, member, times, boostCount) {
    const safeTimes = Math.max(0, Number(times || 0));
    for (let i = 0; i < safeTimes; i += 1) {
        const boostAnnounceEmbed = new EmbedBuilder()
            .setAuthor({ name: member.user.username })
            .setTitle(`<a:vegarightarrow:1443673039156936837> **__GRAZIE PER IL BOOST!__**`)
            .setDescription(
                `<a:ThankYou:1329504268369002507> **Grazie** ${member.user} per aver **boostato** **${member.guild.name}**!
<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.
> <a:Boost_Cycle:1329504283007385642> Ora hai dei **nuovi** perks, vai a __controllarli__ in <#1442569111119990887>!`
            )
            .setColor("#6f4e37")
            .setFooter({
                text: `Ora siamo a ${boostCount} boost!`,
            })
            .setThumbnail(member.user.displayAvatarURL());

        await channel.send({
            content: `<a:VC_Boost:1448670271115497617> \`┊\`  ${member.user} \`┊\` <@&1442568910070349985>`,
            embeds: [boostAnnounceEmbed],
        });
    }
}

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        try {
            await removePlusColorsIfNotEligible(newMember);

            const boostAnnounceChannel =
                newMember.guild.channels.cache.get(config.boostChannelId);
            if (!boostAnnounceChannel) return;
            const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
            const newBoostTs = newMember.premiumSinceTimestamp || 0;
            const guildId = newMember.guild.id;
            const currentCount = Number(newMember.guild.premiumSubscriptionCount || 0);
            const oldCountFromEvent = Number(oldMember?.guild?.premiumSubscriptionCount || 0);
            const prevCount = typeof boostCountCache.get(guildId) === 'number'
                ? boostCountCache.get(guildId)
                : oldCountFromEvent;
            const effectivePrev = oldCountFromEvent > 0 ? oldCountFromEvent : prevCount;
            const countIncreased = currentCount > effectivePrev;
            const boostDelta = countIncreased ? Math.max(1, currentCount - effectivePrev) : 0;
            if (newBoostTs && (newBoostTs !== oldBoostTs || countIncreased)) {
                const boostKey = `${guildId}:${newMember.id}`;
                const lastAnnouncedCount = boostAnnounceCache.get(boostKey);
                if (countIncreased && lastAnnouncedCount === currentCount) {
                    boostCountCache.set(guildId, currentCount);
                    return;
                }
                await addPerkRoleIfPossible(newMember);
                const sendTimes = countIncreased ? boostDelta : 1;
                await sendBoostEmbeds(boostAnnounceChannel, newMember, sendTimes, currentCount);
                boostAnnounceCache.set(boostKey, currentCount);

                if (!boostFollowupLocks.get(boostKey)) {
                    boostFollowupLocks.set(boostKey, true);
                    setTimeout(async () => {
                        try {
                            const freshGuild = await newMember.guild.fetch().catch(() => null);
                            const latestCount = Number(freshGuild?.premiumSubscriptionCount || newMember.guild.premiumSubscriptionCount || 0);
                            const knownCount = Number(boostCountCache.get(guildId) || currentCount);
                            const missing = Math.max(0, latestCount - knownCount);
                            if (missing > 0) {
                                await sendBoostEmbeds(boostAnnounceChannel, newMember, missing, latestCount);
                                boostAnnounceCache.set(boostKey, latestCount);
                                boostCountCache.set(guildId, latestCount);
                            }
                        } catch {}
                        boostFollowupLocks.delete(boostKey);
                    }, 5000);
                }
            }
            boostCountCache.set(guildId, currentCount);
        } catch (error) {
            global.logger.error(error);
        }
    }
};
