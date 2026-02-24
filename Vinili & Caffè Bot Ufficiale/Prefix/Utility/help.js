const fs = require("fs");
const path = require("path");
const IDs = require("../../Utils/Config/ids");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandType, ComponentType, MessageFlags, } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const PERMISSIONS_PATH = path.join(__dirname, "..", "..", "permissions.json");
const MAX_HELP_COLLECTOR_MS = 24 * 60 * 60 * 1000;
const HELP_EMBED_COLOR = "#6f4e37";
const ERROR_EMBED_COLOR = "Red";
const PRIVATE_FLAG = 1 << 6;
const NO_REPLY_MENTIONS = { repliedUser: false };
const PAGE_ROLE_IDS = [
  IDs.roles.Member,
  IDs.roles.Staff,
  IDs.roles.HighStaff,
  IDs.roles.Founder,
].filter(Boolean);
const PAGE_TITLES = {
  [IDs.roles.Member]: "Comandi Utente",
  [IDs.roles.Staff]: "Comandi Staff",
  [IDs.roles.HighStaff]: "Comandi High Staff",
  [IDs.roles.Founder]: "Comandi Dev",
  all: "Comandi Disponibili",
};
const CATEGORY_LABELS = {
  utility: "Utility",
  tts: "TTS",
  level: "Level",
  minigames: "Minigames",
  stats: "Stats",
  partner: "Partner",
  ticket: "Ticket",
  moderation: "Moderation",
  admin: "Admin",
  staff: "Staff",
  vip: "VIP",
  dev: "Dev",
};
const CATEGORY_ORDER = [
  "utility",
  "tts",
  "level",
  "minigames",
  "stats",
  "vip",
  "partner",
  "ticket",
  "moderation",
  "admin",
  "staff",
  "dev",
];
const HELP_PAGE_SIZE = 18;
const PREFIX_HELP_DESCRIPTIONS = {
  help: "Mostra tutti i comandi disponibili con il bot.",
  afk: "Imposta il tuo stato AFK con un messaggio personalizzato.",
  avatar: "Mostra l'avatar di un utenteo l'icona del server.",
  banner: "Mostra il banner di un utente o del server.",
  block: "Blocca privacy contenuti: avatar, banner, quotes.",
  invites: "Mostra le statistiche inviti di un utente.",
  languages: "Mostra le lingue TTS disponibili per il comando \`+set voice\`.",
  membercount: "Mostra il numero totale di membri del server.",
  "no-dm": "Disattiva i DM del bot.",
  "dm-enable": "Riattiva i DM del bot.",
  ping: "Mostra latenza bot, database e informazioni di uptime.",
  set: "Imposta la lingua TTS personale.",
  ship: "Calcola la compatibilità tra due utenti.",
  adorable: "Genera un avatar stile fun partendo da un seed o testo.",
  birb: "Invia un'immagine casuale di un uccellino.",
  cat: "Invia un'immagine casuale di un gatto.",
  catfacts: "Mostra una curiosità casuale sui gatti.",
  chucknorris: "Mostra una battuta casuale su Chuck Norris.",
  country: "Mostra informazioni su un paese.",
  dadjoke: "Mostra una battuta spiritosa casuale.",
  define: "Cerca la definizione di una parola.",
  dog: "Invia un'immagine casuale di un cane.",
  dogfacts: "Mostra una curiosità casuale sui cani.",
  flip: "Lancia una moneta.",
  github: "Cerca un repository GitHub per nome o keyword.",
  itunes: "Cerca una traccia musicale su iTunes.",
  joke: "Mostra una battuta casuale.",
  math: "Calcola espressioni matematiche o mostra curiosità sui numeri.",
  movie: "Cerca informazioni su un film.",
  pokemon: "Mostra info e stats base di un Pokémon.",
  pug: "Invia un'immagine casuale di un pug.",
  quotes: "Mostra una citazione casuale testuale.",
  roll: "Tira uno o più dadi.",
  rps: "Gioca a sasso, carta, forbici contro il bot.",
  slots: "Gioca alle slot machine.",
  space: "Mostra posizione ISS e persone nello spazio.",
  steamstatus: "Mostra lo stato dei servizi Steam.",
  weather: "Mostra il meteo per una località.",
  snipe: "Recupera l'ultimo messaggio eliminato nel canale.",
  join: "Fa entrare il bot nel tuo canale vocale.",
  leave: "Fa uscire il bot dal canale vocale.",
  unblock: "Sblocca privacy contenuti: avatar, banner, quotes.",
  classifica: "Mostra la classifica livelli.",
  mstats: "Mostra statistiche minigiochi di un utente.",
  me: "Mostra le tue statistiche attività.",
  user: "Mostra le statistiche attività di un utente specifico.",
  server: "Mostra statistiche attività del server.",
  top: "Mostra la top completa utenti/canali.",
  rank: "Mostra livello, exp e posizione in classifica di un utente.",
  birthday: "Imposta o modifica la tua data di compleanno, età e privacy.",
  "dm-disable": "Disattiva i DM automatici del bot.",
  embed: "Apre il builder embed interattivo per creare e inviare embed personalizzati.",
  info: "Mostra una scheda completa di un utente: account, ruoli, permessi, strike e stato sicurezza.",
  reaction: "Configura le reaction quando sei menzionato e le regole di risposta automatica a parole o frasi.",
  description: "Invia nel ticket la descrizione ufficiale del server.",
  "no-dm-list": "Mostra la lista utenti con blocco DM attivo.",
  purge: "Elimina messaggi da un canale.",
  ban: "Banna un utente.",
  unban: "Rimuove il ban di un utente.",
  kick: "Kicka un utente dal server.",
  mute: "Applica timeout ad un utente.",
  unmute: "Rimuove il timeout da un utente.",
  warn: "Warna un utente.",
  warnings: "Mostra i warn attivi di un utente.",
  delwarn: "Rimuove un warn attivo da un utente.",
  case: "Mostra una singola case moderazione.",
  reason: "Aggiorna il motivo di una case.",
  duration: "Aggiorna la durata di una case temporanea.",
  modlogs: "Mostra gli ultimi log moderazione di un utente.",
  moderations: "Mostra tutte le moderazioni temporanee attive (mute/ban). Senza utente: elenco globale; con utente: solo le sue.",
  modstats: "Mostra statistiche moderazione per staffer.",
  lock: "Blocca un canale.",
  unlock: "Sblocca un canale.",
  recensione: "Premia una recensione assegnando livelli.",
  ticket: "Gestisce i ticket.",
  verify: "Verifica manualmente un utente.",
  restart: "Riavvia il bot o ricarica moduli specifici.",
  perms: "Assegna o revoca permessi temporanei su comandi e imposta quali canali possono usare un comando.",
  temprole: "Assegna o rimuove ruoli temporanei agli utenti.",
  security: "Hub sicurezza: joingate, joinraid, raid, panic, antinuke.",
  statics: "Configura ruoli, canali e utenti “statici” per la sicurezza.",
  level: "Configura il sistema EXP/livelli: imposta o modifica exp, blocca canali, moltiplicatori, ruoli ignorati.",
  customrole: "Crea o modifica il tuo ruolo personalizzato e gestisci chi può usarlo.",
  customvoc: "Crea e gestisce la tua vocale privata.",
  quote: "Genera una quote da un messaggio.",
};
const PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS = {
  "level.set": "Imposta EXP o livello a un valore preciso per un utente.",
  "level.add": "Aggiunge EXP a un utente.",
  "level.remove": "Rimuove EXP da un utente.",
  "level.reset": "Azzera EXP e livello di un utente.",
  "level.lock": "Blocca il guadagno EXP in un canale.",
  "level.unlock": "Sblocca il guadagno EXP in un canale.",
  "level.multiplier": "Imposta un moltiplicatore EXP temporaneo.",
  "level.gmulti": "Imposta il moltiplicatore globale EXP del server.",
  "level.config": "Mostra la configurazione EXP corrente del server.",
  "level.ignore": "Esclude un ruolo dal guadagno EXP.",
  "level.unignore": "Riabilita un ruolo al guadagno EXP.",
  "security.joingate": "Mostra le impostazioni del modulo Join Gate.",
  "security.raid": "Mostra le impostazioni del modulo Join Raid.",
  "security.panic": "Mostra le impostazioni del modulo Panic Mode.",
  "security.antinuke": "Mostra le impostazioni del modulo Anti Nuke.",
  "security.joinraid": "Mostra le impostazioni del modulo Join Raid.",
  "ticket.add": "Aggiunge uno o più utenti al ticket corrente.",
  "ticket.remove": "Rimuove uno o più utenti dal ticket corrente.",
  "ticket.closerequest": "Invia richiesta di chiusura ticket.",
  "ticket.close": "Chiude il ticket corrente.",
  "ticket.claim": "Claima un ticket.",
  "ticket.unclaim": "Unclaim un ticket.",
  "ticket.switchpanel": "Sposta il ticket a un pannello differente.",
  "ticket.rename": "Rinomina il canale ticket.",
  "ticket.reopen": "Riapre un ticket già chiuso.",
  "birthday.set": "Imposta la tua data di compleanno.",
  "birthday.edit": "Modifica la tua data di compleanno.",
  "birthday.remove": "Rimuove il tuo profilo compleanno.",
  "avatar.server": "Mostra l'avatar di un utente impostato per questo server.",
  "avatar.user": "Mostra l'avatar di un utente.",
  "avatar.guild": "Mostra l'icona del server.",
  "banner.user": "Mostra il banner di un utente.",
  "banner.server": "Mostra il banner di un utente impostato per questo server.",
  "banner.guild": "Mostra il banner del server.",
  "block.avatar": "Blocca la visualizzazione del tuo avatar.",
  "block.banner": "Blocca la visualizzazione del tuo banner.",
  "block.quotes": "Blocca la creazione di quote dei tuoi messaggi.",
  "unblock.avatar": "Sblocca la visualizzazione del tuo avatar.",
  "unblock.banner": "Sblocca la visualizzazione del tuo banner.",
  "unblock.quotes": "Sblocca la creazione di quote dei tuoi messaggi.",
  "classifica.alltime": "Mostra la classifica alltime.",
  "classifica.weekly": "Mostra la classifica settimanale.",
  "set.autojoin": "Attiva o disattiva autojoin TTS.",
  "set.voice": "Imposta la lingua TTS personale.",
  "embed.create": "Avvia il builder interattivo dell'embed con anteprima e invio finale.",
  "perms.grant": "Assegna permessi a un utente su comandi.",
  "perms.revoke": "Revoca permessi specifici a un utente.",
  "perms.list": "Mostra i permessi attivi di un utente.",
  "perms.clear": "Rimuove tutti i permessi temporanei di un utente.",
  "reaction.mention": "Mostra o imposta le reaction che il bot aggiunge quando qualcuno ti menziona.",
  "reaction.auto": "Crea o modifica regole di risposta automatica a parole/frasi con risposta e reaction opzionali.",
  "restart.full": "Riavvia il bot; con `both` riavvia anche il bot Test.",
  "restart.all": "Esegue il reload completo di tutte le scope ricaricabili.",
  "temprole.add": "Assegna un ruolo temporaneo a un utente.",
  "temprole.remove": "Rimuove un ruolo temporaneo da un utente.",
  "customrole.create": "Crea o aggiorna il tuo ruolo personalizzato.",
  "customrole.modify": "Apre il pannello di modifica del tuo ruolo personalizzato.",
  "customrole.add": "Aggiunge un utente al tuo ruolo personalizzato.",
  "customrole.remove": "Rimuove un utente dal tuo ruolo personalizzato.",
};
const CONTEXT_HELP_DESCRIPTIONS = {
  Partnership: "Esegui una partnership direttamente dal messaggio.",
};
const CONTEXT_CATEGORY_OVERRIDES = {
  partnership: "partner",
};

