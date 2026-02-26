const {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  getAntiNukeStatusSnapshot,
  stopAntiNukePanic,
  triggerAntiNukePanicExternal,
  setAntiNukeConfigSnapshot,
} = require("../../Services/Moderation/antiNukeService");
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
const {
  getJoinRaidStatusSnapshot,
  setJoinRaidConfigSnapshot,
} = require("../../Services/Moderation/joinRaidService");
const {
  getJoinGateConfigSnapshot,
  updateJoinGateConfig,
} = require("../../Services/Moderation/joinGateService");
const {
  getAutoModConfigSnapshot,
  getAutoModRulesSnapshot,
  getAutoModPanicSnapshot,
  triggerAutoModPanicExternal,
  updateAutoModConfig,
} = require("../../Services/Moderation/automodService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService");
const { sendSecurityAuditLog } = require("../../Utils/Logging/securityAuditLog");

const STAFF_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.CoFounder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.HighStaff,
  IDs.roles.Supervisor,
  IDs.roles.Coordinator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
].filter(Boolean);

const PANIC_CONTROL_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.CoFounder,
].filter(Boolean);

const PAGE_ROLES = 0;
const PAGE_CHANNELS = 1;
const PAGE_USERS = 2;
const TOTAL_STATICS_PAGES = 3;

function toTs(ms, style = "R") {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `<t:${Math.floor(n / 1000)}:${style}>`;
}

function toCompactDuration(ms) {
  const n = Math.max(0, Number(ms || 0));
  if (!Number.isFinite(n)) return "0m";
  const totalSec = Math.round(n / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.round(totalMin / 60);
  if (totalHr < 24) return `${totalHr}h`;
  const totalDays = Math.round(totalHr / 24);
  return `${totalDays}d`;
}

function formatActionLabel(action, fallback = "log") {
  const raw = String(action || fallback || "log").trim().toLowerCase();
  if (!raw) return "Log";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function hasAnyRole(member, roleIds) {
  return roleIds.some((id) => member?.roles?.cache?.has?.(id));
}

function hasStaffAccess(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  return hasAnyRole(member, STAFF_ROLE_IDS);
}

function hasPanicControlAccess(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  return hasAnyRole(member, PANIC_CONTROL_ROLE_IDS);
}

async function resolveStaticRole(message, rawToken) {
  const mentioned = message?.mentions?.roles?.first?.();
  if (mentioned) return mentioned;
  const id = String(rawToken || "").replace(/[<@&>]/g, "").trim();
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.guild.roles.cache.get(id) || (await message.guild.roles.fetch(id).catch(() => null));
}

async function resolveStaticChannel(message, rawToken) {
  const mentioned = message?.mentions?.channels?.first?.();
  if (mentioned) return mentioned;
  const id = String(rawToken || "").replace(/[<#>]/g, "").trim();
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.guild.channels.cache.get(id) || (await message.guild.channels.fetch(id).catch(() => null));
}

async function resolveStaticUser(message, rawToken) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned) return mentioned;
  const id = String(rawToken || "").replace(/[<@!>]/g, "").trim();
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function parseStaticRequest(args = []) {
  const opIndex = args.findIndex((x) => String(x || "").trim().startsWith("?"));
  if (opIndex < 0) return null;
  const operation = String(args[opIndex] || "").trim().toLowerCase().replace(/^\?+/, "");
  const slot = Number(String(args[opIndex + 1] || "").trim());
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

function buildSecurityStaticsPanelEmbed(guildId, page = PAGE_ROLES) {
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
          `[6]. Logging Channel (${statics.modLoggingChannelId ? "1/1" : "0/1"}):`,
          statics.modLoggingChannelId ? `<#${statics.modLoggingChannelId}>` : "`No record found.`",
          "",
          `[7]. Mod-Logging Channel (${statics.loggingChannelId ? "1/1" : "0/1"}):`,
          statics.loggingChannelId ? `<#${statics.loggingChannelId}>` : "`No record found.`",
          "",
          `[8]. Partnering Channels (${partneringChannels.length}/10):`,
          formatRecordList(partneringChannels, "channel"),
          "",
          `[9]. Main Channel (${statics.mainChannelId ? "1/1" : "0/1"}):`,
          statics.mainChannelId ? `<#${statics.mainChannelId}>` : "`No record found.`",
          "",
          `[12]. Verification Channel (${statics.verificationChannelId ? "1/1" : "0/1"}):`,
          statics.verificationChannelId ? `<#${statics.verificationChannelId}>` : "`No record found.`",
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

function buildStaticsPaginationRow(customBase, page = PAGE_ROLES) {
  const firstDisabled = page <= 0;
  const lastDisabled = page >= TOTAL_STATICS_PAGES - 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customBase}:first`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("<<")
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:prev`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("<")
      .setDisabled(firstDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:next`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(">")
      .setDisabled(lastDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:last`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel(">>")
      .setDisabled(lastDisabled),
    new ButtonBuilder()
      .setCustomId(`${customBase}:close`)
      .setStyle(ButtonStyle.Danger)
      .setLabel("X"),
  );
}

async function openSecurityStaticsPanel(message) {
  let page = PAGE_ROLES;
  const base = `security-statics:${message.author.id}:${Date.now()}`;
  const sent = await safeMessageReply(message, {
    embeds: [buildSecurityStaticsPanelEmbed(message.guild.id, page)],
    components: [buildStaticsPaginationRow(base, page)],
    allowedMentions: { repliedUser: false },
  });
  if (!sent) return;

  const collector = sent.createMessageComponentCollector({ time: 5 * 60_000 });
  collector.on("collect", async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello puo usarlo.",
          ephemeral: true,
        }).catch(() => null);
        return;
      }
      const customId = String(interaction.customId || "");
      if (!customId.startsWith(`${base}:`)) return;
      const action = customId.slice(base.length + 1);

      if (action === "close") {
        collector.stop("closed");
        await interaction.update({
          embeds: [buildSecurityStaticsPanelEmbed(message.guild.id, page)],
          components: [],
        }).catch(() => null);
        return;
      }
      if (action === "first") page = 0;
      if (action === "prev") page = Math.max(0, page - 1);
      if (action === "next") page = Math.min(TOTAL_STATICS_PAGES - 1, page + 1);
      if (action === "last") page = TOTAL_STATICS_PAGES - 1;

      await interaction.update({
        embeds: [buildSecurityStaticsPanelEmbed(message.guild.id, page)],
        components: [buildStaticsPaginationRow(base, page)],
      }).catch(() => null);
    } catch {
      return;
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "closed") return;
    await sent.edit({
      embeds: [buildSecurityStaticsPanelEmbed(message.guild.id, page)],
      components: [],
    }).catch(() => null);
  });
}

