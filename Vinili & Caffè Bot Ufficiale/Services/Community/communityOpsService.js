const { ChannelType, PermissionsBitField } = require('discord.js');
const { VoteRole, VerificationTenure } = require('../../Schemas/Community/communitySchemas');
const IDs = require('../../Utils/Config/ids');

const VOTE_ROLE_ID = IDs.roles.Voter;
const CHECK_INTERVAL_MS = 60 * 1000;

const ROLE_STAGE_1 = IDs.roles.NuovoUtente;
const ROLE_STAGE_2 = IDs.roles.Veterano;
const ROLE_STAGE_3 = IDs.roles.OG;
const VERIFIED_ROLE_ID = IDs.roles.Member || IDs.roles.Verificato;
const DAY_MS = 24 * 60 * 60 * 1000;
const STAGE_1_DAYS = 30;
const STAGE_2_DAYS = 365;

const SUPERSCRIPT_MAP = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹'
};
const INDEX_PREFIX_RE = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/;
const guildTimers = new Map();
let numberingLoopHandle = null;
let voteCleanupLoopHandle = null;
let verificationTenureLoopHandle = null;

async function upsertVoteRole(guildId, userId, expiresAt) {
  if (!guildId || !userId || !expiresAt) return null;
  return VoteRole.findOneAndUpdate(
    { guildId, userId },
    { $set: { expiresAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function removeExpiredVoteRoles(client) {
  const now = new Date();
  const expired = await VoteRole.find({ expiresAt: { $lte: now } }).lean();
  if (!expired.length) return;

  for (const item of expired) {
    const guild = client.guilds.cache.get(item.guildId) || await client.guilds.fetch(item.guildId).catch(() => null);
    if (!guild) {
      await VoteRole.deleteOne({ guildId: item.guildId, userId: item.userId });
      continue;
    }
    const member = guild.members.cache.get(item.userId) || await guild.members.fetch(item.userId).catch(() => null);
    if (member?.roles?.cache?.has(VOTE_ROLE_ID)) {
      await member.roles.remove(VOTE_ROLE_ID).catch(() => {});
    }
    await VoteRole.deleteOne({ guildId: item.guildId, userId: item.userId });
  }
}

function startVoteRoleCleanupLoop(client) {
  if (!client) return;
  if (voteCleanupLoopHandle) return voteCleanupLoopHandle;
  voteCleanupLoopHandle = setInterval(() => {
    removeExpiredVoteRoles(client).catch(() => {});
  }, CHECK_INTERVAL_MS);
  return voteCleanupLoopHandle;
}

async function upsertVerifiedMember(guildId, userId, verifiedAt = new Date()) {
  return VerificationTenure.findOneAndUpdate(
    { guildId, userId },
    { $set: { verifiedAt }, $setOnInsert: { stage: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function applyTenureForMember(member, record) {
  if (!member || !record) return;
  const now = new Date();
  const stage1At = new Date(record.verifiedAt.getTime() + STAGE_1_DAYS * DAY_MS);
  const stage2At = new Date(record.verifiedAt.getTime() + STAGE_2_DAYS * DAY_MS);

  const has1 = member.roles.cache.has(ROLE_STAGE_1);
  const has2 = member.roles.cache.has(ROLE_STAGE_2);
  const has3 = member.roles.cache.has(ROLE_STAGE_3);

  if (now >= stage2At) {
    if (!has3 || has1 || has2) {
      await member.roles.remove([ROLE_STAGE_1, ROLE_STAGE_2]).catch(() => {});
      await member.roles.add(ROLE_STAGE_3).catch(() => {});
    }
    if (record.stage !== 3) {
      await VerificationTenure.updateOne(
        { guildId: record.guildId, userId: record.userId },
        { $set: { stage: 3 } }
      );
    }
    return;
  }

  if (now >= stage1At) {
    if (!has2 || has1) {
      await member.roles.remove([ROLE_STAGE_1]).catch(() => {});
      await member.roles.add(ROLE_STAGE_2).catch(() => {});
    }
    if (record.stage !== 2) {
      await VerificationTenure.updateOne(
        { guildId: record.guildId, userId: record.userId },
        { $set: { stage: 2 } }
      );
    }
    return;
  }

  if (!has1) {
    await member.roles.add(ROLE_STAGE_1).catch(() => {});
  }
}

async function runTenureSweep(client) {
  const docs = await VerificationTenure.find({}).lean().catch(() => []);
  if (!docs.length) return;
  for (const doc of docs) {
    const guild = client.guilds.cache.get(doc.guildId)
      || await client.guilds.fetch(doc.guildId).catch(() => null);
    if (!guild) continue;
    const member = guild.members.cache.get(doc.userId)
      || await guild.members.fetch(doc.userId).catch(() => null);
    if (!member) continue;
    await applyTenureForMember(member, doc);
  }
}

function startVerificationTenureLoop(client) {
  if (verificationTenureLoopHandle) return verificationTenureLoopHandle;
  verificationTenureLoopHandle = setInterval(() => {
    runTenureSweep(client).catch((error) => {
      global.logger.error('[VERIFY TENURE] Sweep failed:', error);
    });
  }, 60 * 60 * 1000);
  return verificationTenureLoopHandle;
}

async function backfillVerificationTenure(client) {
  const guilds = Array.from(client.guilds.cache.values());
  for (const guild of guilds) {
    const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID)
      || await guild.roles.fetch(VERIFIED_ROLE_ID).catch(() => null);
    if (!verifiedRole) continue;

    await guild.members.fetch().catch(() => null);
    const verifiedMembers = guild.members.cache.filter(
      (m) => !m.user?.bot && m.roles.cache.has(VERIFIED_ROLE_ID)
    );

    for (const member of verifiedMembers.values()) {
      const verifiedAt = member.joinedAt || new Date();
      const record = await VerificationTenure.findOneAndUpdate(
        { guildId: guild.id, userId: member.id },
        { $setOnInsert: { verifiedAt, stage: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).catch(() => null);
      if (!record) continue;
      await applyTenureForMember(member, record);
    }
  }
}

function getCategorySettings(client) {
  const cfg = client?.config?.categoryNumbering || {};
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

function isTicketsCategoryName(name) {
  return String(name || '').toLowerCase().includes('tickets');
}

async function renumberGuildCategories(guild, options) {
  if (!guild) return;
  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) return;

  const categories = guild.channels.cache
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .sort((a, b) => (a.rawPosition - b.rawPosition) || a.id.localeCompare(b.id))
    .map((channel) => channel);

  let nonTicketIndex = 1;
  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    if (!category?.manageable) continue;
    if (isTicketsCategoryName(category.name)) continue;

    const nextNumber = toSuperscriptNumber(nonTicketIndex++, options.minDigits);
    const expectedName = replaceNumberPrefixOnly(category.name, nextNumber, options.separator);
    if (category.name === expectedName) continue;
    await category.setName(expectedName).catch(() => {});
  }
}

function queueCategoryRenumber(client, guildId, delayMs = null) {
  if (!client || !guildId) return;
  const options = getCategorySettings(client);
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
  const options = getCategorySettings(client);
  if (!options.enabled) return;
  for (const guild of client.guilds.cache.values()) {
    await guild.channels.fetch().catch(() => {});
    await renumberGuildCategories(guild, options);
  }
}

function startCategoryNumberingLoop(client) {
  if (numberingLoopHandle) return;
  const options = getCategorySettings(client);
  if (!options.enabled) return;
  numberingLoopHandle = setInterval(() => {
    runAllGuilds(client).catch(() => {});
  }, options.intervalMs);
}

module.exports = {
  upsertVoteRole,
  removeExpiredVoteRoles,
  startVoteRoleCleanupLoop,
  upsertVerifiedMember,
  applyTenureForMember,
  startVerificationTenureLoop,
  backfillVerificationTenure,
  queueCategoryRenumber,
  runAllGuilds,
  startCategoryNumberingLoop
};
