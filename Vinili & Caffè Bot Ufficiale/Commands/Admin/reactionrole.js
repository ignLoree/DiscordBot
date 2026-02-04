const { safeEditReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, PermissionFlagsBits } = require('discord.js')
const reaction = require('../../Schemas/ReactionRole/reactionroleSchema')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reaction-roles')
        .setDescription('Usa il sistema delle reaction roles.')
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Aggiungi un ruolo al messaggio.')
                .addStringOption(op =>
                    op.setName('id')
                        .setDescription('L\'ID del messaggio a cui aggiungere la reazione.')
                        .setRequired(true)
                )
                .addStringOption(op =>
                    op.setName('emoji')
                        .setDescription('L\'emoji con cui deve reagire.')
                        .setRequired(true)
                )
                .addRoleOption(op =>
                    op.setName('role')
                        .setDescription('Il ruolo che deve dare quando reagisce.')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Rimuovi un ruolo al messaggio.')
                .addStringOption(op =>
                    op.setName('id')
                        .setDescription('L\'ID del messaggio a cui aggiungere la reazione.')
                        .setRequired(true)
                )
                .addStringOption(op =>
                    op.setName('emoji')
                        .setDescription('L\'emoji con cui deve reagire.')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const { options, guild, channel } = interaction
        const sub = options.getSubcommand()
        const emoji = options.getString('emoji')
        await interaction.deferReply()
        let e;
        const message = await channel.messages.fetch(options.getString('id')).catch(err => {
            e = err;
        })
        const data = await reaction.findOne({ Guild: guild.id, Message: message.id, Emoji: emoji });

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await safeEditReply(interaction, {
            embed: [
                new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('<:vegax:1443934876440068179> Non hai i permessi per fare questo comando.')
            ], flags: 1 << 6
        })

        if (e) return await safeEditReply(interaction, {
            embed: [
                new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`<:vegax:1443934876440068179> Sii sicuro che questo messaggio sia in questo canale: ${channel}.`)
            ], flags: 1 << 6
        })

        switch (sub) {
            case 'add':
                if (data) {
                    return await safeEditReply(interaction, {
                        embed: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription(`<:vegax:1443934876440068179> Hai già una reaction attiva con questa ${emoji} su questo messaggio.`)
                        ], flags: 1 << 6
                    })
                } else {
                    const role = options.getRole('role');
                    await reaction.create({
                        Guild: guild.id,
                        Message: message.id,
                        Emoji: emoji,
                        Role: role.id
                    })

                    const embed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setDescription(`<:vegacheckmark:1443666279058772028> Ho aggiunto la reaction role al messaggio ${message.url} con l'emoji ${emoji} e il ruolo ${role}`)
                    
                    await message.react(emoji).catch(err => { });
                    await safeEditReply(interaction, { embeds: [embed], flags: 1 << 6 });
                }
                break;
            case 'remove':
                if (!data) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription('<:vegax:1443934876440068179> Non esiste questa reaction role')
                        ],
                        flags: 1 << 6
                    })
                } else {
                    await reaction.deleteMany({
                        Guild: guild.id,
                        Message: message.id,
                        Emoji: emoji
                    })

                    const embed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setDescription(`<:vegacheckmark:1443666279058772028> Ho rimosso la reaction role al messaggio ${message.url} con l'emoji ${emoji}`)
                    
                    await safeEditReply(interaction, { embeds: [embed], flags: 1 << 6 });
                }
        }
    }
}