async function executeSecurityStatics(message, args = []) {
  const guild = message?.guild;
  if (!guild || !message.member) return;

  const request = parseStaticRequest(args);
  if (!request) {
    await openSecurityStaticsPanel(message);
    return;
  }

  const { operation, slot, targetToken } = request;
  const canManagePrivileged = hasPanicControlAccess(message.member, guild);
  if ((slot === 10 || slot === 11) && !canManagePrivileged) {
    await safeMessageReply(message, {
      content: "<:vegax:1443934876440068179> Solo Founder e Co Founder possono modificare [10] e [11].",
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
    const role = await resolveStaticRole(message, targetToken);
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
      action: "security.statics.set_quarantine_role",
      details: [`Role: ${role} (\`${role.id}\`)`],
      color: "#57F287",
    }).catch(() => null);
    await safeMessageReply(message, {
      content: `[OK] [2] Quarantine Role impostato su ${role}.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (slot === 5) {
    const role = await resolveStaticRole(message, targetToken);
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
        content: "<:vegax:1443934876440068179> Per [5] usa `?add`, `?set` o `?remove`.",
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
      action: `security.statics.main_roles.${operation}`,
      details: [`Role: ${role} (\`${role.id}\`)`],
      color: "#57F287",
    }).catch(() => null);
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
        content: "<:vegax:1443934876440068179> Per [6], [7], [9], [12] usa `?set`.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const channel = await resolveStaticChannel(message, targetToken);
    if (!channel) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Canale non valido.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const update =
      slot === 6
        ? setModLoggingChannel(guild.id, channel.id)
        : slot === 7
          ? setLoggingChannel(guild.id, channel.id)
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
          ? "security.statics.set_mod_logging_channel"
          : slot === 7
            ? "security.statics.set_logging_channel"
            : slot === 9
              ? "security.statics.set_main_channel"
              : "security.statics.set_verification_channel",
      details: [`Channel: ${channel} (\`${channel.id}\`)`],
      color: "#57F287",
    }).catch(() => null);
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
    const channel = await resolveStaticChannel(message, targetToken);
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
        content: "<:vegax:1443934876440068179> Per [8] usa `?set`, `?add` o `?remove`.",
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
      action: `security.statics.partnering_channels.${operation}`,
      details: [`Channel: ${channel} (\`${channel.id}\`)`],
      color: "#57F287",
    }).catch(() => null);
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
    const user = await resolveStaticUser(message, targetToken);
    if (!user || user.bot) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Utente non valido.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    let result = null;
    if (operation === "add") {
      result = slot === 10 ? addTrustedAdmin(guild.id, user.id) : addExtraOwner(guild.id, user.id);
    } else if (operation === "remove" || operation === "del") {
      result = slot === 10 ? removeTrustedAdmin(guild.id, user.id) : removeExtraOwner(guild.id, user.id);
    } else {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Per [10] e [11] usa `?add` o `?remove`.",
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
      action: slot === 10 ? `security.statics.trusted.${operation}` : `security.statics.extra_owner.${operation}`,
      details: [`User: <@${user.id}> (\`${user.id}\`)`],
      color: "#57F287",
    }).catch(() => null);
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
}

function usageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Command")
    .setDescription(
      [
        "`+security status`",
        "`+security statics [target ?add/?set/?remove slot]`",
        "`+security enable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
        "`+security disable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
        "`+security panic status`",
        "`+security panic enable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
        "`+security panic disable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
      ].join("\n"),
    );
}

function panicUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Panic Help")
    .setDescription(
      [
        "`+security panic status` -> Pannello panic paginato.",
        "`+security panic enable antinuke` -> Riabilita AntiNuke e avvia panic manuale.",
        "`+security panic enable automod` -> Riabilita AutoMod e avvia panic manuale.",
        "`+security panic enable joingate` -> Riabilita JoinGate.",
        "`+security panic enable joinraid` -> Riabilita JoinRaid.",
        "`+security panic enable lockcommands` -> Attiva lock comandi.",
        "`+security panic enable all` -> Riabilita tutto insieme.",
        "",
        "`+security panic disable antinuke` -> Spegne AntiNuke se attivo.",
        "`+security panic disable automod` -> Spegne AutoMod se attivo.",
        "`+security panic disable joingate` -> Spegne JoinGate se attivo.",
        "`+security panic disable joinraid` -> Spegne JoinRaid se attivo.",
        "`+security panic disable lockcommands` -> Spegne lock comandi.",
        "`+security panic disable all` -> Spegne tutto insieme.",
      ].join("\n"),
    );
}

function parsePanicTarget(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  const map = {
    antinuke: "antinuke",
    automod: "automod",
    joingate: "joingate",
    joinraid: "joinraid",
    lockcommands: "lockcommands",
    all: "all",
  };
  return map[value] || "";
}

async function sendPagedEmbeds(message, embeds, panelKey) {
  if (!Array.isArray(embeds) || embeds.length === 0) return;
  if (embeds.length === 1) {
    await safeMessageReply(message, {
      embeds: [embeds[0]],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  let pageIndex = 0;
  const nonce = `${panelKey}:${message.id}:${Date.now()}`;
  const ids = {
    first: `security:first:${nonce}`,
    prev: `security:prev:${nonce}`,
    next: `security:next:${nonce}`,
    last: `security:last:${nonce}`,
    close: `security:close:${nonce}`,
  };
  const allowed = new Set(Object.values(ids));

  const row = (disabled = false) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(ids.first)
        .setLabel("<<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(ids.prev)
        .setLabel("<")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex === 0),
      new ButtonBuilder()
        .setCustomId(ids.next)
        .setLabel(">")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex >= embeds.length - 1),
      new ButtonBuilder()
        .setCustomId(ids.last)
        .setLabel(">>")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || pageIndex >= embeds.length - 1),
      new ButtonBuilder()
        .setCustomId(ids.close)
        .setLabel("X")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    );

  const sent = await safeMessageReply(message, {
    embeds: [embeds[pageIndex]],
    components: [row(false)],
    allowedMentions: { repliedUser: false },
  });
  if (!sent || typeof sent.createMessageComponentCollector !== "function") return;

  const collector = sent.createMessageComponentCollector({
    time: 120_000,
    filter: (i) => i.user?.id === message.author.id && allowed.has(String(i.customId || "")),
  });

  collector.on("collect", async (interaction) => {
    const id = String(interaction.customId || "");
    if (id === ids.close) {
      await interaction.update({ embeds: [embeds[pageIndex]], components: [] }).catch(() => null);
      collector.stop("closed");
      return;
    }
    if (id === ids.first) pageIndex = 0;
    if (id === ids.prev) pageIndex = Math.max(0, pageIndex - 1);
    if (id === ids.next) pageIndex = Math.min(embeds.length - 1, pageIndex + 1);
    if (id === ids.last) pageIndex = embeds.length - 1;

    await interaction
      .update({ embeds: [embeds[pageIndex]], components: [row(false)] })
      .catch(() => null);
  });

  collector.on("end", async (_, reason) => {
    if (reason === "closed") return;
    await sent.edit({ embeds: [embeds[pageIndex]], components: [row(true)] }).catch(() => null);
  });
}

