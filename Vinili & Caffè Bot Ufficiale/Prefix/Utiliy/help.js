const fs = require('fs');
const path = require('path');
const IDs = require('../../Utils/Config/ids');

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandType, ComponentType, MessageFlags } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');
const PERMISSIONS_PATH = path.join(__dirname, '..', '..', 'permissions.json');
const MAX_HELP_COLLECTOR_MS = 24 * 60 * 60 * 1000;
const PAGE_ROLE_IDS = [
  IDs.roles.PartnerManager,
  IDs.roles.Staff
];
const PAGE_TITLES = {
  utente: 'Comandi Utente',
  [IDs.roles.PartnerManager]: 'Comandi Partner Manager',
  [IDs.roles.Staff]: 'Comandi Staff',
  [IDs.roles.HighStaff]: 'Comandi High Staff',
  [IDs.roles.Founder]: 'Comandi Dev'
};
const CATEGORY_LABELS = {
  community: 'Community',
  level: 'Level',
  partner: 'Partner',
  staff: 'Staff',
  vip: 'VIP',
  dev: 'Dev',
  contextmenubuilder: 'Context Menu',
};
const CATEGORY_ORDER = [
  'community',
  'level',
  'partner',
  'staff',
  'vip',
  'dev',
  'contextmenubuilder',
];
const HELP_PAGE_SIZE = 18;
const PREFIX_HELP_DESCRIPTIONS = {
  help: 'Mostra il pannello con tutti i comandi disponibili in base ai tuoi ruoli.',
  afk: 'Imposta il tuo stato AFK con un messaggio personalizzato.',
  avatar: 'Mostra l\'avatar server di un utente.',
  banner: 'Mostra il banner profilo di un utente.',
  block: 'Blocca privacy contenuti: avatar, banner, quotes.',
  invites: 'Mostra le statistiche inviti del server o di un utente.',
  membercount: 'Mostra il numero totale di membri del server.',
  'no-dm': 'Attiva/disattiva il blocco DM per gli annunci dello staff.',
  ping: 'Mostra latenza bot, database e informazioni di uptime.',
  set: 'Impostazioni bot TTS: voice.',
  ship: 'Calcola la compatibilità tra due utenti.',
  snipe: 'Recupera l\'ultimo messaggio eliminato nel canale.',
  join: 'Fa entrare il bot nel tuo canale vocale.',
  leave: 'Fa uscire il bot dal canale vocale.',
  unblock: 'Sblocca privacy contenuti: avatar, banner, quotes.',
  classifica: 'Mostra la classifica livelli (totale/settimanale).',
  mstats: 'Mostra statistiche minigiochi di un utente.',
  me: 'Mostra la tua attività settimanale.',
  top: 'Mostra classifiche del server: text, voc, invites.',
  rank: 'Mostra livello, exp e posizione in classifica di un utente.',
  reaction: 'Gestisce reaction menzioni e autoresponder con parole/frasi trigger.',
  description: 'Manda la descrizione del server direttamente nel ticket.',
  addlevel: 'Aggiunge livelli/exp a un utente.',
  gmulti: 'Gestisce il moltiplicatore globale exp.',
  'no-dm-list': 'Mostra la lista utenti con blocco DM attivo.',
  purge: 'Elimina messaggi da un canale.',
  recensione: 'Premia una recensione assegnando livelli.',
  removelevel: 'Rimuove livelli/exp da un utente.',
  reviewlock: 'Blocca o sblocca premio recensione per un utente.',
  ticket: 'Gestisce i ticket.',
  verify: 'Gestisce il flusso di verifica utenti.',  
  customregister: 'Registra retroattivamente custom role/vocale già esistenti.',
  customroleadd: 'Aggiunge utenti al tuo ruolo personalizzato.',
  customrolecreate: 'Crea il tuo ruolo personalizzato.',
  customrolemodify: 'Apre il pannello di modifica del ruolo personalizzato.',
  customroleremove: 'Rimuove utenti dal tuo ruolo personalizzato.',
  customvoc: 'Crea e gestisce la tua vocale privata personalizzata.',
  quote: 'Genera una quote grafica da un messaggio.'
};
const PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS = {
  'level.set': 'Imposta EXP o livello a un valore preciso per un utente.',
  'level.add': 'Aggiunge EXP a un utente.',
  'level.remove': 'Rimuove EXP da un utente.',
  'level.reset': 'Azzera EXP e livello di un utente.',
  'level.lock': 'Blocca il guadagno EXP in un canale.',
  'level.unlock': 'Sblocca il guadagno EXP in un canale.',
  'level.multiplier': 'Imposta un moltiplicatore EXP temporaneo.',
  'level.ignore': 'Esclude un ruolo dal guadagno EXP.',
  'level.unignore': 'Riabilita un ruolo al guadagno EXP.',
  'ticket.add': 'Aggiunge uno o più utenti al ticket corrente.',
  'ticket.remove': 'Rimuove uno o più utenti dal ticket corrente.',
  'ticket.closerequest': 'Invia richiesta di chiusura ticket.',
  'ticket.close': 'Chiude il ticket corrente.',
  'ticket.claim': 'Assegna il ticket a te.',
  'ticket.unclaim': 'Rimuove la presa in carico del ticket.',
  'ticket.switchpanel': 'Sposta il ticket a un pannello differente.',
  'ticket.rename': 'Rinomina il canale ticket.',
  'block.avatar': 'Blocca la visualizzazione del tuo avatar.',
  'block.banner': 'Blocca la visualizzazione del tuo banner.',
  'block.quotes': 'Blocca la creazione di quote dei tuoi messaggi.',
  'unblock.avatar': 'Sblocca la visualizzazione del tuo avatar.',
  'unblock.banner': 'Sblocca la visualizzazione del tuo banner.',
  'unblock.quotes': 'Sblocca la creazione di quote dei tuoi messaggi.',
  'classifica.alltime': 'Mostra la classifica generale livelli/exp.',
  'classifica.weekly': 'Mostra la classifica settimanale exp.',
  'set.autojoin': 'Attiva o disattiva autojoin TTS.',
  'set.voice': 'Imposta la lingua TTS personale.',
  'top.text': 'Mostra la classifica utenti per messaggi testuali.',
  'top.voc': 'Mostra la classifica utenti per attività vocale.',
  'top.invites': 'Mostra la classifica utenti per inviti.'
};
const CONTEXT_HELP_DESCRIPTIONS = {
  Partnership: 'Apre il modal partnership partendo dal messaggio selezionato.',
};
const CONTEXT_CATEGORY_OVERRIDES = {
  partnership: 'partner'
};


