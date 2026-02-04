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
  partnerManager: "1466489065804398724",
  slashCommandLoggingChannel: "1466489404867481802",
  prefixCommandLoggingChannel: "1466489404867481802",
  commandErrorChannel: "1466489404867481802",
  gamblingLogChannelId: "1466489404867481802",
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
    reminderChannelId: "1466489313091916043",
    cooldownMinutes: 120,
    bumpSuccessPatterns: ["Bump done", "Bump successful"]
  },
  discadia: {
    botId: "1222548162741538938",
    reminderChannelId: "1466489313091916043",
    cooldownMinutes: 1440,
    bumpSuccessPatterns: ["has been successfully bumped"]
  },
  discadiaVoteReminder: {
    enabled: true,
    cooldownHours: 24,
    checkIntervalMinutes: 30,
    message: "Ciao! Sono passate 24 ore, puoi votare di nuovo su [Discadia](<https://discadia.com/server/viniliecaffe/>) e ottenere XP! Grazie per il supporto!"
  },

  morningReminder: {
    enabled: true,
    channelId: "1466489288907554817",
    roleId: "1466489174797324551",
    hour: 9,
    minute: 0,
    questionsFile: "Data/morningQuestions.json"
  },

  tts: {
    enabled: true,
    extraTextChannelIds: ["1466489330498535484"],
    lang: "it",
    maxChars: 1000,
    autojoin: true,
    includeUsername: false,
    stayConnected: false
  },

  render: {
    whoknowsImageCache: 250
  },

  artRift: {
    enabled: true,
    channelId: "1466489325440204975",
    spawnEveryMessages: 25,
    spawnCooldownMs: 1000 * 60 * 3,
    spawnExpireMinutes: 20,
    catchEmoji: "🎴",
    rollCommand: "artroll",
    rollAliases: ["rollart", "roll"],
    rollLimitPerDay: 10,
    claimCooldownHours: 3,
    source: {
      provider: "waifu-im",
      tags: [
        "waifu",
        "neko",
        "maid",
        "uniform",
        "street",
        "magic",
        "fantasy",
        "dark",
        "sci-fi",
        "cyberpunk",
        "retro",
        "goth",
        "vintage",
        "samurai",
        "mecha",
        "sport",
        "school"
      ],
      nsfw: false
    },
    rarityWeights: {
      common: 70,
      rare: 20,
      epic: 8,
      legendary: 2
    }
  },
}
