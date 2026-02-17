const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionsBitField,
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
  const {
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
  } = require("discord.js");
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
    ? `\n\n ${outside.length > 300 ? outside.slice(0, 300) + "…" : outside}`
    : "";
  await msg
    .edit({
      content: outsidePreview,
      embeds: [buildPreviewEmbed(session.embed)],
      components: buildRows(session.ownerId),
    })
    .catch(() => {});
}

async function handleEmbedBuilderInteraction(interaction, client) {
  const cid = String(interaction?.customId || "");
  if (!cid.startsWith("eb:") && !cid.startsWith("ebm:")) return false;

  if (!client.embedBuilderSessions) client.embedBuilderSessions = new Map();

  if (interaction.isButton && interaction.isButton()) {
    const parts = cid.split(":");
    const kind = parts[1];
    const ownerId = parts[2];
    const messageId = interaction.message?.id;

    if (!ownerId || !messageId) return false;
    if (interaction.user.id !== ownerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Questo builder non è tuo.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const session = getSession(client, messageId);
    if (!session) {
      await interaction
        .reply({
          content:
            "<:vegax:1443934876440068179> Sessione scaduta o non trovata.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    if (kind === "send") {
      await interaction
        .showModal(buildSendModal(ownerId, messageId))
        .catch(() => {});
      return true;
    }

    const current =
      kind === "content"
        ? session.content || null
        : session.embed?.[kind] || null;
    await interaction
      .showModal(buildEditModal(kind, ownerId, messageId, current))
      .catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit && interaction.isModalSubmit()) {
    const parts = cid.split(":");
    const kind = parts[1];
    const ownerId = parts[2];
    const messageId = parts[3];

    if (!ownerId || !messageId) return false;
    if (interaction.user.id !== ownerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Questo builder non è tuo.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const session = getSession(client, messageId);
    if (!session) {
      await interaction
        .reply({
          content:
            "<:vegax:1443934876440068179> Sessione scaduta o non trovata.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    if (kind === "send") {
      const rawChannelId = String(
        interaction.fields.getTextInputValue("channelId") || "",
      ).trim();
      const channel = await client.channels
        .fetch(rawChannelId)
        .catch(() => null);
      if (!channel?.isTextBased?.()) {
        await interaction
          .reply({
            content: "<:vegax:1443934876440068179> Canale non valido.",
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }

      const me =
        channel.guild?.members?.me ||
        (channel.guild
          ? await channel.guild.members.fetchMe().catch(() => null)
          : null);
      if (me) {
        const perms = channel.permissionsFor(me);
        if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
          await interaction
            .reply({
              content:
                "<:vegax:1443934876440068179> Non ho permesso di scrivere in quel canale.",
              flags: 1 << 6,
            })
            .catch(() => {});
          return true;
        }
      }

      await channel
        .send({
          content: String(session?.content || "").trim() || undefined,
          embeds: [buildPreviewEmbed(session.embed)],
          components: [],
        })
        .catch(() => null);

      await interaction
        .reply({ content: "✅ Embed inviato!", flags: 1 << 6 })
        .catch(() => {});
      return true;
    }

    let value = String(
      interaction.fields.getTextInputValue("value") || "",
    ).trim();

    if (!session.embed) session.embed = {};
    if (kind === "content") {
      session.content = value || "";
    } else if (!value) {
      if (kind === "color") session.embed.color = "#6f4e37";
      else delete session.embed[kind];
    } else if (kind === "color") {
      const normalized = (() => {
        const hex = value.startsWith("#") ? value : `#${value}`;
        return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
      })();
      if (!normalized) {
        await interaction
          .reply({
            content:
              "<:vegax:1443934876440068179> Colore non valido. Usa tipo `#6f4e37`.",
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }
      session.embed.color = normalized;
    } else if (
      (kind === "thumbnail" || kind === "image") &&
      !isValidUrl(value)
    ) {
      await interaction
        .reply({
          content:
            "<:vegax:1443934876440068179> URL non valido (usa http/https).",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    } else {
      const maxLen =
        kind === "description" ? 4096 : kind === "footer" ? 2048 : 256;
      session.embed[kind] = value.slice(0, maxLen);
    }

    client.embedBuilderSessions.set(messageId, session);

    await updatePreview(interaction, session);

    await interaction
      .reply({ content: "✅ Anteprima aggiornata.", flags: 1 << 6 })
      .catch(() => {});
    return true;
  }

  return false;
}

module.exports = { handleEmbedBuilderInteraction };
