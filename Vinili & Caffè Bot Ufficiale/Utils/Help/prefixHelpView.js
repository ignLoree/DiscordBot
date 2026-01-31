const { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");

const TRACKS_DETAILS = {
  fm: {
    description: "Shows you or someone else's current track",
    options: ["@user mention / lfm:username"],
    examples: [".fm", ".fm @user", ".fm lfm:username"]
  },
  recent: {
    description: "Shows you or someone else's recent tracks",
    options: ["@user mention / lfm:username", "Artist name"],
    examples: [".recent", ".recent Marracash", ".recent @user"]
  },
  track: {
    description: "Track you're currently listening to or searching for",
    options: ["Track name", "Artist - Track"],
    examples: [".track", ".track Ninna Nanna - Ghali"]
  },
  trackplays: {
    description: "Shows playcount for current track or the one you're searching for",
    options: ["Track name", "Artist - Track"],
    examples: [".trackplays", ".trackplays Ninna Nanna - Ghali"]
  },
  trackdetails: {
    description: "Shows metadata for current track or the one you're searching for",
    options: ["Track name", "Artist - Track"],
    examples: [".trackdetails", ".trackdetails Ninna Nanna - Ghali"]
  },
  toptracks: {
    description: "Shows you or someone else's top tracks over a certain time period",
    options: ["@user mention / lfm:username", "7d / 30d / 3month / 6month / 12month / overall"],
    examples: [".toptracks", ".toptracks 30d", ".toptracks @user 7d"]
  },
  receipt: {
    description: "Shows your track receipt. Based on Receiptify",
    options: ["@user mention / lfm:username"],
    examples: [".receipt", ".receipt @user"]
  },
  servertracks: {
    description: "Top tracks for your server, optionally for an artist",
    options: ["Artist name (optional)"],
    examples: [".servertracks", ".servertracks Queen"]
  },
  whoknowstrack: {
    description: "Shows what other users listen to a track in your server",
    options: ["Track name", "Artist - Track", "img / image (optional)"],
    examples: [".wt 30èC", ".wt 30èC img", ".whoknowstrack Ninna Nanna - Ghali"]
  },
  globalwhoknowstrack: {
    description: "Shows what other users listen to a track globally",
    options: ["Track name", "Artist - Track", "img / image (optional)"],
    examples: [".gwt 30èC", ".gwt 30èC img", ".globalwhoknowstrack Ninna Nanna - Ghali"]
  },
  overview: {
    description: "Shows a daily overview",
    options: ["@user mention / lfm:username"],
    examples: [".overview", ".overview @user"]
  },
  year: {
    description: "Shows an overview of your year",
    options: ["@user mention / lfm:username"],
    examples: [".year", ".year @user"]
  },
  recap: {
    description: "A recap to easily view multiple Vinili & Caffè Bot commands into one",
    options: ["@user mention / lfm:username"],
    examples: [".recap", ".recap @user"]
  },
  streak: {
    description: "Shows you or someone else's streak",
    options: ["@user mention / lfm:username"],
    examples: [".streak", ".streak @user"]
  },
  streaks: {
    description: "Shows you your past streaks",
    options: ["Artist name (optional)"],
    examples: [".streaks", ".streaks TonyPitony"]
  }
};
const ALBUMS_DETAILS = {
  album: {
    description: "Shows album you're currently listening to or searching for",
    options: ["Album name", "Artist - Album"],
    examples: [".album", ".album TUTTO è POSSIBILE - Geolier"]
  },
  albumplays: {
    description: "Shows playcount for current album or the one you're searching for",
    options: ["Album name", "Artist - Album", "@user mention / lfm:username (optional)"],
    examples: [".albumplays", ".albumplays TUTTO è POSSIBILE - Geolier"]
  },
  cover: {
    description: "Cover for current album or the one you're searching for",
    options: ["Album name", "Artist - Album"],
    examples: [".cover", ".cover TUTTO è POSSIBILE - Geolier"]
  },
  topalbums: {
    description: "Shows your or someone else's top albums over a certain time period",
    options: ["@user mention / lfm:username", "7d / 30d / 3month / 6month / 12month / overall"],
    examples: [".topalbums", ".topalbums 30d", ".topalbums @user 7d"]
  },
  whoknowsalbum: {
    description: "Shows what other users listen to an album in your server",
    options: ["Album name", "Artist - Album", "img / image (optional)"],
    examples: [".wa TUTTO è POSSIBILE - Geolier", ".wa TUTTO è POSSIBILE - Geolier img"]
  },
  globalwhoknowsalbum: {
    description: "Shows what other users listen to an album globally",
    options: ["Album name", "Artist - Album", "img / image (optional)"],
    examples: [".gwa TUTTO è POSSIBILE - Geolier", ".gwa TUTTO è POSSIBILE - Geolier img"]
  },
  albumtracks: {
    description: "Shows track playcounts for a specific album",
    options: ["Album name", "Artist - Album"],
    examples: [".albumtracks TUTTO è POSSIBILE - Geolier"]
  },
  serveralbums: {
    description: "Top albums for your server, optionally for a specific artist",
    options: ["Artist name (optional)"],
    examples: [".serveralbums", ".serveralbums Marracash"]
  },
  chart: {
    description: "Generates an album image chart",
    options: [
      "weekly/monthly/quarterly/half/yearly/alltime",
      "Albums released in year: r:2023, released:2023",
      "Albums released in decade: d:80s, decade:1990",
      "Disable titles: notitles / nt",
      "Skip albums with no image: skipemptyimages / s",
      "Skip NSFW albums: sfw",
      "Size: WidthxHeight - 2x2, 3x3, 4x5, 20x4 up to 100 total images",
      "@usermention / lfm:fm-bot / 356268235697553409"
    ],
    examples: [
      ".c",
      ".c q 8x8 nt s",
      ".chart 8x8 quarterly notitles skip",
      ".c 10x10 alltime notitles skip",
      ".c @user 7x7 yearly",
      ".aoty 2023"
    ],
    aliasesHint: [
      ".c",
      ".aoty",
      ".albumsoftheyear",
      ".albomoftheyear",
      ".aotd",
      ".albumsofthedecade",
      ".albomofthedecade",
      ".topster",
      ".topsters"
    ]
  },
  overview: TRACKS_DETAILS.overview,
  year: TRACKS_DETAILS.year,
  recap: TRACKS_DETAILS.recap,
  streak: TRACKS_DETAILS.streak,
  streaks: TRACKS_DETAILS.streaks
};
const ARTISTS_DETAILS = {
  artist: {
    description: "Artist you're currently listening to or searching for",
    options: ["Artist name"],
    examples: [".artist", ".artist Geolier"]
  },
  artistoverview: {
    description: "Artist you're currently listening to or searching for",
    options: ["Artist name"],
    examples: [".artistoverview", ".artistoverview Geolier"]
  },
  artisttracks: {
    description: "Top tracks for an artist",
    options: ["Artist name"],
    examples: [".artisttracks Geolier"]
  },
  artistalbums: {
    description: "Top albums for an artist",
    options: ["Artist name"],
    examples: [".artistalbums Geolier"]
  },
  artistplays: {
    description: "Shows playcount for current artist or the one you're searching for",
    options: ["Artist name", "@user mention / lfm:username (optional)"],
    examples: [".artistplays", ".artistplays Geolier"]
  },
  artistpace: {
    description: "Shows estimated date you reach a certain amount of plays on an artist",
    options: ["Artist name", "Target plays (optional)"]
  },
  topartists: {
    description: "Shows your or someone else's top artists over a certain time period",
    options: ["@user mention / lfm:username", "7d / 30d / 3month / 6month / 12month / overall"],
    examples: [".topartists", ".topartists 30d", ".topartists @user 7d"]
  },
  taste: {
    description: "Compares your top artists, genres and countries to those from another user",
    options: ["weekly/monthly/quarterly/half/yearly/alltime", "@user mention / lfm:username", "Mode: table or embed", "extralarge / xl / extrasmall / xs"],
    examples: [".taste fm-bot", ".taste @user", ".taste @user monthly embed"]
  },
  whoknows: {
    description: "Shows what other users listen to an artist in your server",
    options: ["Artist name", "img / image (optional)"],
    examples: [".whoknows Geolier", ".whoknows Geolier img"]
  },
  globalwhoknows: {
    description: "Shows what other users listen to an artist globally",
    options: ["Artist name", "img / image (optional)"],
    examples: [".globalwhoknows Geolier", ".globalwhoknows Geolier img"]
  },
  serverartists: {
    description: "Top artists for your server",
    options: ["Artist name (optional)"],
    examples: [".serverartists", ".serverartists Geolier"]
  },
  affinity: {
    description: "Shows users from this server with similar top artists.",
    options: []
  },
  iceberg: {
    description: "Shows your iceberg, based on artists popularity.",
    options: ["weekly/monthly/quarterly/half/yearly/alltime", "@user mention / lfm:username"],
    examples: [".iceberg", ".iceberg 2024", ".iceberg alltime"]
  },
  artistchart: {
    description: "Generates an artist image chart.",
    options: ["weekly/monthly/quarterly/half/yearly/alltime", "Disable titles: notitles / nt", "Skip artists without image: skip / s", "Size: WidthxHeight - 2x2, 3x3, 4x5, 20x4 up to 100 total images", "@user mention / lfm:username"],
    examples: [".artistchart", ".artistchart 4x4 monthly", ".artistchart skip 3x3"]
  },
  overview: TRACKS_DETAILS.overview,
  year: TRACKS_DETAILS.year,
  recap: TRACKS_DETAILS.recap,
  streak: TRACKS_DETAILS.streak,
  streaks: TRACKS_DETAILS.streaks
};
const GENRES_DETAILS = {
  topcountries: {
    description: "Shows a list of your or someone else's top artist countries over a certain time period",
    options: ["@user mention / lfm:username", "7d / 30d / 3month / 6month / 12month / overall"],
    examples: [".topcountries", ".topcountries 30d", ".topcountries @user 7d"]
  },
  topgenres: {
    description: "Shows a list of your or someone else's top genres over a certain time period",
    options: ["@user mention / lfm:username", "7d / 30d / 3month / 6month / 12month / overall"],
    examples: [".topgenres", ".topgenres 30d", ".topgenres @user 7d"]
  },
  genre: {
    description: "Shows genre information for an artist, or top artist for a specific genre",
    options: ["Genre name", "Artist name"],
    examples: [".genre italian trap", ".genre Geolier"]
  },
  whoknowsgenre: {
    description: "Shows what other users listen to a genre in your server",
    options: ["Genre name", "img / image (optional)"],
    examples: [".whoknowsgenre italian trap", ".whoknowsgenre italian trap img"]
  },
  servergenres: {
    description: "Top genres for your server",
    options: [],
    examples: [".servergenres"]
  }
};

const CHARTS_DETAILS = {
  chart: {
    description: "Generates an album image chart.",
    options: [
      "weekly/monthly/quarterly/half/yearly/alltime",
      "Albums released in year: r:2023, released:2023",
      "Albums released in decade: d:80s, decade:1990",
      "Disable titles: notitles / nt",
      "Skip albums with no image: skipemptyimages / s",
      "Skip NSFW albums: sfw",
      "Size: WidthxHeight - 2x2, 3x3, 4x5, 20x4 up to 100 total images",
      "@usermention / lfm:fm-bot / 356268235697553409"
    ],
    examples: [
      ".c",
      ".c q 8x8 nt s",
      ".chart 8x8 quarterly notitles skip",
      ".c 10x10 alltime notitles skip",
      ".c @user 7x7 yearly",
      ".aoty 2023"
    ],
    aliasesHint: [
      ".c",
      ".aoty",
      ".albumsoftheyear",
      ".albomoftheyear",
      ".aotd",
      ".albumsofthedecade",
      ".albomofthedecade",
      ".topster",
      ".topsters"
    ]
  }
};

const TRACKS_ORDER = [
  "fm",
  "recent",
  "track",
  "trackplays",
  "trackdetails",
  "toptracks",
  "receipt",
  "servertracks",
  "whoknowstrack",
  "globalwhoknowstrack",
  "overview",
  "year",
  "recap",
  "streak",
  "streaks"
];
const ALBUMS_ORDER = [
  "album",
  "albumplays",
  "cover",
  "topalbums",
  "whoknowsalbum",
  "globalwhoknowsalbum",
  "albumtracks",
  "serveralbums",
  "chart",
  "overview",
  "year",
  "recap",
  "streak",
  "streaks"
];
const ARTISTS_ORDER = [
  "artist",
  "artistoverview",
  "artisttracks",
  "artistalbums",
  "artistplays",
  "artistpace",
  "topartists",
  "discoveries",
  "taste",
  "whoknows",
  "globalwhoknows",
  "friendwhoknows",
  "serverartists",
  "affinity",
  "iceberg",
  "artistgaps",
  "artistchart",
  "friendwhoknowsgenre",
  "overview",
  "year",
  "recap",
  "streak",
  "streaks"
];
const GENRES_ORDER = [
  "topcountries",
  "topgenres",
  "genre",
  "whoknowsgenre",
  "servergenres"
];

const STATIC_SECTIONS = [
  { key: "general", label: "General", description: null },
  { key: "tracks", label: "Tracks", description: "Info, WhoKnows, servertracks, toptracks" },
  { key: "albums", label: "Albums", description: "Info, WhoKnows, cover, serveralbums, topalbums" },
  { key: "artists", label: "Artists", description: "Info, WhoKnows, tracks, albums, serverartists, topartists" },
  { key: "whoknows", label: "WhoKnows", description: "Server, settings" },
  { key: "genres", label: "Genres", description: "Info, WhoKnows, topgenres" },
  { key: "charts", label: "Charts", description: "Image charts" },
  { key: "crowns", label: "Crowns", description: "Crowns commands and crown management" },
  { key: "thirdparty", label: "ThirdParty", description: "Spotify, Discogs, Youtube, Apple Music and Genius" },
  { key: "importing", label: "Importing", description: "Importing Spotify or Apple Music history" },
  { key: "usersettings", label: "UserSettings", description: "Configure your user settings" },
  { key: "serversettings", label: "ServerSettings", description: "Configure your server settings" },
  { key: "other", label: "Other", description: "Other commands" }
];

function findStaticSection(value) {
  if (!value) return null;
  return STATIC_SECTIONS.find(section => section.key === value) || null;
}

function buildOverviewEmbed({ color, prefixes, lastFmUsername }) {
  const lines = [
    `**Main command** \`${prefixes.music}fm\``,
    "*Displays last scrobbles, and looks different depending on the mode you've set.*",
    "",
    "**Customizing Vinili & Caffè Bot**",
    "- User settings: `.settings`",
    "- Server config: `.configuration`",
    "",
    "**Commands**",
    "- Use the dropdown below this message to pick a category",
  ];
  const footerText = lastFmUsername
    ? `Logged in to Vinili & Caffè Bot with the Last.fm account ${lastFmUsername}`
    : null;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("Vinili & Caffè Bot help & command overview")
    .setDescription(lines.join("\n"));
  if (footerText) {
    embed.setFooter({ text: footerText });
  }
  return embed;
}

function buildTracksOverviewEmbed({ color, prefixes, commandAliases }) {
  const prefix = prefixes?.music || ".";
  const lines = [
    "**Overview of all Tracks commands**",
    "",
    "**Commands:**",
    ...TRACKS_ORDER.map(key => {
      const detail = TRACKS_DETAILS[key];
      if (!detail) return null;
      const firstAlias = Array.isArray(commandAliases?.[key]) ? commandAliases[key][0] : null;
      const aliasText = firstAlias ? " - `" + prefix + firstAlias + "`" : "";
      return `${prefix}${key}${aliasText} | *${detail.description}*`;
    }).filter(Boolean)
  ];
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("Vinili & Caffè Bot help & command overview")
    .setDescription(lines.join("\n"));
}
function buildAlbumsOverviewEmbed({ color, prefixes, commandAliases }) {
  const prefix = prefixes?.music || ".";
  const lines = [
    "**Overview of all Albums commands**",
    "",
    "**Commands:**",
    ...ALBUMS_ORDER.map(key => {
      const detail = ALBUMS_DETAILS[key];
      if (!detail) return null;
      const firstAlias = Array.isArray(commandAliases?.[key]) ? commandAliases[key][0] : null;
      const aliasText = firstAlias ? " - `" + prefix + firstAlias + "`" : "";
      return `${prefix}${key}${aliasText} | *${detail.description}*`;
    }).filter(Boolean)
  ];
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("Vinili & Caffè Bot help & command overview")
    .setDescription(lines.join("\n"));
}
function buildArtistsOverviewEmbed({ color, prefixes, commandAliases }) {
  const prefix = prefixes?.music || ".";
  const lines = [
    "**Overview of all Artists commands**",
    "",
    "**Commands:**",
    ...ARTISTS_ORDER.map(key => {
      const detail = ARTISTS_DETAILS[key];
      if (!detail) return null;
      const firstAlias = Array.isArray(commandAliases?.[key]) ? commandAliases[key][0] : null;
      const aliasText = firstAlias ? " - `" + prefix + firstAlias + "`" : "";
      return `${prefix}${key}${aliasText} | *${detail.description}*`;
    }).filter(Boolean)
  ];
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("Vinili & Caffè Bot help & command overview")
    .setDescription(lines.join("\n"));
}
function buildGenresOverviewEmbed({ color, prefixes, commandAliases }) {
  const prefix = prefixes?.music || ".";
  const lines = [
    "**Overview of all Genres commands**",
    "",
    "**Commands:**",
    ...GENRES_ORDER.map(key => {
      const detail = GENRES_DETAILS[key];
      if (!detail) return null;
      const firstAlias = Array.isArray(commandAliases?.[key]) ? commandAliases[key][0] : null;
      const aliasText = firstAlias ? " - `" + prefix + firstAlias + "`" : "";
      return `${prefix}${key}${aliasText} | *${detail.description}*`;
    }).filter(Boolean)
  ];
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("Vinili & Caffè Bot help & command overview")
    .setDescription(lines.join("\n"));
}
function buildTrackCommandEmbed({ commandKey, detail, aliases, color, displayName, prefix }) {
  const lines = [];
  if (detail?.description) {
    lines.push(detail.description);
  }
  if (detail?.options && detail.options.length) {
    lines.push("", "**Options**");
    detail.options.forEach(option => {
      lines.push(`- \`${option}\``);
    });
  }
  if (detail?.examples && detail.examples.length) {
    lines.push("", "**Examples**");
    detail.examples.forEach(example => {
      lines.push(`\`${example}\``);
    });
  }
  if (aliases && aliases.length) {
    const aliasText = aliases.map(alias => `\`${prefix}${alias}\``).join(", ");
    lines.push("", "**Aliases**", aliasText);
  }
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`Information about '${prefix}${commandKey}' for ${displayName}`)
    .setDescription(lines.join("\n"));
}

