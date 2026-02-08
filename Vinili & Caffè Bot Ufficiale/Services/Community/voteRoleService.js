const VoteRole = require('../../Schemas/Community/voteRoleSchema');

const VOTE_ROLE_ID = '1468266342682722679';
const CHECK_INTERVAL_MS = 60 * 1000;

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
  setInterval(() => {
    removeExpiredVoteRoles(client).catch(() => {});
  }, CHECK_INTERVAL_MS);
}

module.exports = {
  upsertVoteRole,
  removeExpiredVoteRoles,
  startVoteRoleCleanupLoop
};
