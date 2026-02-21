const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  ANTINUKE_PRESETS,
  applyAntiNukePreset,
  getAntiNukeStatusSnapshot,
  stopAntiNukePanic,
  addMaintenanceAllowlistUser,
  removeMaintenanceAllowlistUser,
  listMaintenanceAllowlist,
} = require("../../Services/Moderation/antiNukeService");
const {
  JOIN_RAID_PRESETS,
  applyJoinRaidPreset,
  getJoinRaidStatusSnapshot,
} = require("../../Services/Moderation/joinRaidService");
const {
  getAutoModPanicSnapshot,
  getAutoModConfigSnapshot,
  getAutoModDashboardData,
  updateAutoModConfig,
} = require("../../Services/Moderation/automodService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService");
const {
  createSecuritySnapshot,
  listSecuritySnapshots,
  restoreSecuritySnapshot,
} = require("../../Services/Moderation/securitySnapshotService");
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

const SYSTEM_DISABLE_ROLE_IDS = [
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
      triggerCount: 4,
      triggerWindowMs: 480000,
      durationMs: 480000,
      raidWindowMs: 120000,
      raidUserThreshold: 4,
      raidYoungThreshold: 3,
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

const DRILL_DANGEROUS_PERMS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
];

function toTs(ms, style = "R") {
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return "N/A";
  return `<t:${Math.floor(n / 1000)}:${style}>`;
}

function asMin(ms) {
  return Math.max(1, Math.round(Number(ms || 0) / 60_000));
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
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  return hasAnyRole(member, SYSTEM_DISABLE_ROLE_IDS);
}

function parseScalar(raw) {
  const value = String(raw || "").trim();
  if (!value.length) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function isDisableSystemOperation(pathArg, nextValue) {
  if (nextValue !== false) return false;
  const path = String(pathArg || "").trim().toLowerCase();
  if (!path) return false;
  return path === "enabled" || path.endsWith(".enabled");
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
        "`+security status`",
        "`+security health`",
        "`+security drill`",
        "`+security backup <create|list|restore>`",
        "`+security joingate status`",
        "`+security antinuke <status|preset|panic|maintenance|raid>`",
        "`+security automod <stats|top|preset|tune>`",
        "`+security raid ...`",
        "`+security panic ...`",
        "`+security maintenance ...`",
        "`+security preset ...`",
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
        "`+security antinuke preset show`",
        "`+security antinuke preset <safe|balanced|strict>`",
        "`+security antinuke panic status`",
        "`+security antinuke panic stop [reason]`",
        "`+security antinuke maintenance list`",
        "`+security antinuke maintenance add <userId|@user> [minutes]`",
        "`+security antinuke maintenance remove <userId|@user>`",
        "`+security antinuke raid status`",
        "`+security antinuke raid preset <safe|balanced|strict>`",
      ].join("\n"),
    );
}

function autoModUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Security AutoMod")
    .setDescription(
      [
        "`+security automod stats [days]`",
        "`+security automod top <rules|channels|users> [days] [limit]`",
        "`+security automod preset show`",
        "`+security automod preset safe`",
        "`+security automod tune show`",
        "`+security automod tune <path> <value>`",
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

async function buildSecurityStatusEmbed(guild) {
  const guildId = String(guild?.id || "");
  const orchestrated = guild ? await getSecurityLockState(guild) : null;
  const antiNuke = getAntiNukeStatusSnapshot(guildId);
  const raid = await getJoinRaidStatusSnapshot(guildId);
  const automodPanic = getAutoModPanicSnapshot(guildId);
  const automodCfg = getAutoModConfigSnapshot();
  const panicThreshold = Number(automodCfg?.panic?.triggerCount || 0);
  const panicWindowMin = Math.round(
    Number(automodCfg?.panic?.triggerWindowMs || 0) / 60_000,
  );

  return new EmbedBuilder()
    .setColor(
      antiNuke?.panicActive || automodPanic?.active || raid?.raidActive
        ? "#ED4245"
        : "#57F287",
    )
    .setTitle("Security Center")
    .setDescription(
      [
        "**Join Gate**",
        "Regole attive sugli ingressi: anti-bot, filtri nome, account sospetti.",
        "",
        "**Join Raid**",
        `Stato: **${raid?.raidActive ? "ATTIVO" : "IDLE"}**`,
        `Azione: **${raid?.config?.triggerAction || "N/A"}**`,
        `Trigger: **${raid?.uniqueFlaggedRecent || 0}/${raid?.config?.triggerCount || 0}**`,
        raid?.raidActive ? `Fine: ${toTs(raid.raidUntil, "F")}` : null,
        "",
        "**AntiNuke**",
        `Panic: **${antiNuke?.panicActive ? "ATTIVO" : "IDLE"}**`,
        antiNuke?.panicActive
          ? `Fine panic: ${toTs(antiNuke.panicActiveUntil, "F")}`
          : null,
        `Lock comandi mod: **${antiNuke?.config?.panicMode?.lockdown?.lockModerationCommands ? "ON" : "OFF"}**`,
        `Utenti maintenance: **${antiNuke?.maintenanceEntries?.length || 0}**`,
        "",
        "**AutoMod**",
        `Panic: **${automodPanic?.active ? "ATTIVO" : "IDLE"}**`,
        automodPanic?.active
          ? `Fine panic: ${toTs(automodPanic.activeUntil, "F")}`
          : null,
        `Soglia trigger: **${panicThreshold}** in **${panicWindowMin} min**`,
        `Account tracciati: **${automodPanic?.trackedAccounts || 0}**`,
        "",
        "**Lockdown Orchestrato**",
        `Blocca join: **${orchestrated?.joinLockActive ? "ON" : "OFF"}**`,
        `Blocca comandi: **${orchestrated?.commandLockActive ? "ON" : "OFF"}**`,
        orchestrated?.sources?.length
          ? `Sorgenti attive: ${orchestrated.sources.join(", ")}`
          : "Sorgenti attive: nessuna",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({ text: "Sistema di sicurezza collegato" })
    .setTimestamp();
}

async function handleAntiNuke(message, args = []) {
  const sub = String(args[0] || "status").toLowerCase();

  if (sub === "status") {
    const snap = getAntiNukeStatusSnapshot(message.guild.id);
    const raid = await getJoinRaidStatusSnapshot(message.guild.id);
    const automodPanic = getAutoModPanicSnapshot(message.guild.id);
    const security = await getSecurityLockState(message.guild);
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("AntiNuke Status")
      .setDescription(
        [
          `Panic: **${snap.panicActive ? "ON" : "OFF"}**`,
          `Panic until: ${snap.panicActive ? toTs(snap.panicActiveUntil, "F") : "N/A"}`,
          `AutoMod panic: **${automodPanic.active ? "ON" : "OFF"}**`,
          automodPanic.active ? `AutoMod until: ${toTs(automodPanic.activeUntil, "F")}` : null,
          `Maintenance users: **${snap.maintenanceEntries.length}**`,
          `Trackers active: **${Object.values(snap.trackerSizes).reduce((a, b) => a + Number(b || 0), 0)}**`,
          `Raid active: **${raid?.raidActive ? "ON" : "OFF"}**`,
          raid?.raidActive ? `Raid until: ${toTs(raid.raidUntil, "F")}` : null,
          `Join lock: **${security.joinLockActive ? "ON" : "OFF"}**`,
          `Command lock: **${security.commandLockActive ? "ON" : "OFF"}**`,
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
      const embed = new EmbedBuilder()
        .setColor(snap.panicActive ? "#ED4245" : "#57F287")
        .setTitle("AntiNuke Panic Status")
        .setDescription(
          [
            `State: **${snap.panicActive ? "ACTIVE" : "IDLE"}**`,
            `Active until: ${snap.panicActive ? toTs(snap.panicActiveUntil, "F") : "N/A"}`,
            `Remaining: ${snap.panicActive ? `${asMin(snap.panicRemainingMs)} min` : "0 min"}`,
            `Lock moderation cmds: **${snap.config.panicMode.lockdown.lockModerationCommands ? "ON" : "OFF"}**`,
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
      const embed = new EmbedBuilder()
        .setColor(raid.raidActive ? "#ED4245" : "#57F287")
        .setTitle("Join Raid Status")
        .setDescription(
          [
            `State: **${raid.raidActive ? "ACTIVE" : "IDLE"}**`,
            `Action: **${raid.config.triggerAction}**`,
            `Trigger: **${raid.uniqueFlaggedRecent}/${raid.config.triggerCount}**`,
            `Flagged events: **${raid.flaggedRecent}**`,
            `Window: **${Math.round(raid.config.triggerWindowMs / 60_000)} min**`,
            `Duration: **${Math.round(raid.config.raidDurationMs / 60_000)} min**`,
            raid.raidActive ? `Until: ${toTs(raid.raidUntil, "F")}` : null,
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
          action: "joinraid.preset",
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
        `AntiNuke panic: **${anti.panicActive ? "ON" : "OFF"}**`,
        `AutoMod panic: **${automod.active ? "ON" : "OFF"}**`,
        `Birthday scheduler: **${birthday.active ? "ON" : "OFF"}** (running: ${birthday.tickRunning ? "yes" : "no"})`,
        `Reminder scheduler: **${reminder.active ? "ON" : "OFF"}** (timeouts: ${reminder.scheduledTimeouts})`,
      ].join("\n"),
    );
}

async function handleSecurityBackup(message, args = []) {
  const action = String(args[0] || "create").toLowerCase();
  if (!canControlBackup(message.member, message.guild)) {
    await safeMessageReply(message, {
      content:
        "<:vegax:1443934876440068179> Solo Founder e Co Founder possono gestire i backup sicurezza.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (action === "create") {
    const reason = String(args.slice(1).join(" ").trim() || "manual backup");
    const created = createSecuritySnapshot({
      guildId: message.guild.id,
      actorId: message.author.id,
      reason,
    });
    if (!created?.ok) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Backup non creato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await sendSecurityAuditLog(message.guild, {
      actorId: message.author.id,
      action: "backup.create",
      details: [
        `Snapshot: \`${created.snapshot.id}\``,
        `Motivo: ${reason}`,
      ],
      color: "#57F287",
    });
    await safeMessageReply(message, {
      content: `<:success:1461731530333229226> Backup creato: \`${created.snapshot.id}\`.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (action === "list") {
    const rows = listSecuritySnapshots(8);
    const text = rows.length
      ? rows
          .map(
            (s, i) =>
              `${i + 1}. \`${s.id}\` • ${toTs(s.createdAt, "F")} • ${s.reason || "-"}`,
          )
          .join("\n")
      : "Nessun backup disponibile.";
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("Security Backup List")
          .setDescription(text),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (action === "restore") {
    const idOrLast = String(args[1] || "last").trim().toLowerCase();
    const restored = restoreSecuritySnapshot(idOrLast);
    if (!restored?.ok) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Restore fallito: \`${restored?.reason || "unknown"}\`.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await sendSecurityAuditLog(message.guild, {
      actorId: message.author.id,
      action: "backup.restore",
      details: [
        `Snapshot: \`${restored.snapshot.id}\``,
        `Motivo originario: ${restored.snapshot.reason || "-"}`,
      ],
      color: "#FEE75C",
    });
    await safeMessageReply(message, {
      content: `<:success:1461731530333229226> Restore completato da \`${restored.snapshot.id}\`.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await safeMessageReply(message, {
    content:
      "<:vegax:1443934876440068179> Usa `+security backup <create|list|restore>`.",
    allowedMentions: { repliedUser: false },
  });
}

module.exports = {
  name: "security",
  aliases: ["sec", "guard", "shield"],
  subcommands: [
    "status",
    "health",
    "drill",
    "backup",
    "joingate",
    "raid",
    "panic",
    "maintenance",
    "preset",
    "antinuke",
    "automod",
    "help",
  ],
  subcommandAliases: {
    status: "status",
    health: "health",
    drill: "drill",
    backup: "backup",
    joingate: "joingate",
    "join-gate": "joingate",
    jg: "joingate",
    raid: "raid",
    panic: "panic",
    maintenance: "maintenance",
    preset: "preset",
    antinuke: "antinuke",
    automod: "automod",
    help: "help",
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

    const sub = String(args[0] || "status").toLowerCase();
    if (sub === "status") {
      const embed = await buildSecurityStatusEmbed(message.guild);
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "health") {
      const embed = await buildHealthEmbed(message.guild, message.client);
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "drill") {
      const embed = await buildSecurityDrillEmbed(message.guild);
      await sendSecurityAuditLog(message.guild, {
        actorId: message.author.id,
        action: "security.drill",
        details: ["Simulazione lockdown eseguita senza modifiche."],
        color: "#FEE75C",
      });
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "backup") {
      await handleSecurityBackup(message, args.slice(1));
      return;
    }

    if (sub === "joingate" || sub === "join-gate" || sub === "jg") {
      const action = String(args[1] || "status").toLowerCase();
      if (action !== "status") {
        await safeMessageReply(message, {
          embeds: [usageEmbed()],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Join Gate Status")
        .setDescription(
          [
            "Stato: **ATTIVO**",
            "Protezione: bot non verificati, account giovani/sospetti, filtri nome.",
            "Integrazione: i segnali Join Gate alimentano Join Raid, AntiNuke e AutoMod panic.",
          ].join("\n"),
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "raid" || sub === "panic" || sub === "maintenance" || sub === "preset") {
      await handleAntiNuke(message, [sub, ...args.slice(1)]);
      return;
    }

    if (sub === "antinuke") {
      await handleAntiNuke(message, args.slice(1));
      return;
    }

    if (sub === "automod") {
      await handleAutoMod(message, args.slice(1));
      return;
    }

    if (sub === "help") {
      await safeMessageReply(message, {
        embeds: [usageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await safeMessageReply(message, {
      embeds: [usageEmbed()],
      allowedMentions: { repliedUser: false },
    });
  },
};




