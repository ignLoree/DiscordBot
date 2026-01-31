const { EmbedBuilder } = require('discord.js');

function toUnix(date) {
    return Math.floor(date.getTime() / 1000);
}

module.exports = {
    name: "guildMemberAdd",
    async execute(member) {
        try {
            if (member.user?.bot) {
                try {
                    await member.roles.add(['1329080094206984215', '1442568954181713982']);
                } catch (error) {
                    global.logger.error('[guildMemberAdd] Failed to add bot roles:', error);
                }
                return;
            }
            const minimumAgeDays = 3;
            const minAgeMs = minimumAgeDays * 24 * 60 * 60 * 1000;
            const accountAgeMs = Date.now() - member.user.createdAt.getTime();
            if (accountAgeMs < minAgeMs) {
                const logChannel = member.guild.channels.cache.get('1442569294796820541');
                const createdTs = toUnix(member.user.createdAt);
                const nowTs = Math.floor(Date.now() / 1000);
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`You have been kicked! in ${member.guild.name}!`)
                    .setColor('#6f4e37')
                    .setDescription(
                        [
                            `<:profile:1461732907508039834> **Member:** ${member.user.tag} [${member.user.id}]`,
                            `<:rightSort:1461726104422453298> **Reason:** Account is too young to be allowed.`,
                            `<:space:1461733157840621608><:rightSort:1461726104422453298> **Accounts Age:** <t:${createdTs}:R>.`,
                            `<:space:1461733157840621608><:rightSort:1461726104422453298> **Minimum Age:** \`${minimumAgeDays}\` days.`
                        ].join("\n")
                    );
                let dmSent = false;
                try {
            if (member.user?.bot) {
                try {
                    await member.roles.add(['1329080094206984215', '1442568954181713982']);
                } catch (error) {
                    global.logger.error('[guildMemberAdd] Failed to add bot roles:', error);
                }
                return;
            }
                    await member.send({ embeds: [dmEmbed] });
                    dmSent = true;
                } catch {
                    dmSent = false;
                }
                let punished = false;
                try {
            if (member.user?.bot) {
                try {
                    await member.roles.add(['1329080094206984215', '1442568954181713982']);
                } catch (error) {
                    global.logger.error('[guildMemberAdd] Failed to add bot roles:', error);
                }
                return;
            }
                    await member.kick("Account is too young to be allowed.");
                    punished = true;
                } catch {
                    punished = false;
                }
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setTitle(`**${member.user.username} has been kicked!!**`)
                        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                        .setDescription(
                            [
                                `<:profile:1461732907508039834> **Member:** ${member.user.tag} **[${member.user.id}]**`,
                                `<:rightSort:1461726104422453298> **Reason:** Account is too young to be allowed.`,
                                `<:space:1461733157840621608><:rightSort:1461726104422453298> **Accounts Age:** <t:${createdTs}:R>.`,
                                `<:space:1461733157840621608><:rightSort:1461726104422453298> **Minimum Age:** \`${minimumAgeDays} days\`.`,
                                "",
                                "**More Details:**",
                                `<:noDM:1463645183840354517> **Member Direct Messaged?** ${dmSent ? "<:success:1461731530333229226>" : "<:cancel:1461730653677551691>"}`,
                                `<:space:1461733157840621608><:rightSort:1461726104422453298>**\`Dmng disabled.\`**`,
                                `<:kick:1463645181965242581> **Member Punished?** ${punished ? "<:success:1461731530333229226>" : "<:cancel:1461730653677551691>"}`
                            ].join("\n")
                        );
                    const actionEmbed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setTitle("Member Kick")
                        .setDescription(
                            [
                                `<:rightSort:1461726104422453298> **Responsible:** <@${member.client.user.id}> / ${member.client.user.id}`,
                                `<:rightSort:1461726104422453298> **Target:** ${member.user} / ${member.user.id}`,
                                `<:rightSort:1461726104422453298> **Date:** <t:${nowTs}:F>`,
                                `<:rightSort:1461726104422453298> **Reason:** Account is too young to be allowed.`
                            ].join("\n")
                        );
                    await logChannel.send({ embeds: [logEmbed, actionEmbed] });
                }
                return;
            }
            const channelwelcome = member.guild.channels.cache.find(channel => channel.id === '1442569130573303898');

            if (!channelwelcome) {
                global.logger.info("[guildMemberAdd] Welcome channel not found.");
                return;
            }

            if (member.guild === null) return;
            const totalvoicechannel = member.guild.channels.cache.find(channel => channel.id === '1442569096700104754');
            if (!totalvoicechannel || totalvoicechannel === null) return;

            const totalmembers = `${member.guild.memberCount}`;
            totalvoicechannel.setName(`༄☕︲User: ${totalmembers}`);
            const memberThumbnail = member.user.displayAvatarURL({ size: 256 });

            const userEmbed = new EmbedBuilder()
                .setAuthor({ name: `${member.user.username}` })
                .setTitle(`<:pepe_wave:1329488693739782274> **Welcome to __${member.guild.name}__**`)
                .setDescription(`<:dot:1443660294596329582> **Passa per questi canali.**\n\n <:customprofile:1443925456972808304> <#1442569103582695536>\n <:rules:1443307208543703131> <#1442569111119990887>\n <a:MimmyGift:1329446511372664886> <#1442569058406109216>`)
                .setThumbnail(memberThumbnail)
                .setTimestamp()
                .setColor('#6f4e37')
                .setFooter({ text: `Ora siamo in ${member.guild.memberCount}` });

            await channelwelcome.send({ content: `<:pepe_wave:1329488693739782274> ${member.user}`, embeds: [userEmbed] });
        } catch (error) {
            global.logger.error(error);
        }
    }
};

