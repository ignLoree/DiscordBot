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
      .setTitle("<:VC_bump:1330185435401424896> Lascia una recensione su DISBOARD!")
      .setDescription(
        [
          `<:VC_LevelUp2:1443701876892762243> Lasciare una recensione aiuta il server a farci conoscere e crescere, una volta messa la recensione apri un <#${IDs.channels.ticket}>\`Terza Categoria\` e riceverai **5 livelli**!`,
          "<:VC_Link:1448688587133685895> Recensisci il nostro server qui: https://disboard.org/it/server/1329080093599076474",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_BlackPin:1448687216871084266> Marca un messaggio e rendilo un post")
      .setDescription(
        [
          "<:VC_Chat:1448694742237053061> Rispondendo al messaggio che si vuole postare con `+quote`, potrai poi vederlo nel canale <#1468540884537573479>",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Infinity:1448687797266288832> Conta fino all'infinito!")
      .setDescription(
        [`<a:VC_Countdown:1331620801560051783> Sei un appassionato di calcoli e matematica? Vieni a contare nel canale <#${IDs.channels.counting}>`].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Ticket:1448694637106692156> Devi segnalare un utente, fare una partnership o ti serve supporto?")
      .setDescription(
        [
          `<:VC_Staff:1479443779571155086> Attraverso i ticket nel canale <#${IDs.channels.ticket}> puoi contattare un membro dello Staff che ti darà una mano per ogni tua richiesta.`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_PepeFoto:1479131953100750882> Sblocca i Picperms")
      .setDescription(
        [
          '<:VC_Link:1448688587133685895> Puoi sbloccarli in modo veloce mettendo ".gg/viniliecaffe" nello stato del tuo profilo Discord, potenziando il server oppure salendo al Livello 10.',
          `> <a:VC_Arrow:1448672967721615452> Scopri tutte le ricompense dei boost&livelli su:<#${IDs.channels.info}>`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Pokeball:1479444536227926107> Gotta Catch 'Em All!")
      .setDescription(
        [
          "<a:VC_PikaWave:1331622011004260354> Sei un appassionato di Pokémon? Vieni a catturarli tutti nel canale <#1442569184281362552>",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        [
          "<a:VC_StarPurple:1330195026688344156> __**RICORDO CHE SONO APERTE LE CANDIDATURE**__",
          "",
          `<a:VC_Coffe:1448695567244066827> Vinili & Caffè in questo __momento__ ha bisogno di **staff**: apri <#${IDs.channels.candidatureStaff}> e candidati cliccando il pulsante.`,
          "",
          `> <:VC_Eye:1331619214410383381> Puoi candidarti anche come **Partner Manager** direttamente dallo stesso pannello in <#${IDs.channels.candidatureStaff}>, cliccando il pulsante dedicato. Essi saranno anche __pagati__ per le partner fatte, per più info __<#1442579412280410194>__.`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Color:1470781368630775982> Ottieni i colori gradienti")
      .setDescription(
        [
          "<:VC_Vip:1448691936797134880> Potrai sbloccare i colori PLUS con il ruolo <@&1329497467481493607> o <@&1442568932136587297>; invece con il <@&1442568950805430312> potrai creartene uno personalizzato! Li trovi su: <#1469429150669602961>",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_EXP:1468714279673925883> Minigiochi e EXP")
      .setDescription(
        [
          "<a:VC_Events:1448688007438667796> Nel server partono spesso **minigiochi** automatici: indovina la bandiera, la capitale, l'impiccato, quiz patente, indovina l'anno e molti altri!",
          "",
          "<:VC_EXP:1468714279673925883> Partecipando e indovinando **guadagni EXP** e sali di livello. Usa il comando `+mstats` per vedere le tue statistiche dei minigiochi.",
          `> <a:VC_Arrow:1448672967721615452> Scopri livelli e ricompense in <#${IDs.channels.info}>`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_LevelUp2:1443701876892762243> Livelli e ricompense")
      .setDescription(
        [
          "<:VC_EXP:1468714279673925883> Scrivendo in chat e partecipando ai **minigiochi** guadagni **EXP** e sali di **livello**. A ogni traguardo sblocchi ruoli e vantaggi!",
          "",
          `Usa \`+mstats\` per le statistiche minigiochi e controlla tutti i livelli e le ricompense nel canale <#${IDs.channels.info}>.`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_BlackPin:1448687216871084266> Info e funzioni del server")
      .setDescription(
        [
          `Tutte le **info** su livelli, boost, Picperms, ruoli e funzioni del server sono raccolte in <#${IDs.channels.info}>.`,
          "",
          "<a:VC_Arrow:1448672967721615452> Lì trovi anche come sbloccare colori, livelli e cosa offre il server. Passa a dare un'occhiata!",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Color:1470781368630775982> Personalizza il tuo profilo")
      .setDescription(
        [
          "<:VC_Vip:1448691936797134880> Nel canale <#1469429150669602961> puoi scegliere **ruoli** e **colori** per il tuo nome, così da personalizzare il profilo nel server.",
          "",
          "Alcuni colori e ruoli si sbloccano con i livelli o con il boost del server.",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_Coffe:1448695567244066827> Una community per socializzare")
      .setDescription(
        [
          "Vinili & Caffè è un server **senza tossicità**, pensato per chiacchierare, condividere musica e passioni e conoscere nuove persone.",
          "",
          "Partecipa alla chat, ai minigiochi e alle attività: più sei attivo, più livelli e ricompense sblocchi!",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Link:1448688587133685895> Non dimenticare il bump!")
      .setDescription(
        [
          "Usa `/bump` con Disboard per **far salire il server** nelle classifiche. Più bump = più visibilità!",
          "",
          "<:VC_bump:1330185435401424896> Bumpare aiuta la community a crescere. Controlla la cooldown e bumpa quando possibile.",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Eye:1331619214410383381> Non sai da dove iniziare?")
      .setDescription(
        [
          "Usa il comando **`+help`** per vedere tutti i comandi del bot e le funzioni disponibili.",
          "",
          `Per livelli, ruoli, minigiochi e regole del server passa da <#${IDs.channels.info}>: trovi tutto lì!`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_BlackPin:1448687216871084266> Condividi i post che ami")
      .setDescription(
        [
          "Hai visto un messaggio che merita di essere condiviso? Rispondi con **`+quote`** per trasformarlo in un post nel canale dedicato.",
          "",
          "Così la community può ritrovare le frasi e i momenti più belli della chat!",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Chat:1448694742237053061> Rispetto e regole")
      .setDescription(
        [
          "Il server vive grazie al **rispetto** tra tutti. Leggi le regole del server e rispetta gli altri membri e lo staff.",
          "",
          `In caso di dubbi o per segnalare qualcosa che non va, apri un ticket in <#${IDs.channels.ticket}>: siamo qui per aiutarti.`,
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Link:1448688587133685895> Invita i tuoi amici!")
      .setDescription(
        [
          "Ti piace Vinili & Caffè? **Invita** amici e conoscenti: più siamo, più la community diventa viva e divertente.",
          "",
          "Condividi il link del server o usa l'invito che trovi nelle info. Benvenuti a tutti!",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<a:VC_HeartsBlue:1468686100045369404> Unisciti alle vocali")
      .setDescription(
        [
          "Oltre alla chat, puoi unirti ai **canali vocali** per chiacchierare a voce, ascoltare musica insieme o giocare. La voce rende tutto più vicino!",
          "",
          "Cerca la categoria vocali e clicca per entrare. Nessuno è obbligato a parlare: anche solo ascoltare va bene.",
        ].join("\n"),
      ),
  () =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_LevelUp2:1443701876892762243> Resta aggiornato")
      .setDescription(
        [
          "Eventi, novità e annunci vengono condivisi nei canali del server. Tieni d'occhio **info** e la chat per non perdere nulla!",
          "",
          `Controlla spesso <#${IDs.channels.info}> per livelli, ricompense e tutto quello che offre Vinili & Caffè.`,
        ].join("\n"),
      ),
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
  ).catch(() => {});
}

async function loadRotationState(guildId, dateKey) {
  rotationGuildId = guildId;
  const doc = await ChatReminderRotation.findOne({ guildId }).lean().catch(() => null);
  const normDate = dateKey ? String(dateKey) : "";
  if (doc && normDate && doc.dateKey === normDate && Array.isArray(doc.queue)) {
    rotationDate = doc.dateKey;
    rotationQueue = doc.queue.slice().filter((i) => Number.isInteger(i) && i >= 0 && i < reminderPool.length);
    lastSentAt = doc.lastSentAt ? new Date(doc.lastSentAt).getTime() : null;
    return;
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
    for (let i = rotationQueue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [rotationQueue[i], rotationQueue[j]] = [
        rotationQueue[j],
        rotationQueue[i],
      ];
    }
    await saveRotationState();
  }
  const index = rotationQueue.shift();
  await saveRotationState();
  const next = Number.isFinite(index) ? reminderPool[index] : reminderPool[0];
  return next();
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
    ).catch(() => {});
    const delay = Math.max(1, nextAt.getTime() - Date.now());
    const timeout = setTimeout(() => {
      scheduledTimeouts.delete(String(scheduleId));
      sendReminder(client, scheduleId, kind).catch(() => {});
    }, delay);
    timeout.unref?.();
    attachScheduleTimeout(scheduleId, timeout);
    return;
  }
  const { count30m: activityCount30m } = await getActivityCounts(client);
  if (kind === "second" && activityCount30m < getSecondThreshold(client)) {
    if (scheduleId)
      await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => {});
    clearScheduleTimeout(scheduleId);
    return;
  }
  if (kind !== "second" && activityCount30m < getFirstThreshold(client)) {
    if (scheduleId)
      await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => {});
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
  await channel.send({ embeds: [embed] }).catch(() => {});
  lastSentAt = Date.now();
  await saveRotationState();
  if (scheduleId) {
    await ChatReminderSchedule.deleteOne({ _id: scheduleId }).catch(() => {});
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
  await channel.send({ embeds: [embed] }).catch(() => {});
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
      ).catch(() => {});
    }
    const timeout = setTimeout(() => {
      scheduledTimeouts.delete(String(doc._id));
      sendReminder(client, doc._id, item.kind).catch(() => {});
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
    await sendReminder(client, item._id, item.kind || "first").catch(() => {});
  }
  await ChatReminderSchedule.deleteMany({ fireAt: { $gt: now } }).catch(() => {});
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
  restoreSchedules(client).catch(() => {});
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