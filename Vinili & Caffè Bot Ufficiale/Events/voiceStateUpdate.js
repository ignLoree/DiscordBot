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

function formatRomeDate(date = new Date()) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Rome",
  }).format(date);
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
  const nowText = formatRomeDate(new Date());

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("Member Disconnect")
    .setDescription(
      [
        `▸ **Responsible:** ${user} \`${user.id}\``,
        `▸ ${nowText}`,
        "",
        "**Additional Information**",
        `〉 **Count:** ${count}`,
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
  const responsibleText = audit.executor
    ? `${audit.executor} \`${audit.executor.id}\``
    : "sconosciuto";

  const lines = [
    `▸ **Responsible:** ${responsibleText}`,
    `▸ **Target:** ${user} \`${user.id}\``,
    `▸ ${formatRomeDate(new Date())}`,
  ];
  if (audit.reason) {
    lines.push(`▸ **Reason:** ${audit.reason}`);
  }
  lines.push("", "**Changes**");

  if (muteChanged) {
    lines.push("▸ **Mute**");
    lines.push(`  ${yesNo(Boolean(oldState?.serverMute))} 〉 ${yesNo(Boolean(newState?.serverMute))}`);
  }
  if (deafChanged) {
    lines.push("▸ **Deaf**");
    lines.push(`  ${yesNo(Boolean(oldState?.serverDeaf))} 〉 ${yesNo(Boolean(newState?.serverDeaf))}`);
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
