const { safeEditReply } = require('../../Utils/Moderation/reply');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const SuggestionCount = require('../../Schemas/Suggestion/suggestionSchema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Invia un suggerimento.')
        .addSubcommand(sub => sub
            .setName('suggest')
            .setDescription('Invia un suggerimento.')
            .addStringOption(option =>
                option.setName('suggerimento')
                    .setDescription(`Scrivi il tuo suggerimento.`)
                    .setRequired(true)
            ))
        .addSubcommand(sub => sub
            .setName('accept')
            .setDescription('Accetta un suggerimento.')
            .addStringOption(option =>
                option.setName('suggestion_id')
                    .setDescription(`ID del suggerimento.`)
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription(`Il motivo per cui accetti il suggerimento.`)
                    .setRequired(true)
            )
        )
        .addSubcommand(sub => sub
            .setName('reject')
            .setDescription('Rifiuta un suggerimento.')
            .addStringOption(option =>
                option.setName('suggestion_id')
                    .setDescription(`ID del suggerimento.`)
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason')
                    .setDescription(`Il motivo per cui rifiuti il suggerimento.`)
                    .setRequired(true)
            )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()
        const { options } = interaction
        const suggestmsg = options.getString('suggerimento')
        switch (sub) {
            case 'suggest':
                try {
                    const suggestionchannel = interaction.guild.channels.cache.get("1442569147559973094");
                    let counter = await SuggestionCount.findOne();
                    if (!counter) {
                        counter = await SuggestionCount.create({ count: 0 });
                    }
                    counter.count++;
                    await counter.save();
                    const SuggestionID = counter.count;
                    const suggestionembed = new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setDescription(`**<a:VC_CrownYellow:1330194103564238930> Mandato da:** 
${interaction.user.username}
**<:pinnednew:1443670849990430750> Suggerimento:** 
${suggestmsg} 
**<:infoglowingdot:1443660296823767110> Numero voti:**`)
                        .setFields({ name: `<:vegacheckmark:1443666279058772028>`, value: `0`, inline: false }, { name: `<:vegax:1443934876440068179>`, value: `0`, inline: false })
                        .setTimestamp()
                        .setFooter({ text: `User ID: ${interaction.user.id} | sID: ${SuggestionID}` });
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
                    await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`Hey, ${interaction.user.tag}. Il tuo suggerimento è stato inviato nel canale ${suggestionchannel} per essere votato!
Per favore attendi mentre uno staff lo approva o lo rifiuta.
Il tuo ID Suggerimento (sID) è **${SuggestionID}**`)
                                .setColor('#6f4e37')
                                .setTimestamp()
                                .setFooter({ text: `Guild ID: ${interaction.guild.id} | sID: ${SuggestionID}` })
                        ],
                        flags: 1 << 6
                    });
                    const msg = await suggestionchannel.send({
                        content: `<@&1442568894349840435>`,
                        embeds: [suggestionembed],
                        components: [button]
                    });
                    msg.createMessageComponentCollector();
                    await SuggestionCount.create({
                        GuildID: interaction.guild.id,
                        ChannelID: suggestionchannel.id,
                        Msg: msg.id,
                        AuthorID: interaction.user.id,
                        upvotes: 0,
                        downvotes: 0,
                        Upmembers: [],
                        Downmembers: [],
                        sID: SuggestionID
                    });
                    const thread = await msg.startThread({
                        name: `Thread per il suggerimento ${SuggestionID}`,
                        autoArchiveDuration: 10080,
                    });
                    await thread.send(`Ho creato questo thread per discutere del suggerimento di <@${interaction.user.id}>`);
                } catch (error) {
                    global.logger.error(error);
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.")
                                .setColor('Red')
                        ],
                        flags: 1 << 6
                    });
                }
                break;
            case 'accept':
                const suggestionId = options.getString('suggestion_id');
                const reason = options.getString('reason');
                const suggestionData = await SuggestionCount.findOne({
                    GuildID: interaction.guild.id,
                    sID: suggestionId
                });
                if (!suggestionData) {
                    return safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:vegax:1443934876440068179> Suggerimento con ID ${suggestionId} non trovato.`)
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                }
                const suggestionChannel = interaction.guild.channels.cache.get("1442569147559973094");
                const suggestionMessage = await suggestionChannel.messages.fetch(suggestionData.Msg);
                const oldEmbed = suggestionMessage.embeds[0];
                const newEmbed = new EmbedBuilder()
                    .setColor("Green")
                    .setTitle("<:pinnednew:1443670849990430750> Suggerimento Accettato!")
                    .setDescription(oldEmbed.description)
                    .setTimestamp()
                    .setFooter(oldEmbed.footer)
                    .setFields(oldEmbed.fields)
                    .addFields({ name: "<:pinnednew:1443670849990430750> Motivo:", value: reason });
                await suggestionMessage.edit({ embeds: [newEmbed], components: [] });
                const suggestionAuthor = await interaction.client.users.fetch(suggestionData.AuthorID);
                await suggestionAuthor.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Green")
                            .setDescription(`<a:ThankYou:1329504268369002507> Il tuo suggerimento in **Vinili & Caffè** è stato accettato!\n <:pinnednew:1443670849990430750> Motivo: ${reason}`)
                    ]
                });
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("<:vegacheckmark:1443666279058772028> Suggerimento accettato con successo.")
                            .setColor("Green")
                    ],
                    flags: 1 << 6
                });
                break;
            case 'reject':
                const rejectSuggestionId = options.getString('suggestion_id');
                const rejectReason = options.getString('reason');
                const rejectSuggestionData = await SuggestionCount.findOne({
                    GuildID: interaction.guild.id,
                    sID: rejectSuggestionId
                });
                if (!rejectSuggestionData) {
                    return safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:vegax:1443934876440068179> Suggerimento con ID ${rejectSuggestionId} non trovato.`)
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                }
                const rejectSuggestionChannel = interaction.guild.channels.cache.get("1442569147559973094");
                const rejectSuggestionMessage = await rejectSuggestionChannel.messages.fetch(rejectSuggestionData.Msg);
                const rejectOldEmbed = rejectSuggestionMessage.embeds[0];
                const rejectNewEmbed = new EmbedBuilder()
                    .setColor("Red")
                    .setTitle("<:pinnednew:1443670849990430750> Suggerimento Rifiutato!")
                    .setDescription(rejectOldEmbed.description)
                    .setFields(oldEmbed.fields)
                    .setTimestamp()
                    .addFields({ name: "<:attentionfromvega:1443651874032062505> Motivo del rifiuto:", value: rejectReason });
                await rejectSuggestionMessage.edit({ embeds: [rejectNewEmbed], components: [] });
                const rejectSuggestionAuthor = await interaction.client.users.fetch(rejectSuggestionData.AuthorID);
                await rejectSuggestionAuthor.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setDescription(`<a:ThankYou:1329504268369002507> Il tuo suggerimento in **Vinili & Caffè** è stato rifiutato.\n <:attentionfromvega:1443651874032062505> Motivo: ${rejectReason}`)
                    ]
                }).catch((err) => global.logger.info(err));
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("<:vegacheckmark:1443666279058772028> Suggerimento rifiutato con successo.")
                            .setColor("Red")
                    ],
                    flags: 1 << 6
                });
                break;
        }
    }
}
