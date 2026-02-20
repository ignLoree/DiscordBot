const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const { ANTINUKE_PRESETS, applyAntiNukePreset, getAntiNukeStatusSnapshot, stopAntiNukePanic, addMaintenanceAllowlistUser, removeMaintenanceAllowlistUser, listMaintenanceAllowlist, } = require("../../Services/Moderation/antiNukeService");
const { JOIN_RAID_PRESETS, applyJoinRaidPreset, getJoinRaidStatusSnapshot, } = require("../../Services/Moderation/joinRaidService");

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
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.HighStaff,
].filter(Boolean);

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
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) {
    return true;
  }
  return hasAnyRole(member, STAFF_ROLE_IDS);
}

function hasPanicControlAccess(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) {
    return true;
  }
  return hasAnyRole(member, PANIC_CONTROL_ROLE_IDS);
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
    .setTitle("AntiNuke Control")
    .setDescription(
      [
        "`+antinuke status`",
        "`+antinuke preset show`",
        "`+antinuke preset <safe|balanced|strict>`",
        "`+antinuke panic status`",
        "`+antinuke panic stop [reason]`",
        "`+antinuke maintenance list`",
        "`+antinuke maintenance add <userId|@user> [minutes]`",
        "`+antinuke maintenance remove <userId|@user>`",
        "`+antinuke raid status`",
        "`+antinuke raid preset show`",
        "`+antinuke raid preset <safe|balanced|strict>`",
      ].join("\n"),
    );
}

module.exports = {
  name: "antinuke",
  aliases: ["anuke", "nukeshield", "security"],

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    if (!hasStaffAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non hai i permessi.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sub = String(args[0] || "status").toLowerCase();

    if (sub === "status") {
      const snap = getAntiNukeStatusSnapshot(message.guild.id);
      const raid = await getJoinRaidStatusSnapshot(message.guild.id);
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("AntiNuke Status")
        .setDescription(
          [
            `Panic: **${snap.panicActive ? "ON" : "OFF"}**`,
            `Panic until: ${snap.panicActive ? toTs(snap.panicActiveUntil, "F") : "N/A"}`,
            `Maintenance users: **${snap.maintenanceEntries.length}**`,
            `Trackers active: **${Object.values(snap.trackerSizes).reduce((a, b) => a + Number(b || 0), 0)}**`,
            `Raid active: **${raid?.raidActive ? "ON" : "OFF"}**`,
            raid?.raidActive ? `Raid until: ${toTs(raid.raidUntil, "F")}` : null,
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
            "Disponibili: `safe`, `balanced`, `strict`\nUsa `+antinuke preset <nome>`.",
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
              "<:vegax:1443934876440068179> Solo High Staff/Admin possono fermare Panic Mode.",
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
            "<:vegax:1443934876440068179> Solo High Staff/Admin possono gestire maintenance.",
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
              "<:vegax:1443934876440068179> Usa: `+antinuke maintenance add <userId|@user> [minutes]`",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const added = addMaintenanceAllowlistUser(
          message.guild.id,
          userId,
          minutes * 60_000,
        );
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
              "<:vegax:1443934876440068179> Usa: `+antinuke maintenance remove <userId|@user>`",
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        const removed = removeMaintenanceAllowlistUser(message.guild.id, userId);
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
              "Preset raid disponibili: `safe`, `balanced`, `strict`.\nUsa `+antinuke raid preset <nome>`.",
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
      embeds: [usageEmbed()],
      allowedMentions: { repliedUser: false },
    });
  },
};
