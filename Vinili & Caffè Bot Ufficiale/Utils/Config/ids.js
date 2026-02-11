const catalog = require('./idsCatalog');

const maps = catalog.maps || {};
const multi = catalog.multi || {};
const meta = catalog.meta || {};

function getAt(group, name, index) {
  const list = multi?.[group]?.[name];
  if (!Array.isArray(list)) return null;
  const value = list[index];
  return value ? String(value) : null;
}

function toNameIdLines(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => `${String(entry?.name || '').trim()} -> ${String(entry?.id || '').trim()}`)
    .filter((line) => !line.startsWith(' -> '));
}

const catalogList = {
  categories: toNameIdLines(catalog?.entries?.categories),
  channels: toNameIdLines(catalog?.entries?.channels),
  roles: toNameIdLines(catalog?.entries?.roles),
  bots: toNameIdLines(catalog?.entries?.bots)
};

const fullCatalog = {
  categories: Array.isArray(catalog?.entries?.categories) ? catalog.entries.categories.map((x) => ({ name: String(x?.name || ''), id: String(x?.id || '') })) : [],
  channels: Array.isArray(catalog?.entries?.channels) ? catalog.entries.channels.map((x) => ({ name: String(x?.name || ''), id: String(x?.id || '') })) : [],
  roles: Array.isArray(catalog?.entries?.roles) ? catalog.entries.roles.map((x) => ({ name: String(x?.name || ''), id: String(x?.id || '') })) : [],
  bots: Array.isArray(catalog?.entries?.bots) ? catalog.entries.bots.map((x) => ({ name: String(x?.name || ''), id: String(x?.id || '') })) : []
};

