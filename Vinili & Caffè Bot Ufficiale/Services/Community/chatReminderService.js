const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('crypto');
const { ChatReminderSchedule } = require('../../Schemas/Community/communitySchemas');
const { ChatReminderRotation } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const DEFAULT_REMINDER_CHANNEL_ID = IDs.channels.inviteLog;
const DEFAULT_TIME_ZONE = 'Europe/Rome';
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 21;
const DEFAULT_MIN_GAP_MS = 30 * 60 * 1000;
const scheduledHours = new Set();
const scheduledTimeouts = new Map();
let rotationDate = null;
let rotationQueue = [];
let rotationGuildId = null;
let lastSentAt = null;
const reminderActivity = new Map();

const reminderPool = [
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('🌐 Votaci su Discadia!')
    .setDescription(
      [
        'La prima volta otterrai **250 EXP**, le altre volte altri exp!',
        'Vota qui: https://discadia.com/server/viniliecaffe/'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('🌐 Lascia una recensione su DISBOARD!')
    .setDescription(
      [
        `Lasciare un recensione aiuta il server a farci conoscere e crescere, una volta messa la recensione apri un <#${IDs.channels.ticketPanel}> \`HIGH STAFF\` e riceverai **5 livelli**!`,
        'Recensisci il nostro server qui: https://disboard.org/it/server/1329080093599076474'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('📌 Marca un messaggio e rendilo un post')
    .setDescription(
      [
        'Rispondendo al messaggio taggando il bot <@1329118940110127204> o con tasto destro -> App -> Quote, che si vuole postare, potrai poi vederlo nel canale <#1468540884537573479>'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle("🔢 Conta fino all'infinito!")
    .setDescription(
      [
        `Sei un appasionato di calcoli e matematica? Vieni a contare nel canale <#${IDs.channels.counting}>`
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('📩 Devi segnalare un utente, fare una partnership o ti serve supporto?')
    .setDescription(
      [
        `Attraverso i ticket nel canale <#${IDs.channels.ticketPanel}> puoi contattare un membro dello Staff che ti darà una mano per ogni tua richiesta.`
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('📸 Sblocca i Picperms')
    .setDescription(
      [
        'Puoi sbloccarli in modo veloce mettendo ".gg/viniliecaffe" nello stato del tuo profilo Discord, potenziando il server oppure salendo al Livello 10.',
        `> <a:VC_Arrow:1448672967721615452> Scopri tutte le ricompense dei boost & livelli su: <#${IDs.channels.infoPerks}>`
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle("<:pokeball:1467091572632850474> Gotta Catch 'Em All!")
    .setDescription(
      [
        'Sei un appasionato di Pokémon? Vieni a catturarli tutti nel canale <#1442569184281362552>'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle("📝 Vuoi candidarti come staffer?")
    .setDescription(
      [
        'Cosa aspetti? Vieni a candidarti attraverso il modulo che trovi nel canale <#1442569232507473951>'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle("💸 Soldi o Nitro Boost **__GRATIS__**?")
    .setDescription(
      [
        'Vuoi un Nitro Boost o fari un po\' di soldi gratis? Trovi tutto nel canale <#1442579412280410194>'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle("🎨 Ottieni i colori gradienti")
    .setDescription(
      [
        'Potrai sbloccare i colori PLUS con il ruolo Server Booster o Livello 50+; invece con il VIP potrai creartene uno personalizzato! Li trovi su: <#1469429150669602961>'
      ].join('\n')
    ),
];

function getDateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCfg(client) {
  return client?.config?.chatReminder || {};
}

function getReminderChannelId(client) {
  return getCfg(client)?.channelId || DEFAULT_REMINDER_CHANNEL_ID;
}

function getTimeZone(client) {
  return getCfg(client)?.timeZone || DEFAULT_TIME_ZONE;
}

function getStartHour(client) {
  return Number.isFinite(Number(getCfg(client)?.startHour))
    ? Number(getCfg(client)?.startHour)
    : DEFAULT_START_HOUR;
}

function getEndHour(client) {
  return Number.isFinite(Number(getCfg(client)?.endHour))
    ? Number(getCfg(client)?.endHour)
    : DEFAULT_END_HOUR;
}

function getMinGapMs(client) {
  return Math.max(60 * 1000, Number(getCfg(client)?.minGapMs || DEFAULT_MIN_GAP_MS));
}

function getFirstThreshold(client) {
  return Math.max(1, Number(getCfg(client)?.firstReminderMinMessages30m || 5));
}

function getSecondThreshold(client) {
  return Math.max(1, Number(getCfg(client)?.secondReminderMinMessages30m || 20));
}

async function saveRotationState() {
  if (!rotationGuildId || !rotationDate) return;
  await ChatReminderRotation.findOneAndUpdate(
    { guildId: rotationGuildId },
    { $set: { dateKey: rotationDate, queue: rotationQueue, lastSentAt: lastSentAt ? new Date(lastSentAt) : null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => { });
}

async function loadRotationState(guildId, dateKey) {
  rotationGuildId = guildId;
  const doc = await ChatReminderRotation.findOne({ guildId }).lean().catch(() => null);
  if (doc && doc.dateKey === dateKey && Array.isArray(doc.queue)) {
    rotationDate = doc.dateKey;
    rotationQueue = doc.queue.slice();
    lastSentAt = doc.lastSentAt ? new Date(doc.lastSentAt).getTime() : null;
    return;
  }
  rotationDate = dateKey;
  rotationQueue = [];
  lastSentAt = doc?.lastSentAt ? new Date(doc.lastSentAt).getTime() : null;
  await saveRotationState();
}

async function nextReminderEmbed(parts) {
  const key = getDateKey(parts);
  if (rotationDate !== key || rotationQueue.length === 0) {
    rotationDate = key;
    rotationQueue = reminderPool.map((_, idx) => idx);
    for (let i = rotationQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [rotationQueue[i], rotationQueue[j]] = [rotationQueue[j], rotationQueue[i]];
    }
    await saveRotationState();
  }
  const index = rotationQueue.shift();
  await saveRotationState();
  const next = Number.isFinite(index) ? reminderPool[index] : reminderPool[0];
  return next();
}

function getRomeParts(date, client) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: getTimeZone(client),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getHourKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}`;
}

function rand(max) {
  if (max <= 0) return 0;
  return randomInt(0, max + 1);
}

function recordReminderActivity(channelId) {
  if (!channelId) return;
  const now = Date.now();
  const list = reminderActivity.get(channelId) || [];
  list.push(now);
  const cutoff = now - 60 * 60 * 1000;
  const trimmed = list.filter((ts) => ts >= cutoff);
  reminderActivity.set(channelId, trimmed);
}

function getRecentReminderCount(channelId, windowMs = 60 * 60 * 1000) {
  if (!channelId) return 0;
  const now = Date.now();
  const list = reminderActivity.get(channelId) || [];
  const cutoff = now - windowMs;
  const trimmed = list.filter((ts) => ts >= cutoff);
  reminderActivity.set(channelId, trimmed);
  return trimmed.length;
}

async function getRecentChannelMessageCount(client, channelId, windowMs = 60 * 60 * 1000) {
  if (!client || !channelId) return 0;
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return 0;
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages?.size) return 0;
  const cutoff = Date.now() - windowMs;
  let count = 0;
  for (const msg of messages.values()) {
    if (msg?.author?.bot) continue;
    const ts = msg?.createdTimestamp || 0;
    if (ts >= cutoff) count += 1;
  }
  return count;
}

async function getActivityCounts(client) {
  const channelId = getReminderChannelId(client);
  const mem30 = getRecentReminderCount(channelId, 30 * 60 * 1000);
  const mem60 = getRecentReminderCount(channelId, 60 * 60 * 1000);
  const hist30 = await getRecentChannelMessageCount(client, channelId, 30 * 60 * 1000);
  const hist60 = await getRecentChannelMessageCount(client, channelId, 60 * 60 * 1000);
  return {
    count30m: Math.max(mem30, hist30),
    count60m: Math.max(mem60, hist60)
  };
}

async function sendReminder(client, scheduleId, kind = 'first') {
  const nowMs = Date.now();
  const minGapMs = getMinGapMs(client);
  if (lastSentAt && (nowMs - lastSentAt) < minGapMs && scheduleId) {
    const nextAt = new Date(lastSentAt + minGapMs);
    await ChatReminderSchedule.updateOne({ _id: scheduleId }, { $set: { fireAt: nextAt, kind } }).catch(() => { });
    const delay = Math.max(1, nextAt.getTime() - Date.now());
    const timeout = setTimeout(() => {
      sendReminder(client, scheduleId, kind).catch(() => { });
    }, delay);
    scheduledTimeouts.set(scheduleId.toString(), timeout);
    return;
  }
  const { count30m: activityCount30m } = await getActivityCounts(client);
  if (kind === 'second' && activityCount30m < getSecondThreshold(client)) {
    if (scheduleId) await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => { });
    return;
  }
  if (kind !== 'second' && activityCount30m < getFirstThreshold(client)) {
    if (scheduleId) await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => { });
    return;
  }
  const channelId = getReminderChannelId(client);
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;
  const parts = getRomeParts(new Date(), client);
  const embed = await nextReminderEmbed(parts);
  await channel.send({ embeds: [embed] }).catch(() => { });
  lastSentAt = Date.now();
  await saveRotationState();
  if (scheduleId) {
    await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => { });
  }
}

async function scheduleForHour(client, parts, guildId) {
  const key = getHourKey(parts);
  if (scheduledHours.has(key)) return;

  const totalSeconds = parts.minute * 60 + parts.second;
  const remainingMs = Math.max(1, (60 * 60 - totalSeconds) * 1000);
  const now = Date.now();
  const minGapMs = getMinGapMs(client);
  let baseLast = lastSentAt || 0;
  const latestScheduled = await ChatReminderSchedule.findOne({ guildId, fireAt: { $gt: new Date() } })
    .sort({ fireAt: -1 })
    .lean()
    .catch(() => null);
  if (latestScheduled?.fireAt) {
    baseLast = Math.max(baseLast, new Date(latestScheduled.fireAt).getTime());
  }
  const minStartDelay = baseLast ? Math.max(0, baseLast + minGapMs - now) : 0;
  if (minStartDelay >= remainingMs) return;
  const availableMs = Math.max(0, remainingMs - minStartDelay);
  const { count30m: activityCount30m } = await getActivityCounts(client);
  const allowFirst = activityCount30m >= getFirstThreshold(client);
  const allowSecond = activityCount30m >= getSecondThreshold(client) && availableMs > minGapMs;
  const delays = [];
  if (allowFirst) {
    const firstDelay = minStartDelay + rand(availableMs);
    delays.push(firstDelay);
  }
  if (allowSecond) {
    const baseDelay = delays.length ? delays[0] : minStartDelay;
    const secondMin = baseDelay + minGapMs;
    if (secondMin < remainingMs) {
      const secondDelay = rand(remainingMs - secondMin) + secondMin;
      delays.push(secondDelay);
    }
  }
  const fireTimes = delays
    .sort((a, b) => a - b)
    .map((delay, idx) => ({ fireAt: new Date(Date.now() + delay), kind: idx === 0 ? 'first' : 'second' }));
  if (!fireTimes.length) return;
  scheduledHours.add(key);
  for (const item of fireTimes) {
    const fireAt = item.fireAt;
    const adjusted = baseLast ? Math.max(fireAt.getTime(), baseLast + minGapMs) : fireAt.getTime();
    baseLast = adjusted;
    const doc = await ChatReminderSchedule.create({ guildId, fireAt, kind: item.kind }).catch(() => null);
    if (!doc) continue;
    if (adjusted !== fireAt.getTime()) {
      await ChatReminderSchedule.updateOne({ _id: doc._id }, { $set: { fireAt: new Date(adjusted), kind: item.kind } }).catch(() => { });
    }
    const timeout = setTimeout(() => {
      sendReminder(client, doc._id, item.kind).catch(() => { });
    }, Math.max(1, adjusted - Date.now()));
    scheduledTimeouts.set(doc._id.toString(), timeout);
  }
}

async function restoreSchedules(client) {
  const now = new Date();
  const parts = getRomeParts(now, client);
  const key = getDateKey(parts);
  const guildId = client.guilds.cache.first()?.id || null;
  if (!guildId) return;
  await loadRotationState(guildId, key);
  const due = await ChatReminderSchedule.find({ fireAt: { $lte: now } }).lean();
  for (const item of due) {
    await sendReminder(client, item._id, item.kind || 'first').catch(() => { });
  }
  let upcoming = await ChatReminderSchedule.find({ fireAt: { $gt: now } }).lean();
  upcoming = Array.isArray(upcoming) ? upcoming.sort((a, b) => new Date(a.fireAt) - new Date(b.fireAt)) : [];
  const minGapMs = getMinGapMs(client);
  let lastTime = lastSentAt ? new Date(lastSentAt).getTime() : null;
  for (const item of upcoming) {
    let fireAt = new Date(item.fireAt).getTime();
    if (lastTime && (fireAt - lastTime) < minGapMs) {
      fireAt = lastTime + minGapMs;
      await ChatReminderSchedule.updateOne({ _id: item._id }, { $set: { fireAt: new Date(fireAt) } }).catch(() => { });
    }
    const delay = Math.max(1, fireAt - Date.now());
    const timeout = setTimeout(() => {
      sendReminder(client, item._id, item.kind || 'first').catch(() => { });
    }, delay);
    scheduledTimeouts.set(item._id.toString(), timeout);
    lastTime = fireAt;
  }
}

function startHourlyReminderLoop(client) {
  const tick = async () => {
    const parts = getRomeParts(new Date(), client);
    if (parts.hour < getStartHour(client) || parts.hour > getEndHour(client)) return;
    const guildId = client.guilds.cache.first()?.id || null;
    if (!guildId) return;
    await scheduleForHour(client, parts, guildId);
  };
  restoreSchedules(client).catch(() => { });
  tick();
  setInterval(tick, 60 * 1000);
}

module.exports = { startHourlyReminderLoop, recordReminderActivity };



