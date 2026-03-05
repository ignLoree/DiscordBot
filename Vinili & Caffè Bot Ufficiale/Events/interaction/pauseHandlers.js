const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countOverlapDays, computeConsumedPauseDays, getPauseStatusLabel, computePauseScaledDaysThisYear, getStaffPauseRecord, buildRequestButtonsRow, buildAcceptedButtonsRow, schedulePauseButtonsRemoval } = require("../../Utils/Pause/pauseHandlersUtils");
const pauseActionLocks = new Set();

async function handlePauseButton(interaction) {
  if (!interaction.isButton()) return false;
  if (
    !interaction.customId.startsWith("pause_accept:") &&
    !interaction.customId.startsWith("pause_reject:") &&
    !interaction.customId.startsWith("pause_cancel:") &&
    !interaction.customId.startsWith("pause_list:")
  )
    return false;

  const parts = interaction.customId.split(":");
  const [action, userId, pauseId] = parts;
  if (!userId) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Dati pausa non validi.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }
  if (
    (action === "pause_accept" ||
      action === "pause_reject" ||
      action === "pause_cancel") &&
    parts.length !== 3
  ) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Dati pausa non validi.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const isHighStaff=Boolean(interaction.member?.roles?.cache?.has(IDs.roles.HighStaff),);
  const isStaff=Boolean(interaction.member?.roles?.cache?.has(IDs.roles.Staff),);
  if (
    (action === "pause_accept" ||
      action === "pause_reject" ||
      action === "pause_cancel") &&
    !isHighStaff
  ) {
    await interaction
      .reply({
        content:
          "<a:VC_Alert:1448670089670037675> Solo High Staff può usare questi pulsanti.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }
  if (
    action === "pause_list" &&
    !isHighStaff &&
    !isStaff &&
    interaction.user.id !== userId
  ) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Puoi vedere solo le tue pause.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const guildId = interaction.guildId;
  const stafferRecord = await getStaffPauseRecord(guildId, userId);
  if (!stafferRecord) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Record pausa non trovato.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (action === "pause_list") {
    const contextualPause=pauseId?stafferRecord.pauses?.id?.(pauseId):null;
    const now = getTodayUtc();
    const contextualEnd=contextualPause?parseItalianDate(contextualPause.dataRitorno):null;
    const shouldHideCancel=Boolean(contextualPause&&(contextualPause.status!=="accepted"||(contextualEnd&&now>contextualEnd)),);

    let acknowledgedByUpdate = false;
    if (contextualPause && shouldHideCancel) {
      await interaction
        .update({
          components: [
            buildAcceptedButtonsRow(userId, pauseId, { hideCancel: true }),
          ],
        })
        .catch(() => {});
      acknowledgedByUpdate = true;
    }

    const pauses=Array.isArray(stafferRecord.pauses)?stafferRecord.pauses:[];
    const todayUtc = getTodayUtc();
    const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
    const year = yearStart.getUTCFullYear();

    const rows=pauses.map((pause) => {const start=parseItalianDate(pause?.dataRichiesta);const end=parseItalianDate(pause?.dataRitorno);if(!start||!end)return null;if(countOverlapDays(start,end,yearStart,yearEnd)<=0)return null;const scaledDays=computePauseScaledDaysThisYear(pause,todayUtc,yearStart,yearEnd,);const statusLabel=getPauseStatusLabel(pause,todayUtc);return`- \`${pause.dataRichiesta}\` -> \`${pause.dataRitorno}\` | **${statusLabel}**| Giorni scalati: \`${scaledDays}\``;}).filter(Boolean);const memberLabel=interaction.guild?.members?.cache?.get(userId)?.displayName||interaction.client?.users?.cache?.get(userId)?.username||` User ID:${userId}`;

    const payload=rows.length===0?{content:`<:staff:1443651912179388548> Staffer: <@${userId}>\n<:attentionfromvega:1443651874032062505> Nessuna pausa trovata nell'anno **${year}**.`, flags:1<<6,}:{embeds:[new EmbedBuilder().setColor("#6f4e37").setTitle(`Pause ${year}-${memberLabel}`).setDescription(`<:staff:1443651912179388548> Staffer: <@${userId}>\n\n${rows.join("\n")}\n\n<a:VC_Calendar:1448670320180592724> Totale giorni scalati nell'anno corrente: \`${computeConsumedPauseDays(pauses)}\``,),],flags:1<<6,};

    if (acknowledgedByUpdate) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
    return true;
  }

  if (!pauseId) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Dati pausa non validi.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const lockKey = `${String(interaction.guildId || "dm")}:${String(userId)}:${String(pauseId)}`;
  if (pauseActionLocks.has(lockKey)) {
    await interaction
      .reply({
        content:
          "<a:VC_Alert:1448670089670037675> Questa richiesta pausa è già in elaborazione.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }
  pauseActionLocks.add(lockKey);

  try {

  const targetPause = stafferRecord.pauses?.id?.(pauseId);
  if (!targetPause) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Richiesta pausa non trovata.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  if (action === "pause_reject") {
    if (targetPause.status !== "pending") {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1448670089670037675> Questa richiesta è già stata gestita.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    targetPause.status = "rejected";
    await stafferRecord.save();
    await interaction.deferUpdate().catch(() => {});
    await interaction.message?.delete().catch(() => {});
    await interaction.channel
      ?.send({
        content: `<:cancel:1461730653677551691> Richiesta pausa rifiutata per <@${userId}>.`,
      })
      .catch(() => {});
    return true;
  }

  if (action === "pause_cancel") {
    if (targetPause.status !== "accepted") {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1448670089670037675> Questa pausa non è annullabile.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const end = parseItalianDate(targetPause.dataRitorno);
    const todayForExpiry = getTodayUtc();
    if (end && todayForExpiry > end) {
      await interaction
        .update({
          components: [],
        })
        .catch(() => {});
      await interaction
        .followUp({
          content:
            "<a:VC_Alert:1448670089670037675> La pausa è scaduta: il pulsante annulla non è più disponibile.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const member = await getGuildMemberCached(interaction.guild, userId);
    if (!member) {
      await interaction
        .reply({
          content:
            "<a:VC_Alert:1448670089670037675> Staffer non trovato nel server.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const todayUtc = getTodayUtc();
    const start = parseItalianDate(targetPause.dataRichiesta);
    const totalScheduledDays=getPauseDaysBetween(targetPause.dataRichiesta,targetPause.dataRitorno)||0;
    let consumedForCancelledPause = 0;
    if (start && end) {
      if (todayUtc < start) consumedForCancelledPause = 0;
      else if (todayUtc > end) consumedForCancelledPause = totalScheduledDays;
      else
        consumedForCancelledPause = Math.max(
          1,
          Math.floor((todayUtc - start) / MS_PER_DAY) + 1,
        );
    }

    targetPause.status = "cancelled";
    targetPause.giorniUsati = consumedForCancelledPause;
    targetPause.cancelledAt = new Date();
    await stafferRecord.save();

    const baseLimit = getBasePauseLimit(member);
    const bonusBestStaff=member.roles.cache.has(IDs.roles.StafferDelMese)?5:0;
    const maxGiorni = baseLimit + bonusBestStaff;
    const giorniTotaliUsati = computeConsumedPauseDays(stafferRecord.pauses);
    const giorniRimanenti = Math.max(0, maxGiorni - giorniTotaliUsati);

    const currentContent = interaction.message?.content || "";
    const annullataTag = "<:cancel:1461730653677551691> **__\`ANNULLATA\`__**";
    const updatedContent=currentContent.includes(annullataTag)?currentContent:`${currentContent}\n\n${annullataTag}`;

    await interaction
      .update({
        content: updatedContent,
        components: [
          buildAcceptedButtonsRow(userId, pauseId, { hideCancel: true }),
        ],
      })
      .catch(() => {});

    await interaction.channel
      ?.send({
        content: `<:cancel:1461730653677551691> Pausa annullata per <@${userId}>. <a:VC_Calendar:1448670320180592724> Giorni scalati: \`${consumedForCancelledPause}\`. <:VC_Clock:1473359204189474886> Totale usati: \`${giorniTotaliUsati}/${maxGiorni}\` (\`${giorniRimanenti}\` rimanenti).`,
      })
      .catch(() => {});
    return true;
  }

  if (targetPause.status !== "pending") {
    await interaction
      .reply({
        content:
          "<a:VC_Alert:1448670089670037675> Questa richiesta è già stata gestita.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const member = await getGuildMemberCached(interaction.guild, userId);
  if (!member) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Staffer non trovato nel server.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const giorniRichiesti=getPauseDaysBetween(targetPause.dataRichiesta,targetPause.dataRitorno,);
  if (!giorniRichiesti) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1448670089670037675> Date pausa non valide.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const baseLimit = getBasePauseLimit(member);
  const bonusBestStaff=member.roles.cache.has(IDs.roles.StafferDelMese)?5:0;
  const maxGiorni = baseLimit + bonusBestStaff;
  const usedBefore = computeConsumedPauseDays(stafferRecord.pauses);
  const giorniUsati = usedBefore + giorniRichiesti;
  const giorniRimanenti = maxGiorni - giorniUsati;
  if (giorniRimanenti < 0) {
    await interaction
      .reply({
        content: `<a:VC_Alert:1448670089670037675> Limite pause superato: disponibili \`${Math.max(0, maxGiorni - usedBefore)}\` su \`${maxGiorni}\`.`,
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  const roleLabel = getMemberRoleLabel(member);
  const overlappingSameRole=await computeStaffersInPauseByRoleForRange(guildId,roleLabel,targetPause.dataRichiesta,targetPause.dataRitorno,);
  const sameRoleActiveCount = overlappingSameRole + 1;

  targetPause.status = "accepted";
  targetPause.ruolo = roleLabel;
  targetPause.giorniUsati = giorniUsati;
  targetPause.giorniAggiuntivi = bonusBestStaff;
  targetPause.stafferInPausa = sameRoleActiveCount;
  await stafferRecord.save();

  const pauseEnd = parseItalianDate(targetPause.dataRitorno);
  const hideCancelOnCreate = Boolean(pauseEnd && getTodayUtc() > pauseEnd);
  const pauseTimingText=getPauseTimingText(targetPause.dataRichiesta,targetPause.dataRitorno,);
  const channel = await getGuildChannelCached(interaction.guild, IDs.channels.pause);
  let pauseMessage = null;
  if (channel) {
    pauseMessage=await channel.send({content:`<a:VC_Calendar:1448670320180592724> **\`${targetPause.ruolo}\`** - **<@${userId}>**${pauseTimingText}.\n<a:VC_Clock:1473359204189474886> Dal**\`${targetPause.dataRichiesta}\`** al **\`${targetPause.dataRitorno}\`**\n<a:VC_update:1478721333096349817> __\`${giorniUsati}/${maxGiorni}\`__ giorni utilizzati (\`${giorniRimanenti}\` rimanenti) - <:staff:1443651912179388548> __\`${sameRoleActiveCount}\`__ staffer in pausa in quel ruolo`,components:[buildAcceptedButtonsRow(userId,pauseId,{hideCancel:hideCancelOnCreate,}),],}).catch(() => {});
    if (pauseMessage && pauseEnd) {
      schedulePauseButtonsRemoval(
        interaction.guild,
        channel.id,
        pauseMessage.id,
        targetPause.dataRitorno,
      );
    }
  }
  if (channel && !pauseMessage) {
    targetPause.status = "pending";
    targetPause.ruolo = null;
    targetPause.giorniUsati = undefined;
    targetPause.giorniAggiuntivi = undefined;
    targetPause.stafferInPausa = undefined;
    await stafferRecord.save().catch(() => {});
    await interaction
      .reply({
        content:
          "<a:VC_Alert:1448670089670037675> Non sono riuscito a pubblicare la pausa nel canale dedicato. Riprova.",
        flags: 1 << 6,
      })
      .catch(() => {});
    return true;
  }

  await interaction.deferUpdate().catch(() => {});
  await interaction.message?.delete().catch(() => {});
  return true;
  } finally {
    pauseActionLocks.delete(lockKey);
  }
}

module.exports = { handlePauseButton };