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
  partnerManager: "1442568905582317740",
  slashCommandLoggingChannel: "1442577274783142039",
  prefixCommandLoggingChannel: "1442577274783142039",
  commandErrorChannel: "1442577274783142039",
  gamblingLogChannelId: "1442577274783142039",
  noPermsMessage: `**Non hai** i permessi per fare questo comando!`,
  ownerOnlyCommand: `Questo comando è disponibile **solo** all'owner del bot!`,
  filterMessage: "Il tuo messaggio contiene una parola **blacklistata**!",
  botServerInvite: "https://discord.gg/viniliecaffe",

  poketwo: {
    hfToken: process.env.HF_TOKEN || "",
    botId: "716390085896962058",
    model: "skshmjn/Pokemon-classifier-gen9-1025",
    endpoint: "https://router.huggingface.co/hf-inference/models/skshmjn/Pokemon-classifier-gen9-1025",
    fallbackEndpoints: ["https://router.huggingface.co/hf-inference/models/skshmjn/Pokemon-classifier-gen9-1025"],
    dedicatedEndpointUrl: "https://jnwx6if5r8srk4zw.eu-west-1.aws.endpoints.huggingface.cloud",
    provider: "auto",
    spaceIds: ["gbryan/pokemon-classifier"]
  },

  debugSpotifyFeatures: true,
  gamblingCooldownMs: 4000,

  disboard: {
    botId: "302050872383242240",
    reminderChannelId: "1442569154950332536",
    cooldownMinutes: 120,
    bumpSuccessPatterns: ["Bump done", "Bump successful"]
  },
  discadia: {
    botId: "1222548162741538938",
    reminderChannelId: "1442569154950332536",
    cooldownMinutes: 1440,
    bumpSuccessPatterns: ["has been successfully bumped"]
  },
  discadiaVoteReminder: {
    enabled: true,
    cooldownHours: 24,
    checkIntervalMinutes: 30,
    message: "Ciao! Sono passate 24 ore, puoi votare di nuovo su Discadia: https://discadia.com/server/viniliecaffe/ Grazie per il supporto!"
  },

  morningReminder: {
    enabled: true,
    channelId: "1442569130573303898",
    roleId: "1442569009567629375",
    hour: 9,
    minute: 0,
    questionsFile: "Data/morningQuestions.json"
  },

  tts: {
    enabled: true,
    extraTextChannelIds: ["1442569187376763010"],
    lang: "it",
    maxChars: 1000,
    autojoin: true,
    includeUsername: false,
    stayConnected: false
  },

  render: {
    whoknowsImageCache: 250
  },
}
