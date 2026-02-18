const {
  EmbedBuilder,
  AuditLogEvent,
  PermissionsBitField,
} = require("discord.js");
const { leaveTtsGuild } = require("../Services/TTS/ttsService");
const {
  handleVoiceActivity,
} = require("../Services/Community/activityService");
const VoiceDisconnectCounter = require("../Schemas/Voice/voiceDisconnectCounterSchema");
const IDs = require("../Utils/Config/ids");

function formatActor(actor) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

async function incrementDisconnectCounter(guildId, userId) {
  if (!guildId || !userId) return 1;
  const row = await VoiceDisconnectCounter.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return Math.max(1, Number(row?.count || 1));
}

async function resolveActivityLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveMemberUpdateAuditInfo(guild, targetUserId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: guild?.client?.user || null, reason: null };
  }

  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 8 })
    .catch(() => null);
  if (!logs?.entries?.size) {
    return { executor: guild?.client?.user || null, reason: null };
  }

  const nowMs = Date.now();
  const entry = logs.entries.find((item) => {
    const createdMs = Number(item?.createdTimestamp || 0);
    const targetId = String(item?.target?.id || "");
    const withinWindow = createdMs > 0 && nowMs - createdMs <= 30 * 1000;
    return withinWindow && targetId === String(targetUserId || "");
  });

  return {
    executor: entry?.executor || guild?.client?.user || null,
    reason: entry?.reason || null,
  };
}

async function resolveMemberMoveAuditInfo(guild, targetUserId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: guild?.client?.user || null, count: 1 };
  }

  const logs = await guild
    .fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 8 })
    .catch(() => null);
  if (!logs?.entries?.size) {
    return { executor: guild?.client?.user || null, count: 1 };
  }

  const nowMs = Date.now();
  const entry = logs.entries.find((item) => {
    const createdMs = Number(item?.createdTimestamp || 0);
    const targetId = String(item?.target?.id || "");
    const withinWindow = createdMs > 0 && nowMs - createdMs <= 30 * 1000;
    return withinWindow && targetId === String(targetUserId || "");
  });

  return {
    executor: entry?.executor || guild?.client?.user || null,
    count: Math.max(1, Number(entry?.extra?.count || 1)),
  };
}

async function sendMemberDisconnectLog(oldState, newState, client) {
  const member = newState?.member || oldState?.member;
  const user = member?.user;
  if (!member || !user) return;
  if (!oldState?.channelId || newState?.channelId) return;

  const guild = newState?.guild || oldState?.guild;
  if (!guild) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const count = await incrementDisconnectCounter(guild.id, user.id);
  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("Member Disconnect")
    .setDescription(
      [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${formatActor(user)}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Additional Information**",
        `<:VC_right_arrow:1473441155055096081> **Count:** ${count}`,
      ].join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function sendMemberMoveLog(oldState, newState) {
  const member = newState?.member || oldState?.member;
  const user = member?.user;
  const guild = newState?.guild || oldState?.guild;
  if (!member || !user || !guild) return;

  const oldChannelId = String(oldState?.channelId || "");
  const newChannelId = String(newState?.channelId || "");
  if (!oldChannelId || !newChannelId || oldChannelId === newChannelId) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const audit = await resolveMemberMoveAuditInfo(guild, user.id);
  const responsibleText = formatActor(audit.executor);
  const destination = newState?.channel || `<#${newChannelId}>`;

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("Member Move")
    .setDescription(
      [
        `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
        `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
        "",
        "**Additional Information**",
        `<:VC_right_arrow:1473441155055096081> **Channel:** ${destination} \`${newChannelId}\``,
        `<:VC_right_arrow:1473441155055096081> **Count:** ${Math.max(1, Number(audit.count || 1))}`,
      ].join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

async function sendMemberVoiceFlagsUpdateLog(oldState, newState) {
  const member = newState?.member || oldState?.member;
  const user = member?.user;
  const guild = newState?.guild || oldState?.guild;
  if (!member || !user || !guild) return;

  const muteChanged = Boolean(oldState?.serverMute) !== Boolean(newState?.serverMute);
  const deafChanged = Boolean(oldState?.serverDeaf) !== Boolean(newState?.serverDeaf);
  if (!muteChanged && !deafChanged) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const audit = await resolveMemberUpdateAuditInfo(guild, user.id);
  const responsibleText = formatActor(audit.executor);

  const lines = [
    `<:VC_right_arrow:1473441155055096081> **Responsible:** ${responsibleText}`,
    `<:VC_right_arrow:1473441155055096081> **Target:** ${user} \`${user.id}\``,
    `<:VC_right_arrow:1473441155055096081> ${toDiscordTimestamp(new Date(), "F")}`,
  ];
  if (audit.reason) {
    lines.push(`<:VC_right_arrow:1473441155055096081> **Reason:** ${audit.reason}`);
  }
  lines.push("", "**Changes**");

  if (muteChanged) {
    lines.push("<:VC_right_arrow:1473441155055096081> **Mute**");
    lines.push(`  ${yesNo(Boolean(oldState?.serverMute))} <:VC_right_arrow:1473441155055096081> ${yesNo(Boolean(newState?.serverMute))}`);
  }
  if (deafChanged) {
    lines.push("<:VC_right_arrow:1473441155055096081> **Deaf**");
    lines.push(`  ${yesNo(Boolean(oldState?.serverDeaf))} <:VC_right_arrow:1473441155055096081> ${yesNo(Boolean(newState?.serverDeaf))}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("Member Update")
    .setDescription(lines.join("\n"));

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    await sendMemberMoveLog(oldState, newState).catch(() => {});
    await sendMemberVoiceFlagsUpdateLog(oldState, newState).catch(() => {});
    await sendMemberDisconnectLog(oldState, newState, client).catch(() => {});

    try {
      await handleVoiceActivity(oldState, newState);
    } catch (error) {
      if (client?.logs?.error) {
        client.logs.error("[ACTIVITY VOICE ERROR]", error);
      } else {
        global.logger.error("[ACTIVITY VOICE ERROR]", error);
      }
    }

    if (client?.config?.tts?.stayConnected) return;

    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      await leaveTtsGuild(guild.id, client);
      return;
    }

    const botMember = guild.members.me || guild.members.cache.get(client.user.id);
    const botChannel = botMember?.voice?.channel;
    if (!botChannel) return;

    const humans = botChannel.members.filter((m) => !m.user.bot);
    if (humans.size === 0) {
      await leaveTtsGuild(guild.id, client);
    }
  },
};


