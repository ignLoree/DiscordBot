const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter");
const {
  checkPrefixPermission,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
} = require("../Moderation/commandPermissions");
const {
  getUserCommandCooldownSeconds,
  consumeUserCooldown,
} = require("../Moderation/commandCooldown");
const {
  buildCooldownErrorEmbed,
  buildBusyCommandErrorEmbed,
  buildMissingArgumentsErrorEmbed,
  buildInternalCommandErrorEmbed,
} = require("../Moderation/commandErrorEmbeds");
const { buildErrorLogEmbed } = require("../Logging/errorLogEmbed");
const { getCentralChannel } = require("../Logging/commandUsageLogger");
const { shouldBlockModerationCommands } = require("../../Services/Moderation/antiNukeService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService");
const {
  getCommandExecutionGate,
  inferModuleKeyFromPrefixCommand,
} = require("../../Services/Dashboard/controlCenterService");
const { showPrefixUsageGuide } = require("../Moderation/prefixUsageGuide");
const IDs = require("../Config/ids");

const PREFIX_COOLDOWN_BYPASS_ROLE_ID = IDs.roles.Staff;
const PREFIX_PRECHECK_TIMEOUT_MS = 4000;

function hasSendablePayload(data) {
  if (typeof data === "string") return data.trim().length > 0;
  if (!data || typeof data !== "object") return false;
  const hasContent =
    typeof data.content === "string"
      ? data.content.trim().length > 0
      : data.content != null;
  return Boolean(
    hasContent ||
      (Array.isArray(data.embeds) && data.embeds.length > 0) ||
      (Array.isArray(data.components) && data.components.length > 0) ||
      (Array.isArray(data.files) && data.files.length > 0) ||
      (Array.isArray(data.stickers) && data.stickers.length > 0) ||
      (Array.isArray(data.attachments) && data.attachments.length > 0) ||
      data.poll,
  );
}

async function sendTemporaryMessage(channel, payload, ttlMs) {
  const sent = await channel.send(payload).catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => {}), ttlMs);
  return sent;
}

