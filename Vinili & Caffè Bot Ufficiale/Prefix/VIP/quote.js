const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { safeMessageReply } = require('../../Utils/Moderation/message');
const renderQuoteCanvas = require('../../Utils/Render/quoteCanvas');
const { nextQuoteCount } = require('../../Utils/Quote/quoteCounter');
const QuotePrivacy = require('../../Schemas/Community/quotePrivacySchema');

const QUOTE_CHANNEL_ID = "1468540884537573479";
const ALLOWED_ROLE_IDS = [
  "1329497467481493607",
  "1442568916114346096",
  "1442568950805430312",
  "1442568936423034940"
];

function buildQuotePostEmbed({ messageAuthorId, creatorId, totalPosts }) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Sparkles:1468546911936974889> Nuova quotazione .ᐟ ✧")
    .setDescription("<:VC_Reply:1468262952934314131> Crea un post usando il comando **?quote** rispondendo al messaggio di un utente .ᐟ ✧")
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
  name: 'quote',

  async execute(message) {
    if (!message?.guild) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    const memberRoles = message.member?.roles?.cache;
    const hasRole = memberRoles?.some(role => ALLOWED_ROLE_IDS.includes(role.id));
    if (!hasRole) {
      return safeMessageReply(message, { embeds: [buildNoPermsEmbed()], allowedMentions: { repliedUser: false } });
    }

    const refId = message.reference?.messageId;
    if (!refId) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Devi rispondere a un messaggio per usare questo comando.")
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    const targetMessage = await message.channel.messages.fetch(refId).catch(() => null);
    if (!targetMessage) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Impossibile trovare il messaggio selezionato.")
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    const text = targetMessage.cleanContent || targetMessage.content || "";
    const author = targetMessage.author;
    const displayName = targetMessage.member?.displayName || author?.username;
    if (!author || !text) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Il messaggio selezionato non ha testo.")
        ],
        allowedMentions: { repliedUser: false }
      });
    }

    try {
      const privacy = await QuotePrivacy.findOne({ guildId: message.guild.id, userId: author.id }).lean();
      if (privacy?.blocked) {
        const dateText = new Date().toLocaleString('it-IT', {
          timeZone: 'Europe/Rome',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#ed4245")
              .setTitle("🚫 Quote bloccate")
              .setDescription([
                `**${displayName || author.username}** ha bloccato le quote dei propri messaggi.`,
                "",
                "**Rispetta la privacy**",
                "L'utente ha scelto di non essere quotato. Rispetta questa decisione!",
                
              ].join("\n"))
              .setFooter({ text: `Se hai bisogno di condividere il messaggio, usa un screenshot o chiedi il permesso diretto. • ${dateText}` })
          ],
          allowedMentions: { repliedUser: false }
        });
      }
    } catch {}

    let buffer;
    try {
      const footerText = String(message.client?.config2?.botServerInvite || "")
        .replace(/^https?:\/\//i, "")
        .trim();
      buffer = await renderQuoteCanvas({
        avatarUrl: author.displayAvatarURL({ extension: "png", size: 512 }),
        message: text,
        username: displayName || author.username,
        footerText
      });
    } catch {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Impossibile creare il canvas.")
        ],
        allowedMentions: { repliedUser: false }
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
      .setDescription(`<a:VC_Sparkles:1468546911936974889> Puoi trovare il post creato nel canale: <#${QUOTE_CHANNEL_ID}>!`)
      .addFields({ name: "📸 Totale immagini generate:", value: String(totalPosts) });

    const quoteChannel = message.guild.channels.cache.get(QUOTE_CHANNEL_ID);
    if (quoteChannel) {
      const postAttachment = new AttachmentBuilder(buffer, { name: "quote.png" });
      const postEmbed = buildQuotePostEmbed({
        messageAuthorId: author.id,
        creatorId: message.author.id,
        totalPosts
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`quote_remove:${message.author.id}`)
          .setLabel('Rimuovi questa quote')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger)
      );
      await quoteChannel.send({ files: [postAttachment], embeds: [postEmbed], components: [row] }).catch(() => {});
    }

    return safeMessageReply(message, { files: [attachment], embeds: [embed], allowedMentions: { repliedUser: false } });
  }
};
