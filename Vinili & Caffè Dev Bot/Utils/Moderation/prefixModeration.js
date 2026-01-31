const { fetchMemberSafe } = require('./discordFetch.js');

function extractUserId(raw, message) {
  const mention = message.mentions?.users?.first();
  if (mention) return mention.id;
  if (!raw) return null;
  const match = String(raw).match(/^<@!?(\d+)>$/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(raw)) return raw;
  return null;
}

async function resolveTarget(message, args, index = 0) {
  const raw = args?.[index];
  const userId = extractUserId(raw, message);
  if (!userId) return { user: null, member: null, userId: null };
  const user = await message.client.users.fetch(userId).catch(() => null);
  const member = user ? await fetchMemberSafe(message.guild, user.id) : null;
  return { user, member, userId };
}

function getReason(args, startIndex) {
  const reason = Array.isArray(args) ? args.slice(startIndex).join(' ').trim() : '';
  return reason || 'Nessun motivo fornito';
}

module.exports = { extractUserId, resolveTarget, getReason };
