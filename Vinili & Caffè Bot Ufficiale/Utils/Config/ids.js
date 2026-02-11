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

function getByName(group, name) {
  const value = maps?.[group]?.[name];
  return value ? String(value) : null;
}

function getByNameAt(group, name, index = 0) {
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
    categoryStart: getByNameAt('categories', '⁰¹・ 　　　  　  　    START 　　    　　    ・', 0), // 01 START -> 1442847153474109500
    categoryInfo: getByNameAt('categories', '⁰²・　　　　 　　INFO　　　　　・', 0), // 02 INFO -> 1442569064793903356
    categoryCommunity: getByNameAt('categories', '⁰³・ 　　　 　      COMMUNITY 　　   　    ・', 0), // 03 COMMUNITY -> 1442569067473928243
    categoryPerks: getByNameAt('categories', '⁰⁴・ 　　　　    　    PERKS　　    　   　　 ・', 0), // 04 PERKS -> 1442569069613289595
    categoryGames: getByNameAt('categories', '⁰⁵・ 　　　　　GAMES 　　　　　・', 0), // 05 GAMES -> 1442569074310643845
    categoryPublics: getByNameAt('categories', '⁰⁶・　　　　　PUBLICS　　　　　・', 0), // 06 PUBLICS -> 1442569076902989844
    categoryPrivate: getByNameAt('categories', '⁰⁷・ 　　　　　     PRIVATE 　   　  　　  ・', 0), // 07 PRIVATE -> 1442569078379118755
    categorySponsor: getByNameAt('categories', '⁰⁸・　　　　　SPONSOR　　　　　・', 0), // 08 SPONSOR -> 1442569081214599223
    categoryPartner: getByNameAt('categories', '⁰⁹・ 　　　    　    PARTNER 　　    　    　・', 0), // 09 PARTNER -> 1442569079931146240
    categoryStaff: getByNameAt('categories', '¹⁰・　　　　　　STAFF　　　　　・', 0), // 10 STAFF -> 1442569084414853232
    categoryBench: getByNameAt('categories', '¹¹・ 　　    　   　　 BENCH 　　   　  　  ・', 0), // 11 BENCH -> 1442569086717530142
    categoryReport: getByNameAt('categories', '¹²・ 　　　    　    REPORT　　 　　    　    ・', 0), // 12 REPORT -> 1443250372482306150
    categorChat: getByNameAt('categories', '¹³・ 　　　　    　    CHAT 　　    　　　    ・', 0), // 13 CHAT -> 1442569090219773993
    categorySystem: getByNameAt('categories', '¹⁴・ 　　    　  　  　SYSTEM 　　    　  　  ・', 0), // 14 SYSTEM -> 1442569088705630410
    categoryMidHigh: getByNameAt('categories', '¹⁵・ 　　　　　   MID/HIGH　　　　・', 0), // 15 MID/HIGH -> 1442569091301773312
    categoryLogs: getByNameAt('categories', '¹⁶・ 　    　　    　　LOGS 　　    　    　　・', 0), // 16 LOGS -> 1442569092761391178
  },

  channels: {
    separator1: getByNameAt('channels', '〝', 0), // channels -> 1442569132406083748
    separator2: getByNameAt('channels', '〝', 1), // channels -> 1442569197019463780
    separator3: getByNameAt('channels', '〝', 2), // channels -> 1442569107923795998
    separator4: getByNameAt('channels', '〝', 3), // channels -> 1442569098121711818
    separator5: getByNameAt('channels', '〝', 4), // channels -> 1446492233002909848
    separator6: getByNameAt('channels', '〝', 5), // channels -> 1442569280326602964
    separator7: getByNameAt('channels', '〝', 6), // channels -> 1470775925426618468
    separator8: getByNameAt('channels', '〝', 7), // channels -> 1442569143948804198
    separator9: getByNameAt('channels', '〝', 8), // channels -> 1442569117717626930
    separator10: getByNameAt('channels', '〝', 9), // channels -> 1442938093165613118
    pause: getByNameAt('channels', '༄⏸️︲pause', 0), // pause -> 1442569255315832945
    countUtenti: getByNameAt('channels', '༄☕︲ User: 324', 0), // User: 324 -> 1442569096700104754
    sponsor1: getByNameAt('channels', '༄☕︲caffè᲼borbone', 0), // caffe borbone -> 1461432266457878548
    sanzioniUtenti: getByNameAt('channels', '༄⛔︲sanzioni', 0), // sanzioni -> 1442569245878648924
    poketwo: getByNameAt('channels', '༄⛩️︲pokétwo', 0), // poketwo -> 1442569184281362552
    vocaleTrio3: getByNameAt('channels', '༄✨︲Trio³', 0), // Trio3 -> 1470170531830693989
    staffChat: getByNameAt('channels', '༄🌁︲staffers', 0), // staffers -> 1442569260059725844
    chat: getByNameAt('channels', '༄🌃︲chat', 0), // chat -> 1442569130573303898
    logCanaliRuoli: getByNameAt('channels', '༄🌐︲channel᲼roles᲼logs', 0), // channel roles logs -> 1442569302422192209
    vocprivata1: getByNameAt('channels', '༄🌙︲The Moon Is Beautiful, Isn\'t It', 0), // The Moon Is Beautiful, Isn't It -> 1442569150575935781
    vocaleLounge2: getByNameAt('channels', '༄🌬️︲𝖫𝗈𝗎𝗇𝗀𝖾²', 0), // Lounge2 -> 1442569106514645042
    partnersChat: getByNameAt('channels', '༄🌵︲partners', 0), // partners -> 1442569209849843823
    vocaleSquad3: getByNameAt('channels', '༄🍀︲Squad³', 0), // Squad3 -> 1470170601154150686
    birthday: getByNameAt('channels', '༄🎂︲birthday', 0), // birthday -> 1468233267458084884
    events: getByNameAt('channels', '༄🎆︲events', 0), // events -> 1442569164488442129
    mudae: getByNameAt('channels', '༄🎎︲mudae', 0), // mudae -> 1442569182825681077
    vocaleDuo1: getByNameAt('channels', '༄🎏︲Duo¹', 0), // Duo1 -> 1442569113108218058
    vocaleSquad1: getByNameAt('channels', '༄🎡︲Squad¹', 0), // Squad1 -> 1442569134532726855
    ruoliColori: getByNameAt('channels', '༄🎨︲roles', 0), // roles -> 1469429150669602961
    vocPrivata2: getByNameAt('channels', '༄🎪︲Circo di Diunk', 0), // Circo di Diunk -> 1442569156695294078
    ticket: getByNameAt('channels', '༄🎫︲tickets', 0), // tickets -> 1442569095068254219
    ticketLogs: getByNameAt('channels', '༄🎫︲ticket᲼logs', 0), // ticket logs -> 1442569290682208296
    vocaleDuo2: getByNameAt('channels', '༄🎭︲Duo²', 0), // Duo2 -> 1442569114785943713
    vocaleSquad2: getByNameAt('channels', '༄🎯︲Squad²', 0), // Squad2 -> 1442569140077461613
    gradiMid: getByNameAt('channels', '༄🎲︲gradi', 0), // gradi -> 1460407013925327033
    musicCommands: getByNameAt('channels', '༄🎹︲music', 0), // music -> 1442569189486497905
    pollBestStaff: getByNameAt('channels', '༄🏅︲poll᲼best᲼staff', 0), // poll best staff -> 1446104429181927434
    bestStaff: getByNameAt('channels', '༄🏆︲best᲼staff', 0), // best staff -> 1442569253281730653
    topWeeklyUser: getByNameAt('channels', '༄🏆︲top᲼weekly', 0), // top weekly -> 1470183921236049940
    info: getByNameAt('channels', '༄🏡︲info', 0), // info -> 1442569111119990887
    sponsor2: getByNameAt('channels', '༄🐭︲hamster᲼house', 0), // hamster house -> 1448693699432153218
    highChat: getByNameAt('channels', '༄👔︲high', 0), // high -> 1442569285909217301
    vocaleduo3: getByNameAt('channels', '༄👥︲Duo³', 0), // Duo3 -> 1470170379078078656
    warnStaff: getByNameAt('channels', '༄👮︲warn᲼staff', 0), // warn staff -> 1443250635108646943
    sponsor3: getByNameAt('channels', '༄👺︲inferius', 0), // inferius -> 1461387182840479927
    ship: getByNameAt('channels', '༄💞︲ship', 0), // ship -> 1469685688814407726
    suggestions: getByNameAt('channels', '༄💡︲suggestions', 0), // suggestions -> 1442569147559973094
    vocaleAFK: getByNameAt('channels', '༄💤︲𝖠𝖥𝖪', 0), // AFK -> 1442569145995759756
    quotes: getByNameAt('channels', '༄💭︲quotes', 0), // quotes -> 1468540884537573479
    vocaleLounge3: getByNameAt('channels', '༄💰︲𝖫𝗈𝗎𝗇𝗀𝖾³', 0), // Lounge3 -> 1470168983507435631
    staffPagato: getByNameAt('channels', '༄💸︲staff᲼pagato', 0), // staff pagato -> 1442579412280410194
    clickMe: getByNameAt('channels', '༄📀︲click᲼me', 0), // click me -> 1442569058406109216
    staffList: getByNameAt('channels', '༄📄︲staff᲼list', 0), // staff list -> 1442569235426705653
    valutazioniStaff: getByNameAt('channels', '༄📈︲valutazioni', 0), // valutazioni -> 1442569249649459340
    puntiTolti: getByNameAt('channels', '༄📉︲punti᲼tolti', 0), // punti tolti -> 1442569257375367320
    polls: getByNameAt('channels', '༄📊︲polls', 0), // polls -> 1442569128706838528
    resocontiStaff: getByNameAt('channels', '༄📊︲resoconti', 0), // resoconti -> 1442569270784692306
    guidaMid: getByNameAt('channels', '༄📒︲guida᲼middle', 0), // guida middle -> 1442569266066096309
    regolamentoPartner: getByNameAt('channels', '༄📖︲regolamento', 0), // regolamento -> 1442569199229730836
    guidaStaff: getByNameAt('channels', '༄📚︲guida᲼staff', 0), // guida staff -> 1442569237142044773
    descriptionPartner: getByNameAt('channels', '༄📜︲description', 0), // description -> 1442569194905534494
    candidatureStaff: getByNameAt('channels', '༄📝︲candidature', 0), // candidature -> 1442569232507473951
    visioneModuli: getByNameAt('channels', '༄📬︲visione᲼moduli', 0), // visione moduli -> 1442569278049095913
    news: getByNameAt('channels', '༄📰︲news', 0), // news -> 1442569115972669541
    staffNews: getByNameAt('channels', '༄📰︲staff᲼news', 0), // staff news -> 1442569239063167139
    media: getByNameAt('channels', '༄📲︲media', 0), // media -> 1442569136067575809
    selfieVerificati: getByNameAt('channels', '༄📸︲selfie᲼verificati', 0), // selfie verificati -> 1470029899740873029
    forum: getByNameAt('channels', '༄📺︲forum', 0), // forum -> 1442569141717438495
    noMic: getByNameAt('channels', '༄🔇︲no᲼mic', 0), // no mic -> 1442569187376763010
    verify: getByNameAt('channels', '༄🔍︲verify', 0), // verify -> 1442569059983163403
    counting: getByNameAt('channels', '༄🔢︲counting', 0), // counting -> 1442569179743125554
    riunioneStaff: getByNameAt('channels', '༄🔬︲Riunione Staff', 0), // Riunione Staff -> 1443958044802420798
    commands: getByNameAt('channels', '༄🕹️︲commands', 0), // commands -> 1442569138114662490
    serveBbotLogs: getByNameAt('channels', '༄🖥️︲server᲼bot᲼logs', 0), // server bot logs -> 1442577274783142039
    highCmds: getByNameAt('channels', '༄🤖︲high᲼cmds', 0), // high cmds -> 1442569288161558528
    staffCmds: getByNameAt('channels', '༄🤖︲staff᲼cmds', 0), // staff cmds -> 1442569262689554444
    partnerships: getByNameAt('channels', '༄🤝︲partnerships', 0), // partnerships -> 1442569193470824448
    partnerLogs: getByNameAt('channels', '༄🤝︲partner᲼logs', 0), // partner logs -> 1467533670129729680
    trio2: getByNameAt('channels', '༄🧆︲Trio²', 0), // Trio2 -> 1442569125753913498
    vocPrivata3: getByNameAt('channels', '༄🪅︲Poetry Room', 0), // Poetry Room -> 1442569152614367262
    infoSponsor: getByNameAt('channels', '༄🪇︲info᲼sponsor', 0), // info sponsor -> 1442569211611185323
    vocaleLounge1: getByNameAt('channels', '༄🪤︲𝖫𝗈𝗎𝗇𝗀𝖾¹', 0), // Lounge1 -> 1442569101225496819
    sponsor4: getByNameAt('channels', '༄🪽︲veyronmc', 0), // veyronmc -> 1461369145860816947
    midChat: getByNameAt('channels', '༄🫀︲middle', 0), // middle -> 1442569268666568897
    vocaleTrio1: getByNameAt('channels', '༄🫘︲Trio¹', 0), // Trio1 -> 1442569121350025306
    suppporters: getByNameAt('channels', '༄🫦︲supporters', 0), // supporters -> 1442569123426074736
    moderazioneStaff: getByNameAt('channels', '༄🚨︲moderazione', 0), // moderazione -> 1442569243626307634
    modLogs: getByNameAt('channels', '༄🚨︲mod᲼logs', 0), // mod logs -> 1442569294796820541
    activityLogs: getByNameAt('channels', '༄🚩︲activity᲼logs', 0), // activity logs -> 1442569299725385851
    joinLeaveLogs: getByNameAt('channels', '༄🛃︲join᲼leave᲼logs', 0), // join leave logs -> 1442569306608111776
    pexDepex: getByNameAt('channels', '༄🆙︲pex᲼depex', 0), // pex depex -> 1442569234004709391
    ai: getByNameAt('channels', '༄🧠︲ai', 0), // ai -> 1471108621629784104
    animaliForum: getByNameAt('channels', 'Animali', 0), // Animali -> 1461423795246989478
    propositiForum: getByNameAt('channels', 'Buoni propositi 2026', 0), // Buoni propositi 2026 -> 1456349072473587936
    wrapForum: getByNameAt('channels', 'Spotify Wrapped/Apple Music Replay \'25', 0), // Spotify Wrapped/Apple Music Replay '25 -> 1445792081271587000
  },

  roles: {
    Wick: getByNameAt('roles', '༄ Wick Premium', 0), // Wick Premium -> 1443565454260965471
    Dyno: getByNameAt('roles', '༄ Dyno', 0), // Dyno -> 1329483828326174723
    Xenon: getByNameAt('roles', '༄ Xenon', 0), // Xenon -> 1329507234002108500
    Statbot: getByNameAt('roles', '༄ Statbot', 0), // Statbot -> 1442946432238882961
    ActivityRank: getByNameAt('roles', '༄ ActivityRank', 0), // ActivityRank -> 1458422199957586065
    Mudae: getByNameAt('roles', '༄ Mudae', 0), // Mudae -> 1442929251103014923
    VoteManager: getByNameAt('roles', '༄ Vote Manager', 0), // Vote Manager -> 1468279483038437521
    DISBAORD: getByNameAt('roles', '༄ DISBOARD.org', 0), // DISBOARD.org -> 1442940553087025244
    Poketwo: getByNameAt('roles', '༄ Pokétwo', 0), // Poketwo -> 1442929519705980998
    JockieMusic: getByNameAt('roles', '༄ Jockie Music', 0), // Jockie Music -> 1442946823340691552
    fmbot: getByNameAt('roles', '༄ .fmbot', 0), // .fmbot -> 1468978359605395691
    Discadia: getByNameAt('roles', '༄ Discadia', 0), // Discadia -> 1468236145753067739
    PokeName: getByNameAt('roles', '༄ Poke Name', 0), // Poke Name -> 1468978249152594135
    separatore1: getByNameAt('roles', '。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。', 0), // . . -> 1442568885869215975
    Perms1: getByNameAt('roles', '༄ 🔗', 0), // roles -> 1442568888096391260
    Founder: getByNameAt('roles', '༄ Founder', 0), // Founder -> 1442568886988963923
    BotUfficiale: getByNameAt('roles', '༄ Bot Ufficiale', 0), // Bot Ufficiale -> 1329119091348213854
    Perms2: getByNameAt('roles', '༄ 🔑', 0), // roles -> 1442568890075971724
    StafferDelMese: getByNameAt('roles', '༄ Staffer del mese', 0), // Staffer del mese -> 1442568895251611924
    CoFounder: getByNameAt('roles', '༄ Co Founder', 0), // Co Founder -> 1442568889052430609
    Manager: getByNameAt('roles', '༄ Manager', 0), // Manager -> 1442568891875201066
    Admin: getByNameAt('roles', '༄ Admin', 0), // Admin -> 1442568893435478097
    HighStaff: getByNameAt('roles', '༄ High Staff', 0), // High Staff -> 1442568894349840435
    Supervisor: getByNameAt('roles', '༄ Supervisor', 0), // Supervisor -> 1442568896237277295
    Coordinator: getByNameAt('roles', '༄ Coordinator', 0), // Coordinator -> 1442568897902678038
    Mod: getByNameAt('roles', '༄ Mod', 0), // Mod -> 1442568901887000618
    Helper: getByNameAt('roles', '༄ Helper', 0), // Helper -> 1442568904311570555
    PartnerManager: getByNameAt('roles', '༄ Partner Manager', 0), // Partner Manager -> 1442568905582317740
    Staff: getByNameAt('roles', '༄ Staff', 0), // Staff -> 1442568910070349985
    separatore2: getByNameAt('roles', '。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。', 1), // . . -> 1469759519159615620
    redPlus: getByNameAt('roles', '༄ Red Gradientᵖˡᵘˢ', 0), // Red Gradientplus -> 1469759694930182284
    orangePlus: getByNameAt('roles', '༄ Orange Gradientᵖˡᵘˢ', 0), // Orange Gradientplus -> 1469759700944814231
    yellowPlus: getByNameAt('roles', '༄ Yellow Gradientᵖˡᵘˢ', 0), // Yellow Gradientplus -> 1469759704380084384
    greenPlus: getByNameAt('roles', '༄ Green Gradientᵖˡᵘˢ', 0), // Green Gradientplus -> 1469759708742160537
    bluePlus: getByNameAt('roles', '༄ Blue Gradientᵖˡᵘˢ', 0), // Blue Gradientplus -> 1469759714094088327
    purplePlus: getByNameAt('roles', '༄ Purple Gradientᵖˡᵘˢ', 0), // Purple Gradientplus -> 1469759719194230906
    pinkPlus: getByNameAt('roles', '༄ Pink Gradientᵖˡᵘˢ', 0), // Pink Gradientplus -> 1469759723418026233
    blackPlus: getByNameAt('roles', '༄ Black Gradientᵖˡᵘˢ', 0), // Black Gradientplus -> 1469759731945177182
    grayPlus: getByNameAt('roles', '༄ Gray Gradientᵖˡᵘˢ', 0), // Gray Gradientplus -> 1469760931113336864
    whitePlus: getByNameAt('roles', '༄ White Gradientᵖˡᵘˢ', 0), // White Gradientplus -> 1469761030417809675
    YinYangPlus: getByNameAt('roles', '༄ Yin & Yangᵖˡᵘˢ', 0), // Yin & Yangplus -> 1469761114140315831
    separatore3: getByNameAt('roles', '。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。', 2), // . . -> 1469452818351001772
    Cherry: getByNameAt('roles', '༄ Cherry', 0), // Cherry -> 1442568958656905318
    Blood: getByNameAt('roles', '༄ Blood', 0), // Blood -> 1442568956832645212
    Scarlet: getByNameAt('roles', '༄ Scarlet', 0), // Scarlet -> 1442568961077153994
    Coral: getByNameAt('roles', '༄ Coral', 0), // Coral -> 1442568960016121998
    Carrot: getByNameAt('roles', '༄ Carrot', 0), // Carrot -> 1442568963836874886
    Pumpkin: getByNameAt('roles', '༄ Pumpkin', 0), // Pumpkin -> 1442568965040636019
    Orange: getByNameAt('roles', '༄ Orange', 0), // Orange -> 1442568967045648412
    Peach: getByNameAt('roles', '༄ Peach', 0), // Peach -> 1442568962167541760
    Mais: getByNameAt('roles', '༄ Mais', 0), // Mais -> 1442568968371048449
    Gold: getByNameAt('roles', '༄ Gold', 0), // Gold -> 1442568969528541225
    Amber: getByNameAt('roles', '༄ Amber', 0), // Amber -> 1442568970497687717
    Lime: getByNameAt('roles', '༄ Lime', 0), // Lime -> 1442568971357388912
    Pear: getByNameAt('roles', '༄ Pear', 0), // Pear -> 1442568972745838667
    Moss: getByNameAt('roles', '༄ Moss', 0), // Moss -> 1442568975966797926
    Green: getByNameAt('roles', '༄ Green', 0), // Green -> 1442568976944201828
    Olive: getByNameAt('roles', '༄ Olive', 0), // Olive -> 1442568974486208634
    Aqua: getByNameAt('roles', '༄ Aqua', 0), // Aqua -> 1442568977896439960
    Blue: getByNameAt('roles', '༄ Blue', 0), // Blue -> 1442568979473371258
    ElectricBlue: getByNameAt('roles', '༄ Electric Blue', 0), // Electric Blue -> 1442568980626673685
    MidnightBlue: getByNameAt('roles', '༄ Midnight Blue', 0), // Midnight Blue -> 1442568981792948304
    Eggplant: getByNameAt('roles', '༄ Eggplant', 0), // Eggplant -> 1442568982769959002
    Purple: getByNameAt('roles', '༄ Purple', 0), // Purple -> 1442568983898357954
    Lilac: getByNameAt('roles', '༄ Lilac', 0), // Lilac -> 1442568985278156971
    Sangria: getByNameAt('roles', '༄ Sangria', 0), // Sangria -> 1442568986720993350
    BlackCat: getByNameAt('roles', '༄ Black Cat', 0), // Black Cat -> 1442568987887276133
    GreySmoke: getByNameAt('roles', '༄ Grey Smoke', 0), // Grey Smoke -> 1442568988961013821
    Grey: getByNameAt('roles', '༄ Grey', 0), // Grey -> 1442568989866725468
    White: getByNameAt('roles', '༄ White', 0), // White -> 1442568991150309578
    separatore4: getByNameAt('roles', '。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。', 3), // . . -> 1469452890761596981
    customrole1: getByNameAt('roles', '༄ The Moon Is Beautiful, Isn\'t It?', 0), // The Moon Is Beautiful, Isn't It? -> 1442568940579459102
    customrole2: getByNameAt('roles', '༄ Poetry Crew', 0), // Poetry Crew -> 1442568942194393211
    customrole3: getByNameAt('roles', '༄ Jolly', 0), // Jolly -> 1442568943834234890
    Muted: getByNameAt('roles', '༄ Muted', 0), // Muted -> 1442568884833095832
    blackilistPartner: getByNameAt('roles', '༄ No Partner', 0), // No Partner -> 1443252279477272647
    blacklistTicket: getByNameAt('roles', '༄ No Ticket', 0), // No Ticket -> 1463248847768785038
    blacklistModuli: getByNameAt('roles', '༄ No Moduli', 0), // No Moduli -> 1463248874725576879
    Incense: getByNameAt('roles', '༄ Incense', 0), // Incense -> 1442568951912726628
    separatore5: getByNameAt('roles', 'ㅤㅤㅤㅤ       ㅤ・BADGEs・ㅤ    ㅤㅤㅤ', 0), // BADGEs -> 1468674171213971568
    VIP: getByNameAt('roles', '༄ VIP', 0), // VIP -> 1442568950805430312
    Donator: getByNameAt('roles', '༄ Donator', 0), // Donator -> 1442568916114346096
    ServerBooster: getByNameAt('roles', '༄ Server Booster', 0), // Server Booster -> 1329497467481493607
    Promoter: getByNameAt('roles', '༄ Promoter', 0), // Promoter -> 1469758545263198442
    Voter: getByNameAt('roles', '༄ Voter', 0), // Voter -> 1468266342682722679
    Supporter: getByNameAt('roles', '༄ Supporter', 0), // Supporter -> 1442568948271943721
    TopWeeklyVoc: getByNameAt('roles', '༄ Top Weekly Voc', 0), // Top Weekly Voc -> 1468674787399172208
    TopWeeklyText: getByNameAt('roles', '༄ Top Weekly Text', 0), // Top Weekly Text -> 1468674837957574757
    Verificato: getByNameAt('roles', '༄ Verificato', 0), // Verificato -> 1469040179799920801
    Verificata: getByNameAt('roles', '༄ Verificata', 0), // Verificata -> 1469040190730408018
    OG: getByNameAt('roles', '༄ OG', 0), // OG -> 1469041493401534644
    Veterano: getByNameAt('roles', '༄ Veterano', 0), // Veterano -> 1469073503025103113
    NuovoUtente: getByNameAt('roles', '༄ Nuovo Utente', 0), // Nuovo Utente -> 1469041461294268489
    Member: getByNameAt('roles', '༄ Member', 0), // Member -> 1442568949605597264
    Bots: getByNameAt('roles', '༄ Bots', 0), // Bots -> 1442568954181713982
    separatore6: getByNameAt('roles', 'ㅤ ㅤㅤ   ㅤ       ㅤ・SPECIALI・ㅤㅤㅤㅤ', 0), // SPECIALI -> 1442568938457399299
    PicPerms: getByNameAt('roles', '༄ PicPerms', 0), // PicPerms -> 1468938195348754515
    Strategist: getByNameAt('roles', '༄ Strategist⁺¹⁰⁰⁰⁰⁰', 0), // Strategist+100000 -> 1468675595058811075
    Mentor: getByNameAt('roles', '༄ Mentor⁺⁵⁰⁰⁰⁰', 0), // Mentor+50000 -> 1468675590747062355
    Vanguard: getByNameAt('roles', '༄ Vanguard⁺¹⁰⁰⁰⁰', 0), // Vanguard+10000 -> 1468675587747877028
    Achivier: getByNameAt('roles', '༄ Achivier⁺⁵⁰⁰⁰', 0), // Achivier+5000 -> 1468675584094769427
    Tracker: getByNameAt('roles', '༄ Tracker⁺²⁵⁰⁰', 0), // Tracker+2500 -> 1468675580609429536
    Explorer: getByNameAt('roles', '༄ Explorer⁺¹⁵⁰⁰', 0), // Explorer+1500 -> 1468675576326918302
    Scout: getByNameAt('roles', '༄ Scout⁺¹⁰⁰⁰', 0), // Scout+1000 -> 1468675570865803407
    Rookie: getByNameAt('roles', '༄ Rookie⁺⁵⁰⁰', 0), // Rookie+500 -> 1468675567015428239
    Initiate: getByNameAt('roles', '༄ Initiate⁺¹⁰⁰', 0), // Initiate+100 -> 1468675561948971058
    separatore7: getByNameAt('roles', 'ㅤㅤㅤㅤㅤㅤㅤ・LIVELLI・ㅤ       ㅤㅤㅤ', 0), // LIVELLI -> 1442568928667631738
    Level100: getByNameAt('roles', '༄ Level 100+', 0), // Level 100+ -> 1442568929930379285
    Level70: getByNameAt('roles', '༄ Level 70+', 0), // Level 70+ -> 1442568931326824488
    Level50: getByNameAt('roles', '༄ Level 50+', 0), // Level 50+ -> 1442568932136587297
    Level30: getByNameAt('roles', '༄ Level 30+', 0), // Level 30+ -> 1442568933591748688
    Level20: getByNameAt('roles', '༄ Level 20+', 0), // Level 20+ -> 1442568934510297226
    Level10: getByNameAt('roles', '༄ Level 10+', 0), // Level 10+ -> 1442568936423034940
    separatore8: getByNameAt('roles', 'ㅤ    ㅤㅤㅤㅤㅤ・SELF ROLES・ㅤ    ㅤ ㅤ', 0), // SELF ROLES -> 1442568992459067423
    1314: getByNameAt('roles', '༄ 13-14', 0), // 13-14 -> 1442568993197265021
    1516: getByNameAt('roles', '༄ 15-16', 0), // 15-16 -> 1442568994581381170
    1718: getByNameAt('roles', '༄ 17-18', 0), // 17-18 -> 1442568995348807691
    19: getByNameAt('roles', '༄ 19+', 0), // 19+ -> 1442568996774871194
    heHim: getByNameAt('roles', '༄ He/Him', 0), // He/Him -> 1442568997848743997
    sheHer: getByNameAt('roles', '༄ She/Her', 0), // She/Her -> 1442568999043989565
    theyThem: getByNameAt('roles', '༄ They/Them', 0), // They/Them -> 1442569000063074498
    askMe: getByNameAt('roles', '༄ Ask Me', 0), // Ask Me -> 1442569001367769210
    DMsOpened: getByNameAt('roles', '༄ DMs Opened', 0), // DMs Opened -> 1442569004215697438
    DMsClosed: getByNameAt('roles', '༄ DMs Closed', 0), // DMs Closed -> 1442569005071077417
    AsktoDM: getByNameAt('roles', '༄ Ask to DM', 0), // Ask to DM -> 1442569006543274126
    ReviveChat: getByNameAt('roles', '༄ Revive Chat', 0), // Revive Chat -> 1442569009567629375
    Events: getByNameAt('roles', '༄ Events', 0), // Events -> 1442569012063109151
    News: getByNameAt('roles', '༄ News', 0), // News -> 1442569010943365342
    Polls: getByNameAt('roles', '༄ Polls', 0), // Polls -> 1442569014474965033
    Bump: getByNameAt('roles', '༄ Bump', 0), // Bump -> 1442569013074071644
    Minigames: getByNameAt('roles', '༄ Minigames', 0), // Minigames -> 1443955529352478830
    Forum: getByNameAt('roles', '༄ Forum', 0), // Forum -> 1447597930944008376
    Nord: getByNameAt('roles', '༄ Nord', 0), // Nord -> 1442569021861007443
    Centro: getByNameAt('roles', '༄ Centro', 0), // Centro -> 1442569023303974922
    Sud: getByNameAt('roles', '༄ Sud', 0), // Sud -> 1442569024486506498
    Estero: getByNameAt('roles', '༄ Estero', 0), // Estero -> 1442569025790939167
    Fidanzato: getByNameAt('roles', '༄ Fidanzato', 0), // Fidanzato -> 1442569028173299732
    Single: getByNameAt('roles', '༄ Single', 0), // Single -> 1442569029263818906
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
    .replace(/^༄\s*/u, '')
    .replace(/\s*->.*$/u, '')
    .replace(/^.*?︲/u, '')
    .replace(/['’`]/g, '')
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
