const { safeEditReply } = require('../../Utils/Moderation/reply');
const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Staff = require('../../Schemas/Staff/staffSchema');
const IDs = require('../../Utils/Config/ids');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseItalianDate(value) {
    if (!value || typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if (!day || !month || !year) return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null;
    }
    return date;
}

function getPauseDaysBetween(startRaw, endRaw) {
    const start = parseItalianDate(startRaw);
    const end = parseItalianDate(endRaw);
    if (!start || !end || end < start) return null;
    const diffDays = Math.floor((end - start) / MS_PER_DAY) + 1;
    return Math.max(1, diffDays);
}

function getTodayUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getCurrentYearBoundsUtc() {
    const now = getTodayUtc();
    const year = now.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    return { yearStart, yearEnd };
}

function countOverlapDays(start, end, windowStart, windowEnd) {
    if (!start || !end || end < start) return 0;
    const overlapStart = start > windowStart ? start : windowStart;
    const overlapEnd = end < windowEnd ? end : windowEnd;
    if (overlapEnd < overlapStart) return 0;
    return Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
}

function computeConsumedPauseDays(pauses) {
    if (!Array.isArray(pauses)) return 0;
    const { yearStart, yearEnd } = getCurrentYearBoundsUtc();

    return pauses.reduce((total, pause) => {
        if (!pause) return total;
        const start = parseItalianDate(pause.dataRichiesta);
        const plannedEnd = parseItalianDate(pause.dataRitorno);

        if (pause.status === 'accepted') {
            return total + countOverlapDays(start, plannedEnd, yearStart, yearEnd);
        }

        if (pause.status === 'cancelled') {
            let effectiveEnd = null;
            if (pause.cancelledAt) {
                const c = new Date(pause.cancelledAt);
                effectiveEnd = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()));
            } else if (start) {
                const consumed = Number(pause.giorniUsati);
                if (Number.isFinite(consumed) && consumed > 0) {
                    effectiveEnd = new Date(start.getTime() + ((consumed - 1) * MS_PER_DAY));
                }
            }
            if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) {
                effectiveEnd = plannedEnd;
            }
            return total + countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
        }

        return total;
    }, 0);
}

function getCancelledPauseEffectiveEnd(pause, start, plannedEnd) {
    let effectiveEnd = null;
    if (pause.cancelledAt) {
        const c = new Date(pause.cancelledAt);
        effectiveEnd = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()));
    } else if (start) {
        const consumed = Number(pause.giorniUsati);
        if (Number.isFinite(consumed) && consumed > 0) {
            effectiveEnd = new Date(start.getTime() + ((consumed - 1) * MS_PER_DAY));
        }
    }
    if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) {
        effectiveEnd = plannedEnd;
    }
    return effectiveEnd;
}

function computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd) {
    const start = parseItalianDate(pause?.dataRichiesta);
    const plannedEnd = parseItalianDate(pause?.dataRitorno);
    if (!start || !plannedEnd) return 0;

    if (pause.status === 'cancelled') {
        const effectiveEnd = getCancelledPauseEffectiveEnd(pause, start, plannedEnd);
        return countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
    }

    if (pause.status === 'accepted') {
        if (todayUtc < start) return 0;
        const effectiveEnd = todayUtc > plannedEnd ? plannedEnd : todayUtc;
        return countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
    }

    return 0;
}

function getPauseStatusLabel(pause, todayUtc) {
    if (!pause) return 'Sconosciuta';
    if (pause.status === 'cancelled') return 'Annullata';
    if (pause.status === 'pending') return 'Richiesta';
    if (pause.status !== 'accepted') return pause.status;

    const start = parseItalianDate(pause.dataRichiesta);
    const end = parseItalianDate(pause.dataRitorno);
    if (!start || !end) return 'Accettata';
    if (todayUtc < start) return 'Programmata';
    if (todayUtc > end) return 'Finita';
    return 'In corso';
}

