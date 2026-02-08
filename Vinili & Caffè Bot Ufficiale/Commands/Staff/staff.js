const { safeEditReply } = require('../../Utils/Moderation/reply');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const StaffModel = require('../../Schemas/Staff/staffSchema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('Gestisci lo staff di Vinili & Caffè ')
        .addSubcommand(command =>
            command.setName('pex')
                .setDescription(`Pexa un utente.`)
                .addUserOption(option =>
                    option.setName('user').setDescription('Specifica l\'utente da pexare.').setRequired(true))
                .addRoleOption(option =>
                    option.setName('ruolo_precedente').setDescription('Specifica il ruolo precedente.').setRequired(true))
                .addRoleOption(option =>
                    option.setName('ruolo_successivo').setDescription('Specifca il ruolo da dare.').setRequired(true))
                .addStringOption(option =>
                    option.setName('motivo').setDescription('Specifica il motivo del pex.').setRequired(true))
        )
        .addSubcommand(command =>
            command.setName('depex')
                .setDescription(`Depexa uno staffer.`)
                .addUserOption(option =>
                    option.setName('staffer').setDescription('Specifica l\'utente da depexare.').setRequired(true))
                .addRoleOption(option =>
                    option.setName('ruolo_precedente').setDescription('Specifica il ruolo da togliere.').setRequired(true))
                .addRoleOption(option =>
                    option.setName('ruolo_successivo').setDescription('Specifica il ruolo da dare.').setRequired(true))
                .addStringOption(option =>
                    option.setName('motivo').setDescription('Specifica il motivo del depex.').setRequired(true))
        )
        .addSubcommand(command =>
            command.setName('warn')
                .setDescription(`Warna uno staffer.`)
                .addUserOption(option =>
                    option.setName('staffer').setDescription('Specifica l\'utente da warnare.').setRequired(true))
                .addStringOption(option =>
                    option.setName('motivo').setDescription('Specifica il motivo del warn.').setRequired(true))
        )
        .addSubcommandGroup(group =>
            group
                .setName('resoconto')
                .setDescription('Invia un resoconto')
                .addSubcommand(command =>
                    command.setName('staffer')
                        .setDescription(`Invia un resoconto di uno staffer.`)
                        .addUserOption(option =>
                            option.setName('staffer')
                                .setDescription('Seleziona lo staffer di cui fare il resoconto.')
                                .setRequired(true))
                        .addRoleOption(option =>
                            option.setName('ruolo')
                                .setDescription('Seleziona il ruolo dello staffer.')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('messaggi')
                                .setDescription('Messaggi inviati in una settimana.')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('ore')
                                .setDescription('Ore trascorse in vocale in una settimana.')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('grado_attività')
                                .setDescription('Seleziona l\'attività avuta durante la settimana.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Non classificato', value: 'Limiti non rispettati' },
                                    { name: 'Insufficiente', value: 'Limiti non raggiunti di massimo 100msg e 1h' },
                                    { name: 'Sufficiente', value: 'Limiti rispettati' },
                                    { name: 'Discreto', value: 'Limiti superati di 150msg e 1h e 30min' },
                                    { name: 'Buono', value: 'Limiti superati del doppio' },
                                    { name: 'Ottimo', value: 'Doppio dei limiti superati di 300msg e 2h' },
                                    { name: 'Eccellente', value: 'Limiti superati del triplo' },
                                )
                        )
                        .addStringOption(option =>
                            option.setName('grado_condotta')
                                .setDescription('Seleziona il comportamento avuto durante la settimana.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Non classificato', value: 'Solo valutazioni negative e 0 positive' },
                                    { name: 'Insufficiente', value: 'Più valutazioni negative che positive' },
                                    { name: 'Sufficiente', value: 'Valutazioni equivalenti/Nessuna valutazione' },
                                    { name: 'Discreto', value: 'Più valutazioni positive che negative' },
                                    { name: 'Ottimo', value: 'Minimo 3 valutazioni positive e 0 negative' },
                                )
                        )
                        .addStringOption(option =>
                            option.setName('azione')
                                .setDescription('Seleziona l\'azione da applicare allo staffer.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Pex', value: 'Pex' },
                                    { name: 'Depex', value: 'Depex' },
                                    { name: 'Valutazione Positiva', value: 'Valutazione Positiva' },
                                    { name: 'Valutazione Negativa', value: 'Valutazione Negativa' },
                                    { name: 'Nulla', value: 'Nulla' },
                                ))
                )
                .addSubcommand(command =>
                    command.setName('pm')
                        .setDescription('Invia il resoconti di un Partner Manager')
                        .addUserOption(option =>
                            option.setName('staffer')
                                .setDescription('Seleziona lo staffer di cui fare il resoconto.')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('partner')
                                .setDescription('Partner fatte in una settimana.')
                                .setRequired(true))
                        .addStringOption(option =>
                            option.setName('azione')
                                .setDescription('Seleziona l\'azione da applicare allo staffer.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Depex', value: 'Depex' },
                                    { name: 'Richiamo', value: 'Richiamo' },
                                    { name: 'Nulla', value: 'Nulla' },
                                ))
                )
        ),

    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup(false)
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()
        const channel = interaction.guild.channels.cache.get('1442569234004709391')
        const pmchannel = interaction.guild.channels.cache.get('1442569209849843823')
        if (sub === 'pex') {
            try {
                const utentee = interaction.options.getUser('user');
                const reason = interaction.options.getString('motivo');
                const member = await interaction.guild.members.fetch(utentee.id).catch(() => null);
                if (!member) return await safeEditReply(interaction, { embeds: [errorEmbed], flags: 1 << 6 });
                const ruoloPrecedente = interaction.options.getRole('ruolo_precedente');
                const ruoloSuccessivo = interaction.options.getRole('ruolo_successivo');
                const staffchat = interaction.guild.channels.cache.get('1442569260059725844');
                let Staff = await StaffModel.findOne({ guildId: interaction.guild.id, userId: utentee.id });
                if (!Staff) Staff = new StaffModel({ guildId: interaction.guild.id, userId: utentee.id });
                if (interaction.user.id === utentee.id) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('<:vegax:1443934876440068179> Non puoi usare questo comando su te stesso!')
                                .setColor("#E74C3C")
                        ],
                        flags: 1 << 6
                    });
                }
                if (member.roles.cache.has(ruoloSuccessivo.id)) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:attentionfromvega:1443651874032062505> L'utente ${utentee} ha già il ruolo che gli vuoi aggiungere.`)
                                .setColor("#E74C3C")
                        ],
                        flags: 1 << 6
                    });
                }
                await member.roles.add(ruoloSuccessivo.id);
                if (ruoloSuccessivo.id === '1442568905582317740') {
                    await pmchannel.send({
                        content: `
${utentee}
# BenvenutÉ™ nei Partner Manager <:partneredserverowner:1443651871125409812>
> **Per iniziare al meglio controlla:** <:discordchannelwhite:1443308552536985810>
<:dot:1443660294596329582> <#1442569199229730836>
__Per qualsiasi cosa l'High Staff è disponibile__ <a:BL_crown_yellow:1330194103564238930>`
                    });
                }
                if (ruoloSuccessivo.id === '1442568904311570555') {
                    await member.roles.add('1442568910070349985');
                    await staffchat.send({
                        content: `
${utentee}
# BenvenutÉ™ nello staff <:discordstaff:1443651872258003005>
> **Per iniziare al meglio controlla:** <:discordchannelwhite:1443308552536985810>
<:dot:1443660294596329582> <#1442569237142044773>
<:dot:1443660294596329582> <#1442569239063167139>
<:dot:1443660294596329582> <#1442569243626307634>
__Per qualsiasi cosa l'High Staff è disponibile__ <a:BL_crown_yellow:1330194103564238930>`
                    });
                }
                if (ruoloSuccessivo.id === '1442568901887000618') {
                    await member.roles.remove('1442568904311570555');
                }
                if (ruoloSuccessivo.id === '1442568897902678038') {
                    await member.roles.remove('1442568901887000618');
                }
                if (ruoloSuccessivo.id === '1442568896237277295') {
                    await member.roles.remove('1442568897902678038');
                }
                if (ruoloSuccessivo.id === '1442568893435478097') {
                    await member.roles.remove('1442568896237277295');
                    await member.roles.add('1442568894349840435');
                }
                if (ruoloSuccessivo.id === '1442568891875201066') {
                    await member.roles.remove('1442568893435478097');
                }
                if (ruoloSuccessivo.id === '1442568889052430609') {
                    await member.roles.remove('1442568891875201066');
                }
                if (ruoloSuccessivo.id === '1442568886988963923') {
                    await member.roles.remove('1442568889052430609');
                }
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:vegacheckmark:1443666279058772028> Azione eseguita con successo da ${interaction.user.username}.`)
                            .setColor('#6f4e37')
                    ]
                });
                await channel.send({
                    content: `**<a:everythingisstable:1444006799643508778> PEX** ${utentee}