async function buildStatusEmbeds(guild) {
  const guildId = String(guild?.id || "");
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const joinGate = getJoinGateConfigSnapshot();
  const autoCfg = getAutoModConfigSnapshot();
  const autoRules = getAutoModRulesSnapshot();
  const autoPanic = getAutoModPanicSnapshot(guildId);
  const sec = await getSecurityLockState(guild);
  const antiCfg = anti?.config || {};
  const panicCfg = antiCfg?.panicMode || {};
  const quarantine = antiCfg?.autoQuarantine || {};
  const backup = panicCfg?.autoBackupSync || {};
  const warnedRoleIds = Array.isArray(panicCfg.warnedRoleIds)
    ? panicCfg.warnedRoleIds.filter(Boolean)
    : [];
  const warnedRoles = warnedRoleIds.length
    ? warnedRoleIds.map((id) => `<@&${id}>`).join(", ")
    : "`No record found.`";

  const raidWarnedRoleIds = Array.isArray(raid?.config?.warnedRoleIds)
    ? raid.config.warnedRoleIds.filter(Boolean)
    : [];
  const raidWarnedRoles = raidWarnedRoleIds.length
    ? raidWarnedRoleIds.map((id) => `<@&${id}>`).join(", ")
    : "❌";
  const idFlag = raid?.config?.idFlag || {};
  const ageFlag = raid?.config?.ageFlag || {};
  const noPfpFlag = raid?.config?.noPfpFlag || {};

  const hs = autoCfg?.heatSystem || {};
  const at = autoCfg?.autoTimeouts || {};
  const panic = autoCfg?.panic || {};
  const lock = autoCfg?.autoLockdown || {};
  const minAgeDays = Number(joinGate?.newAccounts?.minAgeDays || 3);

  const page1 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Global Anti-Nuke Panel")
    .setDescription(
      [
        "[1] Status:",
        `- \`${anti?.enabled ? "Enabled" : "Disabled"}\``,
        "",
        "[2] Panic Mode:",
        `- \`+security panic status\``,
        "",
        "[3] Backups:",
        `- [A] Status: \`${backup.enabled ? "Enabled" : "Disabled"}\``,
        "- [B] Max immagini: `10`",
        "- [C] Intervallo: `Ogni 3h`",
        "",
        "[4] Prune Detection:",
        `- \`${antiCfg?.detectPrune ? "Enabled" : "Disabled"}\``,
        "",
        "[5] Quarantine Hold:",
        `- [A] Status: \`${quarantine.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Strict Mode: \`${quarantine.strictMode ? "Enabled" : "Disabled"}\``,
        `- [C] Monitor Public Roles: \`${quarantine.monitorPublicRoles ? "Enabled" : "Disabled"}\``,
        `- [D] Vanity Protection: \`${antiCfg?.vanityGuard ? "Enabled" : "Disabled"}\``,
        `- [E] Strict Member Role Addition: \`${quarantine.strictMemberRoleAddition ? "Enabled" : "Disabled"}\``,
        "",
        "[6] Runtime:",
        `- Panic **${anti?.panicActive ? "ON" : "OFF"}**, JoinRaid **${raid?.raidActive ? "ON" : "OFF"}**, AutoMod Panic **${autoPanic.active ? "ON" : "OFF"}**`,
        `- JoinLock **${sec.joinLockActive ? "ON" : "OFF"}**, CmdLock **${sec.commandLockActive ? "ON" : "OFF"}**`,
        `- Warned roles: ${warnedRoles}`,
      ].join("\n"),
    );

  const page2 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Join Raid")
    .setDescription(
      [
        "[1] Status:        [2] Action:        [3] Warned Roles:",
        `- \`${raid?.enabled ? "Enabled" : "Disabled"}\`        - \`${formatActionLabel(raid?.config?.triggerAction, "ban")}\`        - ${raidWarnedRoles}`,
        "",
        "[4] Details:",
        `- [X] Lock Commands While Raid: \`${raid?.config?.lockCommands ? "Enabled" : "Disabled"}\``,
        `- [A] Minimum Trigger: \`${Number(raid?.config?.triggerCount || 10)} accounts\``,
        `- [B] Join History: Past \`${toCompactDuration(raid?.config?.triggerWindowMs || 0)}\``,
        `- [C] Trigger Duration: \`${toCompactDuration(raid?.config?.raidDurationMs || 0)}\``,
        "",
        "[5] Age Flag:",
        `- [A] Status: \`${ageFlag.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Minimum: \`${toCompactDuration(ageFlag.minimumAgeMs || 0)}\``,
        "",
        "[6] NoPFP Flag:",
        `- \`${noPfpFlag.enabled ? "Enabled" : "Disabled"}\``,
        "",
        "[7] ID Flag:",
        `- [A] Status: \`${idFlag.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Granularity: \`${String(idFlag.categorization || "adaptive")}\``,
        `- [C] Margin: \`${toCompactDuration(raid?.config?.triggerWindowMs || 0)}\``,
        `- [D] Minimum Matches: \`${Number(idFlag.minimumMatches || 4)}\``,
      ].join("\n"),
    );

  const page3 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Heat System Panel")
    .setDescription(
      [
        "[1] Status:",
        `- \`${autoRules?.status?.enabled ? "Enabled" : "Disabled"}\``,
        "",
        "[2] Spam Filters:",
        `- \`${autoRules?.status?.antiSpamEnabled ? "Enabled" : "Disabled"}\``,
        "",
        "[3] Max Heat Percentage:",
        `- \`${Number(hs.maxHeat || 100)}%\``,
        "",
        "[4] Heat Degradation:",
        `- \`${Number(hs.decayPerSec || 0)}% per second\``,
        "",
        "[5] Strikes CAP:",
        `- \`${Number(at.capStrike || 3)}\``,
        "",
        "[6] Auto Timeouts:",
        `- [A] Status: \`${at.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Regular Strike Duration: \`${toCompactDuration(at.regularStrikeDurationMs)}\``,
        `- [C] CAP Strike Duration: \`${toCompactDuration(at.capStrikeDurationMs)}\``,
        "",
        "[7] Heat Panic Mode:",
        `- [A] Status: \`${panic.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Trigger: \`${Number(panic.triggerCount || 3)} Raiders\``,
        `- [C] Panic Duration: \`${toCompactDuration(panic.durationMs)}\``,
        "",
        "[8] Auto Server Lockdown:",
        `- [A] Status: \`${lock.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Mentions: \`${Number(lock.mentionTrigger || 50)}\``,
        `- [C] Under: \`${toCompactDuration(lock.mentionWindowMs)}\``,
      ].join("\n"),
    );

  const page4 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("JoinGate Panel")
    .setDescription(
      [
        "[1] General:",
        `- [A] Status: \`${joinGate?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] DM Members: \`${joinGate?.dmPunishedMembers ? "Enabled" : "Disabled"}\``,
        "",
        "[2] No Avatar Filter:",
        `- [A] Status: \`${joinGate?.noAvatar?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.noAvatar?.action, "log")}\``,
        "",
        "[3] Account Age Filter:",
        `- [A] Status: \`${joinGate?.newAccounts?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.newAccounts?.action, "kick")}\``,
        `- [C] Minimum Age: \`${minAgeDays} days\``,
        "",
        "[4] Bot Addition Filter:",
        `- [A] Status: \`${joinGate?.botAdditions?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.botAdditions?.action, "kick")}\``,
        "",
        "[5] Suspicious Account Filter:",
        `- [A] Status: \`${joinGate?.suspiciousAccount?.enabled ? "Enabled" : "Disabled"}\``,
        `- [B] Action: \`${formatActionLabel(joinGate?.suspiciousAccount?.action, "log")}\``,
      ].join("\n"),
    );

  return [page1, page2, page3, page4];
}

