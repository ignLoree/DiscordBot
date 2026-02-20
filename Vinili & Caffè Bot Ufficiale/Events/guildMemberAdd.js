const { EmbedBuilder, PermissionsBitField, AuditLogEvent, UserFlagsBitField, } = require("discord.js");
const { InviteTrack, InviteReminderState, } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { getNoDmSet } = require("../Utils/noDmList");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  scheduleMemberCounterRefresh,
} = require("../Utils/Community/memberCounterUtils");
const { processJoinRaidForMember, getJoinRaidStatusSnapshot, } = require("../Services/Moderation/joinRaidService");
const { markJoinGateKick } = require("../Utils/Moderation/joinGateKickCache");

const INVITE_LOG_CHANNEL_ID = IDs.channels.chat;
const THANKS_CHANNEL_ID = IDs.channels.supporters;
const INVITE_REWARD_ROLE_ID = IDs.roles.Promoter;
const INVITE_EXTRA_ROLE_ID = IDs.roles.PicPerms || "1468938195348754515";
const INFO_PERKS_CHANNEL_ID = IDs.channels.info;
const INVITE_REWARD_TARGET = 5;
const JOIN_LEAVE_LOG_CHANNEL_ID = IDs.channels.joinLeaveLogs;
const MIN_ACCOUNT_AGE_DAYS = 3;
const ARROW = "<:VC_right_arrow:1473441155055096081>";
const JOIN_GATE_WHITELIST_ROLE_IDS = new Set(
  [
    IDs.roles.Founder,
    IDs.roles.CoFounder,
  ]
    .filter(Boolean)
    .map(String),
);
const CORE_EXEMPT_USER_IDS = new Set([
  "1466495522474037463",
  "1329118940110127204",
]);
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

const JOIN_GATE = {
  botAdditions: {
    enabled: true,
    action: "kick",
  },
  unverifiedBotAdditions: {
    enabled: true,
    action: "kick",
  },
  suspiciousAccount: {
    enabled: true,
    action: "log",
  },
  advertisingName: {
    enabled: true,
    action: "kick",
  },
  usernameFilter: {
    enabled: true,
    action: "kick",
    strictWords: [
      "discord staff",
      "discord support",
      "nitro free",
      "steam gift",
      "free nitro",
      "airdrop",
    ],
    wildcardWords: [
      "*discord*support*",
      "*discord*staff*",
      "*nitro*free*",
      "*steam*gift*",
      "*crypto*airdrop*",
    ],
  },
};

function formatActor(actor) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function formatAccountAge(createdAt) {
  const now = Date.now();
  const ageMs = now - createdAt.getTime();
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days % 30;

  const parts = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays} day${remainingDays !== 1 ? "s" : ""}`);
  }
  return parts.join(", ");
}

async function resolveGuildChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function ensureInviteCache(client) {
  if (!client.inviteCache) {
    client.inviteCache = new Map();
  }
}

async function resolveInviteInfo(member) {
  const guild = member.guild;
  ensureInviteCache(member.client);

  const invites = await guild.invites.fetch().catch(() => null);
  const cache = member.client.inviteCache.get(guild.id);
  let usedInvite = null;

  if (invites && cache) {
    for (const invite of invites.values()) {
      const cached = cache.get(invite.code);
      if (
        cached &&
        typeof invite.uses === "number" &&
        invite.uses > (cached.uses || 0)
      ) {
        usedInvite = invite;
        break;
      }
    }
  }

  if (invites) {
    const map = new Map();
    for (const invite of invites.values()) {
      map.set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
      });
    }
    member.client.inviteCache.set(guild.id, map);
  }

  let vanityCode = guild.vanityURLCode || null;
  if (!usedInvite && !vanityCode && guild.features?.includes("VANITY_URL")) {
    const vanityData = await guild.fetchVanityData().catch(() => null);
    vanityCode = vanityData?.code || null;
  }
  if (!usedInvite && vanityCode) {
    return {
      link: `https://discord.gg/${vanityCode}`,
      inviterTag: "Vanity URL",
      totalInvites: 0,
      isVanity: true,
      inviterId: null,
    };
  }

  const link = usedInvite
    ? `https://discord.gg/${usedInvite.code}`
    : "Link non disponibile";
  const inviterId = usedInvite?.inviter?.id || null;
  const inviterTag = inviterId ? `<@${inviterId}>` : "Sconosciuto";

  let totalInvites = 0;
  if (invites && inviterId) {
    totalInvites = invites
      .filter((invite) => invite.inviter?.id === inviterId)
      .reduce((sum, invite) => sum + (invite.uses || 0), 0);
  }

  return { link, inviterTag, totalInvites, isVanity: false, inviterId };
}