<:member_role_icon:1330530086792728618> \`${ruoloPrecedente.name}\` <a:vegarightarrow:1443673039156936837> \`${ruoloSuccessivo.name}\`
<:discordstaff:1443651872258003005> __${reason}__`
                });
                Staff.rolesHistory.push({
                    oldRole: ruoloPrecedente.id,
                    newRole: ruoloSuccessivo.id,
                    reason
                });
                await Staff.save();
            } catch (err) {
                global.logger.error(err);
            }
        }
        if (sub === 'depex') {
            try {
                const utentee = interaction.options.getUser('staffer');
                const oldRole = interaction.options.getRole('ruolo_precedente');
                const newRole = interaction.options.getRole('ruolo_successivo');
                const reason = interaction.options.getString('motivo');
                const member = await interaction.guild.members.fetch(utentee.id).catch(() => null);
                if (!member) return await safeEditReply(interaction, { embeds: [errorEmbed], flags: 1 << 6 });
                let Staff = await StaffModel.findOne({ guildId: interaction.guild.id, userId: utentee.id });
                if (!Staff) Staff = new StaffModel({ guildId: interaction.guild.id, userId: utentee.id });
                if (interaction.user.id === utentee.id) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription('<:vegax:1443934876440068179> Non puoi usare questo comando su te stesso!')
                                .setColor("#E74C3C")
                        ],
                        flags: 1 << 6
                    });
                }
                if (!member.roles.cache.has(oldRole.id)) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:vegax:1443934876440068179> L'utente ${utentee} non ha il ruolo che gli vuoi togliere.`)
                                .setColor("#E74C3C")
                        ],
                        flags: 1 << 6
                    });
                }
                await member.roles.remove(oldRole.id);
                if (oldRole.id === '1442568905582317740') {
                    await member.roles.remove(oldRole.id);
                }
                if (oldRole.id === '1442568904311570555') {
                    await member.roles.remove(oldRole.id);
                    await member.roles.remove('1442568910070349985');
                }
                if (oldRole.id === '1442568901887000618') {
                    await member.roles.remove(oldRole.id);
                    await member.roles.remove('1442568910070349985');
                }
                if (oldRole.id === '1442568897902678038') {
                    await member.roles.remove(oldRole.id);
                    await member.roles.remove('1442568910070349985');
                }
                if (oldRole.id === '1442568896237277295') {
                    await member.roles.remove(oldRole.id);
                    await member.roles.remove('1442568910070349985');
                }
                if (oldRole.id === '1442568893435478097') {
                    await member.roles.remove(oldRole.id);
                    await member.roles.remove('1442568910070349985');
                    await member.roles.remove('1442568894349840435');
                }
                if (oldRole.id === '1442568891875201066') {
                    await member.roles.remove(oldRole.id);
                    await member.roles.remove('1442568910070349985');
                    await member.roles.remove('1442568894349840435');
                }
                if (oldRole.id === '1442568889052430609') {
                    await member.roles.remove(oldRole.id);
                    await member.roles.remove('1442568910070349985');
                    await member.roles.remove('1442568894349840435');
                }
                await StaffModel.deleteMany({ userId: utentee.id });
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:vegacheckmark:1443666279058772028> Azione eseguita con successo da ${interaction.user.username}.`)
                            .setColor('#6f4e37')
                    ]
                });
                await channel.send({
                    content:
                        `**<a:laydowntorest:1444006796661358673> DEPEX** ${utentee}