async function buildPanicStatusEmbeds(guild) {
  const guildId = String(guild?.id || "");
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const auto = getAutoModPanicSnapshot(guildId);
  const sec = await getSecurityLockState(guild);

  const panicCfg = anti?.config?.panicMode || {};
  const lockdown = panicCfg?.lockdown || {};
  const warnedRoleIds = Array.isArray(panicCfg?.warnedRoleIds)
    ? panicCfg.warnedRoleIds.filter(Boolean)
    : [];
  const whitelistCategoryIds = Array.isArray(panicCfg?.whitelistCategoryIds)
    ? panicCfg.whitelistCategoryIds.filter(Boolean)
    : [];
  const warnedRows = warnedRoleIds.length
    ? warnedRoleIds.slice(0, 3).map((id) => `<@&${id}>`).join(", ")
    : "`No record found.`";
  const whitelistRows = whitelistCategoryIds.length
    ? whitelistCategoryIds.slice(0, 3).map((id) => `<#${id}>`).join(", ")
    : "`No record found.`";

  const page1 = new EmbedBuilder()
    .setColor(panicCfg.enabled ? "#6f4e37" : "#57F287")
    .setTitle("Anti-Nuke Panic Mode")
    .setDescription(
      [
        "[1] Status:",
        `- *${panicCfg.enabled ? "Enabled" : "Disabled"}*`,
        "",
        "[2] Heat Algorithm:",
        `- *${panicCfg.useHeatAlgorithm ? "Enabled" : "Disabled"}*`,
        "",
        "[3] Lockdown Server on trigger:",
        `- *${lockdown.dangerousRoles || lockdown.channelLockdown || lockdown.lockAllCommands ? "Enabled" : "Disabled"}*`,
        "",
        "[4] Unlock Server when ending:",
        `- *${lockdown.unlockDangerousRolesOnFinish ? "Enabled" : "Disabled"}*`,
        "",
        `[5] Warned Roles (${Math.min(warnedRoleIds.length, 3)}/3):`,
        warnedRows,
        "",
        `[6] Whitelisted Categories (${Math.min(whitelistCategoryIds.length, 3)}/3):`,
        whitelistRows,
        "",
        "[7] Lock Mod Cmds on trigger:",
        `- *${lockdown.lockModerationCommands ? "Enabled" : "Disabled"}*`,
        "",
        `Panic attiva ora: **${anti?.panicActive ? "SI" : "NO"}**${anti?.panicActive ? ` (fino a ${toTs(anti?.panicActiveUntil, "F")})` : ""}`,
      ].join("\n"),
    );

  const page2 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Panic Runtime Overview")
    .setDescription(
      [
        "[1] AutoMod Panic:",
        `- Enabled: **${auto?.enabled ? "ON" : "OFF"}**`,
        `- Active: **${auto?.active ? "ON" : "OFF"}**${auto?.active ? ` (fino a ${toTs(auto?.activeUntil, "F")})` : ""}`,
        `- Tracked Accounts: **${Number(auto?.trackedAccounts || 0)}**`,
        "",
        "[2] JoinRaid Runtime:",
        `- Enabled: **${raid?.enabled ? "ON" : "OFF"}**`,
        `- Active: **${raid?.raidActive ? "ON" : "OFF"}**${raid?.raidActive ? ` (fino a ${toTs(raid?.raidUntil, "F")})` : ""}`,
        `- LockCommands: **${raid?.config?.lockCommands ? "ON" : "OFF"}**`,
        "",
        "[3] Global Locks:",
        `- Join lock active: **${sec?.joinLockActive ? "ON" : "OFF"}**`,
        `- Command lock active: **${sec?.commandLockActive ? "ON" : "OFF"}**`,
      ].join("\n"),
    );

  return [page1, page2];
}

