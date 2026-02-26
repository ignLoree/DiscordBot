const {
  getAntiNukeStatusSnapshot,
  shouldBlockAllCommands,
} = require("./antiNukeService");
const { getAutoModPanicSnapshot } = require("./automodService");
const { getJoinRaidStatusSnapshot } = require("./joinRaidService");

function buildSecurityLockDecision({
  antiNukePanic = false,
  autoModPanic = false,
  joinRaid = false,
  lockAllCommands = false,
  joinRaidLockCommands = false,
} = {}) {
  const joinLockActive = Boolean(antiNukePanic || joinRaid);
  const commandLockByPanic = Boolean(lockAllCommands && antiNukePanic);
  const commandLockByJoinRaid = Boolean(joinRaid && joinRaidLockCommands);
  const commandLockActive = Boolean(commandLockByPanic || commandLockByJoinRaid);
  const sources = [];
  if (antiNukePanic) sources.push("AntiNuke panic");
  if (joinRaid) sources.push("Join Raid");
  const commandSources = [];
  if (commandLockByPanic) {
    if (antiNukePanic) commandSources.push("AntiNuke panic");
  }
  if (commandLockByJoinRaid) commandSources.push("Join Raid");

  return {
    active: joinLockActive || commandLockActive,
    joinLockActive,
    commandLockActive,
    sources,
    commandSources: Array.from(new Set(commandSources)),
    details: {
      antiNukePanic: Boolean(antiNukePanic),
      autoModPanic: Boolean(autoModPanic),
      joinRaid: Boolean(joinRaid),
      lockAllCommands: Boolean(lockAllCommands),
      joinRaidLockCommands: Boolean(joinRaidLockCommands),
      commandLockByPanic,
      commandLockByJoinRaid,
    },
  };
}

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
        lockAllCommands: false,
        joinRaidLockCommands: false,
        commandLockByPanic: false,
        commandLockByJoinRaid: false,
      },
    };
  }

  const guildId = String(guild.id);
  const antiNuke = getAntiNukeStatusSnapshot(guildId);
  const antiNukePanic = Boolean(antiNuke?.panicActive);
  const autoModPanic = Boolean(getAutoModPanicSnapshot(guildId)?.active);
  const joinRaidSnapshot = await getJoinRaidStatusSnapshot(guildId).catch(() => null);
  const joinRaid = Boolean(joinRaidSnapshot?.raidActive);
  const joinRaidLockCommands = Boolean(joinRaidSnapshot?.config?.lockCommands);
  const lockAllCommands = Boolean(
    antiNuke?.config?.panicMode?.lockdown?.lockAllCommands,
  );
  const decision = buildSecurityLockDecision({
    antiNukePanic,
    autoModPanic,
    joinRaid,
    lockAllCommands,
    joinRaidLockCommands,
  });
  const commandLockActive = await shouldBlockAllCommands(guild).catch(
    () => decision.commandLockActive,
  );
  return {
    ...decision,
    commandLockActive: Boolean(commandLockActive),
    active: Boolean(decision.joinLockActive || commandLockActive),
  };
}

async function shouldBlockIncomingJoins(guild) {
  return Boolean((await getSecurityLockState(guild)).joinLockActive);
}

module.exports = {
  buildSecurityLockDecision,
  getSecurityLockState,
  shouldBlockIncomingJoins,
};