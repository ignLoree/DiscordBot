const fs = require("fs");
const path = require("path");
const IDs = require("../../Utils/Config/ids");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationCommandType,
  ComponentType,
  MessageFlags,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const PERMISSIONS_PATH = path.join(__dirname, "..", "..", "permissions.json");
const MAX_HELP_COLLECTOR_MS = 24 * 60 * 60 * 1000;
const HELP_EMBED_COLOR = "#6f4e37";
const ERROR_EMBED_COLOR = "Red";
const PRIVATE_FLAG = 1 << 6;
const NO_REPLY_MENTIONS = { repliedUser: false };
const PAGE_ROLE_IDS = [IDs.roles.Staff];
const PAGE_TITLES = {
  utente: "Comandi Utente",
  [IDs.roles.Staff]: "Comandi Staff",
  [IDs.roles.HighStaff]: "Comandi High Staff",
  [IDs.roles.Founder]: "Comandi Dev",
};
const CATEGORY_LABELS = {
  utility: "Utility",
  community: "Community",
  tts: "TTS",
  level: "Level",
  minigames: "Minigames",
  stats: "Stats",
  partner: "Partner",
  staff: "Staff",
  vip: "VIP",
  dev: "Dev",
  contextmenubuilder: "Context Menu",
};
const CATEGORY_ORDER = [
  "utility",
  "community",
  "tts",
  "level",
  "minigames",
  "stats",
  "partner",
  "staff",
  "vip",
  "dev",
  "contextmenubuilder",
];
const HELP_PAGE_SIZE = 18;
const PREFIX_HELP_DESCRIPTIONS = {
  help: "Mostra il pannello con tutti i comandi disponibili in base ai tuoi ruoli.",
  afk: "Imposta il tuo stato AFK con un messaggio personalizzato.",
  avatar:
    "Mostra l'avatar di un utente (get/server/user) o l'icona del server (guild).",
  banner: "Mostra il banner di un utente o del server (server/guild).",
  block: "Blocca privacy contenuti: avatar, banner, quotes.",
  invites: "Mostra le statistiche inviti del server o di un utente.",
  languages: "Mostra le lingue TTS disponibili per il comando set voice.",
  membercount: "Mostra il numero totale di membri del server.",
  "no-dm": "Disattiva i DM automatici (`+dm-disable`).",
  "dm-enable": "Riattiva i DM automatici (`+dm-enable`).",
  ping: "Mostra latenza bot, database e informazioni di uptime.",
  set: "Impostazioni bot TTS: voice.",
  ship: "Calcola la compatibilità tra due utenti.",
  snipe: "Recupera l'ultimo messaggio eliminato nel canale.",
  join: "Fa entrare il bot nel tuo canale vocale.",
  leave: "Fa uscire il bot dal canale vocale.",
  unblock: "Sblocca privacy contenuti: avatar, banner, quotes.",
  classifica: "Mostra la classifica livelli (totale/settimanale).",
  mstats: "Mostra statistiche minigiochi di un utente.",
  me: "Mostra le tue statistiche attività (1d/7d/14d/21d/30d) con refresh live.",
  server:
    "Mostra statistiche server (1d/7d/14d/21d/30d), top e grafici con aggiornamento live.",
  top: "Mostra la top completa utenti/canali (testo+vocale) con canvas, refresh e periodo.",
  rank: "Mostra livello, exp e posizione in classifica di un utente.",
  reaction:
    "Gestisce reaction menzioni e autoresponder con parole/frasi trigger.",
  description: "Manda la descrizione del server direttamente nel ticket.",
  addlevel: "Aggiunge livelli/exp a un utente.",
  gmulti: "Gestisce il moltiplicatore globale exp.",
  "no-dm-list": "Mostra la lista utenti con blocco DM attivo.",
  purge: "Elimina messaggi da un canale.",
  recensione: "Premia una recensione assegnando livelli.",
  removelevel: "Rimuove livelli/exp da un utente.",
  reviewlock: "Blocca o sblocca premio recensione per un utente.",
  ticket: "Gestisce i ticket.",
  verify: "Gestisce il flusso di verifica utenti.",
  restart:
    "Riavvia il bot o ricarica moduli specifici (handlers, commands, prefix, events, triggers, services, utils, schemas).",
  perm: "Gestisce permessi temporanei e whitelist canali per comando.",
  temprole: "Gestisce assegnazioni di ruoli temporanei ad utenti.",
  smartembed: "Crea un embed intelligente spostando i ping fuori dall'embed.",
  customregister: "Registra retroattivamente custom role/vocale già esistenti.",
  level:
    "Gestisce il sistema livelli: set, add, remove, reset, lock, unlock, multiplier, ignore, unignore.",
  customrole: "Gestisce il custom role: create, modify, add, remove.",
  customvoc:
    "Crea e gestisce la tua vocale privata (anche temporanea: es. `+customvoc 2w`).",
  quote: "Genera una quote grafica da un messaggio.",
};
const PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS = {
  "level.set": "Imposta EXP o livello a un valore preciso per un utente.",
  "level.add": "Aggiunge EXP a un utente.",
  "level.remove": "Rimuove EXP da un utente.",
  "level.reset": "Azzera EXP e livello di un utente.",
  "level.lock": "Blocca il guadagno EXP in un canale.",
  "level.unlock": "Sblocca il guadagno EXP in un canale.",
  "level.multiplier": "Imposta un moltiplicatore EXP temporaneo.",
  "level.ignore": "Esclude un ruolo dal guadagno EXP.",
  "level.unignore": "Riabilita un ruolo al guadagno EXP.",
  "ticket.add": "Aggiunge uno o più utenti al ticket corrente.",
  "ticket.remove": "Rimuove uno o più utenti dal ticket corrente.",
  "ticket.closerequest": "Invia richiesta di chiusura ticket.",
  "ticket.close": "Chiude il ticket corrente.",
  "ticket.claim": "Assegna il ticket a te.",
  "ticket.unclaim": "Rimuove la presa in carico del ticket.",
  "ticket.switchpanel": "Sposta il ticket a un pannello differente.",
  "ticket.rename": "Rinomina il canale ticket.",
  "avatar.get": "Avatar globale dell'utente (default).",
  "avatar.server": "Avatar dell'utente solo in questo server.",
  "avatar.user": "Avatar globale dell'utente.",
  "avatar.guild": "Icona del server.",
  "banner.user": "Banner profilo dell'utente (default).",
  "banner.server": "Banner del server.",
  "banner.guild": "Banner del server.",
  "block.avatar": "Blocca la visualizzazione del tuo avatar.",
  "block.banner": "Blocca la visualizzazione del tuo banner.",
  "block.quotes": "Blocca la creazione di quote dei tuoi messaggi.",
  "unblock.avatar": "Sblocca la visualizzazione del tuo avatar.",
  "unblock.banner": "Sblocca la visualizzazione del tuo banner.",
  "unblock.quotes": "Sblocca la creazione di quote dei tuoi messaggi.",
  "classifica.alltime": "Mostra la classifica generale livelli/exp.",
  "classifica.weekly": "Mostra la classifica settimanale exp.",
  "set.autojoin": "Attiva o disattiva autojoin TTS.",
  "set.voice": "Imposta la lingua TTS personale.",
  "perm.grant":
    "Assegna permessi temporanei ad un utente su uno o più comandi.",
  "perm.revoke": "Revoca permessi temporanei specifici ad un utente.",
  "perm.list": "Mostra i permessi temporanei attivi di un utente.",
  "perm.clear": "Rimuove tutti i permessi temporanei di un utente.",
  "perm.channel-set": "Imposta i canali consentiti per un comando.",
  "perm.channel-add": "Aggiunge canali consentiti ad un comando.",
  "perm.channel-remove": "Rimuove canali dalla whitelist di un comando.",
  "perm.channel-clear": "Rimuove la restrizione canali di un comando.",
  "perm.channel-list": "Mostra le whitelist canali configurate.",
  "temprole.grant": "Assegna un ruolo ad un utente per una durata temporanea.",
  "temprole.revoke": "Revoca una singola assegnazione di ruolo temporaneo.",
  "temprole.list": "Mostra i ruoli temporanei attivi di un utente.",
  "temprole.clear":
    "Rimuove tutte le assegnazioni di ruoli temporanei di un utente.",
  "customrole.create":
    "Crea o aggiorna il tuo ruolo personalizzato (durata opzionale).",
  "customrole.modify":
    "Apre il pannello di modifica del tuo ruolo personalizzato.",
  "customrole.add":
    "Aggiunge un utente al tuo ruolo personalizzato (con richiesta DM).",
  "customrole.remove": "Rimuove un utente dal tuo ruolo personalizzato.",
};
const CONTEXT_HELP_DESCRIPTIONS = {
  Partnership: "Apre il modal partnership partendo dal messaggio selezionato.",
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
  return normalizeDescription(
    command?.description || command?.desc || command?.help || command?.usage,
    "Comando prefix.",
  );
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
  const pretty = prettifySubcommandName(subcommandName);
  return `Subcommand \`${pretty}\` di \`+${String(commandName || "").toLowerCase()}\`.`;
}

