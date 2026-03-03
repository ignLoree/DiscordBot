const { EmbedBuilder } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getCurrentYearBoundsUtc() {
  const today = getTodayUtc();
  const year = today.getUTCFullYear();
  return { yearStart: new Date(Date.UTC(year, 0, 1)), yearEnd: new Date(Date.UTC(year, 11, 31)) };
}

function countOverlapDays(start, end, windowStart, windowEnd) {
  if (!start || !end || end < start) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
}

function getCancelledPauseEffectiveEnd(pause, start, plannedEnd) {
  let effectiveEnd = null;
  if (pause.cancelledAt) {
    const cancelled = new Date(pause.cancelledAt);
    effectiveEnd = new Date(Date.UTC(cancelled.getUTCFullYear(), cancelled.getUTCMonth(), cancelled.getUTCDate()));
  } else if (start) {
    const consumed = Number(pause.giorniUsati);
    if (Number.isFinite(consumed) && consumed > 0) {
      effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
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
  if (pause.status === "cancelled") {
    return countOverlapDays(start, getCancelledPauseEffectiveEnd(pause, start, plannedEnd), yearStart, yearEnd);
  }
  if (pause.status === "accepted") {
    if (todayUtc < start) return 0;
    return countOverlapDays(start, todayUtc > plannedEnd ? plannedEnd : todayUtc, yearStart, yearEnd);
  }
  return 0;
}

function computeConsumedPauseDays(pauses) {
  if (!Array.isArray(pauses)) return 0;
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  return pauses.reduce((total, pause) => {
    if (!pause) return total;
    const start = parseItalianDate(pause.dataRichiesta);
    const plannedEnd = parseItalianDate(pause.dataRitorno);
    if (pause.status === "accepted") {
      return total + countOverlapDays(start, plannedEnd, yearStart, yearEnd);
    }
    if (pause.status === "cancelled") {
      return total + countOverlapDays(start, getCancelledPauseEffectiveEnd(pause, start, plannedEnd), yearStart, yearEnd);
    }
    return total;
  }, 0);
}

function getPauseStatusLabel(pause, todayUtc) {
  if (!pause) return "Sconosciuta";
  if (pause.status === "cancelled") return "Annullata";
  if (pause.status === "pending") return "Richiesta";
  if (pause.status !== "accepted") return pause.status;
  const start = parseItalianDate(pause.dataRichiesta);
  const end = parseItalianDate(pause.dataRitorno);
  if (!start || !end) return "Accettata";
  if (todayUtc < start) return "Programmata";
  if (todayUtc > end) return "Finita";
  return "In corso";
}

function splitRowsForEmbeds(rows, limit = 3500) {
  const chunks = [];
  let current = "";
  for (const row of rows) {
    if ((current + "\n" + row).length > limit) {
      chunks.push(current);
      current = row;
      continue;
    }
    current = current ? `${current}\n${row}` : row;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function buildPauseListPayload({ guildId, requesterId, targetUser, isHighStaff }) {
  if (!isHighStaff && String(targetUser?.id || "") !== String(requesterId || "")) {
    return { ok: false, error: "<:vegax:1443934876440068179> Puoi vedere solo le tue pause." };
  }
  const stafferRecord = await Staff.findOne({ guildId, userId: targetUser.id }, { pauses: 1 }).lean().catch(() => null);
  const pauses = Array.isArray(stafferRecord?.pauses) ? stafferRecord.pauses : [];
  const todayUtc = getTodayUtc();
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  const currentYear = yearStart.getUTCFullYear();
  const rows = pauses.map((pause) => {
    const start = parseItalianDate(pause?.dataRichiesta);
    const end = parseItalianDate(pause?.dataRitorno);
    if (!start || !end || countOverlapDays(start, end, yearStart, yearEnd) <= 0) return null;
    return `- \`${pause.dataRichiesta}\` -> \`${pause.dataRitorno}\` | **${getPauseStatusLabel(pause, todayUtc)}**|Giorni scalati:\`${computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd)}\``;
  }).filter(Boolean);
  if (!rows.length) {
    return {
      ok: true,
      embeds: [new EmbedBuilder().setColor("#6f4e37").setDescription(`<:attentionfromvega:1443651874032062505> Nessuna pausa trovata per ${targetUser} nell'anno **${currentYear}**.`)],
    };
  }
  const totalScaledDays = computeConsumedPauseDays(pauses);
  const embeds = splitRowsForEmbeds(rows).map((chunk, index, chunks) =>
    new EmbedBuilder().setColor("#6f4e37").setTitle(`Pause ${currentYear}-${targetUser.username}${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""}`).setDescription(`${chunk}\n\nTotale giorni scalati anno corrente:\`${totalScaledDays}\``),
  );
  return { ok: true, embeds };
}

module.exports = {
  buildPauseListPayload,
};
