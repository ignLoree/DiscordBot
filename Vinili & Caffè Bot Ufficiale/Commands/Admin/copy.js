const { safeEditReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, PermissionsBitField } = require('discord.js')
const { default: axios } = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('copy')
        .setDescription('Ruba e aggiungi sul tuo server.')
        .addSubcommand(sub =>
            sub.setName('emoji')
                .setDescription('Ruba un\'emoji e aggiungila al tuo server.')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('L\'emoji che vuoi rubare.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('nome')
                        .setDescription('Il nome per l\'emoji.')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('sticker')
                .setDescription('Ruba uno sticker.'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return await safeEditReply(interaction, {
            embeds: [
                new EmbedBuilder()
                    .setDescription('<:vegax:1443934876440068179> Non hai il permesso per fare questo comando.')
                    .setColor("Red")
            ],
            flags: 1 << 6
        });

        switch (sub) {
            case 'emoji': {
                let emoji = interaction.options.getString('id')?.trim();
                const name = interaction.options.getString('nome');
                if (emoji.startsWith("<") && emoji.endsWith(">")) {
                    const id = emoji.match(/\d{15,}/g)[0];
                    const type = await axios.get(`https://cdn.discordapp.com/emojis/${id}.gif`)
                        .then(image => {
                            if (image) return "gif"
                            else return "png"
                        }).catch(err => {
                            return "png"
                        })
                    emoji = `https://cdn.discordapp.com/emojis/${id}.${type}`
                }
                if (!emoji.startsWith("http") || !emoji.startsWith("https")) {
                    return safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription("<:vegax:1443934876440068179> Non puoi rubare le emoji predefinite!")
                        ],
                        flags: 1 << 6
                    });
                }
                try {
                    const newEmoji = await interaction.guild.emojis.create({
                        attachment: emoji,
                        name: name
                    });
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor("#6f4e37")
                                .setDescription(`<:vegacheckmark:1443666279058772028> Aggiunta l'emoji ${newEmoji}, con il nome ${name}`)
                        ]
                    });
                } catch (err) {
                    global.logger.info(err);
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription("<:vegax:1443934876440068179> Non puoi aggiungere questa emoji perchÃ© hai raggiunto il limite di emoji del server.")
                        ],
                        flags: 1 << 6
                    });
                }
            }

            case 'sticker':
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#6f4e37')
                            .setDescription(`<a:loading:1443934440614264924> Aspetto lo sticker...`)
                    ],
                    flags: 1 << 6
                })
                const filter = (m) => m.author.id === interaction.user.id;
                const collector = interaction.channel.createMessageCollector({ filter: filter, time: 15000, max: 1 });
                collector.on('collect', async m => {
                    const sticker = m.stickers.first();
                    const { guild } = interaction;
                    if (m.stickers.size == 0) return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription(`<:vegax:1443934876440068179> Questo non Ã¨ uno sticker...`)
                        ], flags: 1 << 6
                    })
                    if (sticker.url.endsWith('.json')) return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription(`<:vegax:1443934876440068179> Non Ã¨ uno sticker valido...`)
                        ], flags: 1 << 6
                    })
                    try {
                        const newSticker = await guild.stickers.create({
                            name: sticker.name,
                            description: sticker.description || '',
                            tags: sticker.tags,
                            file: sticker.url
                        })
                        await safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('#6f4e37')
                                    .setDescription(`<:vegacheckmark:1443666279058772028> Lo sticker col nome **${newSticker.name}** Ã¨ stato creato!`)
                            ]
                        })
                    } catch (err) {
                        global.logger.info(err)
                        safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setColor('Red')
                                    .setDescription("<:vegax:1443934876440068179> Non puoi aggiungere questo sticker perchÃ© hai raggiunto il limite di sticker del server.")
                            ], flags: 1 << 6
                        })
                    }
                })
                collector.on('end', async reason => {
                    if (reason === 'time') return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor('Red')
                                .setDescription(`<:vegax:1443934876440068179> Scaduto il tempo..`)
                        ], flags: 1 << 6
                    })
                })
        }
    }
}

