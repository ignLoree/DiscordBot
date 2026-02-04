const { EmbedBuilder } = require('discord.js');

const REMINDER_CHANNEL_ID = '1442569130573303898';
const REMINDER_EVERY_MESSAGES = 20;
const counters = new Map();

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
  const idx = Math.floor(Math.random() * reminderPool.length);
  return reminderPool[idx]();
}

async function handleChatReminder(message) {
  if (!message?.guild || !message.channel || message.author?.bot) return;
  if (message.channel.id !== REMINDER_CHANNEL_ID) return;
  const key = message.guild.id;
  const current = counters.get(key) || 0;
  const next = current + 1;
  if (next < REMINDER_EVERY_MESSAGES) {
    counters.set(key, next);
    return;
  }
  counters.set(key, 0);
  const embed = nextReminderEmbed();
  await message.channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { handleChatReminder };