function resolveRoleReference(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{16,20}$/.test(raw)) return raw;

  let key = raw;
  if (key.startsWith('ids.roles.')) key = key.slice('ids.roles.'.length);
  else if (key.startsWith('roles.')) key = key.slice('roles.'.length);

  const resolved = IDs?.roles?.[key];
  if (!resolved) return null;
  return String(resolved);
}

function normalizeRoleList(roleIds) {
  if (!Array.isArray(roleIds)) return roleIds;
  return roleIds
    .map((value) => resolveRoleReference(value))
    .filter(Boolean);
}

function normalizePermissionTree(node) {
  if (Array.isArray(node)) return normalizeRoleList(node);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = normalizePermissionTree(value);
  }
  return out;
}

function loadPermissions() {
  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) return { slash: {}, prefix: {} };
    const raw = fs.readFileSync(PERMISSIONS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      slash: normalizePermissionTree(parsed?.slash || {}),
      prefix: normalizePermissionTree(parsed?.prefix || {})
    };
  } catch {
    return { slash: {}, prefix: {} };
  }
}

function normalizeDescription(text, fallback = 'Nessuna descrizione disponibile.') {
  const value = String(text || '').trim();
  return value.length ? value : fallback;
}

function getPrefixDescription(command) {
  const commandName = String(command?.name || '').toLowerCase();
  if (PREFIX_HELP_DESCRIPTIONS[commandName]) {
    return PREFIX_HELP_DESCRIPTIONS[commandName];
  }
  return normalizeDescription(
    command?.description || command?.desc || command?.help || command?.usage,
    'Comando prefix.'
  );
}

function prettifySubcommandName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'subcommand';
  return raw
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPrefixSubcommandDescription(commandName, subcommandName) {
  const key = `${String(commandName || '').toLowerCase()}.${String(subcommandName || '').toLowerCase()}`;
  if (PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key]) {
    return PREFIX_SUBCOMMAND_HELP_DESCRIPTIONS[key];
  }
  const pretty = prettifySubcommandName(subcommandName);
  return `Subcommand \`${pretty}\` di \`+${String(commandName || '').toLowerCase()}\`.`;
}