function buildMiniHelpNotFoundEmbed(query) {
  return new EmbedBuilder()
    .setColor(ERROR_EMBED_COLOR)
    .setTitle("Mini Help")
    .setDescription(
      `<:vegax:1443934876440068179> Nessun comando trovato per \`${query}\`.`,
    );
}

function buildNoAvailableCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(ERROR_EMBED_COLOR)
    .setDescription("<:vegax:1443934876440068179> Nessun comando disponibile.");
}

function resolveRoleReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
  else if (key.startsWith("roles.")) key = key.slice("roles.".length);

  const resolved = IDs?.roles?.[key];
  if (!resolved) return null;
  return String(resolved);
}

function normalizeRoleList(roleIds) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds.map((value) => resolveRoleReference(value)).filter(Boolean);
}

function normalizePermissionTree(node) {
  if (Array.isArray(node)) return normalizeRoleList(node);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = normalizePermissionTree(value);
  }
  return out;
}

function loadPermissions() {
  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) return { slash: {}, prefix: {} };
    const raw = fs.readFileSync(PERMISSIONS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      slash: normalizePermissionTree(parsed?.slash || {}),
      prefix: normalizePermissionTree(parsed?.prefix || {}),
    };
  } catch {
    return { slash: {}, prefix: {} };
  }
}

function normalizeDescription(
  text,
  fallback = "Nessuna descrizione disponibile.",
) {
  const value = String(text || "").trim();
  return value.length ? value : fallback;
}

function getPrefixDescription(command) {
  const commandName = String(command?.name || "").toLowerCase();
  if (PREFIX_HELP_DESCRIPTIONS[commandName]) {
    return PREFIX_HELP_DESCRIPTIONS[commandName];
  }
  const fromCommand = normalizeDescription(
    command?.description || command?.desc || command?.help || command?.usage,
    "",
  );
  if (fromCommand) return fromCommand;
  return "Descrizione non disponibile.";
}

function prettifySubcommandName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "subcommand";
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPrefixSubcommandDescription(command, subcommandName) {
  const commandName = String(command?.name || "").toLowerCase();
  const key = `${String(commandName || "").toLowerCase()}.${String(subcommandName || "").toLowerCase()}`;
  if (PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key]) {
    return PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key];
  }
  const commandSubDesc =
    command?.subcommandDescriptions ||
    command?.subcommandsDescriptions ||
    command?.subcommandHelp ||
    command?.subcommandsHelp ||
    null;
  if (commandSubDesc && typeof commandSubDesc === "object") {
    const fromCommand =
      commandSubDesc[String(subcommandName || "").toLowerCase()] ||
      commandSubDesc[String(subcommandName || "").trim()];
    if (String(fromCommand || "").trim())
      return normalizeDescription(fromCommand);
  }
  return "Descrizione non disponibile.";
}

function getPrefixBase(command) {
  void command;
  return "+";
}

function normalizeCategoryKey(value) {
  const key = String(value || "misc").toLowerCase();
  if (key === "utiliy") return "utility";
  return key;
}

function resolveContextCategory(command, dataJson) {
  const contextName = String(dataJson?.name || "")
    .trim()
    .toLowerCase();
  if (contextName && CONTEXT_CATEGORY_OVERRIDES[contextName]) {
    return normalizeCategoryKey(CONTEXT_CATEGORY_OVERRIDES[contextName]);
  }
  return normalizeCategoryKey(command?.category || "contextmenubuilder");
}

