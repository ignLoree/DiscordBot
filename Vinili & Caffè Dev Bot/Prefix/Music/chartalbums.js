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
  fetchChartAlbums,
  hasCanvas,
  renderChartImage
} = require("../../Utils/Music/chartalbums");

module.exports = {
  skipPrefix: false,
  name: "chart",
  aliases: [
    "c",
    "chartalbums",
    "aoty",
    "albumsoftheyear",
    "albomoftheyear",
    "aotd",
    "albumsofthedecade",
    "albomofthedecade",
    "topster",
    "topsters"
  ],
  async execute(message, args) {
    await message.channel.sendTyping();
    if (!hasCanvas()) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("Il modulo canvas non Ã¨ installato. Installa 'canvas' per usare .chart.")
        ]
      });
    }

    const mention = message.mentions.users.first();
    const tokens = args.filter(arg => !/^<@!?\d+>$/.test(arg));

    const rawCommand = message.content.trim().split(/\s+/)[0];
    const invoked = rawCommand.replace(/^[.?!]+/, "").toLowerCase();
    const isAoty = ["aoty", "albumsoftheyear", "albomoftheyear", "albumoftheyear"].includes(invoked);
    const isAotd = ["aotd", "albumsofthedecade", "albomofthedecade", "albumofthedecade"].includes(invoked);

    let sizeX = 3;
    let sizeY = 3;
    let period = "7day";
    let periodSpecified = false;
    let notitles = false;
    let skipEmptyImages = false;
    let releaseYear = null;
    let releaseDecade = null;
    let sfw = false;
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

      if (token === "skipemptyimages" || token === "skipemptyalbums" || token === "skip" || token === "s") {
        skipEmptyImages = true;
        continue;
      }

      if (token === "sfw") {
        sfw = true;
        continue;
      }

      if (token.startsWith("r:") || token.startsWith("released:")) {
        const year = Number(token.split(":")[1]);
        if (Number.isFinite(year)) releaseYear = year;
        continue;
      }

      if (/^(19|20)\d{2}$/.test(token)) {
        const year = Number(token);
        if (year >= 1900 && year <= 2100) releaseYear = year;
        continue;
      }

      if (token.startsWith("d:") || token.startsWith("decade:")) {
        const value = token.split(":")[1];
        if (value) releaseDecade = value;
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

    let displayName = member?.displayName || avatarUser.username;
    let userDoc = null;

    if (lfmUsername) {
      displayName = lfmUsername;
    } else if (targetUser) {
      userDoc = await getLastFmUserForMessage(message, targetUser);
      if (!userDoc) return;
      lfmUsername = userDoc.lastFmUsername;
      displayName = member?.displayName || targetUser.username;
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
      displayName = member?.displayName || message.author.username;
    }

    if (!periodSpecified && (releaseYear || releaseDecade)) {
      period = "overall";
    }
    if (!periodSpecified && (isAoty || isAotd)) {
      period = "overall";
    }
    if (isAoty && !releaseYear) {
      releaseYear = new Date().getFullYear();
    }
    if (isAotd && !releaseDecade) {
      const year = new Date().getFullYear();
      const decadeStart = year - (year % 10);
      releaseDecade = `${decadeStart}s`;
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

      const results = await fetchChartAlbums({
        lfmUsername,
        sizeX,
        sizeY,
        period,
        releaseYear,
        releaseDecade,
        skipEmptyImages,
        sfw
      });

      if (!results.length) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("Nessun album trovato con i filtri selezionati.")
          ]
        });
      }

      const imageBuffer = await renderChartImage({
        items: results,
        sizeX,
        sizeY,
        notitles
      });

      const meta = [`Size: ${sizeX}x${sizeY}`, `Period: ${getChartPeriodLabel(period)}`];
      if (releaseYear) meta.push(`Year: ${releaseYear}`);
      if (releaseDecade) meta.push(`Decade: ${releaseDecade}`);
      if (notitles) meta.push("No titles");
      if (skipEmptyImages) meta.push("Skip empty images");
      if (sfw) meta.push("SFW");

      const attachment = new AttachmentBuilder(imageBuffer, { name: "chart.png" });

      const periodLabel = getChartPeriodLabel(period);
      const periodTitle = periodLabel ? periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1) : "Chart";
      const title = `${sizeX}x${sizeY} ${periodTitle} Chart for ${displayName}`;

      const embed = new EmbedBuilder()
        .setColor(DEFAULT_EMBED_COLOR)
        .setTitle(title)
                .setImage("attachment://chart.png")
        .setFooter({ text: meta.join(" | ") });

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