function getPrefixBase(command) {
  const override = String(command?.prefixOverride || "").trim();
  return override || "+";
}

function normalizeCategoryKey(value) {
  const key = String(value || "misc").toLowerCase();
  if (key === "admin") return "dev";
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
  const meta = Array.isArray(command?.subcommands)
    ? command.subcommands
        .map((s) =>
          String(s || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
    : [];
  if (meta.length) return Array.from(new Set(meta));

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

  return Array.from(found.values());
}

function extractDirectAliasesForSubcommand(command, subcommandName) {
  const mapped =
    command?.subcommandAliases && typeof command.subcommandAliases === "object"
      ? command.subcommandAliases
      : {};
  const declaredAliases = Array.isArray(command?.aliases)
    ? new Set(
        command.aliases
          .map((alias) =>
            String(alias || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      )
    : null;
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
    if (declaredAliases && !declaredAliases.has(normalizedAlias)) continue;
    out.push(normalizedAlias);
  }

  return Array.from(new Set(out));
}

function getSlashTopLevelDescription(dataJson) {
  return normalizeDescription(dataJson?.description, "Comando slash.");
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
  const commandRoles = Array.isArray(permissionConfig?.roles)
    ? permissionConfig.roles
    : null;
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
    const roleList = Array.isArray(allowedRoles) ? allowedRoles : null;

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

    const subcommands = Array.from(
      new Set([
        ...extractPrefixSubcommands(command),
        ...Object.keys(subcommandRoles || {})
          .map((key) =>
            String(key || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ]),
    );
    if (subcommands.length) {
      for (const sub of subcommands) {
        entries.push({
          ...base,
          invoke: `${prefixBase}${command.name} ${sub}`,
          description: getPrefixSubcommandDescription(command, sub),
          roles: Array.isArray(subcommandRoles[sub])
            ? subcommandRoles[sub]
            : commandRoles,
          aliases: extractDirectAliasesForSubcommand(command, sub),
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
    const dataJson = command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (commandType !== ApplicationCommandType.ChatInput) continue;

    const uniqueKey = `${dataJson.name}:${commandType}`;
    if (seenSlash.has(uniqueKey)) continue;
    seenSlash.add(uniqueKey);

    const perm = permissions.slash?.[dataJson.name];
    const category = normalizeCategoryKey(command?.category || "misc");
    const hasSubcommands =
      Array.isArray(dataJson.options) &&
      dataJson.options.some((opt) => opt?.type === 1 || opt?.type === 2);

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

    const roles = Array.isArray(perm)
      ? perm
      : Array.isArray(perm?.roles)
        ? perm.roles
        : null;
    entries.push({
      invoke: `/${dataJson.name}`,
      type: "slash",
      description: getSlashTopLevelDescription(dataJson),
      category,
      roles,
    });
  }

  for (const command of client.commands.values()) {
    const dataJson = command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (
      commandType !== ApplicationCommandType.User &&
      commandType !== ApplicationCommandType.Message
    )
      continue;

    const perm = permissions.slash?.[dataJson.name];
    const roles = Array.isArray(perm)
      ? perm
      : Array.isArray(perm?.roles)
        ? perm.roles
        : null;

    entries.push({
      invoke: `${dataJson.name}`,
      type: "context",
      description:
        CONTEXT_HELP_DESCRIPTIONS[dataJson.name] ||
        `Comando context (${commandType === ApplicationCommandType.User ? "utente" : "messaggio"}).`,
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

function filterByPage(entries, pageRoleId, memberRoles) {
  if (pageRoleId === "utente") {
    return entries.filter((entry) => {
      if (!Array.isArray(entry.roles) || !entry.roles.length) return true;
      const category = String(entry.category || "").toLowerCase();
      const isVipCategory = category === "vip";
      const hasMemberRoleRequirement = entry.roles.includes(IDs.roles.Member);

      if (hasMemberRoleRequirement) return hasAnyRole(memberRoles, entry.roles);
      if (isVipCategory) return hasAnyRole(memberRoles, entry.roles);
      return false;
    });
  }
  if (pageRoleId === IDs.roles.Staff) {
    const hasPartnerManager = Boolean(
      memberRoles?.has?.(IDs.roles.PartnerManager),
    );
    const hasStaff = Boolean(memberRoles?.has?.(IDs.roles.Staff));
    const hasHighStaff = Boolean(memberRoles?.has?.(IDs.roles.HighStaff));
    const hasFounder = Boolean(memberRoles?.has?.(IDs.roles.Founder));
    return entries.filter((entry) => {
      if (!Array.isArray(entry.roles) || !entry.roles.length) return false;
      if (hasPartnerManager && entry.roles.includes(IDs.roles.PartnerManager))
        return true;
      if (hasStaff && entry.roles.includes(IDs.roles.Staff)) return true;
      if (hasHighStaff && entry.roles.includes(IDs.roles.HighStaff))
        return true;
      if (hasFounder && entry.roles.includes(IDs.roles.Founder)) return true;
      return false;
    });
  }
  return entries.filter(
    (entry) => Array.isArray(entry.roles) && entry.roles.includes(pageRoleId),
  );
}

function chunkEntries(entries, size) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(entries.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
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
      const aliasText =
        entry.type === "prefix" &&
        Array.isArray(entry.aliases) &&
        entry.aliases.length
          ? ` (alias: ${entry.aliases.map((alias) => `${entry.prefixBase || "+"}${alias}`).join(", ")})`
          : "";
      return `- \`${entry.invoke}\` - ${entry.description}${aliasText}`;
    });
    sections.push(`**${categoryLabel}**\n${rows.join("\n")}`);
  }

  return page.items.length
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
  return {
    type: ComponentType.Container,
    accentColor: 0x6f4e37,
    components: [
      {
        type: ComponentType.TextDisplay,
        content: renderPageText(page),
      },
      buildNavigationRow(navState).toJSON(),
    ],
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
    const aliasesForSub = extractDirectAliasesForSubcommand(command, subName);
    subLines.push(
      `- \`${prefixBase}${commandName} ${subName}\` - ${entry.description}`,
    );
    if (aliasesForSub.length) {
      subLines.push(
        `  Alias: ${aliasesForSub.map((alias) => `\`${prefixBase}${commandName} ${alias}\``).join(", ")}`,
      );
    }
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
      subLines.push(
        `- \`${invoke}\` - ${getPrefixSubcommandDescription(command, sub)}${lock}`,
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
    const dataJson = cmd?.data?.toJSON?.();
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
  const permConfig = getPrefixPermissionConfig(permissions, commandName);
  const fromPerms = Object.keys(permConfig.subcommands || {})
    .map((key) =>
      String(key || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
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
      ...fromPerms,
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
        return `- \`${invoke}\` - ${getPrefixSubcommandDescription(prefixCommand, sub)}${lock}`;
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
    const dataJson = cmd?.data?.toJSON?.();
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
    return `- \`${entry.invoke}\` - ${entry.description}\n  \`Categoria:\` ${categoryLabel}`;
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

  async execute(message, args, client) {
    if (!message.guild || !message.member) return;
    await message.channel.sendTyping().catch(() => {});

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
    const visibleRoleIds = ["utente", ...rolePages];
    const visibleEntries = dedupeAndSortEntries(
      visibleRoleIds.flatMap((roleId) =>
        filterByPage(allEntries, roleId, memberRoles),
      ),
    );

    const query = Array.isArray(args) ? args.join(" ").trim() : "";
    if (query.length) {
      const embed = buildMiniHelpEmbed(query, visibleEntries, {
        client,
        permissions,
      });
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }

    const groupedPages = [];
    for (const roleId of visibleRoleIds) {
      const filtered = filterByPage(allEntries, roleId, memberRoles);
      const roleChunks = chunkEntries(filtered, HELP_PAGE_SIZE);
      roleChunks.forEach((items, idx) => {
        groupedPages.push({
          roleId,
          items,
          indexLabel: `${idx + 1}/${roleChunks.length}`,
          groupLabel: PAGE_TITLES[roleId] || roleId,
        });
      });
    }

    if (!groupedPages.length) {
      return safeMessageReply(message, {
        embeds: [buildNoAvailableCommandsEmbed()],
        allowedMentions: NO_REPLY_MENTIONS,
      });
    }

    const uniqueToken = `${message.id}_${Date.now()}`;
    const navState = {
      currentIndex: 0,
      total: groupedPages.length,
      prevId: `help_prev_${uniqueToken}`,
      nextId: `help_next_${uniqueToken}`,
    };

    const sent = await safeMessageReply(message, {
      components: [buildHelpV2Container(groupedPages[0], navState)],
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
          .catch(() => {});
        return;
      }

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
      await interaction
        .update({
          components: [buildHelpV2Container(page, navState)],
        })
        .catch(() => {});
    });
  },
};

