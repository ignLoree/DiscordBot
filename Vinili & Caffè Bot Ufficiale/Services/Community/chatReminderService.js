const { EmbedBuilder } = require('discord.js');
const ChatReminderSchedule = require('../../Schemas/Community/chatReminderScheduleSchema');
const ChatReminderRotation = require('../../Schemas/Community/chatReminderRotationSchema');

const REMINDER_CHANNEL_ID = '1442569130573303898';
const TIME_ZONE = 'Europe/Rome';
const START_HOUR = 9;
const END_HOUR = 21;
const scheduledHours = new Set();
const scheduledTimeouts = new Map();
let rotationDate = null;
let rotationQueue = [];
let rotationGuildId = null;
let lastSentAt = null;

const reminderPool = [
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('⭐ Votaci su Discadia!')
    .setDescription(
      [
        'La prima volta otterrai **250 EXP**, le altre volte altri exp!',
        'Vota qui: https://discadia.com/server/viniliecaffe/'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('⭐ Lascia una recensione su DISBOARD!')
    .setDescription(
      [
        'Lasciare un recensione aiuta il server a farci conoscere e crescere, una volta messa la recensione apri un <#1442569095068254219> `HIGH STAFF` e riceverei **5 livelli**!',
        'Recensisci il nostro server qui: https://disboard.org/it/review/update/1019527'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('📌 Marca un messaggio e rendilo un post')
    .setDescription(
      [
        'Rispondendo al messaggio con <@1329118940110127204> o con tasto destro -> App -> Quote, che si vuole postare, potrai poi vederlo nel canale <#1468540884537573479>'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle("🔢 Conta fino all'infinito!")
    .setDescription(
      [
        'Sei un appasionato di calcoli e matematica? Vieni a contare nel canale <#1442569179743125554>'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('💌 Devi segnalare un utente, fare una partnership o ti serve supporto?')
    .setDescription(
      [
        'Attraverso i ticket nel canale <#1442569095068254219> puoi contattare un membro dello Staff che ti darà una mano per ogni tua richiesta.'
      ].join('\n')
    ),
  () => new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('📸 Sblocca i Picperms')
    .setDescription(
      [
        'Puoi sbloccarli in modo veloce mettendo ".gg/viniliecaffe" nello stato del tuo profilo Discord, potenziando il server oppure salendo al Livello 10.',
        '> <a:VC_Arrow:1448672967721615452> Scopri tutte le ricompense dei boost & livelli su: <#1442569159237177385>'
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
    .setTitle("📬 Vuoi candidarti come staffer?")
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
];

function getDateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function saveRotationState() {
  if (!rotationGuildId || !rotationDate) return;
  await ChatReminderRotation.findOneAndUpdate(
    { guildId: rotationGuildId },
    { $set: { dateKey: rotationDate, queue: rotationQueue, lastSentAt: lastSentAt ? new Date(lastSentAt) : null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => {});
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

function getRomeParts(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
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

async function sendReminder(client, scheduleId) {
  const channel = client.channels.cache.get(REMINDER_CHANNEL_ID)
    || await client.channels.fetch(REMINDER_CHANNEL_ID).catch(() => null);
  if (!channel) return;
  const parts = getRomeParts(new Date());
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
  scheduledHours.add(key);

  const totalSeconds = parts.minute * 60 + parts.second;
  const remainingMs = Math.max(1, (60 * 60 - totalSeconds) * 1000);
  const minGapMs = 30 * 60 * 1000;
  const now = Date.now();
  const minStartDelay = lastSentAt ? Math.max(0, lastSentAt + minGapMs - now) : 0;
  if (minStartDelay >= remainingMs) return;
  const availableMs = Math.max(0, remainingMs - minStartDelay);
  const count = (availableMs <= minGapMs) ? 1 : (Math.random() < 0.5 ? 1 : 2);
  const delays = [];
  if (count === 1) {
    delays.push(minStartDelay + Math.floor(Math.random() * availableMs));
  } else {
    const maxFirst = Math.max(0, remainingMs - minGapMs);
    const firstWindowMax = Math.max(minStartDelay, Math.min(maxFirst, remainingMs - minGapMs));
    const first = Math.floor(Math.random() * (firstWindowMax - minStartDelay + 1)) + minStartDelay;
    const second = Math.floor(Math.random() * (remainingMs - (first + minGapMs) + 1)) + first + minGapMs;
    delays.push(first, second);
  }
  const fireTimes = delays.map((delay) => new Date(Date.now() + delay));
  for (const fireAt of fireTimes) {
    const doc = await ChatReminderSchedule.create({ guildId, fireAt }).catch(() => null);
    if (!doc) continue;
    const timeout = setTimeout(() => {
      sendReminder(client, doc._id).catch(() => { });
    }, Math.max(1, fireAt.getTime() - Date.now()));
    scheduledTimeouts.set(doc._id.toString(), timeout);
  }
}

async function restoreSchedules(client) {
  const now = new Date();
  const parts = getRomeParts(now);
  const key = getDateKey(parts);
  const guildId = client.guilds.cache.first()?.id || null;
  if (!guildId) return;
  await loadRotationState(guildId, key);
  const due = await ChatReminderSchedule.find({ fireAt: { $lte: now } }).lean();
  for (const item of due) {
    await sendReminder(client, item._id).catch(() => { });
  }
  const upcoming = await ChatReminderSchedule.find({ fireAt: { $gt: now } }).lean();
  for (const item of upcoming) {
    const delay = Math.max(1, new Date(item.fireAt).getTime() - Date.now());
    const timeout = setTimeout(() => {
      sendReminder(client, item._id).catch(() => { });
    }, delay);
    scheduledTimeouts.set(item._id.toString(), timeout);
  }
}

function startHourlyReminderLoop(client) {
  const tick = async () => {
    const parts = getRomeParts(new Date());
    if (parts.hour < START_HOUR || parts.hour > END_HOUR) return;
    const guildId = client.guilds.cache.first()?.id || null;
    if (!guildId) return;
    await scheduleForHour(client, parts, guildId);
  };
  restoreSchedules(client).catch(() => { });
  tick();
  setInterval(tick, 60 * 1000);
}

module.exports = { startHourlyReminderLoop };
