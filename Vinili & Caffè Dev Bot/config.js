module.exports = {
  prefix: '!',
  musicPrefix: '.',
  moderationPrefix: '?',
  status: "idle",
  logLevel: 'debug',
  eventListeners: 50,
  dev: "lXo",
  devBy: "| Developed by lXo",
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || "",
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
  developers: "295500038401163264",
  slashCommandLoggingChannel: "1466489404867481802",
  prefixCommandLoggingChannel: "1466489404867481802",
  commandErrorChannel: "1466489404867481802",
  noPermsMessage: `**Non hai** i permessi per fare questo comando!`,
  ownerOnlyCommand: `Questo comando è disponibile **solo** all'owner del bot!`,
  filterMessage: "Il tuo messaggio contiene una parola **blacklistata**!",
  botServerInvite: "https://discord.gg/viniliecaffe",
  debugSpotifyFeatures: true,

  render: {
    whoknowsImageCache: 250
  },
}