async function disableAntiNuke(guild, actorId) {
  const guildId = String(guild?.id || "");
  const snap = getAntiNukeStatusSnapshot(guildId);
  const wasActive = Boolean(snap?.panicActive || snap?.enabled || snap?.panicModeEnabled);
  if (!wasActive) return { ok: true, changed: false, note: "AntiNuke gia spento/inattivo." };

  let panicStopped = false;
  if (snap?.panicActive) {
    const stopped = await stopAntiNukePanic(guild, "manual security panic disable", actorId).catch(() => ({ ok: false }));
    panicStopped = Boolean(stopped?.ok);
  }

  const cfg = snap?.config || {};
  const setResult = setAntiNukeConfigSnapshot({
    ...cfg,
    enabled: false,
    panicMode: {
      ...(cfg.panicMode || {}),
      enabled: false,
      lockdown: {
        ...(cfg.panicMode?.lockdown || {}),
        lockModerationCommands: false,
        lockAllCommands: false,
      },
    },
  });

  return {
    ok: Boolean(setResult?.ok),
    changed: true,
    note: `AntiNuke disabilitato${panicStopped ? " + panic stoppata" : ""}.`,
  };
}

async function disableAutoMod(guildId) {
  const cfg = getAutoModConfigSnapshot();
  const panic = getAutoModPanicSnapshot(guildId);
  const rules = getAutoModRulesSnapshot();
  const wasActive = Boolean(rules?.status?.enabled || cfg?.panic?.enabled || panic?.active);
  if (!wasActive) return { ok: true, changed: false, note: "AutoMod gia spento/inattivo." };

  const r1 = updateAutoModConfig("enabled", false);
  const r2 = updateAutoModConfig("panic.enabled", false);
  const r3 = updateAutoModConfig("autoLockdown.enabled", false);
  const ok = Boolean(r1?.ok && r2?.ok && r3?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "AutoMod disabilitato (panic/autolockdown OFF)." : "Errore disabilitazione AutoMod.",
  };
}

async function disableJoinGate() {
  const cfg = getJoinGateConfigSnapshot();
  const wasActive = Boolean(cfg?.enabled);
  if (!wasActive) return { ok: true, changed: false, note: "JoinGate gia spento." };

  const updated = updateJoinGateConfig("enabled", "false");
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinGate disabilitato." : "Errore disabilitazione JoinGate.",
  };
}

async function disableJoinRaid(guildId) {
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const wasActive = Boolean(raid?.enabled || raid?.raidActive || raid?.config?.lockCommands);
  if (!wasActive) return { ok: true, changed: false, note: "JoinRaid gia spento/inattivo." };

  const next = {
    ...(raid?.config || {}),
    enabled: false,
    lockCommands: false,
  };
  const updated = setJoinRaidConfigSnapshot(next);
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinRaid disabilitato (lockCommands OFF)." : "Errore disabilitazione JoinRaid.",
  };
}

async function disableLockCommands(guildId) {
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const antiLockMod = Boolean(anti?.config?.panicMode?.lockdown?.lockModerationCommands);
  const antiLockAll = Boolean(anti?.config?.panicMode?.lockdown?.lockAllCommands);
  const raidLock = Boolean(raid?.config?.lockCommands);
  const wasActive = antiLockMod || antiLockAll || raidLock;
  if (!wasActive) return { ok: true, changed: false, note: "LockCommands gia disattivati." };

  const antiCfg = anti?.config || {};
  const antiUpdated = setAntiNukeConfigSnapshot({
    ...antiCfg,
    panicMode: {
      ...(antiCfg.panicMode || {}),
      lockdown: {
        ...(antiCfg.panicMode?.lockdown || {}),
        lockModerationCommands: false,
        lockAllCommands: false,
      },
    },
  });

  const raidUpdated = setJoinRaidConfigSnapshot({
    ...(raid?.config || {}),
    lockCommands: false,
  });

  const ok = Boolean(antiUpdated?.ok && raidUpdated?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "LockCommands disattivati (AntiNuke + JoinRaid)." : "Errore disattivazione LockCommands.",
  };
}

async function enableAntiNuke(guild, actorId) {
  const guildId = String(guild?.id || "");
  const snap = getAntiNukeStatusSnapshot(guildId);
  const cfg = snap?.config || {};

  const setResult = setAntiNukeConfigSnapshot({
    ...cfg,
    enabled: true,
    panicMode: {
      ...(cfg.panicMode || {}),
      enabled: true,
      autoBackupSync: {
        ...(cfg.panicMode?.autoBackupSync || {}),
        enabled: true,
      },
    },
  });
  if (!setResult?.ok) return { ok: false, changed: false, note: "Errore riabilitazione AntiNuke." };

  const triggered = await triggerAntiNukePanicExternal(
    guild,
    `manual security panic enable by ${String(actorId || "unknown")}`,
    500,
  ).catch(() => ({ ok: false }));

  return {
    ok: true,
    changed: true,
    note: triggered?.ok
      ? "AntiNuke riabilitato + panic manuale avviata."
      : "AntiNuke riabilitato (panic manuale non avviata).",
  };
}

async function enableAutoMod(guildId, actorId) {
  const cfg = getAutoModConfigSnapshot();
  const rules = getAutoModRulesSnapshot();
  const panic = getAutoModPanicSnapshot(guildId);
  const wasActive = Boolean(rules?.status?.enabled && cfg?.panic?.enabled && panic?.active);
  if (wasActive) return { ok: true, changed: false, note: "AutoMod panic gia attiva." };

  const r1 = updateAutoModConfig("enabled", true);
  const r2 = updateAutoModConfig("panic.enabled", true);
  if (!r1?.ok || !r2?.ok) {
    return { ok: false, changed: false, note: "Errore riabilitazione AutoMod." };
  }
  const trig = triggerAutoModPanicExternal(guildId, String(actorId || "manual"), {
    activityBoost: 1,
    raidBoost: 1,
  });

  return {
    ok: true,
    changed: true,
    note: trig?.activated
      ? "AutoMod riabilitato + panic manuale avviata."
      : "AutoMod riabilitato (panic manuale non avviata).",
  };
}

