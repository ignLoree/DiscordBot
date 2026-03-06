const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { parseDuration, buildGiveawayEmbed, buildEnterButton, createGiveaway, setGiveawayMessageId, rerollGiveawayByMessageId } = require("../../Services/Giveaway/giveawayService");
const EPHEMERAL_FLAG = 1 << 6;

function parseMessageIdFromOption(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{17,21}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/discord\.com\/channels\/\d{17,21}\/\d{17,21}\/(\d{17,21})/);
  return match ? match[1] : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Crea o gestisci un giveaway.")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Avvia un nuovo giveaway")
        .addStringOption((o) =>
          o
            .setName("premio")
            .setDescription("Cosa si vince (es. x1 Deco 4,99-5,99€)")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("durata")
            .setDescription("Durata: es. 1h, 24h, 7d")
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("vincitori")
            .setDescription("Numero di vincitori (default 1)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20),
        )
        .addChannelOption((o) =>
          o
            .setName("canale")
            .setDescription("Canale dove inviare il giveaway (default: questo)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Estrai un nuovo vincitore per un giveaway già terminato")
        .addStringOption((o) =>
          o
            .setName("messaggio")
            .setDescription("ID del messaggio del giveaway o link al messaggio")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "reroll") {
      await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});
      const raw = interaction.options.getString("messaggio");
      const messageId = parseMessageIdFromOption(raw);
      if (!messageId) {
        return safeEditReply(interaction, {
          content: "<a:VC_Alert:1448670089670037675> Inserisci un ID messaggio valido o il link al messaggio del giveaway.",
          flags: EPHEMERAL_FLAG,
        });
      }
      const result = await rerollGiveawayByMessageId(messageId, interaction.client);
      if (result.ok) {
        return safeEditReply(interaction, {
          content: `<a:VC_Events:1448688007438667796> Re-roll effettuato! Nuovo vincitore: <@${result.newWinnerId}>. Il messaggio è stato aggiornato nel canale.`,
          flags: EPHEMERAL_FLAG,
        });
      }
      return safeEditReply(interaction, {
        content: `<a:VC_Alert:1448670089670037675> ${result.error || "Errore durante il re-roll."}`,
        flags: EPHEMERAL_FLAG,
      });
    }
    if (subcommand !== "start") return;

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    const prize = interaction.options.getString("premio")?.trim() || "";
    const durationStr = interaction.options.getString("durata")?.trim() || "";
    const winnerCount = interaction.options.getInteger("vincitori") ?? 1;
    const channelOption = interaction.options.getChannel("canale");

    if (!prize) {
      return safeEditReply(interaction, {
        content: "<a:VC_Alert:1448670089670037675> Inserisci un premio valido.",
        flags: EPHEMERAL_FLAG,
      });
    }

    const durationMs = parseDuration(durationStr);
    if (!durationMs || durationMs < 60 * 1000) {
      return safeEditReply(interaction, {
        content: "<a:VC_Alert:1448670089670037675> Durata non valida. Usa ad es. `1h`, `24h`, `7d` (minimo 1m).",
        flags: EPHEMERAL_FLAG,
      });
    }

    const channel = channelOption || interaction.channel;
    if (!channel?.isTextBased?.()) {
      return safeEditReply(interaction, {
        content: "<a:VC_Alert:1448670089670037675> Canale non valido.",
        flags: EPHEMERAL_FLAG,
      });
    }

    const guildId = interaction.guild?.id;
    const hostId = interaction.user?.id;
    const hostTag = interaction.user?.tag || "";

    try {
      const giveaway = await createGiveaway({ guildId, channelId: channel.id, hostId, hostTag, prize, durationMs, winnerCount });

      const embed = buildGiveawayEmbed(giveaway);
      const row = buildEnterButton(giveaway._id.toString());
      const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
      if (!msg) {
        return safeEditReply(interaction, {
          content: "<a:VC_Alert:1448670089670037675> Impossibile inviare il messaggio nel canale.",
          flags: EPHEMERAL_FLAG,
        });
      }

      await setGiveawayMessageId(giveaway._id, msg.id);

      await safeEditReply(interaction, {
        content: `<a:VC_Events:1448688007438667796> Giveaway creato in ${channel}. Termina tra **${durationStr}**.`,
        flags: EPHEMERAL_FLAG,
      });
    } catch (err) {
      global.logger?.error?.("[GIVEAWAY] create error:", err);
      return safeEditReply(interaction, {
        content: "<a:VC_Alert:1448670089670037675> Errore durante la creazione del giveaway.",
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};