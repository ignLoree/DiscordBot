const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getGuildExpSettings, setActivityEvent, clearActivityEvent, setStaffEvent, clearStaffEvent, getStaffEventSettings, invalidateSettingsCache } = require("../../Services/Community/expService");
const { grantEventRewardsForExistingRoleMembers, grantEventRewardsForSameDayReviewAndVote, clearActivityEventRewardsForGuild, getEventWeekNumber } = require("../../Services/Community/activityEventRewardsService");
const { givePmStaff15PointsAtStart, giveExistingInvitesPointsAtStart, addStaffEventPoints, getStaffEventLeaderboard, isStaffButNotHighStaff } = require("../../Services/Community/staffEventService");
const { buildEventoClassificaPayload } = require("../../Services/Community/eventoClassificaService");
const { getEventDiagnostics } = require("../../Services/Community/weeklyActivityWinnersService");
const IDs = require("../../Utils/Config/ids");
const TIME_ZONE = "Europe/Rome";
const EVENT_DURATION_DAYS = 31;
const EVENT_GLOBAL_MULTI = 3;
const EVENT_ROLE_OVERRIDES = { [IDs.roles.ServerBooster]: 3, [IDs.roles.Donator]: 4, [IDs.roles.VIP]: 5, };
const EVENT_EXTRA_MULTI_ROLE_IDS = [IDs.roles.Veterano].filter(Boolean);
const NEWS_CHANNEL_ID = IDs.channels.news;
const NEWS_STAFF_CHANNEL_ID = IDs.channels.staffNews;
const EVENT_ANNOUNCEMENT_MESSAGES = [["<:VC_Firework:1470796227913322658> **ACTIVITY EXP EVENT**", "", "> <a:VC_HeartsPink:1468685897389052008> __Per festeggiare i 350 membri abbiamo deciso di startare un nuovo evento!__", "> <a:VC_HeartsBlue:1468686100045369404> **Non sarà il classico activity event, ma sarà incentrato tanto sull'exp e i livelli.**", "", "<a:VC_Sparkles:1468546911936974889> Ogni ruolo ottenibile **gratuitamente** avrà una __ricompensa extra__ oltre a quelle già scritte in <#1442569111119990887>:", "<:VC_DoubleReply:1468713981152727120> <@&1469040179799920801> / <@&1469040190730408018> <a:VC_Arrow:1448672967721615452> __Facendo la verifica tramite selfie otterrete anche 5 livelli__", "<:VC_DoubleReply:1468713981152727120> <@&1442568948271943721> <a:VC_Arrow:1448672967721615452> __Mettendo il nostro link nello status (discord.gg/viniliecaffe) riceverete 5 livelli__", "<:VC_DoubleReply:1468713981152727120> <@&1468266342682722679> <a:VC_Arrow:1448672967721615452> __Votando ogni giorno su [Discadia](<https://discadia.com/vote/viniliecaffe/>) ricevete 1 livello__", "<:VC_DoubleReply:1468713981152727120> <@&1469758545263198442> / <@&1474357579143577610> / <@&1474361806956007425> <a:VC_Arrow:1448672967721615452> __Per ogni soglia di inviti fatti col vostro [custom link](<https://imgur.com/a/3wpDOVj>) raggiunta riceverete rispettivamente 5 livelli, 10 livelli e 25 livelli.__", "<:VC_Reply:1468262952934314131> <@&1471955147692179497> <a:VC_Arrow:1448672967721615452> __Mettendo una nostra <#1475223034057982184> riceverete 10 livelli__",].join("\n"), ["", "<:VC_EXP:1468714279673925883> Inoltre ci sarà un __multi globale__ di **x3** per tutti. Alcuni ruoli avranno anche dei boost **maggiorati** per tutta la durata dell'evento:", "<:VC_DoubleReply:1468713981152727120> <@&1329497467481493607> <a:VC_Arrow:1448672967721615452> __`x3` invece di `x2`__", "<:VC_DoubleReply:1468713981152727120> <@&1442568916114346096> <a:VC_Arrow:1448672967721615452> __`x4` invece di `x3`__", "<:VC_DoubleReply:1468713981152727120> <@&1442568950805430312> <a:VC_Arrow:1448672967721615452> __`x5` invece di `x4`__", "<:VC_Reply:1468262952934314131> <@&1469073503025103113> <a:VC_Arrow:1448672967721615452> __Per premiare anche chi sta qui da più tempo applicheremo un boost extra di `x2`__", "> <a:VC_Exclamation:1448687427836444854> __Ricordo che questi boost si sommano a quello globale, non tra di loro.__",].join("\n"), (startDateStr, endDateStr) => ["", "<a:VC_Events:1448688007438667796> Ogni settimana i 3 utenti più attivi in vocale e in testuali riceveranno rispettivamente le seguenti ricompense:", "<:VC_DoubleReply:1468713981152727120> **1° Settimana** <a:VC_Arrow:1448672967721615452> __10 livelli__", "<:VC_DoubleReply:1468713981152727120> **2° Settimana** <a:VC_Arrow:1448672967721615452> __Un colore gradiente a scelta__", "<:VC_DoubleReply:1468713981152727120> **3° Settimana** <a:VC_Arrow:1448672967721615452> __Ruolo custom e vocale privata permanente__", "<:VC_Reply:1468262952934314131> **4° Settimana** <a:VC_Arrow:1448672967721615452> __Ruolo <@&1442568950805430312> permanente__", "> <a:VC_Exclamation:1448687427836444854> __Ricordo che inoltre i primi in top testuale e vocale riceveranno lo stesso <@&1468674837957574757> e <@&1468674787399172208> ogni settimana.__", "", "<a:VC_Boost:1448670271115497617> Alla fine dell'evento verrà stilata una classifica globale in base all'**EXP** (__non ai livelli__) ottenuta durante la durata dell'evento e i primi 3 otterranno un **__NITRO BOOST__**.", "", "> **NB: Tutti i premi vengono assegnati automaticamente dal bot, anche quelli settimanali (naturalmente non i Nitro Boost), aprite un <#1442569095068254219> solo se siete sicuri di non aver ricevuto la vostra ricompensa. Tutti i ticket inutili verranno sanzionati.**", "", `<a:VC_Calendar:1448670320180592724> __La durata dell'evento è dal \`${startDateStr}\` al \`${endDateStr}\`__`, "", "<a:VC_Ping:1448670620412809298>︲<@&1442569012063109151>",].join("\n"),];

