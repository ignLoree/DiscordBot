const { EmbedBuilder } = require('discord.js');

const REMINDER_CHANNEL_ID = '1442569130573303898';
const TIME_ZONE = 'Europe/Rome';
const START_HOUR = 9;
const END_HOUR = 21;
const scheduledHours = new Set();
let rotationDate = null;
let rotationQueue = [];

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
        'Puoi sbloccarli in modo veloce mettendo ".gg/viniliecaffe" nello stato del tuo profilo Discord, potenziando il server oppure salendo al Livello 20.',
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
];

function nextReminderEmbed() {
  const today = new Date().toDateString();
  if (rotationDate !== today || rotationQueue.length === 0) {
    rotationDate = today;
    rotationQueue = reminderPool.slice();
    for (let i = rotationQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [rotationQueue[i], rotationQueue[j]] = [rotationQueue[j], rotationQueue[i]];
    }
  }
  const next = rotationQueue.shift() || reminderPool[0];
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

async function sendReminder(client) {
  const channel = client.channels.cache.get(REMINDER_CHANNEL_ID)
    || await client.channels.fetch(REMINDER_CHANNEL_ID).catch(() => null);
  if (!channel) return;
  const embed = nextReminderEmbed();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

function scheduleForHour(client, parts) {
  const key = getHourKey(parts);
  if (scheduledHours.has(key)) return;
  scheduledHours.add(key);

  const totalSeconds = parts.minute * 60 + parts.second;
  const remainingMs = Math.max(1, (60 * 60 - totalSeconds) * 1000);
  const count = Math.random() < 0.5 ? 1 : 2;
  const delays = [];
  for (let i = 0; i < count; i += 1) {
    delays.push(Math.floor(Math.random() * remainingMs));
  }
  for (const delay of delays) {
    setTimeout(() => {
      sendReminder(client).catch(() => {});
    }, delay);
  }
}

function startHourlyReminderLoop(client) {
  const tick = () => {
    const parts = getRomeParts(new Date());
    if (parts.hour < START_HOUR || parts.hour > END_HOUR) return;
    scheduleForHour(client, parts);
  };
  tick();
  setInterval(tick, 60 * 1000);
}

module.exports = { startHourlyReminderLoop };