async function enableJoinGate() {
  const cfg = getJoinGateConfigSnapshot();
  if (cfg?.enabled) return { ok: true, changed: false, note: "JoinGate gia attivo." };
  const updated = updateJoinGateConfig("enabled", "true");
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinGate riabilitato." : "Errore riabilitazione JoinGate.",
  };
}

async function enableJoinRaid(guildId) {
  const raid = await getJoinRaidStatusSnapshot(guildId);
  if (raid?.enabled) return { ok: true, changed: false, note: "JoinRaid gia attivo." };
  const updated = setJoinRaidConfigSnapshot({
    ...(raid?.config || {}),
    enabled: true,
  });
  return {
    ok: Boolean(updated?.ok),
    changed: true,
    note: updated?.ok ? "JoinRaid riabilitato." : "Errore riabilitazione JoinRaid.",
  };
}

async function enableLockCommands(guildId) {
  const anti = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const antiLockMod = Boolean(anti?.config?.panicMode?.lockdown?.lockModerationCommands);
  const antiLockAll = Boolean(anti?.config?.panicMode?.lockdown?.lockAllCommands);
  const raidLock = Boolean(raid?.config?.lockCommands);
  if (antiLockMod && antiLockAll && raidLock) {
    return { ok: true, changed: false, note: "LockCommands gia attivi." };
  }

  const antiCfg = anti?.config || {};
  const antiUpdated = setAntiNukeConfigSnapshot({
    ...antiCfg,
    panicMode: {
      ...(antiCfg.panicMode || {}),
      lockdown: {
        ...(antiCfg.panicMode?.lockdown || {}),
        lockModerationCommands: true,
        lockAllCommands: true,
      },
    },
  });
  const raidUpdated = setJoinRaidConfigSnapshot({
    ...(raid?.config || {}),
    lockCommands: true,
  });
  const ok = Boolean(antiUpdated?.ok && raidUpdated?.ok);
  return {
    ok,
    changed: true,
    note: ok ? "LockCommands attivati (AntiNuke + JoinRaid)." : "Errore attivazione LockCommands.",
  };
}

async function runSecurityAction(action, target, guild, actorId) {
  const guildId = String(guild?.id || "");
  const results = [];

  if (action === "disable") {
    if (target === "antinuke" || target === "all") {
      results.push({ system: "AntiNuke", ...(await disableAntiNuke(guild, actorId)) });
    }
    if (target === "automod" || target === "all") {
      results.push({ system: "AutoMod", ...(await disableAutoMod(guildId)) });
    }
    if (target === "joingate" || target === "all") {
      results.push({ system: "JoinGate", ...(await disableJoinGate()) });
    }
    if (target === "joinraid" || target === "all") {
      results.push({ system: "JoinRaid", ...(await disableJoinRaid(guildId)) });
    }
    if (target === "lockcommands" || target === "all") {
      results.push({ system: "LockCommands", ...(await disableLockCommands(guildId)) });
    }
    return results;
  }

  if (target === "antinuke" || target === "all") {
    results.push({ system: "AntiNuke", ...(await enableAntiNuke(guild, actorId)) });
  }
  if (target === "automod" || target === "all") {
    results.push({ system: "AutoMod", ...(await enableAutoMod(guildId, actorId)) });
  }
  if (target === "joingate" || target === "all") {
    results.push({ system: "JoinGate", ...(await enableJoinGate()) });
  }
  if (target === "joinraid" || target === "all") {
    results.push({ system: "JoinRaid", ...(await enableJoinRaid(guildId)) });
  }
  if (target === "lockcommands" || target === "all") {
    results.push({ system: "LockCommands", ...(await enableLockCommands(guildId)) });
  }
  return results;
}

