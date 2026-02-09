const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandType } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');

const PERMISSIONS_PATH = path.join(process.cwd(), 'permissions.json');
const PAGE_ROLE_IDS = [
  '1442568905582317740',
  '1442568910070349985',
  '1442568894349840435',
  '1442568886988963923'
];
const PAGE_TITLES = {
  utente: 'Comandi Utente',
  '1442568905582317740': 'Comandi Partner Manager',
  '1442568910070349985': 'Comandi Staff',
  '1442568894349840435': 'Comandi High Staff',
  '1442568886988963923': 'Comandi Dev'
};
const CATEGORY_LABELS = {
  community: 'Community',
  level: 'Level',
  partner: 'Partner',
  staff: 'Staff',
  vip: 'VIP',
  admin: 'Dev',
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

function loadPermissions() {
  try {
    if (!fs.existsSync(PERMISSIONS_PATH)) return { slash: {}, prefix: {} };
    const raw = fs.readFileSync(PERMISSIONS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      slash: parsed?.slash || {},
      prefix: parsed?.prefix || {}
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
  return normalizeDescription(
    command?.description || command?.desc || command?.help || command?.usage,
    'Comando prefix.'
  );
}

function getPrefixBase(command) {
  const override = String(command?.prefixOverride || '').trim();
  return override || '+';
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
      category: String(category || 'misc').toLowerCase(),
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
      category: String(command.folder || 'misc').toLowerCase(),
      roles: commandRoles
    };

    const subcommands = extractPrefixSubcommands(command);
    if (subcommands.length) {
      for (const sub of subcommands) {
        entries.push({
          ...base,
          invoke: `${prefixBase}${command.name} ${sub}`,
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
    const category = String(command?.category || 'misc').toLowerCase();
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
      description: `Comando context (${commandType === ApplicationCommandType.User ? 'utente' : 'messaggio'}).`,
      category: String(command?.category || 'contextmenubuilder').toLowerCase(),
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
      if (!Array.isArray(entry.roles)) return true;
      const isVipCategory = String(entry.category || '').toLowerCase() === 'vip';
      if (!isVipCategory) return false;
      return hasAnyRole(memberRoles, entry.roles);
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

function renderPageEmbed(message, page) {
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

  const description = page.items.length
    ? [
      'Ecco la lista dei comandi disponibili.',
      'Usa il prefix, slash o context menu in base al comando.',
      '',
      sections.join('\n\n')
    ].join('\n')
    : '<:vegax:1443934876440068179> Nessun comando disponibile in questa pagina.';

  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setAuthor({ name: message.guild?.name || 'Help', iconURL: message.guild?.iconURL?.({ size: 128 }) || undefined })
    .setTitle(`📜 Comandi Disponibili`)
    .setDescription(description)
    .setFooter({ text: `Pagina ${page.indexLabel}` })
    .setThumbnail(message.client.user.displayAvatarURL({ size: 256 }));
}

function buildNavigationRow(state) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(state.prevId)
      .setEmoji(`<a:vegaleftarrow:1462914743416131816>`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(state.currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(state.nextId)
      .setEmoji(`<a:vegarightarrow:1443673039156936837>`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(state.currentIndex >= state.total - 1)
  );
}

module.exports = {
  name: 'help',

  async execute(message, _args, client) {
    await message.channel.sendTyping().catch(() => {});

    const permissions = loadPermissions();
    const allEntries = buildEntries(client, permissions);

    const memberRoles = message.member?.roles?.cache;
    const rolePages = PAGE_ROLE_IDS.filter((roleId) => memberRoles?.has(roleId));
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
      embeds: [renderPageEmbed(message, groupedPages[0])],
      components: [buildNavigationRow(navState)],
      allowedMentions: { repliedUser: false }
    });
    if (!sent) return;

    const collector = sent.createMessageComponentCollector();

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
        embeds: [renderPageEmbed(message, page)],
        components: [buildNavigationRow(navState)]
      }).catch(() => {});
    });
  }
};