async function trackInviteJoin(member, inviterId) {
  if (!inviterId || inviterId === member.id) return;

  const inviterMember =
    member.guild.members.cache.get(inviterId) ||
    (await member.guild.members.fetch(inviterId).catch(() => null));
  if (!inviterMember || inviterMember.user?.bot) return;

  await InviteTrack.findOneAndUpdate(
    { guildId: member.guild.id, userId: member.id },
    {
      $set: { inviterId, active: true, leftAt: null },
      $setOnInsert: { joinedAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function tryAwardInviteRole(member, inviteInfo) {
  if (!inviteInfo || inviteInfo.isVanity || !inviteInfo.inviterId) {
    return { awarded: false, roleIds: [] };
  }
  if ((inviteInfo.totalInvites || 0) < 5) return { awarded: false, roleIds: [] };

  const guild = member.guild;
  const inviterMember =
    guild.members.cache.get(inviteInfo.inviterId) ||
    (await guild.members.fetch(inviteInfo.inviterId).catch(() => null));
  if (!inviterMember || inviterMember.user?.bot) return { awarded: false, roleIds: [] };

  const rewardRole = INVITE_REWARD_ROLE_ID
    ? guild.roles.cache.get(INVITE_REWARD_ROLE_ID) ||
      (await guild.roles.fetch(INVITE_REWARD_ROLE_ID).catch(() => null))
    : null;
  const extraRole = INVITE_EXTRA_ROLE_ID
    ? guild.roles.cache.get(INVITE_EXTRA_ROLE_ID) ||
      (await guild.roles.fetch(INVITE_EXTRA_ROLE_ID).catch(() => null))
    : null;
  if (!rewardRole && !extraRole) return { awarded: false, roleIds: [] };

  const me = guild.members.me;
  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles))
    return { awarded: false, roleIds: [] };

  const rolesToAdd = [];
  if (
    rewardRole &&
    !inviterMember.roles.cache.has(rewardRole.id) &&
    rewardRole.position < me.roles.highest.position
  ) {
    rolesToAdd.push(rewardRole.id);
  }
  if (
    extraRole &&
    !inviterMember.roles.cache.has(extraRole.id) &&
    extraRole.position < me.roles.highest.position
  ) {
    rolesToAdd.push(extraRole.id);
  }
  if (!rolesToAdd.length) return { awarded: false, roleIds: [] };

  await inviterMember.roles.add(rolesToAdd).catch(() => {});
  return { awarded: true, roleIds: rolesToAdd };
}

async function addBotRoles(member) {
  const roleIds = [IDs.roles.Bots].filter(Boolean);
  if (!roleIds.length) return;
  const me = member.guild.members.me;

  if (!me) {
    global.logger.warn(
      "[guildMemberAdd] Bot member not cached; cannot add bot roles.",
    );
    return;
  }
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    global.logger.warn(
      "[guildMemberAdd] Missing Manage Roles permission; cannot add bot roles.",
    );
    return;
  }

  const roles = roleIds
    .map((id) => member.guild.roles.cache.get(id))
    .filter(Boolean);

  const missingRoles = roleIds.filter(
    (id) => !member.guild.roles.cache.has(id),
  );
  if (missingRoles.length) {
    global.logger.warn(
      "[guildMemberAdd] Some bot roles not found:",
      missingRoles,
    );
  }
  if (!roles.length) return;

  const blocked = roles.filter(
    (role) => role.position >= me.roles.highest.position,
  );
  if (blocked.length) {
    global.logger.warn(
      "[guildMemberAdd] Bot role hierarchy prevents adding roles:",
      blocked.map((role) => role.id),
    );
    return;
  }

  await member.roles.add(roles);
}

function buildWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setAuthor({
      name: member.user.username,
      iconURL: member.user.displayAvatarURL({ size: 128 }),
    })
    .setTitle(
      "<a:VC_HeartsPink:1468685897389052008> Benvenuto/a su Vinili & Caffè <a:VC_HeartsPink:1468685897389052008>",
    )
    .setDescription(
      `__${member.displayName}__ benvenuto/a nella nostra community <a:VC_Sparkles:1468546911936974889>\n` +
        "Passa su <#1469429150669602961> per **abbellire il tuo profilo** con i ruoli & colori.",
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setImage(
      "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db",
    )
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo in ${member.guild.memberCount} membri` });
}

function buildDmWelcomeEmbed(member) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_RightWing:1448672889845973214> Welcome to Vinili & Caffè!")
    .setDescription(
      [
        `Ei **${member.displayName}** welcome, glad to have you here!`,
        "",
        "Joining the server you automatically accept the rules.",
        "Entrando nel server accetti automaticamente le nostre regole.",
        "<a:VC_Arrow:1448672967721615452> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102236527853661>",
        "------------------------------",
        "<:VC_Dot:1443932948599668746> Check out our GUILD TAGS",
        "<:moon:1470064812615667827>[Luna](<https://discord.gg/E6vrm5zE6B>) & <a:VC_Money:1448671284748746905>[Cash](<https://discord.gg/QnTN5P578g>)",
        "<:VC_Firework:1470796227913322658>[Porn](<https://discord.gg/WMuZ4EMAkc>) & <a:VC_PepeEggPlant:1331622686014570588>[69](<https://discord.gg/uqUNS9f5m5>)",
        "<a:VC_PepeSmoke:1331590685673132103>[Weed](<https://discord.gg/SzBwnxHXNv>) & <a:VC_PepeExcited:1331621719093284956>[Figa](<https://discord.gg/z3EXtJwvQH>)",
        "<a:VC_Arrow:1448672967721615452> <https://discord.com/channels/1329080093599076474/1442569111119990887/1470102239094767699>",
        "------------------------------",
        "<a:VC_Exclamation:1448687427836444854> Verify Yourself: <https://discord.com/channels/1329080093599076474/1442569059983163403>",
      ].join("\n"),
    )
    .setThumbnail(member.guild.iconURL({ size: 256 }))
    .setFooter({
      text: `${member.guild.name} • Ora siamo in ${member.guild.memberCount}`,
      iconURL: member.guild.iconURL(),
    })
    .setTimestamp();
}

async function sendBotAddLog(member) {
  const guild = member?.guild;
  if (!guild || !member?.user?.bot) return;

  const logChannel =
    guild.channels.cache.get(IDs.channels.modLogs) ||
    (await guild.channels.fetch(IDs.channels.modLogs).catch(() => null));
  if (!logChannel?.isTextBased?.()) return;

  let executor = null;
  const entry = await fetchRecentBotAddEntry(guild, member.user.id);
  if (entry?.executor) executor = entry.executor;

  const responsible = formatActor(executor);
  const createdTs = Math.floor(new Date(member.user.createdAt).getTime() / 1000);
  const nowTs = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("Bot Add")
    .setDescription(
      [
        `${ARROW} **Responsible:** ${responsible}`,
        `${ARROW} **Target:** ${member.user} \`${member.user.id}\``,
        `${ARROW} <t:${nowTs}:F>`,
        "",
        "**Additional Information**",
        `${ARROW} **Id:** \`${member.user.id}\``,
        `${ARROW} **Username:** ${member.user.username}`,
        `${ARROW} **Creation:** <t:${createdTs}:R>`,
      ].join("\n"),
    );

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}
async function handleBotJoin(member) {
  queueIdsCatalogSync(member.client, member.guild.id, "botJoin");
  await sendBotAddLog(member).catch(() => {});
  await sendJoinGateNoAvatarLog(member).catch(() => {});

  const botAddEntry = await fetchRecentBotAddEntry(member.guild, member.user.id);
  const executorId = botAddEntry?.executorId || botAddEntry?.executor?.id || null;
  const executorText = botAddEntry?.executor
    ? formatActor(botAddEntry.executor)
    : "sconosciuto";
  const verifiedBot = await isVerifiedBot(member.user);

  if (JOIN_GATE.unverifiedBotAdditions.enabled && !verifiedBot) {
    const result = await kickForJoinGate(member, "Unverified bot addition.", [
      `${ARROW} **Rule:** Unverified Bot Additions`,
      `${ARROW} **Responsible:** ${executorText}`,
    ], JOIN_GATE.unverifiedBotAdditions.action);
    if (result?.blocked) return;
  }

  if (JOIN_GATE.botAdditions.enabled) {
    const authorized = executorId
      ? await isAuthorizedBotAdder(member.guild, executorId)
      : false;
    if (!authorized) {
      const result = await kickForJoinGate(
        member,
        "Bot added by unauthorized member.",
        [
          `${ARROW} **Rule:** Bot Additions`,
          `${ARROW} **Responsible:** ${executorText}${executorId ? "" : " (audit unavailable)"}`,
        ],
        JOIN_GATE.botAdditions.action,
      );
      if (result?.blocked) return;
    }
  }

  try {
    await addBotRoles(member);
  } catch (error) {
    global.logger.error("[guildMemberAdd] Failed to add bot roles:", error);
  }

  const welcomeChannel = await resolveGuildChannel(
    member.guild,
    IDs.channels.chat,
  );
  if (welcomeChannel) {
    await welcomeChannel
      .send({
        content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.Staff}> <a:VC_HeartOrange:1448673443762405386>`,
        embeds: [buildWelcomeEmbed(member)],
      })
      .catch(() => {});
  }

  const inviteChannel = await resolveGuildChannel(
    member.guild,
    INVITE_LOG_CHANNEL_ID,
  );
  if (!inviteChannel) return;

  try {
    const info = await resolveInviteInfo(member);
    if (info.isVanity) {
      await inviteChannel
        .send({
          content:
            "<:VC_Reply:1468262952934314131> Bot entrato tramite vanity **.gg/viniliecaffe**",
        })
        .catch(() => {});
    } else {
      await inviteChannel
        .send({
          content: `<:VC_Reply:1468262952934314131> Bot entrato con il link <${info.link}>,\n-# -> invitato da ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`,
        })
        .catch(() => {});
    }
  } catch {}
}

