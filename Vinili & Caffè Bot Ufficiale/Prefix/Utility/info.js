const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, PermissionsBitField, UserFlagsBitField, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { getAutoModMemberSnapshot, isAutoModRoleExemptMember, } = require("../../Services/Moderation/automodService");
const {
  isWhitelistedExecutor,
} = require("../../Services/Moderation/antiNukeService");

function boolIcon(value) {
  return value ? "<:success:1461731530333229226>" : "<:cancel:1461730653677551691>";
}

function norm(text) {
  return String(text || "").toLowerCase().trim();
}

async function resolveMember(message, query) {
  const mention = message.mentions?.members?.first();
  if (mention) return mention;
  const id = String(query || "").replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    const cached = message.guild.members.cache.get(id);
    if (cached) return cached;
    return message.guild.members.fetch(id).catch(() => null);
  }
  if (!query) return message.member;
  const target = norm(query);
  return (
    message.guild.members.cache.find((m) => {
      const username = norm(m.user?.username);
      const displayName = norm(m.displayName);
      const tag = norm(m.user?.tag);
      return username === target || displayName === target || tag === target;
    }) || message.member
  );
}

function badgeNames(userFlags) {
  if (!userFlags) return [];
  const map = [
    [UserFlagsBitField.Flags.Staff, "Discord Staff"],
    [UserFlagsBitField.Flags.Partner, "Partner"],
    [UserFlagsBitField.Flags.Hypesquad, "HypeSquad"],
    [UserFlagsBitField.Flags.BugHunterLevel1, "Bug Hunter 1"],
    [UserFlagsBitField.Flags.BugHunterLevel2, "Bug Hunter 2"],
    [UserFlagsBitField.Flags.HypeSquadOnlineHouse1, "House Bravery"],
    [UserFlagsBitField.Flags.HypeSquadOnlineHouse2, "House Brilliance"],
    [UserFlagsBitField.Flags.HypeSquadOnlineHouse3, "House Balance"],
    [UserFlagsBitField.Flags.PremiumEarlySupporter, "Early Supporter"],
    [UserFlagsBitField.Flags.VerifiedDeveloper, "Verified Developer"],
    [UserFlagsBitField.Flags.ActiveDeveloper, "Active Developer"],
    [UserFlagsBitField.Flags.VerifiedBot, "Verified Bot"],
  ];
  return map.filter(([flag]) => userFlags.has(flag)).map(([, label]) => label);
}

function dangerousPerms(member) {
  const checks = [
    [PermissionsBitField.Flags.KickMembers, "Kick Members"],
    [PermissionsBitField.Flags.BanMembers, "Ban Members"],
    [PermissionsBitField.Flags.ManageChannels, "Manage Channels"],
    [PermissionsBitField.Flags.ManageGuild, "Manage Guild"],
    [PermissionsBitField.Flags.ManageMessages, "Manage Messages"],
    [PermissionsBitField.Flags.ManageRoles, "Manage Roles"],
    [PermissionsBitField.Flags.ModerateMembers, "Moderate Members"],
    [PermissionsBitField.Flags.Administrator, "Administrator"],
  ];
  return checks
    .filter(([flag]) => member.permissions.has(flag))
    .map(([, label]) => label);
}

function wickPerms(guild, member, automodExempt, antiNukeExempt) {
  const isOwner = String(guild.ownerId || "") === String(member.id || "");
  const hasAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
  const perms = [];
  if (isOwner) perms.push("Owner");
  if (antiNukeExempt) perms.push("Full Immunity");
  if (automodExempt) perms.push("Automod Immunity");
  if (hasAdmin) perms.push("Dashboard Access");
  if (member.permissions.has(PermissionsBitField.Flags.BanMembers)) perms.push("Ban Command");
  if (member.permissions.has(PermissionsBitField.Flags.KickMembers)) perms.push("Kick Command");
  if (member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) perms.push("Timeout Command");
  return perms;
}

function rolesPreview(member) {
  const roles = [...member.roles.cache.values()]
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);
  if (!roles.length) return "Nessuno";
  const top = roles.slice(0, 12).map((r) => r.toString());
  const extra = roles.length - top.length;
  return extra > 0 ? `${top.join("  ")}  +${extra}` : top.join("  ");
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function buildStrikesEmbed(member, strikes, page, totalPages) {
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const current = strikes[safePage] || [];
  const rows = current.length
    ? current.map((item, i) => `\`${safePage * 5 + i + 1}\` ${item}`)
    : ["Nessuno strike disponibile."];

  return new EmbedBuilder()
    .setColor("#8b5cf6")
    .setTitle(`${member.displayName}'s Strikes:`)
    .setDescription([...rows, "", `Page: ${safePage + 1}/${totalPages}`].join("\n"));
}

function buildStrikeButtons(scope, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`info_strike_first:${scope}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏮️")
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`info_strike_prev:${scope}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("◀️")
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`info_strike_next:${scope}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("▶️")
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`info_strike_last:${scope}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏭️")
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`info_strike_close:${scope}`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
  );
}

