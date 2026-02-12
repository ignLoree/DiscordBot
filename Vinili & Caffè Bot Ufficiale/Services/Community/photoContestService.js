const { EmbedBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } = require('discord.js');
const IDs = require('../../Utils/Config/ids');
const PhotoContestReward = require('../../Schemas/Community/photoContestRewardSchema');

const CONTEST_CHANNEL_ID = '1471449237035417642';
const HEART_EMOJI_ID = '1468685897389052008';
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const SECOND_REWARD_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const REWARD_CLEANUP_INTERVAL_MS = 60 * 1000;
const ONE_SHOT_EVENT_AT = '2026-02-15T20:00:00+01:00';

const FIRST_REWARD_ROLE_ID = '1442568950805430312';
const THIRD_REWARD_ROLE_ID = '1468938195348754515';
const PRIVATE_CATEGORY_ID = IDs?.categories?.categoryPrivate || null;

const PODIUM_ICONS = {
  first: '<:VC_Podio1:1469659449974329598>',
  second: '<:VC_Podio2:1469659512863592500>',
  third: '<:VC_Podio3:1469659557696504024>'
};

const PRIZE_LINES = {
  first: '**Ruolo __<@&1442568950805430312>__** <:VC_Vip:1448691936797134880>',
  second: '**Ruolo __personalizzato__ e canale __privato__ per __2 settimane** <:VC_EXP:1468714279673925883>',
  third: '**Ruolo __<@&1468938195348754515>__** <a:VC_Infinity:1448687797266288832>'
};

let rewardCleanupLoopHandle = null;
let oneShotTimerHandle = null;

function hasContestAttachment(message) {
  const attachments = Array.from(message?.attachments?.values?.() || []);
  if (!attachments.length) return false;
  return attachments.some((attachment) => {
    const contentType = String(attachment?.contentType || '').toLowerCase();
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) return true;
    const name = String(attachment?.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif|mp4|mov|m4v|webm|mkv|avi)$/i.test(name);
  });
}

function getHeartReaction(message) {
  return message?.reactions?.cache?.find((item) => String(item?.emoji?.id || '') === HEART_EMOJI_ID) || null;
}

async function fetchReactionUserIds(reaction) {
  if (!reaction) return new Set();
  const ids = new Set();
  let after = null;

  while (true) {
    const users = await reaction.users.fetch({
      limit: 100,
      ...(after ? { after } : {})
    }).catch(() => null);
    if (!users?.size) break;

    for (const user of users.values()) {
      if (user?.id) ids.add(String(user.id));
    }

    const last = users.last();
    if (!last || users.size < 100 || after === last.id) break;
    after = last.id;
  }

  return ids;
}

async function getHeartVotes(message, guildMemberIdSet = null) {
  const reaction = getHeartReaction(message);
  if (!reaction) return 0;

  if (!guildMemberIdSet || guildMemberIdSet.size === 0) {
    let fallbackVotes = Number(reaction.count || 0);
    if (reaction.me) fallbackVotes -= 1;
    return Math.max(0, fallbackVotes);
  }

  const voterIds = await fetchReactionUserIds(reaction);
  let votes = 0;
  for (const voterId of voterIds) {
    if (!voterId) continue;
    if (voterId === String(message?.client?.user?.id || '')) continue;
    if (!guildMemberIdSet.has(voterId)) continue;
    votes += 1;
  }
  return Math.max(0, votes);
}

function normalizeRanking(entries) {
  if (!entries.length) return [];

  const sorted = entries.sort((a, b) => {
    const byVotes = Number(b.votes || 0) - Number(a.votes || 0);
    if (byVotes !== 0) return byVotes;
    return Number(a.createdAt || 0) - Number(b.createdAt || 0);
  });

  const base = sorted.slice(0, 3);
  if (base.length < 3) return base;
  const thirdVotes = Number(base[2].votes || 0);
  const extraThird = sorted.slice(3).filter((item) => Number(item.votes || 0) === thirdVotes);
  return [...base, ...extraThird];
}

function formatMentionList(userIds = []) {
  const mentions = userIds.map((id) => `<@${id}>`);
  if (!mentions.length) return '';
  if (mentions.length === 1) return mentions[0];
  if (mentions.length === 2) return `${mentions[0]} e ${mentions[1]}`;
  return `${mentions.slice(0, -1).join(', ')} e ${mentions[mentions.length - 1]}`;
}

