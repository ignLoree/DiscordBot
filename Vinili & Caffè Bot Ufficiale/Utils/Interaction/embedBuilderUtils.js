const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

function getSession(client, messageId) {
  return client?.embedBuilderSessions?.get(messageId) || null;
}

function buildPreviewEmbed(data = {}) {
  const embed = new EmbedBuilder().setColor(data.color || "#6f4e37");
  if (data.title) embed.setTitle(String(data.title).slice(0, 256));
  if (data.description)
    embed.setDescription(String(data.description).slice(0, 4096));
  if (data.footer)
    embed.setFooter({ text: String(data.footer).slice(0, 2048) });
  if (data.author) embed.setAuthor({ name: String(data.author).slice(0, 256) });
  if (data.thumbnail) embed.setThumbnail(String(data.thumbnail));
  if (data.image) embed.setImage(String(data.image));
  return embed;
}

function buildRows(ownerId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`eb:title:${ownerId}`)
      .setLabel("Titolo")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:description:${ownerId}`)
      .setLabel("Descrizione")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:color:${ownerId}`)
      .setLabel("Colore")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:footer:${ownerId}`)
      .setLabel("Footer")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:author:${ownerId}`)
      .setLabel("Autore")
      .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`eb:content:${ownerId}`)
      .setLabel("Testo")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:thumbnail:${ownerId}`)
      .setLabel("Thumbnail URL")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:image:${ownerId}`)
      .setLabel("Image URL")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`eb:send:${ownerId}`)
      .setLabel("Invia")
      .setStyle(ButtonStyle.Success),
  );
  return [row1, row2];
}

function buildEditModal(kind, ownerId, messageId, currentValue) {
  const modal = new ModalBuilder()
    .setCustomId(`ebm:${kind}:${ownerId}:${messageId}`)
    .setTitle("Modifica embed");
  const input = new TextInputBuilder().setCustomId("value");

  if (kind === "content") {
    input
      .setLabel("Testo fuori dall'embed (vuoto = rimuovi)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
  } else if (kind === "description") {
    input
      .setLabel("Descrizione (vuoto = rimuovi)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
  } else if (kind === "color") {
    input
      .setLabel("Colore HEX es: #6f4e37 (vuoto = default)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
  } else if (kind === "thumbnail") {
    input
      .setLabel("Thumbnail URL (vuoto = rimuovi)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
  } else if (kind === "image") {
    input
      .setLabel("Image URL (vuoto = rimuovi)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
  } else if (kind === "footer") {
    input
      .setLabel("Footer (vuoto = rimuovi)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
  } else if (kind === "author") {
    input
      .setLabel("Autore (vuoto = rimuovi)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
  } else {
    input
      .setLabel("Titolo (vuoto = rimuovi)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
  }

  if (currentValue) input.setValue(String(currentValue).slice(0, 4000));
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildSendModal(ownerId, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(`ebm:send:${ownerId}:${messageId}`)
    .setTitle("Invia embed");
  const input = new TextInputBuilder()
    .setCustomId("channelId")
    .setLabel("ID canale dove inviare l'embed")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function updatePreview(interaction, session) {
  const msg =
    interaction.message ||
    (await interaction.channel.messages
      .fetch(interaction.message?.id)
      .catch(() => null));
  if (!msg) return;
  const outside = String(session?.content || "").trim();
  const outsidePreview = outside
    ? `\n\n${outside.length > 300 ? outside.slice(0, 300) + "…" : outside}`
    : "";
  await msg
    .edit({
      content: outsidePreview,
      embeds: [buildPreviewEmbed(session.embed)],
      components: buildRows(session.ownerId),
    })
    .catch(() => {});
}

module.exports = {
  getSession,
  buildPreviewEmbed,
  buildRows,
  buildEditModal,
  buildSendModal,
  isValidUrl,
  updatePreview,
};
