const SponsorMainLeave = require('../../Schemas/Tags/tagsSchema');

const MAIN_GUILD_ID = '1329080093599076474'
const OFFICIAL_INVITE_URL = 'https://discord.gg/viniliecaffe' 
const SPONSOR_GUILD_IDS = [
    '1471511676019933354',
    '1471511928739201047',
    '1471512183547498579',
    '1471512555762483330',
    '1471512797140484230',
    '1471512808448458958'
  ]

async function isInMain(client, userId) {
  const mainGuild = client.guilds.cache.get(MAIN_GUILD_ID);
  if (!mainGuild) return false;
  const m = await mainGuild.members.fetch(userId).catch(() => null);
  return Boolean(m);
}

async function kickFromSponsors(client, userId, reason) {
  for (const gid of SPONSOR_GUILD_IDS) {
    const g = client.guilds.cache.get(gid);
    if (!g) continue;

    const member = await g.members.fetch(userId).catch(() => null);
    if (!member) continue;

    if (!member.kickable) {
      global.logger?.warn?.(`[SPONSOR-KICK] Not kickable in guild ${gid} user ${userId}`);
      continue;
    }

    await member.kick(reason).catch((e) => {
      global.logger?.warn?.(`[SPONSOR-KICK] Failed kick in guild ${gid} user ${userId}:`, e?.message || e);
    });
  }
}

async function processSponsorLeaves(client) {
  const now = new Date();

  const expired = await SponsorMainLeave.find({ kickAt: { $lte: now } }).lean().catch(() => []);
  if (!expired?.length) return;

  for (const row of expired) {
    const userId = row.userId;

    const backInMain = await isInMain(client, userId);
    if (backInMain) {
      await SponsorMainLeave.deleteOne({ userId }).catch(() => {});
      continue;
    }

    await kickFromSponsors(client, userId, 'Non rientrato nel server principale entro 24h');

    await SponsorMainLeave.deleteOne({ userId }).catch(() => {});
  }
}

function startTagsLeaveWatcher(client) {
  processSponsorLeaves(client).catch(() => {});
  setInterval(() => processSponsorLeaves(client).catch(() => {}), 10 * 60 * 1000);
}

module.exports = { startTagsLeaveWatcher, processSponsorLeaves };
