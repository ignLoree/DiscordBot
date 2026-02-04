const { safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require("discord.js");

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

async function resolveMember(message, query) {
  const mention = message.mentions?.members?.first();
  if (mention) return mention;
  const id = String(query || "").replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    const cached = message.guild.members.cache.get(id);
    if (cached) return cached;
    try {
      return await message.guild.members.fetch(id);
    } catch {
      return null;
    }
  }
  if (!query) return null;
  const target = normalize(query);
  return message.guild.members.cache.find(member => {
    const username = normalize(member.user?.username);
    const displayName = normalize(member.displayName);
    const tag = normalize(member.user?.tag);
    return username === target || displayName === target || tag === target;
  }) || null;
}

module.exports = {
  skipPrefix: false,
  name: "avatar",
  aliases: ["av"],
  prefixOverride: "?",

  async execute(message, args) {
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.")
        ]
      });
    }

    const subRaw = args[0] ? String(args[0]).toLowerCase() : "";
    const sub = ["get", "server", "user"].includes(subRaw) ? subRaw : "get";
    const query = ["get", "server", "user"].includes(subRaw) ? args.slice(1).join(" ") : args.join(" ");
    const member = await resolveMember(message, query) || message.member;
    const user = member?.user || message.author;

    if (sub === "server") {
      const memberAvatar = member.displayAvatarURL();
      const userAvatar = user.displayAvatarURL();
      if (memberAvatar === userAvatar) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Non ha un avatar impostato solo per questo server.")
          ]
        });
      }
    }

    const isUser = sub === "user";
    const title = isUser ? "User Avatar" : "Server Avatar";
    const imageUrl = isUser
      ? user.displayAvatarURL({ size: 4096 })
      : member.displayAvatarURL({ size: 4096 });
    const authorLabel = member?.displayName || user.tag;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setImage(imageUrl)
      .setAuthor({ name: authorLabel, iconURL: user.displayAvatarURL() })
      .setColor("#6f4e37");

    return safeChannelSend(message.channel, { embeds: [embed] });
  }
};


