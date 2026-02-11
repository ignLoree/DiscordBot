const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const Staff = require('../../Schemas/Staff/staffSchema');
const IDs = require('../../Utils/Config/ids');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STAFF_ROLE_PRIORITY = [
  IDs.roles.owner,
  IDs.roles.coOwner,
  IDs.roles.manager,
  IDs.roles.admin,
  IDs.roles.supervisor,
  IDs.roles.coordinator,
  IDs.roles.moderator,
  IDs.roles.helper,
  IDs.roles.staff,
  IDs.roles.partnerManager
];

function parseItalianDate(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

function getPauseDaysBetween(startRaw, endRaw) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  if (!start || !end || end < start) return null;
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getCurrentYearBoundsUtc() {
  const now = getTodayUtc();
  const year = now.getUTCFullYear();
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    yearEnd: new Date(Date.UTC(year, 11, 31))
  };
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
      if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) effectiveEnd = plannedEnd;
      return total + countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
    }

    return total;
  }, 0);
}

function getMemberRoleLabel(member) {
  for (const roleId of STAFF_ROLE_PRIORITY) {
    const role = member.roles.cache.get(roleId);
    if (role) return role.name;
  }
  return 'Staff';
}

function getPauseStatusLabel(pause, todayUtc) {
  if (!pause) return 'Unknown';
  if (pause.status === 'cancelled') return 'Annullata';
  if (pause.status === 'pending') return 'Richiesta';
  if (pause.status === 'rejected') return 'Rifiutata';
  if (pause.status !== 'accepted') return pause.status;

  const start = parseItalianDate(pause.dataRichiesta);
  const end = parseItalianDate(pause.dataRitorno);
  if (!start || !end) return 'Accettata';
  if (todayUtc < start) return 'Programmata';
  if (todayUtc > end) return 'Finita';
  return 'In corso';
}

function computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const plannedEnd = parseItalianDate(pause?.dataRitorno);
  if (!start || !plannedEnd) return 0;

  if (pause.status === 'cancelled') {
    let effectiveEnd = null;
    if (pause.cancelledAt) {
      const c = new Date(pause.cancelledAt);
      effectiveEnd = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()));
    } else {
      const consumed = Number(pause.giorniUsati);
      if (Number.isFinite(consumed) && consumed > 0) {
        effectiveEnd = new Date(start.getTime() + ((consumed - 1) * MS_PER_DAY));
      }
    }
    if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) effectiveEnd = plannedEnd;
    return countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  if (pause.status === 'accepted') {
    if (todayUtc < start) return 0;
    const effectiveEnd = todayUtc > plannedEnd ? plannedEnd : todayUtc;
    return countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  return 0;
}

function buildRequestButtonsRow(userId, pauseId, disabled = false) {
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
  if (disabled) row.components.forEach((c) => c.setDisabled(true));
  return row;
}

function buildAcceptedButtonsRow(userId, pauseId, options = {}) {
  const { hideCancel = false, disableCancel = false } = options;
  const components = [];
  if (!hideCancel) {
    components.push(
      new ButtonBuilder()
        .setCustomId(`pause_cancel:${userId}:${pauseId}`)
        .setLabel('Annulla pausa')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disableCancel)
    );
  }
  components.push(
    new ButtonBuilder()
      .setCustomId(`pause_list:${userId}:${pauseId}`)
      .setLabel('Lista pause')
      .setStyle(ButtonStyle.Secondary)
  );
  return new ActionRowBuilder().addComponents(components);
}

