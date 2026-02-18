const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");

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

  let punished = false;
  try {
    await member.kick(reason);
    punished = true;
  } catch {
    punished = false;
  }

  const logChannel =
    member.guild.channels.cache.get(IDs.channels.modLogs) ||
    (await member.guild.channels.fetch(IDs.channels.modLogs).catch(() => null));
  if (logChannel?.isTextBased?.()) {
    const nowTs = Math.floor(Date.now() / 1000);
    const logEmbed = new EmbedBuilder()
      .setColor("#ED4245")
      .setTitle("JoinGate Action")
      .setDescription(
        [
          `${ARROW} **Target:** ${member.user} [\`${member.user.id}\`]`,
          `${ARROW} **Rule:** Username Filter (post-join)`,
          `${ARROW} **Match Type:** ${match.type}`,
          `${ARROW} **Match:** ${match.value}`,
          `${ARROW} **DM Sent:** ${dmSent ? "Yes" : "No"}`,
          `${ARROW} **Punished:** ${punished ? "Yes" : "No"}`,
          `${ARROW} <t:${nowTs}:F>`,
        ].join("\n"),
      );
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }
}

module.exports = {
  name: "userUpdate",
  async execute(oldUser, newUser, client) {
    const usernameChanged = oldUser?.username !== newUser?.username;
    const globalNameChanged = oldUser?.globalName !== newUser?.globalName;
    if (!usernameChanged && !globalNameChanged) return;

    if (!newUser?.bot) {
      const candidate = String(newUser.globalName || newUser.username || "");
      const match = matchBlockedUsername(candidate);
      if (!match) return;
      for (const guild of client.guilds.cache.values()) {
        if (
          CORE_EXEMPT_USER_IDS.has(String(newUser.id)) ||
          String(guild.ownerId || "") === String(newUser.id)
        ) {
          continue;
        }
        const member =
          guild.members.cache.get(newUser.id) ||
          (await guild.members.fetch(newUser.id).catch(() => null));
        if (!member || member.user?.bot) continue;
        await punishUsernameMatch(member, match);
      }
      return;
    }

    for (const guild of client.guilds.cache.values()) {
      const member =
        guild.members.cache.get(newUser.id) ||
        (await guild.members.fetch(newUser.id).catch(() => null));
      if (!member) continue;
      queueIdsCatalogSync(client, guild.id, "botUserUpdate");
    }
  },
};
