const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');

const CATEGORY_TYPES = new Set([ChannelType.GuildCategory]);
const NON_CATEGORY_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice
]);

function sanitizeLineValue(value) {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNameIdLine(name, id) {
  return `${sanitizeLineValue(name)} -> ${String(id || '').trim()}`;
}

function keepPreviousOrder(items, previousEntries, getName) {
  const list = Array.isArray(items) ? items.slice() : [];
  const previous = Array.isArray(previousEntries) ? previousEntries : [];
  if (!previous.length) return list;

  const used = new Set();
  const ordered = [];

  for (const prev of previous) {
    const prevName = String(prev?.name || '');
    if (!prevName) continue;
    const idx = list.findIndex((item, i) => !used.has(i) && String(getName(item)) === prevName);
    if (idx !== -1) {
      used.add(idx);
      ordered.push(list[idx]);
    }
  }

  for (let i = 0; i < list.length; i++) {
    if (!used.has(i)) ordered.push(list[i]);
  }

  return ordered;
}

function sortChannels(a, b) {
  const catA = a.parent?.rawPosition ?? -1;
  const catB = b.parent?.rawPosition ?? -1;
  if (catA !== catB) return catA - catB;
  if ((a.parentId || '') !== (b.parentId || '')) return String(a.parentId || '').localeCompare(String(b.parentId || ''));
  if ((a.rawPosition ?? 0) !== (b.rawPosition ?? 0)) return (a.rawPosition ?? 0) - (b.rawPosition ?? 0);
  return String(a.id).localeCompare(String(b.id));
}

function sortRoles(a, b) {
  if ((a.position ?? 0) !== (b.position ?? 0)) return (b.position ?? 0) - (a.position ?? 0);
  return String(a.id).localeCompare(String(b.id));
}

function templateEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function buildRawBlock(lines) {
  const body = (Array.isArray(lines) ? lines : []).join('\n');
  return `\`\n${templateEscape(body)}\n\``;
}

function renderCatalogFile({ categoriesLines, channelsLines, rolesLines, botsLines, emojisLines, guildId, voteLink, inviteLink, loadingAnimatedId, loadingFallbackId }) {
  return `'use strict';

function parseNameIdText(text) {
  return String(text || '')
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf('->');
      if (idx === -1) return null;
      const name = line.slice(0, idx).trim();
      const id = line.slice(idx + 2).trim();
      if (!name || !/^\\d{16,20}$/.test(id)) return null;
      return { name, id };
    })
    .filter(Boolean);
}

function toLastValueMap(entries) {
  const map = {};
  for (const entry of entries) map[entry.name] = entry.id;
  return map;
}

function toMultiValueMap(entries) {
  const map = {};
  for (const entry of entries) {
    if (!map[entry.name]) map[entry.name] = [];
    if (!map[entry.name].includes(entry.id)) map[entry.name].push(entry.id);
  }
  return map;
}

const categoriesRaw = ${buildRawBlock(categoriesLines)};
const channelsRaw = ${buildRawBlock(channelsLines)};
const rolesRaw = ${buildRawBlock(rolesLines)};
const botsRaw = ${buildRawBlock(botsLines)};
const emojisRaw = ${buildRawBlock(emojisLines)};

const categories = parseNameIdText(categoriesRaw);
const channels = parseNameIdText(channelsRaw);
const roles = parseNameIdText(rolesRaw);
const bots = parseNameIdText(botsRaw);
const emojis = parseNameIdText(emojisRaw);

module.exports = {
  raw: {
    categories: categoriesRaw,
    channels: channelsRaw,
    roles: rolesRaw,
    bots: botsRaw,
    emojis: emojisRaw
  },
  entries: {
    categories,
    channels,
    roles,
    bots,
    emojis
  },
  maps: {
    categories: toLastValueMap(categories),
    channels: toLastValueMap(channels),
    roles: toLastValueMap(roles),
    bots: toLastValueMap(bots),
    emojis: toLastValueMap(emojis)
  },
  multi: {
    categories: toMultiValueMap(categories),
    channels: toMultiValueMap(channels),
    roles: toMultiValueMap(roles),
    bots: toMultiValueMap(bots),
    emojis: toMultiValueMap(emojis)
  },
  meta: {
    guildMain: ${JSON.stringify(guildId || null)},
    emojis: {
      loadingAnimatedId: ${JSON.stringify(loadingAnimatedId || null)},
      loadingFallbackId: ${JSON.stringify(loadingFallbackId || null)}
    },
    links: {
      vote: ${JSON.stringify(voteLink || null)},
      invite: ${JSON.stringify(inviteLink || null)}
    }
  }
};
`;
}

async function collectGuildCatalog(guild, ids) {
  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});
  await guild.emojis.fetch().catch(() => {});
  await guild.members.fetch().catch(() => {});

  const previousEntries = ids?.namedEntries || {};

  const categories = keepPreviousOrder(
    guild.channels.cache
    .filter((ch) => CATEGORY_TYPES.has(ch.type))
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
    .map((ch) => ({ name: ch.name, id: ch.id })),
    previousEntries.categories,
    (x) => x.name
  );
  const categoriesLines = categories.map((x) => toNameIdLine(x.name, x.id));

  const channels = keepPreviousOrder(
    guild.channels.cache
    .filter((ch) => NON_CATEGORY_TYPES.has(ch.type))
    .sort(sortChannels)
    .map((ch) => ({ name: ch.name, id: ch.id })),
    previousEntries.channels,
    (x) => x.name
  );
  const channelsLines = channels.map((x) => toNameIdLine(x.name, x.id));

  const roles = keepPreviousOrder(
    guild.roles.cache
    .filter((role) => role.id !== guild.id)
    .sort(sortRoles)
    .map((role) => ({ name: role.name, id: role.id })),
    previousEntries.roles,
    (x) => x.name
  );
  const rolesLines = roles.map((x) => toNameIdLine(x.name, x.id));

  const bots = keepPreviousOrder(
    guild.members.cache
    .filter((m) => m.user?.bot)
    .sort((a, b) => {
      const nameA = a.user?.globalName || a.user?.username || '';
      const nameB = b.user?.globalName || b.user?.username || '';
      return nameA.localeCompare(nameB, 'it');
    })
    .map((m) => ({ name: m.user?.globalName || m.user?.username || m.user?.tag || m.id, id: m.id })),
    previousEntries.bots,
    (x) => x.name
  );
  const botsLines = bots.map((x) => toNameIdLine(x.name, x.id));

  const emojis = keepPreviousOrder(
    guild.emojis.cache
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'))
    .map((emoji) => ({ name: emoji.name, id: emoji.id })),
    previousEntries.emojis,
    (x) => x.name
  );
  const emojisLines = emojis.map((x) => toNameIdLine(x.name, x.id));

  const catalogSource = renderCatalogFile({
    categoriesLines,
    channelsLines,
    rolesLines,
    botsLines,
    emojisLines,
    guildId: guild.id,
    voteLink: ids?.links?.vote || null,
    inviteLink: ids?.links?.invite || null,
    loadingAnimatedId: ids?.emojis?.loadingAnimatedId || null,
    loadingFallbackId: ids?.emojis?.loadingFallbackId || null
  });

  return {
    categoriesLines,
    channelsLines,
    rolesLines,
    botsLines,
    emojisLines,
    catalogSource
  };
}

function writeCatalogFiles(baseDir, payload) {
  const catalogPath = path.join(baseDir, 'Utils', 'Config', 'idsCatalog.js');
  fs.writeFileSync(catalogPath, payload.catalogSource, 'utf8');

  const reportPath = path.join(baseDir, 'Utils', 'Config', 'idsCatalog.snapshot.txt');
  const report = [
    '[CATEGORIES]',
    ...payload.categoriesLines,
    '',
    '[CHANNELS]',
    ...payload.channelsLines,
    '',
    '[ROLES]',
    ...payload.rolesLines,
    '',
    '[EMOJIS]',
    ...payload.emojisLines,
    '',
    '[BOTS]',
    ...payload.botsLines,
    ''
  ].join('\n');
  fs.writeFileSync(reportPath, report, 'utf8');

  return { catalogPath, reportPath };
}

module.exports = {
  collectGuildCatalog,
  writeCatalogFiles
};
