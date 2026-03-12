const cron = require("node-cron");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const StaffModel = require("../../Schemas/Staff/staffSchema");
const { ModCase } = require("../../Schemas/Moderation/moderationSchemas");
const { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX, applyAutomaticValutazione } = require("../../Events/interaction/resocontoHandlers");
const { getUserOverviewStats } = require("../Community/activityService");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const TIME_ZONE = "Europe/Rome";
const STAFF_ACTIVITY_LIMITS = { [String(IDs.roles.Helper)]: { messages: 400, hours: 3.5 }, [String(IDs.roles.Mod)]: { messages: 500, hours: 5 }, [String(IDs.roles.Coordinator)]: { messages: 500, hours: 4.5 }, [String(IDs.roles.Supervisor)]: { messages: 450, hours: 4 }, };
const STAFF_SANCTION_LIMITS = { [String(IDs.roles.Mod)]: 3, [String(IDs.roles.Coordinator)]: 4, [String(IDs.roles.Supervisor)]: 4 };
const SANCTION_ACTIONS = new Set(["WARN", "MUTE", "KICK", "BAN"]);
const STAFF_ROLE_PRIORITY = [String(IDs.roles.Supervisor), String(IDs.roles.Coordinator), String(IDs.roles.Mod), String(IDs.roles.Helper),];
const ROLE_UP = {
  [String(IDs.roles.Member || "")]: String(IDs.roles.Helper),
  [String(IDs.roles.Helper)]: String(IDs.roles.Mod),
  [String(IDs.roles.Mod)]: String(IDs.roles.Coordinator),
  [String(IDs.roles.Coordinator)]: String(IDs.roles.Supervisor),
};

let weeklyStaffResocontoTask = null;

function toSafeNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatHoursFromSeconds(seconds) {
  const safeSeconds = Math.max(0, Math.floor(toSafeNumber(seconds)));
  const hours = safeSeconds / 3600;
  return `${hours.toFixed(2)}h`;
}

function getRomeDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = formatter.formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
  };
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit", });
  const timeZoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;

  const match = String(timeZoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) {
    utcMs = baseUtcMs - secondOffsetMs;
  }
  return new Date(utcMs);
}

function getPmResocontoWindow(now = new Date()) {
  const romeToday = getRomeDateParts(now);
  const romeTodayNoonUtc = new Date(Date.UTC(romeToday.year, romeToday.month - 1, romeToday.day, 12, 0, 0),);
  const dayFromMonday = (romeTodayNoonUtc.getUTCDay() + 6) % 7;

  const mondayNoonUtc = new Date(romeTodayNoonUtc.getTime() - dayFromMonday * 24 * 60 * 60 * 1000,);
  const mondayY = mondayNoonUtc.getUTCFullYear();
  const mondayM = mondayNoonUtc.getUTCMonth() + 1;
  const mondayD = mondayNoonUtc.getUTCDate();

  const sundayNoonUtc = new Date(mondayNoonUtc.getTime() + 6 * 24 * 60 * 60 * 1000,);
  const sundayY = sundayNoonUtc.getUTCFullYear();
  const sundayM = sundayNoonUtc.getUTCMonth() + 1;
  const sundayD = sundayNoonUtc.getUTCDate();

  const thisSundayStart = createUtcFromRomeLocal(sundayY, sundayM, sundayD, 15, 1, 0,);
  const weekStart = now.getTime() < thisSundayStart.getTime() ? new Date(thisSundayStart.getTime() - 7 * 24 * 60 * 60 * 1000) : thisSundayStart;
  const scheduledEnd = new Date(weekStart.getTime() + (7 * 24 * 60 * 60 * 1000 - 2 * 60 * 1000),);
  const weekEnd = now.getTime() < scheduledEnd.getTime() ? now : scheduledEnd;

  return { weekStart, weekEnd };
}

function getWeekStartDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - 7);
  return date;
}

const COSTANZA_BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588";

