const { safeChannelSend } = require('../../Utils/Moderation/message');
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const LastFmUser = require("../../Schemas/LastFm/lastFmSchema");
const { DEFAULT_EMBED_COLOR, lastFmRequest, formatNumber } = require("../../Utils/Music/lastfm");
const { getLastFmUserForMessage } = require("../../Utils/Music/lastfmContext");
const { handleLastfmError } = require("../../Utils/Music/lastfmError");
const {
  PERIOD_ALIASES,
  resolveChartPeriod,
  getChartPeriodLabel,
  fetchChartArtists,
  hasCanvas,
  renderArtistChartImage
} = require("../../Utils/Music/chartartists");

module.exports = {
  skipPrefix: false,
  name: "artistchart",
  aliases: ["ac", "chartartists", "artisttopster"],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!hasCanvas()) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Il modulo canvas non e installato. Installa 'canvas' per usare .artistchart.")
        ]
      });
    }

    const mention = message.mentions.users.first();
    const tokens = args.filter(arg => !/^<@!?\d+>$/.test(arg));

    let sizeX = 3;
    let sizeY = 3;
    let period = "7day";
    let periodSpecified = false;
    let notitles = false;
    let skipEmptyImages = false;
    let lfmUsername = null;
    let idToken = null;

    for (const rawToken of tokens) {
      const raw = String(rawToken);
      const token = raw.toLowerCase().replace(/\/+$/, "").trim();
      if (!token) continue;

      if (/^\d{1,2}x\d{1,2}$/.test(token)) {
        const [x, y] = token.split("x").map(Number);
        if (Number.isFinite(x) && Number.isFinite(y) && x >= 2 && y >= 2 && x <= 20 && y <= 20 && (x * y) <= 100) {
          sizeX = x;
          sizeY = y;
        }
        continue;
      }

      if (PERIOD_ALIASES[token]) {
        period = PERIOD_ALIASES[token];
        periodSpecified = true;
        continue;
      }

      if (token === "notitles" || token === "nt") {
        notitles = true;
        continue;
      }

      if (token === "skip" || token === "s" || token === "skipemptyimages") {
        skipEmptyImages = true;
        continue;
      }

      if (token.startsWith("lfm:")) {
        lfmUsername = raw.slice(4).trim();
        continue;
      }

      if (/^\d{17,20}$/.test(token)) {
        idToken = token;
        continue;
      }
    }

    let targetUser = mention || null;
    if (!targetUser && idToken && message.guild) {
      targetUser = message.guild.members.cache.get(idToken)?.user || null;
    }

    if (message.guild?.members.cache.size < message.guild.memberCount) {
      try {
        await message.guild.members.fetch();
      } catch {
      }
    }

    const avatarUser = targetUser || message.author;
    const member = targetUser
      ? message.guild?.members.cache.get(targetUser.id)
      : message.guild?.members.cache.get(message.author.id);

    let displayName = member?.displayName || member?.user?.username || avatarUser.username;
    let userDoc = null;

    if (lfmUsername) {
      displayName = lfmUsername;
    } else if (targetUser) {
      userDoc = await getLastFmUserForMessage(message, targetUser);
      if (!userDoc) return;
      lfmUsername = userDoc.lastFmUsername;
      displayName = member?.displayName || member?.user?.username || targetUser.username;
    } else if (idToken) {
      userDoc = await LastFmUser.findOne({ discordId: idToken });
      if (!userDoc) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Non ho trovato lo username Last.fm dell'utente.")
          ]
        });
      }
      lfmUsername = userDoc.lastFmUsername;
      displayName = idToken;
    } else {
      userDoc = await getLastFmUserForMessage(message, message.author);
      if (!userDoc) return;
      lfmUsername = userDoc.lastFmUsername;
      displayName = member?.displayName || member?.user?.username || message.author.username;
    }

    period = resolveChartPeriod(period, "7day");

    try {
      let totalScrobbles = null;
      try {
        const info = await lastFmRequest("user.getinfo", { user: lfmUsername });
        const plays = Number(info?.user?.playcount || 0);
        if (Number.isFinite(plays) && plays >= 0) totalScrobbles = plays;
      } catch {
        totalScrobbles = null;
      }

      const results = await fetchChartArtists({
        lfmUsername,
        sizeX,
        sizeY,
        period,
        skipEmptyImages
      });

      if (!results.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Nessun artista trovato con i filtri selezionati.")
          ]
        });
      }

      const imageBuffer = await renderArtistChartImage({
        items: results,
        sizeX,
        sizeY,
        notitles
      });

      const attachment = new AttachmentBuilder(imageBuffer, { name: "artistchart.png" });
      const periodLabel = getChartPeriodLabel(period);
      const periodTitle = periodLabel ? periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1) : "Chart";
      const title = `${sizeX}x${sizeY} ${periodTitle} Artist Chart for ${displayName}`;

      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(title)
        .setImage("attachment://artistchart.png")
        .setFooter({ text: `Image source: Spotify | Use 'skip' to skip artists without images` });

      if (Number.isFinite(totalScrobbles)) {
        embed.setDescription(`${lfmUsername} has ${formatNumber(totalScrobbles)} scrobbles`);
      }

      return safeChannelSend(message.channel, { embeds: [embed], files: [attachment] });
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Errore durante il recupero dei dati di Last.fm.")
        ]
      });
    }
  }
};