function isTooYoungAccount(member) {
  const minAgeMs = MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
  const accountAgeMs = Date.now() - member.user.createdAt.getTime();
  return accountAgeMs < minAgeMs;
}

function hasNoAvatar(member) {
  if (!member?.user) return false;
  return !member.user.avatar;
}

function getJoinGateNameCandidate(member) {
  return String(
    member?.user?.globalName ||
      member?.displayName ||
      member?.user?.username ||
      "",
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inviteLikeInName(text) {
  const normalized = normalizeText(text);
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|invite\.gg\/|dsc\.gg\/)/i.test(
    normalized,
  );
}

function wildcardToRegex(pattern) {
  const escaped = String(pattern || "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate, rules = JOIN_GATE.usernameFilter) {
  if (!rules?.enabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  const strictWords = Array.isArray(rules.strictWords) ? rules.strictWords : [];
  for (const word of strictWords) {
    const normalizedWord = normalizeText(word);
    if (normalizedWord && normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  const wildcardWords = Array.isArray(rules.wildcardWords)
    ? rules.wildcardWords
    : [];
  for (const wildcard of wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }
  return null;
}

function detectSuspiciousAccount(member) {
  const username = normalizeText(member?.user?.username);
  const globalName = normalizeText(member?.user?.globalName);
  const combined = `${username} ${globalName}`.trim();
  const accountAgeMs = Date.now() - new Date(member.user.createdAt).getTime();
  const ageHours = accountAgeMs / (60 * 60 * 1000);

  const suspiciousKeywords = [
    "support",
    "moderator",
    "admin",
    "nitro",
    "airdrop",
    "crypto",
    "steam",
    "gift",
    "discord",
  ];
  const hasKeyword = suspiciousKeywords.some((kw) => combined.includes(kw));
  const heavyDigits = (combined.match(/\d/g) || []).length >= 6;
  const manySeparators = (combined.match(/[._-]/g) || []).length >= 4;
  const veryYoung = ageHours <= 24;
  if (veryYoung && (hasKeyword || heavyDigits || manySeparators)) {
    return `Pattern sospetto nel nome (${hasKeyword ? "keyword scam" : "pattern"}), account molto recente.`;
  }
  return null;
}

async function fetchRecentBotAddEntry(guild, botId) {
  if (
    !guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)
  ) {
    return null;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: AUDIT_FETCH_LIMIT })
      .catch(() => null);
    if (logs?.entries?.size) {
      const now = Date.now();
      const found =
        logs.entries.find((entry) => {
          const createdTs = Number(entry?.createdTimestamp || 0);
          return (
            createdTs > 0 &&
            now - createdTs <= AUDIT_LOOKBACK_MS &&
            String(entry?.target?.id || "") === String(botId || "")
          );
        }) || null;
      if (found) return found;
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  return null;
}

async function isVerifiedBot(user) {
  if (!user?.bot) return false;
  let flags = user.flags || null;
  if (!flags && typeof user.fetchFlags === "function") {
    flags = await user.fetchFlags().catch(() => null);
  }
  return Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
}

async function isAuthorizedBotAdder(guild, executorId) {
  if (!guild || !executorId) return false;
  if (CORE_EXEMPT_USER_IDS.has(String(executorId))) return true;
  if (String(guild.ownerId || "") === String(executorId)) return true;
  const executor =
    guild.members.cache.get(executorId) ||
    (await guild.members.fetch(executorId).catch(() => null));
  if (!executor) return false;
  if (
    executor.permissions.has(PermissionsBitField.Flags.Administrator) ||
    executor.permissions.has(PermissionsBitField.Flags.ManageGuild)
  ) {
    return true;
  }
  return [...JOIN_GATE_WHITELIST_ROLE_IDS].some((roleId) =>
    executor.roles.cache.has(roleId),
  );
}

async function sendJoinGatePunishDm(member, reason, extraLines = []) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`You have been kicked! in ${member.guild.name}!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
        ...extraLines.filter(Boolean),
      ].join("\n"),
    );
  try {
    await member.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

async function kickForJoinGate(member, reason, extraLines = [], action = "kick") {
  const dmSent = await sendJoinGatePunishDm(member, reason, extraLines);
  const me = member.guild.members.me;
  const normalizedAction = ["kick", "ban", "log"].includes(
    String(action || "").toLowerCase(),
  )
    ? String(action || "").toLowerCase()
    : "kick";
  const canKick =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) &&
    Boolean(member?.kickable);
  const canBan =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) &&
    Boolean(member?.bannable);
  const canTimeout =
    Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) &&
    Boolean(member?.moderatable);
  let punished = false;
  let appliedAction = normalizedAction;
  if (normalizedAction === "kick" && canKick) {
    punished = await member.kick(reason).then(() => true).catch(() => false);
  } else if (normalizedAction === "ban" && canBan) {
    punished = await member.guild.members
      .ban(member.id, { deleteMessageSeconds: 0, reason })
      .then(() => true)
      .catch(() => false);
  }
  if (!punished && normalizedAction !== "log" && canTimeout) {
    punished = await member
      .timeout(6 * 60 * 60_000, `JoinGate fallback timeout: ${reason}`)
      .then(() => true)
      .catch(() => false);
    if (punished) appliedAction = "timeout";
  }
  if (!punished && normalizedAction !== "log") {
    appliedAction = "log";
  }
  const blocked = appliedAction === "log" ? false : punished;
  if (punished) {
    if (appliedAction === "kick") {
      markJoinGateKick(member.guild.id, member.id, reason);
    }
  }
  const logChannel =
    member.guild.channels.cache.get(IDs.channels.modLogs) ||
    (await member.guild.channels.fetch(IDs.channels.modLogs).catch(() => null));
  if (logChannel?.isTextBased?.()) {
    const nowTs = Math.floor(Date.now() / 1000);
    const embed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("JoinGate Action")
      .setDescription(
        [
          `${ARROW} **Target:** ${member.user} [\`${member.user.id}\`]`,
          `${ARROW} **Action:** ${appliedAction.toUpperCase()}`,
          `${ARROW} **Reason:** ${reason}`,
          ...extraLines.filter(Boolean),
          `${ARROW} **Can Ban:** ${canBan ? "Yes" : "No"}`,
          `${ARROW} **Can Kick:** ${canKick ? "Yes" : "No"}`,
          `${ARROW} **Can Timeout:** ${canTimeout ? "Yes" : "No"}`,
          `${ARROW} **DM Sent:** ${dmSent ? "Yes" : "No"}`,
          `${ARROW} **Punished:** ${punished ? "Yes" : "No"}`,
          `${ARROW} <t:${nowTs}:F>`,
        ].join("\n"),
      );
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
  return {
    blocked,
    attempted: appliedAction === "log" ? false : appliedAction === "ban" ? canBan : canKick,
    punished,
    dmSent,
    canKick,
    canBan,
    canTimeout,
    action: appliedAction,
  };
}

async function sendJoinGateNoAvatarLog(member) {
  if (!member?.guild || !member?.user) return;
  if (!hasNoAvatar(member)) return;

  const logChannel =
    member.guild.channels.cache.get(IDs.channels.modLogs) ||
    (await member.guild.channels.fetch(IDs.channels.modLogs).catch(() => null));
  if (!logChannel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} has triggered the joingate!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** Account has no avatar.`,
      ].join("\n"),
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function sendSuspiciousAccountLog(member, reason) {
  if (!member?.guild || !reason) return;
  const logChannel =
    member.guild.channels.cache.get(IDs.channels.modLogs) ||
    (await member.guild.channels.fetch(IDs.channels.modLogs).catch(() => null));
  if (!logChannel?.isTextBased?.()) return;
  const nowTs = Math.floor(Date.now() / 1000);
  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} has triggered the joingate!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
        `${ARROW} **Rule:** Suspicious Account`,
        `${ARROW} <t:${nowTs}:F>`,
      ].join("\n"),
    );
  await logChannel.send({ embeds: [embed] }).catch(() => {});
}
async function handleTooYoungAccount(member) {
  const createdTs = toUnix(member.user.createdAt);
  await kickForJoinGate(member, "Account is too young to be allowed.", [
    `${ARROW} **Rule:** Minimum Account Age`,
    `${ARROW} **Account Age:** <t:${createdTs}:R>`,
    `${ARROW} **Minimum Age:** ${MIN_ACCOUNT_AGE_DAYS} days`,
  ], "kick");
}

async function sendJoinLog(member) {
  const joinLeaveLogChannel = await resolveGuildChannel(
    member.guild,
    JOIN_LEAVE_LOG_CHANNEL_ID,
  );
  if (!joinLeaveLogChannel) return;

  const accountAge = formatAccountAge(member.user.createdAt);
  const joinLogEmbed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("Member Joined")
    .setDescription(
      [
        `${member.user} ${member.user.tag}.`,
        "",
        "**Account Age**",
        accountAge
      ].join("\n"),
    )
    .setFooter({ text:`ID: ${member.user.id}`})
    .setTimestamp()
    .setThumbnail(member.user.displayAvatarURL({ extension: "png", size: 256 }));

  await joinLeaveLogChannel.send({ embeds: [joinLogEmbed] }).catch((err) => {
    global.logger.error("[guildMemberAdd] Failed to send join log:", err);
  });
}

async function sendDmWelcome(member) {
  const dmEmbed = buildDmWelcomeEmbed(member);
  await member.send({ embeds: [dmEmbed] }).catch((err) => {
    global.logger.warn(
      `[guildMemberAdd] Could not send DM to ${member.user.tag}:`,
      err.message,
    );
  });
}

async function announceInviteInfo(member, channel, info) {
  if (!channel || !info) return;

  if (info.isVanity) {
    await channel
      .send({
        content:
          "<:VC_Reply:1468262952934314131> L'utente ha usato il link vanity **.gg/viniliecaffe**",
      })
      .catch(() => {});
    return;
  }

  await channel
    .send({
      content: `<:VC_Reply:1468262952934314131> e entratx con il link <${info.link}>,\n-# -> invitatx da ${info.inviterTag} che ora ha **${info.totalInvites} inviti**.`,
    })
    .catch(() => {});
}

