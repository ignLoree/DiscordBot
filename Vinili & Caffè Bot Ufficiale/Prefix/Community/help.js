const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationCommandType
} = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/reply');

const PERMISSIONS_PATH = path.join(process.cwd(), 'permissions.json');
const PAGE_ROLE_IDS = [
  '1442568905582317740',
  '1442568910070349985',
  '1442568894349840435',
  '1442568886988963923'
];
const PAGE_TITLES = {
  base: 'Comandi Base',
  '1442568905582317740': 'Comandi Partner Manager',
  '1442568910070349985': 'Comandi Staff',
  '1442568894349840435': 'Comandi High Staff',
  '1442568886988963923': 'Comandi Founder'
};
const TYPE_LABEL = {
  prefix: 'Prefix',
  slash: 'Slash',
  context: 'Context'
};
const CATEGORY_LABELS = {
  community: 'Community',
  level: 'Level',
  partner: 'Partner',
  staff: 'Staff',
  vip: 'VIP',
  admin: 'Admin',
  contextmenubuilder: 'Context Menu',
  misc: 'Misc'
};

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

function getSlashTopLevelDescription(dataJson) {
  return normalizeDescription(dataJson?.description, 'Comando slash.');
}

function getSubcommandEntries(commandName, dataJson, permissionConfig, commandType, category) {
  const entries = [];
  const options = Array.isArray(dataJson?.options) ? dataJson.options : [];
  const isChatInput = commandType === ApplicationCommandType.ChatInput;
  if (!isChatInput) return entries;

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
    const pageKey = roleList ? roleList : null;
    entries.push({
      name: groupName ? `${commandName} ${groupName} ${subName}` : `${commandName} ${subName}`,
      invoke: `/${groupName ? `${commandName} ${groupName} ${subName}` : `${commandName} ${subName}`}`,
      type: 'slash',
      description: normalizeDescription(subOption.description, topDesc),
      category: String(category || 'misc').toLowerCase(),
      roles: pageKey
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
    const roles = Array.isArray(perm) ? perm : null;
    const aliases = Array.isArray(command.aliases)
      ? command.aliases.filter((alias) => typeof alias === 'string' && alias.trim().length)
      : [];
    entries.push({
      name: command.name,
      invoke: `+${command.name}`,
      type: 'prefix',
      description: getPrefixDescription(command),
      aliases,
      category: String(command.folder || 'misc').toLowerCase(),
      roles
    });
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
    const hasSubcommands = Array.isArray(dataJson.options) &&
      dataJson.options.some((opt) => opt?.type === 1 || opt?.type === 2);

    if (commandType === ApplicationCommandType.ChatInput && hasSubcommands) {
      const subEntries = getSubcommandEntries(dataJson.name, dataJson, perm, commandType, category);
      entries.push(...subEntries);
      continue;
    }

    const roles = Array.isArray(perm)
      ? perm
      : Array.isArray(perm?.roles)
        ? perm.roles
        : null;
    entries.push({
      name: dataJson.name,
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
    if (commandType !== ApplicationCommandType.User && commandType !== ApplicationCommandType.Message) {
      continue;
    }
    const perm = permissions.slash?.[dataJson.name];
    const roles = Array.isArray(perm)
      ? perm
      : Array.isArray(perm?.roles)
        ? perm.roles
        : null;

    entries.push({
      name: dataJson.name,
      invoke: `Apps > ${dataJson.name}`,
      type: 'context',
      description: `Comando context (${commandType === ApplicationCommandType.User ? 'utente' : 'messaggio'}).`,
      category: String(command?.category || 'contextmenubuilder').toLowerCase(),
      roles
    });
  }

  const dedupe = new Map();
  for (const entry of entries) {
    const roleKey = Array.isArray(entry.roles) ? entry.roles.slice().sort().join(',') : 'base';
    const key = `${entry.type}:${entry.invoke}:${roleKey}`;
    if (!dedupe.has(key)) dedupe.set(key, entry);
  }
  return Array.from(dedupe.values()).sort((a, b) => a.invoke.localeCompare(b.invoke, 'it'));
}

function filterByPage(entries, pageRoleId) {
  if (pageRoleId === 'base') {
    return entries.filter((entry) => !Array.isArray(entry.roles));
  }
  return entries.filter((entry) => Array.isArray(entry.roles) && entry.roles.includes(pageRoleId));
}

function chunkEntries(entries, size = 12) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += size) {
    chunks.push(entries.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

function renderPageEmbed(message, page, totalPages) {
  const grouped = new Map();
  for (const entry of page.items) {
    const key = String(entry.category || 'misc').toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const sections = [];
  for (const [categoryKey, entries] of grouped) {
    const categoryLabel = CATEGORY_LABELS[categoryKey] || (categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1));
    const rows = entries.map((entry) => {
      const aliasText = entry.type === 'prefix' && Array.isArray(entry.aliases) && entry.aliases.length
        ? ` (alias: ${entry.aliases.map((alias) => `+${alias}`).join(', ')})`
        : '';
      return `┃ \`${entry.invoke}\` - ${entry.description}${aliasText}`;
    });
    sections.push(`✨ **${categoryLabel}**\n${rows.join('\n')}`);
  }

  const description = page.items.length
    ? [
      'Ecco la lista dei comandi disponibili.',
      'Usa prefisso, slash o context menu in base al comando.',
      '',
      sections.join('\n\n')
    ].join('\n')
    : 'Nessun comando disponibile in questa pagina.';

  return new EmbedBuilder()
    .setColor('#6f4e37')
    .setAuthor({ name: message.guild?.name || 'Help', iconURL: message.guild?.iconURL?.({ size: 128 }) || undefined })
    .setTitle(`📜 Comandi Disponibili - ${PAGE_TITLES[page.roleId] || 'Comandi'}`)
    .setDescription(description)
    .setFooter({ text: `Pagina ${page.indexLabel} | ${page.items.length} comandi | ${page.groupLabel}` })
    .setTimestamp()
    .setThumbnail(message.client.user.displayAvatarURL({ size: 256 }));
}

function buildNavigationRow(state) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(state.prevId)
      .setLabel('Precedente')
      .setEmoji(`<a:vegaleftarrow:1462914743416131816>`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(state.currentIndex <= 0),
    new ButtonBuilder()
      .setCustomId(state.nextId)
      .setLabel('Prossima')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(`<a:vegarightarrow:1443673039156936837>`)
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
    const visibleRoleIds = ['base', ...rolePages];

    const groupedPages = [];
    for (const roleId of visibleRoleIds) {
      const filtered = filterByPage(allEntries, roleId);
      const chunks = chunkEntries(filtered, 9);
      chunks.forEach((chunk, idx) => {
        groupedPages.push({
          roleId,
          items: chunk,
          indexLabel: `${idx + 1}/${chunks.length}`,
          groupLabel: PAGE_TITLES[roleId] || roleId
        });
      });
    }

    if (!groupedPages.length) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('Nessun comando disponibile.')
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

    const firstEmbed = renderPageEmbed(message, groupedPages[0], groupedPages.length);
    const firstRow = buildNavigationRow(navState);

    const sent = await safeMessageReply(message, {
      embeds: [firstEmbed],
      components: [firstRow],
      allowedMentions: { repliedUser: false }
    });
    if (!sent) return;

    const collector = sent.createMessageComponentCollector();

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: 'Puoi usare i bottoni solo sul tuo help.',
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
      const embed = renderPageEmbed(message, page, navState.total);
      const row = buildNavigationRow(navState);
      await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    });

    // Nessuna scadenza: i pulsanti restano attivi finché il messaggio esiste.
  }
};
