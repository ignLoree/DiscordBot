const { ContextMenuCommandBuilder, ApplicationCommandType, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const renderQuoteCanvas = require("../../Utils/Render/quoteCanvas");
const { nextQuoteCount } = require("../../Utils/Quote/quoteCounter");

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
  data: new ContextMenuCommandBuilder()
    .setName("Quote")
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ],
        flags: 1 << 6
      });
    }

    const memberRoles = interaction.member?.roles?.cache;
    const hasRole = memberRoles?.some(role => ALLOWED_ROLE_IDS.includes(role.id));
    if (!hasRole) {
      return interaction.reply({ embeds: [buildNoPermsEmbed()], flags: 1 << 6 });
    }

    await interaction.deferReply();
    const targetMessage = interaction.targetMessage;
    const text = targetMessage?.cleanContent || targetMessage?.content || "";
    const author = targetMessage?.author;
    const displayName = targetMessage?.member?.displayName || author?.username;
    if (!author || !text) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:attentionfromvega:1443651874032062505> Il messaggio selezionato non ha testo.")
        ]
      });
    }

    const avatarUrl = author.displayAvatarURL({ extension: "png", size: 512 });
    const username = displayName || author.username;
    let buffer;
    try {
      const footerText = String(interaction.client?.config2?.botServerInvite || "")
        .replace(/^https?:\/\//i, "")
        .trim();
      buffer = await renderQuoteCanvas({
        avatarUrl,
        message: text,
        username,
        footerText
      });
    } catch {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Impossibile creare il canvas.")
        ]
      });
    }

    let totalPosts = 1;
    try {
      totalPosts = await nextQuoteCount(interaction.guild.id);
    } catch {
      totalPosts = 1;
    }

    const attachment = new AttachmentBuilder(buffer, { name: "quote.png" });
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(`<a:VC_Sparkles:1468546911936974889> Puoi trovare il post creato nel canale: <#${QUOTE_CHANNEL_ID}>!`)
      .addFields({ name: "📸 Totale immagini generate:", value: String(totalPosts) });

    const quoteChannel = interaction.guild?.channels?.cache?.get(QUOTE_CHANNEL_ID);
    if (quoteChannel) {
      const postAttachment = new AttachmentBuilder(buffer, { name: "quote.png" });
      const postEmbed = buildQuotePostEmbed({
        messageAuthorId: author.id,
        creatorId: interaction.user.id,
        totalPosts
      });
      await quoteChannel.send({ files: [postAttachment], embeds: [postEmbed] }).catch(() => { });
    }

    return interaction.editReply({ files: [attachment], embeds: [embed] });
  }
};
