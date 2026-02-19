const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require("discord.js");
const math = require("mathjs");
const { MentionReaction, AutoResponder } = require("../Schemas/Community/autoInteractionSchemas");
const countschema = require("../Schemas/Counting/countingSchema");
const AFK = require("../Schemas/Afk/afkSchema");
const { handleTtsMessage } = require("../Services/TTS/ttsService");
const { recordDiscadiaBump, recordDiscadiaVote, recordBump } = require("../Services/Bump/bumpService");
const { handleMinigameMessage } = require("../Services/Minigames/minigameService");
const { recordReminderActivity } = require("../Services/Community/chatReminderService");
const { recordMessageActivity } = require("../Services/Community/activityService");
const {
  addExpWithLevel,
  shouldIgnoreExpForMember,
} = require("../Services/Community/expService");
const { applyDefaultFooterToEmbeds } = require("../Utils/Embeds/defaultFooter");
const { checkPrefixPermission, getPrefixRequiredRoles, buildGlobalPermissionDeniedEmbed } = require("../Utils/Moderation/commandPermissions");
const { getUserCommandCooldownSeconds, consumeUserCooldown } = require("../Utils/Moderation/commandCooldown");
const { buildCooldownErrorEmbed, buildMissingArgumentsErrorEmbed, buildCommandTimeoutErrorEmbed, buildInternalCommandErrorEmbed } = require("../Utils/Moderation/commandErrorEmbeds");
const { buildErrorLogEmbed } = require("../Utils/Logging/errorLogEmbed");
const { getGuildAutoResponderCache, setGuildAutoResponderCache } = require("../Utils/Community/autoResponderCache");
const { safeMessageReply } = require("../Utils/Moderation/reply");
const { upsertVoteRole } = require("../Services/Community/communityOpsService");
const { runAutoModMessage } = require("../Services/Moderation/automodService");
const { shouldBlockModerationCommands } = require("../Services/Moderation/antiNukeService");
const IDs = require("../Utils/Config/ids");
const SuggestionCount = require("../Schemas/Suggestion/suggestionSchema");

const PREFIX_COOLDOWN_BYPASS_ROLE_ID = IDs.roles.Staff;
const COMMAND_EXECUTION_TIMEOUT_MS = 60 * 1000;
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
const VOTE_CHANNEL_ID = IDs.channels.supporters;
const VOTE_ROLE_ID = IDs.roles.Voter;
const VOTE_URL = IDs.links.vote;
const VOTE_ROLE_DURATION_MS = 24 * 60 * 60 * 1000;
const COUNTING_CHANNEL_ID = IDs.channels.counting;
const COUNTING_ALLOWED_REGEX = /^[0-9+\-*/x:() ]+$/;
const FORCE_DELETE_CHANNEL_IDS = new Set(
  [IDs.channels.separator7].filter(Boolean).map((id) => String(id)),
);
const MEDIA_BLOCK_ROLE_IDS = [IDs.roles.PicPerms].filter(Boolean);
const MEDIA_BLOCK_EXEMPT_CATEGORY_ID = IDs.categories.categorChat;
const MEDIA_BLOCK_EXEMPT_CHANNEL_IDS = new Set(
  [IDs.channels.media].filter(Boolean).map((id) => String(id)),
);

const processedBumpMessages = new Map();

function hasMediaPermission(member) {
  return MEDIA_BLOCK_ROLE_IDS.some((roleId) =>
    member?.roles?.cache?.has(roleId),
  );
}

function channelAllowsMedia(message) {
  const channel = message?.channel;
  const member = message?.member;
  if (!channel || !member) return false;
  const perms = channel.permissionsFor(member);
  if (!perms) return false;
  const hasAttachment = Boolean(message.attachments?.size);
  const hasLink =
    /https?:\/\/\S+/i.test(String(message.content || "")) ||
    /discord\.gg\/\S+|\.gg\/\S+/i.test(String(message.content || ""));
  if (hasAttachment) return perms.has("AttachFiles");
  if (hasLink) return perms.has("EmbedLinks");
  return perms.has("AttachFiles") || perms.has("EmbedLinks");
}

function isMediaMessage(message) {
  if (message.attachments?.size) return true;
  const content = String(message.content || "");
  if (/https?:\/\/\S+/i.test(content)) return true;
  if (/discord\.gg\/\S+|\.gg\/\S+/i.test(content)) return true;
  return false;
}

function isDiscordInviteLinkMessage(message) {
  const content = String(message?.content || "");
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]{2,}/i.test(
    content,
  );
}

function getRandomExp() {
  const min = 100;
  const max = 250;
  const step = 5;
  const count = Math.floor((max - min) / step) + 1;
  return min + Math.floor(Math.random() * count) * step;
}

