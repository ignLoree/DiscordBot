const {
  EmbedBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  ANTINUKE_PRESETS,
  applyAntiNukePreset,
  getAntiNukeStatusSnapshot,
  stopAntiNukePanic,
  triggerAntiNukePanicExternal,
  addMaintenanceAllowlistUser,
  removeMaintenanceAllowlistUser,
  listMaintenanceAllowlist,
} = require("../../Services/Moderation/antiNukeService");
const {
  JOIN_RAID_PRESETS,
  applyJoinRaidPreset,
  getJoinRaidStatusSnapshot,
  setJoinRaidConfigSnapshot,
} = require("../../Services/Moderation/joinRaidService");
const {
  VALID_ACTIONS: JOIN_GATE_VALID_ACTIONS,
  getJoinGateConfigSnapshot,
  updateJoinGateConfig,
} = require("../../Services/Moderation/joinGateService");
const {
  getAutoModPanicSnapshot,
  getAutoModConfigSnapshot,
  getAutoModRulesSnapshot,
  getAutoModDashboardData,
  updateAutoModConfig,
} = require("../../Services/Moderation/automodService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService");
const {
  createSecuritySnapshot,
  listSecuritySnapshots,
  restoreSecuritySnapshot,
} = require("../../Services/Moderation/securitySnapshotService");
const {
  getSecurityProfilesSnapshot,
  addTrustedAdmin,
  removeTrustedAdmin,
  addExtraOwner,
  removeExtraOwner,
  isSecurityProfileImmune,
  getAdminsProfileSnapshot,
  getModeratorsProfileSnapshot,
} = require("../../Services/Moderation/securityProfilesService");
const { sendSecurityAuditLog } = require("../../Utils/Logging/securityAuditLog");
const { getBirthdayLoopStatus } = require("../../Services/Community/birthdayService");
const { getChatReminderLoopStatus } = require("../../Services/Community/chatReminderService");

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

const AUTOMOD_PRESETS = {
  safe: {
    thresholds: {
      warn: 40,
      delete: 72,
      timeout: 95,
    },
    panic: {
      enabled: true,
      considerActivityHistory: true,
      useGlobalBadUsersDb: true,
      triggerCount: 6,
      triggerWindowMs: 480000,
      durationMs: 480000,
      raidWindowMs: 120000,
      raidUserThreshold: 6,
      raidYoungThreshold: 4,
    },
    shorteners: {
      crawl: true,
      timeoutMs: 1800,
      maxHops: 2,
    },
    profiles: {
      default: {
        exempt: false,
        heatMultiplier: 0.9,
        mentionsEnabled: true,
        attachmentsEnabled: true,
        inviteLinksEnabled: true,
      },
      media: {
        exempt: false,
        heatMultiplier: 0.7,
        mentionsEnabled: true,
        attachmentsEnabled: false,
        inviteLinksEnabled: true,
      },
      ticket: {
        exempt: false,
        heatMultiplier: 0.45,
        mentionsEnabled: false,
        attachmentsEnabled: false,
        inviteLinksEnabled: false,
      },
      staff: {
        exempt: true,
        heatMultiplier: 0.2,
        mentionsEnabled: false,
        attachmentsEnabled: false,
        inviteLinksEnabled: false,
      },
    },
  },
};

function toTs(ms, style = "R") {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `<t:${Math.floor(n / 1000)}:${style}>`;
}

function asMin(ms) {
  return Math.max(1, Math.round(Number(ms || 0) / 60_000));
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

function formatDaysSafe(daysRaw, fallback = 3) {
  const n = Number(daysRaw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(3650, Math.round(n)));
}

function formatAntiNukeFilterLine(label, filter) {
  const cfg = filter || {};
  const status = cfg.enabled ? "Enabled" : "Disabled";
  const minuteCap = Number(cfg.minuteLimit || 0);
  const hourCap = Number(cfg.hourLimit || 0);
  const heat = Number(cfg.heatPerAction || 0);
  return [
    `${label}`,
    `\u25b8 [A] Status: *${status}*`,
    `\u25b8 [B] Minute Cap: *${minuteCap}*`,
    `\u25b8 [C] Hour Cap: *${hourCap}*`,
    `\u25b8 [D] Heat: *${heat}%*`,
  ].join("\n");
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

function hasSystemDisableAccess(member, guild) {
  return hasPanicControlAccess(member, guild);
}

function parseUserId(input, message) {
  const mention = message?.mentions?.users?.first?.();
  if (mention?.id) return String(mention.id);
  const raw = String(input || "").replace(/[<@!>]/g, "").trim();
  if (/^\d{16,20}$/.test(raw)) return raw;
  return "";
}

function usageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security Hub")
    .setDescription(
      [
        "`+security joingate <status|set>`",
        "`+security raid <status|preset|set>` (alias: joinraid, jr)",
        "`+security automod <status|tune|preset|stats|top>`",
        "`+security panic ...`",
        "`+security antinuke <status|preset|panic|raid>`",
      ].join("\n"),
    );
}

function antiNukeUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security AntiNuke")
    .setDescription(
      [
        "`+security antinuke status`",
        "`+security antinuke panel`",
        "`+security antinuke preset show`",
        "`+security antinuke preset <safe|balanced|strict>`",
        "`+security antinuke panic status`",
        "`+security antinuke panic start [reason]`",
        "`+security antinuke panic stop [reason]`",
        "`+security antinuke maintenance list`",
        "`+security antinuke maintenance add <userId|@user> [minutes]`",
        "`+security antinuke maintenance remove <userId|@user>`",
        "`+security antinuke caps`",
        "`+security antinuke restore`",
        "`+security antinuke raid status`",
        "`+security antinuke raid preset <safe|balanced|strict>`",
        "`+security antinuke raid set lockCommands <true|false>`",
      ].join("\n"),
    );
}

function applyAutoModPresetConfig(preset) {
  const steps = [
    ["thresholds", preset.thresholds],
    ["panic", preset.panic],
    ["shorteners", preset.shorteners],
    ["profiles", preset.profiles],
  ];
  for (const [path, value] of steps) {
    const updated = updateAutoModConfig(path, value);
    if (!updated?.ok) return { ok: false, failedPath: path };
  }
  return { ok: true };
}

