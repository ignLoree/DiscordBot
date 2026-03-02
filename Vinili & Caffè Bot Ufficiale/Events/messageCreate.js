const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { handleTtsMessage } = require("../Services/TTS/ttsService");
const { handleMinigameMessage } = require("../Services/Minigames/minigameService");
const { handlePoketwoHelperMessage } = require("../Services/Minigames/poketwoHelperService");
const { recordReminderActivity } = require("../Services/Community/chatReminderService");
const { recordMessageActivity } = require("../Services/Community/activityService");
const { handleOfficialPrefixMessage } = require("../Utils/Prefix/officialPrefixDispatcher");
const {
  channelAllowsMedia,
  getCachedOrFetchMember,
  handleDisboardBump,
  handleDiscadiaBump,
  handleSuggestionChannelMessage,
  handleVoteManagerMessage,
  hasMediaPermission,
  isDiscordInviteLinkMessage,
  isMediaMessage,
} = require("../Utils/Message/officialMessageAutomationHandlers");
const {
  handleAfk,
  handleAutoResponders,
  handleCounting,
  handleMentionAutoReactions,
  logEventError,
} = require("../Utils/Message/officialMessageCommunityHandlers");
const { runAutoModMessage } = require("../Services/Moderation/automodService");
const IDs = require("../Utils/Config/ids");

const STAFF_BYPASS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
];
const FORCE_DELETE_CHANNEL_IDS = new Set(
  [IDs.channels.separator7].filter(Boolean).map((id) => String(id)),
);
const MEDIA_BLOCK_EXEMPT_CATEGORY_ID = IDs.categories.categorChat;
const MEDIA_BLOCK_EXEMPT_CHANNEL_IDS = new Set(
  [IDs.channels.media, IDs.channels.musicCommands]
    .filter(Boolean)
    .map((id) => String(id)),
);
const WRONG_PREFIX_HINT_CHANNEL_IDS = new Set(
  [IDs.channels.commands, IDs.channels.staffCmds, IDs.channels.highCmds]
    .filter(Boolean)
    .map((id) => String(id)),
);

function hasAnyStaffBypassPermission(permissions) {
  if (!permissions || typeof permissions.has !== "function") return false;
  return STAFF_BYPASS_PERMISSIONS.some((perm) => permissions.has(perm));
}

function resolvePrefixCommandByToken(client, token) {
  const safe = String(token || "").trim().toLowerCase();
  if (!safe) return null;
  return (
    client?.pcommands?.get?.(safe) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(safe)) ||
    null
  );
}

function parseWrongPrefixAttempt(content, validPrefix = "+") {
  const text = String(content || "").trim();
  const safePrefix = String(validPrefix || "+");
  if (!text || text.startsWith(safePrefix)) return null;
  const direct = text.match(/^((?:[a-z]{1,3})?[?!./-])\s*([a-z0-9][\w-]*)/i);
  if (direct) {
    return {
      usedPrefix: String(direct[1] || ""),
      token: String(direct[2] || "").toLowerCase(),
    };
  }
  const nearMiss = text.match(/^([a-z]{1,3})\s*([?!./-])\s*([a-z0-9][\w-]*)/i);
  if (nearMiss) {
    return {
      usedPrefix: `${String(nearMiss[1] || "")}${String(nearMiss[2] || "")}`,
      token: String(nearMiss[3] || "").toLowerCase(),
    };
  }
  return null;
}

function shouldSendWrongPrefixHint(message, usedPrefix, commandName) {
  const client = message?.client;
  if (!client) return true;
  if (!client._wrongPrefixHintCooldown) {
    client._wrongPrefixHintCooldown = new Map();
  }
  const key = [
    String(message.guildId || "noguild"),
    String(message.channelId || "nochannel"),
    String(message.author?.id || "nouser"),
    String(usedPrefix || ""),
    String(commandName || ""),
  ].join(":");
  const now = Date.now();
  const lastAt = Number(client._wrongPrefixHintCooldown.get(key) || 0);
  if (now - lastAt < 10_000) return false;
  client._wrongPrefixHintCooldown.set(key, now);
  return true;
}

