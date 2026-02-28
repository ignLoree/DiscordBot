const { EmbedBuilder } = require("discord.js");
const DisboardBump = require("../../Schemas/Disboard/disboardBumpSchema");
const { DiscadiaBump, DiscadiaVoter, } = require("../../Schemas/Discadia/discadiaSchemas");
const IDs = require("../../Utils/Config/ids");
const { getNoDmSet } = require("../../Utils/noDmList");
const discadiaVoteTimers = new Map();
const STAFF_BYPASS_ROLE_IDS = new Set(
  [
    IDs.roles.Staff,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.PartnerManager,
    IDs.roles.Coordinator,
    IDs.roles.Supervisor,
    IDs.roles.HighStaff,
    IDs.roles.Admin,
    IDs.roles.Manager,
    IDs.roles.CoFounder,
    IDs.roles.Founder,
  ].filter(Boolean),
);

const BUMP_REMINDER_CHANNEL_BY_KEY = {
  disboard: IDs.channels.commands,
  discadia: IDs.channels.commands,
};

function createBumpReminderService(options) {
  const {
    model,
    configKey,
    defaultCooldownMinutes,
    mentionContent,
    title,
    url,
    description,
    errorTag,
    logTag = errorTag,
    suppressInfoLogs = false,
  } = options;

  const bumpTimers = new Map();

  function getCooldownMs(client) {
    const minutes =
      client?.config?.[configKey]?.cooldownMinutes || defaultCooldownMinutes;
    return minutes * 60 * 1000;
  }

  function getReminderChannelId() {
    return BUMP_REMINDER_CHANNEL_BY_KEY[configKey] || null;
  }

  async function sendReminder(client, guildId) {
    const reminderChannelId = getReminderChannelId();
    if (!reminderChannelId) {
      global.logger?.warn?.(
        `${errorTag} reminderChannelId missing for guild ${guildId}`,
      );
      return;
    }
    const channel =
      client.channels.cache.get(reminderChannelId) ||
      (await client.channels.fetch(reminderChannelId).catch(() => null));
    if (!channel) {
      global.logger?.warn?.(
        `${errorTag} reminder channel not found (${reminderChannelId}) for guild ${guildId}`,
      );
      return;
    }

    const embedColor = client?.config?.embedInfo || "#6f4e37";
    await channel.send({
      content: mentionContent,
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor)
          .setTitle(title)
          .setURL(url)
          .setDescription(description),
      ],
    });

    await model
      .updateOne({ guildId }, { $set: { reminderSentAt: new Date() } })
      .catch((err) =>
        global.logger.error(
          `${errorTag} updateOne reminderSentAt failed:`,
          err,
        ),
      );
  }

  function scheduleReminder(client, guildId, lastBumpAt) {
    if (!suppressInfoLogs) {
      global.logger?.info?.(
        `${errorTag} scheduleReminder called guild=${guildId} lastBumpAt=${lastBumpAt}`,
      );
    }
    const existing = bumpTimers.get(guildId);
    if (existing) clearTimeout(existing);

    const cooldownMs = getCooldownMs(client);
    const now = Date.now();
    const lastBumpTime = new Date(lastBumpAt).getTime();
    const targetTime = lastBumpTime + cooldownMs;
    const remaining = targetTime - now;

    if (remaining <= 0) {
      bumpTimers.delete(guildId);
      if (!suppressInfoLogs) {
        global.logger?.info?.(
          `${logTag} cooldown already passed, sending reminder now guild=${guildId}`,
        );
      }
      sendReminder(client, guildId).catch((err) => {
        global.logger.error(`${errorTag} sendReminder failed:`, err);
      });
      return;
    }

    const remainingMinutes = Math.round(remaining / 60_000);
    if (!suppressInfoLogs) {
      global.logger?.info?.(
        `${logTag} reminder scheduled for guild=${guildId} in ${remainingMinutes} minutes`,
      );
    }

    const timeout = setTimeout(async () => {
      try {
        if (!suppressInfoLogs) {
          global.logger?.info?.(`${logTag} firing reminder for guild=${guildId}`);
        }
        await sendReminder(client, guildId);
      } catch (error) {
        global.logger.error(errorTag, error);
      } finally {
        bumpTimers.delete(guildId);
      }
    }, remaining);

    bumpTimers.set(guildId, timeout);
  }

  async function setBumpAt(client, guildId, bumpAt, userId) {
    const bumpDate = bumpAt instanceof Date ? bumpAt : new Date(bumpAt);
    let lastBumpAt = bumpDate;
    let doc = null;
    try {
      doc = await model.findOneAndUpdate(
        { guildId },
        {
          $set: {
            lastBumpAt: bumpDate,
            lastBumpUserId: userId || null,
            reminderSentAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (doc?.lastBumpAt) lastBumpAt = new Date(doc.lastBumpAt);
    } catch (err) {
      global.logger?.error?.(`${errorTag} setBumpAt DB failed, scheduling in-memory anyway:`, err?.message || err);
    }
    scheduleReminder(client, guildId, lastBumpAt);
    return doc;
  }

  async function recordBump(client, guildId, userId) {
    return setBumpAt(client, guildId, new Date(), userId);
  }

  async function restorePendingReminders(client) {
    const docs = await model.find({
      reminderSentAt: null,
      lastBumpAt: { $exists: true },
    });
    if (docs.length > 0 && !suppressInfoLogs) {
      global.logger?.info?.(
        `${logTag} restoring ${docs.length} pending reminder(s)`,
      );
    }
    for (const doc of docs) {
      scheduleReminder(client, doc.guildId, doc.lastBumpAt);
    }
  }

  return {
    recordBump,
    setBumpAt,
    restorePendingReminders,
  };
}

const disboardService = createBumpReminderService({
  model: DisboardBump,
  configKey: "disboard",
  defaultCooldownMinutes: 120,
  mentionContent: "<@&1442569013074071644>",
  title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP`!**",
  url: "https://disboard.org/it/server/1329080093599076474",
  description:
    "<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!",
  errorTag: "[DISBOARD REMINDER ERROR]",
  logTag: "[DISBOARD REMINDER]",
  suppressInfoLogs: true,
});

const discadiaBumpService = createBumpReminderService({
  model: DiscadiaBump,
  configKey: "discadia",
  defaultCooldownMinutes: 1440,
  mentionContent: "<@&1442569013074071644>",
  title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP` SU DISCADIA!**",
  url: "https://discadia.com/server/viniliecaffe/",
  description:
    "<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!",
  errorTag: "[DISCADIA REMINDER ERROR]",
  logTag: "[DISCADIA REMINDER]",
  suppressInfoLogs: true,
});
let discadiaVoteReminderLoopHandle = null;

function getVoteCooldownMs(client) {
  const raw = client?.config?.discadiaVoteReminder?.cooldownHours;
  const hours = Number(raw);

  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;

  return safeHours * 60 * 60 * 1000;
}

function getVoteCheckIntervalMs(client) {
  const minutes =
    client?.config?.discadiaVoteReminder?.checkIntervalMinutes || 30;
  return minutes * 60 * 1000;
}

function getVoteReminderText(client) {
  return (
    client?.config?.discadiaVoteReminder?.message ||
    "Hey! Sono passate 24 ore: puoi votare di nuovo su Discadia. Grazie per il supporto!"
  );
}

function buildVoteReminderEmbed(client) {
  const text = getVoteReminderText(client);
  return new EmbedBuilder()
    .setColor(client?.config?.embedInfo || "#6f4e37")
    .setTitle("Reminder voto Discadia")
    .setDescription(text)
    .setFooter({
      text: "Per non ricevere più DM automatici usa +dm-disable (blocca anche avvisi importanti).",
    });
}

const lastVoteFallbackSentAt = new Map();
const VOTE_FALLBACK_COOLDOWN_MS = 60 * 60 * 1000;

async function isStaffNoDmBypassUser(client, guildId, userId) {
  if (!client || !userId || !STAFF_BYPASS_ROLE_IDS.size) return false;

  const resolvedGuildId = guildId || IDs.guilds.main;
  const guild =
    client.guilds.cache.get(resolvedGuildId) ||
    (await client.guilds.fetch(resolvedGuildId).catch(() => null));
  if (!guild) return false;

  const member =
    guild.members.cache.get(userId) ||
    (await guild.members.fetch(userId).catch(() => null));
  if (!member?.roles?.cache) return false;

  for (const roleId of STAFF_BYPASS_ROLE_IDS) {
    if (member.roles.cache.has(roleId)) return true;
  }

  return false;
}

async function shouldSkipVoteDmByNoDm(client, guildId, userId) {
  const noDmSet = await getNoDmSet(guildId).catch(() => new Set());
  if (!noDmSet.has(userId)) return false;

  const isStaffBypass = await isStaffNoDmBypassUser(client, guildId, userId);
  return !isStaffBypass;
}

async function sendVoteFallbackChannelReminder(client, guildId, userId) {
  const fallbackId = client?.config?.discadiaVoteReminder?.fallbackChannelId;
  if (!fallbackId) return;
  const now = Date.now();
  const key = String(guildId || fallbackId);
  if (
    lastVoteFallbackSentAt.get(key) &&
    now - lastVoteFallbackSentAt.get(key) < VOTE_FALLBACK_COOLDOWN_MS
  )
    return;
  const channel =
    client.channels.cache.get(fallbackId) ||
    (await client.channels.fetch(fallbackId).catch(() => null));
  if (!channel) return;
  const embed = buildVoteReminderEmbed(client);
  await channel
    .send({ content: `<@${userId}>`, embeds: [embed] })
    .catch(() => {});
  lastVoteFallbackSentAt.set(key, now);
}

async function recordDiscadiaVote(client, guildId, userId) {
  const now = new Date();
  const mainGuildId = IDs.guilds.main;
  guildId = mainGuildId;
  const doc = await DiscadiaVoter.findOneAndUpdate(
    { guildId: IDs.guilds.main, userId },
    {
      $set: { lastVoteAt: now },
      $setOnInsert: {
        lastRemindedAt: null,
        voteMilestoneGranted: [],
        voteMilestoneNearReminded: [],
      },
      $inc: { voteCount: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  scheduleDiscadiaVoteReminder(client, mainGuildId, userId, now);
  return doc?.voteCount || 1;
}

function scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const key = `vote:${userId}`;
  const existing = discadiaVoteTimers.get(key);
  if (existing) clearTimeout(existing);

  const cooldownMs = getVoteCooldownMs(client);
  const targetTime = new Date(lastVoteAt).getTime() + cooldownMs;
  const delay = targetTime - Date.now();

  const run = async () => {
    try {
      const doc = await DiscadiaVoter.findOne({ guildId, userId }).lean();
      if (!doc?.lastVoteAt) return;
      const cooldownMsRun = getVoteCooldownMs(client);
      if (Date.now() - new Date(doc.lastVoteAt).getTime() < cooldownMsRun)
        return;
      if (
        doc.lastRemindedAt &&
        new Date(doc.lastRemindedAt).getTime() >=
          new Date(doc.lastVoteAt).getTime()
      )
        return;
      if (await shouldSkipVoteDmByNoDm(client, guildId, userId)) return;
      const user =
        client.users.cache.get(userId) ||
        (await client.users.fetch(userId).catch(() => null));
      if (!user) return;
      const embed = buildVoteReminderEmbed(client);
      try {
        await user.send({ embeds: [embed] });
      } catch {
        await sendVoteFallbackChannelReminder(client, guildId, userId);
      }
      await DiscadiaVoter.updateOne(
        { guildId, userId },
        { $set: { lastRemindedAt: new Date() } },
      ).catch(() => {});
    } finally {
      discadiaVoteTimers.delete(key);
    }
  };

  if (delay <= 0) {
    void run();
    return;
  }

  discadiaVoteTimers.set(
    key,
    setTimeout(() => run().catch(() => {}), delay),
  );
}

function scheduleVoteReminder(client, guildId, userId, lastVoteAt) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const key = `${guildId}:${userId}`;
  const existing = discadiaVoteTimers.get(key);
  if (existing) clearTimeout(existing);

  const cooldownMs = getVoteCooldownMs(client);
  const target = new Date(lastVoteAt).getTime() + cooldownMs;
  const delay = target - Date.now();

  const run = async () => {
    try {
      const doc = await DiscadiaVoter.findOne({ guildId, userId }).lean();
      if (!doc?.lastVoteAt) return;
      if (Date.now() - new Date(doc.lastVoteAt).getTime() < cooldownMs) return;

      if (
        doc.lastRemindedAt &&
        Date.now() - new Date(doc.lastRemindedAt).getTime() <
          cooldownMs - 60_000
      )
        return;

      if (await shouldSkipVoteDmByNoDm(client, guildId, userId)) return;

      const user =
        client.users.cache.get(userId) ||
        (await client.users.fetch(userId).catch(() => null));
      if (!user) return;

      const embed = buildVoteReminderEmbed(client);
      try {
        await user.send({ embeds: [embed] });
      } catch {
        await sendVoteFallbackChannelReminder(client, guildId, userId);
      }

      await DiscadiaVoter.updateOne(
        { guildId, userId },
        { $set: { lastRemindedAt: new Date() } },
      ).catch(() => {});
    } finally {
      discadiaVoteTimers.delete(key);
    }
  };

  if (delay <= 0) {
    void run();
    return;
  }

  discadiaVoteTimers.set(
    key,
    setTimeout(() => run().catch(() => {}), delay),
  );
}

async function restorePendingVoteReminders(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const cooldownMs = getVoteCooldownMs(client);

  const SEND_IMMEDIATELY_IF_LATE_MS = 2 * 60 * 60 * 1000;
  const SKIP_IF_TOO_OLD_MS = 24 * 60 * 60 * 1000;
  let docs = [];
  try {
    docs = await DiscadiaVoter.find(
      { lastVoteAt: { $exists: true } },
      { guildId: 1, userId: 1, lastVoteAt: 1 },
    ).lean();
  } catch (err) {
    global.logger?.error?.("[DISCADIA] Failed fetching vote docs:", err);
    return;
  }

  if (!docs.length) return;

  const latestByUser = new Map();

  for (const doc of docs) {
    if (!doc?.userId || !doc?.lastVoteAt) continue;

    const prev = latestByUser.get(doc.userId);
    const currentTs = new Date(doc.lastVoteAt).getTime();

    if (!prev) {
      latestByUser.set(doc.userId, doc);
      continue;
    }

    const prevTs = new Date(prev.lastVoteAt).getTime();
    if (currentTs > prevTs) {
      latestByUser.set(doc.userId, doc);
    }
  }

  let restored = 0;
  let skipped = 0;

  for (const doc of latestByUser.values()) {
    const userId = String(doc.userId);
    const guildId = String(doc.guildId);
    const lastVoteAt = new Date(doc.lastVoteAt);

    const targetTime = lastVoteAt.getTime() + cooldownMs;
    const lateBy = Date.now() - targetTime;

    if (lateBy <= 0) {
      scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt);
      restored++;
      continue;
    }

    if (lateBy > SKIP_IF_TOO_OLD_MS) {
      skipped++;
      continue;
    }

    if (lateBy <= SEND_IMMEDIATELY_IF_LATE_MS) {
      scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt);
      restored++;
      continue;
    }
    const jitter = 5 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000);

    const syntheticLastVote = new Date(Date.now() - cooldownMs + jitter);

    scheduleDiscadiaVoteReminder(client, guildId, userId, syntheticLastVote);

    restored++;
  }
}

async function sendDueDiscadiaVoteReminders(client) {
  return;
}

function startDiscadiaVoteReminderLoop(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;
  if (discadiaVoteReminderLoopHandle) return discadiaVoteReminderLoopHandle;
  const intervalMs = getVoteCheckIntervalMs(client);
  discadiaVoteReminderLoopHandle = setInterval(() => {
    sendDueDiscadiaVoteReminders(client).catch((error) => {
      global.logger.error("[DISCADIA VOTE REMINDER ERROR]", error);
    });
  }, intervalMs);
  return discadiaVoteReminderLoopHandle;
}

module.exports = {
  createBumpReminderService,
  recordBump: disboardService.recordBump,
  restorePendingReminders: disboardService.restorePendingReminders,
  recordDiscadiaBump: discadiaBumpService.recordBump,
  restorePendingDiscadiaReminders: discadiaBumpService.restorePendingReminders,
  recordDiscadiaVote,
  sendDueReminders: sendDueDiscadiaVoteReminders,
  startDiscadiaVoteReminderLoop,
  restorePendingVoteReminders,
};