function buildStaticSectionEmbed({ section, color, prefixes, commandAliases, displayName }) {
  if (section?.key === "tracks") {
    return buildTracksOverviewEmbed({ color, prefixes, commandAliases });
  }
  if (section?.key === "albums") {
    return buildAlbumsOverviewEmbed({ color, prefixes, commandAliases });
  }
  if (section?.key === "artists") {
    return buildArtistsOverviewEmbed({ color, prefixes, commandAliases });
  }
  if (section?.key === "genres") {
    return buildGenresOverviewEmbed({ color, prefixes, commandAliases });
  }
  if (section?.key === "charts") {
    const prefix = prefixes?.music || ".";
    const detail = CHARTS_DETAILS.chart;
    const aliasesRaw = commandAliases?.chart || [];
    const aliases = ["chart", ...aliasesRaw.filter(Boolean)];
    return buildTrackCommandEmbed({
      commandKey: "chart",
      detail,
      aliases,
      color,
      displayName: displayName || "you",
      prefix
    });
  }
  const description = section?.description || "No details available.";
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(section.label)
    .setDescription(description);
}

function buildHelpComponents({ selectedValue, selectedLabel, userId }) {
  const staticOptions = STATIC_SECTIONS.map(section => ({
    label: section.label,
    value: section.key,
    default: section.key === selectedValue
  }));
  const placeholder = selectedLabel || "Select category";
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`prefix_help:${userId}`)
    .setPlaceholder(placeholder)
    .addOptions(staticOptions);
  return [new ActionRowBuilder().addComponents(menu)];
}