async function resolveWithTimeout(task, fallbackValue, label, timeoutMs = PREFIX_PRECHECK_TIMEOUT_MS) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } catch (error) {
    global.logger?.warn?.(`[PREFIX] ${label} failed:`, error);
    return fallbackValue;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveSubcommandState(command, cmd, args) {
  const rawPrefixSubcommandArg = args[0] ? String(args[0]).toLowerCase() : null;
  const prefixSubcommandFromArgs =
    rawPrefixSubcommandArg && command?.subcommandAliases
      ? command.subcommandAliases[rawPrefixSubcommandArg] || rawPrefixSubcommandArg
      : rawPrefixSubcommandArg;
  const prefixSubcommandFromAlias =
    !rawPrefixSubcommandArg && command?.subcommandAliases
      ? command.subcommandAliases[cmd] || null
      : null;
  const prefixSubcommand =
    prefixSubcommandFromArgs || prefixSubcommandFromAlias || null;

  if (
    rawPrefixSubcommandArg &&
    prefixSubcommandFromArgs &&
    rawPrefixSubcommandArg !== prefixSubcommandFromArgs
  ) {
    args[0] = prefixSubcommandFromArgs;
  }
  if (!prefixSubcommandFromArgs && prefixSubcommandFromAlias) {
    args.unshift(prefixSubcommandFromAlias);
  }

  return prefixSubcommand;
}

async function executePrefixCommandRuntime({
  payload,
  resolvedClient,
}) {
  const {
    message: execMessage,
    args: execArgs,
    command: execCommand,
  } = payload;

  const originalReply = execMessage.reply.bind(execMessage);
  const commandMessage = Object.create(execMessage);
  commandMessage.reply = (replyPayload) => {
    const withFooter = applyDefaultFooterToEmbeds(replyPayload, execMessage.guild);
    if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
    return originalReply(withFooter);
  };

  const originalChannelSend = execMessage.channel?.send?.bind(execMessage.channel);
  const commandChannel = execMessage.channel
    ? Object.create(execMessage.channel)
    : execMessage.channel;

  if (originalChannelSend) {
    commandChannel.send = (sendPayload) => {
      const withFooter = applyDefaultFooterToEmbeds(sendPayload, execMessage.guild);
      if (!hasSendablePayload(withFooter)) return Promise.resolve(null);

      const sendWithReferenceFallback = async (primaryPayload, fallbackPayload) => {
        try {
          return await originalChannelSend(primaryPayload);
        } catch (error) {
          const hasUnknownRef =
            error?.code === 50035 &&
            Boolean(error?.rawError?.errors?.message_reference);
          if (!hasUnknownRef) throw error;
          return originalChannelSend(fallbackPayload);
        }
      };

      if (typeof withFooter === "string") {
        return sendWithReferenceFallback(
          {
            content: withFooter,
            reply: {
              messageReference: execMessage.id,
              failIfNotExists: false,
            },
            allowedMentions: { repliedUser: false },
            failIfNotExists: false,
          },
          {
            content: withFooter,
            allowedMentions: { repliedUser: false },
          },
        );
      }

      if (!withFooter || typeof withFooter !== "object") {
        return originalChannelSend(withFooter);
      }

      const normalized = {
        ...withFooter,
        reply:
          withFooter.reply ||
          (withFooter.messageReference
            ? undefined
            : { messageReference: execMessage.id, failIfNotExists: false }),
        failIfNotExists: withFooter.failIfNotExists ?? false,
        allowedMentions: {
          ...(withFooter.allowedMentions || {}),
          repliedUser: withFooter.allowedMentions?.repliedUser ?? false,
        },
      };
      const fallback = { ...normalized };
      delete fallback.reply;
      delete fallback.messageReference;
      delete fallback.failIfNotExists;
      return sendWithReferenceFallback(normalized, fallback);
    };
  }

  const originalSendTyping = execMessage.channel?.sendTyping?.bind(execMessage.channel);
  let typingStartTimer = null;
  let typingPulseTimer = null;
  let commandFinished = false;

  if (originalSendTyping) {
    const sendTypingSafe = async () => {
      if (commandFinished) return;
      try {
        await originalSendTyping();
      } catch {}
    };

    typingStartTimer = setTimeout(async () => {
      if (commandFinished) return;
      await sendTypingSafe();
      typingPulseTimer = setInterval(() => {
        void sendTypingSafe();
      }, 8000);
    }, 2500);

    commandChannel.sendTyping = async () => {
      await sendTypingSafe();
    };
  }

  if (commandChannel) {
    commandMessage.channel = commandChannel;
  }

  try {
    await Promise.resolve(execCommand.execute(commandMessage, execArgs, resolvedClient));
  } catch (error) {
    const channelID = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
    const errorChannel = channelID
      ? await getCentralChannel(resolvedClient, channelID)
      : null;
    const errorEmbed = buildErrorLogEmbed({
      contextLabel: "Comando",
      contextValue: execCommand?.name || "unknown",
      userTag: execMessage.author?.tag || "unknown",
      error,
      serverName: execMessage.guild
        ? `${execMessage.guild.name} [${execMessage.guild.id}]`
        : null,
    });

    if (errorChannel?.isTextBased?.()) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("error_pending")
          .setLabel("In risoluzione")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("error_solved")
          .setLabel("Risolto")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("error_unsolved")
          .setLabel("Irrisolto")
          .setStyle(ButtonStyle.Danger),
      );
      const sentError = await errorChannel
        .send({ embeds: [errorEmbed], components: [row] })
        .catch(() => null);

      if (sentError) {
        const collector = sentError.createMessageComponentCollector({
          time: 1000 * 60 * 60 * 24,
        });
        collector.on("collect", async (btn) => {
          if (
            !["error_pending", "error_solved", "error_unsolved"].includes(
              btn.customId,
            )
          ) return;
          if (!btn.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await btn.reply({
              content:
                "<:vegax:1443934876440068179> Non hai i permessi per fare questo comando.",
              flags: 1 << 6,
            }).catch(() => null);
            return;
          }

          if (btn.customId === "error_pending") {
            errorEmbed.setColor("Yellow");
            await btn.reply({ content: "In risoluzione.", flags: 1 << 6 }).catch(() => null);
          }
          if (btn.customId === "error_solved") {
            errorEmbed.setColor("Green");
            await btn.reply({ content: "Risolto.", flags: 1 << 6 }).catch(() => null);
          }
          if (btn.customId === "error_unsolved") {
            errorEmbed.setColor("Red");
            await btn.reply({ content: "Irrisolto.", flags: 1 << 6 }).catch(() => null);
          }

          await sentError.edit({ embeds: [errorEmbed], components: [row] }).catch(() => null);
        });
      }
    }

    const feedback = buildInternalCommandErrorEmbed(error);
    return execMessage.reply({ embeds: [feedback] }).catch(() => null);
  } finally {
    commandFinished = true;
    if (typingStartTimer) clearTimeout(typingStartTimer);
    if (typingPulseTimer) clearInterval(typingPulseTimer);
  }

  return null;
}

