const { safeEditReply } = require('../../Utils/Moderation/reply');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const poll = require('../../Schemas/Poll/pollSchema');
const IDs = require('../../Utils/Config/ids');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("poll")
        .setDescription("Crea un poll.")
        .addSubcommand(sub =>
            sub
                .setName("create")
                .setDescription("Crea un nuovo poll")
                .addStringOption(o => o.setName("domanda").setDescription("Domanda del poll").setRequired(true))
                .addStringOption(o => o.setName("risposta1").setDescription("Risposta 1").setRequired(true))
                .addStringOption(o => o.setName("risposta2").setDescription("Risposta 2").setRequired(true))
                .addStringOption(o => o.setName("risposta3").setDescription("Risposta 3").setRequired(false))
                .addStringOption(o => o.setName("risposta4").setDescription("Risposta 4").setRequired(false))
                .addStringOption(o => o.setName("risposta5").setDescription("Risposta 5").setRequired(false))
                .addStringOption(o => o.setName("risposta6").setDescription("Risposta 6").setRequired(false))
                .addStringOption(o => o.setName("risposta7").setDescription("Risposta 7").setRequired(false))
                .addStringOption(o => o.setName("risposta8").setDescription("Risposta 8").setRequired(false))
                .addStringOption(o => o.setName("risposta9").setDescription("Risposta 9").setRequired(false))
                .addStringOption(o => o.setName("risposta10").setDescription("Risposta 10").setRequired(false))
        )
        .addSubcommand(sub =>
            sub
                .setName("remove")
                .setDescription("Rimuove l'ultimo poll inviato")
        )
        .addSubcommand(sub =>
            sub
                .setName("edit")
                .setDescription("Modifica un poll esistente")
                .addIntegerOption(o =>
                    o.setName("id")
                        .setDescription("ID del poll da modificare (numero)")
                        .setRequired(true))
                .addStringOption(o =>
                    o.setName("domanda")
                        .setDescription("Nuova domanda (opzionale)")
                        .setRequired(false))
                .addStringOption(o => o.setName("r1").setDescription("Nuova risposta 1").setRequired(false))
                .addStringOption(o => o.setName("r2").setDescription("Nuova risposta 2").setRequired(false))
                .addStringOption(o => o.setName("r3").setDescription("Nuova risposta 3").setRequired(false))
                .addStringOption(o => o.setName("r4").setDescription("Nuova risposta 4").setRequired(false))
                .addStringOption(o => o.setName("r5").setDescription("Nuova risposta 5").setRequired(false))
                .addStringOption(o => o.setName("r6").setDescription("Nuova risposta 6").setRequired(false))
                .addStringOption(o => o.setName("r7").setDescription("Nuova risposta 7").setRequired(false))
                .addStringOption(o => o.setName("r8").setDescription("Nuova risposta 8").setRequired(false))
                .addStringOption(o => o.setName("r9").setDescription("Nuova risposta 9").setRequired(false))
                .addStringOption(o => o.setName("r10").setDescription("Nuova risposta 10").setRequired(false))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand()
        await interaction.deferReply()

        if (subcommand === "create") {
            try {
                const channel = interaction.guild.channels.cache.get(IDs.channels.polls);
                const domanda = interaction.options.getString("domanda");
                const answers = [];

                for (let i = 1; i <= 10; i++) {
                    answers.push(interaction.options.getString(`risposta${i}`) || null);
                }

                const numberEmojis = [
                    '<:1_:1444099163116535930>',
                    '<:2_:1444099161673826368>',
                    '<:3_:1444099160294031471>',
                    '<:4_:1444099158859321435>',
                    '<:5_:1444099157194440884>',
                    '<:6_:1444099156007194887>',
                    '<:7_:1444099154610618368>',
                    '<:8_:1444099153125703690>',
                    '<:9_:1444099151443919004>',
                    '<:VC_10:1469357839066730627>'
                ];

                let foundEmpty = false;
                for (let i = 2; i < answers.length; i++) {
                    if (!answers[i]) foundEmpty = true;
                    if (foundEmpty && answers[i]) {
                        return await safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`<:vegax:1443934876440068179> Non puoi inserire la risposta **${i + 1}** senza aver riempito le precedenti!`)
                                    .setColor("Red")
                            ],
                            flags: 1 << 6
                        });
                    }
                }

                let answersText = "";
                let validReactions = [];

                answers.forEach((answer, index) => {
                    if (answer) {
                        answersText += `${numberEmojis[index]} __${answer}__\n`;
                        validReactions.push(numberEmojis[index]);
                    }
                });

                let pollCount = await poll.findOne();
                if (!pollCount) pollCount = new poll();
                pollCount.pollcount++;
                await pollCount.save();

                const pollMessage = await channel.send({
                    content: `
<:channeltext:1443247596922470551> __Poll #${pollCount.pollcount}__

<a:questionexclaimanimated:1443660299994533960> **${domanda}**

${answersText}

<:Discord_Mention:1329524304790028328>︲<@&1442569014474965033>`
                });

                for (const emoji of validReactions) {
                    const id = emoji.match(/:(\d+)>$/)?.[1];
                    if (id) await pollMessage.react(id);
                }

                pollCount.messageId = pollMessage.id;
                await pollCount.save();

                return await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:vegacheckmark:1443666279058772028> Poll inviato correttamente in <#${IDs.channels.polls}>!`)
                            .setColor('#6f4e37')
                    ]
                });
            } catch (err) {
                global.logger.error(err);
                return await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("<:vegax:1443934876440068179> Errore durante la creazione del poll.")
                            .setColor("Red")
                    ],
                    flags: 1 << 6
                });
            }
        }

        if (subcommand === "remove") {
            try {
                const channel = interaction.guild.channels.cache.get(IDs.channels.polls);
                let lastPoll = await poll.findOne().sort({ pollcount: -1 });

                if (!lastPoll || !lastPoll.messageId) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("<:vegax:1443934876440068179> Nessun poll trovato da rimuovere.")
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                } try {
                    const msg = await channel.messages.fetch(lastPoll.messageId);
                    await msg.delete();
                } catch { }
                await lastPoll.deleteOne();
                return await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:VC_Trash:1460645075242451025> L'ultimo poll (#${lastPoll.pollcount}) è stato rimosso.`)
                            .setColor('#6f4e37')
                    ]
                });
            } catch (err) {
                global.logger.error(err);
                return await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("<:vegax:1443934876440068179> Errore durante la rimozione del poll.")
                            .setColor("Red")
                    ],
                    flags: 1 << 6
                });
            }
        }
        if (subcommand === "edit") {
            try {
                const id = interaction.options.getInteger("id");
                const newQuestion = interaction.options.getString("domanda");
                const pollData = await poll.findOne({ pollcount: id });
                const channel = interaction.guild.channels.cache.get(IDs.channels.polls);
                let pollMessage;

                if (!pollData) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:vegax:1443934876440068179> Nessun poll con ID **${id}** trovato.`)
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                }

                try {
                    pollMessage = await channel.messages.fetch(pollData.messageId);
                } catch {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:vegax:1443934876440068179> Il messaggio del poll non esiste più.`)
                                .setColor("Red")
                        ],
                        flags: 1 << 6
                    });
                }
                const answers = [];
                for (let i = 1; i <= 10; i++) {
                    const existing = pollMessage.content.match(/__([^_]+)__/g)?.[i - 1];
                    const extracted = existing?.replace(/__/g, "") || null;
                    const newValue = interaction.options.getString(`r${i}`);
                    answers.push(newValue ?? extracted);
                }

                let foundEmpty = false;
                for (let i = 2; i < answers.length; i++) {
                    if (!answers[i]) foundEmpty = true;
                    if (foundEmpty && answers[i]) {
                        return await safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription(`<:vegax:1443934876440068179> Non puoi impostare risposta ${i + 1} senza aver riempito le precedenti!`)
                                    .setColor("Red")
                            ],
                            flags: 1 << 6
                        });
                    }
                }
                const numberEmojis = [
                    '<:1_:1444099163116535930>',
                    '<:2_:1444099161673826368>',
                    '<:3_:1444099160294031471>',
                    '<:4_:1444099158859321435>',
                    '<:5_:1444099157194440884>',
                    '<:6_:1444099156007194887>',
                    '<:7_:1444099154610618368>',
                    '<:8_:1444099153125703690>',
                    '<:9_:1444099151443919004>',
                    '<:VC_10:1469357839066730627>'
                ];

                let answersText = "";
                let validReactions = [];
                answers.forEach((answer, index) => {
                    if (answer) {
                        answersText += `${numberEmojis[index]} __${answer}__\n`;
                        validReactions.push(numberEmojis[index]);
                    }
                });

                const question = newQuestion || pollMessage.content.match(/\*\*(.*?)\*\*/)?.[1] || "<:vegax:1443934876440068179> Domanda non trovata";

                await pollMessage.edit({
                    content: `
<:channeltext:1443247596922470551> __Poll #${id}__

<a:questionexclaimanimated:1443660299994533960> **${question}**

${answersText}

<:Discord_Mention:1329524304790028328>︲<@&1442569014474965033>`
                });

                await pollMessage.reactions.removeAll().catch(() => { });
                for (const reaction of validReactions) {
                    const emojiId = reaction.match(/:(\d+)>$/)?.[1];
                    if (emojiId) await pollMessage.react(emojiId);
                }
                return await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:vegax:1443934876440068179> Poll **#${id}** aggiornato correttamente!`)
                            .setColor('#6f4e37')
                    ],
                    flags: 1 << 6
                });
            } catch (err) {
                global.logger.error(err);
                return await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:vegax:1443934876440068179> Errore durante la modifica del poll.`)
                            .setColor("Red")
                    ],
                    flags: 1 << 6
                });
            }
        }
    }
};

