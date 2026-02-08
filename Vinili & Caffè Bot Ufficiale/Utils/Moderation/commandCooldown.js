const ExpUser = require('../../Schemas/Community/expUserSchema');

const ROLE_COOLDOWN_BYPASS = '1442568910070349985';
const ROLE_LEVEL_30 = '1442568933591748688';
const ROLE_LEVEL_50 = '1442568932136587297';

function getBucket(client) {
  if (!client.commandCooldowns) {
    client.commandCooldowns = new Map();
  }
  return client.commandCooldowns;
}

function computeCooldownSeconds(member, level) {
  const hasBypassRole = Boolean(member?.roles?.cache?.has(ROLE_COOLDOWN_BYPASS));
  const hasRole50 = Boolean(member?.roles?.cache?.has(ROLE_LEVEL_50));
  const hasRole30 = Boolean(member?.roles?.cache?.has(ROLE_LEVEL_30));

  if (hasBypassRole) return 0;
  if (hasRole50 || level >= 50) return 5;
  if (hasRole30 || level >= 30) return 15;
  return 30;
}

async function getUserCommandCooldownSeconds({ guildId, userId, member }) {
  let level = 0;
  if (guildId && userId) {
    try {
      const user = await ExpUser.findOne({ guildId, userId }).select('level').lean();
      level = Number(user?.level || 0);
    } catch {
      level = 0;
    }
  }
  return computeCooldownSeconds(member, level);
}

function consumeUserCooldown({ client, guildId, userId, cooldownSeconds }) {
  const seconds = Number(cooldownSeconds || 30);
  if (seconds <= 0) {
    return { ok: true, remainingMs: 0 };
  }

  const bucket = getBucket(client);
  const key = `${guildId || 'dm'}:${userId}`;
  const now = Date.now();
  const endsAt = bucket.get(key) || 0;

  if (endsAt > now) {
    return {
      ok: false,
      remainingMs: endsAt - now
    };
  }

  bucket.set(key, now + (seconds * 1000));
  return { ok: true, remainingMs: 0 };
}

module.exports = {
  getUserCommandCooldownSeconds,
  consumeUserCooldown
};