function getPrefixBase(command) {
  const override = String(command?.prefixOverride || '').trim();
  return override || '+';
}

function normalizeCategoryKey(value) {
  const key = String(value || 'misc').toLowerCase();
  if (key === 'admin') return 'dev';
  return key;
}

function resolveContextCategory(command, dataJson) {
  const contextName = String(dataJson?.name || '').trim().toLowerCase();
  if (contextName && CONTEXT_CATEGORY_OVERRIDES[contextName]) {
    return normalizeCategoryKey(CONTEXT_CATEGORY_OVERRIDES[contextName]);
  }
  return normalizeCategoryKey(command?.category || 'contextmenubuilder');
}

function extractPrefixSubcommands(command) {
  const meta = Array.isArray(command?.subcommands)
    ? command.subcommands.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (meta.length) return Array.from(new Set(meta));

  const src = String(command?.execute || '');
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
  const mapped = command?.subcommandAliases && typeof command.subcommandAliases === 'object'
    ? command.subcommandAliases
    : {};
  const declaredAliases = Array.isArray(command?.aliases)
    ? new Set(command.aliases.map((alias) => String(alias || '').trim().toLowerCase()).filter(Boolean))
    : null;
  const out = [];

  for (const [alias, target] of Object.entries(mapped)) {
    const normalizedAlias = String(alias || '').trim().toLowerCase();
    const normalizedTarget = String(target || '').trim().toLowerCase();
    if (!normalizedAlias || !normalizedTarget) continue;
    if (normalizedTarget !== subcommandName) continue;
    if (declaredAliases && !declaredAliases.has(normalizedAlias)) continue;
    out.push(normalizedAlias);
  }

  return Array.from(new Set(out));
}

function getSlashTopLevelDescription(dataJson) {
  return normalizeDescription(dataJson?.description, 'Comando slash.');
}