function dayKeyToWeekdayLabel(dayKey) {
  if (!dayKey || typeof dayKey !== "string") return "?";
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "?";
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("it-IT", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(date).replace(".", "").slice(0, 3);
}

function buildCostanzaLines(overview) {
  const chart = Array.isArray(overview?.chart) ? overview.chart : [];
  if (!chart.length) return [];
  const points = chart.slice(-7);
  const maxText = Math.max(1, ...points.map((p) => Math.max(0, Number(p?.text ?? 0))));
  const bars = points.map((p) => {
    const text = Math.max(0, Number(p?.text ?? 0));
    const level = maxText > 0 ? Math.min(7, Math.floor((7 * text) / maxText)) : 0;
    return COSTANZA_BARS[level];
  });
  const activeDays = points.filter((p) => (Number(p?.text ?? 0) > 0) || (Number(p?.voiceSeconds ?? 0) >= 600)).length;
  const labels = points.map((p) => dayKeyToWeekdayLabel(p?.dayKey)).join(" ");
  const barLine = bars.join(" ");
  return [
    `<:VC_Clock:1473359204189474886> **Costanza:** __${activeDays}/${points.length}__ giorni attivi`,
    `\`${labels}\``,
    `\`${barLine}\` messaggi per giorno`,
  ];
}

function parseItalianDate(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function getStaffPauseLine(staffDoc) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    if (today >= start && today <= end) {
      return `<a:VC_Calendar:1448670320180592724> **In pausa** fino al ${p.dataRitorno}`;
    }
    if (end < today && end >= sevenDaysAgo) {
      return `<a:VC_Calendar:1448670320180592724> **Rientrato** il ${p.dataRitorno}`;
    }
  }
  return null;
}

function wasInPauseDuringWeek(staffDoc, weekStart, weekEnd) {
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();
  for (const p of pauses) {
    if (!p || p.status !== "accepted") continue;
    const start = parseItalianDate(p.dataRichiesta);
    const end = parseItalianDate(p.dataRitorno);
    if (!start || !end) continue;
    const ps = start.getTime();
    const pe = end.getTime();
    if (ps <= we && pe >= ws) return true;
  }
  return false;
}

function resolveStaffRole(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function computeActivityGrade(roleId, weeklyMessages, weeklyVoiceHours) {
  const limits = STAFF_ACTIVITY_LIMITS[String(roleId)];
  if (!limits) return "Non classificato";

  const msg = Math.max(0, Math.floor(toSafeNumber(weeklyMessages)));
  const hours = Math.max(0, toSafeNumber(weeklyVoiceHours));
  const limMsg = limits.messages;
  const limHours = limits.hours;

  if (msg >= limMsg * 3 && hours >= limHours * 3) return "Eccellente";
  if (msg >= limMsg * 2 + 300 && hours >= limHours * 2 + 2) return "Ottimo";
  if (msg >= limMsg * 2 && hours >= limHours * 2) return "Buono";
  if (msg >= limMsg + 150 && hours >= limHours + 1.5) return "Discreto";
  if (msg >= limMsg && hours >= limHours) return "Sufficiente";

  const msgDelta = Math.max(0, limMsg - msg);
  const hoursDelta = Math.max(0, limHours - hours);
  if (msgDelta <= 100 && hoursDelta <= 1) return "Insufficiente";
  return "Non classificato";
}

function computeBehaviorGrade(positiveCount, negativeCount) {
  const positive = Math.max(0, Math.floor(toSafeNumber(positiveCount)));
  const negative = Math.max(0, Math.floor(toSafeNumber(negativeCount)));

  if (positive === 0 && negative === 0) return "Non classificato";
  if (positive >= 3 && negative === 0) return "Ottimo";
  if (positive === 0 && negative > 0) return "Non classificato";
  if (negative > positive) return "Insufficiente";
  if (positive > negative) return "Discreto";
  return "Sufficiente";
}

function wasPexedInWeek(staffDoc, weekStart) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  return history.some((row) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    const oldRole = String(row?.oldRole || "");
    const newRole = String(row?.newRole || "");
    const isPromotion = oldRole && newRole && ROLE_UP[oldRole] === newRole;
    const reasonHasPex = String(row?.reason || "").toLowerCase().includes("pex");
    return isPromotion || reasonHasPex;
  });
}