async function drainPrefixQueue(lockId, resolvedClient) {
  const resolveQueuedMessage = async (payload) => {
    const fallback = payload?.message || null;
    const channelId = String(payload?.channelId || fallback?.channelId || "");
    const messageId = String(payload?.messageId || fallback?.id || "");
    if (!channelId || !messageId) return fallback;
    try {
      const channel =
        resolvedClient.channels?.cache?.get(channelId) ||
        (await resolvedClient.channels.fetch(channelId).catch(() => null));
      if (!channel?.messages?.fetch) return fallback;
      return (await channel.messages.fetch(messageId).catch(() => null)) || fallback;
    } catch {
      return fallback;
    }
  };

  const removeLoadingReaction = async (msg) => {
    try {
      const loadingId = IDs.emojis?.loadingAnimatedId;
      const fallbackId = IDs.emojis?.loadingFallbackId;
      const emoji = loadingId ? msg.client?.emojis?.cache?.get(loadingId) : null;
      if (emoji) {
        const react = msg.reactions.resolve(emoji.id);
        if (react) await react.users.remove(resolvedClient.user.id);
      }
      const fallback =
        msg.reactions.resolve("VC_Loading") ||
        (fallbackId ? msg.reactions.resolve(fallbackId) : null);
      if (fallback) await fallback.users.remove(resolvedClient.user.id);
    } catch {}
  };

  let queue = resolvedClient.prefixCommandQueue.get(lockId);
  while (queue && queue.length > 0) {
    const next = queue.shift();
    const hydratedMessage = await resolveQueuedMessage(next);
    if (!hydratedMessage?.channel) continue;
    next.message = hydratedMessage;
    await removeLoadingReaction(next.message);
    resolvedClient.prefixCommandLocks.add(lockId);
    try {
      await executePrefixCommandRuntime({ payload: next, resolvedClient });
    } finally {
      resolvedClient.prefixCommandLocks.delete(lockId);
    }
    queue = resolvedClient.prefixCommandQueue.get(lockId);
  }

  if (queue && queue.length === 0) {
    resolvedClient.prefixCommandQueue.delete(lockId);
  }
}