function extractPrefixSubcommands(command) {
  const fromMeta = Array.isArray(command?.subcommands)
    ? command.subcommands
      .map((s) =>
        String(s || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
    : [];
  const fromAliases = command?.subcommandAliases &&
    typeof command.subcommandAliases === "object"
    ? Object.values(command.subcommandAliases)
      .map((s) =>
        String(s || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
    : [];
  const commandSubDesc =
    command?.subcommandDescriptions ||
    command?.subcommandsDescriptions ||
    command?.subcommandHelp ||
    command?.subcommandsHelp ||
    null;
  const fromSubDesc =
    commandSubDesc && typeof commandSubDesc === "object"
      ? Object.keys(commandSubDesc)
        .map((s) =>
          String(s || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
      : [];

  const src = String(command?.execute || "");
  const found = new Set();
  let match = null;

  const eqRegex = /subcommand\s*===\s*['"`]([a-z0-9._-]+)['"`]/gi;
  while ((match = eqRegex.exec(src)) !== null) {
    found.add(String(match[1]).toLowerCase());
  }

  const caseRegex = /case\s+['"`]([a-z0-9._-]+)['"`]\s*:/gi;
  while ((match = caseRegex.exec(src)) !== null) {
    found.add(String(match[1]).toLowerCase());
  }

  return Array.from(
    new Set([
      ...fromMeta,
      ...fromAliases,
      ...fromSubDesc,
      ...Array.from(found.values()),
    ]),
  );
}

function extractDirectAliasesForSubcommand(command, subcommandName) {
  const mapped =
    command?.subcommandAliases && typeof command.subcommandAliases === "object"
      ? command.subcommandAliases
      : {};
  const out = [];

  for (const [alias, target] of Object.entries(mapped)) {
    const normalizedAlias = String(alias || "")
      .trim()
      .toLowerCase();
    const normalizedTarget = String(target || "")
      .trim()
      .toLowerCase();
    if (!normalizedAlias || !normalizedTarget) continue;
    if (normalizedTarget !== subcommandName) continue;
    out.push(normalizedAlias);
  }

  return Array.from(new Set(out));
}

function getSlashTopLevelDescription(dataJson) {
  return normalizeDescription(dataJson?.description, "Comando slash.");
}

function getCommandPermissionNode(permissionRoot, commandName) {
  if (!permissionRoot || typeof permissionRoot !== "object") return null;
  const exact = permissionRoot[commandName];
  if (typeof exact !== "undefined") return exact;
  const wanted = String(commandName || "").trim().toLowerCase();
  if (!wanted) return null;
  for (const [key, value] of Object.entries(permissionRoot)) {
    if (String(key || "").trim().toLowerCase() === wanted) return value;
  }
  return null;
}

function normalizePermissionRoles(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.roles)) {
    return value.roles;
  }
  return null;
}

function getSubcommandEntries(
  commandName,
  dataJson,
  permissionConfig,
  commandType,
  category,
) {
  const entries = [];
  const options = Array.isArray(dataJson?.options) ? dataJson.options : [];
  if (commandType !== ApplicationCommandType.ChatInput) return entries;

  const subPermissions = permissionConfig?.subcommands || {};
  const commandRoles = normalizePermissionRoles(permissionConfig?.roles);
  const topDesc = getSlashTopLevelDescription(dataJson);

  const parseSubOption = (subOption, groupName = null) => {
    if (!subOption?.name) return;
    const subName = subOption.name;
    const key = groupName ? `${groupName}.${subName}` : subName;
    const allowedRoles = Object.prototype.hasOwnProperty.call(
      subPermissions,
      key,
    )
      ? subPermissions[key]
      : commandRoles;
    const roleList = normalizePermissionRoles(allowedRoles);

    entries.push({
      invoke: `/${groupName ? `${commandName} ${groupName} ${subName}` : `${commandName} ${subName}`}`,
      type: "slash",
      description: normalizeDescription(subOption.description, topDesc),
      category: normalizeCategoryKey(category),
      roles: roleList,
    });
  };

  for (const option of options) {
    if (option?.type === 1) {
      parseSubOption(option);
      continue;
    }
    if (option?.type === 2 && Array.isArray(option.options)) {
      for (const subOption of option.options) {
        if (subOption?.type === 1) parseSubOption(subOption, option.name);
      }
    }
  }
  return entries;
}

function buildEntries(client, permissions) {
  const entries = [];

  for (const command of client.pcommands.values()) {
    if (!command?.name) continue;

    const perm = permissions.prefix?.[command.name];
    const commandRoles = Array.isArray(perm)
      ? perm
      : Array.isArray(perm?.roles)
        ? perm.roles
        : null;
    const subcommandRoles =
      perm && typeof perm === "object" && !Array.isArray(perm)
        ? perm.subcommands || {}
        : {};
    const aliases = Array.isArray(command.aliases)
      ? command.aliases.filter(
        (alias) => typeof alias === "string" && alias.trim().length,
      )
      : [];
    const prefixBase = getPrefixBase(command);
    const base = {
      type: "prefix",
      description: getPrefixDescription(command),
      aliases,
      prefixBase,
      category: normalizeCategoryKey(command.folder || "misc"),
      roles: commandRoles,
    };

    const canonicalSubs = Array.isArray(command?.canonicalSubcommands)
      ? Array.from(
        new Set(
          command.canonicalSubcommands
            .map((s) => String(s || "").trim().toLowerCase())
            .filter(Boolean),
        ),
      )
      : Array.isArray(command?.subcommands)
        ? Array.from(
          new Set(
            command.subcommands
              .map((s) => String(s || "").trim().toLowerCase())
              .filter(Boolean),
          ),
        )
        : [];
    if (canonicalSubs.length) {
      for (const sub of canonicalSubs) {
        entries.push({
          ...base,
          invoke: `${prefixBase}${command.name} ${sub}`,
          description: getPrefixSubcommandDescription(command, sub),
          roles: Array.isArray(subcommandRoles[sub])
            ? subcommandRoles[sub]
            : commandRoles,
          aliases: [],
          subAliases: extractDirectAliasesForSubcommand(command, sub),
        });
      }
    } else {
      entries.push({
        ...base,
        invoke: `${prefixBase}${command.name}`,
      });
    }
  }

  const seenSlash = new Set();
  for (const command of client.commands.values()) {
    const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (commandType !== ApplicationCommandType.ChatInput) continue;

    const uniqueKey = `${dataJson.name}:${commandType}`;
    if (seenSlash.has(uniqueKey)) continue;
    seenSlash.add(uniqueKey);

    const perm = getCommandPermissionNode(permissions.slash, dataJson.name);
    const category = normalizeCategoryKey(command?.category || "misc");
    const hasSubcommands =
      Array.isArray(dataJson.options) &&
      dataJson.options.some((opt) => opt?.type === 1 || opt?.type === 2);

    const roles = normalizePermissionRoles(perm);
    if (hasSubcommands) {
      entries.push(
        ...getSubcommandEntries(
          dataJson.name,
          dataJson,
          perm,
          commandType,
          category,
        ),
      );
      continue;
    }

    entries.push({
      invoke: `/${dataJson.name}`,
      type: "slash",
      description: getSlashTopLevelDescription(dataJson),
      category,
      roles,
    });
  }

  for (const command of client.commands.values()) {
    const dataJson = command?._helpDataJson || command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (
      commandType !== ApplicationCommandType.User &&
      commandType !== ApplicationCommandType.Message
    )
      continue;

    const perm = getCommandPermissionNode(permissions.slash, dataJson.name);
    const roles = normalizePermissionRoles(perm);

    entries.push({
      invoke: `${dataJson.name}`,
      type: "context",
      description: normalizeDescription(
        command?.helpDescription ||
        command?.description ||
        CONTEXT_HELP_DESCRIPTIONS[dataJson.name] ||
        `Comando context (${commandType === ApplicationCommandType.User ? "utente" : "messaggio"}).`,
      ),
      category: resolveContextCategory(command, dataJson),
      roles,
    });
  }

  const dedupe = new Map();
  for (const entry of entries) {
    if (String(entry?.category || "").toLowerCase() === "misc") continue;
    const roleKey = Array.isArray(entry.roles)
      ? entry.roles.slice().sort().join(",")
      : "utente";
    const key = `${entry.type}:${entry.invoke}:${roleKey}`;
    if (!dedupe.has(key)) dedupe.set(key, entry);
  }

  const getCategoryIndex = (entry) => {
    const key = String(entry?.category || "misc").toLowerCase();
    const idx = CATEGORY_ORDER.indexOf(key);
    return idx === -1 ? CATEGORY_ORDER.length : idx;
  };

  return Array.from(dedupe.values()).sort((a, b) => {
    const catCmp = getCategoryIndex(a) - getCategoryIndex(b);
    if (catCmp !== 0) return catCmp;
    return a.invoke.localeCompare(b.invoke, "it");
  });
}

function hasAnyRole(memberRoles, roleIds) {
  if (!memberRoles || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roleIds.some((roleId) => memberRoles.has(roleId));
}

const STAFF_TIER_ROLES = [
  IDs.roles.Founder,
  IDs.roles.HighStaff,
  IDs.roles.Staff,
  IDs.roles.PartnerManager,
].filter(Boolean);

function getEntryDisplayTier(entry) {
  const roles = entry?.roles;
  if (!Array.isArray(roles) || roles.length === 0) return "utente";
  let minTier = 3;
  for (const r of roles) {
    if (r === IDs.roles.Founder) minTier = Math.min(minTier, 3);
    else if (r === IDs.roles.HighStaff) minTier = Math.min(minTier, 2);
    else if (
      r === IDs.roles.Staff ||
      r === IDs.roles.PartnerManager
    )
      minTier = Math.min(minTier, 1);
    else minTier = Math.min(minTier, 0);
  }
  if (minTier === 0) return "utente";
  if (minTier === 1) return IDs.roles.Staff;
  if (minTier === 2) return IDs.roles.HighStaff;
  return IDs.roles.Founder;
}

function entryBelongsToPage(entry, pageRoleId) {
  return getEntryDisplayTier(entry) === pageRoleId;
}

function memberCanSeeEntry(entry, memberRoles, pageRoleId) {
  if (pageRoleId === "utente") {
    if (!Array.isArray(entry.roles) || !entry.roles.length) return true;
    if (entry.roles.some((r) => STAFF_TIER_ROLES.includes(r))) return false;
    const entryOnlyVip =
      entry.roles.length > 0 &&
      entry.roles.every((r) => String(r) === String(IDs.roles.VIP || ""));
    const memberHasMemberRole = IDs.roles.Member && memberRoles?.has(IDs.roles.Member);
    if (entryOnlyVip && memberHasMemberRole) return true;
    return hasAnyRole(memberRoles, entry.roles);
  }
  return hasAnyRole(memberRoles, entry.roles);
}

function filterByPage(entries, pageRoleId, memberRoles) {
  return entries.filter(
    (entry) =>
      entryBelongsToPage(entry, pageRoleId) &&
      memberCanSeeEntry(entry, memberRoles, pageRoleId),
  );
}

function canMemberSeeEntry(entry, memberRoles) {
  const roles = entry?.roles;
  if (!Array.isArray(roles) || roles.length === 0) return true;
  if (hasAnyRole(memberRoles, roles)) return true;
  const memberHasMemberRole = IDs.roles.Member && memberRoles?.has(IDs.roles.Member);
  const entryOnlyVip =
    roles.length > 0 &&
    roles.every((r) => String(r) === String(IDs.roles.VIP || ""));
  if (memberHasMemberRole && entryOnlyVip) return true;
  return false;
}

function chunkEntries(entries, size) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(entries.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

function chunkEntriesByCategory(entries, maxPerPage) {
  if (!entries.length) return [];
  const byCategory = new Map();
  for (const entry of entries) {
    const key = String(entry?.category || "misc").toLowerCase();
    if (key === "misc") continue;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(entry);
  }
  const orderedCategories = Array.from(byCategory.keys()).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    const safeA = ai === -1 ? CATEGORY_ORDER.length : ai;
    const safeB = bi === -1 ? CATEGORY_ORDER.length : bi;
    return safeA - safeB;
  });
  const chunks = [];
  let currentPage = [];
  for (const cat of orderedCategories) {
    const catEntries = (byCategory.get(cat) || []).slice().sort((a, b) =>
      String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"),
    );
    if (!catEntries.length) continue;
    if (currentPage.length + catEntries.length <= maxPerPage) {
      currentPage.push(...catEntries);
    } else {
      if (currentPage.length) chunks.push(currentPage);
      currentPage = [];
      if (catEntries.length <= maxPerPage) {
        currentPage = catEntries;
      } else {
        chunks.push(catEntries);
      }
    }
  }
  if (currentPage.length) chunks.push(currentPage);
  return chunks.length ? chunks : [];
}

function renderPageText(page) {
  const grouped = new Map();
  for (const entry of page.items) {
    const key = String(entry.category || "misc").toLowerCase();
    if (key === "misc") continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const orderedKeys = Array.from(grouped.keys()).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    const safeA = ai === -1 ? CATEGORY_ORDER.length : ai;
    const safeB = bi === -1 ? CATEGORY_ORDER.length : bi;
    return safeA - safeB;
  });

  const sections = [];
  for (const categoryKey of orderedKeys) {
    const categoryEntries = (grouped.get(categoryKey) || [])
      .slice()
      .sort((a, b) =>
        String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"),
      );
    const categoryLabel =
      CATEGORY_LABELS[categoryKey] ||
      categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1);
    const rows = categoryEntries.map((entry) => {
      const invokeNorm = normalizeInvokeLookup(entry.invoke);
      const prefixForAlias = entry.prefixBase != null ? String(entry.prefixBase) : "+";
      let aliasList = Array.isArray(entry.aliases) && entry.aliases.length
        ? entry.aliases
            .map((a) => String(a || "").trim())
            .filter((a) => a && normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, "")) !== invokeNorm)
        : [];
      const isTicketCommand = invokeNorm.startsWith("ticket") || String(entry.invoke || "").toLowerCase().startsWith("+ticket");
      if (isTicketCommand && Array.isArray(entry.subAliases) && entry.subAliases.length) {
        const existingNorm = new Set(aliasList.map((a) => normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, ""))));
        for (const a of entry.subAliases) {
          const s = String(a || "").trim();
          if (!s) continue;
          const norm = normalizeInvokeLookup(prefixForAlias + s.replace(/^[/+]+/, ""));
          if (norm !== invokeNorm && !existingNorm.has(norm)) {
            existingNorm.add(norm);
            aliasList.push(s);
          }
        }
      }
      const aliasPart = aliasList.length
        ? " | " + aliasList.map((a) => "`" + (a.startsWith("+") || a.startsWith("/") ? a : prefixForAlias + a) + "`").join(", ")
        : "";
      const onlyMemberRole =
        Array.isArray(entry.roles) &&
        entry.roles.length === 1 &&
        String(entry.roles[0]) === String(IDs.roles.Member);
      const roleHint =
        Array.isArray(entry.roles) &&
          entry.roles.length > 0 &&
          !onlyMemberRole
          ? ` *(Richiede: ${entry.roles.map((id) => `<@&${id}>`).join(", ")})*`
          : "";
      return `- \`${entry.invoke}\`${aliasPart} - ${entry.description}${roleHint}`;
    });
    sections.push(`**${categoryLabel}**\n${rows.join("\n")}`);
  }

  const MAX_DISPLAY_LENGTH = 3900;
  const raw = page.items.length
    ? [
      "## Comandi Disponibili",
      "",
      `### ${PAGE_TITLES[page.roleId] || "Comandi"}`,
      "",
      "Ecco la lista dei comandi disponibili.",
      "Usa il prefix, slash o context menu in base al comando.",
      "Mini-help rapido: `+help <comando>`.",
      "",
      sections.join("\n\n"),
      "",
      `**Pagina ${page.indexLabel}**`,
    ].join("\n")
    : "<:vegax:1443934876440068179> Nessun comando disponibile in questa pagina.";
  return raw.length > MAX_DISPLAY_LENGTH
    ? raw.slice(0, MAX_DISPLAY_LENGTH - 20) + "\n\n...(testo troncato)"
    : raw;
}