function computeStaffAction(activityGrade, behaviorGrade, pexedInWeek) {
  if (pexedInWeek) return "Nulla";

  if (
    (activityGrade === "Ottimo" || activityGrade === "Eccellente") &&
    behaviorGrade === "Ottimo"
  ) {
    return "Pex";
  }
  if (
    activityGrade === "Non classificato" &&
    behaviorGrade === "Non classificato"
  ) {
    return "Depex";
  }
  if (activityGrade === "Insufficiente" && behaviorGrade === "Insufficiente") {
    return "Valutazione Negativa";
  }
  if (
    (activityGrade === "Buono" || activityGrade === "Discreto") &&
    behaviorGrade === "Discreto"
  ) {
    return "Valutazione Positiva";
  }
  if (activityGrade === "Sufficiente" && behaviorGrade === "Sufficiente") {
    return "Nulla";
  }
  return "Nulla";
}

function wasPmPexedInWeek(staffDoc, weekStart) {
  const history = Array.isArray(staffDoc?.rolesHistory) ? staffDoc.rolesHistory : [];
  const weekStartMs = Number(weekStart.getTime());
  const pmRoleId = String(IDs.roles.PartnerManager || "");
  if (!pmRoleId) return false;
  return history.some((row) => {
    const when = row?.date ? new Date(row.date) : null;
    if (!when || Number.isNaN(when.getTime())) return false;
    if (when.getTime() < weekStartMs) return false;
    return String(row?.newRole || "") === pmRoleId;
  });
}

function computePmAction(weeklyPartners, pmPexedInWeek) {
  if (pmPexedInWeek) return "Nulla";
  const partners = Math.max(0, Math.floor(toSafeNumber(weeklyPartners)));
  if (partners <= 5) return "Depex";
  if (partners <= 10) return "Richiamo";
  if (partners >= 15) return "Nulla";
  if (partners <= 14) return "Richiamo";
  return "Nulla";
}

function staffActionToKey(action) {
  if (action === "Pex") return "px";
  if (action === "Depex") return "dp";
  if (action === "Valutazione Positiva") return "vp";
  if (action === "Valutazione Negativa") return "vn";
  return "nl";
}

function pmActionToKey(action) {
  if (action === "Depex") return "dp";
  if (action === "Richiamo") return "rc";
  return "nl";
}

