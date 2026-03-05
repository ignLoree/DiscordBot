const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STAFF_ROLE_PRIORITY = [
  IDs.roles.Founder,
  IDs.roles.CoFounder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Supervisor,
  IDs.roles.Coordinator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
  IDs.roles.PartnerManager,
].filter(Boolean);

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
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
  )
    return null;
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
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function getCurrentYearBoundsUtc() {
  const now = getTodayUtc();
  const year = now.getUTCFullYear();
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    yearEnd: new Date(Date.UTC(year, 11, 31)),
  };
}

function countOverlapDays(start, end, windowStart, windowEnd) {
  if (!start || !end || end < start) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}

async function computeStaffersInPauseByRoleForRange(
  guildId,
  roleLabel,
  rangeStartRaw,
  rangeEndRaw,
) {
  const targetStart = parseItalianDate(rangeStartRaw);
  const targetEnd = parseItalianDate(rangeEndRaw);
  if (!targetStart || !targetEnd) return 0;

  const docs = await Staff.find({ guildId }, { userId: 1, pauses: 1 })
    .lean()
    .catch(() => []);
  const userIds = new Set();

  for (const doc of docs) {
    const pauses = Array.isArray(doc?.pauses) ? doc.pauses : [];
    const hasOverlap = pauses.some((pause) => {
      if (!pause || pause.status !== "accepted") return false;
      if ((pause.ruolo || "").trim() !== roleLabel) return false;
      const pStart = parseItalianDate(pause.dataRichiesta);
      const pEnd = parseItalianDate(pause.dataRitorno);
      return rangesOverlap(targetStart, targetEnd, pStart, pEnd);
    });
    if (hasOverlap && doc?.userId) userIds.add(String(doc.userId));
  }

  return userIds.size;
}

async function getStaffPauseRecord(guildId, userId) {
  return Staff.findOne({ guildId, userId });
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
      let effectiveEnd = null;
      if (pause.cancelledAt) {
        const c = new Date(pause.cancelledAt);
        effectiveEnd = new Date(
          Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()),
        );
      } else if (start) {
        const consumed = Number(pause.giorniUsati);
        if (Number.isFinite(consumed) && consumed > 0) {
          effectiveEnd = new Date(
            start.getTime() + (consumed - 1) * MS_PER_DAY,
          );
        }
      }
      if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd)
        effectiveEnd = plannedEnd;
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
  return "Staff";
}

function getBasePauseLimit(member) {
  const hasStaffRole = member.roles.cache.has(IDs.roles.Staff);
  const hasPartnerManagerRole = member.roles.cache.has(IDs.roles.PartnerManager);
  if (hasStaffRole) return 60;
  if (hasPartnerManagerRole) return 45;
  return 60;
}

function getPauseStatusLabel(pause, todayUtc) {
  if (!pause) return "Sconosciuto";
  if (pause.status === "cancelled") return "Annullata";
  if (pause.status === "pending") return "Richiesta";
  if (pause.status === "rejected") return "Rifiutata";
  if (pause.status !== "accepted") return pause.status;

  const start = parseItalianDate(pause.dataRichiesta);
  const end = parseItalianDate(pause.dataRitorno);
  if (!start || !end) return "Accettata";
  if (todayUtc < start) return "Programmata";
  if (todayUtc > end) return "Finita";
  return "In corso";
}

function getPauseTimingText(startRaw, endRaw) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  const today = getTodayUtc();
  if (!start || !end) return "è in pausa";
  if (today < start) return "è stato in pausa";
  if (today > end) return "era in pausa";
  return "è in pausa";
}

function computePauseScaledDaysThisYear(pause, todayUtc, yearStart, yearEnd) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const plannedEnd = parseItalianDate(pause?.dataRitorno);
  if (!start || !plannedEnd) return 0;

  if (pause.status === "cancelled") {
    let effectiveEnd = null;
    if (pause.cancelledAt) {
      const c = new Date(pause.cancelledAt);
      effectiveEnd = new Date(
        Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()),
      );
    } else {
      const consumed = Number(pause.giorniUsati);
      if (Number.isFinite(consumed) && consumed > 0) {
        effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
      }
    }
    if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd)
      effectiveEnd = plannedEnd;
    return countOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  if (pause.status === "accepted") {
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
      .setLabel("Accetta")
      .setEmoji(`<:vegacheckmark:1443666279058772028>`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pause_reject:${userId}:${pauseId}`)
      .setLabel("Rifiuta")
      .setEmoji(`<:vegax:1443934876440068179>`)
      .setStyle(ButtonStyle.Danger),
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
        .setLabel("Annulla")
        .setEmoji(`<:vegax:1443934876440068179>`)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disableCancel),
    );
  }
  components.push(
    new ButtonBuilder()
      .setCustomId(`pause_list:${userId}:${pauseId}`)
      .setEmoji(`<:customprofile:1443925456972808304>`)
      .setLabel("Lista pause")
      .setStyle(ButtonStyle.Secondary),
  );
  return new ActionRowBuilder().addComponents(components);
}

function schedulePauseButtonsRemoval(guild, channelId, messageId, pauseEndRaw) {
  const end = parseItalianDate(pauseEndRaw);
  if (!end || !guild || !channelId || !messageId) return;
  const removalAtMs = end.getTime() + MS_PER_DAY;
  const delayMs = removalAtMs - Date.now();
  if (delayMs <= 0) return;

  const timer = setTimeout(async () => {
    try {
      const channel = await getGuildChannelCached(guild, String(channelId));
      if (!channel?.isTextBased?.()) return;
      const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
      if (!msg) return;
      const currentContent = String(msg.content || "");
      const nextContent = currentContent
        .replace(" è in pausa.", " è stato in pausa.")
        .replace(" sarà in pausa.", " è stato in pausa.");
      await msg.edit({ content: nextContent, components: [] }).catch(() => null);
    } catch {}
  }, delayMs);
  if (typeof timer?.unref === "function") timer.unref();
}

module.exports = {
  MS_PER_DAY,
  parseItalianDate,
  getPauseDaysBetween,
  getTodayUtc,
  getCurrentYearBoundsUtc,
  countOverlapDays,
  rangesOverlap,
  computeStaffersInPauseByRoleForRange,
  getStaffPauseRecord,
  computeConsumedPauseDays,
  getMemberRoleLabel,
  getBasePauseLimit,
  getPauseStatusLabel,
  getPauseTimingText,
  computePauseScaledDaysThisYear,
  buildRequestButtonsRow,
  buildAcceptedButtonsRow,
  schedulePauseButtonsRemoval,
};