function buildNavigationRow(state) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(state.prevId)
      .setEmoji(`<a:vegaleftarrow:1462914743416131816>`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(state.nextId)
      .setEmoji(`<a:vegarightarrow:1443673039156936837>`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.currentIndex >= state.total - 1),
  );
}

function buildHelpV2Container(page, navState) {
  const components = [
    {
      type: ComponentType.TextDisplay,
      content: renderPageText(page),
    },
  ];
  if (navState.total > 1) {
    components.push(buildNavigationRow(navState).toJSON());
  }
  return {
    type: ComponentType.Container,
    accentColor: 0x6f4e37,
    components,
  };
}

function normalizeInvokeLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[/+?!.\-]+/, "")
    .replace(/\s+/g, " ");
}

function getCategoryIndex(entry) {
  const key = String(entry?.category || "misc").toLowerCase();
  const idx = CATEGORY_ORDER.indexOf(key);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function dedupeAndSortEntries(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = `${entry.type}:${entry.invoke}`;
    if (!map.has(key)) map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => {
    const catCmp = getCategoryIndex(a) - getCategoryIndex(b);
    if (catCmp !== 0) return catCmp;
    return String(a.invoke || "").localeCompare(String(b.invoke || ""), "it");
  });
}

function formatRoleMentions(roleIds) {
  if (!Array.isArray(roleIds)) return "Tutti";
  if (!roleIds.length) return "Nessun ruolo configurato";
  return roleIds.map((roleId) => `<@&${roleId}>`).join(", ");
}