module.exports = {
  name: "info",
  aliases: ["whois", "uinfo"],

  async execute(message, args) {
    if (!message.guild) return;
    const member = await resolveMember(message, args.join(" "));
    if (!member) {
      await safeMessageReply(message, {
        content: "Utente non trovato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const user = member.user;
    let flags = user.flags;
    if (!flags && typeof user.fetchFlags === "function") {
      flags = await user.fetchFlags().catch(() => null);
    }

    const auto = await getAutoModMemberSnapshot(member);
    const antiNukeExempt = isWhitelistedExecutor(member.guild, member.id);
    const autoModExempt = isAutoModRoleExemptMember(member.guild, member);
    const dgPerms = dangerousPerms(member);
    const wkPerms = wickPerms(member.guild, member, autoModExempt, antiNukeExempt);
    const badges = badgeNames(flags);

    const createdTs = Math.floor(user.createdTimestamp / 1000);
    const joinedTs = Math.floor((member.joinedTimestamp || Date.now()) / 1000);

    const embed = new EmbedBuilder()
      .setColor(member.displayHexColor && member.displayHexColor !== "#000000"
        ? member.displayHexColor
        : "#6f4e37")
      .setTitle(`Who is ${member.displayName}?`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setDescription(
        [
          "**General Informations:**",
          `<:profile:1461732907508039834> **Name:** ${member.displayName}`,
          `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> ID: \`${member.id}\``,
          `<:creation:1461732905016492220> **Creation:** <t:${createdTs}:R>`,
          `📅 **Join:** <t:${joinedTs}:R>`,
          `🎨 **Color:** \`${member.displayHexColor}\``,
          `🎮 **Discord Badges:** ${badges.length ? badges.join(", ") : "none"}`,
          "",
          "**Bot Informations:**",
          `🚨 **Suspicious?** ${boolIcon(auto.suspicious)}`,
          `<:noDM:1463645183840354517> **Warn Points:** \`${auto.warnPoints}\``,
          `<:alarm:1461725841451909183> **Active Strikes:** \`${auto.activeStrikes}\``,
          `🌡️ **Current Heat:** \`${Number(auto.heat || 0).toFixed(1)}%\``,
          `📌 **Whitelisted?**`,
          `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> Spam: ${boolIcon(auto.whitelist.spam)}`,
          `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> Ping: ${boolIcon(auto.whitelist.ping)}`,
          `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> Advertising: ${boolIcon(auto.whitelist.advertising)}`,
          `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> Quarantine: ${boolIcon(antiNukeExempt)}`,
          `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> Public Roles: ${boolIcon(antiNukeExempt)}`,
          "",
          "**Dangerous User:**",
          `💥 This user has dangerous permissions! ${boolIcon(dgPerms.length > 0)}`,
          dgPerms.length ? `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> ${dgPerms.join("  <:VC_right_arrow:1473441155055096081>  ")}` : "<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> none",
          "",
          "**Bot Permissions:**",
          `🤖 This user has Bot permissions ${boolIcon(wkPerms.length > 0)}`,
          wkPerms.length ? `<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> ${wkPerms.join("  <:VC_right_arrow:1473441155055096081>  ")}` : "<:space:1461733157840621608><:rightDoubleArrow:1465450678062288937> none",
          "",
          "**Account Accessories:**",
          `☷ **Roles:** ${rolesPreview(member)}`,
          `🪝 **Webhooks:** ${boolIcon(
            [IDs.bots.Wick, IDs.bots.Dyno, IDs.bots.Xenon].includes(member.id),
          )}`,
        ].join("\n"),
      );

    const strikeItems = Array.isArray(auto.strikeReasons)
      ? auto.strikeReasons.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const strikePages = chunk(strikeItems, 5);
    const totalPages = 1 + strikePages.length;

    const buildPageEmbed = (pageIndex) => {
      if (pageIndex <= 0) return embed;
      const strikePageIndex = pageIndex - 1;
      const strikeRows = (strikePages[strikePageIndex] || []).map(
        (item, i) => `\`${strikePageIndex * 5 + i + 1}\` ${item}`,
      );
      const strikeEmbed = new EmbedBuilder(embed.data)
        .setDescription(
          [
            "**Active Strikes:**",
            ...(strikeRows.length ? strikeRows : ["Nessuno strike disponibile."]),
            "",
            `Page: ${pageIndex + 1}/${totalPages}`,
          ].join("\n"),
        );
      return strikeEmbed;
    };

    const payload = {
      embeds: [buildPageEmbed(0)],
      allowedMentions: { repliedUser: false },
    };

    if (totalPages > 1) {
      const scope = `${message.id}:${member.id}:${Date.now()}`;
      payload.components = [buildStrikeButtons(scope, 0, totalPages)];
      const sent = await safeMessageReply(message, payload);
      if (!sent) return;

      let currentPage = 0;
      const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 10 * 60_000,
      });

      collector.on("collect", async (interaction) => {
        if (!interaction.customId.endsWith(scope)) return;
        if (interaction.user.id !== message.author.id) {
          await interaction
            .reply({
              content: "Solo chi ha usato il comando può usare questi pulsanti.",
              ephemeral: true,
            })
            .catch(() => {});
          return;
        }

        if (interaction.customId.startsWith("info_strike_close:")) {
          collector.stop("closed");
          await interaction.update({ components: [] }).catch(() => {});
          return;
        }
        if (interaction.customId.startsWith("info_strike_first:")) currentPage = 0;
        if (interaction.customId.startsWith("info_strike_prev:")) currentPage = Math.max(0, currentPage - 1);
        if (interaction.customId.startsWith("info_strike_next:")) currentPage = Math.min(totalPages - 1, currentPage + 1);
        if (interaction.customId.startsWith("info_strike_last:")) currentPage = totalPages - 1;

        await interaction
          .update({
            embeds: [buildPageEmbed(currentPage)],
            components: [buildStrikeButtons(scope, currentPage, totalPages)],
          })
          .catch(() => {});
      });

      collector.on("end", async (_, reason) => {
        if (reason === "closed") return;
        await sent.edit({ components: [] }).catch(() => {});
      });
      return;
    }

    await safeMessageReply(message, payload);
  },
};