async function maybeSendInviteReward(member, info) {
  const inviteChannel = await resolveGuildChannel(
    member.guild,
    THANKS_CHANNEL_ID,
  );
  const rewardResult = await tryAwardInviteRole(member, info).catch(() => ({
    awarded: false,
    roleIds: [],
  }));
  if (!inviteChannel || !rewardResult?.awarded || !info?.inviterId) return;

  const rewardedRolesText = (rewardResult.roleIds || [])
    .map((id) => `<@&${id}>`)
    .join(", ");

  const rewardEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:ThankYou:1329504268369002507> Grazie per gli inviti!")
    .setDescription(
      `<@${info.inviterId}> hai fatto entrare almeno **5 persone** e hai ottenuto ${rewardedRolesText || "nuovi ruoli"}` +
        `<a:Boost_Cycle:1329504283007385642> Controlla <#${INFO_PERKS_CHANNEL_ID}> per i nuovi vantaggi.`,
    );
  await inviteChannel.send({ embeds: [rewardEmbed] }).catch(() => {});
}

async function maybeSendInviteNearRewardReminder(member, info) {
  if (!member?.guild || !info || info.isVanity || !info.inviterId) return;
  const totalInvites = Number(info.totalInvites || 0);
  if (totalInvites >= INVITE_REWARD_TARGET) return;
  if (INVITE_REWARD_TARGET - totalInvites !== 1) return;

  const inviterId = String(info.inviterId);
  const guild = member.guild;
  const inviterMember =
    guild.members.cache.get(inviterId) ||
    (await guild.members.fetch(inviterId).catch(() => null));
  if (!inviterMember || inviterMember.user?.bot) return;

  const noDmSet = await getNoDmSet(guild.id).catch(() => new Set());
  if (noDmSet.has(inviterId)) return;

  const state = await InviteReminderState.findOne({
    guildId: guild.id,
    userId: inviterId,
  }).lean().catch(() => null);
  const sentTargets = Array.isArray(state?.inviteNearTargets)
    ? state.inviteNearTargets.map((x) => Number(x)).filter(Number.isFinite)
    : [];
  if (sentTargets.includes(INVITE_REWARD_TARGET)) return;

  const rewardRoleText = INVITE_REWARD_ROLE_ID
    ? `<@&${INVITE_REWARD_ROLE_ID}>`
    : "ruolo reward inviti";
  const payload = {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Ci sei quasi con gli inviti!")
        .setDescription(
          [
            `<a:VC_PandaClap:1331620157398712330> Ti manca solo **1 invito** per arrivare a **${INVITE_REWARD_TARGET}**.`,
            `Quando raggiungi la soglia, ricevi ${rewardRoleText}.`,
            INFO_PERKS_CHANNEL_ID
              ? `Controlla i perks in <#${INFO_PERKS_CHANNEL_ID}>.`
              : "Controlla il canale info del server.",
          ].join("\n"),
        ),
    ],
  };

  const sent = await inviterMember.user.send(payload).then(() => true).catch(() => false);
  if (!sent) return;

  await InviteReminderState.updateOne(
    { guildId: guild.id, userId: inviterId },
    { $addToSet: { inviteNearTargets: INVITE_REWARD_TARGET } },
    { upsert: true },
  ).catch(() => null);
}

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    try {
      if (!member?.guild || !member?.user) return;
      const isCoreExempt =
        CORE_EXEMPT_USER_IDS.has(String(member?.id || "")) ||
        String(member?.guild?.ownerId || "") === String(member?.id || "");

      if (member.user?.bot) {
        if (isCoreExempt) {
          await sendJoinLog(member);
          return;
        }
        await sendJoinLog(member);
        await handleBotJoin(member);
        return;
      }

      if (!isCoreExempt) {
        await sendJoinGateNoAvatarLog(member).catch(() => {});
      }

      let joinRaidResult = { blocked: false };
      if (!isCoreExempt) {
        try {
          joinRaidResult = await processJoinRaidForMember(member);
        } catch (joinRaidError) {
          global.logger?.error?.("[guildMemberAdd] joinRaid failed:", joinRaidError);
          const snapshot = await getJoinRaidStatusSnapshot(member.guild.id).catch(
            () => null,
          );
          if (snapshot?.raidActive) {
            const fallback = await kickForJoinGate(
              member,
              "Join Raid service error while raid protection is active.",
              [
                `${ARROW} **Rule:** Join Raid Fallback`,
                `${ARROW} **Raid Active:** Yes`,
              ],
              "kick",
            );
            joinRaidResult = { blocked: Boolean(fallback?.blocked) };
          } else {
            joinRaidResult = { blocked: false };
          }
        }
      }
      if (joinRaidResult?.blocked) return;

      if (isCoreExempt) {
        scheduleMemberCounterRefresh(member.guild, {
          delayMs: 250,
          secondPassMs: 1800,
        });
        await sendJoinLog(member);
        return;
      }

      if (isTooYoungAccount(member)) {
        await handleTooYoungAccount(member);
        return;
      }

      const nameCandidate = getJoinGateNameCandidate(member);

      if (
        JOIN_GATE.advertisingName.enabled &&
        inviteLikeInName(nameCandidate)
      ) {
        const result = await kickForJoinGate(member, "Advertising invite link in username.", [
          `${ARROW} **Rule:** Advertising Name`,
          `${ARROW} **Name:** ${nameCandidate || "N/A"}`,
        ], JOIN_GATE.advertisingName.action);
        if (result?.blocked) return;
      }

      const usernameMatch = matchUsernameFilters(nameCandidate);
      if (usernameMatch) {
        const result = await kickForJoinGate(member, "Username matches blocked pattern.", [
          `${ARROW} **Rule:** Username Filter`,
          `${ARROW} **Match Type:** ${usernameMatch.type}`,
          `${ARROW} **Match:** ${usernameMatch.value}`,
          `${ARROW} **Name:** ${nameCandidate || "N/A"}`,
        ], JOIN_GATE.usernameFilter.action);
        if (result?.blocked) return;
      }

      if (JOIN_GATE.suspiciousAccount.enabled) {
        const suspiciousReason = detectSuspiciousAccount(member);
        if (suspiciousReason) {
          const result = await kickForJoinGate(
            member,
            `Suspicious account: ${suspiciousReason}`,
            [
              `${ARROW} **Rule:** Suspicious Account`,
              `${ARROW} **Reason:** ${suspiciousReason}`,
            ],
            JOIN_GATE.suspiciousAccount.action,
          );
          if (result?.blocked) return;
        }
      }

      const welcomeChannel = await resolveGuildChannel(
        member.guild,
        IDs.channels.chat,
      );
      if (!welcomeChannel) {
        global.logger.info("[guildMemberAdd] Welcome channel not found.");
      }

      scheduleMemberCounterRefresh(member.guild, {
        delayMs: 250,
        secondPassMs: 1800,
      });
      await sendJoinLog(member);
      await sendDmWelcome(member);

      if (welcomeChannel) {
        await welcomeChannel
          .send({
            content: `Ciao ${member.user}, benvenuto/a! <@&${IDs.roles.Staff}> <a:VC_HeartOrange:1448673443762405386>`,
            embeds: [buildWelcomeEmbed(member)],
          })
          .catch(() => {});
      }

      const info = await resolveInviteInfo(member).catch(() => null);
      if (info && !info.isVanity && info.inviterId) {
        await trackInviteJoin(member, info.inviterId).catch(() => {});
      }
      await maybeSendInviteNearRewardReminder(member, info);
      await maybeSendInviteReward(member, info);
      await announceInviteInfo(member, welcomeChannel, info);
    } catch (error) {
      global.logger?.error?.("[guildMemberAdd] failed:", error);
    }
  },
};