const ids = {
  guilds: {
    main: meta.guildMain || null
  },

  categories: {
    categoryStart: getAt('categories', catalog.entries.categories[0]?.name, 0), // 01 START -> 1442847153474109500
    categoryInfo: getAt('categories', catalog.entries.categories[1]?.name, 0), // 02 INFO -> 1442569064793903356
    categoryCommunity: getAt('categories', catalog.entries.categories[2]?.name, 0), // 03 COMMUNITY -> 1442569067473928243
    categoryPerks: getAt('categories', catalog.entries.categories[3]?.name, 0), // 04 PERKS -> 1442569069613289595
    categoryGames: getAt('categories', catalog.entries.categories[4]?.name, 0), // 05 GAMES -> 1442569074310643845
    categoryPublics: getAt('categories', catalog.entries.categories[5]?.name, 0), // 06 PUBLICS -> 1442569076902989844
    categoryPrivate: getAt('categories', catalog.entries.categories[6]?.name, 0), // 07 PRIVATE -> 1442569078379118755
    categorySponsor: getAt('categories', catalog.entries.categories[7]?.name, 0), // 08 SPONSOR -> 1442569081214599223
    categoryPartner: getAt('categories', catalog.entries.categories[8]?.name, 0), // 09 PARTNER -> 1442569079931146240
    categoryStaff: getAt('categories', catalog.entries.categories[9]?.name, 0), // 10 STAFF -> 1442569084414853232
    categoryBench: getAt('categories', catalog.entries.categories[10]?.name, 0), // 11 BENCH -> 1442569086717530142
    categoryReport: getAt('categories', catalog.entries.categories[11]?.name, 0), // 12 REPORT -> 1443250372482306150
    categorChat: getAt('categories', catalog.entries.categories[12]?.name, 0), // 13 CHAT -> 1442569090219773993
    categorySystem: getAt('categories', catalog.entries.categories[13]?.name, 0), // 14 SYSTEM -> 1442569088705630410
    categoryMidHigh: getAt('categories', catalog.entries.categories[14]?.name, 0), // 15 MID/HIGH -> 1442569091301773312
    categoryLogs: getAt('categories', catalog.entries.categories[15]?.name, 0), // 16 LOGS -> 1442569092761391178
  },

  channels: {
    separator1: getAt('channels', catalog.entries.channels[0]?.name, 0), // channels -> 1442569132406083748
    separator2: getAt('channels', catalog.entries.channels[1]?.name, 1), // channels -> 1442569197019463780
    separator3: getAt('channels', catalog.entries.channels[2]?.name, 2), // channels -> 1442569107923795998
    separator4: getAt('channels', catalog.entries.channels[3]?.name, 3), // channels -> 1442569098121711818
    separator5: getAt('channels', catalog.entries.channels[4]?.name, 4), // channels -> 1446492233002909848
    separator6: getAt('channels', catalog.entries.channels[5]?.name, 5), // channels -> 1442569280326602964
    separator7: getAt('channels', catalog.entries.channels[6]?.name, 6), // channels -> 1470775925426618468
    separator8: getAt('channels', catalog.entries.channels[7]?.name, 7), // channels -> 1442569143948804198
    separator9: getAt('channels', catalog.entries.channels[8]?.name, 8), // channels -> 1442569117717626930
    separator10: getAt('channels', catalog.entries.channels[9]?.name, 9), // channels -> 1442938093165613118
    pause: getAt('channels', catalog.entries.channels[10]?.name, 0), // pause -> 1442569255315832945
    countUtenti: getAt('channels', catalog.entries.channels[11]?.name, 0), // User: 324 -> 1442569096700104754
    sponsor1: getAt('channels', catalog.entries.channels[12]?.name, 0), // caffe borbone -> 1461432266457878548
    sanzioniUtenti: getAt('channels', catalog.entries.channels[13]?.name, 0), // sanzioni -> 1442569245878648924
    poketwo: getAt('channels', catalog.entries.channels[14]?.name, 0), // poketwo -> 1442569184281362552
    vocaleTrio3: getAt('channels', catalog.entries.channels[15]?.name, 0), // Trio3 -> 1470170531830693989
    staffChat: getAt('channels', catalog.entries.channels[16]?.name, 0), // staffers -> 1442569260059725844
    chat: getAt('channels', catalog.entries.channels[17]?.name, 0), // chat -> 1442569130573303898
    logCanaliRuoli: getAt('channels', catalog.entries.channels[18]?.name, 0), // channel roles logs -> 1442569302422192209
    vocprivata1: getAt('channels', catalog.entries.channels[19]?.name, 0), // The Moon Is Beautiful, Isn't It -> 1442569150575935781
    vocaleLounge2: getAt('channels', catalog.entries.channels[20]?.name, 0), // Lounge2 -> 1442569106514645042
    partnersChat: getAt('channels', catalog.entries.channels[21]?.name, 0), // partners -> 1442569209849843823
    vocaleSquad3: getAt('channels', catalog.entries.channels[22]?.name, 0), // Squad3 -> 1470170601154150686
    birthday: getAt('channels', catalog.entries.channels[23]?.name, 0), // birthday -> 1468233267458084884
    events: getAt('channels', catalog.entries.channels[24]?.name, 0), // events -> 1442569164488442129
    mudae: getAt('channels', catalog.entries.channels[25]?.name, 0), // mudae -> 1442569182825681077
    vocaleDuo1: getAt('channels', catalog.entries.channels[26]?.name, 0), // Duo1 -> 1442569113108218058
    vocaleSquad1: getAt('channels', catalog.entries.channels[27]?.name, 0), // Squad1 -> 1442569134532726855
    ruoliColori: getAt('channels', catalog.entries.channels[28]?.name, 0), // roles -> 1469429150669602961
    vocPrivata2: getAt('channels', catalog.entries.channels[29]?.name, 0), // Circo di Diunk -> 1442569156695294078
    ticket: getAt('channels', catalog.entries.channels[30]?.name, 0), // tickets -> 1442569095068254219
    ticketLogs: getAt('channels', catalog.entries.channels[31]?.name, 0), // ticket logs -> 1442569290682208296
    vocaleDuo2: getAt('channels', catalog.entries.channels[32]?.name, 0), // Duo2 -> 1442569114785943713
    vocaleSquad2: getAt('channels', catalog.entries.channels[33]?.name, 0), // Squad2 -> 1442569140077461613
    gradiMid: getAt('channels', catalog.entries.channels[34]?.name, 0), // gradi -> 1460407013925327033
    musicCommands: getAt('channels', catalog.entries.channels[35]?.name, 0), // music -> 1442569189486497905
    pollBestStaff: getAt('channels', catalog.entries.channels[36]?.name, 0), // poll best staff -> 1446104429181927434
    bestStaff: getAt('channels', catalog.entries.channels[37]?.name, 0), // best staff -> 1442569253281730653
    topWeeklyUser: getAt('channels', catalog.entries.channels[38]?.name, 0), // top weekly -> 1470183921236049940
    info: getAt('channels', catalog.entries.channels[39]?.name, 0), // info -> 1442569111119990887
    sponsor2: getAt('channels', catalog.entries.channels[40]?.name, 0), // hamster house -> 1448693699432153218
    highChat: getAt('channels', catalog.entries.channels[41]?.name, 0), // high -> 1442569285909217301
    vocaleduo3: getAt('channels', catalog.entries.channels[42]?.name, 0), // Duo3 -> 1470170379078078656
    warnStaff: getAt('channels', catalog.entries.channels[43]?.name, 0), // warn staff -> 1443250635108646943
    sponsor3: getAt('channels', catalog.entries.channels[44]?.name, 0), // inferius -> 1461387182840479927
    ship: getAt('channels', catalog.entries.channels[45]?.name, 0), // ship -> 1469685688814407726
    suggestions: getAt('channels', catalog.entries.channels[46]?.name, 0), // suggestions -> 1442569147559973094
    vocaleAFK: getAt('channels', catalog.entries.channels[47]?.name, 0), // AFK -> 1442569145995759756
    quotes: getAt('channels', catalog.entries.channels[48]?.name, 0), // quotes -> 1468540884537573479
    vocaleLounge3: getAt('channels', catalog.entries.channels[49]?.name, 0), // Lounge3 -> 1470168983507435631
    staffPagato: getAt('channels', catalog.entries.channels[50]?.name, 0), // staff pagato -> 1442579412280410194
    clickMe: getAt('channels', catalog.entries.channels[51]?.name, 0), // click me -> 1442569058406109216
    staffList: getAt('channels', catalog.entries.channels[52]?.name, 0), // staff list -> 1442569235426705653
    valutazioniStaff: getAt('channels', catalog.entries.channels[53]?.name, 0), // valutazioni -> 1442569249649459340
    puntiTolti: getAt('channels', catalog.entries.channels[54]?.name, 0), // punti tolti -> 1442569257375367320
    polls: getAt('channels', catalog.entries.channels[55]?.name, 0), // polls -> 1442569128706838528
    resocontiStaff: getAt('channels', catalog.entries.channels[56]?.name, 0), // resoconti -> 1442569270784692306
    guidaMid: getAt('channels', catalog.entries.channels[57]?.name, 0), // guida middle -> 1442569266066096309
    regolamentoPartner: getAt('channels', catalog.entries.channels[58]?.name, 0), // regolamento -> 1442569199229730836
    guidaStaff: getAt('channels', catalog.entries.channels[59]?.name, 0), // guida staff -> 1442569237142044773
    descriptionPartner: getAt('channels', catalog.entries.channels[60]?.name, 0), // description -> 1442569194905534494
    candidatureStaff: getAt('channels', catalog.entries.channels[61]?.name, 0), // candidature -> 1442569232507473951
    visioneModuli: getAt('channels', catalog.entries.channels[62]?.name, 0), // visione moduli -> 1442569278049095913
    news: getAt('channels', catalog.entries.channels[63]?.name, 0), // news -> 1442569115972669541
    staffNews: getAt('channels', catalog.entries.channels[64]?.name, 0), // staff news -> 1442569239063167139
    media: getAt('channels', catalog.entries.channels[65]?.name, 0), // media -> 1442569136067575809
    selfieVerificati: getAt('channels', catalog.entries.channels[66]?.name, 0), // selfie verificati -> 1470029899740873029
    forum: getAt('channels', catalog.entries.channels[67]?.name, 0), // forum -> 1442569141717438495
    noMic: getAt('channels', catalog.entries.channels[68]?.name, 0), // no mic -> 1442569187376763010
    verify: getAt('channels', catalog.entries.channels[69]?.name, 0), // verify -> 1442569059983163403
    counting: getAt('channels', catalog.entries.channels[70]?.name, 0), // counting -> 1442569179743125554
    riunioneStaff: getAt('channels', catalog.entries.channels[71]?.name, 0), // Riunione Staff -> 1443958044802420798
    commands: getAt('channels', catalog.entries.channels[72]?.name, 0), // commands -> 1442569138114662490
    serveBbotLogs: getAt('channels', catalog.entries.channels[73]?.name, 0), // server bot logs -> 1442577274783142039
    highCmds: getAt('channels', catalog.entries.channels[74]?.name, 0), // high cmds -> 1442569288161558528
    staffCmds: getAt('channels', catalog.entries.channels[75]?.name, 0), // staff cmds -> 1442569262689554444
    partnerships: getAt('channels', catalog.entries.channels[76]?.name, 0), // partnerships -> 1442569193470824448
    partnerLogs: getAt('channels', catalog.entries.channels[77]?.name, 0), // partner logs -> 1467533670129729680
    trio2: getAt('channels', catalog.entries.channels[78]?.name, 0), // Trio2 -> 1442569125753913498
    vocPrivata3: getAt('channels', catalog.entries.channels[79]?.name, 0), // Poetry Room -> 1442569152614367262
    infoSponsor: getAt('channels', catalog.entries.channels[80]?.name, 0), // info sponsor -> 1442569211611185323
    vocaleLounge1: getAt('channels', catalog.entries.channels[81]?.name, 0), // Lounge1 -> 1442569101225496819
    sponsor4: getAt('channels', catalog.entries.channels[82]?.name, 0), // veyronmc -> 1461369145860816947
    midChat: getAt('channels', catalog.entries.channels[83]?.name, 0), // middle -> 1442569268666568897
    vocaleTrio1: getAt('channels', catalog.entries.channels[84]?.name, 0), // Trio1 -> 1442569121350025306
    suppporters: getAt('channels', catalog.entries.channels[85]?.name, 0), // supporters -> 1442569123426074736
    moderazioneStaff: getAt('channels', catalog.entries.channels[86]?.name, 0), // moderazione -> 1442569243626307634
    modLogs: getAt('channels', catalog.entries.channels[87]?.name, 0), // mod logs -> 1442569294796820541
    activityLogs: getAt('channels', catalog.entries.channels[88]?.name, 0), // activity logs -> 1442569299725385851
    joinLeaveLogs: getAt('channels', catalog.entries.channels[89]?.name, 0), // join leave logs -> 1442569306608111776
    pexDepex: getAt('channels', catalog.entries.channels[90]?.name, 0), // pex depex -> 1442569234004709391
    ai: getAt('channels', catalog.entries.channels[91]?.name, 0), // ai -> 1471108621629784104
    animaliForum: getAt('channels', catalog.entries.channels[92]?.name, 0), // Animali -> 1461423795246989478
    propositiForum: getAt('channels', catalog.entries.channels[93]?.name, 0), // Buoni propositi 2026 -> 1456349072473587936
    wrapForum: getAt('channels', catalog.entries.channels[94]?.name, 0), // Spotify Wrapped/Apple Music Replay '25 -> 1445792081271587000
  },

  roles: {
    Wcik: getAt('roles', catalog.entries.roles[0]?.name, 0), // Wick Premium -> 1443565454260965471
    Dyno: getAt('roles', catalog.entries.roles[1]?.name, 0), // Dyno -> 1329483828326174723
    Xenon: getAt('roles', catalog.entries.roles[2]?.name, 0), // Xenon -> 1329507234002108500
    Statbot: getAt('roles', catalog.entries.roles[3]?.name, 0), // Statbot -> 1442946432238882961
    ActivityRank: getAt('roles', catalog.entries.roles[4]?.name, 0), // ActivityRank -> 1458422199957586065
    Mudae: getAt('roles', catalog.entries.roles[5]?.name, 0), // Mudae -> 1442929251103014923
    VoteManager: getAt('roles', catalog.entries.roles[6]?.name, 0), // Vote Manager -> 1468279483038437521
    DISBAORD: getAt('roles', catalog.entries.roles[7]?.name, 0), // DISBOARD.org -> 1442940553087025244
    Poketwo: getAt('roles', catalog.entries.roles[8]?.name, 0), // Poketwo -> 1442929519705980998
    JockieMusic: getAt('roles', catalog.entries.roles[9]?.name, 0), // Jockie Music -> 1442946823340691552
    fmbot: getAt('roles', catalog.entries.roles[10]?.name, 0), // .fmbot -> 1468978359605395691
    Discadia: getAt('roles', catalog.entries.roles[11]?.name, 0), // Discadia -> 1468236145753067739
    PokeName: getAt('roles', catalog.entries.roles[12]?.name, 0), // Poke Name -> 1468978249152594135
    separatore1: getAt('roles', catalog.entries.roles[13]?.name, 0), // . . -> 1442568885869215975
    Perms1: getAt('roles', catalog.entries.roles[14]?.name, 0), // roles -> 1442568888096391260
    Founder: getAt('roles', catalog.entries.roles[15]?.name, 0), // Founder -> 1442568886988963923
    BotUfficiale: getAt('roles', catalog.entries.roles[16]?.name, 0), // Bot Ufficiale -> 1329119091348213854
    Perms2: getAt('roles', catalog.entries.roles[17]?.name, 0), // roles -> 1442568890075971724
    StafferDelMese: getAt('roles', catalog.entries.roles[18]?.name, 0), // Staffer del mese -> 1442568895251611924
    CoFounder: getAt('roles', catalog.entries.roles[19]?.name, 0), // Co Founder -> 1442568889052430609
    Manager: getAt('roles', catalog.entries.roles[20]?.name, 0), // Manager -> 1442568891875201066
    Admin: getAt('roles', catalog.entries.roles[21]?.name, 0), // Admin -> 1442568893435478097
    HighStaff: getAt('roles', catalog.entries.roles[22]?.name, 0), // High Staff -> 1442568894349840435
    Supervisor: getAt('roles', catalog.entries.roles[23]?.name, 0), // Supervisor -> 1442568896237277295
    Coordinator: getAt('roles', catalog.entries.roles[24]?.name, 0), // Coordinator -> 1442568897902678038
    Mod: getAt('roles', catalog.entries.roles[25]?.name, 0), // Mod -> 1442568901887000618
    Helper: getAt('roles', catalog.entries.roles[26]?.name, 0), // Helper -> 1442568904311570555
    PartnerManager: getAt('roles', catalog.entries.roles[27]?.name, 0), // Partner Manager -> 1442568905582317740
    Staff: getAt('roles', catalog.entries.roles[28]?.name, 0), // Staff -> 1442568910070349985
    separatore2: getAt('roles', catalog.entries.roles[29]?.name, 1), // . . -> 1469759519159615620
    redPlus: getAt('roles', catalog.entries.roles[30]?.name, 0), // Red Gradientplus -> 1469759694930182284
    orangePlus: getAt('roles', catalog.entries.roles[31]?.name, 0), // Orange Gradientplus -> 1469759700944814231
    yellowPlus: getAt('roles', catalog.entries.roles[32]?.name, 0), // Yellow Gradientplus -> 1469759704380084384
    greenPlus: getAt('roles', catalog.entries.roles[33]?.name, 0), // Green Gradientplus -> 1469759708742160537
    bluePlus: getAt('roles', catalog.entries.roles[34]?.name, 0), // Blue Gradientplus -> 1469759714094088327
    purplePlus: getAt('roles', catalog.entries.roles[35]?.name, 0), // Purple Gradientplus -> 1469759719194230906
    pinkPlus: getAt('roles', catalog.entries.roles[36]?.name, 0), // Pink Gradientplus -> 1469759723418026233
    blackPlus: getAt('roles', catalog.entries.roles[37]?.name, 0), // Black Gradientplus -> 1469759731945177182
    grayPlus: getAt('roles', catalog.entries.roles[38]?.name, 0), // Gray Gradientplus -> 1469760931113336864
    whitePlus: getAt('roles', catalog.entries.roles[39]?.name, 0), // White Gradientplus -> 1469761030417809675
    YinYangPlus: getAt('roles', catalog.entries.roles[40]?.name, 0), // Yin & Yangplus -> 1469761114140315831
    separatore3: getAt('roles', catalog.entries.roles[41]?.name, 2), // . . -> 1469452818351001772
    Cherry: getAt('roles', catalog.entries.roles[42]?.name, 0), // Cherry -> 1442568958656905318
    Blood: getAt('roles', catalog.entries.roles[43]?.name, 0), // Blood -> 1442568956832645212
    Scarlet: getAt('roles', catalog.entries.roles[44]?.name, 0), // Scarlet -> 1442568961077153994
    Coral: getAt('roles', catalog.entries.roles[45]?.name, 0), // Coral -> 1442568960016121998
    Carrot: getAt('roles', catalog.entries.roles[46]?.name, 0), // Carrot -> 1442568963836874886
    Pumpkin: getAt('roles', catalog.entries.roles[47]?.name, 0), // Pumpkin -> 1442568965040636019
    Orange: getAt('roles', catalog.entries.roles[48]?.name, 0), // Orange -> 1442568967045648412
    Peach: getAt('roles', catalog.entries.roles[49]?.name, 0), // Peach -> 1442568962167541760
    Mais: getAt('roles', catalog.entries.roles[50]?.name, 0), // Mais -> 1442568968371048449
    Gold: getAt('roles', catalog.entries.roles[51]?.name, 0), // Gold -> 1442568969528541225
    Amber: getAt('roles', catalog.entries.roles[52]?.name, 0), // Amber -> 1442568970497687717
    Lime: getAt('roles', catalog.entries.roles[53]?.name, 0), // Lime -> 1442568971357388912
    Pear: getAt('roles', catalog.entries.roles[54]?.name, 0), // Pear -> 1442568972745838667
    Moss: getAt('roles', catalog.entries.roles[55]?.name, 0), // Moss -> 1442568975966797926
    Green: getAt('roles', catalog.entries.roles[56]?.name, 0), // Green -> 1442568976944201828
    Olive: getAt('roles', catalog.entries.roles[57]?.name, 0), // Olive -> 1442568974486208634
    Aqua: getAt('roles', catalog.entries.roles[58]?.name, 0), // Aqua -> 1442568977896439960
    Blue: getAt('roles', catalog.entries.roles[59]?.name, 0), // Blue -> 1442568979473371258
    ElectricBlue: getAt('roles', catalog.entries.roles[60]?.name, 0), // Electric Blue -> 1442568980626673685
    MidnightBlue: getAt('roles', catalog.entries.roles[61]?.name, 0), // Midnight Blue -> 1442568981792948304
    Eggplant: getAt('roles', catalog.entries.roles[62]?.name, 0), // Eggplant -> 1442568982769959002
    Purple: getAt('roles', catalog.entries.roles[63]?.name, 0), // Purple -> 1442568983898357954
    Lilac: getAt('roles', catalog.entries.roles[64]?.name, 0), // Lilac -> 1442568985278156971
    Sangria: getAt('roles', catalog.entries.roles[65]?.name, 0), // Sangria -> 1442568986720993350
    BlackCat: getAt('roles', catalog.entries.roles[66]?.name, 0), // Black Cat -> 1442568987887276133
    GreySmoke: getAt('roles', catalog.entries.roles[67]?.name, 0), // Grey Smoke -> 1442568988961013821
    Grey: getAt('roles', catalog.entries.roles[68]?.name, 0), // Grey -> 1442568989866725468
    White: getAt('roles', catalog.entries.roles[69]?.name, 0), // White -> 1442568991150309578
    separatore4: getAt('roles', catalog.entries.roles[70]?.name, 3), // . . -> 1469452890761596981
    customrole1: getAt('roles', catalog.entries.roles[71]?.name, 0), // The Moon Is Beautiful, Isn't It? -> 1442568940579459102
    customrole2: getAt('roles', catalog.entries.roles[72]?.name, 0), // Poetry Crew -> 1442568942194393211
    customrole3: getAt('roles', catalog.entries.roles[73]?.name, 0), // Jolly -> 1442568943834234890
    Muted: getAt('roles', catalog.entries.roles[74]?.name, 0), // Muted -> 1442568884833095832
    blackilistPartner: getAt('roles', catalog.entries.roles[75]?.name, 0), // No Partner -> 1443252279477272647
    blacklistTicket: getAt('roles', catalog.entries.roles[76]?.name, 0), // No Ticket -> 1463248847768785038
    blacklistModuli: getAt('roles', catalog.entries.roles[77]?.name, 0), // No Moduli -> 1463248874725576879
    Incense: getAt('roles', catalog.entries.roles[78]?.name, 0), // Incense -> 1442568951912726628
    separatore5: getAt('roles', catalog.entries.roles[79]?.name, 0), // BADGEs -> 1468674171213971568
    VIP: getAt('roles', catalog.entries.roles[80]?.name, 0), // VIP -> 1442568950805430312
    Donator: getAt('roles', catalog.entries.roles[81]?.name, 0), // Donator -> 1442568916114346096
    ServerBooster: getAt('roles', catalog.entries.roles[82]?.name, 0), // Server Booster -> 1329497467481493607
    Promoter: getAt('roles', catalog.entries.roles[83]?.name, 0), // Promoter -> 1469758545263198442
    Voter: getAt('roles', catalog.entries.roles[84]?.name, 0), // Voter -> 1468266342682722679
    Supporter: getAt('roles', catalog.entries.roles[85]?.name, 0), // Supporter -> 1442568948271943721
    TopWeeklyVoc: getAt('roles', catalog.entries.roles[86]?.name, 0), // Top Weekly Voc -> 1468674787399172208
    TopWeeklyText: getAt('roles', catalog.entries.roles[87]?.name, 0), // Top Weekly Text -> 1468674837957574757
    Verificato: getAt('roles', catalog.entries.roles[88]?.name, 0), // Verificato -> 1469040179799920801
    Verificata: getAt('roles', catalog.entries.roles[89]?.name, 0), // Verificata -> 1469040190730408018
    OG: getAt('roles', catalog.entries.roles[90]?.name, 0), // OG -> 1469041493401534644
    Veterano: getAt('roles', catalog.entries.roles[91]?.name, 0), // Veterano -> 1469073503025103113
    NuovoUtente: getAt('roles', catalog.entries.roles[92]?.name, 0), // Nuovo Utente -> 1469041461294268489
    Member: getAt('roles', catalog.entries.roles[93]?.name, 0), // Member -> 1442568949605597264
    Bots: getAt('roles', catalog.entries.roles[94]?.name, 0), // Bots -> 1442568954181713982
    separatore6: getAt('roles', catalog.entries.roles[95]?.name, 0), // SPECIALI -> 1442568938457399299
    PicPerms: getAt('roles', catalog.entries.roles[96]?.name, 0), // PicPerms -> 1468938195348754515
    Strategist: getAt('roles', catalog.entries.roles[97]?.name, 0), // Strategist+100000 -> 1468675595058811075
    Mentor: getAt('roles', catalog.entries.roles[98]?.name, 0), // Mentor+50000 -> 1468675590747062355
    Vanguard: getAt('roles', catalog.entries.roles[99]?.name, 0), // Vanguard+10000 -> 1468675587747877028
    Achivier: getAt('roles', catalog.entries.roles[100]?.name, 0), // Achivier+5000 -> 1468675584094769427
    Tracker: getAt('roles', catalog.entries.roles[101]?.name, 0), // Tracker+2500 -> 1468675580609429536
    Explorer: getAt('roles', catalog.entries.roles[102]?.name, 0), // Explorer+1500 -> 1468675576326918302
    Scout: getAt('roles', catalog.entries.roles[103]?.name, 0), // Scout+1000 -> 1468675570865803407
    Rookie: getAt('roles', catalog.entries.roles[104]?.name, 0), // Rookie+500 -> 1468675567015428239
    Initiate: getAt('roles', catalog.entries.roles[105]?.name, 0), // Initiate+100 -> 1468675561948971058
    separatore7: getAt('roles', catalog.entries.roles[106]?.name, 0), // LIVELLI -> 1442568928667631738
    Level100: getAt('roles', catalog.entries.roles[107]?.name, 0), // Level 100+ -> 1442568929930379285
    Level70: getAt('roles', catalog.entries.roles[108]?.name, 0), // Level 70+ -> 1442568931326824488
    Level50: getAt('roles', catalog.entries.roles[109]?.name, 0), // Level 50+ -> 1442568932136587297
    Level30: getAt('roles', catalog.entries.roles[110]?.name, 0), // Level 30+ -> 1442568933591748688
    Level20: getAt('roles', catalog.entries.roles[111]?.name, 0), // Level 20+ -> 1442568934510297226
    Level10: getAt('roles', catalog.entries.roles[112]?.name, 0), // Level 10+ -> 1442568936423034940
    separatore8: getAt('roles', catalog.entries.roles[113]?.name, 0), // SELF ROLES -> 1442568992459067423
    1314: getAt('roles', catalog.entries.roles[114]?.name, 0), // 13-14 -> 1442568993197265021
    1516: getAt('roles', catalog.entries.roles[115]?.name, 0), // 15-16 -> 1442568994581381170
    1718: getAt('roles', catalog.entries.roles[116]?.name, 0), // 17-18 -> 1442568995348807691
    19: getAt('roles', catalog.entries.roles[117]?.name, 0), // 19+ -> 1442568996774871194
    heHim: getAt('roles', catalog.entries.roles[118]?.name, 0), // He/Him -> 1442568997848743997
    sheHer: getAt('roles', catalog.entries.roles[119]?.name, 0), // She/Her -> 1442568999043989565
    theyThem: getAt('roles', catalog.entries.roles[120]?.name, 0), // They/Them -> 1442569000063074498
    askMe: getAt('roles', catalog.entries.roles[121]?.name, 0), // Ask Me -> 1442569001367769210
    DMsOpened: getAt('roles', catalog.entries.roles[122]?.name, 0), // DMs Opened -> 1442569004215697438
    DMsClosed: getAt('roles', catalog.entries.roles[123]?.name, 0), // DMs Closed -> 1442569005071077417
    AsktoDM: getAt('roles', catalog.entries.roles[124]?.name, 0), // Ask to DM -> 1442569006543274126
    ReviveChat: getAt('roles', catalog.entries.roles[125]?.name, 0), // Revive Chat -> 1442569009567629375
    Events: getAt('roles', catalog.entries.roles[126]?.name, 0), // Events -> 1442569012063109151
    News: getAt('roles', catalog.entries.roles[127]?.name, 0), // News -> 1442569010943365342
    Polls: getAt('roles', catalog.entries.roles[128]?.name, 0), // Polls -> 1442569014474965033
    Bump: getAt('roles', catalog.entries.roles[129]?.name, 0), // Bump -> 1442569013074071644
    Minigames: getAt('roles', catalog.entries.roles[130]?.name, 0), // Minigames -> 1443955529352478830
    Forum: getAt('roles', catalog.entries.roles[131]?.name, 0), // Forum -> 1447597930944008376
    Nord: getAt('roles', catalog.entries.roles[132]?.name, 0), // Nord -> 1442569021861007443
    Centro: getAt('roles', catalog.entries.roles[133]?.name, 0), // Centro -> 1442569023303974922
    Sud: getAt('roles', catalog.entries.roles[134]?.name, 0), // Sud -> 1442569024486506498
    Estero: getAt('roles', catalog.entries.roles[135]?.name, 0), // Estero -> 1442569025790939167
    Fidanzato: getAt('roles', catalog.entries.roles[136]?.name, 0), // Fidanzato -> 1442569028173299732
    Single: getAt('roles', catalog.entries.roles[137]?.name, 0), // Single -> 1442569029263818906
  },

  bots: {
    Xenon: getAt('bots', catalog.entries.bots[0]?.name, 0), // Xenon -> 416358583220043796
    fmbot: getAt('bots', catalog.entries.bots[1]?.name, 0), // .fmbot -> 356268235697553409
    Statbot: getAt('bots', catalog.entries.bots[2]?.name, 0), // Statbot -> 491769129318088714
    Poketwo: getAt('bots', catalog.entries.bots[3]?.name, 0), // Poketwo -> 716390085896962058
    ViniliCaffeBot: getAt('bots', catalog.entries.bots[4]?.name, 0), // Vinili&CaffeBot -> 1329118940110127204
    Discadia: getAt('bots', catalog.entries.bots[5]?.name, 0), // Discadia -> 1222548162741538938
    Mudae: getAt('bots', catalog.entries.bots[6]?.name, 0), // Mudae -> 432610292342587392
    Dyno: getAt('bots', catalog.entries.bots[7]?.name, 0), // Dyno -> 155149108183695360
    VoteManager: getAt('bots', catalog.entries.bots[8]?.name, 0), // Vote Manager -> 959699003010871307
    PokeName: getAt('bots', catalog.entries.bots[9]?.name, 0), // Poke-Name -> 874910942490677270
    JockieMusic: getAt('bots', catalog.entries.bots[10]?.name, 0), // Jockie Music -> 411916947773587456
    Wick: getAt('bots', catalog.entries.bots[11]?.name, 0), // Wick -> 548410451818708993
    DISBOARD: getAt('bots', catalog.entries.bots[12]?.name, 0), // DISBOARD -> 302050872383242240
    ActivityRank: getAt('bots', catalog.entries.bots[13]?.name, 0), // ActivityRank -> 534589798267224065
  },

  emojis: {
    loadingAnimatedId: meta?.emojis?.loadingAnimatedId || null,
    loadingFallbackId: meta?.emojis?.loadingFallbackId || null
  },

  links: {
    vote: meta?.links?.vote || null,
    invite: meta?.links?.invite || null
  },

  named: catalog.maps,
  namedEntries: catalog.entries,
  namedMulti: catalog.multi,
  namedRaw: catalog.raw,
  full: fullCatalog,
  catalogList,

  raw: {
    guilds: {
      main: meta.guildMain || null
    },
    categories: { ...(catalog?.maps?.categories || {}) },
    channels: { ...(catalog?.maps?.channels || {}) },
    roles: { ...(catalog?.maps?.roles || {}) },
    bots: { ...(catalog?.maps?.bots || {}) },
    emojis: { ...(meta?.emojis || {}) },
    links: { ...(meta?.links || {}) }
  }
};

