const { EmbedBuilder } = require('discord.js');
const suggestion = require('../../Schemas/Suggestion/suggestionSchema.js');

async function handleSuggestionVote(interaction) {
    if (!interaction.guild || !interaction.message) return false;
    if (!interaction.isButton || !interaction.isButton()) return false;
    const data = await suggestion.findOne({ GuildID: interaction.guild.id, Msg: interaction.message.id });
    if (!data) return false;
    const message = await interaction.channel.messages.fetch(data.Msg);

    if (interaction.customId === 'upv') {
        if (data.Upmembers.includes(interaction.user.id)) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non puoi votare di nuovo! Hai già votato per questo suggerimento')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
            return true;
        }

        let Downvotes = data.downvotes;
        if (data.Downmembers.includes(interaction.user.id)) {
            Downvotes = Downvotes - 1;
            data.downvotes = data.downvotes - 1;
        }
        data.Upmembers.push(interaction.user.id);
        data.Downmembers.pull(interaction.user.id);
        const newEmbed = EmbedBuilder.from(message.embeds[0]).setFields(
            { name: `<:vegacheckmark:1443666279058772028>`, value: `**${data.upvotes + 1}**`, inline: false },
            { name: `<:vegax:1443934876440068179>`, value: `**${Downvotes}**`, inline: false }
        );

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('upv')
                    .setEmoji('<:vegacheckmark:1443666279058772028>')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('downv')
                    .setEmoji('<:vegax:1443934876440068179>')
                    .setStyle(ButtonStyle.Secondary),
            );
        await interaction.update({ embeds: [newEmbed], components: [button] });
        data.upvotes++;
        await data.save();
        return true;
    }
    
    if (interaction.customId === 'downv') {
        if (data.Downmembers.includes(interaction.user.id)) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription('<:vegax:1443934876440068179> Non puoi votare di nuovo! Hai già votato per questo suggerimento')
                        .setColor('Red')
                ],
                flags: 1 << 6
            });
            return true;
        }
        let Upvotes = data.upvotes;
        if (data.Upmembers.includes(interaction.user.id)) {
            Upvotes = Upvotes - 1;
            data.upvotes = data.upvotes - 1;
        }
        data.Downmembers.push(interaction.user.id);
        data.Upmembers.pull(interaction.user.id);
        const newEmbed = EmbedBuilder.from(message.embeds[0]).setFields(
            { name: `<:vegacheckmark:1443666279058772028>`, value: `**${Upvotes}**`, inline: false },
            { name: `<:vegax:1443934876440068179>`, value: `**${data.downvotes + 1}**`, inline: false }
        );

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('upv')
                    .setEmoji('<:vegacheckmark:1443666279058772028>')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('downv')
                    .setEmoji('<:vegax:1443934876440068179>')
                    .setStyle(ButtonStyle.Secondary),
            );

        await interaction.update({ embeds: [newEmbed], components: [button] });
        data.downvotes++;
        await data.save();
        return true;
    }
    return false;
}

module.exports = { handleSuggestionVote };