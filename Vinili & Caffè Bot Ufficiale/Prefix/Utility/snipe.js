const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "snipe",
  allowEmptyArgs: true,
  async execute(message, args, client) {
    await message.channel.sendTyping();
    if (!client.snipes || !(client.snipes instanceof Map)) {
      client.snipes = new Map();
    }
    const raw = client.snipes.get(message.channel.id);
    const history = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const snipe = history.find((item) => !item?.isEmbedOnly) || null;

    if (!message.guild) return;

    if (!snipe) {
      return safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Nessun messaggio eliminato recentemente.",
        allowedMentions: { repliedUser: false },
      });
    }
    const rawContent = String(snipe.content || "").trim();
    const safeContent = rawContent
      ? rawContent.replace(/```/g, "\\`\\`\\`")
      : "*<:vegax:1443934876440068179> Nessun contenuto*";
    const maxFieldPayload = 980;
    const clippedContent =
      safeContent.length > maxFieldPayload
        ? `${safeContent.slice(0, maxFieldPayload)}...`
        : safeContent;
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .addFields(
        {
          name: "<:member_role_icon:1330530086792728618> Messaggio inviato da:",
          value: snipe.authorId
            ? `<@${snipe.authorId}> (${snipe.authorTag})`
            : "Sconosciuto",
          inline: true,
        },
        {
          name: "<:VC_BlackPin:1448687216871084266> Canale:",
          value: snipe.channel || `${message.channel}`,
          inline: true,
        },
        {
          name: "<:VC_Chat:1448694742237053061> Contenuto:",
          value: `\`\`\`${clippedContent}\`\`\``,
        },
      )
      .setTimestamp();
    if (snipe.attachment) {
      embed.setImage(snipe.attachment);
    }
    return safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};