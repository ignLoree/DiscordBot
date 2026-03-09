const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAUSE_FESTIVI_TIMEZONE = "Europe/Rome";
const STAFF_ROLE_PRIORITY = [IDs.roles.Founder, IDs.roles.CoFounder, IDs.roles.Manager, IDs.roles.Admin, IDs.roles.Supervisor, IDs.roles.Coordinator, IDs.roles.Mod, IDs.roles.Helper, IDs.roles.Staff, IDs.roles.PartnerManager].filter(Boolean);

function getRomeDateKey(date) {
  if (!date || !date.getTime) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: PAUSE_FESTIVI_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function getEasterSunday(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year: y, month, day };
}

function getFestiviSetForYear(year) {
  const set = new Set();
  const y = Number(year);
  if (!Number.isFinite(y)) return set;
  const pad = (n) => String(n).padStart(2, "0");
  set.add(`${y}-12-24`);
  set.add(`${y}-12-25`);
  set.add(`${y}-12-26`);
  set.add(`${y}-12-31`);
  set.add(`${y}-01-01`);
  const pasqua = getEasterSunday(y);
  if (pasqua) {
    set.add(`${y}-${pad(pasqua.month)}-${pad(pasqua.day)}`);
    const pasquetta = new Date(y, pasqua.month - 1, pasqua.day + 1);
    set.add(`${pasquetta.getFullYear()}-${pad(pasquetta.getMonth() + 1)}-${pad(pasquetta.getDate())}`);
  }
  return set;
}

function countFestiviInRange(start, end) {
  if (!start || !end || end < start) return 0;
  let count = 0;
  const startUtc = start.getTime();
  const endUtc = end.getTime();
  for (let t = startUtc; t <= endUtc; t += MS_PER_DAY) {
    const date = new Date(t);
    const key = getRomeDateKey(date);
    if (!key) continue;
    const y = parseInt(key.slice(0, 4), 10);
    if (getFestiviSetForYear(y).has(key)) count += 1;
  }
  return count;
}

const PAUSE_ROLE_LIMITS = {
  Helper: null,
  Mod: 3,
  Coordinator: 1,
  Supervisor: 1,
  Admin: 2,
  Manager: 1,
  "Co-Founder": 1,
  CoFounder: 1,
  Founder: 1,
  Staff: null,
  PartnerManager: null,
};

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

function countEffectiveOverlapDays(start, end, windowStart, windowEnd) {
  const raw = countOverlapDays(start, end, windowStart, windowEnd);
  if (raw === 0) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  const festivi = countFestiviInRange(overlapStart, overlapEnd);
  return Math.max(0, raw - festivi);
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}

async function computeStaffersInPauseByRoleForRange(guildId, roleLabel, rangeStartRaw, rangeEndRaw) {
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
      return total + countEffectiveOverlapDays(start, plannedEnd, yearStart, yearEnd);
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
      return total + countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
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

function getPauseRoleLimit(roleLabel) {
  if (!roleLabel || typeof roleLabel !== "string") return null;
  const key = roleLabel.trim();
  if (Object.prototype.hasOwnProperty.call(PAUSE_ROLE_LIMITS, key))
    return PAUSE_ROLE_LIMITS[key];
  return null;
}

function getRomeMonthKey(date) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  if (!year || !month) return null;
  return { year: Number(year), month: Number(month) };
}

function getRomeDateParts(date) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

/** Mese (Rome) a cui la pausa conta per il limite una pausa al mese: a cavallo di due mesi, ritorno entro il 5° → mese inizio; dopo il 5° → mese ritorno. */
function getMonthKeyForPauseCount(dataRichiesta, dataRitorno) {
  const start = parseItalianDate(dataRichiesta);
  const end = parseItalianDate(dataRitorno);
  if (!start || !end) return null;
  const startKey = getRomeMonthKey(start);
  const endKey = getRomeMonthKey(end);
  if (!startKey || !endKey) return null;
  if (startKey.year === endKey.year && startKey.month === endKey.month) return startKey;
  const endParts = getRomeDateParts(end);
  if (!endParts) return startKey;
  if (endParts.day <= 5) return startKey;
  return endKey;
}

