module.exports = {
  prefix: '!',
  musicPrefix: '.',
  moderationPrefix: '?',
  status: "idle",
  logLevel: 'debug',
  eventListeners: 50,
  dev: "lXo",
  devBy: "| Developed by lXo",
  developers: "295500038401163264",
  partnerManager: "1442568905582317740",
  slashCommandLoggingChannel: "1442577274783142039",
  prefixCommandLoggingChannel: "1442577274783142039",
  commandErrorChannel: "1442577274783142039",
  noPermsMessage: `**Non hai** i permessi per fare questo comando!`,
  ownerOnlyCommand: `Questo comando è disponibile **solo** all'owner del bot!`,
  filterMessage: "Il tuo messaggio contiene una parola **blacklistata**!",
  botServerInvite: "https://discord.gg/viniliecaffe",

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
    hour: 8,
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

  minigames: {
    enabled: true,
    channelId: "1442569130573303898",
    roleId: "1443955529352478830",
    intervalMs: 15 * 60 * 1000,
    guessNumber: {
      min: 1,
      max: 100,
      durationMs: 3 * 60 * 1000,
      rewardExp: 100
    },
    guessWord: {
      durationMs: 3 * 60 * 1000,
      rewardExp: 150,
      apiUrl: "https://cdn.jsdelivr.net/npm/italian-words-dict@3.4.0/dist/words.json",
    },
    guessFlag: {
      durationMs: 3 * 60 * 1000,
      rewardExp: 100,
      apiUrl: "https://restcountries.com/v3.1/all?fields=name,translations,flags,altSpellings",
    },
    guessPlayer: {
      durationMs: 3 * 60 * 1000,
      rewardExp: 150,
      apiUrl: "https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=",
    },
    guessSong: {
      durationMs: 3 * 60 * 1000,
      rewardExp: 100,
      apiUrl: "https://itunes.apple.com/search?term=",
      artistApiUrl: "https://musicbrainz.org/ws/2/artist/?query=artist=",
      popularFeeds: [
        "https://itunes.apple.com/it/rss/topsongs/limit=100/json",
        "https://itunes.apple.com/us/rss/topsongs/limit=100/json"
      ]
    },
    findBot: {
      durationMs: 5 * 60 * 1000,
      rewardExp: 100,
      requiredRoleId: "1442568949605597264"
    }
  },
}
