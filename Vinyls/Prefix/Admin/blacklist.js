const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const {
  normalizeGuildId,
  addPartnershipBlacklistGuild,
  removePartnershipBlacklistGuild,
  listPartnershipBlacklistGuilds,
} = require("../../Services/Partner/partnershipBlacklistService");

module.exports = {
  name: "blacklist",
  category: "admin",
  description:
    "Blacklist server Discord (guild ID) con cui non si possono fare partnership.",
  usage:
    "`+blacklist add <guildId> [nota]` — aggiungi\n`+blacklist remove <guildId>` — rimuovi\n`+blacklist list` — elenco",
  examples: [
    "+blacklist add 987654321098765432",
    "+blacklist add 987654321098765432 server tossico",
    "+blacklist remove 987654321098765432",
    "+blacklist list",
  ],
  async execute(message, args) {
    const sub = String(args[0] || "").toLowerCase();
    const rest = args.slice(1);
    if (!sub || !["add", "remove", "list"].includes(sub)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Partnership blacklist (server)")
            .setDescription(
              "**Uso:**\n" +
                "`+blacklist add <guildId> [nota]` — nessuna partnership verso quel server\n" +
                "`+blacklist remove <guildId>`\n" +
                "`+blacklist list`\n\n" +
                "Il **guildId** è l’ID del server da bloccare (non l’invite).",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
    if (sub === "list") {
      const rows = await listPartnershipBlacklistGuilds(40);
      if (!rows.length) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#57f287")
              .setDescription("Nessun server in blacklist partnership."),
          ],
          allowedMentions: { repliedUser: false },
        });
      }
      const lines = rows.map(
        (r) =>
          `\`${r.guildId}\`${r.note ? ` — ${String(r.note).slice(0, 80)}` : ""}`,
      );
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Server in blacklist partnership")
            .setDescription(lines.join("\n").slice(0, 3900)),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
    const rawId = rest[0];
    const gid = normalizeGuildId(rawId);
    if (!gid) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Fornisci un **guild ID** valido (17–20 cifre).",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
    if (sub === "add") {
      const note = rest.slice(1).join(" ").trim();
      const r = await addPartnershipBlacklistGuild(
        gid,
        message.author.id,
        note,
      );
      if (!r.ok) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                `<:vegax:1443934876440068179> Errore: ${r.reason || "sconosciuto"}`,
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#57f287")
            .setDescription(
              `<:success:1461731530333229226> Server \`${gid}\` aggiunto alla blacklist partnership.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
    if (sub === "remove") {
      const r = await removePartnershipBlacklistGuild(gid);
      if (!r.deleted) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#F59E0B")
              .setDescription(
                `Nessuna entry per \`${gid}\` (già assente o ID errato).`,
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
      }
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#57f287")
            .setDescription(
              `<:success:1461731530333229226> Server \`${gid}\` rimosso dalla blacklist.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }
  },
};