async function handlePauseButton(interaction) {
  if (!interaction.isButton()) return false;
  if (
    !interaction.customId.startsWith('pause_accept:') &&
    !interaction.customId.startsWith('pause_reject:') &&
    !interaction.customId.startsWith('pause_cancel:') &&
    !interaction.customId.startsWith('pause_list:')
  ) return false;

  const [action, userId, pauseId] = interaction.customId.split(':');
  if (!userId) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Dati pausa non validi.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const isHighStaff = Boolean(interaction.member?.roles?.cache?.has(IDs.roles.highStaff));
  if ((action === 'pause_accept' || action === 'pause_reject' || action === 'pause_cancel') && !isHighStaff) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Solo High Staff puo usare questi pulsanti.', flags: 1 << 6 }).catch(() => {});
    return true;
  }
  if (action === 'pause_list' && !isHighStaff && interaction.user.id !== userId) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Puoi vedere solo le tue pause.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const guildId = interaction.guildId;
  const stafferRecord = await Staff.findOne({ guildId, userId });
  if (!stafferRecord) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Record pausa non trovato.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (action === 'pause_list') {
    const contextualPause = pauseId ? stafferRecord.pauses?.id?.(pauseId) : null;
    const now = getTodayUtc();
    const contextualEnd = contextualPause ? parseItalianDate(contextualPause.dataRitorno) : null;
    const shouldHideCancel = Boolean(
      contextualPause && (contextualPause.status !== 'accepted' || (contextualEnd && now > contextualEnd))
    );

    let acknowledgedByUpdate = false;
    if (contextualPause && shouldHideCancel) {
      await interaction.update({ components: [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: true })] }).catch(() => {});
      acknowledgedByUpdate = true;
    }

    const pauses = Array.isArray(stafferRecord.pauses) ? stafferRecord.pauses : [];
    const todayUtc = getTodayUtc();
    const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
    const year = yearStart.getUTCFullYear();

    const rows = pauses
      .map((pause) => {
        const start = parseItalianDate(pause?.dataRichiesta);
        const end = parseItalianDate(pause?.dataRitorno);
        if (!start || !end) return null;
        if (countOverlapDays(start, end, yearStart, yearEnd) <= 0) return null;
        const scaledDays = computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd);
        const statusLabel = getPauseStatusLabel(pause, todayUtc);
        return `- \`${pause.dataRichiesta}\` -> \`${pause.dataRitorno}\` | **${statusLabel}** | Giorni scalati: \`${scaledDays}\``;
      })
      .filter(Boolean);

    const payload = rows.length === 0
      ? { content: `<:attentionfromvega:1443651874032062505> Nessuna pausa trovata per <@${userId}> nell'anno **${year}**.`, flags: 1 << 6 }
      : {
          embeds: [
            new EmbedBuilder()
              .setColor('#6f4e37')
              .setTitle(`Pause ${year}`)
              .setDescription(`${rows.join('\n')}\n\nTotale giorni scalati anno corrente: \`${computeConsumedPauseDays(pauses)}\``)
          ],
          flags: 1 << 6
        };

    if (acknowledgedByUpdate) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
    return true;
  }

  if (!pauseId) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Dati pausa non validi.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const targetPause = stafferRecord.pauses?.id?.(pauseId);
  if (!targetPause) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Richiesta pausa non trovata.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (action === 'pause_reject') {
    if (targetPause.status !== 'pending') {
      await interaction.reply({ content: '<:attentionfromvega:1443651874032062505> Questa richiesta e gia stata gestita.', flags: 1 << 6 }).catch(() => {});
      return true;
    }
    targetPause.status = 'rejected';
    await stafferRecord.save();
    await interaction.update({ components: [buildRequestButtonsRow(userId, pauseId, true)] }).catch(() => {});
    await interaction.followUp({ content: `<:VC_Trash:1460645075242451025> Richiesta pausa rifiutata per <@${userId}>.`, flags: 1 << 6 }).catch(() => {});
    return true;
  }

  if (action === 'pause_cancel') {
    if (targetPause.status !== 'accepted') {
      await interaction.reply({ content: '<:attentionfromvega:1443651874032062505> Questa pausa non e annullabile.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const end = parseItalianDate(targetPause.dataRitorno);
    const todayForExpiry = getTodayUtc();
    if (end && todayForExpiry > end) {
      await interaction.update({ components: [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: true })] }).catch(() => {});
      await interaction.followUp({ content: '<:attentionfromvega:1443651874032062505> La pausa e scaduta: il pulsante annulla non e piu disponibile.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await interaction.reply({ content: '<:vegax:1443934876440068179> Staffer non trovato nel server.', flags: 1 << 6 }).catch(() => {});
      return true;
    }

    const todayUtc = getTodayUtc();
    const start = parseItalianDate(targetPause.dataRichiesta);
    const totalScheduledDays = getPauseDaysBetween(targetPause.dataRichiesta, targetPause.dataRitorno) || 0;
    let consumedForCancelledPause = 0;
    if (start && end) {
      if (todayUtc < start) consumedForCancelledPause = 0;
      else if (todayUtc > end) consumedForCancelledPause = totalScheduledDays;
      else consumedForCancelledPause = Math.max(1, Math.floor((todayUtc - start) / MS_PER_DAY) + 1);
    }

    targetPause.status = 'cancelled';
    targetPause.giorniUsati = consumedForCancelledPause;
    targetPause.cancelledAt = new Date();
    await stafferRecord.save();

    const baseLimit = member.roles.cache.has(IDs.roles.partnerManager) ? 45 : 60;
    const bonusBestStaff = member.roles.cache.has(IDs.roles.bestStaff) ? 5 : 0;
    const maxGiorni = baseLimit + bonusBestStaff;
    const giorniTotaliUsati = computeConsumedPauseDays(stafferRecord.pauses);
    const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);

    await interaction.update({ components: [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: true })] }).catch(() => {});
    await interaction.followUp({
      content: `<:VC_Trash:1460645075242451025> Pausa annullata per <@${userId}>. Giorni scalati: \`${consumedForCancelledPause}\`. Totale usati: \`${giorniTotaliUsati}/${maxGiorni}\` (\`${giorniRimanenti}\` rimanenti).`,
      flags: 1 << 6
    }).catch(() => {});
    return true;
  }

  // pause_accept
  if (targetPause.status !== 'pending') {
    await interaction.reply({ content: '<:attentionfromvega:1443651874032062505> Questa richiesta e gia stata gestita.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Staffer non trovato nel server.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const giorniRichiesti = getPauseDaysBetween(targetPause.dataRichiesta, targetPause.dataRitorno);
  if (!giorniRichiesti) {
    await interaction.reply({ content: '<:vegax:1443934876440068179> Date pausa non valide.', flags: 1 << 6 }).catch(() => {});
    return true;
  }

  const baseLimit = member.roles.cache.has(IDs.roles.partnerManager) ? 45 : 60;
  const bonusBestStaff = member.roles.cache.has(IDs.roles.bestStaff) ? 5 : 0;
  const maxGiorni = baseLimit + bonusBestStaff;
  const usedBefore = computeConsumedPauseDays(stafferRecord.pauses);
  const giorniUsati = usedBefore + giorniRichiesti;
  const giorniRimanenti = maxGiorni - giorniUsati;
  if (giorniRimanenti < 0) {
    await interaction.reply({
      content: `<:vegax:1443934876440068179> Limite pause superato: disponibili \`${Math.max(0, maxGiorni - usedBefore)}\` su \`${maxGiorni}\`.`,
      flags: 1 << 6
    }).catch(() => {});
    return true;
  }

  const roleLabel = getMemberRoleLabel(member);
  const sameRoleActiveCount = await Staff.countDocuments({
    guildId,
    pauses: {
      $elemMatch: {
        status: 'accepted',
        ruolo: roleLabel,
        dataRichiesta: { $exists: true },
        dataRitorno: { $exists: true }
      }
    }
  }).catch(() => 0);

  targetPause.status = 'accepted';
  targetPause.ruolo = roleLabel;
  targetPause.giorniUsati = giorniUsati;
  targetPause.giorniAggiuntivi = bonusBestStaff;
  targetPause.stafferInPausa = sameRoleActiveCount;
  await stafferRecord.save();

  const pauseEnd = parseItalianDate(targetPause.dataRitorno);
  const hideCancelOnCreate = Boolean(pauseEnd && getTodayUtc() > pauseEnd);
  const channel = interaction.guild.channels.cache.get(IDs.channels.pauseAcceptedLog);
  if (channel) {
    await channel.send({
      content: `<:Calendar:1330530097190404106> **\`${targetPause.ruolo}\`** - **<@${userId}>** e in **pausa**!\n<:Clock:1330530065133338685> Dal **\`${targetPause.dataRichiesta}\`** al **\`${targetPause.dataRitorno}\`**\n<:pinnednew:1443670849990430750> __\`${giorniUsati}/${maxGiorni}\`__ giorni utilizzati (\`${giorniRimanenti}\` rimanenti) - __\`${sameRoleActiveCount}\`__ staffer in pausa in quel ruolo`,
      components: [buildAcceptedButtonsRow(userId, pauseId, { hideCancel: hideCancelOnCreate })]
    }).catch(() => {});
  }

  await interaction.update({ components: [buildRequestButtonsRow(userId, pauseId, true)] }).catch(() => {});
  await interaction.followUp({ content: `<:vegacheckmark:1443666279058772028> Richiesta pausa accettata per <@${userId}>.`, flags: 1 << 6 }).catch(() => {});
  return true;
}

module.exports = { handlePauseButton };
