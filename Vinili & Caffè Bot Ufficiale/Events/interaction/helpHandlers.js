const { TRACKS_DETAILS, TRACKS_ORDER, ALBUMS_DETAILS, ALBUMS_ORDER, ARTISTS_DETAILS, ARTISTS_ORDER, GENRES_DETAILS, GENRES_ORDER, buildOverviewEmbed, buildTracksOverviewEmbed, buildAlbumsOverviewEmbed, buildArtistsOverviewEmbed, buildGenresOverviewEmbed, buildTrackCommandEmbed, buildHelpComponents, buildTrackCommandComponents, buildAlbumCommandComponents, buildArtistCommandComponents, buildGenreCommandComponents, buildStaticSectionEmbed, findStaticSection } = require("../../Utils/Help/prefixHelpView");

function isSnowflake(value) {
  return typeof value === "string" && /^\d{5,}$/.test(value);
}

function buildCommandAliases(client) {
  const commandAliases = {};
  for (const command of client.pcommands.values()) {
    if (!command?.name || String(command.folder || "").toLowerCase() !== "music") continue;
    commandAliases[command.name] = Array.isArray(command.aliases) ? command.aliases : [];
  }
  return commandAliases;
}

async function handleHelpMenu(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  const isCategoryMenu = interaction.customId.startsWith("prefix_help:");
  const isCommandMenu = interaction.customId.startsWith("prefix_help_cmd:");
  const isAlbumCommandMenu = interaction.customId.startsWith("prefix_help_album_cmd:");
  const isArtistCommandMenu = interaction.customId.startsWith("prefix_help_artist_cmd:");
  const isGenreCommandMenu = interaction.customId.startsWith("prefix_help_genre_cmd:");
  if (!isCategoryMenu && !isCommandMenu && !isAlbumCommandMenu && !isArtistCommandMenu && !isGenreCommandMenu) return false;

  const targetUserId = interaction.customId.split(":")[1];
  if (isSnowflake(targetUserId) && interaction.user.id !== targetUserId) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Solo chi ha usato il comando può usare questo menù.",
      flags: 1 << 6
    });
    return true;
  }

  const stateMap = interaction.client.prefixHelpStates || new Map();
  interaction.client.prefixHelpStates = stateMap;
  let state = stateMap.get(interaction.message.id);
  if (!state) {
    const config2 = interaction.client?.config2 || {};
    const prefixes = { music: config2.musicPrefix || "." };
    const color = config2.embedColor || "#6f4e37";
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const displayName = member?.displayName || interaction.user.username;
    state = {
      userId: interaction.user.id,
      displayName,
      prefixes,
      color,
      lastFmUsername: null,
      commandAliases: buildCommandAliases(interaction.client),
      selectedTrackCommand: null,
      selectedAlbumCommand: null,
      selectedArtistCommand: null,
      selectedGenreCommand: null,
      selectedCategory: "general",
      expiresAt: Date.now() + 30 * 60 * 1000
    };
    stateMap.set(interaction.message.id, state);
  }
  if (state.expiresAt && Date.now() > state.expiresAt) {
    stateMap.delete(interaction.message.id);
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Questo menù e' scaduto.",
      flags: 1 << 6
    });
    return true;
  }

  let selectedCategory = state.selectedCategory || "general";
  let selectedCommand = state.selectedTrackCommand || null;

  if (isCategoryMenu) {
    selectedCategory = interaction.values?.[0] || "general";
    state.selectedCategory = selectedCategory;
    if (selectedCategory !== "tracks") {
      state.selectedTrackCommand = null;
      selectedCommand = null;
    }
    if (selectedCategory !== "albums") {
      state.selectedAlbumCommand = null;
    }
    if (selectedCategory !== "artists") {
      state.selectedArtistCommand = null;
    }
    if (selectedCategory !== "genres") {
      state.selectedGenreCommand = null;
    }
  } else if (isCommandMenu) {
    selectedCommand = interaction.values?.[0] || null;
    state.selectedTrackCommand = selectedCommand;
    selectedCategory = "tracks";
  } else if (isAlbumCommandMenu) {
    const selectedAlbum = interaction.values?.[0] || null;
    state.selectedAlbumCommand = selectedAlbum;
    selectedCategory = "albums";
  } else if (isArtistCommandMenu) {
    const selectedArtist = interaction.values?.[0] || null;
    state.selectedArtistCommand = selectedArtist;
    selectedCategory = "artists";
  } else if (isGenreCommandMenu) {
    const selectedGenre = interaction.values?.[0] || null;
    state.selectedGenreCommand = selectedGenre;
    selectedCategory = "genres";
  }

  let embed;
  let selectedLabel = "General";
  if (selectedCategory === "tracks") {
    if (selectedCommand && TRACKS_DETAILS[selectedCommand]) {
      const aliasesRaw = state.commandAliases?.[selectedCommand] || [];
      const aliases = [selectedCommand, ...aliasesRaw.filter(Boolean)];
      embed = buildTrackCommandEmbed({
        commandKey: selectedCommand,
        detail: TRACKS_DETAILS[selectedCommand],
        aliases,
        color: state.color,
        displayName: state.displayName,
        prefix: state.prefixes.music || "."
      });
    } else {
      embed = buildTracksOverviewEmbed({ color: state.color, prefixes: state.prefixes, commandAliases: state.commandAliases });
    }
    selectedLabel = "Tracks";
  } else if (selectedCategory === "albums") {
    const selectedAlbum = state.selectedAlbumCommand || null;
    if (selectedAlbum && ALBUMS_DETAILS[selectedAlbum]) {
      const aliasesRaw = state.commandAliases?.[selectedAlbum] || [];
      const aliases = [selectedAlbum, ...aliasesRaw.filter(Boolean)];
      embed = buildTrackCommandEmbed({
        commandKey: selectedAlbum,
        detail: ALBUMS_DETAILS[selectedAlbum],
        aliases,
        color: state.color,
        displayName: state.displayName,
        prefix: state.prefixes.music || "."
      });
    } else {
      embed = buildAlbumsOverviewEmbed({ color: state.color, prefixes: state.prefixes, commandAliases: state.commandAliases });
    }
    selectedLabel = "Albums";
  } else if (selectedCategory === "artists") {
    const selectedArtist = state.selectedArtistCommand || null;
    if (selectedArtist && ARTISTS_DETAILS[selectedArtist]) {
      const aliasesRaw = state.commandAliases?.[selectedArtist] || [];
      const aliases = [selectedArtist, ...aliasesRaw.filter(Boolean)];
      embed = buildTrackCommandEmbed({
        commandKey: selectedArtist,
        detail: ARTISTS_DETAILS[selectedArtist],
        aliases,
        color: state.color,
        displayName: state.displayName,
        prefix: state.prefixes.music || "."
      });
    } else {
      embed = buildArtistsOverviewEmbed({ color: state.color, prefixes: state.prefixes, commandAliases: state.commandAliases });
    }
    selectedLabel = "Artists";
  } else if (selectedCategory === "genres") {
    const selectedGenre = state.selectedGenreCommand || null;
    if (selectedGenre && GENRES_DETAILS[selectedGenre]) {
      const aliasesRaw = state.commandAliases?.[selectedGenre] || [];
      const aliases = [selectedGenre, ...aliasesRaw.filter(Boolean)];
      embed = buildTrackCommandEmbed({
        commandKey: selectedGenre,
        detail: GENRES_DETAILS[selectedGenre],
        aliases,
        color: state.color,
        displayName: state.displayName,
        prefix: state.prefixes.music || "."
      });
    } else {
      embed = buildGenresOverviewEmbed({ color: state.color, prefixes: state.prefixes, commandAliases: state.commandAliases });
    }
    selectedLabel = "Genres";
  } else {
    if (selectedCategory === "general") {
      embed = buildOverviewEmbed({
        color: state.color,
        prefixes: state.prefixes,
        lastFmUsername: state.lastFmUsername
      });
      selectedLabel = "General";
    } else {
      const staticSection = findStaticSection(selectedCategory);
      if (staticSection) {
        selectedLabel = staticSection.label;
        embed = buildStaticSectionEmbed({ section: staticSection, color: state.color, prefixes: state.prefixes, commandAliases: state.commandAliases, displayName: state.displayName });
      } else {
        embed = buildOverviewEmbed({
          color: state.color,
          prefixes: state.prefixes,
          lastFmUsername: state.lastFmUsername
        });
      }
    }
  }

  if (!embed) {
    embed = buildOverviewEmbed({
      color: state.color,
      prefixes: state.prefixes,
      lastFmUsername: state.lastFmUsername
    });
  }

  const rows = buildHelpComponents({
    selectedValue: selectedCategory,
    selectedLabel,
    userId: state.userId
  });
  if (selectedCategory === "tracks") {
    const trackRows = buildTrackCommandComponents({
      userId: state.userId,
      selectedCommand
    });
    rows.push(...trackRows);
  }
  if (selectedCategory === "albums") {
    const albumRows = buildAlbumCommandComponents({
      userId: state.userId,
      selectedCommand: state.selectedAlbumCommand || null
    });
    rows.push(...albumRows);
  }
  if (selectedCategory === "artists") {
    const artistRows = buildArtistCommandComponents({
      userId: state.userId,
      selectedCommand: state.selectedArtistCommand || null
    });
    rows.push(...artistRows);
  }
  if (selectedCategory === "genres") {
    const genreRows = buildGenreCommandComponents({
      userId: state.userId,
      selectedCommand: state.selectedGenreCommand || null
    });
    rows.push(...genreRows);
  }

  await interaction.update({ embeds: [embed], components: rows });
  state.expiresAt = Date.now() + 30 * 60 * 1000;
  return true;
}

module.exports = { handleHelpMenu };