function runWithTimeout(taskPromise, timeoutMs, label = "command") {
  let timeoutHandle = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const err = new Error(
        `${label} execution timed out after ${timeoutMs}ms`,
      );
      err.code = "COMMAND_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([taskPromise, timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

function extractVoteCountFromText(text) {
  const cleaned = (text || "").replace(/\*\*/g, "");
  const match = cleaned.match(/(?:have\s+)?got\s+(\d+)\s+votes?/i);
  if (match) return Number(match[1]);
  const matchHave = cleaned.match(/have\s+(\d+)\s+votes?/i);
  if (matchHave) return Number(matchHave[1]);
  const matchAlt = cleaned.match(/(\d+)\s+(?:votes?|voti)/i);
  if (matchAlt) return Number(matchAlt[1]);
  return null;
}

function extractUserIdFromText(text) {
  if (!text) return null;
  const match = text.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function shouldSkipProcessedBump(key, ttlMs = 5 * 60 * 1000) {
  if (!key) return false;
  const now = Date.now();
  const last = processedBumpMessages.get(key) || 0;
  if (last && now - last < ttlMs) return true;
  processedBumpMessages.set(key, now);
  for (const [k, ts] of processedBumpMessages.entries()) {
    if (now - ts > ttlMs) processedBumpMessages.delete(k);
  }
  return false;
}

function extractNameFromText(text) {
  if (!text) return null;
  const match =
    text.match(/(?:^|[\r\n])\s*!?\s*([^\s]+)\s+has voted/i) ||
    text.match(/!?\s*([^\s]+)\s+has voted/i);
  return match?.[1] || null;
}

function sanitizeName(name) {
  if (!name) return null;
  return name.replace(/^[!@#:_*`~\\-\\.]+|[!@#:_*`~\\-\\.]+$/g, "");
}

function flattenEmbedText(embed) {
  if (!embed) return "";
  const parts = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) parts.push(value);
  };
  push(embed.title);
  push(embed.description);
  push(embed.url);
  push(embed.author?.name);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    push(data.url);
    push(data.author?.name);
    push(data.footer?.text);
    if (Array.isArray(data.fields)) {
      for (const field of data.fields) {
        push(field?.name);
        push(field?.value);
      }
    }
  }
  return parts.join("\n");
}

function getMessageTextParts(message) {
  const embed = message.embeds?.[0];
  const embedText = flattenEmbedText(embed);
  return {
    content: message.content || "",
    embedText,
    embedTitle: embed?.title || "",
    fieldsText: "",
  };
}

function findLongestMatchingPrefix(content, prefixes) {
  let matched = null;
  for (const prefix of prefixes) {
    if (!content.startsWith(prefix)) continue;
    if (!matched || prefix.length > matched.length) {
      matched = prefix;
    }
  }
  return matched;
}

function getCommandTokenAfterPrefix(content, prefix) {
  if (!prefix || !content.startsWith(prefix)) return null;
  const raw = content.slice(prefix.length).trim();
  return raw.split(/\s+/)[0]?.toLowerCase() || null;
}

function hasAnyStaffBypassPermission(permissions) {
  if (!permissions || typeof permissions.has !== "function") return false;
  return STAFF_BYPASS_PERMISSIONS.some((perm) => permissions.has(perm));
}

function getPrefixOverrideMap(client) {
  void client;
  return new Map();
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

function parseWrongPrefixAttempt(content) {
  const text = String(content || "").trim();
  if (!text || text.startsWith("+")) return null;
  const direct = text.match(/^([?!./-])\s*([a-z0-9][\w-]*)/i);
  if (direct) {
    return {
      usedPrefix: String(direct[1] || ""),
      token: String(direct[2] || "").toLowerCase(),
    };
  }
  const nearMiss = text.match(/^(?:[a-z]{1,2})\s*([?!./-])\s*([a-z0-9][\w-]*)/i);
  if (nearMiss) {
    return {
      usedPrefix: String(nearMiss[1] || ""),
      token: String(nearMiss[2] || "").toLowerCase(),
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

async function maybeSendWrongPrefixHint(message, resolvedClient) {
  const attempt = parseWrongPrefixAttempt(message?.content || "");
  if (!attempt?.token || !attempt?.usedPrefix) return false;
  if (attempt.usedPrefix === "+") return false;
  const command = resolvePrefixCommandByToken(resolvedClient, attempt.token);
  if (!command) return false;
  if (!shouldSendWrongPrefixHint(message, attempt.usedPrefix, command.name)) {
    return true;
  }
  const hint = await message.channel
    .send({
      content: `\`${attempt.usedPrefix}${attempt.token}\` non è valido. Usa \`+${command.name}\`.`,
    })
    .catch(() => null);
  if (hint) setTimeout(() => hint.delete().catch(() => {}), 6000);
  return true;
}
async function resolveUserFromMessage(message) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;

  const { content, embedText, embedTitle, fieldsText } =
    getMessageTextParts(message);
  const idFromContent =
    extractUserIdFromText(content) ||
    extractUserIdFromText(embedText) ||
    extractUserIdFromText(fieldsText);
  if (idFromContent) {
    return message.guild.members
      .fetch(idFromContent)
      .then((m) => m.user)
      .catch(() => null);
  }

  const nameRaw =
    extractNameFromText(content) ||
    extractNameFromText(embedText) ||
    extractNameFromText(embedTitle) ||
    extractNameFromText(fieldsText);
  const nameClean = sanitizeName(nameRaw);
  if (nameClean) {
    const name = nameClean.toLowerCase();
    const cached = message.guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === name ||
        m.displayName.toLowerCase() === name,
    );
    if (cached) return cached.user;
    const searched = await message.guild.members
      .fetch({ query: nameClean, limit: 5 })
      .catch(() => null);
    if (searched?.size) {
      const exact = searched.find(
        (m) =>
          m.user.username.toLowerCase() === name ||
          m.displayName.toLowerCase() === name,
      );
      return (exact || searched.first()).user || null;
    }
  }

  return null;
}

async function handleVoteManagerMessage(message, client) {
  if (!message.guild) return false;
  if (message.channel?.id !== VOTE_CHANNEL_ID) return false;
  const allowedBotIds = getVoteManagerBotIds(client);
  const isVoteManagerAuthor = allowedBotIds.has(
    String(message.author?.id || ""),
  );
  const isVoteManagerApp = allowedBotIds.has(
    String(message.applicationId || ""),
  );
  if (!isVoteManagerAuthor && !isVoteManagerApp) return false;
  const { content, embedText, embedTitle, fieldsText } =
    getMessageTextParts(message);
  const voteText =
    `${content} ${embedText} ${embedTitle} ${fieldsText}`.toLowerCase();
  const looksLikeVote =
    /has voted|voted/i.test(voteText) ||
    /ha votato|votato/i.test(voteText) ||
    (voteText.includes("discadia") && /(vote|voto|votato)/i.test(voteText));
  if (!looksLikeVote) return false;

  const user = await resolveUserFromMessage(message);
  const nameRaw =
    extractNameFromText(content) ||
    extractNameFromText(embedText) ||
    extractNameFromText(embedTitle) ||
    extractNameFromText(fieldsText);
  const nameClean = sanitizeName(nameRaw) || "Utente";

  const fullText = `${content} ${embedText} ${embedTitle} ${fieldsText}`;
  const voteCount =
    extractVoteCountFromText(content) ??
    extractVoteCountFromText(embedText) ??
    extractVoteCountFromText(embedTitle) ??
    extractVoteCountFromText(fieldsText) ??
    extractVoteCountFromText(fullText);
  if (voteCount === null) {
    global.logger.warn("[VOTE EMBED] Vote count not found. Text:", fullText);
  }
  let expValue = getRandomExp();
  let resolvedVoteCount = voteCount;
  if (user?.id && message.guild?.id) {
    try {
      const count = await recordDiscadiaVote(
        message.client,
        message.guild.id,
        user.id,
      );
      if (typeof count === "number") {
        resolvedVoteCount = count;
      }
      if (count === 1) {
        expValue = 250;
      }
    } catch { }
    try {
      const targetMember =
        message.guild.members.cache.get(user.id) ||
        (await message.guild.members.fetch(user.id).catch(() => null));
      const ignored = await shouldIgnoreExpForMember({
        guildId: message.guild.id,
        member: targetMember,
        channelId: message.channel?.id || message.channelId || null,
      });
      if (!ignored) {
        await addExpWithLevel(
          message.guild,
          user.id,
          Number(expValue || 0),
          false,
          false,
        );
      }
    } catch { }
    try {
      const expiresAt = new Date(Date.now() + VOTE_ROLE_DURATION_MS);
      await upsertVoteRole(message.guild.id, user.id, expiresAt);
      const member =
        message.guild.members.cache.get(user.id) ||
        (await message.guild.members.fetch(user.id).catch(() => null));
      if (member && !member.roles.cache.has(VOTE_ROLE_ID)) {
        await member.roles.add(VOTE_ROLE_ID).catch(() => { });
      }
    } catch { }
  }
  const voteLabel =
    typeof resolvedVoteCount === "number" ? `${resolvedVoteCount}°` : "";
  const voteRoleText = VOTE_ROLE_ID
    ? `<a:VC_Money:1448671284748746905> ➥ Il ruolo <@&${VOTE_ROLE_ID}> per 24 ore`
    : "<a:VC_Money:1448671284748746905> ➥ Reward voto assegnata per 24 ore";
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Un nuovo voto! <a:VC_StarPink:1330194976440848500>")
    .setDescription(
      [
        `Grazie ${user ? `${user}` : nameClean} per aver votato su [Discadia](<https://discadia.com/server/viniliecaffe/>) il server! <a:VC_WingYellow:1448687141604298822>`,
        "",
        "\`Hai guadagnato:\`",
        `<a:VC_Events:1448688007438667796> ➥ **${expValue} EXP** per il tuo ${voteLabel ? `**${voteLabel} voto**` : "**voto**"}`,
        voteRoleText,
        "",
        "<:cutesystar:1443651906370142269> Vota di nuovo tra __24 ore__ per ottenere **altri exp** dal **bottone sottostante**.",
      ].join("\n"),
    )
    .setFooter({
      text: "Ogni volta che voterai il valore dell'exp guadagnata varierà: a volte sarà più alto, altre volte più basso, mentre altre ancora uguale al precedente",
    });

  const components = [];
  if (VOTE_URL) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setEmoji("<a:VC_HeartPink:1448673486603292685>")
        .setLabel("Vota cliccando qui")
        .setURL(VOTE_URL),
    );
    components.push(row);
  }

  const mention = user ? `${user}` : "";
  let sent = null;
  try {
    sent = await message.channel.send({
      content: mention,
      embeds: [embed],
      components,
    });
  } catch (error) {
    const detail = error?.message || error?.code || error;
    global.logger?.error?.("[VOTE EMBED] Failed to send embed:", detail);
  }
  if (sent) {
    await message.delete().catch(() => { });
  }
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
    const defaultPrefix = "+";
    if (!isEditedPrefixExecution && message?.guild) {
      try {
        if (message.author?.id !== resolvedClient?.user?.id) {
          const handledVote = await handleVoteManagerMessage(message, resolvedClient);
          if (handledVote) return;
        }
        if (message.author?.bot || message.webhookId || message.applicationId) {
          const handledDisboard = await handleDisboardBump(message, resolvedClient);
          if (handledDisboard) return;
          const handledDiscadia = await handleDiscadiaBump(message, resolvedClient);
          if (handledDiscadia) return;
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
          if (!isAutomatedMessage) {
            const automodResult = await runAutoModMessage(message);
            if (automodResult?.blocked) return;
          }
        } catch (error) {
          logEventError(resolvedClient, "AUTOMOD ERROR", error);
        }
      }
      await message.delete().catch(() => { });
      return;
    }
    if (!isEditedPrefixExecution) {
      try {
        if (!isAutomatedMessage) {
          const automodResult = await runAutoModMessage(message);
          if (automodResult?.blocked) return;
        }
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
          await message.delete().catch(() => { });
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
          await message.channel.send({
            content: `${message.author}`,
            embeds: [embed],
          });
          return;
        }
        if (message.author?.id !== resolvedClient?.user?.id) {
          const handledVote = await handleVoteManagerMessage(message, resolvedClient);
          if (handledVote) return;
        }
        const handledDisboard = await handleDisboardBump(message, resolvedClient);
        if (handledDisboard) return;
        const handledDiscadia = await handleDiscadiaBump(message, resolvedClient);
        if (handledDiscadia) return;
        const handledSuggestion = await handleSuggestionChannelMessage(message);
        if (handledSuggestion) return;
      }
    } catch (error) {
      logEventError(resolvedClient, "DISBOARD REMINDER ERROR", error);
    }
    if (
      message.author.bot ||
      !message.guild ||
      message.system ||
      message.webhookId
    )
      return;
    const isPrefixMessage = (() => {
      if (!message.content.startsWith(defaultPrefix)) return false;
      const first = getCommandTokenAfterPrefix(message.content, defaultPrefix);
      if (!first) return false;
      return Boolean(
        resolvedClient.pcommands.get(first) ||
        resolvedClient.pcommands.get(resolvedClient.aliases.get(first)),
      );
    })();
    if (!isEditedPrefixExecution) {
      try {
        if (message.channelId === IDs.channels.joinLeaveLogs) {
          recordReminderActivity(message.channelId);
        }
      } catch (error) {
        logEventError(resolvedClient, "REMINDER ACTIVITY ERROR", error);
      }
      try {
        await recordMessageActivity(message);
      } catch (error) {
        logEventError(resolvedClient, "ACTIVITY MESSAGE ERROR", error);
      }
      try {
        await handleMinigameMessage(message, resolvedClient);
      } catch (error) {
        logEventError(resolvedClient, "MINIGAME ERROR", error);
      }
      try {
        await handleAfk(message);
      } catch (error) {
        logEventError(resolvedClient, "AFK ERROR", error);
      }
      try {
        await handleMentionAutoReactions(message);
      } catch (error) {
        logEventError(resolvedClient, "MENTION REACTION ERROR", error);
      }
      try {
        await handleAutoResponders(message);
      } catch (error) {
        logEventError(resolvedClient, "AUTORESPONDER ERROR", error);
      }
      try {
        await handleCounting(message, resolvedClient);
      } catch (error) {
        logEventError(resolvedClient, "COUNTING ERROR", error);
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
    const startsWithDefault = message.content.startsWith(defaultPrefix);
    const shouldDeleteCommandMessage = true;
    const deleteCommandMessage = async () => {
      if (!shouldDeleteCommandMessage) return;
      await message.delete().catch(() => { });
    };
    if (!startsWithDefault) {
      await maybeSendWrongPrefixHint(message, resolvedClient);
      return;
    }

    const usedPrefix = defaultPrefix;

    const args = message.content
      .slice(usedPrefix.length)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    let cmd = overrideCommand
      ? overrideCommand.name
      : args.shift()?.toLowerCase();
    if (!cmd) return;
    let command =
      overrideCommand ||
      resolvedClient.pcommands.get(cmd) ||
      resolvedClient.pcommands.get(resolvedClient.aliases.get(cmd));

    if (!command) return;
    const isModerationPrefixCommand = ["staff", "admin"].includes(
      String(command.folder || "").toLowerCase(),
    );
    if (
      isModerationPrefixCommand &&
      (await shouldBlockModerationCommands(
        message.guild,
        String(message.author?.id || ""),
      ))
    ) {
      await deleteCommandMessage();
      const msg = await message.channel
        .send({
          content:
            "<:VC_right_arrow:1473441155055096081> Comandi di moderazione temporaneamente bloccati (AntiNuke panic mode attiva).",
        })
        .catch(() => null);
      if (msg) setTimeout(() => msg.delete().catch(() => {}), 5000);
      return;
    }
    const prefixSubcommandFromArgs = args[0]
      ? String(args[0]).toLowerCase()
      : null;
    const prefixSubcommandFromAlias =
      !prefixSubcommandFromArgs && command?.subcommandAliases
        ? command.subcommandAliases[cmd] || null
        : null;
    const prefixSubcommand =
      prefixSubcommandFromArgs || prefixSubcommandFromAlias || null;
    if (!prefixSubcommandFromArgs && prefixSubcommandFromAlias) {
      args.unshift(prefixSubcommandFromAlias);
    }
    const permissionResult = await checkPrefixPermission(
      message,
      command.name,
      prefixSubcommand,
      { returnDetails: true },
    );
    if (!permissionResult?.allowed) {
      if (permissionResult?.reason === "channel" && Array.isArray(permissionResult.channels)) {
        await deleteCommandMessage();
        const channelsList = permissionResult.channels.map((id) => `<#${id}>`).join(", ");
        const msg = await message.channel.send({ content: `Questo comando e utilizzabile solo in ${channelsList}.` }).catch(() => null);
        if (msg) setTimeout(() => msg.delete().catch(() => { }), 5000);
        return;
      }
      const requiredRoles = getPrefixRequiredRoles(
        command.name,
        prefixSubcommand,
      );
      const embed = buildGlobalPermissionDeniedEmbed(requiredRoles);
      await deleteCommandMessage();
      const msg = await message.channel.send({ embeds: [embed] }).catch(() => null);
      if (msg) setTimeout(() => msg.delete().catch(() => { }), 2000);
      return;
    }
    if (command?.args && !args.length) {
      const embed = buildMissingArgumentsErrorEmbed();
      await deleteCommandMessage();
      const msg = await message.channel.send({ embeds: [embed] }).catch(() => null);
      if (msg) setTimeout(() => msg.delete().catch(() => { }), 2000);
      return;
    }
    let hasPrefixCooldownBypass = Boolean(
      message.member?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID) ||
        hasAnyStaffBypassPermission(message.member?.permissions) ||
        String(message.guild?.ownerId || "") === String(message.author?.id || ""),
    );
    if (!hasPrefixCooldownBypass) {
      const fetchedMember = await message.guild.members
        .fetch(message.author.id)
        .catch(() => null);
      hasPrefixCooldownBypass = Boolean(
        fetchedMember?.roles?.cache?.has(PREFIX_COOLDOWN_BYPASS_ROLE_ID) ||
          hasAnyStaffBypassPermission(fetchedMember?.permissions) ||
          String(message.guild?.ownerId || "") === String(message.author?.id || ""),
      );
    }

    if (!hasPrefixCooldownBypass) {
      const cooldownSeconds = await getUserCommandCooldownSeconds({
        guildId: message.guild.id,
        userId: message.author.id,
        member: message.member,
      });
      const cooldownResult = consumeUserCooldown({
        client: resolvedClient,
        guildId: message.guild.id,
        userId: message.author.id,
        cooldownSeconds,
      });
      if (!cooldownResult.ok) {
        const remaining = Math.max(
          1,
          Math.ceil(cooldownResult.remainingMs / 1000),
        );
        const embed = buildCooldownErrorEmbed(remaining);
        await message.channel.send({ embeds: [embed] }).catch(() => null);
        return;
      }
    }
    if (!resolvedClient.prefixCommandLocks) resolvedClient.prefixCommandLocks = new Set();
    if (!resolvedClient.prefixCommandQueue) resolvedClient.prefixCommandQueue = new Map();
    const userId = message.author.id;
    const queueLockId = `${message.guild.id}:${userId}`;
    const enqueueCommand = async () => {
      const loadingEmojiId = IDs.emojis?.loadingAnimatedId;
      const fallbackEmojiId = IDs.emojis?.loadingFallbackId;
      const emoji = loadingEmojiId
        ? message.client?.emojis?.cache?.get(loadingEmojiId)
        : null;
      if (emoji) {
        await message.react(emoji).catch(() => { });
      } else if (fallbackEmojiId) {
        await message.react(fallbackEmojiId).catch(() => { });
      } else {
        await message.react("\u23F3").catch(() => { });
      }
      if (!resolvedClient.prefixCommandQueue.has(queueLockId)) {
        resolvedClient.prefixCommandQueue.set(queueLockId, []);
      }
      resolvedClient.prefixCommandQueue
        .get(queueLockId)
        .push({ message, args, command });
    };
    if (resolvedClient.prefixCommandLocks.has(queueLockId)) {
      await enqueueCommand();
      return;
    }
    const executePrefixCommand = async (payload) => {
      const {
        message: execMessage,
        args: execArgs,
        command: execCommand,
      } = payload;
      const originalReply = execMessage.reply.bind(execMessage);
      const hasSendablePayload = (data) => {
        if (typeof data === "string") return data.trim().length > 0;
        if (!data || typeof data !== "object") return false;
        const hasContent =
          typeof data.content === "string"
            ? data.content.trim().length > 0
            : data.content != null;
        const hasEmbeds = Array.isArray(data.embeds) && data.embeds.length > 0;
        const hasComponents =
          Array.isArray(data.components) && data.components.length > 0;
        const hasFiles = Array.isArray(data.files) && data.files.length > 0;
        const hasStickers =
          Array.isArray(data.stickers) && data.stickers.length > 0;
        const hasAttachments =
          Array.isArray(data.attachments) && data.attachments.length > 0;
        const hasPoll = Boolean(data.poll);
        return (
          hasContent ||
          hasEmbeds ||
          hasComponents ||
          hasFiles ||
          hasStickers ||
          hasAttachments ||
          hasPoll
        );
      };
      const commandMessage = Object.create(execMessage);
      commandMessage.reply = (replyPayload) => {
        const withFooter = applyDefaultFooterToEmbeds(
          replyPayload,
          execMessage.guild,
        );
        if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
        return originalReply(withFooter);
      };
      const originalChannelSend = execMessage.channel?.send?.bind(
        execMessage.channel,
      );
      const commandChannel = execMessage.channel
        ? Object.create(execMessage.channel)
        : execMessage.channel;
      if (originalChannelSend) {
        commandChannel.send = (sendPayload) => {
          const withFooter = applyDefaultFooterToEmbeds(
            sendPayload,
            execMessage.guild,
          );
          if (!hasSendablePayload(withFooter)) return Promise.resolve(null);
          const sendWithReferenceFallback = async (
            primaryPayload,
            fallbackPayload,
          ) => {
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
            const primary = {
              content: withFooter,
              reply: {
                messageReference: execMessage.id,
                failIfNotExists: false,
              },
              allowedMentions: { repliedUser: false },
              failIfNotExists: false,
            };
            const fallback = {
              content: withFooter,
              allowedMentions: { repliedUser: false },
            };
            return sendWithReferenceFallback(primary, fallback);
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
      const originalSendTyping = execMessage.channel?.sendTyping?.bind(
        execMessage.channel,
      );
      let typingStartTimer = null;
      let typingPulseTimer = null;
      let commandFinished = false;
      if (originalSendTyping) {
        const sendTypingSafe = async () => {
          if (commandFinished) return;
          try {
            await originalSendTyping();
          } catch { }
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
        await runWithTimeout(
          Promise.resolve(
            execCommand.execute(commandMessage, execArgs, resolvedClient),
          ),
          COMMAND_EXECUTION_TIMEOUT_MS,
          `prefix:${execCommand?.name || "unknown"}`,
        );
      } catch (error) {
        const isTimeout = error?.code === "COMMAND_TIMEOUT";
        if (isTimeout) {
          await execMessage
            .reply({
              embeds: [buildCommandTimeoutErrorEmbed()],
            })
            .catch(() => { });
        }
        const channelID =
          IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
        const errorChannel = channelID
          ? resolvedClient.channels.cache.get(channelID) ||
            (await resolvedClient.channels.fetch(channelID).catch(() => null))
          : null;
        const errorEmbed = buildErrorLogEmbed({
          contextLabel: "Comando",
          contextValue: execCommand?.name || "unknown",
          userTag: execMessage.author?.tag || "unknown",
          error,
        });
        if (errorChannel?.isTextBased?.()) {
          const pendingBtn = new ButtonBuilder()
            .setCustomId("error_pending")
            .setLabel("In risoluzione")
            .setStyle(ButtonStyle.Primary);
          const solvedBtn = new ButtonBuilder()
            .setCustomId("error_solved")
            .setLabel("Risolto")
            .setStyle(ButtonStyle.Success);
          const unsolvedBtn = new ButtonBuilder()
            .setCustomId("error_unsolved")
            .setLabel("Irrisolto")
            .setStyle(ButtonStyle.Danger);
          const row = new ActionRowBuilder().addComponents(
            pendingBtn,
            solvedBtn,
            unsolvedBtn,
          );
          const sentError = await errorChannel.send({
            embeds: [errorEmbed],
            components: [row],
          });
          const collector = sentError.createMessageComponentCollector({
            time: 1000 * 60 * 60 * 24,
          });
          collector.on("collect", async (btn) => {
            if (
              !["error_pending", "error_solved", "error_unsolved"].includes(
                btn.customId,
              )
            )
              return;
            if (!btn.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
              await btn.reply({
                content:
                  "<:vegax:1443934876440068179> Non hai i permessi per fare questo comando.",
                flags: 1 << 6,
              });
              return;
            }
            if (btn.customId === "error_pending") {
              errorEmbed.setColor("Yellow");
              await btn.reply({ content: "In risoluzione.", flags: 1 << 6 });
            }
            if (btn.customId === "error_solved") {
              errorEmbed.setColor("Green");
              await btn.reply({ content: "Risolto.", flags: 1 << 6 });
            }
            if (btn.customId === "error_unsolved") {
              errorEmbed.setColor("Red");
              await btn.reply({ content: "Irrisolto.", flags: 1 << 6 });
            }
            await sentError.edit({ embeds: [errorEmbed], components: [row] });
          });
        }
        if (!isTimeout) {
          const feedback = buildInternalCommandErrorEmbed(error);
          return execMessage.reply({ embeds: [feedback] }).catch(() => null);
        }
        return null;
      } finally {
        commandFinished = true;
        if (typingStartTimer) clearTimeout(typingStartTimer);
        if (typingPulseTimer) clearInterval(typingPulseTimer);
      }
    };
    const lockId = queueLockId;
    resolvedClient.prefixCommandLocks.add(lockId);
    try {
      await executePrefixCommand({ message, args, command });
    } finally {
      resolvedClient.prefixCommandLocks.delete(lockId);
      const removeLoadingReaction = async (msg) => {
        try {
          const loadingId = IDs.emojis?.loadingAnimatedId;
          const fallbackId = IDs.emojis?.loadingFallbackId;
          const emoji = loadingId
            ? msg.client?.emojis?.cache?.get(loadingId)
            : null;
          if (emoji) {
            const react = msg.reactions.resolve(emoji.id);
            if (react) await react.users.remove(resolvedClient.user.id);
          }
          const fallback =
            msg.reactions.resolve("VC_Loading") ||
            (fallbackId ? msg.reactions.resolve(fallbackId) : null);
          if (fallback) await fallback.users.remove(resolvedClient.user.id);
        } catch { }
      };
      let queue = resolvedClient.prefixCommandQueue.get(lockId);
      while (queue && queue.length > 0) {
        const next = queue.shift();
        await removeLoadingReaction(next.message);
        resolvedClient.prefixCommandLocks.add(lockId);
        try {
          await executePrefixCommand(next);
        } finally {
          resolvedClient.prefixCommandLocks.delete(lockId);
        }
        queue = resolvedClient.prefixCommandQueue.get(lockId);
      }
      if (queue && queue.length === 0) {
        resolvedClient.prefixCommandQueue.delete(lockId);
      }
    }
  },
};

async function handleAfk(message) {
  const guildId = message.guild?.id;
  if (!guildId) return;
  const userId = message.author.id;
  const afkData = await AFK.findOne({ guildId, userId: userId });
  if (afkData) {
    const member = message.guild.members.cache.get(userId);
    if (member && afkData.originalName) {
      await member.setNickname(afkData.originalName).catch(() => { });
    }
    await AFK.deleteOne({ guildId, userId: userId });
    const msg = await safeMessageReply(
      message,
      `<:VC_PepeWave:1331589315175907412> Bentornato <@${userId}>! Ho rimosso il tuo stato AFK.`,
    );
    if (msg) {
      setTimeout(() => {
        msg.delete().catch(() => { });
      }, 5000);
    }
  }
  const mentionedUsers = message.mentions.users;
  for (const user of mentionedUsers.values()) {
    if (user.bot) continue;
    const data = await AFK.findOne({ guildId, userId: user.id });
    if (!data) continue;
    const now = Date.now();
    const diff = Math.floor((now - data.timestamp) / 1000);
    let timeAgo = "";
    if (diff < 60) timeAgo = `${diff}s fa`;
    else if (diff < 3600) timeAgo = `${Math.floor(diff / 60)}m fa`;
    else if (diff < 86400) timeAgo = `${Math.floor(diff / 3600)}h fa`;
    else timeAgo = `${Math.floor(diff / 86400)} giorni fa`;
    await safeMessageReply(
      message,
      `\`${user.username}\` è AFK: **${data.message}** - ${timeAgo}`,
    );
  }
}

function getVoteManagerBotIds(client) {
  void client;
  return new Set(
    [IDs.bots.VoteManager, IDs.bots.Discadia, IDs.bots.DISBOARD]
      .filter(Boolean)
      .map((id) => String(id)),
  );
}

function resolveReactionToken(token) {
  const value = String(token || "");
  if (value.startsWith("custom:")) return value.slice("custom:".length);
  if (value.startsWith("unicode:")) return value.slice("unicode:".length);
  return value;
}

async function getGuildAutoResponders(guildId) {
  if (!guildId) return [];
  const cached = getGuildAutoResponderCache(guildId);
  if (cached) return cached;
  const docs = await AutoResponder.find({ guildId, enabled: true })
    .lean()
    .catch(() => []);
  const rules = Array.isArray(docs)
    ? docs
      .map((doc) => ({
        triggerLower: String(doc?.triggerLower || "")
          .trim()
          .toLowerCase(),
        triggerLoose: normalizeForTriggerMatch(
          doc?.triggerLower || doc?.trigger || "",
        ),
        triggerTokens: normalizeForTriggerMatch(
          doc?.triggerLower || doc?.trigger || "",
        )
          .split(/\s+/)
          .filter((token) => token.length >= 3),
        response: String(doc?.response || ""),
        reactions: Array.isArray(doc?.reactions) ? doc.reactions : [],
      }))
      .filter((doc) => Boolean(doc.triggerLower))
      .sort((a, b) => b.triggerLower.length - a.triggerLower.length)
    : [];
  setGuildAutoResponderCache(guildId, rules);
  return rules;
}

function normalizeForTriggerMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsWholeLoosePhrase(normalizedLooseText, normalizedLooseNeedle) {
  const haystack = String(normalizedLooseText || "").trim();
  const needle = String(normalizedLooseNeedle || "").trim();
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function ruleMatchesMessage(normalizedText, normalizedLoose, rule) {
  void normalizedText;
  if (!rule) return false;
  if (
    rule.triggerLoose &&
    containsWholeLoosePhrase(normalizedLoose, rule.triggerLoose)
  )
    return true;
  return false;
}

async function handleAutoResponders(message) {
  const guildId = message.guild?.id;
  if (!guildId) return;
  const normalized = String(message.content || "")
    .toLowerCase()
    .trim();
  if (!normalized) return;
  if (normalized.startsWith("+")) return;
  const normalizedLoose = normalizeForTriggerMatch(message.content || "");

  const rules = await getGuildAutoResponders(guildId);
  if (!Array.isArray(rules) || !rules.length) return;

  const matched = rules.find((rule) =>
    ruleMatchesMessage(normalized, normalizedLoose, rule),
  );
  if (!matched) return;

  const response = String(matched.response || "").trim();
  if (response) {
    await message.channel
      .send({
        content: response,
        allowedMentions: { repliedUser: false },
      })
      .catch(() => { });
  }

  const seen = new Set();
  const list = Array.isArray(matched.reactions) ? matched.reactions : [];
  for (const token of list) {
    const emoji = resolveReactionToken(token);
    if (!emoji || seen.has(emoji)) continue;
    seen.add(emoji);
    await message.react(emoji).catch(() => { });
  }
}

async function handleMentionAutoReactions(message) {
  const mentionedUsers = message.mentions?.users;
  if (!mentionedUsers || mentionedUsers.size === 0) return;
  const explicitMentionIds = new Set();
  const mentionRegex = /<@!?(\d{16,20})>/g;
  let match = null;
  const content = String(message.content || "");
  while ((match = mentionRegex.exec(content)) !== null) {
    explicitMentionIds.add(String(match[1]));
  }
  if (!explicitMentionIds.size) return;
  const targetIds = Array.from(
    new Set(
      mentionedUsers
        .filter((user) => !user.bot && explicitMentionIds.has(user.id))
        .map((user) => user.id),
    ),
  );
  if (!targetIds.length) return;
  const docs = await MentionReaction.find({
    guildId: message.guild.id,
    userId: { $in: targetIds },
  })
    .lean()
    .catch(() => []);
  if (!Array.isArray(docs) || !docs.length) return;
  const uniqueTokens = new Set();
  for (const doc of docs) {
    const list = Array.isArray(doc?.reactions) ? doc.reactions : [];
    for (const token of list) {
      if (token) uniqueTokens.add(String(token));
      if (uniqueTokens.size >= 10) break;
    }
    if (uniqueTokens.size >= 10) break;
  }
  for (const token of uniqueTokens) {
    const emoji = resolveReactionToken(token);
    if (!emoji) continue;
    await message.react(emoji).catch(() => { });
  }
}
async function handleCounting(message, client) {
  const countdata = await countschema.findOne({ Guild: message.guild.id });
  if (!countdata) return;
  const member = message.member;
  if (!member) return;
  const countchannel = message.guild.channels.cache.get(COUNTING_CHANNEL_ID);
  if (!countchannel) {
    logEventError(
      client,
      "COUNTING",
      `Counting channel not found for guild: ${message.guild.id}`,
    );
    return;
  }
  if (message.channel.id !== countchannel.id) return;
  if (!COUNTING_ALLOWED_REGEX.test(message.content)) {
    return message.delete().catch(() => { });
  }
  let messageValue;
  try {
    const expression = message.content
      .replace(/\s+/g, "")
      .replace(/x/g, "*")
      .replace(/:/g, "/");
    messageValue = math.evaluate(expression);
  } catch {
    return message.delete().catch(() => { });
  }
  let reaction = "<:vegacheckmark:1443666279058772028>";
  if (message.author.id === countdata.LastUser) {
    safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `<:vegax:1443934876440068179> Non puoi contare da solo! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
          )
          .setColor("#6f4e37"),
      ],
    });
    countdata.Count = 0;
    countdata.LastUser = " ";
    message
      .react("<:vegax:1443934876440068179>")
      .catch((err) => logEventError(client, "COUNTING", err));
  } else if (
    messageValue - 1 !== countdata.Count ||
    messageValue === countdata.Count ||
    messageValue > countdata.Count + 1
  ) {
    safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `<:vegax:1443934876440068179> Hai sbagliato numero! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
          )
          .setColor("#6f4e37"),
      ],
    });
    countdata.Count = 0;
    message
      .react("<:vegax:1443934876440068179>")
      .catch((err) => logEventError(client, "COUNTING", err));
  } else {
    countdata.Count += 1;
    countdata.LastUser = message.author.id;
    message
      .react(reaction)
      .catch((err) => logEventError(client, "COUNTING", err));
  }
  await countdata.save();
}

function logEventError(client, label, error) {
  if (client?.logs?.error) {
    client.logs.error(`[${label}]`, error);
    return;
  }
  global.logger?.error?.(`[${label}]`, error);
}

async function handleDisboardBump(message, client) {
  const disboard = client?.config?.disboard;
  if (!disboard) return false;
  if (!message.guild) return false;
  const authorName = String(
    message.author?.globalName || message.author?.username || "",
  );
  const sourceName = `${authorName} ${String(message.applicationId || "")}`.toLowerCase();
  const isDisboardSource =
    message.author?.id === IDs.bots.DISBOARD ||
    (Boolean(message.author?.bot) && /disboard/i.test(authorName)) ||
    /disboard/i.test(sourceName);
  if (!message.author || !isDisboardSource) return false;
  const patterns = Array.isArray(disboard.bumpSuccessPatterns)
    ? disboard.bumpSuccessPatterns.map((p) => String(p).toLowerCase())
    : [];
  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      if (embed?.description) haystacks.push(embed.description);
      if (embed?.title) haystacks.push(embed.title);
    }
  }
  const lowered = haystacks.map((text) => String(text || "").toLowerCase());
  const isBump = patterns.some((pattern) =>
    lowered.some((text) => text.includes(pattern)),
  );
  if (!isBump) return false;
  const dedupeKey = `disboard:${message.guild.id}:${message.id}`;
  if (shouldSkipProcessedBump(dedupeKey)) return true;
  const bumpUserId = message.interaction?.user?.id;
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  const thanksMessage =
    "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server!__**\n" +
    "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **due ore!**\n" +
    bumpMention;
  await message.channel.send({ content: thanksMessage.trim() });
  await recordBump(client, message.guild.id, bumpUserId || null);
  return true;
}

