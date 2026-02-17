const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  ExpUser,
  ActivityUser,
} = require("../../Schemas/Community/communitySchemas");
const {
  getLevelInfo,
  getTotalExpForLevel,
  recordLevelHistory,
  setLevelChannelLocked,
  setRoleIgnored,
  getGuildExpSettings,
  setTemporaryEventMultiplier,
  syncLevelRolesForMember,
} = require("../../Services/Community/expService");

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || "").replace(/[<@!>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function asInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function fmtDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("it-IT", { hour12: false });
}

module.exports = {
  name: "level",
  aliases: [
    "levelset",
    "leveladdexp",
    "levelremoveexp",
    "levelreset",
    "levellock",
    "levelunlock",
    "levelmultiplier",
    "levelignore",
    "levelunignore",
    "levelconfig",
  ],
  subcommandAliases: {
    levelset: "set",
    leveladdexp: "add",
    levelremoveexp: "remove",
    levelreset: "reset",
    levellock: "lock",
    levelunlock: "unlock",
    levelmultiplier: "multiplier",
    levelignore: "ignore",
    levelunignore: "unignore",
    levelconfig: "config",
  },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const sub = String(args[0] || "").toLowerCase();
    const guildId = message.guild?.id;
    if (!guildId) return;

    if (!sub) {
      const usage = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Comando level")
        .setDescription(
          [
            "`+level set <@utente|id> <exp|level> <valore>`",
            "`+level add <@utente|id> <exp>`",
            "`+level remove <@utente|id> <exp>`",
            "`+level reset <@utente|id>`",
            "`+level lock <#canale|id>`",
            "`+level unlock <#canale|id>`",
            "`+level multiplier <valore> [minuti]`",
            "`+level ignore <@ruolo|id>`",
            "`+level unignore <@ruolo|id>`",
            "`+level config`",
          ].join("\n"),
        );
      await safeMessageReply(message, {
        embeds: [usage],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "config") {
      const settings = await getGuildExpSettings(guildId);
      const lockList = settings.lockedChannelIds.length
        ? settings.lockedChannelIds.map((id) => `<#${id}>`).join(", ")
        : "Nessuno";
      const ignoreList = settings.ignoredRoleIds.length
        ? settings.ignoredRoleIds.map((id) => `<@&${id}>`).join(", ")
        : "Nessuno";
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Configurazione Level")
        .setDescription(
          [
            `- Moltiplicatore base: **${settings.baseMultiplier}x**`,
            `- Evento attivo: **${settings.eventMultiplier}x**`,
            `- Scadenza evento: **${settings.eventExpiresAt ? fmtDate(settings.eventExpiresAt) : "Nessuna"}**`,
            `- Moltiplicatore effettivo: **${settings.effectiveMultiplier}x**`,
            `- Canali lock EXP: ${lockList}`,
            `- Ruoli ignorati EXP: ${ignoreList}`,
          ].join("\n"),
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "lock" || sub === "unlock") {
      const raw = String(args[1] || "");
      const channelId = raw.replace(/[<#>]/g, "");
      if (!/^\d{16,20}$/.test(channelId)) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+level lock <#canale|id>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const locked = sub === "lock";
      const next = await setLevelChannelLocked(guildId, channelId, locked);
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          `${locked ? "Canale bloccato" : "Canale sbloccato"} per EXP: <#${channelId}>. Totale canali lock: **${next.length}**`,
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "ignore" || sub === "unignore") {
      const role =
        message.mentions?.roles?.first() ||
        message.guild.roles.cache.get(
          String(args[1] || "").replace(/[<@&>]/g, ""),
        ) ||
        null;
      if (!role) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+level ignore <@ruolo|id>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const ignored = sub === "ignore";
      const next = await setRoleIgnored(guildId, role.id, ignored);
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          `${ignored ? "Ruolo ignorato" : "Ruolo riabilitato"} per EXP: ${role}. Totale ruoli ignorati: **${next.length}**`,
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "multiplier") {
      const value = Number(args[1]);
      const minutes = asInt(args[2] || 60);
      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        !Number.isFinite(minutes) ||
        minutes <= 0
      ) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+level multiplier <valore> [minuti]`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const result = await setTemporaryEventMultiplier(
        guildId,
        value,
        minutes * 60 * 1000,
      );
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          `Evento EXP impostato a **${result.multiplier}x** fino al **${fmtDate(result.expiresAt)}**.`,
        );
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (sub === "set") {
      const mode = String(args[2] || "").toLowerCase();
      const value = asInt(args[3]);
      if (
        !["exp", "level"].includes(mode) ||
        !Number.isFinite(value) ||
        value < 0
      ) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+level set <@utente|id> <exp|level> <valore>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      afterExp = mode === "exp" ? value : getTotalExpForLevel(value);
    } else if (sub === "add") {
      const delta = asInt(args[2]);
      if (!Number.isFinite(delta) || delta <= 0) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+level add <@utente|id> <exp>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      afterExp = beforeExp + delta;
    } else if (sub === "remove") {
      const delta = asInt(args[2]);
      if (!Number.isFinite(delta) || delta <= 0) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+level remove <@utente|id> <exp>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      afterExp = Math.max(0, beforeExp - delta);
    } else if (sub === "reset") {
      afterExp = 0;
    } else {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Subcomando non valido.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    doc.totalExp = Math.max(0, Math.floor(afterExp));
    doc.level = getLevelInfo(doc.totalExp).level;
    await doc.save();
    await syncLevelRolesForMember(message.guild, target.id, doc.level);
    await recordLevelHistory({
      guildId,
      userId: target.id,
      actorId: message.author.id,
      action: `staff_${sub}`,
      beforeExp,
      afterExp: doc.totalExp,
      note: `Comando +level ${sub}`,
    });

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Aggiornamento Level")
      .setDescription(
        [
          `- Utente: ${target}`,
          `- Azione: **${sub}**`,
          `- Livello: **${beforeLevel} -> ${doc.level}**`,
          `- EXP: **${beforeExp} -> ${doc.totalExp}**`,
        ].join("\n"),
      );
    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};
