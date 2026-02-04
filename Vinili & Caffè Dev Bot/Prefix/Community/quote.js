const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const renderQuoteCanvas = require("../../Utils/Render/quoteCanvas");
const { nextQuoteCount } = require("../../Utils/Quote/quoteCounter");

const QUOTE_CHANNEL_ID = "1468540884537573479";
const ALLOWED_ROLE_IDS = [
  "1329497467481493607",
  "1442568916114346096",
  "1442568950805430312",
  "1442568936423034940"
];

function normalize(text) {
  return String(text || "").trim();
}

function buildQuotePostEmbed({ messageAuthorId, creatorId, totalPosts }) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Sparkles:1468546911936974889> Nuova quotazione _!_ ✧")
    .setDescription("<:VC_Reply:1468262952934314131> Crea un post usando il comando `?quote` rispondendo al messaggio di un utente ! ✧")
    .addFields(
      { name: "Messaggio di:", value: `<@${messageAuthorId}>` },
      { name: "Creato da:", value: `<@${creatorId}>` }
    )
    .setFooter({ text: `Post totali: ${totalPosts}` });
}

function buildNoPermsEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1468544444113617063> **Non hai i permessi**")
    .setDescription("Questo comando è **VIP**, riservato ad una categoria di utenti specifici.")
    .addFields({
      name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
      value: `ottieni uno dei seguenti ruoli: <@&${ALLOWED_ROLE_IDS[0]}>, <@&${ALLOWED_ROLE_IDS[1]}>, <@&${ALLOWED_ROLE_IDS[2]}>, <@&${ALLOWED_ROLE_IDS[3]}>`
    });
}

module.exports = {
  skipPrefix: false,
  name: "quote",
  aliases: ["q"],

  async execute(message, args) {
    const hasRole = message.member?.roles?.cache?.some(role => ALLOWED_ROLE_IDS.includes(role.id));
    if (!hasRole) {
      const err = await message.channel.send({ embeds: [buildNoPermsEmbed()] });
      setTimeout(() => err.delete().catch(() => {}), 30000);
      return;
    }

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
      setTimeout(() => err.delete().catch(() => {}), 30000);
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
      setTimeout(() => err.delete().catch(() => {}), 30000);
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

    let totalPosts = 1;
    try {
      totalPosts = await nextQuoteCount(message.guild.id);
    } catch {
      totalPosts = 1;
    }

    const attachment = new AttachmentBuilder(buffer, { name: "quote.png" });
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(`\u2B50 \u2728 Puoi trovare il post creato nel canale: <#${QUOTE_CHANNEL_ID}>!`)
      .addFields({ name: "?? Totale immagini generate:", value: String(totalPosts) });

    const quoteChannel = message.guild?.channels?.cache?.get(QUOTE_CHANNEL_ID);
    if (quoteChannel) {
      const postAttachment = new AttachmentBuilder(buffer, { name: "quote.png" });
      const postEmbed = buildQuotePostEmbed({
        messageAuthorId: author.id,
        creatorId: message.author.id,
        totalPosts
      });
      await quoteChannel.send({ files: [postAttachment], embeds: [postEmbed] }).catch(() => {});
    }

    return message.channel.send({ files: [attachment], embeds: [embed] });
  }
};
