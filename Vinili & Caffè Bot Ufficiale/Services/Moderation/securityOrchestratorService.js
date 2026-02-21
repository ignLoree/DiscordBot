const { getAntiNukeStatusSnapshot } = require("./antiNukeService");
const { getAutoModPanicSnapshot } = require("./automodService");
const { getJoinRaidStatusSnapshot } = require("./joinRaidService");

async function getSecurityLockState(guild) {
  if (!guild?.id) {
    return {
      active: false,
      joinLockActive: false,
      commandLockActive: false,
      sources: [],
      details: {
        antiNukePanic: false,
        autoModPanic: false,
        joinRaid: false,
      },
    };
  }

  const guildId = String(guild.id);
  const antiNuke = getAntiNukeStatusSnapshot(guildId);
  const antiNukePanic = Boolean(antiNuke?.panicActive);
  const autoModPanic = Boolean(getAutoModPanicSnapshot(guildId)?.active);
  const joinRaidSnapshot = await getJoinRaidStatusSnapshot(guildId).catch(() => null);
  const joinRaid = Boolean(joinRaidSnapshot?.raidActive);
  const lockAllCommands = Boolean(
    antiNuke?.config?.panicMode?.lockdown?.lockAllCommands,
  );
  const commandLockActive = Boolean(
    joinRaid || (lockAllCommands && (antiNukePanic || autoModPanic)),
  );
  const joinLockActive = antiNukePanic || autoModPanic || joinRaid;
  const sources = [];
  if (antiNukePanic) sources.push("AntiNuke panic");
  if (autoModPanic) sources.push("AutoMod panic");
  if (joinRaid) sources.push("Join Raid");

  return {
    active: joinLockActive || commandLockActive,
    joinLockActive,
    commandLockActive,
    sources,
    details: {
      antiNukePanic,
      autoModPanic,
      joinRaid,
    },
  };
}

async function shouldBlockIncomingJoins(guild) {
  return Boolean((await getSecurityLockState(guild)).joinLockActive);
}

module.exports = {
  getSecurityLockState,
  shouldBlockIncomingJoins,
};
