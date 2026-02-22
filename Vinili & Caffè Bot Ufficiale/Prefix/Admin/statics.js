const {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const {
  getSecurityStaticsSnapshot,
  getSecurityProfilesSnapshot,
  setQuarantineRole,
  addMainRole,
  removeMainRole,
  setLoggingChannel,
  setModLoggingChannel,
  setMainChannel,
  setVerificationChannel,
  addPartneringChannel,
  removePartneringChannel,
  addTrustedAdmin,
  removeTrustedAdmin,
  addExtraOwner,
  removeExtraOwner,
} = require("../../Services/Moderation/securityProfilesService");
const { setAntiNukeConfigSnapshot } = require("../../Services/Moderation/antiNukeService");
const { sendSecurityAuditLog } = require("../../Utils/Logging/securityAuditLog");

const FOUNDER_ROLE_IDS = [IDs?.roles?.Founder, IDs?.roles?.CoFounder]
  .map((id) => String(id || "").trim())
  .filter(Boolean);

const PAGE_ROLES = 0;
const PAGE_CHANNELS = 1;
const PAGE_USERS = 2;
const TOTAL_PAGES = 3;

function usageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Statics")
    .setDescription(
      [
        "`+statics`",
        "`+statics @ruolo ?add 2`",
        "`+statics @ruolo ?add 5`",
        "`+statics @ruolo ?remove 5`",
        "`+statics #canale ?set 6`",
        "`+statics #canale ?set 7`",
        "`+statics #canale ?set 8`",
        "`+statics #canale ?remove 8`",
        "`+statics #canale ?set 9`",
        "`+statics #canale ?set 12`",
        "`+statics @utente ?add 10`",
        "`+statics @utente ?remove 10`",
        "`+statics @utente ?add 11`",
        "`+statics @utente ?remove 11`",
      ].join("\n"),
    )
    .setFooter({
      text: "2=Quarantine Role, 5=Main Roles, 6=Logging, 7=Mod-Logging, 8=Partnering, 9=Main Channel, 10=Trusted Admins, 11=Extra Owners, 12=Verification Channel",
    });
}

function hasFounderControl(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  return FOUNDER_ROLE_IDS.some((roleId) => member.roles?.cache?.has?.(roleId));
}

async function resolveRole(message, rawToken) {
  const mentioned = message?.mentions?.roles?.first?.();
  if (mentioned) return mentioned;
  const id = String(rawToken || "").replace(/[<@&>]/g, "").trim();
  if (!/^\d{16,20}$/.test(id)) return null;
  return (
    message.guild.roles.cache.get(id) ||
    (await message.guild.roles.fetch(id).catch(() => null))
  );
}

