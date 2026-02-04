const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const renderQuoteCanvas = require("../../Utils/Render/quoteCanvas");

function normalize(text) {
  return String(text || "").trim();
}

module.exports = {
  skipPrefix: false,
  name: "quote",
  aliases: ["q"],

  async execute(message, args) {
    const referenced = message.reference?.messageId
      ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
      : null;

    const text = referenced?.cleanContent
      ? referenced.cleanContent
      : normalize(args.join(" "));

    const author = referenced?.author || message.author;
    const displayName = referenced?.member?.displayName || author.username;
    const footerText = String(message.client?.config2?.botServerInvite || "")
      .replace(/^https?:\/\//i, "")
      .trim();
    const avatarUrl = author.displayAvatarURL({ extension: "png", size: 512 });
    const username = displayName || author.username;

    if (!referenced) {
      const err = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Impossibile eseguire il comando, riprova rispondendo a un messaggio!")
        ]
      });
      setTimeout(() => err.delete().catch(() => {}), 10000);
      return;
    }

    if (!text) {
      const err = await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Impossibile eseguire il comando, riprova rispondendo a un messaggio!")
        ]
      });
      setTimeout(() => err.delete().catch(() => {}), 10000);
      return;
    }

    let buffer;
    try {
      buffer = await renderQuoteCanvas({
        avatarUrl,
        message: text,
        username,
        footerText
      });
    } catch {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Impossibile creare il canvas.")
        ]
      });
    }

    const attachment = new AttachmentBuilder(buffer, { name: "quote.png" });
    return message.channel.send({ files: [attachment] });
  }
};