module.exports = {
  name: "security",
  subcommands: ["status", "statics", "enable", "disable", "panic", "panic status", "panic enable", "panic disable"],
  subcommandAliases: {
    status: "status",
    statics: "statics",
    enable: "enable",
    disable: "disable",
    panic: "panic",
  },
  subcommandsDescriptions: {
    status: "Pannello paginato con stato completo dei sistemi di sicurezza.",
    statics: "Gestione statics sicurezza (ruoli/canali/utenti statici).",
    enable: "Riattiva completamente uno o più moduli sicurezza.",
    disable: "Disabilita completamente uno o più moduli sicurezza.",
    panic: "Gestione panic mode: status, enable, disable.",
    "panic status": "Mostra il pannello paginato con tutte le panic mode.",
    "panic enable": "Abilita manualmente i sistemi in panic mode.",
    "panic disable": "Disabilita manualmente i sistemi in panic mode.",
  },
  subcommandsUsages: {
    status: "`+security status`",
    statics: "`+security statics` / `+security statics @ruolo ?add 5`",
    enable: "`+security enable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
    disable: "`+security disable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
    panic: "`+security panic <status|enable|disable>`",
    "panic status": "`+security panic status`",
    "panic enable": "`+security panic enable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
    "panic disable": "`+security panic disable <antinuke|automod|joingate|joinraid|lockcommands|all>`",
  },
  allowEmptyArgs: true,

  async execute(message, args = []) {
    if (!message?.guild || !message?.member) return;
    if (!hasStaffAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non hai i permessi.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sub = String(args[0] || "status").toLowerCase();

    if (sub === "status") {
      const pages = await buildStatusEmbeds(message.guild);
      await sendPagedEmbeds(message, pages, "security-status");
      return;
    }

    if (sub === "statics") {
      await executeSecurityStatics(message, args.slice(1));
      return;
    }

    if (sub === "enable") {
      if (!hasPanicControlAccess(message.member, message.guild)) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Solo Founder/CoFounder possono usare security enable.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const target = parsePanicTarget(args[1]);
      if (!target) {
        await safeMessageReply(message, {
          embeds: [usageEmbed()],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const results = await runSecurityAction("enable", target, message.guild, message.author.id);
      const okCount = results.filter((r) => r.ok).length;
      const changedCount = results.filter((r) => r.changed).length;
      const lines = results.map((r) => {
        const status = r.ok ? "OK" : "ERR";
        const changed = r.changed ? "changed" : "no-change";
        return `- **${r.system}**: ${status} (${changed}) - ${r.note}`;
      });

      await sendSecurityAuditLog(message.guild, {
        actorId: message.author.id,
        action: "security.enable",
        details: [`Target: \`${target}\``, `Results: ${okCount}/${results.length} ok, changed ${changedCount}`],
        color: okCount === results.length ? "#57F287" : "#FEE75C",
      }).catch(() => null);

      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(okCount === results.length ? "#57F287" : "#FEE75C")
            .setTitle("Security Enable")
            .setDescription([
              `Target: **${target}**`,
              `Success: **${okCount}/${results.length}**`,
              `Changed: **${changedCount}**`,
              "",
              ...lines,
            ].join("\n")),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "disable") {
      if (!hasPanicControlAccess(message.member, message.guild)) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Solo Founder/CoFounder possono usare security disable.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const target = parsePanicTarget(args[1]);
      if (!target) {
        await safeMessageReply(message, {
          embeds: [usageEmbed()],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const results = await runSecurityAction("disable", target, message.guild, message.author.id);
      const okCount = results.filter((r) => r.ok).length;
      const changedCount = results.filter((r) => r.changed).length;
      const lines = results.map((r) => {
        const status = r.ok ? "OK" : "ERR";
        const changed = r.changed ? "changed" : "no-change";
        return `- **${r.system}**: ${status} (${changed}) - ${r.note}`;
      });

      await sendSecurityAuditLog(message.guild, {
        actorId: message.author.id,
        action: "security.disable",
        details: [`Target: \`${target}\``, `Results: ${okCount}/${results.length} ok, changed ${changedCount}`],
        color: okCount === results.length ? "#57F287" : "#FEE75C",
      }).catch(() => null);

      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(okCount === results.length ? "#57F287" : "#FEE75C")
            .setTitle("Security Disable")
            .setDescription([
              `Target: **${target}**`,
              `Success: **${okCount}/${results.length}**`,
              `Changed: **${changedCount}**`,
              "",
              ...lines,
            ].join("\n")),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub !== "panic") {
      await safeMessageReply(message, {
        embeds: [usageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const action = String(args[1] || "status").toLowerCase();
    if (action === "status") {
      const pages = await buildPanicStatusEmbeds(message.guild);
      await sendPagedEmbeds(message, pages, "security-panic-status");
      return;
    }

    if (!["enable", "disable"].includes(action)) {
      await safeMessageReply(message, {
        embeds: [panicUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!hasPanicControlAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Solo Founder/CoFounder possono usare panic enable/disable.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const target = parsePanicTarget(args[2]);
    if (!target) {
      await safeMessageReply(message, {
        embeds: [panicUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const results = await runSecurityAction(action, target, message.guild, message.author.id);

    const okCount = results.filter((r) => r.ok).length;
    const changedCount = results.filter((r) => r.changed).length;
    const lines = results.map((r) => {
      const status = r.ok ? "OK" : "ERR";
      const changed = r.changed ? "changed" : "no-change";
      return `- **${r.system}**: ${status} (${changed}) - ${r.note}`;
    });

    await sendSecurityAuditLog(message.guild, {
      actorId: message.author.id,
      action: `security.panic.${action}`,
      details: [`Target: \`${target}\``, `Results: ${okCount}/${results.length} ok, changed ${changedCount}`],
      color: okCount === results.length ? "#57F287" : "#FEE75C",
    }).catch(() => null);

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor(okCount === results.length ? "#57F287" : "#FEE75C")
          .setTitle(`Security Panic ${action === "enable" ? "Enable" : "Disable"}`)
          .setDescription([
            `Target: **${target}**`,
            `Success: **${okCount}/${results.length}**`,
            `Changed: **${changedCount}**`,
            "",
            ...lines,
          ].join("\n")),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};