function getPrefixPermissionConfig(permissions, commandName) {
  const raw = permissions?.prefix?.[commandName];
  if (Array.isArray(raw)) {
    return { roles: raw, subcommands: {} };
  }
  if (raw && typeof raw === "object") {
    return {
      roles: Array.isArray(raw.roles) ? raw.roles : null,
      subcommands:
        raw.subcommands && typeof raw.subcommands === "object"
          ? raw.subcommands
          : {},
    };
  }
  return { roles: null, subcommands: {} };
}

function pushChunkedField(fields, name, lines, inline = false, maxLen = 980) {
  if (!Array.isArray(lines) || !lines.length) return;
  let current = "";
  let idx = 0;

  const flush = () => {
    if (!current.trim().length) return;
    fields.push({
      name: idx === 0 ? name : `${name} (cont.)`,
      value: current.trim(),
      inline,
    });
    idx += 1;
    current = "";
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    const next = current.length ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      flush();
      current = line;
      continue;
    }
    current = next;
  }
  flush();
}

function collectCommandUsageSnippets(command, commandName, prefixBase) {
  const snippets = new Set();
  const name = String(commandName || "").toLowerCase();
  const prefix = String(prefixBase || "+");
  const knownAliases = Array.isArray(command?.aliases)
    ? command.aliases
      .map((alias) =>
        String(alias || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
    : [];

  const addSnippet = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (text.length > 200) return;
    snippets.add(text.replace(/\s+/g, " "));
  };

  const candidateMeta = [
    command?.usage,
    command?.example,
    command?.helpUsage,
    ...(Array.isArray(command?.usages) ? command.usages : []),
    ...(Array.isArray(command?.examples) ? command.examples : []),
  ];
  for (const candidate of candidateMeta) {
    if (typeof candidate !== "string") continue;
    const lines = candidate
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) addSnippet(line);
  }

  const src = String(command?.execute || "");
  const backtickRegex = /`([^`\n]{3,200})`/g;
  let match = null;
  while ((match = backtickRegex.exec(src)) !== null) {
    const snippet = String(match[1] || "").trim();
    if (!snippet) continue;
    const lower = snippet.toLowerCase();
    if (lower.includes(`${prefix}${name}`) || lower.includes(`/${name}`)) {
      addSnippet(snippet);
      continue;
    }
    if (knownAliases.some((alias) => lower.includes(`${prefix}${alias}`))) {
      addSnippet(snippet);
    }
  }

  const ordered = Array.from(snippets.values()).sort(
    (a, b) => a.length - b.length,
  );
  return ordered.slice(0, 12);
}

function collectPrefixExampleLines(
  command,
  commandName,
  prefixBase,
  subEntries = [],
  requestedSub = null,
) {
  const out = [];
  const push = (line) => {
    const value = String(line || "").trim();
    if (!value) return;
    if (!out.includes(value)) out.push(value);
  };

  const snippets = collectCommandUsageSnippets(
    command,
    commandName,
    prefixBase,
  );
  if (requestedSub) {
    for (const row of snippets) {
      const lower = row.toLowerCase();
      if (
        lower.includes(`${prefixBase}${commandName} ${requestedSub}`) ||
        lower.includes(` ${requestedSub} `)
      ) {
        push(`- \`${row}\``);
      }
    }
  } else {
    for (const row of snippets) push(`- \`${row}\``);
  }

  if (subEntries.length) {
    for (const entry of subEntries) {
      push(`- \`${entry.invoke}\``);
    }
  } else {
    push(`- \`${prefixBase}${commandName}\``);
  }

  return out.slice(0, 16);
}