async function maybeSendWrongPrefixHint(message, resolvedClient, validPrefix = "+") {
  if (!WRONG_PREFIX_HINT_CHANNEL_IDS.has(String(message?.channelId || ""))) {
    return false;
  }
  const safePrefix = String(validPrefix || "+");
  const attempt = parseWrongPrefixAttempt(message?.content || "", safePrefix);
  if (!attempt?.token || !attempt?.usedPrefix) return false;
  if (attempt.usedPrefix === safePrefix) return false;
  const command = resolvePrefixCommandByToken(resolvedClient, attempt.token);
  if (!command) return false;
  const cmdName = String(command.name || "").toLowerCase();
  if (cmdName === "help") return false;
  if (!shouldSendWrongPrefixHint(message, attempt.usedPrefix, command.name)) {
    return true;
  }
  const hint = await message.channel
    .send({
      content: `\`${attempt.usedPrefix}${attempt.token}\` non è valido. Usa \`${safePrefix}${command.name}\`.`,
    })
    .catch(() => null);
  if (hint) setTimeout(() => hint.delete().catch(() => {}), 6000);
  return true;
}

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (!message) return;
    const resolvedClient = client || message.client;
    if (!resolvedClient) return;

    const isAutomatedMessage = Boolean(
      message.author?.bot || message.webhookId || message.applicationId,
    );
    const isOwnBotMessage =
      String(message.author?.id || "") === String(resolvedClient.user?.id || "");
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    const defaultPrefix = String(resolvedClient?.config?.prefix || "+");
    let automodProcessed = false;

    const runAutomodOnce = async () => {
      if (automodProcessed) return { blocked: false, skipped: true };
      automodProcessed = true;
      if (isAutomatedMessage) return { blocked: false, skipped: true };
      return runAutoModMessage(message);
    };

    if (!isEditedPrefixExecution && message?.guild) {
      try {
        await handlePoketwoHelperMessage(message);
        if (message.author?.id !== resolvedClient?.user?.id) {
          const handledVote = await handleVoteManagerMessage(message, resolvedClient);
          if (handledVote) return;
        }
        if (message.author?.bot || message.webhookId || message.applicationId) {
          if (await handleDisboardBump(message, resolvedClient)) return;
          if (await handleDiscadiaBump(message, resolvedClient)) return;
        }
      } catch (error) {
        logEventError(resolvedClient, "EARLY BUMP/VOTE HANDLER ERROR", error);
      }
    }

    if (
      FORCE_DELETE_CHANNEL_IDS.has(String(message?.channelId || "")) &&
      !message?.system
    ) {
      if (isAutomatedMessage && !isOwnBotMessage) return;
      if (!isEditedPrefixExecution) {
        try {
          const automodResult = await runAutomodOnce();
          if (automodResult?.blocked) return;
        } catch (error) {
          logEventError(resolvedClient, "AUTOMOD ERROR", error);
        }
      }
      await message.delete().catch(() => {});
      return;
    }

    if (!isEditedPrefixExecution) {
      try {
        const automodResult = await runAutomodOnce();
        if (automodResult?.blocked) return;
      } catch (error) {
        logEventError(resolvedClient, "AUTOMOD ERROR", error);
      }
    }

    try {
      if (!isEditedPrefixExecution) {
        if (
          message.guild &&
          message.member &&
          !isAutomatedMessage &&
          isMediaMessage(message) &&
          !isDiscordInviteLinkMessage(message) &&
          !hasMediaPermission(message.member) &&
          !channelAllowsMedia(message) &&
          message.channel?.parentId !== MEDIA_BLOCK_EXEMPT_CATEGORY_ID &&
          !MEDIA_BLOCK_EXEMPT_CHANNEL_IDS.has(message.channel?.id)
        ) {
          await message.delete().catch(() => {});
          const embed = new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              [
                `<:attentionfromvega:1443651874032062505> Ciao ${message.author}, __non hai i permessi__ per inviare \`FOTO, GIF, LINK, VIDEO O AUDIO\` in chat.`,
                "",
                "<a:VC_StarPink:1330194976440848500> ➥ **__Sblocca il permesso:__**",
                `<a:VC_Arrow:1448672967721615452> Ottieni il ruolo: <@&${IDs.roles.PicPerms}>.`,
              ].join("\n"),
            );
          await message.channel
            .send({ content: `${message.author}`, embeds: [embed] })
            .catch(() => null);
          return;
        }
        if (message.author?.id !== resolvedClient?.user?.id) {
          if (await handleVoteManagerMessage(message, resolvedClient)) return;
        }
        if (await handleDisboardBump(message, resolvedClient)) return;
        if (await handleDiscadiaBump(message, resolvedClient)) return;
        if (await handleSuggestionChannelMessage(message)) return;
      }
    } catch (error) {
      logEventError(resolvedClient, "DISBOARD REMINDER ERROR", error);
    }

    if (message.author.bot || !message.guild || message.system || message.webhookId) {
      return;
    }

    if (!isEditedPrefixExecution) {
      try {
        if (message.channelId === IDs.channels.joinLeaveLogs) {
          recordReminderActivity(message.channelId);
        }
      } catch (error) {
        logEventError(resolvedClient, "REMINDER ACTIVITY ERROR", error);
      }
      setImmediate(() => {
        recordMessageActivity(message).catch((err) =>
          logEventError(resolvedClient, "ACTIVITY MESSAGE ERROR", err),
        );
      });

      const [minigameResult, afkResult, mentionsResult, autoRespondersResult, countingResult] =
        await Promise.allSettled([
          handleMinigameMessage(message, resolvedClient),
          handleAfk(message),
          handleMentionAutoReactions(message),
          handleAutoResponders(message),
          handleCounting(message, resolvedClient),
        ]);
      if (minigameResult.status === "rejected") {
        logEventError(resolvedClient, "MINIGAME ERROR", minigameResult.reason);
      }
      if (afkResult.status === "rejected") {
        logEventError(resolvedClient, "AFK ERROR", afkResult.reason);
      }
      if (mentionsResult.status === "rejected") {
        logEventError(resolvedClient, "MENTION REACTION ERROR", mentionsResult.reason);
      }
      if (autoRespondersResult.status === "rejected") {
        logEventError(resolvedClient, "AUTORESPONDER ERROR", autoRespondersResult.reason);
      }
      if (countingResult.status === "rejected") {
        logEventError(resolvedClient, "COUNTING ERROR", countingResult.reason);
      }
    }

    let overrideCommand = null;
    if (!isEditedPrefixExecution) {
      try {
        await handleTtsMessage(message, resolvedClient, defaultPrefix);
      } catch (error) {
        logEventError(resolvedClient, "TTS ERROR", error);
      }
    }

    await handleOfficialPrefixMessage({
      message,
      resolvedClient,
      defaultPrefix,
      overrideCommand,
      maybeSendWrongPrefixHint,
      getCachedOrFetchMember,
      hasAnyStaffBypassPermission,
    });
  },
};