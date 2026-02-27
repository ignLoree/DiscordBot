const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const {
  playRequest,
  touchMusicOutputChannel,
  searchPlayable,
} = require("../../Services/Music/musicService");
const { pickFromPagedMenu } = require("../../Services/Music/pagedPickerService");

const SOURCE_EMOJIS = {
  spotify: "<:VC_Spotify:1462941253803970571>",
  apple: "<:VC_AppleMusic:1466061111781752872>",
  youtube: "<:VC_YouTube:1476933074301485259>",
  soundcloud: "<:VC_SoundCloud:1476933157906419866>",
  deezer: "<:VC_Deezer:1476933250835288167>",
};

function formatDurationMs(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTrackSourceEmoji(track) {
  const source = String(track?.source || track?.queryType || "").toLowerCase();
  const url = String(track?.url || "").toLowerCase();

  if (source.includes("spotify") || /spotify\.com/.test(url)) {
    return SOURCE_EMOJIS.spotify;
  }
  if (source.includes("apple") || /music\.apple\.com|itunes\.apple\.com/.test(url)) {
    return SOURCE_EMOJIS.apple;
  }
  if (source.includes("soundcloud") || /soundcloud\.com/.test(url)) {
    return SOURCE_EMOJIS.soundcloud;
  }
  if (source.includes("deezer") || /deezer\.com/.test(url)) {
    return SOURCE_EMOJIS.deezer;
  }
  if (source.includes("youtube") || /youtu\.be|youtube\.com/.test(url)) {
    return SOURCE_EMOJIS.youtube;
  }

  return "";
}

function buildSessionInUseEmbed(channel) {
  return new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(
      `You already own a session in ${channel}, use the join command if you want it here instead!`,
    );
}

module.exports = {
  name: "play",
  aliases: ["p"],
  args: true,
  usage: "+play <link o ricerca>",
  examples: [
    "+play Tanti auguri a te",
    "+play https://open.spotify.com/track/...",
  ],
  async execute(message, args = []) {
    await message.channel.sendTyping();
    await touchMusicOutputChannel(message.client, message.guild?.id, message.channel).catch(() => {});

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      const notInVoiceEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription("You are not in a voice channel");
      return safeMessageReply(message, { embeds: [notInVoiceEmbed] });
    }

    const botVoiceChannel = message.guild?.members?.me?.voice?.channel || null;
    if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
      return safeMessageReply(message, {
        embeds: [buildSessionInUseEmbed(botVoiceChannel)],
      });
    }

    if (!voiceChannel.joinable || !voiceChannel.speakable) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Non ho i permessi per entrare/parlare in quel canale vocale.",
      );
    }

    const input = args.join(" ").trim();
    if (!input) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Uso corretto: `+play <link o nome canzone>`.",
      );
    }

    let finalInput = input;
    const search = await searchPlayable({
      client: message.client,
      input,
      requestedBy: message.member,
    }).catch((error) => ({ ok: false, reason: "internal_error", error }));

    if (!search?.ok) {
      if (search?.reason === "not_found") {
        const noResultsEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription("No results ⛔");
        return safeMessageReply(message, { embeds: [noResultsEmbed] });
      }
      global.logger?.error?.("[MUSIC] play search failed:", search?.error || search?.reason);
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Non riesco ad avviare la riproduzione ora. Riprova tra poco.",
      );
    }

    const searchTracks = Array.isArray(search.searchResult?.tracks)
      ? search.searchResult.tracks
      : [];
    if (!search.searchResult?.playlist && searchTracks.length > 1) {
      const picked = await pickFromPagedMenu({
        message,
        items: searchTracks.slice(0, 100),
        pageSize: 10,
        deleteOnSelect: true,
        lineBuilder: (item, index) =>
          `${index + 1}. **${item?.title || "Sconosciuto"}** by ${item?.author || "Unknown"}`,
        optionBuilder: (item, index) => ({
          label: `${index + 1}. ${String(item?.title || "Sconosciuto")}`.slice(0, 100),
          description: String(`by ${item?.author || "Unknown"}`).slice(0, 100),
        }),
      });
      if (!picked) return;
      finalInput = String(
        picked?.url || `${picked?.title || ""} ${picked?.author || ""}`.trim(),
      );
    }

    const result = await playRequest({
      client: message.client,
      guild: message.guild,
      channel: message.channel,
      voiceChannel,
      requestedBy: message.member,
      input: finalInput,
    }).catch((error) => ({ ok: false, reason: "internal_error", error }));

    if (!result?.ok) {
      if (result?.reason === "not_found") {
        const noResultsEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setDescription("No results ⛔");
        return safeMessageReply(message, { embeds: [noResultsEmbed] });
      }
      global.logger?.error?.("[MUSIC] play failed:", result?.error || result?.reason);
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Non riesco ad avviare la riproduzione ora. Riprova tra poco.",
      );
    }

    const track = result.track;
    const songLine = track?.url
      ? `[${track.title}](${track.url})`
      : String(track?.title || "Traccia sconosciuta");
    const artist = String(track?.author || "Sconosciuto");

    if (result.mode === "queued") {
      const queuePosition = Math.max(1, Number(result.queuePosition || 1));
      const queueTotalCount = Math.max(
        queuePosition,
        Number(result.queueTotalCount || queuePosition),
      );
      const etaText = formatDurationMs(result.etaMs);
      const lengthText =
        Number(track?.durationMS || 0) > 0
          ? formatDurationMs(track.durationMS)
          : String(track?.duration || "00:00");
      const requestedBy =
        message.member?.displayName ||
        message.author?.globalName ||
        message.author?.username ||
        "unknown";

      const queuedEmbed = new EmbedBuilder()
        .setColor("#1f2328")
        .setTitle("🌈 Added Track")
        .setDescription(
          [
            "**Track**",
            `${songLine} by **${artist}**`,
          ].join("\n"),
        )
        .setThumbnail(track?.thumbnail || null)
        .addFields(
          {
            name: "Estimated time until played",
            value: etaText,
            inline: true,
          },
          {
            name: "Track Length",
            value: lengthText,
            inline: true,
          },
          {
            name: "Position in upcoming",
            value: String(queuePosition),
            inline: true,
          },
          {
            name: "Position in queue",
            value: String(queueTotalCount),
            inline: true,
          },
          {
            name: "\u200b",
            value: `Requested by ${requestedBy}`,
            inline: false,
          },
        );

      return safeMessageReply(message, { embeds: [queuedEmbed] });
    }

    const suffix = result.playlist
      ? `\nPlaylist: **${result.playlist.title}** (${result.playlist.tracks.length} tracce)`
      : "";
    const via = result.translated ? "\nFonte link convertita in ricerca compatibile." : "";
    const sourceEmoji = getTrackSourceEmoji(track);
    const embed = new EmbedBuilder()
      .setColor("#1f2328")
      .setDescription(`${sourceEmoji ? `${sourceEmoji} ` : ""}Started playing ${songLine} by **${artist}**${suffix}${via}`);

    return safeMessageReply(message, { embeds: [embed] });
  },
};
