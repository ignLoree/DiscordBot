const { EmbedBuilder } = require("discord.js");
const { randomInt } = require("crypto");
const { ChatReminderSchedule, ChatReminderRotation } = require("../../Schemas/Community/chatReminderSchemas");
const IDs = require("../../Utils/Config/ids");
const DEFAULT_TIME_ZONE = "Europe/Rome";
const DEFAULT_START_HOUR = 9;
const DEFAULT_END_HOUR = 21;
const REMINDER_FIXED_INTERVAL_MINUTES = 45;
const DEFAULT_MIN_GAP_MS = 30 * 60 * 1000;
const scheduledHours = new Map();
const scheduledTimeouts = new Map();
let lastReminderSlotKey = null;
let rotationDate = null;
let rotationQueue = [];
let rotationGuildId = null;
let lastSentAt = null;
const reminderActivity = new Map();
let hourlyLoopHandle = null;

function cleanupScheduledHourKeys() {
  const now = Date.now();
  const maxAgeMs = 6 * 60 * 60 * 1000;
  for (const [key, createdAt] of scheduledHours.entries()) {
    if (!Number.isFinite(createdAt) || now - createdAt > maxAgeMs) {
      scheduledHours.delete(key);
    }
  }
}

function attachScheduleTimeout(scheduleId, timeout) {
  if (!scheduleId) return;
  const id = String(scheduleId);
  const existing = scheduledTimeouts.get(id);
  if (existing) clearTimeout(existing);
  scheduledTimeouts.set(id, timeout);
}

function clearScheduleTimeout(scheduleId) {
  if (!scheduleId) return;
  const id = String(scheduleId);
  const existing = scheduledTimeouts.get(id);
  if (existing) clearTimeout(existing);
  scheduledTimeouts.delete(id);
}

