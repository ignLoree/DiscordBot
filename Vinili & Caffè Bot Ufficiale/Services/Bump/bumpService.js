const { EmbedBuilder } = require('discord.js');
const DisboardBump = require('../../Schemas/Disboard/disboardBumpSchema');
const { DiscadiaBump, DiscadiaVoter } = require('../../Schemas/Discadia/discadiaSchemas');
const IDs = require('../../Utils/Config/ids');
const { getNoDmSet } = require('../../Utils/noDmList');

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
  await channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
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
  const noDmByGuild = new Map();
  const embed = buildVoteReminderEmbed(client);
  for (const doc of due) {
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
  startDiscadiaVoteReminderLoop
};