function getEndDateAt21Rome(now, giorniDaOggi = 30) {
  const endDay = new Date(now.getTime() + giorniDaOggi * 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = formatter.formatToParts(endDay);
  const yearPart = parts.find((p) => p.type === "year");
  const monthPart = parts.find((p) => p.type === "month");
  const dayPart = parts.find((p) => p.type === "day");
  const year = parseInt(yearPart?.value ?? "0", 10);
  const month = Math.max(0, parseInt(monthPart?.value ?? "1", 10) - 1);
  const day = parseInt(dayPart?.value ?? "0", 10);
  const hour21CET = new Date(Date.UTC(year, month, day, 20, 0, 0));
  const hour21CEST = new Date(Date.UTC(year, month, day, 19, 0, 0));
  const fmt = new Intl.DateTimeFormat("it-IT", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false, });
  return fmt.format(hour21CET) === "21:00" ? hour21CET : hour21CEST;
}

function buildStaffEventAnnouncementMessages(startDateStr, endDateStr) {
  const part1 = ["## <a:VC_Announce:1448687280381235443>  **EVENTO STAFF**", "", "> <a:VC_Cross:1448671102355116052> __Lo <@&1442568910070349985> non può partecipare all'activity event__", "> <a:VC_Diamon:1469463765610135635> __Per lo Staff ci sarà un evento parallelo a quello degli utenti__", "", "<:VC_Info:1460670816214585481> __Ogni staff per tutta la durata avrà una graduatoria che gli farà garantire un punteggio:__", "<:VC_DoubleReply:1468713981152727120> **Ogni utente entrato tramite invito col vostro [custom link](<https://imgur.com/a/3wpDOVj>) **<a:VC_Arrow:1448672967721615452> __1 punto__", "<:VC_DoubleReply:1468713981152727120> **Ogni utente che si candiderà grazie a voi** <a:VC_Arrow:1448672967721615452> __5 punti__", "<:VC_DoubleReply:1468713981152727120> **Ogni utente che boosta grazie a voi**  <a:VC_Arrow:1448672967721615452> __10 punti__", "<:VC_DoubleReply:1468713981152727120> **Fare il <@&1442568905582317740> oltre allo <@&1442568910070349985>** <a:VC_Arrow:1448672967721615452> __15 punti__", "<:VC_DoubleReply:1468713981152727120> **Ogni server che si trasferirà nel nostro** <a:VC_Arrow:1448672967721615452> __20 punti__", "<:VC_DoubleReply:1468713981152727120> **Superare ogni settimana i limiti di almeno 150 messaggi e 1h e 30** <a:VC_Arrow:1448672967721615452> __20 punti__", "<:VC_DoubleReply:1468713981152727120> **Ogni server che chiede una <#1442569211611185323> grazie a voi** <a:VC_Arrow:1448672967721615452> __25 punti__", "<:VC_Reply:1468262952934314131> **Ogni utente che compra il <@&1442568950805430312> o il <@&1442568916114346096> grazie a voi** <a:VC_Arrow:1448672967721615452> __50 punti__", "> <a:VC_Alert:1448670089670037675> __NB: L'utente che si candiderà dovrà essere pexato al fine del conteggio dei punti. Per le prove dovrete aprire un <#1442569095068254219> `terza categoria`.__", "> <:VC_BlackPin:1448687216871084266> __L'<@&1442568894349840435> è escluso dall'evento__",].join("\n");
  const part2 = ["", "<:VC_Attention:1443933073438675016> **Alla fine dell'evento verranno comunicati lo staffer con più punti (candidato al pex) e quello con meno punti (candidato al depex); pex e depex saranno assegnati manualmente dallo staff.**", "", `<a:VC_pixeltime:1470796283320209600> __La durata dell'evento è dal \`${startDateStr}\` al \`${endDateStr}\`__`, "", "<:VC_Mention:1443994358201323681>︲<@&1442568910070349985>",].join("\n");
  return [part1, part2];
}

function fmtDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  });
}

function fmtDateWithTime(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

module.exports = {
  name: "evento",
  aliases: [],
  subcommands: ["start", "stop", "info", "classifica", "staff"],
  subcommandAliases: { start: "start", stop: "stop", info: "info", classifica: "classifica", staff: "staff" },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => { });
    const sub = String(args[0] || "").toLowerCase();
    const guildId = message.guild?.id;
    if (!guildId) return;

    if (!sub || !["start", "stop", "info", "assegna-ruoli", "reset-premi", "classifica", "staff"].includes(sub)) {
      const usage = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Comando evento")
        .setDescription(["`+evento start` – Avvia l’evento Activity EXP.", "`+evento stop` – Termina l’evento e ripristina i moltiplicatori.", "`+evento info` – Mostra stato e configurazione evento.", "`+evento assegna-ruoli` – Assegna i livelli a chi ha già Supporter/Verificato/Guilded/Promoter/Propulsor/Catalyst (evento attivo).", "`+evento reset-premi` – Cancella i premi già registrati e riassegna a tutti (senza annuncio).", "`+evento classifica` – Classifica per settimana.", "`+evento classifica staff` – Classifica punti evento staff.", "`+evento staff start|stop|addpoints` – Gestione evento staff.",
        ].join("\n"));
      await safeMessageReply(message, {
        embeds: [usage],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "assegna-ruoli") {
      const settings = await getGuildExpSettings(guildId);
      if (!settings?.eventExpiresAt) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Nessun evento attivo. Usa `+evento start` prima.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const channel = message.channel;
      const authorId = message.author?.id;
      await safeMessageReply(message, {
        content: "<:VC_EXP:1468714279673925883> Assegnazione livelli avviata in background (può richiedere diversi minuti). Ti avviso quando ha finito.",
        allowedMentions: { repliedUser: false },
      }).catch(() => { });
      invalidateSettingsCache(guildId);
      (async () => {
        try {
          await grantEventRewardsForExistingRoleMembers(message.guild);
          const mention = authorId ? `<@${authorId}>` : "";
          await channel.send({
            content: `<:vegacheckmark:1443666279058772028> ${mention} Fatto. Assegnati i livelli a chi ha già Supporter, Verificato/Verificata, Guilded o Promoter/Propulsor/Catalyst (solo chi non li aveva già ricevuti per questo evento).`,
            allowedMentions: { users: authorId ? [authorId] : [] },
          }).catch(() => {});
        } catch (err) {
          global.logger?.error?.("[evento assegna-ruoli] grantEventRewardsForExistingRoleMembers failed:", err);
          await channel.send({
            content: authorId ? `<:vegax:1443934876440068179> <@${authorId}> Errore durante l'assegnazione. Controlla i log.` : "<:vegax:1443934876440068179> Errore durante l'assegnazione. Controlla i log.",
            allowedMentions: authorId ? { users: [authorId] } : {},
          }).catch(() => {});
        }
      })();
      return;
    }

    if (sub === "reset-premi") {
      const settings = await getGuildExpSettings(guildId);
      if (!settings?.eventExpiresAt) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Nessun evento attivo. Usa `+evento start` prima.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const channel = message.channel;
      const authorId = message.author?.id;
      const { deleted } = await clearActivityEventRewardsForGuild(guildId);
      invalidateSettingsCache(guildId);
      await safeMessageReply(message, {
        content: "<:VC_EXP:1468714279673925883> Reset premi avviato in background (cancellati " + deleted + " registri; riassegnazione può richiedere diversi minuti). Ti avviso quando ha finito.",
        allowedMentions: { repliedUser: false },
      }).catch(() => { });
      (async () => {
        try {
          await grantEventRewardsForExistingRoleMembers(message.guild);
          const mention = authorId ? `<@${authorId}>` : "";
          await channel.send({
            content: `<:vegacheckmark:1443666279058772028> ${mention} Fatto. Riassegnati i livelli a chi ha Supporter, Verificato/Verificata, Guilded o Promoter/Propulsor/Catalyst (senza invio annuncio).`,
            allowedMentions: { users: authorId ? [authorId] : [] },
          }).catch(() => {});
        } catch (err) {
          global.logger?.error?.("[evento reset-premi] grantEventRewardsForExistingRoleMembers failed:", err);
          await channel.send({
            content: authorId ? `<:vegax:1443934876440068179> <@${authorId}> Errore durante la riassegnazione. Controlla i log.` : "<:vegax:1443934876440068179> Errore durante la riassegnazione. Controlla i log.",
            allowedMentions: authorId ? { users: [authorId] } : {},
          }).catch(() => {});
        }
      })();
      return;
    }

    if (sub === "classifica") {
      const second = String(args[1] || "").toLowerCase();
      if (second === "staff") {
        const staffSettings = await getStaffEventSettings(guildId);
        if (!staffSettings?.active) {
          await safeMessageReply(message, {
            content: "<:vegax:1443934876440068179> Nessun evento staff attivo. Usa `+evento staff start` prima.",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const rawLeaderboard = await getStaffEventLeaderboard(guildId);
        await message.guild.members.fetch().catch(() => null);
        const allowedIds = new Set();
        for (const [, member] of message.guild.members.cache) {
          if (member?.user?.id && isStaffButNotHighStaff(member)) allowedIds.add(member.id);
        }
        const leaderboard = rawLeaderboard.filter((r) => allowedIds.has(r.userId)).slice(0, 25);
        const lines = leaderboard.length ? leaderboard.map((r, i) => `${i + 1}.<@${r.userId}>—**${r.points}**pt`)
          : ["Nessun punteggio."];
        const embed = new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("Evento Staff — Classifica punti")
          .setDescription(lines.join("\n"))
          .setFooter({ text: `Fine evento: ${fmtDateWithTime(staffSettings.expiresAt)}` });
        await safeMessageReply(message, {
          embeds: [embed],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const settings = await getGuildExpSettings(guildId);
      if (!settings?.eventExpiresAt || !settings?.eventStartedAt) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Nessun evento attivo. Usa `+evento start` prima.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const currentWeek = Math.max(1, Math.min(4, Number(getEventWeekNumber(settings) || 1)));
      const payload = await buildEventoClassificaPayload(message.guild, message.client, settings, currentWeek,);
      await safeMessageReply(message, {
        ...payload,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "staff") {
      const staffSub = String(args[1] || "").toLowerCase();
      if (!["start", "stop", "addpoints"].includes(staffSub)) {
        await safeMessageReply(message, {
          content: [
            "**Evento staff**:",
            "`+evento staff start` – Avvia evento staff.",
            "`+evento staff stop` – Termina evento staff.",
            "`+evento staff addpoints <@user|id> <punti>` – Aggiunge punti manualmente a uno staffer.",
          ].join("\n"),
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (staffSub === "start") {
        const now = new Date();
        const endDate = getEndDateAt21Rome(now, EVENT_DURATION_DAYS - 1);
        const result = await setStaffEvent(guildId, { endDate: endDate.getTime(), startedAt: now, });
        if (!result) {
          await safeMessageReply(message, {
            content: "<:vegax:1443934876440068179> Impossibile avviare l'evento staff.",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        setImmediate(() => {
          givePmStaff15PointsAtStart(message.guild).catch((err) => {
            global.logger?.error?.("[evento staff start] givePmStaff15PointsAtStart failed:", err);
          });
          giveExistingInvitesPointsAtStart(message.guild).catch((err) => {
            global.logger?.error?.("[evento staff start] giveExistingInvitesPointsAtStart failed:", err);
          });
        });
        await safeMessageReply(message, {
          content: "<:vegacheckmark:1443666279058772028> Evento staff avviato. Dal **" + fmtDate(now) + "** al **" + fmtDateWithTime(endDate.getTime()) + "**. Inviti esistenti e PM+Staff hanno ricevuto i punti.",
          allowedMentions: { repliedUser: false },
        });
        if (NEWS_STAFF_CHANNEL_ID) {
          const newsStaffChannel = message.client.channels.cache.get(NEWS_STAFF_CHANNEL_ID) || (await message.client.channels.fetch(NEWS_STAFF_CHANNEL_ID).catch(() => null));
          if (newsStaffChannel) {
            const staffMessages = buildStaffEventAnnouncementMessages(fmtDate(now), fmtDateWithTime(endDate.getTime()),);
            for (const content of staffMessages) {
              await newsStaffChannel.send({
                content,
                allowedMentions: { parse: ["roles"] },
              }).catch((err) => {
                global.logger?.error?.("[evento staff start] Annuncio #newsstaff fallito:", err);
              });
            }
          }
        }
        return;
      }
      if (staffSub === "stop") {
        await clearStaffEvent(guildId);
        await safeMessageReply(message, {
          content: "<:vegacheckmark:1443666279058772028> Evento staff terminato.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (staffSub === "addpoints") {
        const target = args[2];
        const pointsArg = args[3];
        const points = Math.floor(Number(pointsArg));
        if (!target || !Number.isFinite(points) || points <= 0) {
          await safeMessageReply(message, {
            content: "Uso: `+evento staff addpoints <@user|id> <punti>` (punti intero positivo).",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const userId = target.replace(/^<@!?(\d+)>$/, "$1") || target;
        if (!/^\d+$/.test(userId)) {
          await safeMessageReply(message, {
            content: "<:vegax:1443934876440068179> Inserisci un utente valido (@menzione o ID).",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const member = message.guild.members.cache.get(userId) || await message.guild.members.fetch(userId).catch(() => null);
        if (!member || !isStaffButNotHighStaff(member)) {
          await safeMessageReply(message, {
            content: "<:vegax:1443934876440068179> Solo chi ha il ruolo Staff (e non HighStaff, né solo Partner Manager) può ricevere punti evento staff.",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const added = await addStaffEventPoints(guildId, userId, points, "manual");
        if (!added) {
          await safeMessageReply(message, {
            content: "<:vegax:1443934876440068179> Evento staff non attivo o parametri non validi.",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        await safeMessageReply(message, {
          content: "<:vegacheckmark:1443666279058772028> Aggiunti **" + points + "** punti a <@" + userId + ">.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      return;
    }

    if (sub === "info") {
      const settings = await getGuildExpSettings(guildId);
      const hasEvent = Boolean(settings.eventExpiresAt);
      const lines = [
        "- Evento attivo: **" + (hasEvent ? "Sì" : "No") + "**",
        "- Data inizio: **" + (settings.eventStartedAt ? fmtDate(settings.eventStartedAt) : "—") + "**",
        "- Scadenza: **" + (settings.eventExpiresAt ? fmtDate(settings.eventExpiresAt) : "Nessuna") + "**",
        "- Moltiplicatore base: **" + settings.baseMultiplier + "x**",
        "- Moltiplicatore evento: **" + settings.eventMultiplier + "x**",
        "- Moltiplicatore effettivo: **" + settings.effectiveMultiplier + "x**",
      ];
      if (hasEvent && settings.eventRoleOverrides && Object.keys(settings.eventRoleOverrides).length > 0) {
        lines.push("- Override ruoli evento: attivi");
      }
      if (hasEvent && Array.isArray(settings.eventExtraMultiplierRoleIds) && settings.eventExtraMultiplierRoleIds.length > 0) {
        lines.push("- Ruoli boost extra (x2): **" + settings.eventExtraMultiplierRoleIds.length + "**");
      }

      const diag = await getEventDiagnostics(message.guild).catch(() => null);
      if (diag) {
        lines.push("", "**Diagnostica classifica settimanale:**");
        lines.push("- Settimana evento: **" + (diag.eventWeek >= 1 && diag.eventWeek <= 4 ? diag.eventWeek : "—") + "**");
        lines.push("- Canali testuali che contano: **" + diag.eligibleTextChannels + "**");
        lines.push("- Canali vocali che contano: **" + diag.eligibleVoiceChannels + "**");
        lines.push("- Righe attività (questa settimana): **" + diag.activityDailyCount + "**");
        if (diag.eventWeek >= 1 && diag.eventWeek <= 4 && diag.activityDailyCount === 0) {
          lines.push("", "<:VC_Info:1448670089670037675> Se nessuno viene calcolato: il bot deve essere online quando scrivono; i canali dove scrivono devono dare al ruolo Member **Visualizza canale** e **Invia messaggi**. Controlla che la chat principale non sia esclusa.");
        }
      }

      const embed = new EmbedBuilder().setColor("#6f4e37").setTitle("Stato evento Activity EXP").setDescription(lines.join("\n"));
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "stop") {
      await clearActivityEvent(guildId);
      await safeMessageReply(message, {
        content:
          "<:vegacheckmark:1443666279058772028> Evento Activity EXP terminato. Moltiplicatori ripristinati.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "start") {
      const now = new Date();
      const endDate = getEndDateAt21Rome(now, EVENT_DURATION_DAYS - 1);
      const result = await setActivityEvent(guildId, { startDate: now.getTime(), endDate: endDate.getTime(), startedAt: now, globalMultiplier: EVENT_GLOBAL_MULTI, roleOverrides: EVENT_ROLE_OVERRIDES, extraMultiplierRoleIds: EVENT_EXTRA_MULTI_ROLE_IDS, });
      if (!result) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Impossibile avviare l'evento.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const nowForStart = new Date();
      const guildForRewards = message.guild;
      setTimeout(() => {
        invalidateSettingsCache(guildId);
        grantEventRewardsForExistingRoleMembers(guildForRewards).catch((err) => {
          global.logger?.error?.("[evento start] grantEventRewardsForExistingRoleMembers failed:", err);
        });
        grantEventRewardsForSameDayReviewAndVote(guildForRewards, nowForStart).catch((err) => {
          global.logger?.error?.("[evento start] grantEventRewardsForSameDayReviewAndVote failed:", err);
        });
      }, 800);
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Evento Activity EXP avviato")
        .setDescription(
          [
            `<:VC_EXP:1468714279673925883> **ACTIVITY EXP EVENT**`,
            ``,
            `- Dal **${fmtDate(result.startDate)}** al **${fmtDateWithTime(result.endDate)}**`,
            `- Moltiplicatore globale: **x${result.eventMultiplier}**`,
            `- Override ruoli: Server Booster x3, Donator x4, VIP x5`,
            `- Boost extra x2: <@&${IDs.roles.Veterano}>`,
            ``,
            `I boost si sommano al moltiplicatore globale, non tra loro.`,
          ].join("\n"),
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });

      if (NEWS_CHANNEL_ID) {
        const newsChannel = message.client.channels.cache.get(NEWS_CHANNEL_ID) || (await message.client.channels.fetch(NEWS_CHANNEL_ID).catch(() => null));
        if (newsChannel) {
          const startStr = fmtDate(result.startDate);
          const endStr = fmtDateWithTime(result.endDate);
          for (let i = 0; i < EVENT_ANNOUNCEMENT_MESSAGES.length; i++) {
            const content = typeof EVENT_ANNOUNCEMENT_MESSAGES[i] === "function" ? EVENT_ANNOUNCEMENT_MESSAGES[i](startStr, endStr) : EVENT_ANNOUNCEMENT_MESSAGES[i];
            await newsChannel
              .send({
                content,
                allowedMentions: { parse: ["everyone"] },
              })
              .catch((err) => {
                global.logger?.error?.("[evento start] Invio annuncio in #news fallito:", err);
              });
          }
        }
      }
    }
  },
};