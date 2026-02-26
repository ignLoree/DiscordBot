const { safeEditReply } = require("../../Utils/Moderation/reply");
const { SlashCommandBuilder } = require("discord.js");

const EPHEMERAL_FLAG = 1 << 6;
const MESSAGE_LINK_REGEX =
  /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;

function parseMessageLink(link) {
  if (!link) return null;
  const match = link.match(MESSAGE_LINK_REGEX);
  if (!match) return null;

  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  };
}

async function resolveReplyTarget(interaction, messageId, messageLink) {
  const linkData = parseMessageLink(messageLink);
  if (linkData) {
    if (interaction.guild?.id !== linkData.guildId) {
      return {
        error:
          "<:vegax:1443934876440068179> Il link non appartiene a questo server.",
      };
    }

    const targetChannel = await interaction.guild.channels
      .fetch(linkData.channelId)
      .catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased()) {
      return {
        error: "<:vegax:1443934876440068179> Canale non valido per rispondere.",
      };
    }

    const targetMessage = await targetChannel.messages
      .fetch(linkData.messageId)
      .catch(() => null);
    if (!targetMessage) {
      return { error: "<:vegax:1443934876440068179> Messaggio non trovato." };
    }

    return { channel: targetChannel, replyTo: targetMessage };
  }

  if (messageId) {
    const targetMessage = await interaction.channel.messages
      .fetch(messageId)
      .catch(() => null);
    if (!targetMessage) {
      return {
        error:
          "<:vegax:1443934876440068179> Messaggio non trovato in questo canale.",
      };
    }

    return { channel: interaction.channel, replyTo: targetMessage };
  }

  return { channel: interaction.channel, replyTo: null };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Quello che vorresti che il bot dicesse al posto tuo")
    .addStringOption((option) =>
      option
        .setName("messaggio")
        .setDescription("Il messaggio che vuoi che scriva il bot")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("ID del messaggio a cui rispondere (stesso canale)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("message_link")
        .setDescription("Link del messaggio a cui rispondere")
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    try {
      const messageText = interaction.options.getString("messaggio");
      const messageId = interaction.options.getString("message_id")?.trim();
      const messageLink = interaction.options.getString("message_link")?.trim();

      const target = await resolveReplyTarget(
        interaction,
        messageId,
        messageLink,
      );
      if (target.error) {
        return safeEditReply(interaction, {
          content: target.error,
          flags: EPHEMERAL_FLAG,
        });
      }

      await safeEditReply(interaction, {
        content: "Messaggio inviato",
        flags: EPHEMERAL_FLAG,
      });

      const payload = { content: `${messageText}` };
      if (target.replyTo) {
        payload.reply = {
          messageReference: target.replyTo.id,
          failIfNotExists: false,
        };
        payload.allowedMentions = { repliedUser: true };
      }

      await target.channel.send(payload).catch(() => null);
    } catch (err) {
      global.logger.error(err);
      return safeEditReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};