function buildPrefixDetailedHelpEmbed(query, entries, context = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const commands = Array.from(
    context?.client?.pcommands?.values?.() || [],
  ).filter((cmd) => String(cmd?.name || "").trim().length);
  if (!commands.length) return null;

  let command =
    commands.find(
      (cmd) =>
        String(cmd.name || "")
          .trim()
          .toLowerCase() === queryToken,
    ) || null;
  if (!command) {
    command =
      commands.find(
        (cmd) =>
          Array.isArray(cmd.aliases) &&
          cmd.aliases.some(
            (alias) =>
              String(alias || "")
                .trim()
                .toLowerCase() === queryToken,
          ),
      ) || null;
  }
  if (!command) return null;

  const commandName = String(command.name || "")
    .trim()
    .toLowerCase();
  const prefixBase = getPrefixBase(command);
  const visibleForCommand = entries.filter((entry) => {
    if (entry.type !== "prefix") return false;
    const invoke = normalizeInvokeLookup(entry.invoke);
    return invoke.split(" ")[0] === commandName;
  });
  if (!visibleForCommand.length) return null;

  const permissions = context?.permissions || {};
  const permConfig = getPrefixPermissionConfig(permissions, commandName);
  const subAliasesMap =
    command?.subcommandAliases && typeof command.subcommandAliases === "object"
      ? command.subcommandAliases
      : {};

  let requestedSub = tokens[1] || null;
  if (requestedSub && subAliasesMap[requestedSub]) {
    requestedSub =
      String(subAliasesMap[requestedSub] || "")
        .trim()
        .toLowerCase() || requestedSub;
  }

  const usageLines = [];
  const allSubs = Array.from(
    new Set(
      visibleForCommand
        .map(
          (entry) => normalizeInvokeLookup(entry.invoke).split(" ")[1] || null,
        )
        .filter(Boolean),
    ),
  );
  if (allSubs.length) {
    usageLines.push(`\`${prefixBase}${commandName} <subcommand>\``);
  } else {
    usageLines.push(`\`${prefixBase}${commandName}\``);
  }

  const aliases = Array.isArray(command.aliases)
    ? command.aliases
      .map((alias) =>
        String(alias || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
    : [];
  if (aliases.length) {
    usageLines.push(
      `Alias comando: ${aliases.map((alias) => `\`${prefixBase}${alias}\``).join(", ")}`,
    );
  }
  usageLines.push(`Ruoli richiesti: ${formatRoleMentions(permConfig.roles)}`);

  const subEntries = visibleForCommand
    .filter(
      (entry) => normalizeInvokeLookup(entry.invoke).split(" ").length > 1,
    )
    .filter((entry) => {
      if (!requestedSub) return true;
      return normalizeInvokeLookup(entry.invoke).split(" ")[1] === requestedSub;
    })
    .sort((a, b) =>
      String(a.invoke || "").localeCompare(String(b.invoke || ""), "it"),
    );

  const subLines = [];
  const visibleInvokeSet = getVisibleInvokeSet(visibleForCommand);
  for (const entry of subEntries) {
    const subName = normalizeInvokeLookup(entry.invoke).split(" ")[1];
    const subRoleIds = Array.isArray(permConfig.subcommands?.[subName])
      ? permConfig.subcommands[subName]
      : permConfig.roles;
    const subAliases = entry.subAliases ?? extractDirectAliasesForSubcommand(command, subName);
    const subAliasPart = Array.isArray(subAliases) && subAliases.length ? ` (${subAliases.join(", ")})` : "";
    subLines.push(
      `- \`${prefixBase}${commandName} ${subName}\`${subAliasPart} - ${entry.description}`,
    );
    subLines.push(`  Ruoli: ${formatRoleMentions(subRoleIds)}`);
  }
  if (requestedSub && !subLines.length) {
    const allKnownSubs = listPrefixSubcommandsForCommand(
      command,
      commandName,
      permissions,
    );
    for (const sub of allKnownSubs) {
      const invoke = `${prefixBase}${commandName} ${sub}`;
      const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
      const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
      const subRoleIds = Array.isArray(permConfig.subcommands?.[sub])
        ? permConfig.subcommands[sub]
        : permConfig.roles;
      const subAliases = extractDirectAliasesForSubcommand(command, sub);
      const subAliasPart = subAliases.length ? ` (${subAliases.join(", ")})` : "";
      subLines.push(
        `- \`${invoke}\`${subAliasPart} - ${getPrefixSubcommandDescription(command, sub)}${lock}`,
      );
      subLines.push(`  Ruoli: ${formatRoleMentions(subRoleIds)}`);
    }
  }

  const snippetLines = collectPrefixExampleLines(
    command,
    commandName,
    prefixBase,
    subEntries.map((entry) => ({ invoke: entry.invoke })),
    requestedSub,
  );

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Guida comando: ${prefixBase}${commandName}`)
    .setDescription(getPrefixDescription(command));

  const fields = [];
  pushChunkedField(fields, "Sintassi", usageLines);
  if (subLines.length) {
    pushChunkedField(
      fields,
      requestedSub ? `Subcommand: ${requestedSub}` : "Subcommands",
      subLines,
    );
  }
  pushChunkedField(fields, "Esempi di uso", snippetLines);
  if (fields.length) embed.addFields(fields);
  return embed;
}

function getOptionTypeLabel(type) {
  const labels = {
    1: "Subcommand",
    2: "Gruppo",
    3: "String",
    4: "Integer",
    5: "Boolean",
    6: "User",
    7: "Channel",
    8: "Role",
    9: "Mentionable",
    10: "Number",
    11: "Attachment",
  };
  return labels[type] || "Option";
}

function formatSlashOptionPlaceholder(option) {
  if (!option?.name) return "";
  return option.required ? `<${option.name}>` : `[${option.name}]`;
}

function getSlashSampleValueByType(optionType) {
  if (optionType === 3) return "testo";
  if (optionType === 4) return "10";
  if (optionType === 5) return "true";
  if (optionType === 6) return "@utente";
  if (optionType === 7) return "#canale";
  if (optionType === 8) return "@ruolo";
  if (optionType === 9) return "@utente";
  if (optionType === 10) return "1.5";
  if (optionType === 11) return "file";
  return "valore";
}

function buildSlashExampleLine(
  commandName,
  groupName,
  subName,
  optionList = [],
) {
  const parts = [`/${commandName}`];
  if (groupName) parts.push(groupName);
  if (subName) parts.push(subName);
  for (const opt of optionList) {
    if (!opt?.name || opt.type < 3 || opt.type > 11) continue;
    parts.push(getSlashSampleValueByType(opt.type));
  }
  return `- \`${parts.join(" ")}\``;
}

function buildSlashDetailedHelpEmbed(query, entries, context = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const seen = new Set();
  const slashCommands = [];
  for (const cmd of Array.from(context?.client?.commands?.values?.() || [])) {
    const dataJson = cmd?._helpDataJson || cmd?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const type = dataJson.type || ApplicationCommandType.ChatInput;
    if (type !== ApplicationCommandType.ChatInput) continue;
    const key = `${dataJson.name}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slashCommands.push({ cmd, dataJson });
  }
  if (!slashCommands.length) return null;

  const hit = slashCommands.find(
    ({ dataJson }) =>
      String(dataJson.name || "")
        .trim()
        .toLowerCase() === queryToken,
  );
  if (!hit) return null;

  const commandName = String(hit.dataJson.name || "")
    .trim()
    .toLowerCase();
  const visibleForCommand = entries.filter(
    (entry) =>
      entry.type === "slash" &&
      normalizeInvokeLookup(entry.invoke).split(" ")[0] === commandName,
  );
  if (!visibleForCommand.length) return null;

  const options = Array.isArray(hit.dataJson.options)
    ? hit.dataJson.options
    : [];
  const hasSub = options.some((opt) => opt?.type === 1 || opt?.type === 2);
  const requestedSub = tokens[1] || null;

  const syntaxLines = [];
  const optionLines = [];
  const exampleLines = [];

  if (!hasSub) {
    const placeholders = options
      .filter((opt) => opt?.type >= 3 && opt?.type <= 11)
      .map((opt) => formatSlashOptionPlaceholder(opt))
      .filter(Boolean);
    syntaxLines.push(
      `\`/${commandName}${placeholders.length ? ` ${placeholders.join(" ")}` : ""}\``,
    );
    exampleLines.push(buildSlashExampleLine(commandName, null, null, options));
    for (const opt of options) {
      if (!opt?.name || opt?.type < 3 || opt?.type > 11) continue;
      const required = opt.required ? "obbligatoria" : "opzionale";
      const choices =
        Array.isArray(opt.choices) && opt.choices.length
          ? ` | scelte: ${opt.choices.map((c) => `\`${c.name}\``).join(", ")}`
          : "";
      optionLines.push(
        `- \`${opt.name}\` (${getOptionTypeLabel(opt.type)}, ${required}) - ${normalizeDescription(opt.description, "Nessuna descrizione.")}${choices}`,
      );
    }
  } else {
    for (const opt of options) {
      if (opt?.type === 1) {
        const subName = String(opt.name || "")
          .trim()
          .toLowerCase();
        if (requestedSub && requestedSub !== subName) continue;
        const subPlaceholders = (Array.isArray(opt.options) ? opt.options : [])
          .filter((child) => child?.type >= 3 && child?.type <= 11)
          .map((child) => formatSlashOptionPlaceholder(child))
          .filter(Boolean);
        syntaxLines.push(
          `\`/${commandName} ${subName}${subPlaceholders.length ? ` ${subPlaceholders.join(" ")}` : ""}\``,
        );
        exampleLines.push(
          buildSlashExampleLine(
            commandName,
            null,
            subName,
            Array.isArray(opt.options) ? opt.options : [],
          ),
        );
        optionLines.push(
          `- \`${subName}\` - ${normalizeDescription(opt.description, "Nessuna descrizione.")}`,
        );
        for (const child of Array.isArray(opt.options) ? opt.options : []) {
          if (!child?.name || child?.type < 3 || child?.type > 11) continue;
          const required = child.required ? "obbligatoria" : "opzionale";
          const choices =
            Array.isArray(child.choices) && child.choices.length
              ? ` | scelte: ${child.choices.map((c) => `\`${c.name}\``).join(", ")}`
              : "";
          optionLines.push(
            `  - \`${child.name}\` (${getOptionTypeLabel(child.type)}, ${required})${choices}`,
          );
        }
      }
      if (opt?.type === 2 && Array.isArray(opt.options)) {
        const groupName = String(opt.name || "")
          .trim()
          .toLowerCase();
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const subName = String(sub.name || "")
            .trim()
            .toLowerCase();
          if (
            requestedSub &&
            requestedSub !== groupName &&
            requestedSub !== subName
          )
            continue;
          const subPlaceholders = (
            Array.isArray(sub.options) ? sub.options : []
          )
            .filter((child) => child?.type >= 3 && child?.type <= 11)
            .map((child) => formatSlashOptionPlaceholder(child))
            .filter(Boolean);
          syntaxLines.push(
            `\`/${commandName} ${groupName} ${subName}${subPlaceholders.length ? ` ${subPlaceholders.join(" ")}` : ""}\``,
          );
          exampleLines.push(
            buildSlashExampleLine(
              commandName,
              groupName,
              subName,
              Array.isArray(sub.options) ? sub.options : [],
            ),
          );
          optionLines.push(
            `- \`${groupName} ${subName}\` - ${normalizeDescription(sub.description, "Nessuna descrizione.")}`,
          );
          for (const child of Array.isArray(sub.options) ? sub.options : []) {
            if (!child?.name || child?.type < 3 || child?.type > 11) continue;
            const required = child.required ? "obbligatoria" : "opzionale";
            const choices =
              Array.isArray(child.choices) && child.choices.length
                ? ` | scelte: ${child.choices.map((c) => `\`${c.name}\``).join(", ")}`
                : "";
            optionLines.push(
              `  - \`${child.name}\` (${getOptionTypeLabel(child.type)}, ${required})${choices}`,
            );
          }
        }
      }
    }
  }

  const perm = context?.permissions?.slash?.[commandName];
  const roleIds = Array.isArray(perm)
    ? perm
    : Array.isArray(perm?.roles)
      ? perm.roles
      : null;
  const effectiveSyntax = syntaxLines.length
    ? syntaxLines
    : [`\`/${commandName}\``];

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Guida comando: /${commandName}`)
    .setDescription(
      normalizeDescription(hit.dataJson.description, "Comando slash."),
    );

  const fields = [];
  pushChunkedField(fields, "Sintassi", effectiveSyntax);
  pushChunkedField(fields, "Permessi", [
    `Ruoli richiesti: ${formatRoleMentions(roleIds)}`,
  ]);
  if (optionLines.length) {
    pushChunkedField(fields, "Opzioni", optionLines);
  }
  if (requestedSub && !optionLines.length) {
    const visibleInvokeSet = getVisibleInvokeSet(visibleForCommand);
    const fallbackSubLines = [];
    for (const opt of options) {
      if (opt?.type === 1 && opt?.name) {
        const invoke = `/${commandName} ${opt.name}`;
        const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
        const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
        fallbackSubLines.push(
          `- \`${invoke}\` - ${normalizeDescription(opt.description, "Nessuna descrizione.")}${lock}`,
        );
      }
      if (opt?.type === 2 && Array.isArray(opt.options)) {
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const invoke = `/${commandName} ${opt.name} ${sub.name}`;
          const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
          const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
          fallbackSubLines.push(
            `- \`${invoke}\` - ${normalizeDescription(sub.description, "Nessuna descrizione.")}${lock}`,
          );
        }
      }
    }
    if (fallbackSubLines.length) {
      pushChunkedField(fields, "Subcommands disponibili", fallbackSubLines);
    }
  }
  pushChunkedField(
    fields,
    "Esempi di uso",
    exampleLines.length ? exampleLines : [`- \`/${commandName}\``],
  );
  if (fields.length) embed.addFields(fields);
  return embed;
}

