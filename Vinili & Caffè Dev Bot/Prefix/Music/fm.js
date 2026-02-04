const { safeMessageReply, safeChannelSend } = require('../../Utils/Moderation/message');
const { EmbedBuilder } = require('discord.js');
const LastFmUser = require('../../Schemas/LastFm/lastFmSchema');
const { getLastFmUserForMessageOrUsername } = require('../../Utils/Music/lastfmContext');
const { extractTargetUserWithLastfm } = require('../../Utils/Music/lastfmPrefix');
const { lastFmRequest, LASTFM_API_KEY, formatNumber } = require('../../Utils/Music/lastfm');
const { handleLastfmError } = require('../../Utils/Music/lastfmError');
const { getSpotifyTrackImageSmart } = require('../../Utils/Music/spotify');

async function resolveUserOverride(candidate) {
  if (!candidate) return null;
  const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return LastFmUser.findOne({ lastFmUsername: new RegExp(`^${escaped}$`, 'i') });
}

module.exports = {
  skipPrefix: false,
  name: 'fm',
  aliases: [
    'np', 'qm', 'wm', 'em', 'rm', 'tm', 'ym', 'om', 'pm', 'gm', 'sm', 'hm', 'jm', 'km',
    'lm', 'zm', 'xm', 'cm', 'vm', 'bm', 'nm', 'mm', 'nowplaying'],
  async execute(message, args) {
    await message.channel.sendTyping();
    const baseArgs = Array.isArray(args) ? [...args] : [];
    let userOverride = null;

    if (baseArgs[0] && baseArgs[0].toLowerCase().startsWith('lfm:')) {
      userOverride = baseArgs.shift().slice(4);
    } else if (baseArgs[0] && !baseArgs[0].startsWith('<@')) {
      const found = await resolveUserOverride(baseArgs[0]);
      if (found) {
        userOverride = found.lastFmUsername;
        baseArgs.shift();
      }
    }

    const { target, lastfm } = extractTargetUserWithLastfm(message, baseArgs);
    const user = await getLastFmUserForMessageOrUsername(message, target, userOverride || lastfm);
    if (!user) return;

    const lastFmUsername = user.lastFmUsername;
    if (!LASTFM_API_KEY) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> API key Last.fm non configurata. Contatta un high staff.')
        ],
        flags: 1 << 6
      });
      return;
    }

    try {
      const [recentTracksData, userInfoData] = await Promise.all([
        lastFmRequest('user.getrecenttracks', { user: lastFmUsername, limit: 2 }),
        lastFmRequest('user.getinfo', { user: lastFmUsername })
      ]);

      const recentList = recentTracksData?.recenttracks?.track || [];
      if (recentList.length > 0) {
        const currentTrack = recentList[0];
        const trackPlaycount = await getTrackPlaycount(lastFmUsername, currentTrack);
        const totalFromUser = Number(userInfoData?.user?.playcount ?? userInfoData?.user?.playcount?.['#text'] ?? 0);
        const totalFromRecent = Number(recentTracksData?.recenttracks?.['@attr']?.total ?? 0);
        const totalScrobbles = Math.max(totalFromUser || 0, totalFromRecent || 0);
        const lastfmImage = currentTrack?.image?.find(img => img.size === 'extralarge')?.['#text']
          || currentTrack?.image?.find(img => img.size === 'large')?.['#text']
          || null;
        const imageUrl = await getSpotifyTrackImageSmart(currentTrack.artist?.['#text'], currentTrack.name)
          || lastfmImage
          || 'https://via.placeholder.com/150';
        const member = message.guild?.members.cache.get(target.id);
        const displayName = member?.displayName || target.username;
        const embed = new EmbedBuilder()
          .setAuthor({ name: `Riproducendo in questo momento - ${displayName}`, iconURL: target.displayAvatarURL() })
          .setColor('#6f4e37')
          .setThumbnail(imageUrl)
          .setTitle(`**${currentTrack.name}**`)
          .setURL(`${getTrackUrl(currentTrack)}`)
          .setDescription(`**${currentTrack.artist['#text']}** - *${currentTrack.album['#text'] || ''}*`)
          .setFooter({ text: `${formatNumber(totalScrobbles)} ascolti totali` });
        await safeMessageReply(message, { embeds: [embed] });
      } else {
        await safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setDescription('<:vegax:1443934876440068179> Non sono state trovate tracce recenti.')
          ]
        });
      }
    } catch (error) {
      if (handleLastfmError(message, error)) return;
      global.logger.error(error);
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setDescription('<:vegax:1443934876440068179> Si e verificato un errore durante il recupero dei dati di Last.fm.')
        ]
      });
    }
  }
};

async function getTrackPlaycount(username, track) {
  if (!track?.artist?.['#text'] || !track?.name) {
    global.logger.warn('Track non valido:', track);
    return '0';
  }
  try {
    const response = await lastFmRequest('track.getInfo', {
      artist: track.artist['#text'],
      track: track.name,
      username
    });
    if (!response?.track) return '0';
    return response.track.userplaycount ?? '0';
  } catch (error) {
    const code = error?.lastfmCode || error?.response?.data?.error;
    const message = error?.lastfmMessage || error?.response?.data?.message || error?.message;
    if (code === 6 || String(message || '').toLowerCase().includes('track not found')) {
      return '0';
    }
    global.logger.error('Errore track.getInfo:', error?.response?.data || error);
    return '0';
  }
}

function getTrackUrl(track) {
  return `https://www.last.fm/music/${encodeURIComponent(track.artist['#text'])}/_/${encodeURIComponent(track.name)}`;
}


