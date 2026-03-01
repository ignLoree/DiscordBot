const cron = require("node-cron");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const StaffModel = require("../../Schemas/Staff/staffSchema");
const {
  RESOCONTO_APPLY_PREFIX,
  RESOCONTO_REJECT_PREFIX,
} = require("../../Events/interaction/resocontoHandlers");
const { getUserOverviewStats } = require("../Community/activityService");

const TIME_ZONE = "Europe/Rome";
const STAFF_ACTIVITY_LIMITS = {
  [String(IDs.roles.Helper)]: { messages: 400, hours: 3.5 },
  [String(IDs.roles.Mod)]: { messages: 500, hours: 5 },
  [String(IDs.roles.Coordinator)]: { messages: 500, hours: 4.5 },
  [String(IDs.roles.Supervisor)]: { messages: 450, hours: 4 },
};
const STAFF_ROLE_PRIORITY = [
  String(IDs.roles.Supervisor),
  String(IDs.roles.Coordinator),
  String(IDs.roles.Mod),
  String(IDs.roles.Helper),
];

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
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const timeZoneName = formatter
    .formatToParts(utcDate)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = String(timeZoneName || "GMT+0").match(
    /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,
  );
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
  const romeTodayNoonUtc = new Date(
    Date.UTC(romeToday.year, romeToday.month - 1, romeToday.day, 12, 0, 0),
  );
  const dayFromMonday = (romeTodayNoonUtc.getUTCDay() + 6) % 7;

  const mondayNoonUtc = new Date(
    romeTodayNoonUtc.getTime() - dayFromMonday * 24 * 60 * 60 * 1000,
  );
  const mondayY = mondayNoonUtc.getUTCFullYear();
  const mondayM = mondayNoonUtc.getUTCMonth() + 1;
  const mondayD = mondayNoonUtc.getUTCDate();

  const sundayNoonUtc = new Date(
    mondayNoonUtc.getTime() + 6 * 24 * 60 * 60 * 1000,
  );
  const sundayY = sundayNoonUtc.getUTCFullYear();
  const sundayM = sundayNoonUtc.getUTCMonth() + 1;
  const sundayD = sundayNoonUtc.getUTCDate();

  const thisSundayStart = createUtcFromRomeLocal(
    sundayY,
    sundayM,
    sundayD,
    15,
    1,
    0,
  );
  const weekStart =
    now.getTime() < thisSundayStart.getTime()
      ? new Date(thisSundayStart.getTime() - 7 * 24 * 60 * 60 * 1000)
      : thisSundayStart;
  const scheduledEnd = new Date(
    weekStart.getTime() + (7 * 24 * 60 * 60 * 1000 - 2 * 60 * 1000),
  );
  const weekEnd = now.getTime() < scheduledEnd.getTime() ? now : scheduledEnd;

  return { weekStart, weekEnd };
}

function getWeekStartDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - 7);
  return date;
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
    const reason = String(row?.reason || "").toLowerCase();
    return reason.includes("pex");
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

function computePmAction(weeklyPartners) {
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
  const payload =
    kind === "s"
      ? `${kind}:${userId}:${roleId}:${actionKey}`
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

  const thread = await message
    .startThread({
      name: `Resoconto di ${threadLabel}`,
      autoArchiveDuration: 10080,
      type: ChannelType.PublicThread,
      reason: "Thread automatico resoconto staff/pm",
    })
    .catch(() => null);
  if (!thread?.isTextBased?.()) return;

  const mentionMsg = await thread
    .send({ content: `<@&${IDs.roles.HighStaff}>` })
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

async function resolveChannel(client, channelId) {
  if (!channelId) return null;
  return (
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null))
  );
}

async function runWeeklyStaffResoconti(client) {
  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.resocontiStaff || "");
  if (!guildId || !channelId) return;

  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;

  const channel = await resolveChannel(client, channelId);
  if (!channel?.isTextBased?.()) return;

  await guild.members.fetch().catch(() => null);
  const weekStart = getWeekStartDate(new Date());

  const candidateMembers = [];
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (member.roles.cache.has(String(IDs.roles.HighStaff))) continue;

    const hasStaffRole = Boolean(resolveStaffRole(member));
    const hasPmRole = member.roles.cache.has(String(IDs.roles.PartnerManager));
    if (!hasStaffRole && !hasPmRole) continue;

    candidateMembers.push(member);
  }
  if (!candidateMembers.length) return;

  const userIds = candidateMembers.map((member) => String(member.id));
  const staffDocs = await StaffModel.find({ guildId, userId: { $in: userIds } })
    .lean()
    .catch(() => []);

  const staffMap = new Map(
    (Array.isArray(staffDocs) ? staffDocs : []).map((row) => [
      String(row.userId),
      row,
    ]),
  );

  const staffUserIds = candidateMembers
    .filter((m) => resolveStaffRole(m))
    .map((m) => String(m.id));
  const overviewResults = await Promise.all(
    staffUserIds.map((uid) => getUserOverviewStats(guildId, uid, 7)),
  );
  const overviewMap = new Map(
    staffUserIds.map((id, i) => [id, overviewResults[i] || null]),
  );

  for (const member of candidateMembers) {
    const userId = String(member.id);
    const staffDoc = staffMap.get(userId) || null;

    const staffRoleId = resolveStaffRole(member);
    if (staffRoleId) {
      const overview = overviewMap.get(userId);
      const d7 = overview?.windows?.d7;
      const weeklyMessages = Math.max(
        0,
        Math.floor(toSafeNumber(d7?.text ?? 0)),
      );
      const weeklyVoiceSeconds = Math.max(
        0,
        Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)),
      );
      const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
      const activityGrade = computeActivityGrade(
        staffRoleId,
        weeklyMessages,
        weeklyVoiceHours,
      );
      const behaviorGrade = computeBehaviorGrade(
        staffDoc?.positiveCount,
        staffDoc?.negativeCount,
      );
      const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);
      const action = computeStaffAction(activityGrade, behaviorGrade, pexedInWeek);

      await channel
        .send({
          content: `
<:discordstaff:1443651872258003005> **Staffer:** __**<@${userId}>**__
<:dot:1443660294596329582> **Ruolo:** __<@&${staffRoleId}>__
<:dot:1443660294596329582> **Messaggi in una settimana:** __${weeklyMessages}__
<:dot:1443660294596329582> **Ore in una settimana:** __${formatHoursFromSeconds(weeklyVoiceSeconds)}__
<:dot:1443660294596329582> **Attività:** __${activityGrade}__
<:dot:1443660294596329582> **Condotta:** __${behaviorGrade}__
<:dot:1443660294596329582> **Azione:** __${action}__`,
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
      const weeklyPartners = countPmWeeklyPartners(
        staffDoc,
        pmWindow.weekStart,
        pmWindow.weekEnd,
      );
      const action = computePmAction(weeklyPartners);

      await channel
        .send({
          content: `<:partneredserverowner:1443651871125409812> **Partner Manager:** __<@${userId}>__
<:dot:1443660294596329582> **Partner:** __${weeklyPartners}__
<:dot:1443660294596329582> **Azione:** __${action}__`,
          components: [buildResocontoButtons("p", userId, pmActionToKey(action))],
        })
        .then((msg) => createResocontoThread(msg, userId, member.user?.username))
        .catch(() => null);
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

  return weeklyStaffResocontoTask;
}

module.exports = {
  startWeeklyStaffResocontoLoop,
  runWeeklyStaffResoconti,
};