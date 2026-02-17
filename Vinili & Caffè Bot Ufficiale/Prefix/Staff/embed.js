const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { safeMessageReply } = require("../../Utils/Moderation/reply");

function normalizeColor(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  return null;
}

function clampText(input, maxLen) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function buildPreviewEmbed(data = {}) {
  const embed = new EmbedBuilder().setColor(data.color || "#6f4e37");
  if (data.title) embed.setTitle(clampText(data.title, 256));
  if (data.description) embed.setDescription(clampText(data.description, 4096));
  if (data.footer) embed.setFooter({ text: clampText(data.footer, 2048) });
  if (data.author) embed.setAuthor({ name: clampText(data.author, 256) });
  if (data.thumbnail) embed.setThumbnail(String(data.thumbnail).trim());
  if (data.image) embed.setImage(String(data.image).trim());
  return embed;
}

function buildRows(userId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`eb:title:${userId}`)
      .setLabel("Titolo")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:description:${userId}`)
      .setLabel("Descrizione")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:color:${userId}`)
      .setLabel("Colore")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:footer:${userId}`)
      .setLabel("Footer")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:author:${userId}`)
      .setLabel("Autore")
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`eb:thumbnail:${userId}`)
      .setLabel("Thumbnail URL")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:image:${userId}`)
      .setLabel("Image URL")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:content:${userId}`)
      .setLabel("Testo")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:send:${userId}`)
      .setLabel("Invia")
      .setStyle(ButtonStyle.Success),
  );

  return [row1, row2];
}

module.exports = {
  name: "embed",
  description: "Crea un embed tramite un builder interattivo.",
  subcommands: ["create"],
  subcommandAliases: { create: "create" },
  aliases: ["emb", "embedcreate"],

  async execute(message, args = []) {
    if (!message.inGuild?.()) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Solo in server.",
        allowedMentions: { repliedUser: false },
      });
    }

    const sub = String(args[0] || "").toLowerCase();
    if (sub !== "create") {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Uso: `+embed create`",
        allowedMentions: { repliedUser: false },
      });
    }

    const userId = message.author.id;
    const initial = { color: "#6f4e37" };

    const preview = await message.channel
      .send({
        embeds: [buildPreviewEmbed(initial)],
        components: buildRows(userId),
      })
      .catch(() => null);

    if (!preview) {
      return safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Non riesco a creare il builder qui.",
        allowedMentions: { repliedUser: false },
      });
    }

    if (!message.client.embedBuilderSessions)
      message.client.embedBuilderSessions = new Map();
    message.client.embedBuilderSessions.set(preview.id, {
      ownerId: userId,
      embed: initial,
      content: "",
      createdAt: Date.now(),
    });
  },
};