function buildDetailedHelpEmbed(query, entries, context = {}) {
  return (
    buildPrefixDetailedHelpEmbed(query, entries, context) ||
    buildSlashDetailedHelpEmbed(query, entries, context) ||
    null
  );
}

function getVisibleInvokeSet(entries) {
  const set = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const invoke = normalizeInvokeLookup(entry?.invoke);
    if (invoke) set.add(invoke);
  }
  return set;
}

function resolvePrefixCommandByToken(client, token) {
  const safeToken = String(token || "")
    .trim()
    .toLowerCase();
  if (!safeToken) return null;
  const commands = Array.from(client?.pcommands?.values?.() || []);
  for (const command of commands) {
    const name = String(command?.name || "")
      .trim()
      .toLowerCase();
    if (name && name === safeToken) return command;
    const aliases = Array.isArray(command?.aliases)
      ? command.aliases.map((alias) =>
        String(alias || "")
          .trim()
          .toLowerCase(),
      )
      : [];
    if (aliases.includes(safeToken)) return command;
  }
  return null;
}

function listPrefixSubcommandsForCommand(command, commandName, permissions) {
  const subcommands = Array.from(
    new Set([
      ...extractPrefixSubcommands(command),
      ...(Array.isArray(command?.subcommands)
        ? command.subcommands
          .map((s) =>
            String(s || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
        : []),
    ]),
  );
  return subcommands.sort((a, b) => a.localeCompare(b, "it"));
}

function buildSubcommandFallbackEmbed(query, visibleEntries, context = {}) {
  const normalized = normalizeInvokeLookup(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const queryToken = tokens[0] || "";
  if (!queryToken) return null;

  const permissions = context?.permissions || {};
  const visibleInvokeSet = getVisibleInvokeSet(visibleEntries);

  const prefixCommand = resolvePrefixCommandByToken(
    context?.client,
    queryToken,
  );
  if (prefixCommand) {
    const commandName = String(prefixCommand.name || "")
      .trim()
      .toLowerCase();
    const prefixBase = getPrefixBase(prefixCommand);
    const subcommands = listPrefixSubcommandsForCommand(
      prefixCommand,
      commandName,
      permissions,
    );
    if (subcommands.length) {
      const lines = subcommands.map((sub) => {
        const invoke = `${prefixBase}${commandName} ${sub}`;
        const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
        const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
        const subAliases = extractDirectAliasesForSubcommand(prefixCommand, sub);
        const subAliasPart = subAliases.length ? ` (${subAliases.join(", ")})` : "";
        return `- \`${invoke}\`${subAliasPart} - ${getPrefixSubcommandDescription(prefixCommand, sub)}${lock}`;
      });
      return new EmbedBuilder()
        .setColor(HELP_EMBED_COLOR)
        .setTitle(`Subcommands: ${prefixBase}${commandName}`)
        .setDescription(lines.join("\n"));
    }
  }

  const seen = new Set();
  const slashCommands = [];
  for (const cmd of Array.from(context?.client?.commands?.values?.() || [])) {
    const dataJson = cmd?._helpDataJson || cmd?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const type = dataJson.type || ApplicationCommandType.ChatInput;
    if (type !== ApplicationCommandType.ChatInput) continue;
    const key = `${dataJson.name}:${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slashCommands.push({ cmd, dataJson });
  }
  const slashHit = slashCommands.find(
    ({ dataJson }) =>
      String(dataJson?.name || "")
        .trim()
        .toLowerCase() === queryToken,
  );
  if (slashHit) {
    const commandName = String(slashHit.dataJson.name || "")
      .trim()
      .toLowerCase();
    const options = Array.isArray(slashHit.dataJson.options)
      ? slashHit.dataJson.options
      : [];
    const subLines = [];
    for (const opt of options) {
      if (opt?.type === 1 && opt?.name) {
        const invoke = `/${commandName} ${opt.name}`;
        const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
        const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
        subLines.push(
          `- \`${invoke}\` - ${normalizeDescription(opt.description, "Nessuna descrizione.")}${lock}`,
        );
      }
      if (opt?.type === 2 && Array.isArray(opt.options)) {
        for (const sub of opt.options) {
          if (sub?.type !== 1 || !sub?.name) continue;
          const invoke = `/${commandName} ${opt.name} ${sub.name}`;
          const isVisible = visibleInvokeSet.has(normalizeInvokeLookup(invoke));
          const lock = isVisible ? "" : " *(non accessibile con i tuoi ruoli)*";
          subLines.push(
            `- \`${invoke}\` - ${normalizeDescription(sub.description, "Nessuna descrizione.")}${lock}`,
          );
        }
      }
    }
    if (subLines.length) {
      return new EmbedBuilder()
        .setColor(HELP_EMBED_COLOR)
        .setTitle(`Subcommands: /${commandName}`)
        .setDescription(subLines.join("\n"));
    }
  }

  return null;
}

