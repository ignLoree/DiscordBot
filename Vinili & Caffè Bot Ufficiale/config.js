module.exports = {
  prefix: '+',
  status: "idle",
  logLevel: 'debug',
  eventListeners: 50,
  dev: "lXo",
  devBy: "| Developed by lXo",
  developers: "295500038401163264",
  staff: "1442568910070349985",
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
    bumpSuccessPatterns: ["has been successfully bumped", "successfully bumped", "bumped successfully"]
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
    apiUrl: "https://opentdb.com/api.php",
    tokenUrl: "https://opentdb.com/api_token.php?command=request",
    tokenUrlBase: "https://opentdb.com/api_token.php",
    translateApiUrl: "https://api.mymemory.translated.net/get",
    maxAttempts: 5
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
    intervalMs: 30 * 60 * 1000,
    activityWindowMs: 30 * 60 * 1000,
    minMessages: 3,
    failsafeMs: 90 * 60 * 1000,
    timeWindow: {
      start: { hour: 9, minute: 0 },
      end: { hour: 23, minute: 45 }
    },
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
      onlyFamous: true,
      famousNames: [
        "Kylian Mbappe",
        "Erling Haaland",
        "Jude Bellingham",
        "Vinicius Junior",
        "Robert Lewandowski",
        "Mohamed Salah",
        "Kevin De Bruyne",
        "Harry Kane",
        "Bukayo Saka",
        "Phil Foden",
        "Rodri",
        "Lautaro Martinez",
        "Victor Osimhen",
        "Nicolas Barella",
        "Pedri",
        "Antoine Griezmann",
        "Bruno Fernandes",
        "Son Heung-min",
        "Florian Wirtz",
        "Jamal Musiala"
      ],
      apiUrl: "https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=",
    },
    guessSong: {
      durationMs: 3 * 60 * 1000,
      rewardExp: 100,
      onlyFamous: true,
      apiUrl: "https://itunes.apple.com/search?term=",
      artistApiUrl: "https://musicbrainz.org/ws/2/artist/?query=artist=",
      deezerChartUrl: "https://api.deezer.com/chart/0/tracks?limit=100",
      popularTerms: [
        "the weeknd",
        "dua lipa",
        "ed sheeran",
        "drake",
        "ariana grande",
        "post malone",
        "taylor swift",
        "billie eilish",
        "maneskin",
        "elodie",
        "sfera ebbasta",
        "thasup",
        "bad bunny",
        "eminem",
        "coldplay"
      ],
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

  chatReminder: {
    channelId: "1442569130573303898",
    timeZone: "Europe/Rome",
    startHour: 9,
    endHour: 21,
    minGapMs: 30 * 60 * 1000,
    firstReminderMinMessages30m: 5,
    secondReminderMinMessages30m: 20
  },

  categoryNumbering: {
    enabled: true,
    debounceMs: 1200,
    intervalMs: 10 * 60 * 1000,
    minDigits: 2,
    separator: " "
  }
}
