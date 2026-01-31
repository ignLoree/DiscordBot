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
  passCompleteChannelId: "1442569130573303898",
  passCompleteRoleId: "1460051416482582628",
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
    provider: "hf-inference",
    spaceIds: []
  },

  debugSpotifyFeatures: true,
  gamblingCooldownMs: 4000,

  disboard: {
    botId: "302050872383242240",
    reminderChannelId: "1442569154950332536",
    cooldownMinutes: 120,
    bumpSuccessPatterns: ["Bump done", "Bump successful"]
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

  engagement: {
    channelId: "1442569130573303898",
    roleId: "1443955529352478830",
    startHour: 8,
    endHour: 24,
    intervalMinutes: 30,
    minMessageLen: 20,
    maxMessageLen: 200,
    recentWindowMinutes: 30,
    minRecentMessages: 5,
    rewards: {
      quiz: { coffee: 2, vinyl: 1 },
      scramble: { coffee: 2, vinyl: 1 },
      flag: { coffee: 3, vinyl: 1 },
      player: { coffee: 3, vinyl: 1 }
    }
  },
  engagementQuizLoop: {
    enabled: true,
    channelId: "1460292772404920503",
    intervalMinutes: 10,
    startHour: 0,
    endHour: 24,
    types: ["quiz", "scramble", "flag", "player"],
    rewards: { coffee: 1, vinyl: 0 }
  },

  pass: {
    energyMax: 6,
    energyRefillDaily: 6,
    chatRewardCooldownSec: 60,
    minMsgLen: 4,
    chatAllowedChannelIds: ["1442569130573303898", "1442569136067575809", "1442569138114662490", "1442569141717438495"],
    chatTicketCapPerDay: 10,
    voiceTicketCapPerDay: 10,
    voiceTicketEveryMin: 10,
    voiceAllowedChannelIds: ["1442569101225496819", "1442569106514645042", "1442569113108218058", "1442569114785943713", "1442569121350025306", "1442569125753913498", "1442569134532726855", "1442569140077461613", "1442569150575935781", "1442569152614367262", "1442569156695294078"],
    voiceMinMembers: 2,
    quizRewards: {
      easy: { tickets: 1, fragments: { common: 1 } },
      medium: { tickets: 2, fragments: { common: 2 } },
      hard: { tickets: 3, fragments: { rare: 1 } }
    },
    minigameRewards: {
      easy: { tickets: 1, fragments: { common: 1 } },
      medium: { tickets: 2, fragments: { common: 2 } },
      hard: { tickets: 3, fragments: { rare: 1 } }
    },
    eventRewards: { tickets: 2, fragments: { common: 2 } },
    midseasonRewards: { tickets: 3, fragments: { rare: 1 } },
    quizExternal: {
      enabled: true,
      provider: "opentdb",
      endpoint: "https://opentdb.com/api.php",
      category: null
    },
    raidActionEnergyCost: 1
  },

  render: {
    whoknowsImageCache: 250
  },
}