async function handleDiscadiaBump(message, client) {
  const discadia = client?.config?.discadia;
  if (!discadia) return false;
  if (!message.guild) return false;

  const authorName = String(
    message.author?.globalName || message.author?.username || "",
  );
  const isDiscadiaNamedBot =
    Boolean(message.author?.bot) && /(discadia|disboard)/i.test(authorName);
  const isDiscadiaAuthor = message.author?.id === IDs.bots.Discadia;
  const isDiscadiaApp = message.applicationId === IDs.bots.Discadia;
  const isFallbackSource =
    message.author?.id === IDs.bots.DISBOARD ||
    message.applicationId === IDs.bots.DISBOARD;
  const patterns = Array.isArray(discadia.bumpSuccessPatterns)
    ? discadia.bumpSuccessPatterns.map((p) => String(p).toLowerCase())
    : [
      "has been successfully bumped",
      "successfully bumped",
      "bumped successfully",
    ];

  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      if (embed?.description) haystacks.push(embed.description);
      if (embed?.title) haystacks.push(embed.title);
      if (embed?.footer?.text) haystacks.push(embed.footer.text);
      if (embed?.author?.name) haystacks.push(embed.author.name);
      if (Array.isArray(embed?.fields)) {
        for (const field of embed.fields) {
          if (field?.name) haystacks.push(field.name);
          if (field?.value) haystacks.push(field.value);
        }
      }
    }
  }

  const normalized = haystacks
    .map((text) => String(text).toLowerCase())
    .map((text) => text.replace(/\s+/g, " ").trim());
  const joined = normalized.join("\n");

  const hasPattern = patterns.some((pattern) => joined.includes(pattern));
  const hasFailureWord =
    /already bumped|already has been bumped|cannot bump|can't bump|please wait|too early|wait before|failed to bump|bump failed|errore bump|impossibile bumpare/i.test(
      joined,
    );

  const fromDiscadiaBot =
    isDiscadiaAuthor || isDiscadiaApp || isDiscadiaNamedBot || isFallbackSource;
  const isBump = fromDiscadiaBot && !hasFailureWord && hasPattern;
  if (!isBump) return false;
  const dedupeKey = `discadia:${message.guild.id}:${message.id}`;
  if (shouldSkipProcessedBump(dedupeKey)) return true;

  const bumpUserId =
    message.interaction?.user?.id ||
    message.interactionMetadata?.user?.id ||
    extractUserIdFromText(message.content) ||
    extractUserIdFromText(joined);
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  const thanksMessage =
    "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server su Discadia!__**\n" +
    "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **24 ore!**\n" +
    bumpMention;

  await message.channel.send({ content: thanksMessage.trim() });
  await recordDiscadiaBump(client, message.guild.id, bumpUserId || null);
  return true;
}