function buildWinnerLines(entries = []) {
  const groups = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const slot = i === 0 ? 'first' : (i === 1 ? 'second' : 'third');
    const votes = Number(entry?.votes || 0);
    const last = groups[groups.length - 1];

    if (last && last.slot === slot && last.votes === votes) {
      last.userIds.push(entry.authorId);
      continue;
    }

    groups.push({ slot, votes, userIds: [entry.authorId] });
  }

  return groups.map((group) => {
    const icon = group.slot === 'first'
      ? PODIUM_ICONS.first
      : (group.slot === 'second' ? PODIUM_ICONS.second : PODIUM_ICONS.third);
    const prize = group.slot === 'first'
      ? PRIZE_LINES.first
      : (group.slot === 'second' ? PRIZE_LINES.second : PRIZE_LINES.third);
    return `${icon} ${formatMentionList(group.userIds)} <a:VC_Arrow:1448672967721615452> ${prize} (\`${group.votes}\` voti)`;
  });
}

function getSlotFromIndex(index) {
  if (index === 0) return 'first';
  if (index === 1) return 'second';
  return 'third';
}

function resolveRewardSlots(entries = []) {
  const slotPriority = { first: 1, second: 2, third: 3 };
  const bestByUser = new Map();

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const userId = String(entry?.authorId || '');
    if (!userId) continue;
    const slot = getSlotFromIndex(i);
    const prev = bestByUser.get(userId);
    if (!prev || slotPriority[slot] < slotPriority[prev]) {
      bestByUser.set(userId, slot);
    }
  }

  const first = [];
  const second = [];
  const third = [];
  for (const [userId, slot] of bestByUser.entries()) {
    if (slot === 'first') first.push(userId);
    else if (slot === 'second') second.push(userId);
    else third.push(userId);
  }

  return { first, second, third };
}

async function fetchContestMessages(channel, afterTimestamp, guildMemberIdSet = null) {
  const out = [];
  let beforeId = null;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before: beforeId || undefined }).catch(() => null);
    if (!batch?.size) break;

    const ordered = Array.from(batch.values());
    for (const msg of ordered) {
      if (msg.createdTimestamp < afterTimestamp) continue;
      if (msg.author?.bot || msg.system || msg.webhookId) continue;
      if (guildMemberIdSet && guildMemberIdSet.size > 0 && !guildMemberIdSet.has(String(msg.author?.id || ''))) continue;
      if (!hasContestAttachment(msg)) continue;
      const votes = await getHeartVotes(msg, guildMemberIdSet);
      out.push({
        messageId: msg.id,
        authorId: msg.author.id,
        votes,
        createdAt: msg.createdTimestamp
      });
    }

    const oldest = ordered[ordered.length - 1];
    if (!oldest) break;
    if (oldest.createdTimestamp < afterTimestamp) break;
    beforeId = oldest.id;
  }

  return out;
}

async function lockContestChannel(channel) {
  const memberRoleId = IDs?.roles?.Member;
  if (!memberRoleId) return;
  await channel.permissionOverwrites.edit(memberRoleId, {
    [PermissionFlagsBits.ViewChannel]: true,
    [PermissionFlagsBits.ReadMessageHistory]: true,
    [PermissionFlagsBits.SendMessages]: false
  }).catch(() => {});
}

async function syncFixedRewardRole(guild, roleId, winnerIds = [], reason) {
  if (!guild || !roleId) return;
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;

  await guild.members.fetch().catch(() => {});
  const winners = new Set(winnerIds.map((id) => String(id)));

  for (const member of role.members.values()) {
    if (winners.has(member.id)) continue;
    await member.roles.remove(role.id, `${reason} (non vincitore)`).catch(() => {});
  }

  for (const userId of winners.values()) {
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member || member.roles.cache.has(role.id)) continue;
    await member.roles.add(role.id, reason).catch(() => {});
  }
}