function getSubcommandEntries(commandName, dataJson, permissionConfig, commandType, category) {
  const entries = [];
  const options = Array.isArray(dataJson?.options) ? dataJson.options : [];
  if (commandType !== ApplicationCommandType.ChatInput) return entries;

  const subPermissions = permissionConfig?.subcommands || {};
  const commandRoles = Array.isArray(permissionConfig?.roles) ? permissionConfig.roles : null;
  const topDesc = getSlashTopLevelDescription(dataJson);

  const parseSubOption = (subOption, groupName = null) => {
    if (!subOption?.name) return;
    const subName = subOption.name;
    const key = groupName ? `${groupName}.${subName}` : subName;
    const allowedRoles = Object.prototype.hasOwnProperty.call(subPermissions, key)
      ? subPermissions[key]
      : commandRoles;
    const roleList = Array.isArray(allowedRoles) ? allowedRoles : null;

    entries.push({
      invoke: `/${groupName ? `${commandName} ${groupName} ${subName}` : `${commandName} ${subName}`}`,
      type: 'slash',
      description: normalizeDescription(subOption.description, topDesc),
      category: normalizeCategoryKey(category),
      roles: roleList
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
    const subcommandRoles = perm && typeof perm === 'object' && !Array.isArray(perm)
      ? (perm.subcommands || {})
      : {};
    const aliases = Array.isArray(command.aliases)
      ? command.aliases.filter((alias) => typeof alias === 'string' && alias.trim().length)
      : [];
    const prefixBase = getPrefixBase(command);
    const base = {
      type: 'prefix',
      description: getPrefixDescription(command),
      aliases,
      prefixBase,
      category: normalizeCategoryKey(command.folder || 'misc'),
      roles: commandRoles
    };

    const subcommands = Array.from(new Set([
      ...extractPrefixSubcommands(command),
      ...Object.keys(subcommandRoles || {}).map((key) => String(key || '').trim().toLowerCase()).filter(Boolean)
    ]));
    if (subcommands.length) {
      for (const sub of subcommands) {
        entries.push({
          ...base,
          invoke: `${prefixBase}${command.name} ${sub}`,
          description: getPrefixSubcommandDescription(command.name, sub, base.description),
          roles: Array.isArray(subcommandRoles[sub]) ? subcommandRoles[sub] : commandRoles,
          aliases: extractDirectAliasesForSubcommand(command, sub)
        });
      }
    } else {
      entries.push({
        ...base,
        invoke: `${prefixBase}${command.name}`
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
    const category = normalizeCategoryKey(command?.category || 'misc');
    const hasSubcommands = Array.isArray(dataJson.options)
      && dataJson.options.some((opt) => opt?.type === 1 || opt?.type === 2);

    if (hasSubcommands) {
      entries.push(...getSubcommandEntries(dataJson.name, dataJson, perm, commandType, category));
      continue;
    }

    const roles = Array.isArray(perm) ? perm : (Array.isArray(perm?.roles) ? perm.roles : null);
    entries.push({
      invoke: `/${dataJson.name}`,
      type: 'slash',
      description: getSlashTopLevelDescription(dataJson),
      category,
      roles
    });
  }

  for (const command of client.commands.values()) {
    const dataJson = command?.data?.toJSON?.();
    if (!dataJson?.name) continue;
    const commandType = dataJson.type || ApplicationCommandType.ChatInput;
    if (commandType !== ApplicationCommandType.User && commandType !== ApplicationCommandType.Message) continue;

    const perm = permissions.slash?.[dataJson.name];
    const roles = Array.isArray(perm) ? perm : (Array.isArray(perm?.roles) ? perm.roles : null);

    entries.push({
      invoke: `${dataJson.name}`,
      type: 'context',
      description: CONTEXT_HELP_DESCRIPTIONS[dataJson.name]
        || `Comando context (${commandType === ApplicationCommandType.User ? 'utente' : 'messaggio'}).`,
      category: resolveContextCategory(command, dataJson),
      roles
    });
  }

  const dedupe = new Map();
  for (const entry of entries) {
    if (String(entry?.category || '').toLowerCase() === 'misc') continue;
    const roleKey = Array.isArray(entry.roles) ? entry.roles.slice().sort().join(',') : 'utente';
    const key = `${entry.type}:${entry.invoke}:${roleKey}`;
    if (!dedupe.has(key)) dedupe.set(key, entry);
  }

  const getCategoryIndex = (entry) => {
    const key = String(entry?.category || 'misc').toLowerCase();
    const idx = CATEGORY_ORDER.indexOf(key);
    return idx === -1 ? CATEGORY_ORDER.length : idx;
  };

  return Array.from(dedupe.values()).sort((a, b) => {
    const catCmp = getCategoryIndex(a) - getCategoryIndex(b);
    if (catCmp !== 0) return catCmp;
    return a.invoke.localeCompare(b.invoke, 'it');
  });
}

function hasAnyRole(memberRoles, roleIds) {
  if (!memberRoles || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roleIds.some((roleId) => memberRoles.has(roleId));
}

function filterByPage(entries, pageRoleId, memberRoles) {
  if (pageRoleId === 'utente') {
    return entries.filter((entry) => {
      if (!Array.isArray(entry.roles) || !entry.roles.length) return true;
      const category = String(entry.category || '').toLowerCase();
      const isVipCategory = category === 'vip';
      const hasMemberRoleRequirement = entry.roles.includes(IDs.roles.Member);

      if (hasMemberRoleRequirement) return hasAnyRole(memberRoles, entry.roles);
      if (isVipCategory) return hasAnyRole(memberRoles, entry.roles);
      return false;
    });
  }
  if (pageRoleId === IDs.roles.Staff) {
    const hasStaff = Boolean(memberRoles?.has?.(IDs.roles.Staff));
    const hasHighStaff = Boolean(memberRoles?.has?.(IDs.roles.HighStaff));
    const hasFounder = Boolean(memberRoles?.has?.(IDs.roles.Founder));
    return entries.filter((entry) => {
      if (!Array.isArray(entry.roles) || !entry.roles.length) return false;
      if (hasStaff && entry.roles.includes(IDs.roles.Staff)) return true;
      if (hasHighStaff && entry.roles.includes(IDs.roles.HighStaff)) return true;
      if (hasFounder && entry.roles.includes(IDs.roles.Founder)) return true;
      return false;
    });
  }
  return entries.filter((entry) => Array.isArray(entry.roles) && entry.roles.includes(pageRoleId));
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
    const key = String(entry.category || 'misc').toLowerCase();
    if (key === 'misc') continue;
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
    const categoryEntries = grouped.get(categoryKey) || [];
    const categoryLabel = CATEGORY_LABELS[categoryKey] || (categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1));
    const rows = categoryEntries.map((entry) => {
      const aliasText = entry.type === 'prefix' && Array.isArray(entry.aliases) && entry.aliases.length
        ? ` (alias: ${entry.aliases.map((alias) => `${entry.prefixBase || '+'}${alias}`).join(', ')})`
        : '';
      return `┃ \`${entry.invoke}\` - ${entry.description}${aliasText}`;
    });
    sections.push(`✨ **${categoryLabel}**\n${rows.join('\n')}`);
  }

  return page.items.length
    ? [
      '## 📜 Comandi Disponibili',
      '',
      `### ${PAGE_TITLES[page.roleId] || 'Comandi'}`,
      '',
      'Ecco la lista dei comandi disponibili.',
      'Usa il prefix, slash o context menu in base al comando.',
      '',
      sections.join('\n\n'),
      '',
      `**Pagina ${page.indexLabel}**`
    ].join('\n')
    : '<:vegax:1443934876440068179> Nessun comando disponibile in questa pagina.';
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
      .setDisabled(state.currentIndex >= state.total - 1)
  );
}

function buildHelpV2Container(page, navState) {
  return {
    type: ComponentType.Container,
    accentColor: 0x6f4e37,
    components: [
      {
        type: ComponentType.TextDisplay,
        content: renderPageText(page)
      },
      buildNavigationRow(navState).toJSON()
    ]
  };
}

module.exports = {
  name: 'help',

  async execute(message, _args, client) {
    await message.channel.sendTyping().catch(() => {});

    const permissions = loadPermissions();
    const allEntries = buildEntries(client, permissions);

    const memberRoles = message.member?.roles?.cache;
    const rolePages = PAGE_ROLE_IDS.filter((roleId) => memberRoles?.has(roleId));
    const hasHighStaff = Boolean(memberRoles?.has?.(IDs.roles.HighStaff));
    const hasFounder = Boolean(memberRoles?.has?.(IDs.roles.Founder));
    if (!rolePages.includes(IDs.roles.Staff) && (hasHighStaff || hasFounder)) {
      rolePages.push(IDs.roles.Staff);
    }
    const visibleRoleIds = ['utente', ...rolePages];

    const groupedPages = [];
    for (const roleId of visibleRoleIds) {
      const filtered = filterByPage(allEntries, roleId, memberRoles);
      const roleChunks = chunkEntries(filtered, HELP_PAGE_SIZE);
      roleChunks.forEach((items, idx) => {
        groupedPages.push({
          roleId,
          items,
          indexLabel: `${idx + 1}/${roleChunks.length}`,
          groupLabel: PAGE_TITLES[roleId] || roleId
        });
      });
    }

    if (!groupedPages.length) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Nessun comando disponibile.')
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    const uniqueToken = `${message.id}_${Date.now()}`;
    const navState = {
      currentIndex: 0,
      total: groupedPages.length,
      prevId: `help_prev_${uniqueToken}`,
      nextId: `help_next_${uniqueToken}`
    };

    const sent = await safeMessageReply(message, {
      components: [
        buildHelpV2Container(groupedPages[0], navState)
      ],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { repliedUser: false }
    });
    if (!sent) return;

    const collector = sent.createMessageComponentCollector({
      time: MAX_HELP_COLLECTOR_MS,
      idle: MAX_HELP_COLLECTOR_MS
    });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: '<:vegax:1443934876440068179> Puoi usare i bottoni solo sul tuo help.',
          flags: 1 << 6
        }).catch(() => {});
        return;
      }

      if (interaction.customId === navState.prevId && navState.currentIndex > 0) {
        navState.currentIndex -= 1;
      } else if (interaction.customId === navState.nextId && navState.currentIndex < navState.total - 1) {
        navState.currentIndex += 1;
      }

      const page = groupedPages[navState.currentIndex];
      await interaction.update({
        components: [
          buildHelpV2Container(page, navState)
        ]
      }).catch(() => {});
    });
  }
};