async function handleSuggestionChannelMessage(message) {
  if (!message?.guild) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const suggestionsChannelId = String(
    IDs.channels.suggestions || "1442569147559973094",
  );
  if (String(message.channelId) !== suggestionsChannelId) return false;

  const suggestionText = String(message.content || "").trim();
  if (!suggestionText) return false;

  const counterFilter = {
    GuildID: message.guild.id,
    ChannelID: "__counter__",
    Msg: "__counter__",
    AuthorID: "__system__",
  };
  const counter = await SuggestionCount.findOneAndUpdate(
    counterFilter,
    {
      $inc: { count: 1 },
      $setOnInsert: {
        Upmembers: [],
        Downmembers: [],
        upvotes: 0,
        downvotes: 0,
        sID: "__counter__",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const suggestionId = String(counter?.count || 1);

  const suggestionEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `**<a:VC_CrownYellow:1330194103564238930> Mandato da:**\n${message.author.username}\n\n**<:pinnednew:1443670849990430750> Suggerimento:**\n\n${suggestionText}\n\n**<:infoglowingdot:1443660296823767110> Numero voti:**\n\n`,
    )
    .setFields(
      { name: "<:thumbsup:1471292172145004768>", value: "0", inline: true },
      { name: "<:thumbsdown:1471292163957457013>", value: "0", inline: true },
    )
    .setTimestamp()
    .setFooter({
      text: `User ID: ${message.author.id} | sID: ${suggestionId}`,
    });

  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("upv")
      .setEmoji("<:thumbsup:1471292172145004768>")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("downv")
      .setEmoji("<:thumbsdown:1471292163957457013>")
      .setStyle(ButtonStyle.Secondary),
  );
  const staffRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("suggestion_staff_accept")
      .setLabel("Accetta")
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("suggestion_staff_reject")
      .setLabel("Rifiuta")
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );

  const posted = await message.channel
    .send({
      content: "<@&1442568894349840435>",
      embeds: [suggestionEmbed],
      components: [voteRow, staffRow],
    })
    .catch(() => null);
  if (!posted) return false;

  await SuggestionCount.create({
    GuildID: message.guild.id,
    ChannelID: message.channel.id,
    Msg: posted.id,
    AuthorID: message.author.id,
    upvotes: 0,
    downvotes: 0,
    Upmembers: [],
    Downmembers: [],
    sID: suggestionId,
  }).catch(() => { });

  const thread = await posted
    .startThread({
      name: `Thread per il suggerimento ${suggestionId}`,
      autoArchiveDuration: 10080,
    })
    .catch(() => null);
  if (thread) {
    await thread
      .send(
        `Ho creato questo thread per discutere del suggerimento di <@${message.author.id}>`,
      )
      .catch(() => { });
  }

  await message.delete().catch(() => { });
  return true;
}