ids.aliases = {
  categories: { ...ids.categories },
  channels: { ...ids.channels },
  roles: { ...ids.roles },
  bots: { ...ids.bots }
};

ids.aliasEntries = {
  categories: Object.fromEntries(Object.entries(ids.categories).map(([k, id]) => [k, { name: "", id }])),
  channels: Object.fromEntries(Object.entries(ids.channels).map(([k, id]) => [k, { name: "", id }])),
  roles: Object.fromEntries(Object.entries(ids.roles).map(([k, id]) => [k, { name: "", id }])),
  bots: Object.fromEntries(Object.entries(ids.bots).map(([k, id]) => [k, { name: "", id }]))
};

function normalizeNameToKey(rawName) {
  const base = String(rawName || '')
    .replace(/^\u0F04\s*/u, '')
    .replace(/\s*->.*$/u, '')
    .replace(/^.*?\uFE32/u, '')
    .replace(/['â€™`]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  if (!base) return '';
  const words = base.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0].toLowerCase();
  const rest = words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  return `${first}${rest}`;
}

function applyNormalizedAliases(group, keyPrefix) {
  const entries = Array.isArray(catalog?.entries?.[group]) ? catalog.entries[group] : [];
  const seenNorm = new Map();
  for (let i = 0; i < entries.length; i++) {
    const genericKey = `${keyPrefix}${i + 1}`;
    const baseId = ids[group]?.[genericKey];
    if (!baseId) continue;

    let norm = normalizeNameToKey(entries[i]?.name || '');
    if (!norm) norm = `${keyPrefix}${i + 1}`;
    if (/^\d/.test(norm)) norm = `${keyPrefix}${norm}`;
    const count = (seenNorm.get(norm) || 0) + 1;
    seenNorm.set(norm, count);
    const finalKey = count > 1 ? `${norm}_${count}` : norm;
    if (!ids[group][finalKey]) ids[group][finalKey] = baseId;
  }
}

applyNormalizedAliases('categories', 'category');
applyNormalizedAliases('channels', 'channel');
applyNormalizedAliases('roles', 'role');
applyNormalizedAliases('bots', 'bot');

module.exports = ids;