module.exports = {
    staffRoleIdsBySubcommand: {
        request: [IDs.roles.partnerManager, IDs.roles.staff],
        list: [IDs.roles.partnerManager, IDs.roles.staff, IDs.roles.highStaff]
    },
    data: new SlashCommandBuilder()
        .setName('pausa')
        .setDescription('Gestione pause staffer')
        .addSubcommand(command =>
            command.setName('request')
                .setDescription('Richiedi una pausa')
                .addStringOption(option => option.setName('data_richiesta').setDescription('Data richiesta (GG/MM/AAAA)').setRequired(true))
                .addStringOption(option => option.setName('data_ritorno').setDescription('Data ritorno (GG/MM/AAAA)').setRequired(true))
                .addStringOption(option => option.setName('motivazione').setDescription('Motivo della pausa').setRequired(true))
        )
        .addSubcommand(command =>
            command.setName('list')
                .setDescription('Lista pause dell\'anno corrente')
                .addUserOption(option => option.setName('staffer').setDescription('Staffer da controllare').setRequired(false))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand()
        await interaction.deferReply()
        const guildId = interaction.guild.id

        switch (sub) {
            case 'request': {
                const userId = interaction.user.id;
                const dataRichiesta = interaction.options.getString('data_richiesta');
                const dataRitorno = interaction.options.getString('data_ritorno');
                const motivazione = interaction.options.getString('motivazione');
                const channel = interaction.guild.channels.cache.get(IDs.channels.pauseRequestLog);
                let stafferDoc = await Staff.findOne({ guildId, userId });
                if (!stafferDoc) stafferDoc = new Staff({ guildId, userId });
                stafferDoc.pauses.push({
                    dataRichiesta,
                    dataRitorno,
                    motivazione,
                    status: 'pending'
                });
                await stafferDoc.save();
                const createdPause = stafferDoc.pauses[stafferDoc.pauses.length - 1];
                const pauseId = String(createdPause?._id || '');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pause_accept:${userId}:${pauseId}`)
                        .setLabel('Accetta')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`pause_reject:${userId}:${pauseId}`)
                        .setLabel('Rifiuta')
                        .setStyle(ButtonStyle.Danger)
                );
                await safeEditReply(interaction, {
                    embeds: [
                        new EmbedBuilder()
                            .setDescription("<:vegacheckmark:1443666279058772028> La tua richiesta di pausa è stata inviata all'High Staff")
                            .setColor('#6f4e37')
                    ],
                    flags: 1 << 6
                });
                await channel.send({
                    content: `<@&${IDs.roles.highStaff}> ${interaction.user} ha richiesto una pausa.\nData richiesta: ${dataRichiesta}\nData ritorno: ${dataRitorno}\nMotivo: ${motivazione}`,
                    components: pauseId ? [row] : []
                });
            }
                break;
            case 'list': {
                const targetUser = interaction.options.getUser('staffer') || interaction.user;
                const isHighStaff = interaction.member?.roles?.cache?.has(IDs.roles.highStaff);
                if (!isHighStaff && targetUser.id !== interaction.user.id) {
                    return await safeEditReply(interaction, {
                        content: '<:vegax:1443934876440068179> Puoi vedere solo le tue pause.',
                        flags: 1 << 6
                    });
                }

                const stafferRecord = await Staff.findOne({ guildId, userId: targetUser.id });
                const pauses = Array.isArray(stafferRecord?.pauses) ? stafferRecord.pauses : [];
                const todayUtc = getTodayUtc();
                const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
                const year = yearStart.getUTCFullYear();

                const rows = pauses
                    .map((pause) => {
                        const start = parseItalianDate(pause?.dataRichiesta);
                        const end = parseItalianDate(pause?.dataRitorno);
                        if (!start || !end) return null;
                        const overlapsYear = countOverlapDays(start, end, yearStart, yearEnd) > 0;
                        if (!overlapsYear) return null;
                        const scaledDays = computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd);
                        const statusLabel = getPauseStatusLabel(pause, todayUtc);
                        return `- \`${pause.dataRichiesta}\` -> \`${pause.dataRitorno}\` | **${statusLabel}** | Giorni scalati: \`${scaledDays}\``;
                    })
                    .filter(Boolean);

                if (rows.length === 0) {
                    return await safeEditReply(interaction, {
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#6f4e37')
                                .setDescription(`<:attentionfromvega:1443651874032062505> Nessuna pausa trovata per ${targetUser} nell'anno **${year}**.`)
                        ],
                        flags: 1 << 6
                    });
                }

                const totalScaled = rows.length > 0 ? computeConsumedPauseDays(pauses) : 0;
                const chunks = [];
                let current = '';
                for (const row of rows) {
                    if ((current + '\n' + row).length > 3500) {
                        chunks.push(current);
                        current = row;
                    } else {
                        current = current ? `${current}\n${row}` : row;
                    }
                }
                if (current) chunks.push(current);

                const embeds = chunks.map((chunk, index) =>
                    new EmbedBuilder()
                        .setColor('#6f4e37')
                        .setTitle(`Pause ${year} - ${targetUser.username}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`)
                        .setDescription(`${chunk}\n\nTotale giorni scalati anno corrente: \`${totalScaled}\``)
                );

                return await safeEditReply(interaction, {
                    embeds,
                    flags: 1 << 6
                });
            }
            default:
                return await safeEditReply(interaction, {
                    content: '<:vegax:1443934876440068179> Subcomando non valido.',
                    flags: 1 << 6
                });
        }
    }
}
