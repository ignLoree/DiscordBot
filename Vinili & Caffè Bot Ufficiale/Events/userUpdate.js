const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { markJoinGateKick } = require("../Utils/Moderation/joinGateKickCache");
const {
  isSecurityProfileImmune,
  hasAdminsProfileCapability,
} = require("../Services/Moderation/securityProfilesService");

const ARROW = "<:VC_right_arrow:1473441155055096081>";
const CORE_EXEMPT_USER_IDS = new Set([
  "1466495522474037463",
  "1329118940110127204",
]);
const USERNAME_FILTER = {
  enabled: true,
  postJoinEnabled: true,
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
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wildcardToRegex(pattern) {
  const escaped = String(pattern || "")
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchBlockedUsername(candidate) {
  if (!USERNAME_FILTER.enabled || !USERNAME_FILTER.postJoinEnabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  for (const word of USERNAME_FILTER.strictWords) {
    const normalizedWord = normalizeText(word);
    if (normalizedWord && normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  for (const wildcard of USERNAME_FILTER.wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }
  return null;
}

function firstUsernameMatch(newUser) {
  const checks = [
    String(newUser?.globalName || "").trim(),
    String(newUser?.username || "").trim(),
  ].filter(Boolean);

  for (const value of checks) {
    const match = matchBlockedUsername(value);
    if (match) return match;
  }
  return null;
}

function buildJoinGateTriggeredEmbed(member, reason) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${member.user.username} has triggered the joingate!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
      ].join("\n"),
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}

async function punishUsernameMatch(member, match) {
  const reason = "Username matches blocked pattern (post-join filter).";
  const dmEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`You have been kicked! in ${member.guild.name}!`)
    .setDescription(
      [
        `${ARROW} **Member:** ${member.user} [\`${member.user.id}\`]`,
        `${ARROW} **Reason:** ${reason}`,
        `${ARROW} **Match Type:** ${match.type}`,
        `${ARROW} **Match:** ${match.value}`,
      ].join("\n"),
    );

  let dmSent = false;
  try {
    await member.send({ embeds: [dmEmbed] });
    dmSent = true;
  } catch {
    dmSent = false;
  }

  const me = member.guild.members.me;
  const canKick =
    Boolean(me?.permissions?.has?.(PermissionsBitField.Flags.KickMembers)) &&
    Boolean(member?.kickable);
  let punished = false;
  if (canKick) {
    try {
      await member.kick(reason);
      punished = true;
    } catch {
      punished = false;
    }
  }
  if (punished) {
    markJoinGateKick(member.guild.id, member.id, reason);
  }

  const logChannel =
    IDs.channels.modLogs
      ? member.guild.channels.cache.get(IDs.channels.modLogs) ||
        (await member.guild.channels.fetch(IDs.channels.modLogs).catch(() => null))
      : null;
  if (logChannel?.isTextBased?.()) {
    const logEmbed = punished
      ? new EmbedBuilder()
          .setColor("#A97142")
          .setTitle(`${member.user.username} has been kicked!!`)
          .setDescription(
            [
              `${ARROW} **Member:** ${member.user.username} [\`${member.user.id}\`]`,
              `${ARROW} **Reason:** ${reason}`,
              `${ARROW} **Rule:** Username Filter (post-join)`,
              `${ARROW} **Match Type:** ${match.type}`,
              `${ARROW} **Match:** ${match.value}`,
              "",
              "**More Details:**",
              `${ARROW} **Member Direct Messaged?** ${dmSent ? "✅" : "❌"}`,
              `${ARROW} **Member Punished?** ${punished ? "✅" : "❌"}`,
            ].join("\n"),
          )
          .setFooter({ text: "© 2025 Vinili & Caffè. Tutti i diritti riservati." })
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      : buildJoinGateTriggeredEmbed(member, reason);
    await logChannel.send({ embeds: [logEmbed] }).catch((error) => {
      global.logger?.error?.("[userUpdate] punish log send failed:", error);
    });
  }
}

module.exports = {
  name: "userUpdate",
  async execute(oldUser, newUser, client) {
    try {
      const resolvedClient = client || newUser?.client || oldUser?.client;
      if (!resolvedClient || !newUser?.id) return;

      const usernameChanged = oldUser?.username !== newUser?.username;
      const globalNameChanged = oldUser?.globalName !== newUser?.globalName;

      if (!newUser?.bot) {
        if (!usernameChanged && !globalNameChanged) return;
        const match = firstUsernameMatch(newUser);
        if (!match) return;
        for (const guild of resolvedClient.guilds.cache.values()) {
          if (
            CORE_EXEMPT_USER_IDS.has(String(newUser.id)) ||
            String(guild.ownerId || "") === String(newUser.id) ||
            isSecurityProfileImmune(String(guild?.id || ""), String(newUser.id || ""))
          ) {
            continue;
          }
          const member =
            guild.members.cache.get(newUser.id) ||
            (await guild.members.fetch(newUser.id).catch(() => null));
          if (!member || member.user?.bot) continue;
          if (hasAdminsProfileCapability(member, "fullImmunity")) continue;
          await punishUsernameMatch(member, match);
        }
        return;
      }

      // Bot profile updates can affect IDs catalog references in every guild.
      for (const guild of resolvedClient.guilds.cache.values()) {
        queueIdsCatalogSync(resolvedClient, guild.id, "botUserUpdate");
      }
    } catch (error) {
      global.logger?.error?.("[userUpdate] failed:", error);
    }
  },
};

