const { EmbedBuilder } = require('discord.js');
const DisboardBump = require('../../Schemas/Disboard/disboardBumpSchema');
const { DiscadiaBump, DiscadiaVoter } = require('../../Schemas/Discadia/discadiaSchemas');
const IDs = require('../../Utils/Config/ids');
const { getNoDmSet } = require('../../Utils/noDmList');
const discadiaVoteTimers = new Map(); // key: `${guildId}:${userId}`

const BUMP_REMINDER_CHANNEL_BY_KEY = {
  disboard: IDs.channels.commands,
  discadia: IDs.channels.commands
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
    errorTag
  } = options;

  const bumpTimers = new Map();

  function getCooldownMs(client) {
    const minutes = client?.config?.[configKey]?.cooldownMinutes || defaultCooldownMinutes;
    return minutes * 60 * 1000;
  }

  function getReminderChannelId() {
    return BUMP_REMINDER_CHANNEL_BY_KEY[configKey] || null;
  }

  async function sendReminder(client, guildId) {
    const reminderChannelId = getReminderChannelId();
    if (!reminderChannelId) {
      global.logger.warn(`${errorTag} reminderChannelId missing for guild ${guildId}`);
      return;
    }
    const channel = client.channels.cache.get(reminderChannelId)
      || await client.channels.fetch(reminderChannelId).catch(() => null);
    if (!channel) {
      global.logger.warn(`${errorTag} reminder channel not found (${reminderChannelId}) for guild ${guildId}`);
      return;
    }

    const embedColor = client?.config?.embedInfo || '#6f4e37';
    await channel.send({
      content: mentionContent,
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor)
          .setTitle(title)
          .setURL(url)
          .setDescription(description)
      ]
    });

    await model.updateOne(
      { guildId },
      { $set: { reminderSentAt: new Date() } }
    );
  }

  function scheduleReminder(client, guildId, lastBumpAt) {
    const existing = bumpTimers.get(guildId);
    if (existing) clearTimeout(existing);

    const cooldownMs = getCooldownMs(client);
    const now = Date.now();
    const targetTime = new Date(lastBumpAt).getTime() + cooldownMs;
    const remaining = targetTime - now;

    if (remaining <= 0) {
      bumpTimers.delete(guildId);
      void sendReminder(client, guildId);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
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
    const doc = await model.findOneAndUpdate(
      { guildId },
      {
        $set: {
          lastBumpAt: bumpAt,
          lastBumpUserId: userId || null,
          reminderSentAt: null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    scheduleReminder(client, guildId, doc.lastBumpAt);
    return doc;
  }

  async function recordBump(client, guildId, userId) {
    return setBumpAt(client, guildId, new Date(), userId);
  }

  async function restorePendingReminders(client) {
    const docs = await model.find({
      reminderSentAt: null,
      lastBumpAt: { $exists: true }
    });
    for (const doc of docs) {
      scheduleReminder(client, doc.guildId, doc.lastBumpAt);
    }
  }

  return {
    recordBump,
    setBumpAt,
    restorePendingReminders
  };
}

const disboardService = createBumpReminderService({
  model: DisboardBump,
  configKey: 'disboard',
  defaultCooldownMinutes: 120,
  mentionContent: '<@&1442569013074071644>',
  title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP`!**",
  url: 'https://disboard.org/it/server/1329080093599076474',
  description: '<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!',
  errorTag: '[DISBOARD REMINDER ERROR]'
});

const discadiaBumpService = createBumpReminderService({
  model: DiscadiaBump,
  configKey: 'discadia',
  defaultCooldownMinutes: 1440,
  mentionContent: '<@&1442569013074071644>',
  title: '<:VC_Eye:1331619214410383381> **È L\'ORA DEL `BUMP` SU DISCADIA!**',
  url: 'https://discadia.com/server/viniliecaffe/',
  description: '<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!',
  errorTag: '[DISCADIA REMINDER ERROR]'
});
let discadiaVoteReminderLoopHandle = null;

function getVoteCooldownMs(client) {
  const raw = client?.config?.discadiaVoteReminder?.cooldownHours;
  const hours = Number(raw);

  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;

  return safeHours * 60 * 60 * 1000;
}

function getVoteCheckIntervalMs(client) {
  const minutes = client?.config?.discadiaVoteReminder?.checkIntervalMinutes || 30;
  return minutes * 60 * 1000;
}

function getVoteReminderText(client) {
  return client?.config?.discadiaVoteReminder?.message
    || 'Hey! Sono passate 24 ore: puoi votare di nuovo su Discadia. Grazie per il supporto!';
}

function buildVoteReminderEmbed(client) {
  const text = getVoteReminderText(client);
  return new EmbedBuilder()
    .setColor(client?.config?.embedInfo || '#6f4e37')
    .setTitle('Reminder voto Discadia')
    .setDescription(text)
    .setFooter({
      text: "Per non ricevere più DM automatici usa +no-dm (blocca anche avvisi importanti)."
    });
}

async function sendVoteFallbackChannelReminder(client, guildId, userId) {
  const fallbackId = client?.config?.discadiaVoteReminder?.fallbackChannelId;
  if (!fallbackId) return;
  const channel = client.channels.cache.get(fallbackId)
    || await client.channels.fetch(fallbackId).catch(() => null);
  if (!channel) return;
  const embed = buildVoteReminderEmbed(client);
  await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => { });
}

async function recordDiscadiaVote(client, guildId, userId) {
  const now = new Date();
  const mainGuildId = IDs.guilds.main;
  guildId = mainGuildId;
  const doc = await DiscadiaVoter.findOneAndUpdate(
    { guildId: IDs.guilds.main, userId },
    { $set: { lastVoteAt: now }, $setOnInsert: { lastRemindedAt: null }, $inc: { voteCount: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
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
      if (Date.now() - new Date(doc.lastVoteAt).getTime() < cooldownMs) return;

      const noDmSet = await getNoDmSet(guildId).catch(() => new Set());
      if (noDmSet.has(userId)) return;

      const user = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => null);
      if (!user) return;

      const embed = buildVoteReminderEmbed(client);

      try {
        await user.send({ embeds: [embed] });
      } catch {
        await sendVoteFallbackChannelReminder(client, guildId, userId);
      }

      await DiscadiaVoter.updateOne(
        { guildId, userId },
        { $set: { lastRemindedAt: new Date() } }
      ).catch(() => { });
    } finally {
      discadiaVoteTimers.delete(key);
    }
  };

  if (delay <= 0) {
    void run();
    return;
  }

  discadiaVoteTimers.set(key, setTimeout(() => run().catch(() => { }), delay));
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

      if (doc.lastRemindedAt && Date.now() - new Date(doc.lastRemindedAt).getTime() < cooldownMs - 60_000) return;

      const noDmSet = await getNoDmSet(guildId).catch(() => new Set());
      if (noDmSet.has(userId)) return;

      const user = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => null);
      if (!user) return;

      const embed = buildVoteReminderEmbed(client);
      try {
        await user.send({ embeds: [embed] });
      } catch {
        await sendVoteFallbackChannelReminder(client, guildId, userId);
      }

      await DiscadiaVoter.updateOne(
        { guildId, userId },
        { $set: { lastRemindedAt: new Date() } }
      ).catch(() => { });
    } finally {
      discadiaVoteTimers.delete(key);
    }
  };

  if (delay <= 0) {
    void run();
    return;
  }

  discadiaVoteTimers.set(key, setTimeout(() => run().catch(() => { }), delay));
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
      { guildId: 1, userId: 1, lastVoteAt: 1 }
    ).lean();
  } catch (err) {
    global.logger?.error?.('[DISCADIA] Failed fetching vote docs:', err);
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
    const jitter =
      5 * 60 * 1000 +
      Math.floor(Math.random() * 10 * 60 * 1000);

    const syntheticLastVote = new Date(Date.now() - cooldownMs + jitter);

    scheduleDiscadiaVoteReminder(
      client,
      guildId,
      userId,
      syntheticLastVote
    );

    restored++;
  }

  global.logger?.info?.(
    `[DISCADIA] Restored ${restored} vote reminders, skipped ${skipped} (too old)`
  );
}

async function sendDueDiscadiaVoteReminders(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;
  const cooldownMs = getVoteCooldownMs(client);
  const now = Date.now();
  const due = await DiscadiaVoter.find({
    lastVoteAt: { $exists: true },
    $or: [
      { lastRemindedAt: null },
      { lastRemindedAt: { $lt: new Date(now - cooldownMs) } }
    ]
  }).lean();
  if (!due.length) return;
  const noDmByGuild = new Map();
  const embed = buildVoteReminderEmbed(client);
  for (const doc of due) {
    const key = `vote:${doc.userId}`;
    if (discadiaVoteTimers.has(key)) continue;
    if (!doc?.userId || !doc?.guildId) continue;
    if (now - new Date(doc.lastVoteAt).getTime() < cooldownMs) continue;

    let noDmSet = noDmByGuild.get(doc.guildId);
    if (!noDmSet) {
      noDmSet = await getNoDmSet(doc.guildId).catch(() => new Set());
      noDmByGuild.set(doc.guildId, noDmSet);
    }
    if (noDmSet.has(doc.userId)) continue;

    const user = client.users.cache.get(doc.userId)
      || await client.users.fetch(doc.userId).catch(() => null);
    if (!user) continue;
    try {
      await user.send({ embeds: [embed] });
      await DiscadiaVoter.updateOne(
        { guildId: doc.guildId, userId: doc.userId },
        { $set: { lastRemindedAt: new Date() } }
      );
    } catch {
      await sendVoteFallbackChannelReminder(client, doc.guildId, doc.userId);
      await DiscadiaVoter.updateOne(
        { guildId: doc.guildId, userId: doc.userId },
        { $set: { lastRemindedAt: new Date() } }
      ).catch(() => { });
    }
  }
}

function startDiscadiaVoteReminderLoop(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;
  if (discadiaVoteReminderLoopHandle) return discadiaVoteReminderLoopHandle;
  const intervalMs = getVoteCheckIntervalMs(client);
  discadiaVoteReminderLoopHandle = setInterval(() => {
    sendDueDiscadiaVoteReminders(client).catch((error) => {
      global.logger.error('[DISCADIA VOTE REMINDER ERROR]', error);
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
  restorePendingVoteReminders
};

