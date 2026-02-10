const { safeEditReply } = require('../../Utils/Moderation/reply');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Staff = require('../../Schemas/Staff/staffSchema');
const IDs = require('../../Utils/Config/ids');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("valutazione")
        .setDescription("Gestisci le valutazioni degli staffer")
        .addSubcommandGroup(group =>
            group.setName("positiva")
                .setDescription("Gestisci valutazioni positive")
                .addSubcommand(sub =>
                    sub.setName("add")
                        .setDescription("Aggiungi una valutazione positiva a uno staffer")
                        .addUserOption(opt => opt.setName("staffer").setDescription("Staffer").setRequired(true))
                        .addStringOption(opt => opt.setName("motivo").setDescription("Motivazione").setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName("remove")
                        .setDescription("Rimuovi una valutazione positiva")
                        .addUserOption(opt => opt.setName("staffer").setDescription("Staffer").setRequired(true))
                        .addIntegerOption(opt => opt.setName("id").setDescription("ID valutazione").setRequired(true))
                        .addStringOption(opt => opt.setName("motivo").setDescription("Motivazione rimozione").setRequired(true))
                )
        )
        .addSubcommandGroup(group =>
            group.setName("negativa")
                .setDescription("Gestisci valutazioni negative")
                .addSubcommand(sub =>
                    sub.setName("add")
                        .setDescription("Aggiungi una valutazione negativa a uno staffer")
                        .addUserOption(opt => opt.setName("staffer").setDescription("Staffer").setRequired(true))
                        .addStringOption(opt => opt.setName("motivo").setDescription("Motivazione").setRequired(true))
                )
                .addSubcommand(sub =>
                    sub.setName("remove")
                        .setDescription("Rimuovi una valutazione negativa")
                        .addUserOption(opt => opt.setName("staffer").setDescription("Staffer").setRequired(true))
                        .addIntegerOption(opt => opt.setName("id").setDescription("ID valutazione").setRequired(true))
                        .addStringOption(opt => opt.setName("motivo").setDescription("Motivazione rimozione").setRequired(true))
                )
        )
        .addSubcommand(sub =>
            sub.setName("media")
                .setDescription("Vedi le valutazioni di uno staffer")
                .addUserOption(opt => opt.setName("staffer").setDescription("Staffer").setRequired(true))
        ),
    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup(false)
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply({ flags: 1 << 6 })
        const utentee = interaction.options.getUser('staffer')
        const reason = interaction.options.getString("motivo")
        const channel = interaction.guild.channels.cache.get(IDs.channels.staffValutazioniLog)
        try {
            let StaffDoc = await Staff.findOne({ guildId: interaction.guild.id, userId: utentee.id });
            if (!StaffDoc) {
                StaffDoc = new Staff({
                    guildId: interaction.guild.id,
                    userId: utentee.id,
                    rolesHistory: [],
                    warnReasons: [],
                    positiveReasons: [],
                    negativeReasons: [],
                    partnerActions: [],
                    positiveCount: 0,
                    negativeCount: 0,
                    valutazioniCount: 0
                });
            }
            const checkPermissions = () => {
                const allowedRoleID = IDs.roles.staff;
                const stafferMember = interaction.guild.members.cache.get(utentee.id);
                if (!stafferMember || !stafferMember.roles.cache.has(allowedRoleID)) return false;
                if (interaction.user.id === utentee.id) return false;
                return true;
            };
            if (group === "positiva") {
                if (!checkPermissions()) return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!").setColor("Red")], flags: 1 << 6 });
                if (sub === "add") {
                    StaffDoc.valutazioniCount++;
                    StaffDoc.positiveCount++;
                    if (!Array.isArray(StaffDoc.positiveReasons)) StaffDoc.positiveReasons = [];
                    StaffDoc.positiveReasons.push(reason);
                    await StaffDoc.save();
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: `Valutazione eseguita da ${interaction.user.username}`, iconURL: `${interaction.user.displayAvatarURL()}` })
                        .setTitle(`<a:laydowntorest:1444006796661358673> **__VALUTAZIONE POSITIVA__** \#${StaffDoc.positiveCount}\``)
                        .setThumbnail(`${utentee.displayAvatarURL()}`)
                        .setDescription(`<:discordstaff:1443651872258003005> <a:vegarightarrow:1443673039156936837> ${utentee} <:pinnednew:1443670849990430750> __${reason}__ <a:loading:1443934440614264924> **ID Valutazione** __\`${StaffDoc.valutazioniCount}\`__`)
                        .setColor('#6f4e37')
                    await channel.send({ content: `${utentee}`, embeds: [embed] });
                    return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegacheckmark:1443666279058772028> Valutazione positiva registrata con successo!").setColor('#6f4e37')] });
                }
                if (sub === "remove") {
                    const removeId = interaction.options.getInteger("id");
                    if (!StaffDoc.positiveReasons[removeId - 1]) return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegax:1443934876440068179> ID non valido").setColor("Red")], flags: 1 << 6 });
                    StaffDoc.positiveReasons.splice(removeId - 1, 1);
                    StaffDoc.positiveCount = Math.max(0, StaffDoc.positiveCount - 1);
                    StaffDoc.valutazioniCount = Math.max(0, StaffDoc.valutazioniCount - 1);
                    await StaffDoc.save();
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: `Valutazione rimossa da ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                        .setTitle(`**__VALUTAZIONE POSITIVA RIMOSSA__**`)
                        .setDescription(`<:reportmessage:1443670575376765130> A __${utentee}__ è¨ stata **rimossa** una _Valutazione Positiva!_`)
                        .addFields(
                            { name: "Motivazione:", value: `${reason}`, inline: false },
                            { name: "__Numero Valutazioni Positive Aggiornato__", value: `Ora sei a \`${StaffDoc.positiveCount}\` valutazioni!`, inline: false },
                        )
                        .setColor("#6f4e37")
                    await channel.send({ embeds: [embed] });
                    return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegacheckmark:1443666279058772028> Valutazione positiva rimossa con successo!").setColor('#6f4e37')] });
                }
            }
            if (group === "negativa") {
                if (!checkPermissions()) return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegax:1443934876440068179> Non hai il permesso per fare questo comando!").setColor("Red")], flags: 1 << 6 });
                if (sub === "add") {
                    StaffDoc.valutazioniCount++;
                    StaffDoc.negativeCount++;
                    if (!Array.isArray(StaffDoc.negativeReasons)) StaffDoc.negativeReasons = [];
                    StaffDoc.negativeReasons.push(reason);
                    await StaffDoc.save();
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: `Valutazione eseguita da ${interaction.user.username}`, iconURL: `${interaction.user.displayAvatarURL()}` })
                        .setTitle(`<a:laydowntorest:1444006796661358673> **__VALUTAZIONE NEGATIVA__** \#${StaffDoc.negativeCount}\``)
                        .setThumbnail(`${utentee.displayAvatarURL()}`)
                        .setDescription(`<:discordstaff:1443651872258003005> <a:vegarightarrow:1443673039156936837> ${utentee} <:pinnednew:1443670849990430750> __${reason}__ <a:loading:1443934440614264924> **ID Valutazione** __\`${StaffDoc.valutazioniCount}\`__`)
                        .setColor('#6f4e37')
                    await channel.send({ content: `${utentee}`, embeds: [embed] });
                    return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegacheckmark:1443666279058772028> Valutazione negativa registrata con successo!").setColor('#6f4e37')] });
                }
                if (sub === "remove") {
                    const removeId = interaction.options.getInteger("id");
                    if (!StaffDoc.negativeReasons[removeId - 1]) return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegax:1443934876440068179> ID non valido").setColor("Red")], flags: 1 << 6 });
                    StaffDoc.negativeReasons.splice(removeId - 1, 1);
                    StaffDoc.negativeCount = Math.max(0, StaffDoc.negativeCount - 1);
                    StaffDoc.valutazioniCount = Math.max(0, StaffDoc.valutazioniCount - 1);
                    await StaffDoc.save();
                    const embed = new EmbedBuilder()
                        .setAuthor({ name: `Valutazione rimossa da ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                        .setTitle(`**__VALUTAZIONE NEGATIVA RIMOSSA__**`)
                        .setDescription(`<:reportmessage:1443670575376765130> A __${utentee}__ è stata **rimossa** una _Valutazione Negativa!_`)
                        .addFields(
                            { name: "Motivazione:", value: `${reason}`, inline: false },
                            { name: "__Numero Valutazioni Negativa Aggiornato__", value: `Ora sei a \`${StaffDoc.negativeCount}\` valutazioni!`, inline: false },
                        )
                        .setColor("#6f4e37")
                    await channel.send({ embeds: [embed] });
                    return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegacheckmark:1443666279058772028> Valutazione negativa rimossa con successo!").setColor('#6f4e37')] });
                }
            }
            if (sub === "media") {
                const doc = await Staff.findOne({ guildId: interaction.guild.id, userId: utentee.id });
                if (!doc) return await safeEditReply(interaction, { embeds: [new EmbedBuilder().setDescription("<:vegax:1443934876440068179> Nessuna valutazione trovata.").setColor("Red")], flags: 1 << 6 });
                const embed = new EmbedBuilder()
                    .setTitle(`Valutazioni di ${utentee.username}`)
                    .setColor("#6f4e37")
                    .addFields(
                        { name: "Positive", value: (doc.positiveReasons || []).map((r, i) => `\`${i + 1}\` " ${r}`).join("\n") || "Nessuna", inline: false },
                        { name: "Negative", value: (doc.negativeReasons || []).map((r, i) => `\`${i + 1}\` " ${r}`).join("\n") || "Nessuna", inline: false },
                        { name: "Totale", value: `Totali: ${doc.valutazioniCount}`, inline: false }
                    )
                return await safeEditReply(interaction, { embeds: [embed] });
            }

            return await safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription("<:vegax:1443934876440068179> Subcomando non valido.")
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
        } catch (err) {
            global.logger.error(err);
            return await safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setDescription("<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.")
                        .setColor("Red")
                ],
                flags: 1 << 6
            });
        }
    }
}