function buildResocontoButtons(kind, userId, actionKey, roleId = null) {
  const payload = kind === "s" ? `${kind}:${userId}:${roleId}:${actionKey}`
    : `${kind}:${userId}:${actionKey}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${RESOCONTO_APPLY_PREFIX}:${payload}`)
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${RESOCONTO_REJECT_PREFIX}:${payload}`)
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );
}

async function createResocontoThread(message, userId, userLabel = null) {
  if (!message?.startThread) return;
  const safeUserId = String(userId || "");
  if (!/^\d{16,20}$/.test(safeUserId)) return;
  const threadLabel = String(userLabel || safeUserId).trim().slice(0, 70) || safeUserId;

  const thread = await message.startThread({
    name: `Resoconto di ${threadLabel}`,
    autoArchiveDuration: 10080,
    type: ChannelType.PublicThread,
    reason: "Thread automatico resoconto staff/pm",
  })
    .catch(() => null);
  if (!thread?.isTextBased?.()) return;

  const mentionMsg = await thread.send({ content: `<@&${IDs.roles.HighStaff}>` })
    .catch(() => null);
  if (mentionMsg) {
    await mentionMsg.delete().catch(() => null);
  }
}

function countPmWeeklyPartners(staffDoc, weekStart, weekEnd) {
  const actions = Array.isArray(staffDoc?.partnerActions) ? staffDoc.partnerActions : [];
  const weekStartMs = Number(weekStart.getTime());
  const weekEndMs = Number(weekEnd.getTime());
  let count = 0;
  for (const action of actions) {
    if (String(action?.action || "").toLowerCase() !== "create") continue;
    if (Array.isArray(action?.auditPenaltyDates) && action.auditPenaltyDates.length > 0)
      continue;
    const when = action?.date ? new Date(action.date) : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    const whenMs = when.getTime();
    if (whenMs >= weekStartMs && whenMs <= weekEndMs) count += 1;
  }
  return count;
}

async function getWeeklySanctionCountByMod(guildId, weekStart, weekEnd) {
  const map = new Map();
  const counts = await ModCase.aggregate([
    { $match: { guildId, createdAt: { $gte: weekStart, $lte: weekEnd }, action: { $in: Array.from(SANCTION_ACTIONS) } } },
    { $group: { _id: "$modId", count: { $sum: 1 } } },
  ]).catch(() => []);
  for (const row of counts) {
    if (row?._id) map.set(String(row._id), Math.max(0, Number(row.count) || 0));
  }
  return map;
}

async function resolveChannel(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) ||
    (await getGuildChannelCached(client.guilds.cache.get(String(IDs.guilds?.main || "")), channelId)) ||
    (await client.channels.fetch(channelId).catch(() => null));
}

async function runWeeklyStaffResoconti(client) {
  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.resocontiStaff || "");
  if (!guildId || !channelId) return;

  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;

  const channel = await resolveChannel(client, channelId);
  if (!channel?.isTextBased?.()) return;

  const now = new Date();
  const weekStart = getWeekStartDate(now);
  const weekEnd = now;
  const staffDocs = await StaffModel.find({ guildId }, { userId: 1, positiveCount: 1, negativeCount: 1, rolesHistory: 1, partnerActions: 1, pauses: 1 }).lean().catch(() => []);

  const knownStaffUserIds = Array.from(new Set((Array.isArray(staffDocs) ? staffDocs : []).map((row) => String(row?.userId || "")).filter(Boolean),),);
  if (!knownStaffUserIds.length) return;

  const fetchedMembers = await Promise.all(knownStaffUserIds.map((userId) => getGuildMemberCached(guild, userId)),);

  const candidateMembers = [];
  for (const member of fetchedMembers) {
    if (!member) continue;
    if (member.user?.bot) continue;
    if (member.roles.cache.has(String(IDs.roles.HighStaff))) continue;

    const hasStaffRole = Boolean(resolveStaffRole(member));
    const hasPmRole = member.roles.cache.has(String(IDs.roles.PartnerManager));
    if (!hasStaffRole && !hasPmRole) continue;

    candidateMembers.push(member);
  }
  if (!candidateMembers.length) return;

  const staffMap = new Map((Array.isArray(staffDocs) ? staffDocs : []).map((row) => [String(row.userId), row,]),);

  const staffUserIds = candidateMembers.filter((m) => resolveStaffRole(m)).map((m) => String(m.id));
  const overviewResults = await Promise.all(staffUserIds.map((uid) => getUserOverviewStats(guildId, uid, 7)),);
  const overviewMap = new Map(staffUserIds.map((id, i) => [id, overviewResults[i] || null]),);
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guildId, weekStart, weekEnd);

  for (const member of candidateMembers) {
    const userId = String(member.id);
    const staffDoc = staffMap.get(userId) || null;

    const staffRoleId = resolveStaffRole(member);
    if (staffRoleId) {
      const overview = overviewMap.get(userId);
      const d7 = overview?.windows?.d7;
      const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)),);
      const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)),);
      const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
      const activityGrade = computeActivityGrade(staffRoleId, weeklyMessages, weeklyVoiceHours,);
      const behaviorGrade = computeBehaviorGrade(staffDoc?.positiveCount, staffDoc?.negativeCount,);
      const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);
      const inPauseDuringWeek = wasInPauseDuringWeek(staffDoc, weekStart, weekEnd);

      const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
      const contentLines = [
        `<:staff:1443651912179388548> **Staffer:** __**<@${userId}>**__`,
        `<:VC_Mention:1443994358201323681> **Ruolo:** __<@&${staffRoleId}>__`,
        `<:VC_Chat:1448694742237053061> **Messaggi in una settimana:** __${weeklyMessages}__`,
        `<:voice:1467639623735054509> **Ore in una settimana:** __${formatHoursFromSeconds(weeklyVoiceSeconds)}__`,
        ...buildCostanzaLines(overview),
        `<a:VC_Exclamation:1448687427836444854>  **Attività:** __${activityGrade}__`,
        `<:VC_Eye:1331619214410383381> **Condotta:** __${behaviorGrade}__`,
      ];
      if (sanctionLimit != null) {
        const weeklySanctions = sanctionCountByModId.get(userId) || 0;
        contentLines.push(`<:VC_Dot:1443660294596329582> **Sanzioni nella settimana:** __${weeklySanctions}__ (minimo __${sanctionLimit}__)`);
      }
      const action = inPauseDuringWeek ? "Nulla" : computeStaffAction(activityGrade, behaviorGrade, pexedInWeek);
      contentLines.push(`<:VC_BanHammer:1443933132645732362> **Azione:** __${action}__`);
      const pauseLine = getStaffPauseLine(staffDoc);
      if (pauseLine) contentLines.push(pauseLine);

      if (sanctionLimit != null && !inPauseDuringWeek) {
        const weeklySanctions = sanctionCountByModId.get(userId) || 0;
        const sanctionMet = weeklySanctions >= sanctionLimit;
        const reason = sanctionMet ? "Limite sanzioni settimanale completato" : "Limite sanzioni settimanale non completato";
        await applyAutomaticValutazione(guild, client, member.user, sanctionMet, reason).catch(() => null);
      }

      await channel
        .send({
          content: contentLines.join("\n"),
          components: [
            buildResocontoButtons(
              "s",
              userId,
              staffActionToKey(action),
              staffRoleId,
            ),
          ],
        })
        .then((msg) => createResocontoThread(msg, userId, member.user?.username))
        .catch(() => null);
    }

    if (member.roles.cache.has(String(IDs.roles.PartnerManager))) {
      const pmWindow = getPmResocontoWindow(new Date());
      const weeklyPartners = countPmWeeklyPartners(staffDoc, pmWindow.weekStart, pmWindow.weekEnd,);
      const pmPexedInWeek = wasPmPexedInWeek(staffDoc, pmWindow.weekStart);
      const pmInPauseDuringWeek = wasInPauseDuringWeek(staffDoc, pmWindow.weekStart, pmWindow.weekEnd);
      const action = pmInPauseDuringWeek ? "Nulla" : computePmAction(weeklyPartners, pmPexedInWeek);
      const pmPauseLine = getStaffPauseLine(staffDoc);
      const pmContentLines = [
        `<:partnermanager:1443651916838998099> **Partner Manager:** __<@${userId}>__`,
        `<:partneredserverowner:1443651871125409812> **Partner:** __${weeklyPartners}__`,
        `<:VC_BanHammer:1443933132645732362> **Azione:** __${action}__`,
      ];
      if (pmPauseLine) pmContentLines.push(pmPauseLine);

      await channel
        .send({
          content: pmContentLines.join("\n"),
          components: [buildResocontoButtons("p", userId, pmActionToKey(action))],
        })
        .then((msg) => createResocontoThread(msg, userId, member.user?.username))
        .catch(() => null);
    }
  }
}

async function runPreResocontoReminders(client) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;

  const staffDocs = await StaffModel.find({ guildId }, { userId: 1, pauses: 1, partnerActions: 1 }).lean().catch(() => []);
  const staffUserIds = Array.from(new Set((staffDocs || []).map((r) => String(r?.userId || "")).filter((id) => /^\d{16,20}$/.test(id))));
  if (!staffUserIds.length) return;

  const fetchedMembers = await Promise.all(staffUserIds.map((id) => getGuildMemberCached(guild, id)));
  const hasStaffRole = (m) => Boolean(resolveStaffRole(m));
  const hasPmRole = (m) => m.roles.cache.has(String(IDs.roles.PartnerManager));
  const reminderMembers = fetchedMembers.filter(
    (m) => m && !m.user?.bot && !m.roles.cache.has(String(IDs.roles.HighStaff)) && (hasStaffRole(m) || hasPmRole(m)),
  );
  if (!reminderMembers.length) return;

  const staffMap = new Map((staffDocs || []).map((r) => [String(r.userId), r]));
  const staffOnlyIds = reminderMembers.filter(hasStaffRole).map((m) => m.id);
  const overviewResults = await Promise.all(staffOnlyIds.map((uid) => getUserOverviewStats(guildId, uid, 7)));
  const overviewByUserId = new Map(staffOnlyIds.map((id, i) => [String(id), overviewResults[i] || null]));
  const resocontoTime = "**domenica alle 15:00**";
  const reminderWindow = getPmResocontoWindow(new Date());

  for (const member of reminderMembers) {
    const userId = String(member.id);
    const staffDoc = staffMap.get(userId);
    if (wasInPauseDuringWeek(staffDoc, reminderWindow.weekStart, reminderWindow.weekEnd)) continue;

    const staffRoleId = resolveStaffRole(member);
    if (staffRoleId) {
      const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
      if (limits) {
        const overview = overviewByUserId.get(userId);
        const d7 = overview?.windows?.d7;
        const msg = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
        const voiceSec = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
        const hours = voiceSec / 3600;
        const needMsg = Math.max(0, limits.messages - msg);
        const needHours = Math.max(0, limits.hours - hours);
        if (needMsg <= 0 && needHours <= 0) continue;
        const parts = [];
        if (needMsg > 0) parts.push(`**${needMsg}** messaggi`);
        if (needHours > 0) parts.push(`**${needHours.toFixed(2)}** ore in vocale`);
        const text = `<:staff:1443651912179388548> **Promemoria resoconto**\n\nIl resoconto staff è ${resocontoTime}.\n\nPer rientrare nei limiti ti mancano: ${parts.join(" e ")}.`;
        await member.send({ content: text }).catch(() => null);
        continue;
      }
    }

    if (hasPmRole(member)) {
      const pmWindow = getPmResocontoWindow(new Date());
      const weeklyPartners = countPmWeeklyPartners(staffDoc, pmWindow.weekStart, pmWindow.weekEnd);
      const minPartners = 15;
      if (weeklyPartners >= minPartners) continue;
      const mancano = minPartners - weeklyPartners;
      const depexHint = weeklyPartners < 5 ? " (sotto 5 rischi Depex)" : "";
      await member.send({
        content: `<:partnermanager:1443651916838998099> **Promemoria resoconto**\n\nIl resoconto staff è ${resocontoTime}.\n\nCome Partner Manager ti mancano **${mancano}** partner per raggiungere il minimo di ${minPartners}${depexHint}. Attualmente ne hai **${weeklyPartners}**.`,
      }).catch(() => null);
    }
  }
}

function startWeeklyStaffResocontoLoop(client) {
  if (weeklyStaffResocontoTask) return weeklyStaffResocontoTask;

  weeklyStaffResocontoTask = cron.schedule(
    "0 15 * * 0",
    async () => {
      await runWeeklyStaffResoconti(client).catch((err) => {
        global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Execution failed", err);
      });
    },
    { timezone: TIME_ZONE },
  );

  const preResocontoTask = cron.schedule(
    "0 18 * * 5",
    async () => {
      await runPreResocontoReminders(client).catch((err) => {
        global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Pre-reminder failed", err);
      });
    },
    { timezone: TIME_ZONE },
  );
  if (typeof preResocontoTask?.ref === "function") preResocontoTask.ref();

  return weeklyStaffResocontoTask;
}

module.exports = { startWeeklyStaffResocontoLoop, runWeeklyStaffResoconti };