async function handleAntiNuke(message, args = []) {
  const sub = String(args[0] || "status").toLowerCase();

  if (sub === "status" || sub === "panel" || sub === "global") {
    const snap = getAntiNukeStatusSnapshot(message.guild.id);
    const raid = await getJoinRaidStatusSnapshot(message.guild.id);
    const automodPanic = getAutoModPanicSnapshot(message.guild.id);
    const security = await getSecurityLockState(message.guild);
    const panicCfg = snap?.config?.panicMode || {};
    const quarantine = snap?.config?.autoQuarantine || {};
    const backup = panicCfg?.autoBackupSync || {};
    const warnedRoleIds = Array.isArray(panicCfg.warnedRoleIds)
      ? panicCfg.warnedRoleIds.filter(Boolean)
      : [];
    const backupStatus = backup.enabled ? "Enabled" : "Disabled";
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Global Anti-Nuke Panel")
      .setDescription(
        [
          "[1] Status:",
          `\u25b8 \`${snap.enabled ? "Enabled" : "Disabled"}\``,
          "",
          "[2] Panic Mode:",
          `\u25b8 \`+security antinuke panic status\``,
          "",
          "[3] Backups:",
          `\u25b8 [A] Status: \`${backupStatus}\``,
          "\u25b8 [B] Max immagini: `10`",
          "\u25b8 [C] Intervallo: `Ogni 3h`",
          "",
          "[4] Prune Detection:",
          `\u25b8 \`${snap.config?.detectPrune ? "Enabled" : "Disabled"}\``,
          "",
          "[5] Quarantine Hold:",
          `\u25b8 [A] Status: \`${quarantine.enabled ? "Enabled" : "Disabled"}\``,
          `\u25b8 [B] Strict Mode: \`${quarantine.strictMode ? "Enabled" : "Disabled"}\``,
          `\u25b8 [C] Monitor Public Roles: \`${quarantine.monitorPublicRoles ? "Enabled" : "Disabled"}\``,
          `\u25b8 [D] Vanity Protection: \`${snap.config?.vanityGuard ? "Enabled" : "Disabled"}\``,
          `\u25b8 [E] Strict Member Role Addition: \`${quarantine.strictMemberRoleAddition ? "Enabled" : "Disabled"}\``,
          "",
          "Advanced Settings:",
          "\u25b8 Anti-Nuke CAPS: `+security antinuke caps`",
          "\u25b8 Restore System: `+security antinuke restore`",
          "\u25b8 Panic details: `+security antinuke panic status`",
          "",
          `Stato runtime: Panic **${snap.panicActive ? "ON" : "OFF"}**, Raid **${raid?.raidActive ? "ON" : "OFF"}**, AutoMod Panic **${automodPanic.active ? "ON" : "OFF"}**`,
          `Lockdown: Join **${security.joinLockActive ? "ON" : "OFF"}**, Comandi **${security.commandLockActive ? "ON" : "OFF"}**`,
          `Warned roles: **${warnedRoleIds.length}**`,
          security.sources.length ? `Sources: ${security.sources.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "caps") {
    const snap = getAntiNukeStatusSnapshot(message.guild.id);
    const cfg = snap?.config || {};
    const sections = [
      formatAntiNukeFilterLine("[1] Kicks & Bans:", cfg.kickBanFilter),
      formatAntiNukeFilterLine("[2] Role Creations:", cfg.roleCreationFilter),
      formatAntiNukeFilterLine("[3] Role Deletions:", cfg.roleDeletionFilter),
      formatAntiNukeFilterLine("[4] Channel Creations:", cfg.channelCreationFilter),
      formatAntiNukeFilterLine("[5] Channel Deletions:", cfg.channelDeletionFilter),
      formatAntiNukeFilterLine("[6] Webhook Creations:", cfg.webhookCreationFilter),
      formatAntiNukeFilterLine("[7] Webhook Deletions:", cfg.webhookDeletionFilter),
    ];

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Anti-Nuke Caps")
      .setDescription(`\`\`\`\n${sections.join("\n\n")}\n\`\`\``)
      .setFooter({
        text: "Per i limiti extra usa: +security antinuke status",
      });

    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "restore") {
    const snap = getAntiNukeStatusSnapshot(message.guild.id);
    const backup = snap?.config?.panicMode?.autoBackupSync || {};
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Restore System Filters")
      .setDescription(
        [
          `\u25b8 [1] Status: \`${backup.enabled ? "Enabled" : "Disabled"}\``,
          `\u25b8 [2] Restoring Deleted Roles: \`${backup.restoreDeletedRoles ? "Enabled" : "Disabled"}\``,
          `\u25b8 [3] Deleting Created Roles: \`${backup.deleteNewRoles ? "Enabled" : "Disabled"}\``,
          `\u25b8 [4] Restoring Deleted Channels: \`${backup.restoreDeletedChannels ? "Enabled" : "Disabled"}\``,
          `\u25b8 [5] Deleting Created Channels: \`${backup.deleteNewChannels ? "Enabled" : "Disabled"}\``,
          `\u25b8 [6] Deleting Created Webhooks: \`${backup.deleteNewWebhooks ? "Enabled" : "Disabled"}\``,
        ].join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "preset") {
    const mode = String(args[1] || "show").toLowerCase();
    if (mode === "show") {
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("AntiNuke Presets")
        .setDescription(
          "Disponibili: `safe`, `balanced`, `strict`\nUsa `+security antinuke preset <nome>`.",
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(ANTINUKE_PRESETS, mode)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Preset non valido.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const result = applyAntiNukePreset(mode);
    if (result?.ok) {
      await sendSecurityAuditLog(message.guild, {
        actorId: message.author.id,
        action: "antinuke.preset",
        details: [`Preset: \`${mode}\``],
        color: "#57F287",
      });
    }
    await safeMessageReply(message, {
      content: result.ok
        ? `[OK] Preset AntiNuke \`${mode}\` applicato.`
        : "<:vegax:1443934876440068179> Impossibile applicare preset.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "panic") {
    const action = String(args[1] || "status").toLowerCase();
    if (action === "status") {
      const snap = getAntiNukeStatusSnapshot(message.guild.id);
      const panicCfg = snap?.config?.panicMode || {};
      const lockdown = panicCfg?.lockdown || {};
      const warnedRoleIds = Array.isArray(panicCfg.warnedRoleIds)
        ? panicCfg.warnedRoleIds.filter(Boolean)
        : [];
      const whitelistCategoryIds = Array.isArray(panicCfg.whitelistCategoryIds)
        ? panicCfg.whitelistCategoryIds.filter(Boolean)
        : [];
      const warnedRoleCap = 3;
      const whitelistCap = 3;
      const warnedRoleRows = warnedRoleIds.length
        ? warnedRoleIds.slice(0, warnedRoleCap).map((id) => `<@&${id}>`).join(", ")
        : "`No record found.`";
      const whitelistRows = whitelistCategoryIds.length
        ? whitelistCategoryIds
            .slice(0, whitelistCap)
            .map((id) => `<#${id}>`)
            .join(", ")
        : "`No record found.`";
      const embed = new EmbedBuilder()
        .setColor(panicCfg.enabled ? "#6f4e37" : "#57F287")
        .setTitle("Anti-Nuke Panic Mode")
        .setDescription(
          [
            "[1] Status:",
            `\u25b8 *${panicCfg.enabled ? "Enabled" : "Disabled"}*`,
            "",
            "[2] Heat Algorithm:",
            `\u25b8 *${panicCfg.useHeatAlgorithm ? "Enabled" : "Disabled"}*`,
            "",
            "[3] Lockdown Server on trigger:",
            `\u25b8 *${lockdown.dangerousRoles || lockdown.channelLockdown || lockdown.lockAllCommands ? "Enabled" : "Disabled"}*`,
            "",
            "[4] Unlock Server when ending:",
            `\u25b8 *${lockdown.unlockDangerousRolesOnFinish ? "Enabled" : "Disabled"}*`,
            "",
            `[5] Warned Roles (${Math.min(warnedRoleIds.length, warnedRoleCap)}/${warnedRoleCap}):`,
            warnedRoleRows,
            "",
            `[6] Whitelisted Categories (${Math.min(whitelistCategoryIds.length, whitelistCap)}/${whitelistCap}):`,
            whitelistRows,
            "",
            "[7] Lock Mod Cmds on trigger:",
            `\u25b8 *${lockdown.lockModerationCommands ? "Enabled" : "Disabled"}*`,
            "",
            `Panic attiva ora: **${snap.panicActive ? "SI" : "NO"}**${
              snap.panicActive ? ` (fino a ${toTs(snap.panicActiveUntil, "F")})` : ""
            }`,
          ].join("\n"),
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (action === "stop") {
      if (!hasPanicControlAccess(message.member, message.guild)) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Solo Founder e Co Founder possono fermare la Panic Mode.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const reason = String(args.slice(2).join(" ").trim() || "manual stop");
      const stopped = await stopAntiNukePanic(
        message.guild,
        reason,
        message.author.id,
      );
      if (stopped?.ok) {
        await sendSecurityAuditLog(message.guild, {
          actorId: message.author.id,
          action: "antinuke.panic.stop",
          details: [`Motivo: ${reason}`],
          color: "#57F287",
        });
      }
      await safeMessageReply(message, {
        content: stopped.ok
          ? `[OK] Panic mode fermata. Motivo: \`${reason}\``
          : "<:vegax:1443934876440068179> Stop panic fallito.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (action === "start") {
      if (!hasPanicControlAccess(message.member, message.guild)) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Solo Founder e Co Founder possono avviare la Panic Mode.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const reason = String(args.slice(2).join(" ").trim() || "manual start");
      const started = await triggerAntiNukePanicExternal(
        message.guild,
        reason,
        500,
      );
      if (started?.ok) {
        await sendSecurityAuditLog(message.guild, {
          actorId: message.author.id,
          action: "antinuke.panic.start",
          details: [`Motivo: ${reason}`],
          color: "#ED4245",
        });
      }
      await safeMessageReply(message, {
        content: started?.ok
          ? `[OK] Panic mode avviata. Motivo: \`${reason}\``
          : "<:vegax:1443934876440068179> Avvio panic fallito.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  }

  if (sub === "maintenance") {
    const action = String(args[1] || "list").toLowerCase();
    if (!hasPanicControlAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Solo Founder e Co Founder possono gestire la maintenance.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (action === "list") {
      const rows = listMaintenanceAllowlist(message.guild.id);
      const text = rows.length
        ? rows
            .map(
              (row, i) =>
                `${i + 1}. <@${row.userId}> \`${row.userId}\` - scade ${toTs(row.expiresAt, "R")}`,
            )
            .join("\n")
        : "Nessun utente in maintenance.";
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("AntiNuke Maintenance Allowlist")
            .setDescription(text),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (action === "add") {
      const userId = parseUserId(args[2], message);
      const minutes = Math.max(1, Math.min(120, Number(args[3] || 15)));
      if (!userId) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+security antinuke maintenance add <userId|@user> [minutes]`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const added = addMaintenanceAllowlistUser(
        message.guild.id,
        userId,
        minutes * 60_000,
      );
      if (added?.ok) {
        await sendSecurityAuditLog(message.guild, {
          actorId: message.author.id,
          action: "antinuke.maintenance.add",
          details: [
            `Utente: <@${userId}>`,
            `Durata: ${minutes} min`,
          ],
          color: "#57F287",
        });
      }
      await safeMessageReply(message, {
        content: added.ok
          ? `[OK] Aggiunto <@${userId}> in maintenance per **${minutes}** min (fino a ${toTs(added.expiresAt, "F")}).`
          : "<:vegax:1443934876440068179> Impossibile aggiungere utente.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (action === "remove") {
      const userId = parseUserId(args[2], message);
      if (!userId) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+security antinuke maintenance remove <userId|@user>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const removed = removeMaintenanceAllowlistUser(message.guild.id, userId);
      if (removed?.ok) {
        await sendSecurityAuditLog(message.guild, {
          actorId: message.author.id,
          action: "antinuke.maintenance.remove",
          details: [`Utente: <@${userId}>`],
          color: "#57F287",
        });
      }
      await safeMessageReply(message, {
        content: removed.ok
          ? `[OK] Rimosso <@${userId}> dalla maintenance allowlist.`
          : "<:vegax:1443934876440068179> Impossibile rimuovere utente.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  }

  if (sub === "raid") {
    const action = String(args[1] || "status").toLowerCase();
    if (action === "status") {
      const raid = await getJoinRaidStatusSnapshot(message.guild.id);
      if (!raid) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Raid status non disponibile.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const warnedRoleIds = Array.isArray(raid?.config?.warnedRoleIds)
        ? raid.config.warnedRoleIds.filter(Boolean)
        : [];
      const warnedRoles = warnedRoleIds.length
        ? warnedRoleIds.map((id) => `<@&${id}>`).join(", ")
        : "❌";
      const idFlag = raid?.config?.idFlag || {};
      const ageFlag = raid?.config?.ageFlag || {};
      const noPfpFlag = raid?.config?.noPfpFlag || {};
      const raidLockCommands = Boolean(raid?.config?.lockCommands);
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Join Raid")
        .setDescription(
          [
            "[1] Status:        [2] Action:        [3] Warned Roles:",
            `\u25b8 \`${raid.enabled ? "Enabled" : "Disabled"}\`        \u25b8 \`${formatActionLabel(raid?.config?.triggerAction, "ban")}\`        \u25b8 ${warnedRoles}`,
            "",
            "[4] Details:",
            `\u25b8 [X] Lock Commands While Raid: \`${raidLockCommands ? "Enabled" : "Disabled"}\``,
            `\u25b8 [A] Minimum Trigger: \`${Number(raid?.config?.triggerCount || 10)} accounts\``,
            `\u25b8 [B] Join History: Past \`${toCompactDuration(raid?.config?.triggerWindowMs || 0)}\``,
            `\u25b8 [C] Trigger Duration: \`${toCompactDuration(raid?.config?.raidDurationMs || 0)}\``,
            "",
            "[5] String Flag:",
            "\u25b8 `Dashboard`",
            "",
            "[6] Age Flag:",
            `\u25b8 [A] Status: \`${ageFlag.enabled ? "Enabled" : "Disabled"}\``,
            `\u25b8 [B] Minimum: \`${toCompactDuration(ageFlag.minimumAgeMs || 0)}\``,
            "",
            "[7] NoPFP Flag:",
            `\u25b8 \`${noPfpFlag.enabled ? "Enabled" : "Disabled"}\``,
            "",
            "[8] ID Flag:",
            `\u25b8 [A] Status: \`${idFlag.enabled ? "Enabled" : "Disabled"}\``,
            `\u25b8 [B] Granularity: \`${String(idFlag.categorization || "adaptive")}\``,
            `\u25b8 [C] Margin: \`${toCompactDuration(raid?.config?.triggerWindowMs || 0)}\``,
            `\u25b8 [D] Minimum Matches: \`${Number(idFlag.minimumMatches || 4)}\``,
            "",
            `Runtime: active \`${raid.raidActive ? "YES" : "NO"}\`, flagged \`${raid.flaggedRecent}\`, unique \`${raid.uniqueFlaggedRecent}\`${raid.raidActive ? `, until ${toTs(raid.raidUntil, "R")}` : ""}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (action === "set") {
      const key = String(args[2] || "").toLowerCase();
      const rawValue = String(args[3] || "").toLowerCase();
      if (!["lockcommands", "enabled"].includes(key)) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+security antinuke raid set <lockCommands|enabled> <true|false>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!["true", "false", "on", "off", "1", "0", "yes", "no"].includes(rawValue)) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Valore non valido. Usa `true` o `false`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const value = ["true", "on", "1", "yes"].includes(rawValue);
      if (
        key === "enabled" &&
        value === false &&
        !hasSystemDisableAccess(message.member, message.guild)
      ) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Solo Founder e Co Founder possono disattivare i sistemi di sicurezza.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const raid = await getJoinRaidStatusSnapshot(message.guild.id);
      const nextConfig = {
        ...(raid?.config || {}),
        [key === "lockcommands" ? "lockCommands" : "enabled"]: value,
      };
      const updated = setJoinRaidConfigSnapshot(nextConfig);
      if (updated?.ok) {
        await sendSecurityAuditLog(message.guild, {
          actorId: message.author.id,
          action: "raid.set",
          details: [`${key === "lockcommands" ? "lockCommands" : "enabled"}: \`${value}\``],
          color: "#57F287",
        });
      }
      await safeMessageReply(message, {
        content: updated?.ok
          ? `[OK] JoinRaid ${key === "lockcommands" ? "lockCommands" : "enabled"} impostato a \`${value}\`.`
          : "<:vegax:1443934876440068179> Aggiornamento raid config fallito.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (action === "preset") {
      const mode = String(args[2] || "show").toLowerCase();
      if (mode === "show") {
        await safeMessageReply(message, {
          content:
            "Preset raid disponibili: `safe`, `balanced`, `strict`.\nUsa `+security antinuke raid preset <nome>`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(JOIN_RAID_PRESETS, mode)) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Preset raid non valido.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const applied = applyJoinRaidPreset(mode);
      if (applied?.ok) {
        await sendSecurityAuditLog(message.guild, {
          actorId: message.author.id,
          action: "raid.preset",
          details: [`Preset: \`${mode}\``],
          color: "#57F287",
        });
      }
      await safeMessageReply(message, {
        content: applied.ok
          ? `[OK] Preset JoinRaid \`${mode}\` applicato.`
          : "<:vegax:1443934876440068179> Impossibile applicare preset raid.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  }

  await safeMessageReply(message, {
    embeds: [antiNukeUsageEmbed()],
    allowedMentions: { repliedUser: false },
  });
}

async function handleAutoMod(message, args = []) {
  const sub = String(args[0] || "stats").toLowerCase();
  const cfg = getAutoModConfigSnapshot();
  const rules = getAutoModRulesSnapshot();

  if (sub === "heat" || sub === "panel") {
    const hs = cfg?.heatSystem || {};
    const at = cfg?.autoTimeouts || {};
    const panic = cfg?.panic || {};
    const lock = cfg?.autoLockdown || {};
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Heat System Panel")
      .setDescription(
        [
          "[1] Status:",
          `\u25b8 \`${rules?.status?.enabled ? "Enabled" : "Disabled"}\``,
          "",
          "[2] Spam Filters:",
          `\u25b8 \`${rules?.status?.antiSpamEnabled ? "Enabled" : "Disabled"}\``,
          "",
          "[3] Max Heat Percentage:",
          `\u25b8 \`${Number(hs.maxHeat || 100)}%\``,
          "",
          "[4] Heat Degradation:",
          `\u25b8 \`${Number(hs.decayPerSec || 0)}% per second\``,
          "",
          "[5] Strikes CAP:",
          `\u25b8 \`${Number(at.capStrike || 3)}\``,
          "",
          "[6] Webhook Coverage:",
          `\u25b8 \`${rules?.status?.monitorUnwhitelistedWebhooks ? "Enabled" : "Disabled"}\``,
          "",
          "[7] Auto Timeouts:",
          `\u25b8 [A] Status: \`${at.enabled ? "Enabled" : "Disabled"}\``,
          `\u25b8 [B] Regular Strike Duration: \`${toCompactDuration(at.regularStrikeDurationMs)}\``,
          `\u25b8 [C] CAP Strike Duration: \`${toCompactDuration(at.capStrikeDurationMs)}\``,
          `\u25b8 [D] Multiplier Status: \`${at.multiplierEnabled ? "Enabled" : "Disabled"}\``,
          `\u25b8 [E] Multiplier Percentage: \`${Number(at.multiplierPercent || 200)}%\``,
          "",
          "[8] Reset Heat On Timeout:",
          `\u25b8 \`${hs.resetOnPunishment ? "Enabled" : "Disabled"}\``,
          "",
          "[9] Heat Panic Mode:",
          `\u25b8 [A] Status: \`${panic.enabled ? "Enabled" : "Disabled"}\``,
          `\u25b8 [B] Trigger: \`${Number(panic.triggerCount || 3)} Raiders\``,
          `\u25b8 [C] Panic Duration: \`${toCompactDuration(panic.durationMs)}\``,
          "",
          "[10] Auto Server Lockdown:",
          `\u25b8 [A] Status: \`${lock.enabled ? "Enabled" : "Disabled"}\``,
          `\u25b8 [B] Mentions: \`${Number(lock.mentionTrigger || 50)}\``,
          `\u25b8 [C] Under: \`${toCompactDuration(lock.mentionWindowMs)}\``,
          "",
          "Advanced Settings:",
          "\u25b8 Heat System Filters: `+security automod filters`",
        ].join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "filters" || sub === "hfilters" || sub === "heatfilters") {
    const hf = cfg?.heatFilters || {};
    const t = rules?.textRules || {};
    const m = rules?.mentionRules || {};
    const a = rules?.attachmentRules || {};

    const page1 = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Heat System Filters Panel")
      .setDescription(
        [
          "[1] Normal Message Heat:",
          `\u25b8 [A] Status: \`${hf.regularMessage ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.regularMessage?.heat || 15)}% per message\``,
          "",
          "[2] Similar Message Repetition Heat:",
          `\u25b8 [A] Status: \`${hf.similarMessage ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.similarMessage?.heat || 22)}% per message\``,
          `\u25b8 [D] Similarity Ratio: \`${Number(t.similarMessage?.ratio || 0.8)}\``,
          "",
          "[3] Suspicion Heat:",
          `\u25b8 [A] Status: \`${hf.suspiciousAccount ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.suspiciousAccount?.heat || 7)}% per message\``,
          "",
          "[4] Advertisement Heat:",
          `\u25b8 [A] Status: \`${hf.inviteLinks ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.inviteLinks?.heat || 100)}% per message\``,
          "",
          "[5] NSFW Websites Heat:",
          `\u25b8 [A] Status: \`${hf.nsfwLinks ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.nsfwLinks?.heat || 100)}% per message\``,
          "",
          "Page 1/4",
        ].join("\n"),
      );

    const page2 = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Heat System Filters Panel")
      .setDescription(
        [
          "[6] Malicious Websites Heat:",
          `\u25b8 [A] Status: \`${hf.maliciousLinks ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.maliciousLinks?.heat || 100)}% per message\``,
          `\u25b8 [D] Anti-Scam: \`${t.maliciousLinks?.enabled ? "Enabled" : "Disabled"}\``,
          "",
          "[7] Emojis Heat:",
          `\u25b8 [A] Status: \`${hf.emojis ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.emojis?.heat || 9)}% per emoji\``,
          "",
          "[8] Message Characters Heat:",
          `\u25b8 [A] Status: \`${hf.characters ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] LC Heat: \`${Number(t.characters?.lowercaseHeat || 0.08)}% per lowercased character\``,
          `\u25b8 [D] UC Heat: \`${Number(t.characters?.uppercaseHeat || 0.12)}% per uppercased character\``,
          "",
          "[9] New Line Heat:",
          `\u25b8 [A] Status: \`${hf.newLines ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.newLines?.heat || 5)}% per newline\``,
          "",
          "Page 2/4",
        ].join("\n"),
      );

    const page3 = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Heat System Filters Panel")
      .setDescription(
        [
          "[10] Inactive Channel Heat:",
          "\u25b8 [A] Status: `Disabled`",
          "\u25b8 [B] Action: `Timeout`",
          "\u25b8 [C] Heat: `25% per message`",
          "\u25b8 [D] Trigger: `10 messages`",
          "",
          "[11] Mention Heat:",
          `\u25b8 [A] Status: \`${hf.mentions ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] @Everyone Heat: \`${Number(m.everyoneMentions?.heat || 100)}% per mention\``,
          `\u25b8 [D] @User Heat: \`${Number(m.userMentions?.heat || 15)}% per mention\``,
          `\u25b8 [E] @Role Heat: \`${Number(m.roleMentions?.heat || 20)}% per mention\``,
          `\u25b8 [F] Mention CAP: \`${Number(m.hourCap || 20)} under an hour\``,
          "",
          "[12] Attachments Heat:",
          `\u25b8 [A] Status: \`${hf.attachments ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Embeds Heat: \`${Number(a.embeds?.heat || 15)}% per embed\``,
          `\u25b8 [D] Images Heat: \`${Number(a.images?.heat || 20)}% per image\``,
          `\u25b8 [E] Files Heat: \`${Number(a.files?.heat || 15)}% per file\``,
          `\u25b8 [F] Links Heat: \`${Number(a.links?.heat || 10)}% per link\``,
          `\u25b8 [G] Stickers Heat: \`${Number(a.stickers?.heat || 15)}% per sticker\``,
          "",
          "Page 3/4",
        ].join("\n"),
      );

    const page4 = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Heat System Filters Panel")
      .setDescription(
        [
          "[13] Zalgo Heat:",
          `\u25b8 [A] Status: \`${hf.zalgo ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.zalgo?.heat || 1.5)}% per one zalgo character\``,
          "",
          "[14] Words Heat:",
          `\u25b8 [A] Status: \`${hf.wordBlacklist ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.wordBlacklist?.heat || 100)}% for every blacklisted word\``,
          `\u25b8 [D] Profane: \`${t.wordBlacklist?.useProfaneList ? "Enabled" : "Disabled"}\``,
          `\u25b8 [E] Vulgar: \`${t.wordBlacklist?.useVulgarList ? "Enabled" : "Disabled"}\``,
          `\u25b8 [F] Racist: \`${t.wordBlacklist?.useRacistList ? "Enabled" : "Disabled"}\``,
          "\u25b8 [G] Custom: `Dashboard`",
          "",
          "[15] Link Heat:",
          `\u25b8 [A] Status: \`${hf.linkBlacklist ? "Enabled" : "Disabled"}\``,
          "\u25b8 [B] Action: `Timeout`",
          `\u25b8 [C] Heat: \`${Number(t.linkBlacklist?.heat || 100)}% for every link\``,
          "\u25b8 [D] Custom: `Dashboard`",
          "",
          "Page 4/4",
        ].join("\n"),
      );

    const pages = [page1, page2, page3, page4];
    let pageIndex = 0;
    const nonce = `${message.id}:${Date.now()}`;
    const buttonIds = {
      first: `automod_filters:first:${nonce}`,
      prev: `automod_filters:prev:${nonce}`,
      next: `automod_filters:next:${nonce}`,
      last: `automod_filters:last:${nonce}`,
      close: `automod_filters:close:${nonce}`,
    };
    const allowedCustomIds = new Set(Object.values(buttonIds));

    const buildRow = (disabled = false) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonIds.first)
          .setLabel("<<")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || pageIndex === 0),
        new ButtonBuilder()
          .setCustomId(buttonIds.prev)
          .setLabel("<")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || pageIndex === 0),
        new ButtonBuilder()
          .setCustomId(buttonIds.next)
          .setLabel(">")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || pageIndex >= pages.length - 1),
        new ButtonBuilder()
          .setCustomId(buttonIds.last)
          .setLabel(">>")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || pageIndex >= pages.length - 1),
        new ButtonBuilder()
          .setCustomId(buttonIds.close)
          .setLabel("X")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      );

    const sent = await safeMessageReply(message, {
      embeds: [pages[pageIndex]],
      components: [buildRow(false)],
      allowedMentions: { repliedUser: false },
    });
    if (!sent || typeof sent.createMessageComponentCollector !== "function") {
      return;
    }

    const collector = sent.createMessageComponentCollector({
      time: 120_000,
      filter: (i) =>
        i.user?.id === message.author.id &&
        allowedCustomIds.has(String(i.customId || "")),
    });

    collector.on("collect", async (interaction) => {
      const customId = String(interaction.customId || "");
      if (customId === buttonIds.close) {
        await interaction
          .update({
            embeds: [pages[pageIndex]],
            components: [],
            allowedMentions: { repliedUser: false },
          })
          .catch(() => null);
        collector.stop("closed");
        return;
      }
      if (customId === buttonIds.first) pageIndex = 0;
      if (customId === buttonIds.prev) pageIndex = Math.max(0, pageIndex - 1);
      if (customId === buttonIds.next) pageIndex = Math.min(pages.length - 1, pageIndex + 1);
      if (customId === buttonIds.last) pageIndex = pages.length - 1;
      await interaction
        .update({
          embeds: [pages[pageIndex]],
          components: [buildRow(false)],
          allowedMentions: { repliedUser: false },
        })
        .catch(() => null);
    });

    collector.on("end", async (_, reason) => {
      if (reason === "closed") return;
      await sent
        .edit({
          embeds: [pages[pageIndex]],
          components: [buildRow(true)],
          allowedMentions: { repliedUser: false },
        })
        .catch(() => null);
    });
    return;
  }

  if (sub === "stats") {
    const days = Math.max(1, Math.min(30, Number(args[1] || 1)));
    const data = getAutoModDashboardData(message.guild.id, { days, limit: 5 });
    const antiNuke = getAntiNukeStatusSnapshot(message.guild.id);
    const raid = await getJoinRaidStatusSnapshot(message.guild.id);
    const actions = Object.entries(data.actions || {})
      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
      .map(([k, v]) => `\`${k}\`: **${v}**`);
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`AutoMod Stats (${days}d)`)
      .setDescription(
        [
          `Panic enabled: **${Number(data.panicEnabled || 0)}**`,
          `AntiNuke panic: **${antiNuke.panicActive ? "ON" : "OFF"}**`,
          `Join Raid: **${raid?.raidActive ? "ON" : "OFF"}**`,
          actions.length ? actions.join(" | ") : "Nessuna azione registrata.",
        ].join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "top") {
    const mode = String(args[1] || "rules").toLowerCase();
    const days = Math.max(1, Math.min(30, Number(args[2] || 7)));
    const limit = Math.max(1, Math.min(20, Number(args[3] || 10)));
    const data = getAutoModDashboardData(message.guild.id, { days, limit });
    let rows = [];
    let title = "";
    if (mode === "channels") {
      title = `AutoMod Top Channels (${days}d)`;
      rows = data.topChannels.map(
        ([id, count], i) => `${i + 1}. <#${id}> - **${count}**`,
      );
    } else if (mode === "users") {
      title = `AutoMod Top Users (${days}d)`;
      rows = data.topUsers.map(
        ([id, count], i) => `${i + 1}. <@${id}> - **${count}**`,
      );
    } else {
      title = `AutoMod Top Rules (${days}d)`;
      rows = data.topRules.map(
        ([key, count], i) => `${i + 1}. \`${key}\` - **${count}**`,
      );
    }
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(title)
      .setDescription(rows.length ? rows.join("\n") : "Nessun dato.");
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "tune") {
    const pathArg = String(args[1] || "").trim();
    if (!pathArg || pathArg === "show") {
      const cfg = getAutoModConfigSnapshot();
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("AutoMod Config Snapshot")
        .setDescription(
          "```json\n" +
            JSON.stringify(
              {
                thresholds: cfg.thresholds,
                panic: cfg.panic,
                shorteners: cfg.shorteners,
                profiles: cfg.profiles,
              },
              null,
              2,
            ).slice(0, 3800) +
            "\n```",
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const rawValue = args.slice(2).join(" ").trim();
    if (!rawValue) {
      await safeMessageReply(message, {
        embeds: [autoModUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const nextValue = parseScalar(rawValue);
    if (
      isDisableSystemOperation(pathArg, nextValue) &&
      !hasSystemDisableAccess(message.member, message.guild)
    ) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Solo Founder e Co Founder possono disattivare i sistemi di sicurezza.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const result = updateAutoModConfig(pathArg, nextValue);
    if (!result?.ok) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Aggiornamento fallito. Controlla path/value.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await sendSecurityAuditLog(message.guild, {
      actorId: message.author.id,
      action: "automod.tune",
      details: [`Path: \`${pathArg}\``, `Valore: \`${String(nextValue)}\``],
      color: "#57F287",
    });

    await safeMessageReply(message, {
      content: `<:success:1461731530333229226> AutoMod aggiornato: \`${pathArg}\` = \`${String(nextValue)}\``,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (sub === "preset") {
    const action = String(args[1] || "show").toLowerCase();
    if (action === "show") {
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("AutoMod Preset: safe")
        .setDescription(
          "```json\n" +
            JSON.stringify(AUTOMOD_PRESETS.safe, null, 2).slice(0, 3800) +
            "\n```",
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (action === "safe") {
      const applied = applyAutoModPresetConfig(AUTOMOD_PRESETS.safe);
      if (!applied?.ok) {
        await safeMessageReply(message, {
          content: `<:vegax:1443934876440068179> Preset non applicato (errore su \`${applied.failedPath}\`).`,
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await sendSecurityAuditLog(message.guild, {
        actorId: message.author.id,
        action: "automod.preset",
        details: ["Preset: `safe`"],
        color: "#57F287",
      });
      await safeMessageReply(message, {
        content:
          "<:success:1461731530333229226> Preset AutoMod `safe` applicato. Usa `+security automod tune show` per confermare i valori correnti.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await safeMessageReply(message, {
      content:
        "<:vegax:1443934876440068179> Preset non valido. Usa `+security automod preset show` o `+security automod preset safe`.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await safeMessageReply(message, {
    embeds: [autoModUsageEmbed()],
    allowedMentions: { repliedUser: false },
  });
}

async function handleSecurityProfiles(message, args = []) {
  const scope = String(args[0] || "status").toLowerCase();
  const action = String(args[1] || "list").toLowerCase();

  if (!hasProfilesManageAccess(message.member, message.guild)) {
    await safeMessageReply(message, {
      content:
        "<:vegax:1443934876440068179> Solo Founder, Co Founder o owner possono gestire i profili sicurezza.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const guildId = String(message.guild.id || "");
  const snapshot = getSecurityProfilesSnapshot(guildId);
  const trusted = Array.isArray(snapshot?.trustedAdmins)
    ? snapshot.trustedAdmins
    : [];
  const owners = Array.isArray(snapshot?.extraOwners) ? snapshot.extraOwners : [];

  if (scope === "status" || scope === "panel" || scope === "list") {
    const admins = getAdminsProfileSnapshot();
    const moderators = getModeratorsProfileSnapshot();
    const trustedRows = trusted.length
      ? trusted.map((id) => `<@${id}>`).join(", ")
      : "`No record found.`";
    const ownerRows = owners.length
      ? owners.map((id) => `<@${id}>`).join(", ")
      : "`No record found.`";
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Security Profiles")
      .setDescription(
        [
          "[10] Trusted Admins:",
          `\u25b8 Count: **${trusted.length}**`,
          `\u25b8 Users: ${trustedRows}`,
          "",
          "[11] Extra Owners:",
          `\u25b8 Count: **${owners.length}**`,
          `\u25b8 Users: ${ownerRows}`,
          "",
          "[12] Admins (HighStaff only):",
          `\u25b8 Role: ${admins?.roleId ? `<@&${admins.roleId}>` : "`Not configured`"}`,
          `\u25b8 Full Immunity: \`${admins?.fullImmunity ? "Enabled" : "Disabled"}\``,
          `\u25b8 AutoMod Immunity: \`${admins?.automodImmunity ? "Enabled" : "Disabled"}\``,
          `\u25b8 Report Immunity: \`${admins?.reportImmunity ? "Enabled" : "Disabled"}\``,
          `\u25b8 Lock Server Channels: \`${admins?.lockServerChannels ? "Enabled" : "Disabled"}\``,
          `\u25b8 Lock Staff Roles: \`${admins?.lockStaffRoles ? "Enabled" : "Disabled"}\``,
          `\u25b8 Lock Server Joins: \`${admins?.lockServerJoins ? "Enabled" : "Disabled"}\``,
          `\u25b8 Make Lockdown Updates: \`${admins?.makeLockdownUpdates ? "Enabled" : "Disabled"}\``,
          `\u25b8 Profanity Whitelist: \`${admins?.profanityWhitelist ? "Enabled" : "Disabled"}\``,
          `\u25b8 Link Whitelist: \`${admins?.linkWhitelist ? "Enabled" : "Disabled"}\``,
          `\u25b8 +verify Permission: \`${admins?.verifyCommand ? "Enabled" : "Disabled"}\``,
          "",
          "[13] Moderators (Staff only):",
          `\u25b8 Role: ${moderators?.roleId ? `<@&${moderators.roleId}>` : "`Not configured`"}`,
          `\u25b8 Full Immunity: \`${moderators?.fullImmunity ? "Enabled" : "Disabled"}\``,
          `\u25b8 AutoMod Immunity: \`${moderators?.automodImmunity ? "Enabled" : "Disabled"}\``,
          `\u25b8 Report Immunity: \`${moderators?.reportImmunity ? "Enabled" : "Disabled"}\``,
          `\u25b8 Lock Server Channels: \`${moderators?.lockServerChannels ? "Enabled" : "Disabled"}\``,
          `\u25b8 Lock Staff Roles: \`${moderators?.lockStaffRoles ? "Enabled" : "Disabled"}\``,
          `\u25b8 Lock Server Joins: \`${moderators?.lockServerJoins ? "Enabled" : "Disabled"}\``,
          `\u25b8 Make Lockdown Updates: \`${moderators?.makeLockdownUpdates ? "Enabled" : "Disabled"}\``,
          `\u25b8 Profanity Whitelist: \`${moderators?.profanityWhitelist ? "Enabled" : "Disabled"}\``,
          `\u25b8 Link Whitelist: \`${moderators?.linkWhitelist ? "Enabled" : "Disabled"}\``,
          `\u25b8 +verify Permission: \`${moderators?.verifyCommand ? "Enabled" : "Disabled"}\``,
          "",
          "Comandi:",
          "\u25b8 `+security profiles trusted add @utente`",
          "\u25b8 `+security profiles trusted remove @utente`",
          "\u25b8 `+security profiles owner add @utente`",
          "\u25b8 `+security profiles owner remove @utente`",
          "\u25b8 `+security profiles admins`",
          "\u25b8 `+security profiles moderators`",
        ].join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (scope === "admins" || scope === "moderators") {
    const isModerators = scope === "moderators";
    const profile = isModerators
      ? getModeratorsProfileSnapshot()
      : getAdminsProfileSnapshot();
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(
            isModerators
              ? "Moderators Profile (Staff)"
              : "Admins Profile (HighStaff)",
          )
          .setDescription(
            [
              `Role: ${profile?.roleId ? `<@&${profile.roleId}>` : "`Not configured`"}`,
              `Owner: \`${profile?.owner ? "Enabled" : "Disabled"}\``,
              `Full Immunity: \`${profile?.fullImmunity ? "Enabled" : "Disabled"}\``,
              `AutoMod Immunity: \`${profile?.automodImmunity ? "Enabled" : "Disabled"}\``,
              `Dashboard Access: \`${profile?.dashboardAccess ? "Enabled" : "Disabled"}\``,
              `Report Immunity: \`${profile?.reportImmunity ? "Enabled" : "Disabled"}\``,
              `Lock Server Channels: \`${profile?.lockServerChannels ? "Enabled" : "Disabled"}\``,
              `Lock Staff Roles: \`${profile?.lockStaffRoles ? "Enabled" : "Disabled"}\``,
              `Lock Server Joins: \`${profile?.lockServerJoins ? "Enabled" : "Disabled"}\``,
              `Make Lockdown Updates: \`${profile?.makeLockdownUpdates ? "Enabled" : "Disabled"}\``,
              `Kick/Ban Whitelist: \`${profile?.kickBanWhitelist ? "Enabled" : "Disabled"}\``,
              `Channel Creations Whitelist: \`${profile?.channelCreationsWhitelist ? "Enabled" : "Disabled"}\``,
              `Channel Deletions Whitelist: \`${profile?.channelDeletionsWhitelist ? "Enabled" : "Disabled"}\``,
              `Role Creations Whitelist: \`${profile?.roleCreationsWhitelist ? "Enabled" : "Disabled"}\``,
              `Role Deletions Whitelist: \`${profile?.roleDeletionsWhitelist ? "Enabled" : "Disabled"}\``,
              `Webhook Creations Whitelist: \`${profile?.webhookCreationsWhitelist ? "Enabled" : "Disabled"}\``,
              `Profanity Whitelist: \`${profile?.profanityWhitelist ? "Enabled" : "Disabled"}\``,
              `Link Whitelist: \`${profile?.linkWhitelist ? "Enabled" : "Disabled"}\``,
              `+verify Permission: \`${profile?.verifyCommand ? "Enabled" : "Disabled"}\``,
            ].join("\n"),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (!["trusted", "owner", "extraowner", "extraowners"].includes(scope)) {
    await safeMessageReply(message, {
      content:
        "<:vegax:1443934876440068179> Usa `+security profiles <status|trusted|owner>`.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const userId = parseUserId(args[2], message);
  if (!["add", "remove", "list"].includes(action)) {
    await safeMessageReply(message, {
      content:
        "<:vegax:1443934876440068179> Azioni valide: `add`, `remove`, `list`.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (action === "list") {
    const rows = scope === "trusted"
      ? trusted.map((id, i) => `${i + 1}. <@${id}> \`${id}\``)
      : owners.map((id, i) => `${i + 1}. <@${id}> \`${id}\``);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(scope === "trusted" ? "Trusted Admins" : "Extra Owners")
          .setDescription(rows.length ? rows.join("\n") : "Nessun utente configurato."),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (!userId) {
    await safeMessageReply(message, {
      content:
        "<:vegax:1443934876440068179> Specifica un utente valido (`@menzione` o `ID`).",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const isOwnerScope = scope !== "trusted";
  const result = action === "add"
    ? (isOwnerScope
      ? addExtraOwner(guildId, userId)
      : addTrustedAdmin(guildId, userId))
    : (isOwnerScope
      ? removeExtraOwner(guildId, userId)
      : removeTrustedAdmin(guildId, userId));

  if (!result?.ok) {
    await safeMessageReply(message, {
      content: "<:vegax:1443934876440068179> Operazione fallita.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await sendSecurityAuditLog(message.guild, {
    actorId: message.author.id,
    action: `profiles.${isOwnerScope ? "extra_owner" : "trusted_admin"}.${action}`,
    details: [`Target: <@${userId}>`, `Immune: ${isSecurityProfileImmune(guildId, userId) ? "yes" : "no"}`],
    color: action === "add" ? "#57F287" : "#FEE75C",
  });

  await safeMessageReply(message, {
    content: action === "add"
      ? `[OK] <@${userId}> aggiunto in **${isOwnerScope ? "Extra Owners" : "Trusted Admins"}**.`
      : `[OK] <@${userId}> rimosso da **${isOwnerScope ? "Extra Owners" : "Trusted Admins"}**.`,
    allowedMentions: { repliedUser: false },
  });
}

function canControlBackup(member, guild) {
  return hasPanicControlAccess(member, guild);
}

async function buildSecurityDrillEmbed(guild) {
  const me = guild?.members?.me || null;
  const roleAllowlist = new Set(
    (getAntiNukeStatusSnapshot(guild.id)?.config?.panicMode?.lockdown?.roleAllowlistIds || [])
      .map((x) => String(x)),
  );
  const lockTargetRoles = [String(guild.id), IDs.roles.Member, IDs.roles.Staff]
    .filter(Boolean)
    .map((x) => String(x));
  const dangerousRoles = guild.roles.cache
    .filter((role) => {
      if (!role || role.managed || role.id === guild.id) return false;
      if (roleAllowlist.has(String(role.id))) return false;
      if (me && role.position >= me.roles.highest.position) return false;
      return DRILL_DANGEROUS_PERMS.some((perm) => role.permissions?.has?.(perm));
    })
    .size;
  const lockableChannels = guild.channels.cache.filter(
    (channel) => Boolean(channel?.permissionOverwrites?.edit),
  ).size;

  return new EmbedBuilder()
    .setColor("#FEE75C")
    .setTitle("Security Drill")
    .setDescription(
      [
        "Simulazione completata senza modifiche reali.",
        "",
        `Ruoli target lockdown canali: ${lockTargetRoles.map((id) => `<@&${id}>`).join(", ")}`,
        `Ruoli pericolosi bloccabili: **${dangerousRoles}**`,
        `Canali lockabili: **${lockableChannels}**`,
        `Bot può gestire canali: **${me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels) ? "Sì" : "No"}**`,
        `Bot può gestire ruoli: **${me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles) ? "Sì" : "No"}**`,
      ].join("\n"),
    )
    .setFooter({ text: "Usa +security status per stato realtime." });
}

async function buildHealthEmbed(guild, client) {
  const sec = await getSecurityLockState(guild);
  const anti = getAntiNukeStatusSnapshot(guild?.id);
  const automod = getAutoModPanicSnapshot(guild?.id);
  const birthday = getBirthdayLoopStatus();
  const reminder = getChatReminderLoopStatus();
  const readyStateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const dbState = readyStateMap[mongoose?.connection?.readyState] || "unknown";
  const memMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
  const uptimeSec = Math.floor(process.uptime());
  const guildCount = Number(client?.guilds?.cache?.size || 0);

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("System Health")
    .setDescription(
      [
        `DB: **${dbState}**`,
        `Uptime: **${uptimeSec}s**`,
        `RAM RSS: **${memMb} MB**`,
        `Guild in cache: **${guildCount}**`,
        `Security lock join: **${sec.joinLockActive ? "ON" : "OFF"}**`,
        `Security lock comandi: **${sec.commandLockActive ? "ON" : "OFF"}**`,
        `Explain lock: **${sec.commandLockActive ? (sec.commandSources?.join(", ") || "N/A") : "none"}**`,
        `JoinRaid lockCommands: **${sec?.details?.joinRaidLockCommands ? "ON" : "OFF"}**`,
        `AntiNuke panic: **${anti.panicActive ? "ON" : "OFF"}**`,
        `AutoMod panic: **${automod.active ? "ON" : "OFF"}**`,
        `Birthday scheduler: **${birthday.active ? "ON" : "OFF"}** (running: ${birthday.tickRunning ? "yes" : "no"})`,
        `Reminder scheduler: **${reminder.active ? "ON" : "OFF"}** (timeouts: ${reminder.scheduledTimeouts})`,
      ].join("\n"),
    );
}

module.exports = {
  name: "security",
  subcommands: [
    "joingate",
    "raid",
    "automod",
    "panic",
    "antinuke",
  ],
  subcommandAliases: {
    joingate: "joingate",
    "join-gate": "joingate",
    jg: "joingate",
    joinraid: "raid",
    "join-raid": "raid",
    jr: "raid",
    raid: "raid",
    automod: "automod",
    am: "automod",
    panic: "panic",
    antinuke: "antinuke",
  },

  async execute(message, args = []) {
    if (!message?.guild || !message?.member) return;
    if (!hasStaffAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non hai i permessi.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sub = String(args[0] || "joingate").toLowerCase();
    if (sub === "joingate" || sub === "join-gate" || sub === "jg") {
      const action = String(args[1] || "status").toLowerCase();
      if (action === "status") {
        const cfg = getJoinGateConfigSnapshot();
        const minAgeDays = formatDaysSafe(cfg?.newAccounts?.minAgeDays, 3);
        const embed = new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("JoinGate Panel")
          .setDescription(
            [
              "[1] General:",
              `\u25b8 [A] Status: \`${cfg?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] DM Members: \`${cfg?.dmPunishedMembers ? "Enabled" : "Disabled"}\``,
              "",
              "[2] No Avatar Filter:",
              `\u25b8 [A] Status: \`${cfg?.noAvatar?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] Action: \`${formatActionLabel(cfg?.noAvatar?.action, "log")}\``,
              "",
              "[3] Account Age Filter:",
              `\u25b8 [A] Status: \`${cfg?.newAccounts?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] Action: \`${formatActionLabel(cfg?.newAccounts?.action, "kick")}\``,
              `\u25b8 [C] Minimum Age: \`${minAgeDays} days\``,
              `\u25b8 [D] Expose Minimum Age: \`${cfg?.newAccounts?.enabled ? "Enabled" : "Disabled"}\``,
              "",
              "[4] Bot Addition Filter:",
              `\u25b8 [A] Status: \`${cfg?.botAdditions?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] Action: \`${formatActionLabel(cfg?.botAdditions?.action, "kick")}\``,
              "",
              "[5] Advertising Names Filter:",
              `\u25b8 [A] Status: \`${cfg?.advertisingName?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] Action: \`${formatActionLabel(cfg?.advertisingName?.action, "kick")}\``,
              "",
              "[6] Unverified Bot Filter:",
              `\u25b8 [A] Status: \`${cfg?.unverifiedBotAdditions?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] Action: \`${formatActionLabel(cfg?.unverifiedBotAdditions?.action, "kick")}\``,
              "",
              "[7] Suspicious Account Filter:",
              `\u25b8 [A] Status: \`${cfg?.suspiciousAccount?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] Action: \`${formatActionLabel(cfg?.suspiciousAccount?.action, "log")}\``,
              "",
              "[8] Username Filter:",
              `\u25b8 [A] Status: \`${cfg?.usernameFilter?.enabled ? "Enabled" : "Disabled"}\``,
              `\u25b8 [B] Action: \`${formatActionLabel(cfg?.usernameFilter?.action, "kick")}\``,
              "\u25b8 [✅] Custom: `Dashboard`",
            ].join("\n"),
          );
        await safeMessageReply(message, {
          embeds: [embed],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (action === "set") {
        const pathExpr = String(args[2] || "").trim();
        const rawValue = String(args.slice(3).join(" ").trim());
        if (!pathExpr || !rawValue) {
          await safeMessageReply(message, {
            content:
              "<:vegax:1443934876440068179> Usa: `+security joingate set <path> <value>`",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const allowedPaths = new Set([
          "enabled",
          "dmPunishedMembers",
          "noAvatar.enabled",
          "noAvatar.action",
          "newAccounts.enabled",
          "newAccounts.action",
          "newAccounts.minAgeDays",
          "botAdditions.enabled",
          "botAdditions.action",
          "unverifiedBotAdditions.enabled",
          "unverifiedBotAdditions.action",
          "advertisingName.enabled",
          "advertisingName.action",
          "usernameFilter.enabled",
          "usernameFilter.postJoinEnabled",
          "usernameFilter.action",
          "suspiciousAccount.enabled",
          "suspiciousAccount.action",
        ]);
        if (!allowedPaths.has(pathExpr)) {
          await safeMessageReply(message, {
            content:
              "<:vegax:1443934876440068179> Path non valida per Join Gate.",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        if (pathExpr.endsWith(".action")) {
          const normalizedAction = rawValue.toLowerCase();
          if (!JOIN_GATE_VALID_ACTIONS.has(normalizedAction)) {
            await safeMessageReply(message, {
              content:
                "<:vegax:1443934876440068179> Action valida: `log`, `timeout`, `kick`, `ban`.",
              allowedMentions: { repliedUser: false },
            });
            return;
          }
        }
        const updated = updateJoinGateConfig(pathExpr, rawValue);
        if (!updated?.ok) {
          await safeMessageReply(message, {
            content:
              "<:vegax:1443934876440068179> Aggiornamento Join Gate fallito.",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        await sendSecurityAuditLog(message.guild, {
          actorId: message.author.id,
          action: "joingate.set",
          details: [`Path: \`${pathExpr}\``, `Value: \`${rawValue}\``],
          color: "#57F287",
        });
        await safeMessageReply(message, {
          content: `[OK] Join Gate aggiornato: \`${pathExpr}\` = \`${rawValue}\`.`,
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await safeMessageReply(message, {
        embeds: [usageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "joinraid" || sub === "join-raid" || sub === "jr") {
      await handleAntiNuke(message, ["raid", ...args.slice(1)]);
      return;
    }

    if (sub === "raid" || sub === "panic") {
      await handleAntiNuke(message, [sub, ...args.slice(1)]);
      return;
    }

    if (sub === "antinuke") {
      await handleAntiNuke(message, args.slice(1));
      return;
    }

    if (sub === "automod" || sub === "am") {
      await handleAutoMod(message, args.slice(1));
      return;
    }

    await safeMessageReply(message, {
      embeds: [usageEmbed()],
      allowedMentions: { repliedUser: false },
    });
  },
};
