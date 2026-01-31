const { EmbedBuilder } = require("discord.js");
const { lastFmRequest, DEFAULT_EMBED_COLOR } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessageOrUsername } = require("../../Utils/Music/lastfmContext");
const { extractTargetUserWithLastfm, extractPeriod, extractPagination } = require("../../Utils/Music/lastfmPrefix");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
module.exports = {
  skipPrefix: true,
  name: "recap",
  async execute(message, args) {
    await message.channel.sendTyping();
    const { target, args: filteredArgs, lastfm } = extractTargetUserWithLastfm(message, args);
    const pagination = extractPagination(filteredArgs, { defaultLimit: 5, maxLimit: 10 });
    const period = extractPeriod(pagination.args[0]);
    const user = await getLastFmUserForMessageOrUsername(message, target, lastfm);
    if (!user) return;
    const member = message.guild?.members.cache.get(target.id);
    const displayName = member?.displayName || target.username;
    try {
      const [artistsData, tracksData, albumsData] = await Promise.all([
        lastFmRequest("user.gettopartists", { user: user.lastFmUsername, period, limit: pagination.limit }),
        lastFmRequest("user.gettoptracks", { user: user.lastFmUsername, period, limit: pagination.limit }),
        lastFmRequest("user.gettopalbums", { user: user.lastFmUsername, period, limit: pagination.limit })
      ]);
      const artists = artistsData?.topartists?.artist || [];
      const tracks = tracksData?.toptracks?.track || [];
      const albums = albumsData?.topalbums?.album || [];
      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setAuthor({ name: `${displayName}`, iconURL: target.displayAvatarURL() })
        .setTitle(`Recap - ${period}`)
        .addFields(
          {
            name: "Top artisti",
            value: artists.map(a => `**${a.name}** (${a.playcount})`).join("\n") || "Nessuno"
          },
          {
            name: "Top tracce",
            value: tracks.map(t => `**${t.artist?.name || "?"}** - ${t.name} (${t.playcount})`).join("\n") || "Nessuno"
          },
          {
            name: "Top album",
            value: albums.map(a => `**${a.artist?.name || "?"}** - ${a.name} (${a.playcount})`).join("\n") || "Nessuno"
          }
        )
        .setFooter({ text: `Limite: ${pagination.limit}` });
      return message.channel.send({ embeds: [embed] });
    } catch (error) {
   if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il recupero dei dati.")
        ]
      });
    }
  }
};