<:member_role_icon:1330530086792728618> \`${oldRole.name}\` <a:vegarightarrow:1443673039156936837> \`${newRole.name}\`
<:discordstaff:1443651872258003005> __${reason}__`
                });
                Staff.rolesHistory.push({
                    oldRole: oldRole.id,
                    newRole: newRole.id,
                    reason
                });
                await Staff.save();
            } catch (err) {
                global.logger.error(err);
            }
        }
        if (sub === 'warn') {
            try {
                const utentee = interaction.options.getUser('staffer');
                const reason = interaction.options.getString('motivo');
                const warnChannel = interaction.guild.channels.cache.get('1443250635108646943');
                let Staff = await StaffModel.findOne({ guildId: interaction.guild.id, userId: utentee.id });
                if (!Staff) Staff = new StaffModel({ guildId: interaction.guild.id, userId: utentee.id });
                if (!Staff.idCount) Staff.idCount = 0;
                if (!Staff.warnCount) Staff.warnCount = 0;
                if (!Staff.warnReasons) Staff.warnReasons = [];
                Staff.idCount++;
                Staff.warnCount++;
                Staff.warnReasons.push(reason);
                await Staff.save();
                const warnstaff = new EmbedBuilder()
                    .setAuthor({ name: `Warn eseguito da ${interaction.user.username}`, iconURL: `${interaction.user.displayAvatarURL()}` })
                    .setTitle(`<a:laydowntorest:1444006796661358673>·**__WARN STAFF__** \`#${Staff.warnCount}\``)
                    .setThumbnail(`${utentee.displayAvatarURL()}`)
                    .setDescription(`<:discordstaff:1443651872258003005> <a:vegarightarrow:1443673039156936837> ${utentee}
                        <:pinnednew:1443670849990430750> __${reason}__
                        <a:loading:1443934440614264924> **ID Valutazione** __\`${Staff.idCount}\`__`)
                    .setColor('#6f4e37')
                    .setFooter({ text: `© 2025 Vinili & Caffè. Tutti i diritti riservati.`, iconURL: `${interaction.guild.iconURL()}` });
                if (warnChannel) {
                    await warnChannel.send({ content: `${utentee}`, embeds: [warnstaff] });
                }
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<:vegacheckmark:1443666279058772028> Azione eseguita con successo da ${interaction.user.username}.`)
                            .setColor('#6f4e37')
                    ],
                });
            } catch (err) {
                global.logger.error(err);
            }
        }
        if (group === 'resoconto') {
            if (sub === 'staffer') {
                try {
                    const rescoontoChannel = interaction.guild.channels.cache.get('1442569270784692306');
                    const staffer = interaction.options.getUser('staffer');
                    const ruolo = interaction.options.getRole('ruolo');
                    const azione = interaction.options.getString('azione');
                    const messaggi = interaction.options.getString('messaggi');
                    const oreInVoc = interaction.options.getString('ore');
                    const grado_attività = interaction.options.getString('grado_attività');
                    const grado_condotta = interaction.options.getString('grado_condotta');
                    const stafferMember = interaction.guild.members.cache.get(staffer.id);
                    const allowedRoleID = '1442568910070349985';
                    const allowedRoles = [
                        '1442568897902678038',
                        '1442568896237277295',
                        '1442568894349840435'
                    ];
                    if (!stafferMember.roles.cache.has(allowedRoleID)) {
                        return await safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription('<:vegax:1443934876440068179> Puoi selezionare solo uno staffer con il ruolo specificato.')
                                    .setColor("#E74C3C")
                            ],
                            flags: 1 << 6
                        });
                    }
                    if (interaction.user.id === staffer.id) {
                        return await safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription('<:vegax:1443934876440068179> Non puoi usare questo comando su te stesso!')
                                    .setColor("#E74C3C")
                            ],
                            flags: 1 << 6
                        });
                    }
                    await rescoontoChannel.send({
                        content: `
<:discordstaff:1443651872258003005> **Staffer:** __**<@${staffer.id}>**__
<:dot:1443660294596329582> **Ruolo:** __${ruolo}__
<:dot:1443660294596329582> **Messaggi in una settimana:** __${messaggi}__
<:dot:1443660294596329582> **Ore in una settimana:** __${oreInVoc}__
<:dot:1443660294596329582> **Attività:** __${grado_attività}__
<:dot:1443660294596329582> **Condotta:** __${grado_condotta}__
<:dot:1443660294596329582> **Azione:** __${azione}__
<:staff:1443651912179388548> **Resoconto fatto da** __<@${interaction.user.id}>__`
                    });
                    await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:vegacheckmark:1443666279058772028> Azione eseguita con successo da ${interaction.user.username}.`)
                                .setColor('#6f4e37')
                        ],
                    });
                } catch (err) {
                    global.logger.error(err);
                }
            }
            if (sub === 'pm') {
                try {
                    const channel = interaction.guild.channels.cache.get('1442569270784692306');
                    const staffer = interaction.options.getUser('staffer');
                    const azione = interaction.options.getString('azione');
                    const partner = interaction.options.getString('partner');
                    const stafferMember = interaction.guild.members.cache.get(staffer.id);
                    const allowedRoleID = '1442568910070349985';
                    const allowedRoles = [
                        '1442568897902678038',
                        '1442568896237277295',
                        '1442568894349840435'
                    ];
                    if (!stafferMember.roles.cache.has(allowedRoleID)) {
                        return await safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription('<:vegax:1443934876440068179> Puoi selezionare solo uno staffer con il ruolo specificato.')
                                    .setColor("#E74C3C")
                            ],
                            flags: 1 << 6
                        });
                    }
                    if (interaction.user.id === staffer.id) {
                        return await safeEditReply(interaction, {
                            embeds: [
                                new EmbedBuilder()
                                    .setDescription('<:vegax:1443934876440068179> Non puoi usare questo comando su te stesso!')
                                    .setColor("#E74C3C")
                            ],
                            flags: 1 << 6
                        });
                    }
                    await channel.send({
                        content:
                            `<:partneredserverowner:1443651871125409812> **Partner Manager:** __<@${staffer.id}>__
<:dot:1443660294596329582> **Partner:** __${partner}__
<:dot:1443660294596329582> **Azione:** __${azione}__
<:staff:1443651912179388548> **Resoconto fatto da** __<@${interaction.user.id}>__`
                    });
                    await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`<:vegacheckmark:1443666279058772028> Azione eseguita con successo da ${interaction.user.username}.`)
                                .setColor('#6f4e37')
                        ]
                    });
                } catch (err) {
                    global.logger.error(err);
                }
            }
        }
    }
}