const reminderPool = [
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Vote:1448729692235628818> Votaci su Discadia!")
      .setDescription(
        [
          "<:VC_EXP:1468714279673925883> La prima volta otterrai **250 EXP**, le altre volte altri exp!",
          "<:VC_Link:1448688587133685895> Vota qui: https://discadia.com/server/viniliecaffe/",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_bump:1330185435401424896> Recensiscici su DISBOARD!")
      .setDescription([
        `<:VC_LevelUp2:1443701876892762243> Scrivi la tua recensione e fai brillare Vinili & Caffè! Dopo aver recensito apri un <#1442569095068254219> \`Terza Categoria\` e ricevi **5 livelli** come premio!`,
        "<:VC_Link:1448688587133685895> Lascia la tua recensione qui: https://disboard.org/it/server/1329080093599076474",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Infinity:1448687797266288832> Conta con noi fino all'infinito!")
      .setDescription([
        `<a:VC_Countdown:1331620801560051783> Ami la matematica e le sfide? Vieni a contare ogni numero insieme a noi su <#1442569179743125554>!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Ticket:1448694637106692156> Serve aiuto, partnership o vuoi segnalare?")
      .setDescription([
        `<:VC_Staff:1479443779571155086> Apri subito un ticket su <#1442569095068254219>: lo Staff è pronto ad aiutarti per qualsiasi cosa ti serva!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_PepeFoto:1479131953100750882> Sblocca subito i Picperms!")
      .setDescription([
        '<:VC_Link:1448688587133685895> Basta mettere ".gg/viniliecaffe" nello stato, boostare il server o arrivare al Livello 10 per sbloccarli velocemente.',
        `> <a:VC_Arrow:1448672967721615452> Scopri tutte le ricompense di boost & livelli su: <#1442569111119990887>`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Pokeball:1479444536227926107> Pokémon: ce la farai a prenderli tutti?")
      .setDescription([
        "<a:VC_PikaWave:1331622011004260354> Se ami i Pokémon, vieni nel canale <#1442569184281362552> e cattura i tuoi preferiti insieme agli altri membri!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        [
          "<a:VC_StarPurple:1330195026688344156> __**RICORDO CHE SONO APERTE LE CANDIDATURE**__",
          "",
          `<a:VC_Coffe:1448695567244066827> Vinili & Caffè in questo __momento__ ha bisogno di **staff**: apri <#1442569232507473951> e candidati cliccando il pulsante.`,
          "",
          `> <:VC_Eye:1331619214410383381> Puoi candidarti anche come **Partner Manager** direttamente dallo stesso pannello in <#1442569232507473951>, cliccando il pulsante dedicato. Essi saranno anche __pagati__ per le partner fatte.`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Color:1470781368630775982> Sblocca i colori gradienti esclusivi!")
      .setDescription([
        "<:VC_Vip:1448691936797134880> Ottieni i colori PLUS con i ruoli <@&1329497467481493607> o <@&1442568932136587297>; con <@&1442568950805430312> puoi crearne uno personalizzato! Tutti disponibili su <#1469429150669602961>.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_EXP:1468714279673925883> Sfida te stesso con i minigiochi e vinci EXP!")
      .setDescription([
        "<a:VC_Events:1448688007438667796> Ogni giorno nuovi minigiochi: indovina la bandiera, capitale, impiccato, quiz patente e tanti altri!",
        "",
        "<:VC_EXP:1468714279673925883> Vinci, accumula EXP e sali di livello giocando. Controlla le tue stats con `+mstats`.",
        `> <a:VC_Arrow:1448672967721615452> Trovi livelli e premi in <#1442569111119990887>`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_LevelUp2:1443701876892762243> Scala i livelli e ottieni premi!")
      .setDescription([
        "<:VC_EXP:1468714279673925883> Ogni messaggio in chat e ogni minigioco ti portano EXP e nuovi livelli! Sblocca ruoli e vantaggi esclusivi.",
        "",
        `<:VC_Stats:1448695844923510884> Scopri tutte le statistiche con \`+mstats\` e guarda i premi nel canale <#1442569111119990887>.`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_BlackPin:1448687216871084266> Tutte le info sul server in un unico posto")
      .setDescription([
        `<a:VC_Boost:1448670271115497617> Livelli, boost, Picperms, ruoli, funzioni... tutto raccolto in <#1442569111119990887>!`,
        "",
        "<a:VC_Arrow:1448672967721615452> Scopri come ottenere nuovi colori, premi e tutto ciò che offre Vinili & Caffè.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Color:1470781368630775982> Personalizza il tuo profilo!")
      .setDescription([
        "<:VC_Vip:1448691936797134880> Su <#1469429150669602961> scegli ruoli e colori per rendere unico il tuo nome nel server.",
        "",
        `<a:VC_Boost:1448670271115497617> Alcuni colori/ruoli si sbloccano con livelli o boost: rendi il tuo profilo davvero personale!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Coffe:1448695567244066827> Entra nella community più sociale!")
      .setDescription([
        "<:VC_Chat:1448694742237053061> **Zero tossicità, solo chiacchiere, musica, passioni e nuove amicizie!**",
        "",
        "<a:VC_PepeKeyboard:1448688327782826024> Partecipa in chat, gioca e scopri le attività: più sei attivo, più livelli e premi ottieni.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Link:1448688587133685895> BUMPA e fai crescere il server!")
      .setDescription([
        "<:VC_FrogCute:1331620415185096746> Usa `/bump` con Disboard: ogni bump fa salire Vinili & Caffè in classifica e ci porta nuovi amici!",
        "",
        "<:VC_bump:1330185435401424896> Ricorda di controllare il cooldown e di bumpare appena puoi.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Eye:1331619214410383381> Non sai da dove partire?")
      .setDescription([
        "<a:S_News_3:1471891662786527253> Scrivi **`+help`** per vedere tutti i comandi bot, giochi e funzioni!",
        "",
        `<:VC_Info:1460670816214585481> Per info su livelli, ruoli, minigiochi e regole: <#1442569111119990887>. Trovi davvero tutto lì!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_BlackPin:1448687216871084266> Porta in alto i messaggi migliori!")
      .setDescription([
        "<:VC_Nails:1476166664201441280> Hai letto un messaggio che va ricordato? Rispondi con **`+quote`**: lo troverai postato tra i momenti migliori della community!",
        "",
        "<:VC_Texting:1330195707625345116> Rivivi i ricordi e le frasi più belle insieme a tutti.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Chat:1448694742237053061> Qui si gioca pulito: rispetto e regole")
      .setDescription([
        "<a:VC_Rule:1469462649950703709> **Il rispetto è la base!** Leggi le regole e rispetta tutti, membri e staff.",
        "",
        `<:VC_Ticket:1448694637106692156> Dubbio o problema? Apri un ticket in <#1442569095068254219>: siamo sempre disponibili ad aiutarti.`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Link:1448688587133685895> Fai entrare i tuoi amici!")
      .setDescription([
        "<a:VC_FlowerPink:1468688049725636903> Ti diverti su Vinili & Caffè? Invita amici e persone che conosci: più siamo, più la community si anima!",
        "",
        "<a:VC_Beer:1448687940560490547> Basta condividere il link del server o quello nelle info. Vi aspettiamo!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_HeartsBlue:1468686100045369404> Vieni in vocale con noi!")
      .setDescription([
        "<a:VC_Flowers:1468687836055212174> Oltre alla chat, unisciti ai **canali vocali** per musica, giochi e chiacchiere live. La voce ci rende una vera famiglia!",
        "",
        "<a:VC_Mute:1448670470323835060> Nessuno è obbligato: puoi parlare oppure solo ascoltare. Trova la categoria vocali e entra quando vuoi.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Announce:1448687280381235443> Resta sempre aggiornato!")
      .setDescription([
        "<:VC_Eye:1331619214410383381> Eventi, novità e annunci? Li trovi nei canali del server! Rimani sintonizzato su <#1442569115972669541> e la chat per non perderti nulla.",
        "",
        `<a:VC_Flowers:1468687836055212174> Tutto su livelli, premi e iniziative sempre in <#1442569111119990887>!`,
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Diamon:1469463765610135635> CLICK ME!")
      .setDescription([
        "<a:VC_Coffe:1448695567244066827> Se non l'hai già fatto, vai su <#1442569058406109216> e clicca la reazione: aiuti il server a crescere, ti basta un secondo!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Poll:1448695754972729436> Partecipa ai sondaggi!")
      .setDescription([
        "<a:VC_Vote:1448729692235628818> Ogni sera ci sono nuovi sondaggi su <#1442569128706838528>! Partecipa anche tu: aiutano a capire la community e a migliorare il server.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Events:1448688007438667796> TOP WEEKLY!")
      .setDescription([
        "<a:VC_HelloKittyGift:1329447876857958471> Ogni domenica alle 21:00 scopriamo chi è stato il top del server su <#1470183921236049940>! Sfida gli altri e scala la classifica della settimana.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_PepeFoto:1479131953100750882> Verifica con un Selfie!")
      .setDescription([
        "<a:VC_Moon:1472299537094934642> Sapevi che puoi verificarti semplicemente con un selfie? Apri un <#1442569095068254219> \`Terza Categoria\` e segui le istruzioni.",
        "<a:VC_Sparkles:1468546911936974889> Sblocca il canale <#1470029899740873029> e tanti altri vantaggi visibili in <#1442569111119990887>!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Kiss:1448673021031223428> Suggerisci e migliora il server!")
      .setDescription([
        "<a:VC_Rocket:1468544312475123753> Hai un'idea o vuoi proporre qualcosa di nuovo? Scrivilo subito in <#1442569147559973094> e aiutaci a rendere Vinili & Caffè sempre migliore!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_PandaWeee:1331604262152835115> Mudae: colleziona anime e divertiti!")
      .setDescription([
        "<a:VC_Please:1448671483575533620> Se ami gli anime, prova <#1442569182825681077>: colleziona i tuoi personaggi preferiti e sfida gli altri appassionati!",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_PandaLoveRainbow:1331634327272030239>  Ship time!")
      .setDescription([
        "<:VC_PandaCoolJuice:1331604149565128726> Nel canale <#1469685688814407726> puoi fare ship tra due utenti! È divertente e perfetto per conoscersi meglio.",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Collab:1448707281423302697> Vuoi sponsorizzare?")
      .setDescription([
        "<a:VC_ThankYou:1330186319673950401> Vinili & Caffè offre sponsorizzazioni per chi rispetta i requisiti: apri un <#1442569095068254219> `Terza Categoria` per iniziare!",
        "<:VC_Ticket:1448694637106692156> Trovi tutte le info sulle sponsorizzazioni in <#1442569111119990887>",
      ].join("\n")),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Events:1448688007438667796> Giveaway per tutti!")
      .setDescription([
        "<:VC_Wallet:1462794843746205815> Partecipa ai giveaway organizzati dallo staff! Li trovi in <#1442569115972669541> e sono aperti a tutti i membri: non perdere le prossime estrazioni!",
      ].join("\n")),
];

function getDateKey(parts) {
  const y = parts.year;
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getCfg(client) {
  return client?.config?.chatReminder || {};
}

function getReminderChannelId(client) {
  const channelId = getCfg(client)?.channelId || IDs.channels?.chat;
  return channelId || null;
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
  return Math.max(
    60 * 1000,
    Number(getCfg(client)?.minGapMs || DEFAULT_MIN_GAP_MS),
  );
}

function getFirstThreshold(client) {
  return Math.max(1, Number(getCfg(client)?.firstReminderMinMessages30m || 5));
}

function getSecondThreshold(client) {
  return Math.max(
    1,
    Number(getCfg(client)?.secondReminderMinMessages30m || 20),
  );
}

async function saveRotationState() {
  if (!rotationGuildId || !rotationDate) return;
  await ChatReminderRotation.findOneAndUpdate(
    { guildId: rotationGuildId },
    {
      $set: {
        dateKey: rotationDate,
        queue: rotationQueue,
        lastSentAt: lastSentAt ? new Date(lastSentAt) : null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

function queueHasAllReminderIndices(queue) {
  const set = new Set(queue);
  if (set.size !== reminderPool.length) return false;
  for (let i = 0; i < reminderPool.length; i += 1) {
    if (!set.has(i)) return false;
  }
  return true;
}

async function loadRotationState(guildId, dateKey) {
  rotationGuildId = guildId;
  const doc = await ChatReminderRotation.findOne({ guildId }).lean().catch(() => null);
  const normDate = dateKey ? String(dateKey) : "";
  if (doc && normDate && doc.dateKey === normDate && Array.isArray(doc.queue)) {
    rotationQueue = doc.queue.slice().filter((i) => Number.isInteger(i) && i >= 0 && i < reminderPool.length);
    if (queueHasAllReminderIndices(rotationQueue)) {
      rotationDate = doc.dateKey;
      lastSentAt = doc.lastSentAt ? new Date(doc.lastSentAt).getTime() : null;
      return;
    }
  }
  rotationDate = normDate;
  rotationQueue = [];
  lastSentAt = doc?.lastSentAt ? new Date(doc.lastSentAt).getTime() : null;
  await saveRotationState();
}

async function nextReminderEmbed(parts, guildId) {
  const key = getDateKey(parts);
  const gid = guildId || rotationGuildId;
  if (gid) await loadRotationState(gid, key);

  if (rotationDate !== key || rotationQueue.length === 0) {
    rotationDate = key;
    rotationQueue = reminderPool.map((_, idx) => idx);
    await saveRotationState();
  }
  if (rotationQueue.length === 0) {
    const next = reminderPool[0];
    return next ? next() : null;
  }
  const pos = randomInt(0, rotationQueue.length);
  const index = rotationQueue[pos];
  rotationQueue.splice(pos, 1);
  await saveRotationState();
  const next = Number.isFinite(index) ? reminderPool[index] : reminderPool[0];
  return next ? next() : null;
}

function getRomeParts(date, client) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: getTimeZone(client),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getHourKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}`;
}

function isReminderFixedSlot(parts, client) {
  const { hour, minute } = parts;
  const start = getStartHour(client);
  const end = getEndHour(client);
  if (hour < start || hour > end) return false;
  const totalMins = hour * 60 + minute;
  const startMins = start * 60 + 1;
  if (totalMins < startMins) return false;
  return (totalMins - startMins) % REMINDER_FIXED_INTERVAL_MINUTES === 0;
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

async function getRecentChannelMessageCount(
  client,
  channelId,
  windowMs = 60 * 60 * 1000,
) {
  if (!client || !channelId) return 0;
  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
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
  if (!channelId) return { count30m: 0, count60m: 0 };
  const mem30 = getRecentReminderCount(channelId, 30 * 60 * 1000);
  const mem60 = getRecentReminderCount(channelId, 60 * 60 * 1000);
  const hist30 = await getRecentChannelMessageCount(
    client,
    channelId,
    30 * 60 * 1000,
  );
  const hist60 = await getRecentChannelMessageCount(
    client,
    channelId,
    60 * 60 * 1000,
  );
  return {
    count30m: Math.max(mem30, hist30),
    count60m: Math.max(mem60, hist60),
  };
}

async function sendReminder(client, scheduleId, kind = "first") {
  clearScheduleTimeout(scheduleId);
  const nowMs = Date.now();
  const minGapMs = getMinGapMs(client);
  if (lastSentAt && nowMs - lastSentAt < minGapMs && scheduleId) {
    const nextAt = new Date(lastSentAt + minGapMs);
    await ChatReminderSchedule.updateOne(
      { _id: scheduleId },
      { $set: { fireAt: nextAt, kind } },
    ).catch(() => { });
    const delay = Math.max(1, nextAt.getTime() - Date.now());
    const timeout = setTimeout(() => {
      scheduledTimeouts.delete(String(scheduleId));
      sendReminder(client, scheduleId, kind).catch(() => { });
    }, delay);
    timeout.unref?.();
    attachScheduleTimeout(scheduleId, timeout);
    return;
  }
  const { count30m: activityCount30m } = await getActivityCounts(client);
  if (kind === "second" && activityCount30m < getSecondThreshold(client)) {
    if (scheduleId)
      await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
    return;
  }
  if (kind !== "second" && activityCount30m < getFirstThreshold(client)) {
    if (scheduleId)
      await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
    return;
  }
  const channelId = getReminderChannelId(client);
  if (!channelId) return;
  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return;
  const guildId = client.guilds?.cache?.first()?.id ?? null;
  const parts = getRomeParts(new Date(), client);
  const embed = await nextReminderEmbed(parts, guildId);
  await channel.send({ embeds: [embed] }).catch(() => { });
  lastSentAt = Date.now();
  await saveRotationState();
  if (scheduleId) {
    await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => { });
    clearScheduleTimeout(scheduleId);
  }
}

async function sendReminderAtFixedSlot(client, parts, slotKey) {
  const channelId = getReminderChannelId(client);
  if (!channelId) return;
  const { count30m: activityCount30m } = await getActivityCounts(client);
  const minForSlot = Math.max(1, Number(getCfg(client)?.minMessagesForFixedSlot ?? 1));
  if (activityCount30m < minForSlot) return;
  const channel =
    client.channels.cache.get(channelId) ||
    (await client.channels.fetch(channelId).catch(() => null));
  if (!channel) return;
  const guildId = client.guilds?.cache?.first()?.id ?? null;
  const embed = await nextReminderEmbed(parts, guildId);
  await channel.send({ embeds: [embed] }).catch(() => { });
  lastSentAt = Date.now();
  lastReminderSlotKey = slotKey;
  await saveRotationState();
}

async function scheduleForHour(client, parts, guildId) {
  cleanupScheduledHourKeys();
  const key = getHourKey(parts);
  if (scheduledHours.has(key)) return;

  const totalSeconds = parts.minute * 60 + parts.second;
  const remainingMs = Math.max(1, (60 * 60 - totalSeconds) * 1000);
  const now = Date.now();
  const minGapMs = getMinGapMs(client);
  let baseLast = lastSentAt || 0;
  const latestScheduled = await ChatReminderSchedule.findOne({
    guildId,
    fireAt: { $gt: new Date() },
  })
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
  const allowSecond =
    activityCount30m >= getSecondThreshold(client) && availableMs > minGapMs;
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
    .map((delay, idx) => ({
      fireAt: new Date(Date.now() + delay),
      kind: idx === 0 ? "first" : "second",
    }));
  if (!fireTimes.length) return;
  scheduledHours.set(key, Date.now());
  for (const item of fireTimes) {
    const fireAt = item.fireAt;
    const adjusted = baseLast
      ? Math.max(fireAt.getTime(), baseLast + minGapMs)
      : fireAt.getTime();
    baseLast = adjusted;
    const doc = await ChatReminderSchedule.create({
      guildId,
      fireAt,
      kind: item.kind,
    }).catch(() => null);
    if (!doc) continue;
    if (adjusted !== fireAt.getTime()) {
      await ChatReminderSchedule.updateOne(
        { _id: doc._id },
        { $set: { fireAt: new Date(adjusted), kind: item.kind } },
      ).catch(() => { });
    }
    const timeout = setTimeout(() => {
      scheduledTimeouts.delete(String(doc._id));
      sendReminder(client, doc._id, item.kind).catch(() => { });
    }, Math.max(1, adjusted - Date.now()));
    timeout.unref?.();
    attachScheduleTimeout(doc._id, timeout);
  }
}

async function restoreSchedules(client) {
  const channelId = getReminderChannelId(client);
  if (!channelId) return;
  const now = new Date();
  const parts = getRomeParts(now, client);
  const key = getDateKey(parts);
  const guildId = client.guilds.cache.first()?.id || null;
  if (!guildId) return;
  await loadRotationState(guildId, key);
  const due = await ChatReminderSchedule.find({ fireAt: { $lte: now } }).lean();
  for (const item of due) {
    await sendReminder(client, item._id, item.kind || "first").catch(() => { });
  }
  await ChatReminderSchedule.deleteMany({ fireAt: { $gt: now } }).catch(() => { });
}

function startHourlyReminderLoop(client) {
  if (!getReminderChannelId(client)) return null;
  if (hourlyLoopHandle) return hourlyLoopHandle;
  const tick = async () => {
    cleanupScheduledHourKeys();
    const parts = getRomeParts(new Date(), client);
    if (!isReminderFixedSlot(parts, client)) return;
    const slotKey = `${getDateKey(parts)}_${parts.hour}_${parts.minute}`;
    if (slotKey === lastReminderSlotKey) return;
    const guildId = client.guilds.cache.first()?.id || null;
    if (!guildId) return;
    await loadRotationState(guildId, getDateKey(parts));
    await sendReminderAtFixedSlot(client, parts, slotKey);
  };
  restoreSchedules(client).catch(() => { });
  tick();
  hourlyLoopHandle = setInterval(tick, 60 * 1000);
  hourlyLoopHandle.unref?.();
  return hourlyLoopHandle;
}

function getChatReminderLoopStatus() {
  return {
    active: Boolean(hourlyLoopHandle),
    scheduledHours: Number(scheduledHours.size || 0),
    scheduledTimeouts: Number(scheduledTimeouts.size || 0),
    timezone: DEFAULT_TIME_ZONE,
  };
}

module.exports = { startHourlyReminderLoop, recordReminderActivity, getChatReminderLoopStatus };