const { ChannelType, PermissionsBitField } = require('discord.js');

const SUPERSCRIPT_MAP = {
  '0': '\u2070',
  '1': '\u00B9',
  '2': '\u00B2',
  '3': '\u00B3',
  '4': '\u2074',
  '5': '\u2075',
  '6': '\u2076',
  '7': '\u2077',
  '8': '\u2078',
  '9': '\u2079'
};

const INDEX_PREFIX_RE = /^[\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079]+/;
const guildTimers = new Map();
let loopHandle = null;

function getSettings(client) {
  const cfg = client?.config2?.categoryNumbering || {};
  return {
    enabled: cfg.enabled !== false,
    debounceMs: Math.max(300, Number(cfg.debounceMs || 1200)),
    intervalMs: Math.max(60 * 1000, Number(cfg.intervalMs || 10 * 60 * 1000)),
    minDigits: Math.max(1, Number(cfg.minDigits || 2)),
    separator: typeof cfg.separator === 'string' ? cfg.separator : ' '
  };
}

function toSuperscriptNumber(value, minDigits) {
  const normalized = Math.max(1, Number(value) || 1).toString().padStart(minDigits, '0');
  return normalized
    .split('')
    .map((digit) => SUPERSCRIPT_MAP[digit] || digit)
    .join('');
}

function replaceNumberPrefixOnly(name, nextNumber, separator) {
  const value = String(name || '');
  if (INDEX_PREFIX_RE.test(value)) {
    return value.replace(INDEX_PREFIX_RE, nextNumber);
  }
  return `${nextNumber}${separator}${value}`;
}

async function renumberGuildCategories(guild, options) {
  if (!guild) return;
  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;

  const categories = guild.channels.cache
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => (a.rawPosition - b.rawPosition) || a.id.localeCompare(b.id))
    .map((channel) => channel);

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    if (!category?.manageable) continue;

    const nextNumber = toSuperscriptNumber(index + 1, options.minDigits);
    const expectedName = replaceNumberPrefixOnly(category.name, nextNumber, options.separator);
    if (category.name === expectedName) continue;
    await category.setName(expectedName).catch(() => {});
  }
}

function queueCategoryRenumber(client, guildId, delayMs = null) {
  if (!client || !guildId) return;
  const options = getSettings(client);
  if (!options.enabled) return;

  const pending = guildTimers.get(guildId);
  if (pending) clearTimeout(pending);

  const timeout = setTimeout(async () => {
    guildTimers.delete(guildId);
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    await guild.channels.fetch().catch(() => {});
    await renumberGuildCategories(guild, options);
  }, delayMs == null ? options.debounceMs : delayMs);

  guildTimers.set(guildId, timeout);
}

async function runAllGuilds(client) {
  if (!client) return;
  const options = getSettings(client);
  if (!options.enabled) return;
  for (const guild of client.guilds.cache.values()) {
    await guild.channels.fetch().catch(() => {});
    await renumberGuildCategories(guild, options);
  }
}

function startCategoryNumberingLoop(client) {
  if (loopHandle) return;
  const options = getSettings(client);
  if (!options.enabled) return;
  loopHandle = setInterval(() => {
    runAllGuilds(client).catch(() => {});
  }, options.intervalMs);
}

module.exports = {
  queueCategoryRenumber,
  runAllGuilds,
  startCategoryNumberingLoop
};
