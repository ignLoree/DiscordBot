const cron = require("node-cron");
const IDs = require("../../Utils/Config/ids");
const BirthdayProfile = require("../../Schemas/Community/birthdayProfileSchema");

const DEFAULT_TIME_ZONE = "Europe/Rome";
const BIRTHDAY_ROLE_ID = "1474729085719548048";
let birthdayLoopHandle = null;
let birthdayTickRunning = false;

function getRomeDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function inferBirthYearFromAge(day, month, age, now = new Date()) {
  const safeAge = Math.max(1, Number(age || 0));
  const today = getRomeDateParts(now);
  const birthdayAlreadyPassed =
    today.month > month || (today.month === month && today.day >= day);
  const birthYear = today.year - safeAge - (birthdayAlreadyPassed ? 0 : 1);
  return Math.max(1900, birthYear);
}

function buildBirthdayAnnouncement(docs, currentYear) {
  const mentions = docs.map((doc) => `<@${doc.userId}>`);
  const intro =
    mentions.length === 1
      ? `Oggi è il compleanno di ${mentions[0]}`
      : `Oggi è il compleanno di ${mentions.join(", ")}`;

  const visibleAges = docs
    .filter((doc) => doc.showAge && Number.isFinite(Number(doc.birthYear)))
    .map((doc) => Math.max(1, currentYear - Number(doc.birthYear)));

  if (!visibleAges.length) return `${intro}.`;
  if (visibleAges.length === 1) {
    return `${intro} e oggi compie ${visibleAges[0]} anni.`;
  }
  return `${intro} e oggi compiono ${visibleAges.join(", ")} anni.`;
}

async function assignBirthdayRole(guild, userId) {
  if (!guild || !userId || !BIRTHDAY_ROLE_ID) return;
  const member =
    guild.members.cache.get(userId) ||
    (await guild.members.fetch(userId).catch(() => null));
  if (!member) return;
  if (member.roles.cache.has(BIRTHDAY_ROLE_ID)) return;
  await member.roles.add(BIRTHDAY_ROLE_ID).catch(() => {});
}

async function runBirthdayTick(client) {
  if (!client || birthdayTickRunning) return;
  birthdayTickRunning = true;
  try {
    const channelId = IDs.channels.chat || null;

    const today = getRomeDateParts(new Date());
    const docs = await BirthdayProfile.find({
      day: today.day,
      month: today.month,
      $or: [
        { lastCelebratedYear: { $exists: false } },
        { lastCelebratedYear: { $ne: today.year } },
      ],
    })
      .lean()
      .catch(() => []);

    if (!docs.length) return;

    const byGuild = new Map();
    for (const doc of docs) {
      const guildKey = String(doc.guildId || "");
      if (!guildKey) continue;
      const list = byGuild.get(guildKey) || [];
      list.push(doc);
      byGuild.set(guildKey, list);
    }

    for (const [guildId, guildDocs] of byGuild.entries()) {
      const guild =
        client.guilds.cache.get(guildId) ||
        (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) continue;

      let channel =
        (channelId
          ? guild.channels.cache.get(channelId) ||
            (await guild.channels.fetch(channelId).catch(() => null))
          : null) || null;
      if (!channel?.isTextBased?.()) {
        channel =
          guild.channels.cache.find(
            (c) => c?.isTextBased?.() && /chat|chatting/i.test(c.name),
          ) || null;
      }
      if (!channel?.isTextBased?.()) continue;

      const content = buildBirthdayAnnouncement(guildDocs, today.year);
      await channel.send({ content });

      for (const doc of guildDocs) {
        await assignBirthdayRole(guild, String(doc.userId || ""));
      }

      const ids = guildDocs.map((doc) => String(doc._id)).filter(Boolean);
      if (ids.length) {
        await BirthdayProfile.updateMany(
          { _id: { $in: ids } },
          { $set: { lastCelebratedYear: today.year } },
        ).catch(() => {});
      }
    }
  } catch (error) {
    global.logger?.error?.("[BIRTHDAY] Tick failed:", error);
  } finally {
    birthdayTickRunning = false;
  }
}

function startBirthdayLoop(client) {
  if (!client || birthdayLoopHandle) return birthdayLoopHandle;
  birthdayLoopHandle = cron.schedule(
    "0 0 * * *",
    () => {
      runBirthdayTick(client).catch((error) =>
        global.logger?.error?.("[BIRTHDAY] Scheduled tick failed:", error),
      );
    },
    { timezone: DEFAULT_TIME_ZONE },
  );

  return birthdayLoopHandle;
}

module.exports = {
  startBirthdayLoop,
  runBirthdayTick,
  getRomeDateParts,
  inferBirthYearFromAge,
};