function sanitizeNameChunk(input) {
  const clean = String(input || '')
    .replace(/[^\p{L}\p{N} _\-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return clean || 'winner';
}

async function createSecondRewardRole(guild, member) {
  const base = `Premio-Foto-${sanitizeNameChunk(member?.displayName || member?.user?.username || member?.id)}`;
  const roleName = base.slice(0, 100);
  return guild.roles.create({
    name: roleName,
    color: '#f4b6d7',
    reason: `Premio contest foto/video per ${member?.user?.tag || member?.id}`
  }).catch(() => null);
}

async function createSecondRewardChannel(guild, role, member) {
  if (!guild || !role || !member) return null;
  const base = sanitizeNameChunk(member.displayName || member.user?.username || member.id);
  const channelName = `\u0F04\uD83C\uDFC6\uFE32${base}`.slice(0, 100);

  const category = PRIVATE_CATEGORY_ID
    ? (guild.channels.cache.get(PRIVATE_CATEGORY_ID) || await guild.channels.fetch(PRIVATE_CATEGORY_ID).catch(() => null))
    : null;

  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    ...(category ? { parent: category.id } : {}),
    reason: `Canale premio contest foto/video per ${member.user?.tag || member.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak
        ]
      },
      {
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak
        ]
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.MoveMembers
        ]
      }
    ]
  }).catch(() => null);
}

async function ensureSecondPlaceReward(guild, userId) {
  if (!guild || !userId) return;
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const now = Date.now();
  const nextExpire = new Date(now + SECOND_REWARD_DURATION_MS);
  const existing = await PhotoContestReward.findOne({
    guildId: guild.id,
    userId: member.id
  }).catch(() => null);

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions) return;
  const canManageRoles = me.permissions.has(PermissionsBitField.Flags.ManageRoles);
  const canManageChannels = me.permissions.has(PermissionsBitField.Flags.ManageChannels);
  if (!canManageRoles) return;

  let role = null;
  let channel = null;

  if (existing?.roleId) {
    role = guild.roles.cache.get(existing.roleId) || await guild.roles.fetch(existing.roleId).catch(() => null);
  }
  if (existing?.channelId) {
    channel = guild.channels.cache.get(existing.channelId) || await guild.channels.fetch(existing.channelId).catch(() => null);
  }

  if (!role) {
    role = await createSecondRewardRole(guild, member);
    if (!role) return;
  }
  if (role.position >= me.roles.highest.position) return;

  if (canManageChannels && !channel) {
    channel = await createSecondRewardChannel(guild, role, member);
  }

  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role.id, 'Premio 2 posto contest foto/video').catch(() => {});
  }

  await PhotoContestReward.findOneAndUpdate(
    { guildId: guild.id, userId: member.id },
    {
      $set: {
        guildId: guild.id,
        userId: member.id,
        roleId: role.id,
        channelId: channel?.id || null,
        expiresAt: nextExpire
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).catch(() => null);
}

async function cleanupExpiredSecondPlaceRewards(client) {
  if (!client) return;
  const now = new Date();
  const rows = await PhotoContestReward.find({ expiresAt: { $lte: now } }).lean().catch(() => []);
  if (!rows.length) return;

  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guildId) || await client.guilds.fetch(row.guildId).catch(() => null);
    if (!guild) {
      await PhotoContestReward.deleteOne({ _id: row._id }).catch(() => {});
      continue;
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const canManageRoles = Boolean(me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles));
    const canManageChannels = Boolean(me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels));

    let role = row.roleId
      ? (guild.roles.cache.get(row.roleId) || await guild.roles.fetch(row.roleId).catch(() => null))
      : null;
    let channel = row.channelId
      ? (guild.channels.cache.get(row.channelId) || await guild.channels.fetch(row.channelId).catch(() => null))
      : null;

    if (channel && canManageChannels) {
      await channel.delete(`Scadenza premio contest foto/video per utente ${row.userId}`).catch(() => {});
      channel = guild.channels.cache.get(channel.id) || await guild.channels.fetch(channel.id).catch(() => null);
    }

    if (role && canManageRoles) {
      if (me && role.position < me.roles.highest.position) {
        await role.delete(`Scadenza premio contest foto/video per utente ${row.userId}`).catch(() => {});
        role = guild.roles.cache.get(role.id) || await guild.roles.fetch(role.id).catch(() => null);
      }
    }

    if (!role && !channel) {
      await PhotoContestReward.deleteOne({ _id: row._id }).catch(() => {});
    } else {
      const setData = {
        channelId: channel?.id || null
      };
      if (role?.id) setData.roleId = role.id;
      await PhotoContestReward.updateOne(
        { _id: row._id },
        { $set: setData }
      ).catch(() => {});
    }
  }
}

async function applyPhotoContestRewards(client, channel, winners = []) {
  const guild = channel?.guild;
  if (!guild || !Array.isArray(winners) || !winners.length) {
    if (guild) {
      await syncFixedRewardRole(guild, FIRST_REWARD_ROLE_ID, [], 'Reset premio 1 posto contest foto/video');
      await syncFixedRewardRole(guild, THIRD_REWARD_ROLE_ID, [], 'Reset premio 3 posto contest foto/video');
    }
    return;
  }

  const slots = resolveRewardSlots(winners);
  await syncFixedRewardRole(
    guild,
    FIRST_REWARD_ROLE_ID,
    slots.first,
    'Premio 1 posto contest foto/video'
  );
  await syncFixedRewardRole(
    guild,
    THIRD_REWARD_ROLE_ID,
    slots.third,
    'Premio 3 posto contest foto/video'
  );

  for (const userId of slots.second) {
    await ensureSecondPlaceReward(guild, userId);
  }
}

async function runWeeklyPhotoContestClose(client) {
  const channel = client.channels.cache.get(CONTEST_CHANNEL_ID)
    || await client.channels.fetch(CONTEST_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  await lockContestChannel(channel);

  const afterTimestamp = Date.now() - LOOKBACK_MS;
  let guildMemberIdSet = null;
  if (channel.guild) {
    await channel.guild.members.fetch().catch(() => {});
    guildMemberIdSet = new Set(channel.guild.members.cache.map((member) => String(member.id)));
  }

  const entries = await fetchContestMessages(channel, afterTimestamp, guildMemberIdSet);
  const winners = normalizeRanking(entries);
  await applyPhotoContestRewards(client, channel, winners);

  const description = winners.length
    ? buildWinnerLines(winners).join('\n')
    : '<:vegax:1443934876440068179> Nessuna foto/video valida trovata per questa settimana.';
  const winnerIds = Array.from(new Set(winners.map((row) => String(row.authorId || '')).filter(Boolean)));

  const embed = new EmbedBuilder()
    .setColor('#6f4e37')
    .setTitle('Classifica Settimanale Foto/Video')
    .setDescription(description)
    .setTimestamp();

  const winnersMention = winnerIds.map((id) => `<@${id}>`).join(' ');
  const highStaffMention = IDs?.roles?.HighStaff ? `<@&${IDs.roles.HighStaff}>` : '';
  const mentionParts = [winnersMention, highStaffMention].map((part) => String(part || '').trim()).filter(Boolean);
  const content = mentionParts.length ? mentionParts.join('\n') : null;

  await channel.send({
    content,
    embeds: [embed],
    allowedMentions: {
      users: winnerIds,
      roles: IDs?.roles?.HighStaff ? [String(IDs.roles.HighStaff)] : []
    }
  }).catch(() => {});
}

function startPhotoContestLoop(client) {
  if (!oneShotTimerHandle) {
    const fireAt = new Date(ONE_SHOT_EVENT_AT);
    const delayMs = fireAt.getTime() - Date.now();
    if (Number.isFinite(delayMs) && delayMs > 0) {
      oneShotTimerHandle = setTimeout(() => {
        runWeeklyPhotoContestClose(client).catch((error) => {
          global.logger?.error?.('[PHOTO CONTEST] One-shot close failed:', error);
        });
      }, delayMs);
    } else {
      global.logger?.info?.('[PHOTO CONTEST] One-shot date already passed, skip scheduling.');
    }
  }

  if (!rewardCleanupLoopHandle) {
    rewardCleanupLoopHandle = setInterval(() => {
      cleanupExpiredSecondPlaceRewards(client).catch(() => {});
    }, REWARD_CLEANUP_INTERVAL_MS);
  }
  cleanupExpiredSecondPlaceRewards(client).catch(() => {});
}

module.exports = {
  startPhotoContestLoop,
  runWeeklyPhotoContestClose,
  cleanupExpiredSecondPlaceRewards
};