function getOnePausePerMonthWarning(staffDoc, normalized) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const newCountKey = getMonthKeyForPauseCount(normalized?.dataRichiesta, normalized?.dataRitorno);
  if (!newCountKey) return null;
  const excludeId = normalized?.excludePauseId;
  const countSameMonth = pauses.filter((p) => {
    if (!p || p.status === "rejected") return false;
    if (excludeId && String(p._id) === String(excludeId)) return false;
    const k = getMonthKeyForPauseCount(p.dataRichiesta, p.dataRitorno);
    return k && k.year === newCountKey.year && k.month === newCountKey.month;
  }).length;
  if (countSameMonth >= 1) return "<:VC_Attention:1443933073438675016> Hai già una richiesta pausa in questo mese. L’High Staff può accettare comunque.";
  return null;
}

function getOneWeekBetweenWarning(staffDoc, excludePauseId = null) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const withDate = pauses
    .filter((p) => p && (p.createdAt || p._id) && String(p._id) !== String(excludePauseId))
    .map((p) => ({ ...p, at: p.createdAt ? new Date(p.createdAt).getTime() : 0 }))
    .filter((p) => p.at > 0)
    .sort((a, b) => b.at - a.at);
  const last = withDate[0];
  if (!last) return null;
  const weekAgo = Date.now() - 7 * MS_PER_DAY;
  if (last.at > weekAgo) return "<:VC_Attention:1443933073438675016> Meno di 1 settimana dall’ultima richiesta. L’High Staff può accettare comunque.";
  return null;
}

function getSpanTwoMonthsFiveDaysWarning(normalized) {
  if (!normalized?.dataRichiesta || !normalized?.dataRitorno) return null;
  const start = parseItalianDate(normalized.dataRichiesta);
  const end = parseItalianDate(normalized.dataRitorno);
  if (!start || !end) return null;
  const startKey = getRomeMonthKey(start);
  const endKey = getRomeMonthKey(end);
  if (!startKey || !endKey) return null;
  if (startKey.year === endKey.year && startKey.month === endKey.month) return null;
  const endDay = end.getUTCDate();
  if (endDay > 5) return "<:VC_Attention:1443933073438675016> La pausa copre due mesi: il ritorno non dovrebbe superare il 5° giorno dell’altro mese. L’High Staff può accettare comunque.";
  return null;
}

function isHelperFirstWeek(member, staffDoc) {
  if (!member?.roles?.cache?.has(IDs.roles.Helper)) return false;
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const helperRoleId = String(IDs.roles.Helper || "");
  const promotedAt = history
    .filter((r) => String(r?.newRole || "") === helperRoleId)
    .sort((a, b) => (new Date(b?.date || 0)).getTime() - (new Date(a?.date || 0)).getTime())[0]?.date;
  if (!promotedAt) return false;
  const then = new Date(promotedAt);
  const weekAgo = new Date(Date.now() - 7 * MS_PER_DAY);
  return then > weekAgo;
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
    return countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  if (pause.status === "accepted") {
    if (todayUtc < start) return 0;
    const effectiveEnd = todayUtc > plannedEnd ? plannedEnd : todayUtc;
    return countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
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
    } catch (err) {
      global.logger?.warn?.("[pauseHandlers] ", err?.message || err);
    }
  }, delayMs);
  if (typeof timer?.unref === "function") timer.unref();
}

module.exports = { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countOverlapDays, countEffectiveOverlapDays, rangesOverlap, computeStaffersInPauseByRoleForRange, getStaffPauseRecord, computeConsumedPauseDays, getMemberRoleLabel, getBasePauseLimit, getPauseRoleLimit, getPauseStatusLabel, getPauseTimingText, computePauseScaledDaysThisYear, buildRequestButtonsRow, buildAcceptedButtonsRow, schedulePauseButtonsRemoval, getRomeMonthKey, getOnePausePerMonthWarning, getOneWeekBetweenWarning, isHelperFirstWeek };