const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { parseDuration, formatDuration, } = require("../../Utils/Moderation/moderation");
const { grantTemporaryRole, revokeTemporaryRole, clearTemporaryRolesForUser, listTemporaryRolesForUser, } = require("../../Services/Community/temporaryRoleService");

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Ruoli Temporanei")
    .setDescription(
      [
        "`+temprole grant <@utente|id> <@ruolo|id> <durata>`",
        "`+temprole revoke <@utente|id> <@ruolo|id>`",
        "`+temprole list <@utente|id>`",
        "`+temprole clear <@utente|id>`",
        "",
        "Durate supportate: `30m`, `2h`, `3d`",
        "Nota: questo comando prova ad assegnare direttamente il ruolo, senza controllare i requisiti custom interni.",
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

async function resolveRole(message, raw) {
  const fromMention = message.mentions?.roles?.first();
  if (fromMention) return fromMention;
  const id = String(raw || "").replace(/[<@&>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return (
    message.guild.roles.cache.get(id) ||
    message.guild.roles.fetch(id).catch(() => null)
  );
}

function formatRemaining(expiresAt) {
  const expires = new Date(expiresAt).getTime();
  const remaining = Math.max(0, expires - Date.now());
  return formatDuration(remaining);
}

function mapGrantError(reason) {
  if (reason === "member_not_found")
    return "L'utente non è presente nel server.";
  if (reason === "role_not_found") return "Ruolo non trovato.";
  if (reason === "missing_manage_roles") return "Non ho `ManageRoles`.";
  if (reason === "role_above_bot")
    return "Il ruolo e sopra il mio ruolo più alto.";
  if (reason === "add_failed")
    return "Non riesco ad assegnare il ruolo (permessi/gerarchia).";
  if (reason === "invalid_duration") return "Durata non valida.";
  return "Operazione non riuscita.";
}

module.exports = {
  name: "temprole",
  aliases: [
    "trole",
    "temprolegrant",
    "temprolerevoke",
    "temprolelist",
    "temproleclear",
  ],
  subcommands: ["grant", "revoke", "list", "clear"],
  subcommandAliases: {
    temprolegrant: "grant",
    temprolerevoke: "revoke",
    temprolelist: "list",
    temproleclear: "clear",
  },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const sub = String(args[0] || "")
      .trim()
      .toLowerCase();

    if (!sub || !["grant", "revoke", "list", "clear"].includes(sub)) {
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
              "<:vegax:1443934876440068179> Utente non valido. Usa mention o ID.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "grant") {
      let roleArg = args[2];
      let durationArg = args[3];

      if (parseDuration(args[2]) && args[3]) {
        roleArg = args[3];
        durationArg = args[2];
      }

      const role = await resolveRole(message, roleArg);
      if (!role) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Ruolo non valido. Usa mention o ID.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const durationMs = parseDuration(durationArg);
      if (!durationMs) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Durata non valida. Esempi: `30m`, `2h`, `3d`.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const result = await grantTemporaryRole({
        guild: message.guild,
        userId: target.id,
        roleId: role.id,
        grantedBy: message.author.id,
        durationMs,
      });

      if (!result.ok) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                `<:vegax:1443934876440068179> ${mapGrantError(result.reason)}`,
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const expiresText = `<t:${Math.floor(new Date(result.expiresAt).getTime() / 1000)}:F>`;
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Ruolo temporaneo assegnato")
            .setDescription(
              [
                `Utente: ${target}`,
                `Ruolo: ${role}`,
                `Durata: **${formatDuration(durationMs)}**`,
                `Scadenza: ${expiresText}`,
                result.hadRoleBefore
                  ? "Nota: il ruolo era già presente, quindi alla scadenza non verrà rimosso."
                  : "Alla scadenza il ruolo verrà rimosso automaticamente.",
              ].join("\n"),
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "revoke") {
      const role = await resolveRole(message, args[2]);
      if (!role) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Ruolo non valido. Usa mention o ID.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      const result = await revokeTemporaryRole({
        guild: message.guild,
        userId: target.id,
        roleId: role.id,
      });

      if (!result.ok) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Revoca non riuscita.",
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Ruolo temporaneo revocato")
            .setDescription(
              [
                `Utente: ${target}`,
                `Ruolo: ${role}`,
                `Record rimosso: **${result.removedRecord ? "si" : "no"}**`,
                `Ruolo rimosso ora: **${result.removedRole ? "si" : "no"}**`,
              ].join("\n"),
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub === "clear") {
      const result = await clearTemporaryRolesForUser({
        guild: message.guild,
        userId: target.id,
      });

      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Ruoli temporanei azzerati")
            .setDescription(
              `Record rimossi per ${target}: **${Number(result?.removed || 0)}**`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const rows = await listTemporaryRolesForUser({
      guildId: message.guild.id,
      userId: target.id,
    });

    const lines = rows.length
      ? rows.map(
          (row) =>
            `- <@&${row.roleId}> -> scade tra **${formatRemaining(row.expiresAt)}**`,
        )
      : ["Nessun ruolo temporaneo attivo."];

    return safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle(`Ruoli temporanei di ${target.username}`)
          .setDescription(lines.join("\n")),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};
