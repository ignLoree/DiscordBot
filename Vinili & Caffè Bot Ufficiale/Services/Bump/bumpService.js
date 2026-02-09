const { EmbedBuilder } = require('discord.js');
const DisboardBump = require('../../Schemas/Disboard/disboardBumpSchema');
const { DiscadiaBump, DiscadiaVoter } = require('../../Schemas/Discadia/discadiaSchemas');

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

  async function sendReminder(client, guildId) {
    const serviceConfig = client?.config?.[configKey];
    if (!serviceConfig?.reminderChannelId) return;
    const channel = client.channels.cache.get(serviceConfig.reminderChannelId)
      || await client.channels.fetch(serviceConfig.reminderChannelId).catch(() => null);
    if (!channel) return;

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
      void sendReminder(client, guildId);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        await sendReminder(client, guildId);
      } catch (error) {
        global.logger.error(errorTag, error);
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
  title: "<:VC_Eye:1331619214410383381> **É L'ORA DEL `BUMP`!**",
  url: 'https://disboard.org/it/server/1329080093599076474',
  description: '<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!',
  errorTag: '[DISBOARD REMINDER ERROR]'
});

const discadiaBumpService = createBumpReminderService({
  model: DiscadiaBump,
  configKey: 'discadia',
  defaultCooldownMinutes: 1440,
  mentionContent: '<@&1442569013074071644>',
  title: '<:VC_Eye:1331619214410383381> **É L\'ORA DEL `BUMP` SU DISCADIA!**',
  url: 'https://discadia.com/server/viniliecaffe/',
  description: '<:VC_bump:1330185435401424896> **Per bumpare scrivi __`/bump` in chat__**!',
  errorTag: '[DISCADIA REMINDER ERROR]'
});

function getVoteCooldownMs(client) {
  const hours = client?.config?.discadiaVoteReminder?.cooldownHours || 24;
  return hours * 60 * 60 * 1000;
}

function getVoteCheckIntervalMs(client) {
  const minutes = client?.config?.discadiaVoteReminder?.checkIntervalMinutes || 30;
  return minutes * 60 * 1000;
}

function getVoteReminderText(client) {
  return client?.config?.discadiaVoteReminder?.message
    || 'Hey! Sono passate 24 ore: puoi votare di nuovo su Discadia. Grazie per il supporto!';
}

async function sendVoteFallbackChannelReminder(client, guildId, userId, message) {
  const fallbackId = client?.config?.discadiaVoteReminder?.fallbackChannelId;
  if (!fallbackId) return;
  const channel = client.channels.cache.get(fallbackId)
    || await client.channels.fetch(fallbackId).catch(() => null);
  if (!channel) return;
  await channel.send({ content: `<@${userId}> ${message}` }).catch(() => {});
}

async function recordDiscadiaVote(guildId, userId) {
  const now = new Date();
  const doc = await DiscadiaVoter.findOneAndUpdate(
    { guildId, userId },
    {
      $set: { lastVoteAt: now },
      $setOnInsert: { lastRemindedAt: null },
      $inc: { voteCount: 1 }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc?.voteCount || 1;
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
  const message = getVoteReminderText(client);
  for (const doc of due) {
    if (!doc?.userId || !doc?.guildId) continue;
    if (now - new Date(doc.lastVoteAt).getTime() < cooldownMs) continue;
    const user = client.users.cache.get(doc.userId)
      || await client.users.fetch(doc.userId).catch(() => null);
    if (!user) continue;
    try {
      await user.send(message);
      await DiscadiaVoter.updateOne(
        { guildId: doc.guildId, userId: doc.userId },
        { $set: { lastRemindedAt: new Date() } }
      );
    } catch {
      await sendVoteFallbackChannelReminder(client, doc.guildId, doc.userId, message);
    }
  }
}

function startDiscadiaVoteReminderLoop(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;
  const intervalMs = getVoteCheckIntervalMs(client);
  setInterval(() => {
    sendDueDiscadiaVoteReminders(client).catch((error) => {
      global.logger.error('[DISCADIA VOTE REMINDER ERROR]', error);
    });
  }, intervalMs);
}

module.exports = {
  createBumpReminderService,
  recordBump: disboardService.recordBump,
  restorePendingReminders: disboardService.restorePendingReminders,
  recordDiscadiaBump: discadiaBumpService.recordBump,
  restorePendingDiscadiaReminders: discadiaBumpService.restorePendingReminders,
  recordDiscadiaVote,
  sendDueReminders: sendDueDiscadiaVoteReminders,
  startDiscadiaVoteReminderLoop
};