function buildMiniHelpEmbed(query, entries, context = {}) {
  const detailed = buildDetailedHelpEmbed(query, entries, context);
  if (detailed) return detailed;

  const normalizedQuery = normalizeInvokeLookup(query);
  const matches = entries.filter((entry) => {
    const invoke = normalizeInvokeLookup(entry.invoke);
    if (!invoke) return false;
    const commandToken = invoke.split(" ")[0] || "";
    const baseMatch =
      invoke === normalizedQuery ||
      invoke.startsWith(`${normalizedQuery} `) ||
      commandToken === normalizedQuery;
    if (baseMatch) return true;
    if (entry.type !== "prefix" || !Array.isArray(entry.aliases)) return false;
    return entry.aliases.some(
      (alias) => String(alias || "").toLowerCase() === normalizedQuery,
    );
  });

  if (!matches.length) {
    const fallback = buildSubcommandFallbackEmbed(query, entries, context);
    if (fallback) return fallback;
    return buildMiniHelpNotFoundEmbed(query);
  }

  const limited = matches.slice(0, 20);
  const lines = limited.map((entry) => {
    const categoryKey = String(entry.category || "").toLowerCase();
    const categoryLabel = CATEGORY_LABELS[categoryKey] || categoryKey || "Misc";
    const invokeNorm = normalizeInvokeLookup(entry.invoke);
    const prefixForAlias = entry.prefixBase != null ? String(entry.prefixBase) : "+";
    let aliasList = Array.isArray(entry.aliases) && entry.aliases.length
      ? entry.aliases
          .map((a) => String(a || "").trim())
          .filter((a) => a && normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, "")) !== invokeNorm)
      : [];
    const isTicketCommand = invokeNorm.startsWith("ticket") || String(entry.invoke || "").toLowerCase().startsWith("+ticket");
    if (isTicketCommand && Array.isArray(entry.subAliases) && entry.subAliases.length) {
      const existingNorm = new Set(aliasList.map((a) => normalizeInvokeLookup(prefixForAlias + a.replace(/^[/+]+/, ""))));
      for (const a of entry.subAliases) {
        const s = String(a || "").trim();
        if (!s) continue;
        const norm = normalizeInvokeLookup(prefixForAlias + s.replace(/^[/+]+/, ""));
        if (norm !== invokeNorm && !existingNorm.has(norm)) {
          existingNorm.add(norm);
          aliasList.push(s);
        }
      }
    }
    const aliasPart = aliasList.length
      ? " | " + aliasList.map((a) => "`" + (a.startsWith("+") || a.startsWith("/") ? a : prefixForAlias + a) + "`").join(", ")
      : "";
    const onlyMemberRole =
      Array.isArray(entry.roles) &&
      entry.roles.length === 1 &&
      String(entry.roles[0]) === String(IDs.roles.Member);
    const roleHint =
      Array.isArray(entry.roles) && entry.roles.length > 0 && !onlyMemberRole
        ? `\n  \`Ruolo:\` ${entry.roles.map((id) => `<@&${id}>`).join(", ")}`
        : "";
    return `- \`${entry.invoke}\`${aliasPart} - ${entry.description}\n  \`Categoria:\` ${categoryLabel}${roleHint}`;
  });
  const extra =
    matches.length > limited.length
      ? `\n\n...e altri **${matches.length - limited.length}** risultati.`
      : "";

  return new EmbedBuilder()
    .setColor(HELP_EMBED_COLOR)
    .setTitle(`Mini Help: ${query}`)
    .setDescription(`${lines.join("\n")}${extra}`);
}

module.exports = {
  name: "help",
  allowEmptyArgs: true,
  async execute(message, args, client) {
    if (!message.guild || !message.member) return;
    await message.channel.sendTyping().catch(() => { });

    const permissions = loadPermissions();
    const allEntries = buildEntries(client, permissions);

    const freshMember = await message.guild.members
      .fetch(message.author.id)
      .catch(() => null);
    const resolvedMember = freshMember || message.member;
    const memberRoles = resolvedMember?.roles?.cache || new Map();
    const rolePages = PAGE_ROLE_IDS.filter((roleId) =>
      memberRoles?.has(roleId),
    );
    const hasPartnerManager = Boolean(
      memberRoles?.has?.(IDs.roles.PartnerManager),
    );
    const hasHighStaff = Boolean(memberRoles?.has?.(IDs.roles.HighStaff));
    const hasFounder = Boolean(memberRoles?.has?.(IDs.roles.Founder));
    if (
      !rolePages.includes(IDs.roles.Staff) &&
      (hasPartnerManager || hasHighStaff || hasFounder)
    ) {
      rolePages.push(IDs.roles.Staff);
    }
    const visibleEntriesForQuery = dedupeAndSortEntries(
      allEntries.filter((entry) => canMemberSeeEntry(entry, memberRoles)),
    );

    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    if (query.length) {
      const embed = buildMiniHelpEmbed(query, visibleEntriesForQuery, {
        client,
        permissions,
      });
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }

    const allVisibleEntries = allEntries.filter((entry) =>
      canMemberSeeEntry(entry, memberRoles),
    );
    const sortedVisible = dedupeAndSortEntries(allVisibleEntries);
    const chunks = chunkEntriesByCategory(sortedVisible, HELP_PAGE_SIZE);
    const groupedPages = chunks.map((items, idx) => ({
      roleId: "all",
      items,
      indexLabel: "",
      groupLabel: PAGE_TITLES.all || "Comandi Disponibili",
    }));
    const totalPages = groupedPages.length;
    groupedPages.forEach((page, idx) => {
      page.indexLabel = `${idx + 1}/${totalPages}`;
    });

    if (!groupedPages.length) {
      return safeMessageReply(message, {
        embeds: [buildNoAvailableCommandsEmbed()],
        allowedMentions: NO_REPLY_MENTIONS,
      });
    }

    const initialPageIndex = 0;

    const uniqueToken = `${message.id}_${Date.now()}`;
    const navState = {
      currentIndex: initialPageIndex,
      total: groupedPages.length,
      prevId: `help_prev_${uniqueToken}`,
      nextId: `help_next_${uniqueToken}`,
    };

    const sent = await safeMessageReply(message, {
      components: [buildHelpV2Container(groupedPages[navState.currentIndex], navState)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: NO_REPLY_MENTIONS,
    });
    if (!sent) return;

    const collector = sent.createMessageComponentCollector({
      time: MAX_HELP_COLLECTOR_MS,
      idle: MAX_HELP_COLLECTOR_MS,
    });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction
          .reply({
            content:
              "<:vegax:1443934876440068179> Puoi usare i bottoni solo sul tuo help.",
            flags: PRIVATE_FLAG,
          })
          .catch(() => { });
        return;
      }

      const prevIndex = navState.currentIndex;
      if (
        interaction.customId === navState.prevId &&
        navState.currentIndex > 0
      ) {
        navState.currentIndex -= 1;
      } else if (
        interaction.customId === navState.nextId &&
        navState.currentIndex < navState.total - 1
      ) {
        navState.currentIndex += 1;
      }

      const page = groupedPages[navState.currentIndex];
      const updated = await interaction
        .update({
          components: [buildHelpV2Container(page, navState)],
        })
        .then(() => true)
        .catch(() => false);
      if (!updated) {
        navState.currentIndex = prevIndex;
      }
    });
  },
};
