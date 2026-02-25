const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, } = require("discord.js");
const suggestion = require("../../Schemas/Suggestion/suggestionSchema.js");
const IDs = require("../../Utils/Config/ids");
const { addExpWithLevel, getLevelInfo, getTotalExpForLevel, } = require("../../Services/Community/expService");
const { ExpUser } = require("../../Schemas/Community/communitySchemas");

const STAFF_ACCEPT_BUTTON_ID = "suggestion_staff_accept";
const STAFF_REJECT_BUTTON_ID = "suggestion_staff_reject";
const STAFF_MODAL_PREFIX = "suggestion_staff_modal";
const STAFF_REASON_INPUT_ID = "staff_reason";
const DIVIDER_URL =
  "https://cdn.discordapp.com/attachments/1467927329140641936/1467927368034422959/image.png?ex=69876f65&is=69861de5&hm=02f439283952389d1b23bb2793b6d57d0f8e6518e5a209cb9e84e625075627db";

function hasSuggestionStaffAccess(interaction) {
  const highStaffRoleId = IDs?.roles?.HighStaff
    ? String(IDs.roles.HighStaff)
    : null;
  if (!highStaffRoleId) return false;
  return interaction?.member?.roles?.cache?.has(highStaffRoleId);
}

function buildSuggestionRows() {
  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("upv")
      .setEmoji("<:thumbsup:1471292172145004768>")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("downv")
      .setEmoji("<:thumbsdown:1471292163957457013>")
      .setStyle(ButtonStyle.Secondary),
  );

  const staffRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(STAFF_ACCEPT_BUTTON_ID)
      .setLabel("Accetta")
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(STAFF_REJECT_BUTTON_ID)
      .setLabel("Rifiuta")
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );

  return [voteRow, staffRow];
}

function isSuggestionClosed(message) {
  const rows = Array.isArray(message?.components) ? message.components : [];
  if (rows.length === 0) return true;
  const ids = rows
    .flatMap((row) => (Array.isArray(row?.components) ? row.components : []))
    .map((component) => String(component?.customId || ""))
    .filter(Boolean);
  return !(ids.includes("upv") && ids.includes("downv"));
}

async function deleteThreadForMessage(guild, messageId) {
  const thread = await guild.channels.fetch(String(messageId || "")).catch(() => null);
  if (thread?.isThread?.()) {
    await thread.delete().catch(() => null);
  }
}

