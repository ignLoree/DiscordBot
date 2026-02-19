const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const IDs = require("../../Utils/Config/ids");
const {
  getAutoModDashboardData,
  getAutoModConfigSnapshot,
  updateAutoModConfig,
} = require("../../Services/Moderation/automodService");

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

function hasStaffAccess(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator))
    return true;
  return STAFF_ROLE_IDS.some((id) => member.roles?.cache?.has?.(id));
}

function parseScalar(raw) {
  const value = String(raw || "").trim();
  if (!value.length) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function usageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("AutoMod Control")
    .setDescription(
      [
        "`+automod stats [days]`",
        "`+automod top <rules|channels|users> [days] [limit]`",
        "`+automod preset show`",
        "`+automod preset safe`",
        "`+automod tune show`",
        "`+automod tune <path> <value>`",
        "",
        "Examples:",
        "`+automod tune thresholds.warn 30`",
        "`+automod tune thresholds.delete 55`",
        "`+automod tune profiles.media.attachmentsEnabled true`",
        "`+automod tune profiles.ticket.exempt false`",
      ].join("\n"),
    );
}

function applyPresetConfig(preset) {
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

module.exports = {
  name: "automod",
  aliases: ["amod", "modshield"],

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    if (!hasStaffAccess(message.member, message.guild)) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non hai i permessi.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sub = String(args[0] || "stats").toLowerCase();

    if (sub === "stats") {
      const days = Math.max(1, Math.min(30, Number(args[1] || 1)));
      const data = getAutoModDashboardData(message.guild.id, { days, limit: 5 });
      const actions = Object.entries(data.actions || {})
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
        .map(([k, v]) => `\`${k}\`: **${v}**`);
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`AutoMod Stats (${days}d)`)
        .setDescription(
          [
            `Panic enabled: **${Number(data.panicEnabled || 0)}**`,
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
          embeds: [usageEmbed()],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const nextValue = parseScalar(rawValue);
      const result = updateAutoModConfig(pathArg, nextValue);
      if (!result?.ok) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Aggiornamento fallito. Controlla path/value.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await safeMessageReply(message, {
        content: `✅ AutoMod aggiornato: \`${pathArg}\` = \`${String(nextValue)}\``,
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
        const applied = applyPresetConfig(AUTOMOD_PRESETS.safe);
        if (!applied?.ok) {
          await safeMessageReply(message, {
            content: `<:vegax:1443934876440068179> Preset non applicato (errore su \`${applied.failedPath}\`).`,
            allowedMentions: { repliedUser: false },
          });
          return;
        }
        await safeMessageReply(message, {
          content:
            "✅ Preset AutoMod `safe` applicato. Usa `+automod tune show` per confermare i valori correnti.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Preset non valido. Usa `+automod preset show` o `+automod preset safe`.",
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
