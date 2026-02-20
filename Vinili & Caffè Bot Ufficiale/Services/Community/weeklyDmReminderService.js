const fs = require("fs");
const path = require("path");
const { randomInt } = require("crypto");
const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getNoDmSet } = require("../../Utils/noDmList");

const STATE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "Data",
  "weeklyDmReminderState.json",
);
const TICK_EVERY_MS = 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const DM_FOOTER =
  "Se non vuoi ricevere questi avvisi in DM usa +dm-disable nel server.";
const DEFAULT_TZ = "Europe/Rome";
const STAFF_ROLE_IDS = [
  IDs.roles.Staff,
  IDs.roles.PartnerManager,
  IDs.roles.HighStaff,
  IDs.roles.Admin,
  IDs.roles.Manager,
  IDs.roles.Coordinator,
  IDs.roles.Supervisor,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Founder,
  IDs.roles.CoFounder,
].map((id) => String(id || "").trim()).filter(Boolean);
const channelMention = (channelId, fallback) =>
  channelId ? `<#${channelId}>` : fallback;
const defaultPool = [
  {
    title: "Ruoli e vantaggi del server",
    description:
      "Hai già controllato i ruoli sbloccabili con livelli, boost e voti? Dai un'occhiata al canale info del server.",
  },
  {
    title: "Comandi utili del bot",
    description: `Con +help trovi rapidamente i comandi principali del bot. Provali in ${channelMention(IDs.channels.commands, "chat comandi")}.`,
  },
  {
    title: "Forum e discussioni",
    description: `Se hai un tema interessante, aprilo nel forum del server (${channelMention(IDs.channels.forum, "canale forum")}): aiuta a tenere la community attiva e ordinata.`,
  },
  {
    title: "Livelli e progressione",
    description:
      "Un po' di chat e vocale ogni settimana ti aiuta a salire di livello e sbloccare perks progressivi. Controlla +rank e +classifica.",
  },
  {
    title: "Ticket e supporto",
    description: `Se ti serve supporto, usa i ticket in ${channelMention(IDs.channels.ticket, "canale ticket")}: è il modo più veloce per ricevere assistenza dallo staff.`,
  },
  {
    title: "Gestione DM",
    description:
      "Puoi disattivare questi promemoria con +dm-disable e riattivarli in seguito con +dm-enable.",
  },
  {
    title: "Attività community",
    description:
      "Partecipare a eventi, sondaggi e discussioni aiuta il server a crescere e migliora l'esperienza di tutti.",
  },
  {
    title: "Funzioni del bot",
    description:
      "Tra quote, livelli, classifiche e comandi utility c'è molto da usare: prova una funzione nuova questa settimana.",
  },
  {
    title: "Canale suggerimenti",
    description: `Hai un'idea per migliorare il server? Scrivila in ${channelMention(IDs.channels.suggestions, "canale suggerimenti")}.`,
  },
  {
    title: "News e aggiornamenti",
    description: `Controlla ${channelMention(IDs.channels.news, "canale news")} per novità, cambi e annunci importanti del server.`,
  },
  {
    title: "Ruoli colori e badge",
    description: `Dai un'occhiata a ${channelMention(IDs.channels.ruoliColori, "canale ruoli")} per colori e vantaggi sbloccabili.`,
  },
  {
    title: "Quote della community",
    description: `Se trovi un messaggio memorabile, usa i comandi quote: poi lo trovi in ${channelMention(IDs.channels.quotes, "canale quotes")}.`,
  },
  {
    title: "Verifica e onboarding",
    description: `Se inviti amici, ricordagli di completare la verifica in ${channelMention(IDs.channels.verify, "canale verify")}.`,
  },
  {
    title: "Eventi e sondaggi",
    description: `Partecipa a eventi e poll in ${channelMention(IDs.channels.polls, "canale polls")}: aiuti la comunità e resti aggiornato.`,
  },
  {
    title: "Contatore e mini-attività",
    description: `Per attività leggere passa da ${channelMention(IDs.channels.counting, "canale counting")} e dai un'occhiata ai canali community.`,
  },
  {
    title: "Media e contenuti",
    description: `Passa da ${channelMention(IDs.channels.media, "canale media")} per condividere contenuti interessanti in linea con il regolamento.`,
  },
  {
    title: "Canale comandi",
    description: `Per usare i comandi del bot in modo ordinato usa ${channelMention(IDs.channels.commands, "canale comandi")}.`,
  },
  {
    title: "Top settimanale",
    description: `Controlla ${channelMention(IDs.channels.topWeeklyUser, "top weekly")} per vedere chi sta spingendo di più questa settimana.`,
  },
  {
    title: "Canale role info",
    description: `In ${channelMention(IDs.channels.info, "canale info")} trovi molte informazioni utili su ruoli, vantaggi e funzioni del server.`,
  },
  {
    title: "Canale partnership",
    description: `Se ti interessano le collaborazioni, tieni d'occhio ${channelMention(IDs.channels.partnerships, "canale partnerships")} e le regole dedicate.`,
  },
  {
    title: "Supporter e badge",
    description: `Molti badge e ruoli speciali hanno vantaggi concreti: scopri i requisiti e punta a sbloccarne almeno uno.`,
  },
  {
    title: "Classifica personale",
    description: "Usa +rank per controllare rapidamente il tuo stato e pianificare il prossimo obiettivo.",
  },
  {
    title: "Classifica globale",
    description: "Con +classifica alltime puoi vedere chi è più costante nel lungo periodo.",
  },
  {
    title: "Obiettivo settimanale",
    description: "Impostati un mini-obiettivo: più costanza in chat, più presenza in vocale o più partecipazione ai poll.",
  },
  {
    title: "Sfrutta il forum",
    description: `Nel ${channelMention(IDs.channels.forum, "forum")} puoi creare discussioni ordinate invece di disperdere messaggi in chat.`,
  },
  {
    title: "Canale quote",
    description: `Le quote migliori finiscono in ${channelMention(IDs.channels.quotes, "canale quotes")}: ottimo per salvare momenti top della community.`,
  },
  {
    title: "Canale suggestions",
    description: `Quando proponi un'idea in ${channelMention(IDs.channels.suggestions, "suggestions")}, spiega sempre anche il motivo e il vantaggio.`,
  },
  {
    title: "Canale polls",
    description: `Votare nei poll in ${channelMention(IDs.channels.polls, "polls")} aiuta a prendere decisioni più utili per tutti.`,
  },
  {
    title: "Canale news",
    description: `Controlla periodicamente ${channelMention(IDs.channels.news, "news")} per non perderti novità su eventi, regole e aggiornamenti.`,
  },
  {
    title: "Canale ruoli",
    description: `In ${channelMention(IDs.channels.ruoliColori, "canale ruoli")} puoi personalizzare il profilo e sbloccare opzioni interessanti.`,
  },
  {
    title: "Canale counting",
    description: `In ${channelMention(IDs.channels.counting, "counting")} conta con attenzione: è una piccola attività ma tiene viva la community.`,
  },
  {
    title: "Comando help",
    description: "Se ti senti perso tra i comandi, +help resta sempre il punto migliore da cui partire.",
  },
  {
    title: "Comandi utility",
    description: "Dedica 2 minuti a provare un comando utility che non hai mai usato: spesso scopri funzioni utilissime.",
  },
  {
    title: "Onboarding amici",
    description: "Quando inviti qualcuno, accompagnalo nei primi passaggi: verifica, regole, canali utili e comandi base.",
  },
  {
    title: "Canali vocali",
    description: "Un po' di presenza in vocale migliora l'attività personale e rende più viva la community.",
  },
  {
    title: "Eventi community",
    description: "Partecipa agli eventi quando puoi: è il modo più veloce per conoscere utenti nuovi.",
  },
  {
    title: "Canale media",
    description: "Condividi contenuti in modo pulito: qualità > quantità, sempre.",
  },
  {
    title: "Comando classifica weekly",
    description: "Usa +classifica weekly per vedere il tuo posizionamento reale nella settimana corrente.",
  },
  {
    title: "Comando classifica alltime",
    description: "Usa +classifica alltime per monitorare la tua crescita nel lungo periodo.",
  },
  {
    title: "Comando rank",
    description: "Con +rank puoi verificare subito se stai mantenendo un buon ritmo di attività.",
  },
  {
    title: "Idea della settimana",
    description: "Prova a migliorare un'abitudine: meno messaggi casuali, più interventi utili e ordinati.",
  },
  {
    title: "Supporto rapido",
    description: "Se hai un dubbio tecnico o organizzativo, apri ticket invece di aspettare: risolvi prima e meglio.",
  },
  {
    title: "Buone pratiche",
    description: "Evita spam e flood: qualità dei messaggi e interazioni sane fanno la differenza.",
  },
  {
    title: "Profilo server",
    description: "Ogni tanto aggiorna il tuo profilo ruoli/interessi: aiuta a trovare persone con gusti simili.",
  },
  {
    title: "Partecipazione utile",
    description: "Anche un singolo contributo utile al giorno mantiene alto il livello della community.",
  },
  {
    title: "Focus comandi",
    description: "Questa settimana prova una combinazione: +help, poi +rank, poi +classifica weekly.",
  },
  {
    title: "Focus feedback",
    description: "Se trovi qualcosa che non funziona bene, segnalarlo con chiarezza aiuta tutti.",
  },
  {
    title: "Focus community",
    description: "Passa in chat, forum e poll: tre piccoli passi che migliorano davvero l'esperienza generale.",
  },
  {
    title: "Candidature staff aperte",
    description: "Se vuoi entrare nello staff, controlla i requisiti e valuta la candidatura: costanza e serietà fanno la differenza.",
  },
  {
    title: "Candidati con criterio",
    description: `Prima di candidarti, leggi con attenzione le info in ${channelMention(IDs.channels.candidatureStaff, "canale candidature")} e prepara una richiesta chiara.`,
  },
  {
    title: "Percorso staff",
    description: "Se punti allo staff, inizia mostrando presenza utile, comportamento corretto e collaborazione con la community.",
  },
  {
    title: "Partner Manager",
    description: `Se ti interessa il percorso Partner Manager, consulta indicazioni e canali dedicati prima di candidarti.`,
  },
  {
    title: "Candidatura efficace",
    description: "Una buona candidatura è concreta: racconta cosa puoi offrire, non solo il ruolo che vuoi ottenere.",
  },
  {
    title: "Preparazione candidatura",
    description: "Prima di inviare la candidatura, cura grammatica, chiarezza e motivazioni: aumenta molto le possibilità di essere considerato.",
  },
  {
    title: "Staff pagato: informazioni",
    description: `Se ti interessa il percorso staff pagato, consulta ${channelMention(IDs.channels.staffPagato, "canale staff pagato")} per dettagli e requisiti.`,
  },
  {
    title: "Staff pagato: requisiti",
    description: "Per accedere a ruoli pagati servono costanza, affidabilità e risultati concreti nel tempo.",
  },
  {
    title: "Staff pagato: approccio",
    description: "Prima di puntare al compenso, concentra il focus su qualità del supporto e responsabilità nelle attività staff.",
  },
  {
    title: "Staff pagato: candidatura",
    description: "Se vuoi proporti per percorsi pagati, prepara una candidatura ordinata e basata su contributi reali.",
  },
];
let loopHandle = null;
let state = null;

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {}
}

