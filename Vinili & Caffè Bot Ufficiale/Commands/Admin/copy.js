const { safeEditReply } = require("../../Utils/Moderation/reply");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { default: axios } = require("axios");

const EPHEMERAL_FLAG = 1 << 6;

function buildEmbed(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

function replyWithEmbed(interaction, color, description, ephemeral = true) {
  return safeEditReply(interaction, {
    embeds: [buildEmbed(color, description)],
    ...(ephemeral ? { flags: EPHEMERAL_FLAG } : {}),
  });
}

function isHttpUrl(value) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function extractEmojiId(rawEmoji) {
  if (!rawEmoji.startsWith("<") || !rawEmoji.endsWith(">")) return null;
  return rawEmoji.match(/\d{15,}/g)?.[0] || null;
}

async function resolveEmojiUrl(rawEmoji) {
  const emojiId = extractEmojiId(rawEmoji);
  if (!emojiId) return { ok: false, reason: "invalid_emoji" };

  const ext = await axios
    .get(`https://cdn.discordapp.com/emojis/${emojiId}.gif`)
    .then(() => "gif")
    .catch(() => "png");

  return {
    ok: true,
    url: `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`,
  };
}

async function handleEmojiCopy(interaction) {
  let emojiInput = interaction.options.getString("id")?.trim();
  const emojiName = interaction.options.getString("nome");

  if (!emojiInput || !emojiName) {
    return replyWithEmbed(
      interaction,
      "Red",
      "<:vegax:1443934876440068179> Parametri non validi.",
    );
  }

  if (emojiInput.startsWith("<") && emojiInput.endsWith(">")) {
    const resolved = await resolveEmojiUrl(emojiInput);
    if (!resolved.ok) {
      return replyWithEmbed(
        interaction,
        "Red",
        "<:vegax:1443934876440068179> Emoji non valida.",
      );
    }
    emojiInput = resolved.url;
  }

  if (!isHttpUrl(emojiInput)) {
    return replyWithEmbed(
      interaction,
      "Red",
      "<:vegax:1443934876440068179> Non puoi rubare le emoji predefinite!",
    );
  }

  try {
    const newEmoji = await interaction.guild.emojis.create({
      attachment: emojiInput,
      name: emojiName,
    });

    return replyWithEmbed(
      interaction,
      "#6f4e37",
      `<:vegacheckmark:1443666279058772028> Aggiunta l'emoji ${newEmoji}, con il nome ${emojiName}`,
      false,
    );
  } catch (err) {
    global.logger.info(err);
    return replyWithEmbed(
      interaction,
      "Red",
      "<:vegax:1443934876440068179> Non puoi aggiungere questa emoji perchè hai raggiunto il limite di emoji del server.",
    );
  }
}

async function handleStickerCopy(interaction) {
  await safeEditReply(interaction, {
    embeds: [
      buildEmbed(
        "#6f4e37",
        "<a:loading:1443934440614264924> Aspetto lo sticker...",
      ),
    ],
    flags: EPHEMERAL_FLAG,
  });

  const filter = (message) => message.author.id === interaction.user.id;
  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 15000,
    max: 1,
  });

  collector.on("collect", async (message) => {
    const sticker = message.stickers.first();
    if (message.stickers.size === 0) {
      return replyWithEmbed(
        interaction,
        "Red",
        "<:vegax:1443934876440068179> Questo non è uno sticker...",
      );
    }

    if (sticker.url.endsWith(".json")) {
      return replyWithEmbed(
        interaction,
        "Red",
        "<:vegax:1443934876440068179> Non è uno sticker valido...",
      );
    }

    try {
      const newSticker = await interaction.guild.stickers.create({
        name: sticker.name,
        description: sticker.description || "",
        tags: sticker.tags,
        file: sticker.url,
      });

      await safeEditReply(interaction, {
        embeds: [
          buildEmbed(
            "#6f4e37",
            `<:vegacheckmark:1443666279058772028> Lo sticker col nome **${newSticker.name}** è stato creato!`,
          ),
        ],
      });
    } catch (err) {
      global.logger.info(err);
      safeEditReply(interaction, {
        embeds: [
          buildEmbed(
            "Red",
            "<:vegax:1443934876440068179> Non puoi aggiungere questo sticker perchè hai raggiunto il limite di sticker del server.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason !== "time") return;
    await replyWithEmbed(
      interaction,
      "Red",
      "<:vegax:1443934876440068179> Scaduto il tempo..",
    );
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("copy")
    .setDescription("Ruba e aggiungi sul tuo server.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("emoji")
        .setDescription("Ruba un'emoji e aggiungila al tuo server.")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription("L'emoji che vuoi rubare.")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("nome")
            .setDescription("Il nome per l'emoji.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("sticker").setDescription("Ruba uno sticker."),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    try {
      if (subcommand === "emoji") {
        return handleEmojiCopy(interaction);
      }

      if (subcommand === "sticker") {
        await handleStickerCopy(interaction);
        return;
      }
    } catch (err) {
      global.logger.error(err);
      return replyWithEmbed(
        interaction,
        "Red",
        "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando `copy`.",
      );
    }
  },
};
