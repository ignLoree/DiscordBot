const CONFIG = require('../../config.js');
const { getOrCreatePassUser } = require('./passService.js');
const { grantRewards } = require('./rewardService.js');
const { requireActiveSeason } = require('./seasonService.js');
const { registerProgress } = require('./objectiveService.js');
const { registerMissionProgress } = require('./missionService.js');

function startVoiceTicker(client) {
  setInterval(async () => {
    for (const [guildId, guild] of client.guilds.cache) {
      const season = await safeActiveSeason(guildId);
      if (!season) continue;
      const allowedVoiceChannels = CONFIG.pass.voiceAllowedChannelIds || [];
      const voiceChannels = guild.channels.cache.filter(
        c => c.isVoiceBased?.() && !c.isThread?.()
      );
      const filteredVoiceChannels = allowedVoiceChannels.length > 0
        ? voiceChannels.filter(c => allowedVoiceChannels.includes(c.id))
        : voiceChannels;
      for (const [, ch] of filteredVoiceChannels) {
        const members = [...ch.members.values()].filter(m => !m.user.bot);
          if (members.length < CONFIG.pass.voiceMinMembers) continue;
        for (const m of members) {
          const u = await getOrCreatePassUser({
            guildId,
            seasonId: season.seasonId,
            userId: m.id
          });
          u.stats.voiceMinutesToday = (u.stats.voiceMinutesToday || 0) + 1;
          u.stats.partyToday = true;
          u.stats.lastPartyAt = new Date();
          const canGetTicket =
            u.stats.voiceTicketsToday < CONFIG.pass.voiceTicketCapPerDay &&
            u.stats.voiceMinutesToday % CONFIG.pass.voiceTicketEveryMin === 0;
          if (canGetTicket) {
            u.stats.voiceTicketsToday += 1;
            await grantRewards({
              guildId,
              seasonId: season.seasonId,
              userId: m.id,
              passUser: u,
              rewards: { tickets: 1, fragments: { common: 1 } },
              reason: 'voice_tick'
            });
          }
          await u.save();
          await registerProgress({
            guildId,
            seasonId: season.seasonId,
            passUser: u,
            type: 'voice',
            amount: 1
          });
          await registerProgress({
            guildId,
            seasonId: season.seasonId,
            passUser: u,
            type: 'voice_cumulative',
            amount: 1
          });
          await registerMissionProgress({
            guildId,
            seasonId: season.seasonId,
            passUser: u,
            type: 'voice',
            amount: 1
          });
        }
      }
    }
  }, 60_000);
}

async function safeActiveSeason(guildId) {
  try {
    return await requireActiveSeason(guildId);
  } catch {
    return null;
  }
}

module.exports = { startVoiceTicker };