async function resolveChannel(message, rawToken) {
  const mentioned = message?.mentions?.channels?.first?.();
  if (mentioned) return mentioned;
  const id = String(rawToken || "").replace(/[<#>]/g, "").trim();
  if (!/^\d{16,20}$/.test(id)) return null;
  return (
    message.guild.channels.cache.get(id) ||
    (await message.guild.channels.fetch(id).catch(() => null))
  );
}

async function resolveUser(message, rawToken) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned) return mentioned;
  const id = String(rawToken || "").replace(/[<@!>]/g, "").trim();
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function parseStaticRequest(args = []) {
  const opIndex = args.findIndex((x) => String(x || "").trim().startsWith("?"));
  if (opIndex < 0) return null;
  const opRaw = String(args[opIndex] || "").trim().toLowerCase();
  const operation = opRaw.replace(/^\?+/, "");
  const slotRaw = String(args[opIndex + 1] || "").trim();
  const slot = Number(slotRaw);
  if (!Number.isFinite(slot)) return null;
  const targetToken = String(args.slice(0, opIndex).join(" ").trim() || "");
  return { operation, slot, targetToken };
}

function formatRecordList(ids = [], kind = "role") {
  const arr = Array.isArray(ids) ? ids : [];
  if (!arr.length) return "`No record found.`";
  if (kind === "channel") return arr.map((id) => `<#${id}>`).join("\n");
  if (kind === "user") return arr.map((id) => `<@${id}>`).join("\n");
  return arr.map((id) => `<@&${id}>`).join("\n");
}

function buildTypesLine(activePage) {
  const roles = activePage === PAGE_ROLES ? "**[ Roles ]**" : "[Roles]";
  const channels = activePage === PAGE_CHANNELS ? "**[ Channels ]**" : "[Channels]";
  const users = activePage === PAGE_USERS ? "**[ Users ]**" : "[Users]";
  return `${roles} ${channels} ${users}`;
}

function buildStaticPanelEmbed(guildId, page = PAGE_ROLES) {
  const statics = getSecurityStaticsSnapshot(guildId);
  const profiles = getSecurityProfilesSnapshot(guildId);
  const mainRoles = Array.isArray(statics?.mainRoleIds) ? statics.mainRoleIds : [];
  const partneringChannels = Array.isArray(statics?.partneringChannelIds)
    ? statics.partneringChannelIds
    : [];
  const trusted = Array.isArray(profiles?.trustedAdmins) ? profiles.trustedAdmins : [];
  const owners = Array.isArray(profiles?.extraOwners) ? profiles.extraOwners : [];

  if (page === PAGE_CHANNELS) {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Static Channels")
      .setDescription(
        [
          `[6]. Logging Channel (${statics.loggingChannelId ? "1/1" : "0/1"}):`,
          statics.loggingChannelId ? `<#${statics.loggingChannelId}>` : "`No record found.`",
          "",
          `[7]. Mod-Logging Channel (${statics.modLoggingChannelId ? "1/1" : "0/1"}):`,
          statics.modLoggingChannelId
            ? `<#${statics.modLoggingChannelId}>`
            : "`No record found.`",
          "",
          `[8]. Partnering Channels (${partneringChannels.length}/10):`,
          formatRecordList(partneringChannels, "channel"),
          "",
          `[9]. Main Channel (${statics.mainChannelId ? "1/1" : "0/1"}):`,
          statics.mainChannelId ? `<#${statics.mainChannelId}>` : "`No record found.`",
          "",
          `[12]. Verification Channel (${statics.verificationChannelId ? "1/1" : "0/1"}):`,
          statics.verificationChannelId
            ? `<#${statics.verificationChannelId}>`
            : "`No record found.`",
          "",
          "Statics Types:",
          buildTypesLine(PAGE_CHANNELS),
        ].join("\n"),
      );
  }

  if (page === PAGE_USERS) {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Static Members")
      .setDescription(
        [
          `[10]. Trusted Admins (${trusted.length}/5):`,
          formatRecordList(trusted, "user"),
          "",
          `[11]. Extra Owners (${owners.length}/5):`,
          formatRecordList(owners, "user"),
          "",
          "Statics Types:",
          buildTypesLine(PAGE_USERS),
        ].join("\n"),
      );
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Static Roles")
    .setDescription(
      [
        `[2]. Quarantine Role (${statics.quarantineRoleId ? "1/1" : "0/1"}):`,
        statics.quarantineRoleId ? `<@&${statics.quarantineRoleId}>` : "`No record found.`",
        "",
        `[5]. Main Role (${mainRoles.length}/10):`,
        formatRecordList(mainRoles, "role"),
        "",
        "Statics Types:",
        buildTypesLine(PAGE_ROLES),
      ].join("\n"),
    );
}

function buildPaginationRow(customBase, page = PAGE_ROLES) {
  const firstDisabled = page <= 0;
  const lastDisabled = page >= TOTAL_PAGES - 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customBase}:first`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("≪")
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:prev`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("‹")
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:next`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("›")
      .setDisabled(lastDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:last`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("≫")
      .setDisabled(lastDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:close`)
      .setStyle(ButtonStyle.Danger)
      .setLabel("❌"),
  );
}

async function openStaticsPanel(message) {
  let page = PAGE_ROLES;
  const base = `statics:${message.author.id}:${Date.now()}`;
  const sent = await safeMessageReply(message, {
    embeds: [buildStaticPanelEmbed(message.guild.id, page)],
    components: [buildPaginationRow(base, page)],
    allowedMentions: { repliedUser: false },
  });
  if (!sent) return;

  const collector = sent.createMessageComponentCollector({
    time: 5 * 60_000,
  });

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello puo usarlo.",
          ephemeral: true,
        });
        return;
      }
      const customId = String(interaction.customId || "");
      if (!customId.startsWith(`${base}:`)) return;
      const action = customId.slice(base.length + 1);

      if (action === "close") {
        collector.stop("closed");
        await interaction.update({
          embeds: [buildStaticPanelEmbed(message.guild.id, page)],
          components: [],
        });
        return;
      }
      if (action === "first") page = 0;
      if (action === "prev") page = Math.max(0, page - 1);
      if (action === "next") page = Math.min(TOTAL_PAGES - 1, page + 1);
      if (action === "last") page = TOTAL_PAGES - 1;

      await interaction.update({
        embeds: [buildStaticPanelEmbed(message.guild.id, page)],
        components: [buildPaginationRow(base, page)],
      });
    } catch {}
  });

  collector.on("end", async (_, reason) => {
    if (reason === "closed") return;
    try {
      await sent.edit({
        embeds: [buildStaticPanelEmbed(message.guild.id, page)],
        components: [],
      });
    } catch {}
  });
}

module.exports = {
  name: "statics",
  aliases: ["static", "sconfig"],
  subcommands: ["status"],
  allowEmptyArgs: false,

  async execute(message, args = []) {
    const guild = message?.guild;
    if (!guild || !message.member) return;

    if (!args.length || String(args[0] || "").toLowerCase() === "status") {
      await openStaticsPanel(message);
      return;
    }

    const request = parseStaticRequest(args);
    if (!request) {
      await safeMessageReply(message, {
        embeds: [usageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const { operation, slot, targetToken } = request;
    const canManagePrivileged = hasFounderControl(message.member, guild);
    if ((slot === 10 || slot === 11) && !canManagePrivileged) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Solo Founder e Co Founder possono modificare [10] e [11].",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (slot === 2) {
      if (!["add", "set"].includes(operation)) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Per [2] usa `?add` o `?set`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const role = await resolveRole(message, targetToken);
      if (!role) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Ruolo non valido per [2].",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const updated = setQuarantineRole(guild.id, role.id);
      if (!updated?.ok) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Impossibile salvare [2].",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      setAntiNukeConfigSnapshot({
        autoQuarantine: {
          quarantineRoleId: String(role.id),
        },
      });
      await sendSecurityAuditLog(guild, {
        actorId: message.author.id,
        action: "statics.set_quarantine_role",
        details: [`Role: ${role} (\`${role.id}\`)`],
        color: "#57F287",
      });
      await safeMessageReply(message, {
        content: `[OK] [2] Quarantine Role impostato su ${role}.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (slot === 5) {
      const role = await resolveRole(message, targetToken);
      if (!role) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Ruolo non valido per [5].",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      let res = null;
      if (operation === "add" || operation === "set") {
        if (operation === "set") {
          const current = getSecurityStaticsSnapshot(guild.id).mainRoleIds || [];
          for (const roleId of current) removeMainRole(guild.id, roleId);
        }
        res = addMainRole(guild.id, role.id);
      } else if (operation === "remove" || operation === "del") {
        res = removeMainRole(guild.id, role.id);
      } else {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Per [5] usa `?add`, `?set` o `?remove`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!res?.ok) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Impossibile salvare [5].",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await sendSecurityAuditLog(guild, {
        actorId: message.author.id,
        action: `statics.main_roles.${operation}`,
        details: [`Role: ${role} (\`${role.id}\`)`],
        color: "#57F287",
      });
      await safeMessageReply(message, {
        content:
          operation === "remove" || operation === "del"
            ? `[OK] ${role} rimosso da [5] Main Roles.`
            : `[OK] ${role} aggiunto in [5] Main Roles.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (slot === 6 || slot === 7 || slot === 9 || slot === 12) {
      if (operation !== "set") {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Per [6], [7], [9], [12] usa `?set`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const channel = await resolveChannel(message, targetToken);
      if (!channel) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Canale non valido.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const update =
        slot === 6
          ? setLoggingChannel(guild.id, channel.id)
          : slot === 7
            ? setModLoggingChannel(guild.id, channel.id)
            : slot === 9
              ? setMainChannel(guild.id, channel.id)
              : setVerificationChannel(guild.id, channel.id);
      if (!update?.ok) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Impossibile salvare il canale.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await sendSecurityAuditLog(guild, {
        actorId: message.author.id,
        action:
          slot === 6
            ? "statics.set_logging_channel"
            : slot === 7
              ? "statics.set_mod_logging_channel"
              : slot === 9
                ? "statics.set_main_channel"
                : "statics.set_verification_channel",
        details: [`Channel: ${channel} (\`${channel.id}\`)`],
        color: "#57F287",
      });
      await safeMessageReply(message, {
        content:
          slot === 6
            ? `[OK] [6] Logging Channel impostato su ${channel}.`
            : slot === 7
              ? `[OK] [7] Mod-Logging Channel impostato su ${channel}.`
              : slot === 9
                ? `[OK] [9] Main Channel impostato su ${channel}.`
                : `[OK] [12] Verification Channel impostato su ${channel}.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (slot === 8) {
      const channel = await resolveChannel(message, targetToken);
      if (!channel) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Canale non valido per [8].",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      let result = null;
      if (operation === "set" || operation === "add") {
        result = addPartneringChannel(guild.id, channel.id);
      } else if (operation === "remove" || operation === "del") {
        result = removePartneringChannel(guild.id, channel.id);
      } else {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Per [8] usa `?set`, `?add` o `?remove`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!result?.ok) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Impossibile salvare [8].",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await sendSecurityAuditLog(guild, {
        actorId: message.author.id,
        action: `statics.partnering_channels.${operation}`,
        details: [`Channel: ${channel} (\`${channel.id}\`)`],
        color: "#57F287",
      });
      await safeMessageReply(message, {
        content:
          operation === "remove" || operation === "del"
            ? `[OK] ${channel} rimosso da [8] Partnering Channels.`
            : `[OK] ${channel} aggiunto in [8] Partnering Channels.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (slot === 10 || slot === 11) {
      const user = await resolveUser(message, targetToken);
      if (!user || user.bot) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Utente non valido.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      let result = null;
      if (operation === "add") {
        result = slot === 10
          ? addTrustedAdmin(guild.id, user.id)
          : addExtraOwner(guild.id, user.id);
      } else if (operation === "remove" || operation === "del") {
        result = slot === 10
          ? removeTrustedAdmin(guild.id, user.id)
          : removeExtraOwner(guild.id, user.id);
      } else {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Per [10] e [11] usa `?add` o `?remove`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!result?.ok) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Operazione profilo fallita.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await sendSecurityAuditLog(guild, {
        actorId: message.author.id,
        action: slot === 10 ? `statics.trusted.${operation}` : `statics.extra_owner.${operation}`,
        details: [`User: <@${user.id}> (\`${user.id}\`)`],
        color: "#57F287",
      });
      await safeMessageReply(message, {
        content:
          operation === "add"
            ? slot === 10
              ? `[OK] <@${user.id}> aggiunto in [10] Trusted Admins.`
              : `[OK] <@${user.id}> aggiunto in [11] Extra Owners.`
            : slot === 10
              ? `[OK] <@${user.id}> rimosso da [10] Trusted Admins.`
              : `[OK] <@${user.id}> rimosso da [11] Extra Owners.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await safeMessageReply(message, {
      content: "<:vegax:1443934876440068179> Numero static non supportato.",
      allowedMentions: { repliedUser: false },
    });
  },
};
