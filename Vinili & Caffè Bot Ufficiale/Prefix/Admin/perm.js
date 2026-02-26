const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { parseDuration, formatDuration } = require("../../Utils/Moderation/moderation");
const { parseCommandTokenList, parseRevokeTokenList, grantTemporaryCommandPermissions, revokeTemporaryCommandPermissions, clearTemporaryCommandPermissionsForUser, listTemporaryCommandPermissionsForUser } = require("../../Utils/Moderation/temporaryCommandPermissions");

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Permessi")
    .setDescription(
      [
        "`+perms grant <@utente|id> <durata|permanent> <comando1,comando2,...>`",
        "`+perms revoke <@utente|id> <comando1,comando2,...>`",
        "`+perms list <@utente|id>`",
        "`+perms clear <@utente|id>`",
        "",
        "Durate: `30m`, `2h`, `3d` oppure `permanent` per permesso non temporaneo.",
        "Formato comando: `partnership`, `slash:partnership`, `prefix:level.add`",
      ].join("\n"),
    );
}

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || "").replace(/[<@!>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function formatRemaining(expiresAt) {
  const expires = new Date(expiresAt).getTime();
  const remaining = Math.max(0, expires - Date.now());
  const tenYearsMs = 10 * 365.25 * 24 * 60 * 60 * 1000;
  if (remaining >= tenYearsMs) return "Permanente";
  return formatDuration(remaining);
}

module.exports = {
  name: "perms",
  aliases: ["perm"],
  subcommands: ["grant", "revoke", "list", "clear"],
  subcommandAliases: {
    permgrant: "grant",
    permrevoke: "revoke",
    permlist: "list",
    permclear: "clear",
  },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});

    const sub = String(args[0] || "")
      .trim()
      .toLowerCase();

    const valid = new Set(["grant", "revoke", "list", "clear"]);

    if (!sub || !valid.has(sub)) {
      return safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
    }

    const target = await resolveTargetUser(message, args[1]);
    if (!target || target.bot) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Utente non valido. Usa un mention o ID valido.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "grant") {
      const durationRaw = String(args[2] || "").trim().toLowerCase();
      const isPermanent = ["permanent", "perm", "forever", "∞", "inf", "permanente"].includes(durationRaw);
      const durationMs = isPermanent ? null : parseDuration(args[2]);
      if (!isPermanent && !durationMs) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Durata non valida. Usa ad esempio `30m`, `2h`, `3d` oppure `permanent` per permesso non temporaneo.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const commandInput = args.slice(3).join(" ");
      const commandKeys = parseCommandTokenList(commandInput);
      if (!commandKeys.length) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Devi specificare almeno un comando.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const result = await grantTemporaryCommandPermissions({
        guildId: message.guild.id,
        userId: target.id,
        grantedBy: message.author.id,
        commandKeys,
        durationMs: durationMs || 0,
        permanent: isPermanent,
      });

      const expiresText = result.expiresAt
        ? (isPermanent ? "Permanente" : `<t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>`)
        : "N/A";

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle(isPermanent ? "Permessi assegnati (permanenti)" : "Permessi temporanei assegnati")
            .setDescription(
              [
                `Utente: ${target}`,
                isPermanent ? "Tipo: **Permanente**" : `Durata: **${formatDuration(durationMs)}**`,
                `Scadenza: ${expiresText}`,
                `Comandi: ${commandKeys.map((k) => `\`${k}\``).join(", ")}`,
              ].join("\n"),
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "revoke") {
      const commandInput = args.slice(2).join(" ");
      const commandKeys = parseRevokeTokenList(commandInput);
      if (!commandKeys.length) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Devi specificare almeno un comando da revocare.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const removed = await revokeTemporaryCommandPermissions({
        guildId: message.guild.id,
        userId: target.id,
        commandKeys,
      });

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Permessi temporanei revocati")
            .setDescription(`Revoche effettuate per ${target}: **${removed}**`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "clear") {
      const removed = await clearTemporaryCommandPermissionsForUser({
        guildId: message.guild.id,
        userId: target.id,
      });

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Permessi temporanei azzerati")
            .setDescription(`Permessi rimossi per ${target}: **${removed}**`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const rows = await listTemporaryCommandPermissionsForUser({
      guildId: message.guild.id,
      userId: target.id,
    });

    const lines = rows.length
      ? rows.map(
          (row) =>
            `. \`${row.commandKey}\` -> scade tra **${formatRemaining(row.expiresAt)}**`,
        )
      : ["Nessun permesso temporaneo attivo."];

    return safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(`Permessi temporanei di ${target.username}`)
          .setDescription(lines.join("\n")),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};