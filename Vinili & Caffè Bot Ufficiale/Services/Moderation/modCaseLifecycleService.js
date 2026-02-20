const { ModCase } = require("../../Schemas/Moderation/moderationSchemas");
const { closeCase } = require("../../Utils/Moderation/moderation");

const LOOP_MS = 60 * 1000;
const BATCH_SIZE = 50;
let loopHandle = null;

function isUnknownBanError(error) {
  const code = Number(error?.code || 0);
  if (code === 10026) return true;
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("unknown ban");
}

async function tryUnban(guild, userId, reason) {
  if (!guild || !userId) return false;
  try {
    await guild.bans.remove(String(userId), reason);
    return true;
  } catch (error) {
    if (isUnknownBanError(error)) return true;
    return false;
  }
}

async function tryUnlockChannel(guild, channelId) {
  if (!guild || !channelId) return false;
  const channel =
    guild.channels.cache.get(String(channelId)) ||
    (await guild.channels.fetch(String(channelId)).catch(() => null));
  if (!channel?.permissionOverwrites?.edit) return false;
  try {
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { SendMessages: null, SendMessagesInThreads: null },
      { reason: "Auto unlock: timed lock expired" },
    );
    return true;
  } catch {
    return false;
  }
}

async function closeExpiredMuteCases(client, now) {
  const rows = await ModCase.find({
    action: "MUTE",
    active: true,
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1 })
    .limit(BATCH_SIZE)
    .exec();

  for (const row of rows) {
    const guild =
      client.guilds.cache.get(String(row.guildId || "")) ||
      (await client.guilds.fetch(String(row.guildId || "")).catch(() => null));
    if (!guild) {
      closeCase(row, "Mute scaduto (guild non disponibile)");
      await row.save().catch(() => null);
      continue;
    }
    const member = await guild.members.fetch(String(row.userId || "")).catch(() => null);
    if (!member || !member.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp <= Date.now()) {
      closeCase(row, "Mute scaduto automaticamente");
      await row.save().catch(() => null);
    }
  }
}

async function closeExpiredBanCases(client, now) {
  const rows = await ModCase.find({
    action: "BAN",
    active: true,
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1 })
    .limit(BATCH_SIZE)
    .exec();

  for (const row of rows) {
    const guild =
      client.guilds.cache.get(String(row.guildId || "")) ||
      (await client.guilds.fetch(String(row.guildId || "")).catch(() => null));
    if (!guild) {
      closeCase(row, "Ban temporaneo scaduto (guild non disponibile)");
      await row.save().catch(() => null);
      continue;
    }
    const unbanned = await tryUnban(
      guild,
      row.userId,
      `Timed ban expired (case #${row.caseId})`,
    );
    if (!unbanned) continue;
    closeCase(row, "Ban temporaneo scaduto: utente sbannato automaticamente");
    await row.save().catch(() => null);
  }
}

async function closeExpiredLockCases(client, now) {
  const rows = await ModCase.find({
    action: "LOCK",
    active: true,
    expiresAt: { $lte: now },
    userId: { $regex: /^CHANNEL:/ },
  })
    .sort({ expiresAt: 1 })
    .limit(BATCH_SIZE)
    .exec();

  for (const row of rows) {
    const guild =
      client.guilds.cache.get(String(row.guildId || "")) ||
      (await client.guilds.fetch(String(row.guildId || "")).catch(() => null));
    if (!guild) {
      closeCase(row, "Lock temporaneo scaduto (guild non disponibile)");
      await row.save().catch(() => null);
      continue;
    }
    const channelId = String(row.userId || "").replace(/^CHANNEL:/, "");
    const unlocked = await tryUnlockChannel(guild, channelId);
    if (!unlocked) continue;
    closeCase(row, "Lock temporaneo scaduto: canale sbloccato automaticamente");
    await row.save().catch(() => null);
  }
}

async function runModCaseLifecycleTick(client) {
  if (!client?.guilds) return;
  const now = new Date();
  await closeExpiredMuteCases(client, now);
  await closeExpiredBanCases(client, now);
  await closeExpiredLockCases(client, now);
}

function startModCaseLifecycleLoop(client) {
  if (loopHandle) return loopHandle;
  const runner = async () => {
    await runModCaseLifecycleTick(client).catch((error) => {
      global.logger?.error?.("[MOD CASE LIFECYCLE] Tick failed", error);
    });
  };
  runner().catch(() => {});
  loopHandle = setInterval(runner, LOOP_MS);
  if (typeof loopHandle.unref === "function") loopHandle.unref();
  return loopHandle;
}

module.exports = { startModCaseLifecycleLoop, runModCaseLifecycleTick };