async function handleSuggestionVote(interaction) {
  if (!interaction?.guild) return false;

  if (interaction.isButton && interaction.isButton()) {
    if (!interaction.message) return false;
    const customId = String(interaction.customId || "");
    const isSuggestionControl = [
      "upv",
      "downv",
      STAFF_ACCEPT_BUTTON_ID,
      STAFF_REJECT_BUTTON_ID,
    ].includes(customId);
    if (!isSuggestionControl) return false;

    const data = await suggestion.findOne({
      GuildID: interaction.guild.id,
      Msg: interaction.message.id,
    });
    if (!data) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Suggerimento non trovato nel database.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const message = await interaction.channel.messages
      .fetch(data.Msg)
      .catch(() => null);
    if (
      !message ||
      !Array.isArray(message.embeds) ||
      message.embeds.length === 0
    ) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Messaggio suggerimento non disponibile.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    if (
      customId === STAFF_ACCEPT_BUTTON_ID ||
      customId === STAFF_REJECT_BUTTON_ID
    ) {
      if (!hasSuggestionStaffAccess(interaction)) {
        await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Red")
                .setDescription(
                  "<:vegax:1443934876440068179> Questo controllo è riservato all'High Staff.",
                ),
            ],
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }

      if (
        !Array.isArray(message.components) ||
        message.components.length === 0
      ) {
        await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Yellow")
                .setDescription(
                  "<:attentionfromvega:1443651874032062505> Questo suggerimento è già stato gestito.",
                ),
            ],
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }

      const action = customId === STAFF_ACCEPT_BUTTON_ID ? "accept" : "reject";
      const modal = new ModalBuilder()
        .setCustomId(`${STAFF_MODAL_PREFIX}:${action}:${message.id}`)
        .setTitle(
          action === "accept" ? "Accetta suggerimento" : "Rifiuta suggerimento",
        );

      const reasonInput = new TextInputBuilder()
        .setCustomId(STAFF_REASON_INPUT_ID)
        .setLabel("Motivo")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(1000)
        .setPlaceholder("Inserisci il motivo...");

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    if (customId === "upv") {
      if (isSuggestionClosed(message)) {
        await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Yellow")
                .setDescription(
                  "<:attentionfromvega:1443651874032062505> Questo suggerimento è già stato gestito.",
                ),
            ],
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }
      if (data.Upmembers.includes(interaction.user.id)) {
        await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  "<:vegax:1443934876440068179> Non puoi votare di nuovo! Hai già votato per questo suggerimento",
                )
                .setColor("Red"),
            ],
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }

      let downvotes = data.downvotes;
      if (data.Downmembers.includes(interaction.user.id)) {
        downvotes -= 1;
        data.downvotes -= 1;
      }

      data.Upmembers.push(interaction.user.id);
      data.Downmembers.pull(interaction.user.id);

      const newEmbed = EmbedBuilder.from(message.embeds[0]).setImage(
        DIVIDER_URL,
      ).setFields(
        {
          name: "<:thumbsup:1471292172145004768>",
          value: `**${data.upvotes + 1}**`,
          inline: true,
        },
        {
          name: "<:thumbsdown:1471292163957457013>",
          value: `**${downvotes}**`,
          inline: true,
        },
      );

      await interaction
        .update({ embeds: [newEmbed], components: buildSuggestionRows() })
        .catch(() => {});
      data.upvotes += 1;
      await data.save().catch(() => {});
      return true;
    }

    if (customId === "downv") {
      if (isSuggestionClosed(message)) {
        await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setColor("Yellow")
                .setDescription(
                  "<:attentionfromvega:1443651874032062505> Questo suggerimento è già stato gestito.",
                ),
            ],
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }
      if (data.Downmembers.includes(interaction.user.id)) {
        await interaction
          .reply({
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  "<:vegax:1443934876440068179> Non puoi votare di nuovo! Hai già votato per questo suggerimento",
                )
                .setColor("Red"),
            ],
            flags: 1 << 6,
          })
          .catch(() => {});
        return true;
      }

      let upvotes = data.upvotes;
      if (data.Upmembers.includes(interaction.user.id)) {
        upvotes -= 1;
        data.upvotes -= 1;
      }

      data.Downmembers.push(interaction.user.id);
      data.Upmembers.pull(interaction.user.id);

      const newEmbed = EmbedBuilder.from(message.embeds[0]).setImage(
        DIVIDER_URL,
      ).setFields(
        {
          name: "<:thumbsup:1471292172145004768>",
          value: `**${upvotes}**`,
          inline: true,
        },
        {
          name: "<:thumbsdown:1471292163957457013>",
          value: `**${data.downvotes + 1}**`,
          inline: true,
        },
      );

      await interaction
        .update({ embeds: [newEmbed], components: buildSuggestionRows() })
        .catch(() => {});
      data.downvotes += 1;
      await data.save().catch(() => {});
      return true;
    }

    return false;
  }

  if (interaction.isModalSubmit && interaction.isModalSubmit()) {
    const rawCustomId = String(interaction.customId || "");
    if (!rawCustomId.startsWith(`${STAFF_MODAL_PREFIX}:`)) return false;

    if (!hasSuggestionStaffAccess(interaction)) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Questo modulo è riservato all'High Staff.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const [, action, messageId] = rawCustomId.split(":");
    if (!messageId || !["accept", "reject"].includes(action)) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Richiesta non valida.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const reason = String(
      interaction.fields.getTextInputValue(STAFF_REASON_INPUT_ID) || "",
    ).trim();
    if (!reason) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Devi inserire un motivo.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const suggestionData = await suggestion.findOne({
      GuildID: interaction.guild.id,
      Msg: messageId,
    });
    if (!suggestionData) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Suggerimento non trovato.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const suggestionChannel =
      interaction.guild.channels.cache.get(IDs.channels.suggestions) ||
      (await interaction.guild.channels
        .fetch(IDs.channels.suggestions)
        .catch(() => null));
    const suggestionMessage = await suggestionChannel?.messages
      ?.fetch(suggestionData.Msg)
      .catch(() => null);
    const oldEmbed = suggestionMessage?.embeds?.[0] || null;
    if (!suggestionMessage || !oldEmbed) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Messaggio suggerimento non trovato.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    if (
      !Array.isArray(suggestionMessage.components) ||
      suggestionMessage.components.length === 0
    ) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setColor("Yellow")
              .setDescription(
                "<:attentionfromvega:1443651874032062505> Questo suggerimento è già stato gestito.",
              ),
          ],
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }

    const isAccept = action === "accept";
    const resultEmbed = new EmbedBuilder()
      .setColor(isAccept ? "Green" : "Red")
      .setTitle(
        isAccept
          ? "<:pinnednew:1443670849990430750> Suggerimento Accettato!"
          : "<:pinnednew:1443670849990430750> Suggerimento Rifiutato!",
      )
      .setDescription(oldEmbed.description || null)
      .setTimestamp()
      .setFooter(oldEmbed.footer || null)
      .setFields(Array.isArray(oldEmbed.fields) ? oldEmbed.fields : [])
      .addFields({
        name: isAccept
          ? "<:pinnednew:1443670849990430750> Motivo:"
          : "<:attentionfromvega:1443651874032062505> Motivo del rifiuto:",
        value: reason,
      });

    await suggestionMessage
      .edit({ embeds: [resultEmbed], components: [] })
      .catch(() => {});
    await deleteThreadForMessage(interaction.guild, suggestionMessage.id);

    if (isAccept) {
      const guildId = interaction.guild.id;
      const userId = suggestionData.AuthorID;
      let levelsAwarded = 0;
      try {
        let expDoc = await ExpUser.findOne({ guildId, userId })
          .lean()
          .catch(() => null);
        if (!expDoc) {
          await ExpUser.create({ guildId, userId }).catch(() => {});
          expDoc = await ExpUser.findOne({ guildId, userId })
            .lean()
            .catch(() => null);
        }

        const currentExp = Number(expDoc?.totalExp || 0);
        const currentLevel = Number(getLevelInfo(currentExp).level || 0);
        const targetLevel = Math.max(0, currentLevel + 5);
        const targetExp = Number(
          getTotalExpForLevel(targetLevel) || currentExp,
        );
        const expToAdd = Math.max(0, targetExp - currentExp);

        if (expToAdd > 0) {
          await addExpWithLevel(
            interaction.guild,
            userId,
            expToAdd,
            false,
            false,
          );
          levelsAwarded = 5;
        }
      } catch (error) {
        global.logger?.error?.("[SUGGESTION ACCEPT REWARD ERROR]", error);
      }

      const supportersChannelId = IDs?.channels?.supporters;
      const supportersChannel = supportersChannelId
        ? interaction.guild.channels.cache.get(supportersChannelId) ||
          (await interaction.guild.channels
            .fetch(supportersChannelId)
            .catch(() => null))
        : null;
      if (supportersChannel) {
        const thanksText =
          levelsAwarded > 0
            ? `<a:VC_PandaClap:1331620157398712330> Grazie <@${userId}> per il suggerimento accettato! Ti abbiamo assegnato **+5 livelli**.`
            : `<a:VC_PandaClap:1331620157398712330> Grazie <@${userId}> per il suggerimento accettato!`;
        await supportersChannel.send({ content: thanksText }).catch(() => {});
      }
    }

    const suggestionAuthor = await interaction.client.users
      .fetch(suggestionData.AuthorID)
      .catch(() => null);
    if (suggestionAuthor) {
      await suggestionAuthor
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(isAccept ? "Green" : "Red")
              .setDescription(
                isAccept
                  ? `<a:ThankYou:1329504268369002507> Il tuo suggerimento in **Vinili & Caffè** è stato accettato!\n<:pinnednew:1443670849990430750> Motivo: ${reason}`
                  : `<a:ThankYou:1329504268369002507> Il tuo suggerimento in **Vinili & Caffè** è stato rifiutato.\n<:attentionfromvega:1443651874032062505> Motivo: ${reason}`,
              ),
          ],
        })
        .catch(() => {});
    }

    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor(isAccept ? "Green" : "Red")
            .setDescription(
              isAccept
                ? "<:vegacheckmark:1443666279058772028> Suggerimento accettato con successo."
                : "<:vegacheckmark:1443666279058772028> Suggerimento rifiutato con successo.",
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => {});

    return true;
  }

  return false;
}

module.exports = { handleSuggestionVote, buildSuggestionRows };
