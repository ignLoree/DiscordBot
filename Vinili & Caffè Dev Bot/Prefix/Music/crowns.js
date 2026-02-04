const { EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { getCrownsForUser, formatRelative } = require("../../Utils/Music/crowns");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
async function resolveUserFromArgs(message, args) {
  const mention = message.mentions.users.first();
  const idArg = args.find(arg => /^\d{17,20}$/.test(arg));
  const lfmArg = args.find(arg => arg.toLowerCase().startsWith("lfm:"));
  if (mention) return mention;
  if (idArg && message.guild) {
    return message.guild.members.cache.get(idArg)?.user || null;
  }
  if (lfmArg) {
    const username = lfmArg.slice(4).trim();
    const doc = await LastFmUser.findOne({
      lastFmUsername: new RegExp(`^${username}$`, "i")
    });
    if (!doc) return null;
    return message.guild?.members.cache.get(doc.discordId)?.user || null;
  }
  return message.author;
}
module.exports = {
  skipPrefix: true,
  name: "crowns",
  aliases: ["cws"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!message.guild) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Questo comando può essere usato solo in un server.")
        ]
      });
    }
    const requester = await getLastFmUserForMessage(message, message.author);
    if (!requester) return;
    const pagination = extractPagination(args, { defaultLimit: 15, maxLimit: 50 });
    const targetUser = await resolveUserFromArgs(message, pagination.args);
    if (!targetUser) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Non ho trovato questo utente.")
        ]
      });
    }
      if (message.guild.members.cache.size < message.guild.memberCount) {
        try {
          await message.guild.members.fetch();
        } catch {
        }
      }
    const crowns = await getCrownsForUser(message.guild.id, targetUser.id);
    if (!crowns.length) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(DEFAULT_EMBED_COLOR)
            .setDescription(
              "You or the user you're searching for don't have any crowns yet.\n\n" +
              "Use .whoknows to start getting crowns!"
            )
        ]
      });
    }
    const displayName = message.guild.members.cache.get(targetUser.id)?.displayName || targetUser.username;
    const start = (pagination.page - 1) * pagination.limit;
    const lines = crowns.slice(start, start + pagination.limit).map((crown, index) => {
      const claimed = formatRelative(crown.claimedAt);
      return `${start + index + 1}. **${crown.artistName}** - ${crown.playcount} plays - Claimed ${claimed}`;
    });
    const embed = new EmbedBuilder()
      .setColor(DEFAULT_EMBED_COLOR)
      .setTitle(`Crowns for ${displayName}`)
      .setDescription(lines.join("\n"))
      .setFooter({ text: `Page ${pagination.page}/${Math.max(1, Math.ceil(crowns.length / pagination.limit))} - ${crowns.length} total crowns` });
    return message.channel.send({ embeds: [embed] });
  }
};