async function handleOfficialPrefixMessage({
  message,
  resolvedClient,
  defaultPrefix,
  overrideCommand = null,
  maybeSendWrongPrefixHint,
  getCachedOrFetchMember,
  hasAnyStaffBypassPermission,
}) {
  const startsWithDefault = message.content.startsWith(defaultPrefix);
  const deleteCommandMessage = async () => {
    await message.delete().catch(() => {});
  };

  if (!startsWithDefault) {
    await maybeSendWrongPrefixHint(message, resolvedClient, defaultPrefix);
    return;
  }

  const usedPrefix = defaultPrefix;
  const args = message.content
    .slice(usedPrefix.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const cmd = overrideCommand ? overrideCommand.name : args.shift()?.toLowerCase();
  if (!cmd) return;

  const command =
    overrideCommand ||
    resolvedClient.pcommands.get(cmd) ||
    resolvedClient.pcommands.get(resolvedClient.aliases.get(cmd));
  if (!command) return;

  const dashboardGate = getCommandExecutionGate({
    guildId: message.guild?.id,
    commandType: "prefix",
    commandName: command?.name,
    moduleKey: inferModuleKeyFromPrefixCommand(command),
    member: message.member,
    guildOwnerId: message.guild?.ownerId,
  });
  if (!dashboardGate.allowed) {
    await deleteCommandMessage();
    const reasonText =
      dashboardGate.reason === "module_disabled" ||
      dashboardGate.reason === "command_disabled"
        ? "Comando disattivato dalla dashboard."
        : "Comando in manutenzione dalla dashboard.";
    await sendTemporaryMessage(
      message.channel,
      { content: `<:VC_right_arrow:1473441155055096081> ${reasonText}` },
      5000,
    );
    return;
  }

  const isAntiNukeRecoveryCommand = ["antinuke", "security"].includes(
    String(command?.name || "").toLowerCase(),
  );
  const securityLockState = await resolveWithTimeout(
    () => getSecurityLockState(message.guild),
    {
      active: false,
      joinLockActive: false,
      commandLockActive: false,
      sources: [],
      commandSources: [],
    },
    "security lock precheck",
  );
  if (!isAntiNukeRecoveryCommand && securityLockState.commandLockActive) {
    const lockSources = Array.isArray(securityLockState.commandSources)
      ? securityLockState.commandSources
      : securityLockState.sources;
    await deleteCommandMessage();
    await sendTemporaryMessage(
      message.channel,
      {
        content:
          `<:VC_right_arrow:1473441155055096081> Server in lockdown di sicurezza: comandi temporaneamente bloccati.${lockSources?.length ? ` (${lockSources.join(", ")})` : ""}`,
      },
      5000,
    );
    return;
  }

  if (
    !isAntiNukeRecoveryCommand &&
    ["staff", "admin"].includes(String(command.folder || "").toLowerCase()) &&
    (await shouldBlockModerationCommands(
      message.guild,
      String(message.author?.id || ""),
    ))
  ) {
    await deleteCommandMessage();
    await sendTemporaryMessage(
      message.channel,
      {
        content:
          "<:VC_right_arrow:1473441155055096081> Comandi di moderazione temporaneamente bloccati (panic mode sicurezza attiva).",
      },
      5000,
    );
    return;
  }

  const prefixSubcommand = resolveSubcommandState(command, cmd, args);
  const permissionResult = await resolveWithTimeout(
    () =>
      checkPrefixPermission(message, command.name, prefixSubcommand, {
        returnDetails: true,
      }),
    { allowed: true, reason: null, requiredRoles: null, channels: null },
    `permission precheck for ${command.name}`,
  );
  if (!permissionResult?.allowed) {
    if (
      permissionResult?.reason === "channel" &&
      Array.isArray(permissionResult.channels)
    ) {
      await deleteCommandMessage();
      const embed = buildGlobalChannelDeniedEmbed(
        permissionResult.channels,
        "comando",
      );
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, 5000);
      return;
    }
    const requiredRoles = getPrefixRequiredRoles(command.name, prefixSubcommand);
    const embed = buildGlobalPermissionDeniedEmbed(requiredRoles);
    await deleteCommandMessage();
    await sendTemporaryMessage(message.channel, { embeds: [embed] }, 2000);
    return;
  }

  const hasSubcommands = Boolean(
    (Array.isArray(command?.subcommands) && command.subcommands.length > 0) ||
      (command?.subcommandAliases &&
        typeof command.subcommandAliases === "object" &&
        Object.keys(command.subcommandAliases).length > 0),
  );
  const requireArgsForSubcommands = hasSubcommands && !Boolean(command?.allowEmptyArgs);
  if (!args.length && (Boolean(command?.args) || requireArgsForSubcommands)) {
    const shown = await showPrefixUsageGuide({
      message,
      command,
      prefix: usedPrefix || "+",
      deleteCommandMessage: null,
    });
    if (!shown) {
      const embed = buildMissingArgumentsErrorEmbed();
      await deleteCommandMessage();
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, 2000);
    }
    return;
  }

  let hasPrefixCooldownBypass = Boolean(
    message.member?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID) ||
      hasAnyStaffBypassPermission(message.member?.permissions) ||
      String(message.guild?.ownerId || "") === String(message.author?.id || ""),
  );
  const needsFreshMemberForCooldownBypass =
    !hasPrefixCooldownBypass &&
    (!message.member?.permissions || !message.member?.roles?.cache);
  if (needsFreshMemberForCooldownBypass) {
    const fetchedMember = await getCachedOrFetchMember(
      message.guild,
      message.author.id,
    );
    hasPrefixCooldownBypass = Boolean(
      fetchedMember?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID) ||
        hasAnyStaffBypassPermission(fetchedMember?.permissions) ||
        String(message.guild?.ownerId || "") === String(message.author?.id || ""),
    );
  }

  if (!hasPrefixCooldownBypass) {
    const cooldownSeconds = await resolveWithTimeout(
      () =>
        getUserCommandCooldownSeconds({
          guildId: message.guild.id,
          userId: message.author.id,
          member: message.member,
        }),
      0,
      `cooldown lookup for ${command.name}`,
    );
    const cooldownResult = consumeUserCooldown({
      client: resolvedClient,
      guildId: message.guild.id,
      userId: message.author.id,
      cooldownSeconds,
    });
    if (!cooldownResult.ok) {
      const remaining = Math.max(1, Math.ceil(cooldownResult.remainingMs / 1000));
      const embed = buildCooldownErrorEmbed(remaining);
      await message.channel.send({ embeds: [embed] }).catch(() => null);
      return;
    }
  }

  if (!resolvedClient.prefixCommandLocks) resolvedClient.prefixCommandLocks = new Set();
  if (!resolvedClient.prefixCommandQueue) resolvedClient.prefixCommandQueue = new Map();
  if (!resolvedClient.prefixCommandBusyNoticeAt) {
    resolvedClient.prefixCommandBusyNoticeAt = new Map();
  }

  const userId = message.author.id;
  const queueLockId = `${message.guild.id}:${userId}`;
  const sendBusyQueueNotice = async () => {
    const now = Date.now();
    const lastNoticeAt = resolvedClient.prefixCommandBusyNoticeAt.get(queueLockId) || 0;
    if (now - lastNoticeAt < 5000) return;
    resolvedClient.prefixCommandBusyNoticeAt.set(queueLockId, now);
    const embed = buildBusyCommandErrorEmbed();
    await sendTemporaryMessage(message.channel, { embeds: [embed] }, 5000);
  };

  const enqueueCommand = async () => {
    const loadingEmojiId = IDs.emojis?.loadingAnimatedId;
    const fallbackEmojiId = IDs.emojis?.loadingFallbackId;
    const emoji = loadingEmojiId
      ? message.client?.emojis?.cache?.get(loadingEmojiId)
      : null;
    if (emoji) {
      await message.react(emoji).catch(() => {});
    } else if (fallbackEmojiId) {
      await message.react(fallbackEmojiId).catch(() => {});
    } else {
      await message.react("\u23F3").catch(() => {});
    }

    if (!resolvedClient.prefixCommandQueue.has(queueLockId)) {
      resolvedClient.prefixCommandQueue.set(queueLockId, []);
    }
    resolvedClient.prefixCommandQueue.get(queueLockId).push({
      message,
      args,
      command,
      channelId: message.channelId,
      messageId: message.id,
      enqueuedAt: Date.now(),
    });
  };

  if (resolvedClient.prefixCommandLocks.has(queueLockId)) {
    await enqueueCommand();
    await sendBusyQueueNotice();
    return;
  }

  resolvedClient.prefixCommandLocks.add(queueLockId);
  try {
    await executePrefixCommandRuntime({
      payload: { message, args, command },
      resolvedClient,
    });
  } finally {
    resolvedClient.prefixCommandLocks.delete(queueLockId);
    await drainPrefixQueue(queueLockId, resolvedClient);
  }
}

module.exports = { handleOfficialPrefixMessage };