function buildTrackCommandComponents({ userId, selectedCommand }) {
  const options = TRACKS_ORDER.map(key => ({
    label: key,
    value: key,
    default: key === selectedCommand
  }));
  const placeholder = selectedCommand || "Select track command";
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`prefix_help_cmd:${userId}`)
    .setPlaceholder(placeholder)
    .addOptions(options);
  return [new ActionRowBuilder().addComponents(menu)];
}
function buildAlbumCommandComponents({ userId, selectedCommand }) {
  const options = ALBUMS_ORDER.map(key => ({
    label: key,
    value: key,
    default: key === selectedCommand
  }));
  const placeholder = selectedCommand || "Select album command";
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`prefix_help_album_cmd:${userId}`)
    .setPlaceholder(placeholder)
    .addOptions(options);
  return [new ActionRowBuilder().addComponents(menu)];
}
function buildArtistCommandComponents({ userId, selectedCommand }) {
  const options = ARTISTS_ORDER.map(key => ({
    label: key,
    value: key,
    default: key === selectedCommand
  }));
  const placeholder = selectedCommand || "Select artist command";
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`prefix_help_artist_cmd:${userId}`)
    .setPlaceholder(placeholder)
    .addOptions(options);
  return [new ActionRowBuilder().addComponents(menu)];
}
function buildGenreCommandComponents({ userId, selectedCommand }) {
  const options = GENRES_ORDER.map(key => ({
    label: key,
    value: key,
    default: key === selectedCommand
  }));
  const placeholder = selectedCommand || "Select genre command";
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`prefix_help_genre_cmd:${userId}`)
    .setPlaceholder(placeholder)
    .addOptions(options);
  return [new ActionRowBuilder().addComponents(menu)];
}

module.exports = {
  TRACKS_DETAILS,
  TRACKS_ORDER,
  ALBUMS_DETAILS,
  ALBUMS_ORDER,
  ARTISTS_DETAILS,
  ARTISTS_ORDER,
  GENRES_DETAILS,
  GENRES_ORDER,
  buildOverviewEmbed,
  buildTracksOverviewEmbed,
  buildAlbumsOverviewEmbed,
  buildArtistsOverviewEmbed,
  buildGenresOverviewEmbed,
  buildTrackCommandEmbed,
  buildStaticSectionEmbed,
  buildHelpComponents,
  buildTrackCommandComponents,
  buildAlbumCommandComponents,
  buildArtistCommandComponents,
  buildGenreCommandComponents,
  findStaticSection
};