function ensureState() {
  if (state) return state;
  const loaded = readJson(STATE_PATH, {});
  if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
    state = {};
  } else {
    state = loaded;
  }
  return state;
}

function saveState() {
  writeJson(STATE_PATH, ensureState());
}

function getCfg(client) {
  return client?.config?.weeklyDmReminder || {};
}

function getTimeZone(client) {
  return String(getCfg(client).timeZone || DEFAULT_TZ);
}

function getMainGuildId(client) {
  return IDs.guilds.main || client?.guilds?.cache?.first?.()?.id || null;
}

function getGuildEntry(guildId) {
  const root = ensureState();
  const key = String(guildId || "");
  if (!key) return null;
  if (!root[key] || typeof root[key] !== "object") {
    root[key] = { plannedAt: 0, jobs: [], reminderHistory: {} };
  }
  if (!Array.isArray(root[key].jobs)) root[key].jobs = [];
  if (!root[key].reminderHistory || typeof root[key].reminderHistory !== "object") {
    root[key].reminderHistory = {};
  }
  return root[key];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getHourInTz(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value || "0";
  return Number(hour);
}

function randomTimestampInWindow(nowMs, endMs, startHour, endHour, timeZone) {
  const rangeStart = Math.max(nowMs + 60 * 1000, nowMs);
  const rangeEnd = Math.max(rangeStart + 60 * 1000, endMs);
  for (let i = 0; i < 80; i += 1) {
    const ts = randomInt(rangeStart, rangeEnd + 1);
    const hour = getHourInTz(new Date(ts), timeZone);
    if (hour >= startHour && hour <= endHour) return ts;
  }
  return randomInt(rangeStart, rangeEnd + 1);
}

function startOfDayUtc(dateLike) {
  const d = new Date(dateLike);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function randomTimestampForDayOffset(baseMs, dayOffset, startHour, endHour, timeZone) {
  const dayStart = startOfDayUtc(baseMs + dayOffset * 24 * 60 * 60 * 1000);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
  return randomTimestampInWindow(dayStart, dayEnd, startHour, endHour, timeZone);
}

function pickRandomDistinct(arr, count) {
  const list = Array.isArray(arr) ? arr.slice() : [];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, Math.max(0, Math.min(count, list.length)));
}

function buildUniqueReminderVariants(pool, count) {
  const normalizedPool = (Array.isArray(pool) ? pool : [])
    .map((item) => ({
      title: String(item?.title || "Reminder settimanale").trim(),
      description: String(item?.description || "").trim(),
    }))
    .filter((item) => item.title || item.description);

  const basePool = normalizedPool.length
    ? normalizedPool
    : [{ title: "Reminder settimanale", description: "Dai un'occhiata al server." }];

  const focusLines = [
    `Focus: ${channelMention(IDs.channels.commands, "comandi")} e +help`,
    `Focus: ${channelMention(IDs.channels.news, "news")} e aggiornamenti`,
    `Focus: ${channelMention(IDs.channels.suggestions, "suggerimenti")} e feedback`,
    `Focus: ${channelMention(IDs.channels.forum, "forum")} e discussioni`,
    `Focus: ${channelMention(IDs.channels.ticket, "ticket")} e supporto`,
    `Focus: ${channelMention(IDs.channels.ruoliColori, "ruoli")} e perks`,
    `Focus: ${channelMention(IDs.channels.quotes, "quotes")} e contenuti`,
    `Focus: ${channelMention(IDs.channels.polls, "polls")} e partecipazione`,
    `Focus: ${channelMention(IDs.channels.counting, "counting")} e attività`,
    `Focus: +rank / +classifica weekly`,
  ];

  const actionLines = [
    "Azione della settimana: prova un comando che di solito non usi.",
    "Azione della settimana: partecipa a una discussione costruttiva.",
    "Azione della settimana: controlla i tuoi progressi e obiettivi.",
    "Azione della settimana: lascia un feedback chiaro e utile.",
    "Azione della settimana: esplora un canale che frequenti poco.",
    "Azione della settimana: interagisci con eventi o sondaggi.",
  ];

  const combos = [];
  for (const base of basePool) {
    for (const focus of focusLines) {
      for (const action of actionLines) {
        combos.push({
          title: base.title,
          description: [base.description, "", focus, action].join("\n").trim(),
        });
      }
    }
  }

  if (!combos.length) return [];
  const picked = pickRandomDistinct(combos, Math.min(count, combos.length));
  if (picked.length >= count) return picked;

  const out = picked.slice();
  while (out.length < count) {
    const base = basePool[out.length % basePool.length];
    out.push({
      title: base.title,
      description: base.description,
    });
  }
  return out;
}

function reminderSignature(reminder) {
  const title = String(reminder?.title || "").trim();
  const description = String(reminder?.description || "").trim();
  return `${title}||${description}`;
}

function pickVariantIndexForUser(variants, availableIndexes, lastSignature) {
  const candidates = availableIndexes.filter((idx) => {
    const sig = reminderSignature(variants[idx]);
    return sig !== lastSignature;
  });
  const source = candidates.length ? candidates : availableIndexes;
  if (!source.length) return -1;
  const pick = source[randomInt(0, source.length)];
  return Number(pick);
}

function isDmManagementReminder(reminder) {
  const title = String(reminder?.title || "").trim().toLowerCase();
  return title === "gestione dm";
}

function createReminderEmbed(entry) {
  const title = String(entry?.title || "Reminder settimanale");
  const description = String(entry?.description || "").trim();
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(title)
    .setDescription(description || "Ricordati di dare un'occhiata al server.")
    .setFooter({ text: DM_FOOTER })
    .setTimestamp();
}

function isStaffMember(member) {
  if (!member?.roles?.cache || !STAFF_ROLE_IDS.length) return false;
  return STAFF_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}

async function buildWeeklyJobs(client, guild) {
  await guild.members.fetch().catch(() => {});
  const noDmSet = await getNoDmSet(guild.id).catch(() => new Set());
  const cfg = getCfg(client);
  const timeZone = getTimeZone(client);
  const startHour = clamp(Number(cfg.startHour || 10), 0, 23);
  const endHour = clamp(Number(cfg.endHour || 22), startHour, 23);
  const ratio = clamp(Number(cfg.targetRatio || 0.1), 0.01, 1);
  const minRecipients = Math.max(1, Number(cfg.minRecipients || 15));
  const maxRecipients = Math.max(minRecipients, Number(cfg.maxRecipients || 80));
  const recipients = [];
  const guildEntry = getGuildEntry(guild.id);
  const recentThreshold = Date.now() - WEEK_MS;
  const blockedUsers = new Set();

  for (const job of guildEntry?.jobs || []) {
    const uid = String(job?.userId || "");
    if (!uid) continue;
    const sentAt = Number(job?.sentAt || 0);
    const sendAt = Number(job?.sendAt || 0);
    if (sentAt >= recentThreshold) blockedUsers.add(uid);
    if (!job?.sentAt && !job?.skipped && sendAt >= recentThreshold) {
      blockedUsers.add(uid);
    }
  }

  for (const member of guild.members.cache.values()) {
    if (!member || member.user?.bot) continue;
    if (isStaffMember(member)) continue;
    const id = String(member.id);
    if (noDmSet.has(id)) continue;
    if (blockedUsers.has(id)) continue;
    recipients.push(id);
  }

  if (!recipients.length) return [];

  const targetCount = clamp(
    Math.round(recipients.length * ratio),
    minRecipients,
    maxRecipients,
  );
  const selected = pickRandomDistinct(recipients, targetCount);
  const pool = Array.isArray(cfg.pool) && cfg.pool.length ? cfg.pool : defaultPool;
  const variants = buildUniqueReminderVariants(pool, selected.length);
  const dayOrder = pickRandomDistinct([0, 1, 2, 3, 4, 5, 6], 7);
  const availableVariantIndexes = variants.map((_, idx) => idx);
  const history = guildEntry.reminderHistory || {};
  const jobs = [];

  for (let idx = 0; idx < selected.length; idx += 1) {
    const userId = String(selected[idx]);
    const lastSignature = String(history?.[userId]?.lastSignature || "");
    const hasHistory = Boolean(lastSignature);
    let variantIndex = pickVariantIndexForUser(
      variants,
      availableVariantIndexes,
      lastSignature,
    );
    if (variantIndex === -1) variantIndex = idx % Math.max(1, variants.length);
    let reminder = variants[variantIndex] || pool[idx % pool.length];
    if (!hasHistory && isDmManagementReminder(reminder)) {
      const alternative = availableVariantIndexes.find((candidateIdx) => {
        const candidate = variants[candidateIdx];
        return !isDmManagementReminder(candidate);
      });
      if (Number.isInteger(alternative)) {
        variantIndex = Number(alternative);
        reminder = variants[variantIndex] || reminder;
      }
    }
    const usedPos = availableVariantIndexes.indexOf(variantIndex);
    if (usedPos !== -1) availableVariantIndexes.splice(usedPos, 1);
    history[userId] = {
      lastSignature: reminderSignature(reminder),
      plannedAt: Date.now(),
    };
    const dayOffset = dayOrder[idx % dayOrder.length];
    jobs.push({
      id: `${Date.now()}_${idx}_${randomInt(1000, 999999)}`,
      userId,
      sendAt: randomTimestampForDayOffset(
        Date.now(),
        dayOffset,
        startHour,
        endHour,
        timeZone,
      ),
      attempts: 0,
      sentAt: null,
      skipped: null,
      reminder: {
        title: String(reminder?.title || "Reminder settimanale"),
        description: String(reminder?.description || ""),
      },
    });
  }

  const historyKeepAfterMs = Date.now() - 120 * 24 * 60 * 60 * 1000;
  for (const [uid, info] of Object.entries(history)) {
    const ts = Number(info?.plannedAt || 0);
    if (!ts || ts < historyKeepAfterMs) delete history[uid];
  }
  guildEntry.reminderHistory = history;
  return jobs;
}

async function maybePlanWeeklyBatch(client, guild) {
  const entry = getGuildEntry(guild.id);
  if (!entry) return;
  const now = Date.now();
  const hasPending = entry.jobs.some(
    (job) => !job?.sentAt && !job?.skipped && Number(job?.sendAt || 0) >= now,
  );
  if (hasPending && now - Number(entry.plannedAt || 0) < WEEK_MS) return;
  if (now - Number(entry.plannedAt || 0) < WEEK_MS) return;

  const jobs = await buildWeeklyJobs(client, guild);
  entry.plannedAt = now;
  entry.jobs = jobs;
  saveState();
  global.logger?.info?.(
    `[WEEKLY DM] Scheduled ${jobs.length} reminders for guild ${guild.id}.`,
  );
}

function shouldRetry(job) {
  if (!job) return false;
  const attempts = Number(job.attempts || 0);
  if (attempts >= 2) return false;
  const nextAttemptAt = Number(job.nextAttemptAt || 0);
  if (!nextAttemptAt) return false;
  return Date.now() >= nextAttemptAt;
}

async function sendDueJobs(client, guild) {
  const entry = getGuildEntry(guild.id);
  if (!entry) return;
  const noDmSet = await getNoDmSet(guild.id).catch(() => new Set());
  const now = Date.now();

  for (const job of entry.jobs) {
    if (!job || job.sentAt || job.skipped) continue;
    const due = Number(job.sendAt || 0) <= now;
    const retryDue = shouldRetry(job);
    if (!due && !retryDue) continue;

    const userId = String(job.userId || "");
    if (!userId) {
      job.skipped = "invalid-user";
      continue;
    }

    if (noDmSet.has(userId)) {
      job.skipped = "no-dm";
      continue;
    }

    const member = guild.members.cache.get(userId) || null;
    if (!member) {
      job.skipped = "not-in-guild";
      continue;
    }
    if (isStaffMember(member)) {
      job.skipped = "staff-member";
      continue;
    }

    const user =
      member.user ||
      client.users.cache.get(userId) ||
      (await client.users.fetch(userId).catch(() => null));
    if (!user || user.bot) {
      job.skipped = "user-unavailable";
      continue;
    }

    try {
      await user.send({
        embeds: [createReminderEmbed(job.reminder)],
        allowedMentions: { parse: [] },
      });
      job.sentAt = Date.now();
      job.nextAttemptAt = null;
    } catch {
      job.attempts = Number(job.attempts || 0) + 1;
      if (job.attempts >= 2) {
        job.skipped = "dm-failed";
      } else {
        job.nextAttemptAt = Date.now() + MIN_RETRY_DELAY_MS;
      }
    }
  }

  const trimBefore = Date.now() - 14 * 24 * 60 * 60 * 1000;
  entry.jobs = entry.jobs.filter((job) => {
    const sentAt = Number(job?.sentAt || 0);
    if (sentAt && sentAt < trimBefore) return false;
    if (job?.skipped && Number(job?.sendAt || 0) < trimBefore) return false;
    return true;
  });
  saveState();
}

async function weeklyTick(client) {
  try {
    const guildId = getMainGuildId(client);
    if (!guildId) return;
    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return;

    await maybePlanWeeklyBatch(client, guild);
    await sendDueJobs(client, guild);
  } catch (error) {
    global.logger?.error?.("[WEEKLY DM] Tick failed:", error);
  }
}

function startWeeklyDmReminderLoop(client) {
  if (loopHandle) return;
  weeklyTick(client).catch(() => {});
  loopHandle = setInterval(() => {
    weeklyTick(client).catch(() => {});
  }, TICK_EVERY_MS);
  if (typeof loopHandle.unref === "function") loopHandle.unref();
}

module.exports = {
  startWeeklyDmReminderLoop,
};
