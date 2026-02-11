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
    category1: getAt('categories', catalog.entries.categories[0]?.name, 0), // 01 START -> 1442847153474109500
    category2: getAt('categories', catalog.entries.categories[1]?.name, 0), // 02 INFO -> 1442569064793903356
    category3: getAt('categories', catalog.entries.categories[2]?.name, 0), // 03 COMMUNITY -> 1442569067473928243
    category4: getAt('categories', catalog.entries.categories[3]?.name, 0), // 04 PERKS -> 1442569069613289595
    category5: getAt('categories', catalog.entries.categories[4]?.name, 0), // 05 GAMES -> 1442569074310643845
    category6: getAt('categories', catalog.entries.categories[5]?.name, 0), // 06 PUBLICS -> 1442569076902989844
    category7: getAt('categories', catalog.entries.categories[6]?.name, 0), // 07 PRIVATE -> 1442569078379118755
    category8: getAt('categories', catalog.entries.categories[7]?.name, 0), // 08 SPONSOR -> 1442569081214599223
    category9: getAt('categories', catalog.entries.categories[8]?.name, 0), // 09 PARTNER -> 1442569079931146240
    category10: getAt('categories', catalog.entries.categories[9]?.name, 0), // 10 STAFF -> 1442569084414853232
    category11: getAt('categories', catalog.entries.categories[10]?.name, 0), // 11 BENCH -> 1442569086717530142
    category12: getAt('categories', catalog.entries.categories[11]?.name, 0), // 12 REPORT -> 1443250372482306150
    category13: getAt('categories', catalog.entries.categories[12]?.name, 0), // 13 CHAT -> 1442569090219773993
    category14: getAt('categories', catalog.entries.categories[13]?.name, 0), // 14 SYSTEM -> 1442569088705630410
    category15: getAt('categories', catalog.entries.categories[14]?.name, 0), // 15 MID/HIGH -> 1442569091301773312
    category16: getAt('categories', catalog.entries.categories[15]?.name, 0), // 16 LOGS -> 1442569092761391178
    mediaExemptCategory: getAt('categories', catalog.entries.categories[12]?.name, 0), // 13 CHAT -> 1442569090219773993
    customVoiceCategory: getAt('categories', catalog.entries.categories[6]?.name, 0), // 07 PRIVATE -> 1442569078379118755
    expExcludedCategory: getAt('categories', catalog.entries.categories[4]?.name, 0), // 05 GAMES -> 1442569074310643845
  },

  channels: {
    channel1: getAt('channels', catalog.entries.channels[0]?.name, 0), // channels -> 1442569132406083748
    channel2: getAt('channels', catalog.entries.channels[1]?.name, 1), // channels -> 1442569197019463780
    channel3: getAt('channels', catalog.entries.channels[2]?.name, 2), // channels -> 1442569107923795998
    channel4: getAt('channels', catalog.entries.channels[3]?.name, 3), // channels -> 1442569098121711818
    channel5: getAt('channels', catalog.entries.channels[4]?.name, 4), // channels -> 1446492233002909848
    channel6: getAt('channels', catalog.entries.channels[5]?.name, 5), // channels -> 1442569280326602964
    channel7: getAt('channels', catalog.entries.channels[6]?.name, 6), // channels -> 1470775925426618468
    channel8: getAt('channels', catalog.entries.channels[7]?.name, 7), // channels -> 1442569143948804198
    channel9: getAt('channels', catalog.entries.channels[8]?.name, 8), // channels -> 1442569117717626930
    channel10: getAt('channels', catalog.entries.channels[9]?.name, 9), // channels -> 1442938093165613118
    channel11: getAt('channels', catalog.entries.channels[10]?.name, 0), // pause -> 1442569255315832945
    channel12: getAt('channels', catalog.entries.channels[11]?.name, 0), // User: 324 -> 1442569096700104754
    channel13: getAt('channels', catalog.entries.channels[12]?.name, 0), // caffe borbone -> 1461432266457878548
    channel14: getAt('channels', catalog.entries.channels[13]?.name, 0), // sanzioni -> 1442569245878648924
    channel15: getAt('channels', catalog.entries.channels[14]?.name, 0), // poketwo -> 1442569184281362552
    channel16: getAt('channels', catalog.entries.channels[15]?.name, 0), // Trio3 -> 1470170531830693989
    channel17: getAt('channels', catalog.entries.channels[16]?.name, 0), // staffers -> 1442569260059725844
    channel18: getAt('channels', catalog.entries.channels[17]?.name, 0), // chat -> 1442569130573303898
    channel19: getAt('channels', catalog.entries.channels[18]?.name, 0), // channel roles logs -> 1442569302422192209
    channel20: getAt('channels', catalog.entries.channels[19]?.name, 0), // The Moon Is Beautiful, Isn't It -> 1442569150575935781
    channel21: getAt('channels', catalog.entries.channels[20]?.name, 0), // Lounge2 -> 1442569106514645042
    channel22: getAt('channels', catalog.entries.channels[21]?.name, 0), // partners -> 1442569209849843823
    channel23: getAt('channels', catalog.entries.channels[22]?.name, 0), // Squad3 -> 1470170601154150686
    channel24: getAt('channels', catalog.entries.channels[23]?.name, 0), // birthday -> 1468233267458084884
    channel25: getAt('channels', catalog.entries.channels[24]?.name, 0), // events -> 1442569164488442129
    channel26: getAt('channels', catalog.entries.channels[25]?.name, 0), // mudae -> 1442569182825681077
    channel27: getAt('channels', catalog.entries.channels[26]?.name, 0), // Duo1 -> 1442569113108218058
    channel28: getAt('channels', catalog.entries.channels[27]?.name, 0), // Squad1 -> 1442569134532726855
    channel29: getAt('channels', catalog.entries.channels[28]?.name, 0), // roles -> 1469429150669602961
    channel30: getAt('channels', catalog.entries.channels[29]?.name, 0), // Circo di Diunk -> 1442569156695294078
    channel31: getAt('channels', catalog.entries.channels[30]?.name, 0), // tickets -> 1442569095068254219
    channel32: getAt('channels', catalog.entries.channels[31]?.name, 0), // ticket logs -> 1442569290682208296
    channel33: getAt('channels', catalog.entries.channels[32]?.name, 0), // Duo2 -> 1442569114785943713
    channel34: getAt('channels', catalog.entries.channels[33]?.name, 0), // Squad2 -> 1442569140077461613
    channel35: getAt('channels', catalog.entries.channels[34]?.name, 0), // gradi -> 1460407013925327033
    channel36: getAt('channels', catalog.entries.channels[35]?.name, 0), // music -> 1442569189486497905
    channel37: getAt('channels', catalog.entries.channels[36]?.name, 0), // poll best staff -> 1446104429181927434
    channel38: getAt('channels', catalog.entries.channels[37]?.name, 0), // best staff -> 1442569253281730653
    channel39: getAt('channels', catalog.entries.channels[38]?.name, 0), // top weekly -> 1470183921236049940
    channel40: getAt('channels', catalog.entries.channels[39]?.name, 0), // info -> 1442569111119990887
    channel41: getAt('channels', catalog.entries.channels[40]?.name, 0), // hamster house -> 1448693699432153218
    channel42: getAt('channels', catalog.entries.channels[41]?.name, 0), // high -> 1442569285909217301
    channel43: getAt('channels', catalog.entries.channels[42]?.name, 0), // Duo3 -> 1470170379078078656
    channel44: getAt('channels', catalog.entries.channels[43]?.name, 0), // warn staff -> 1443250635108646943
    channel45: getAt('channels', catalog.entries.channels[44]?.name, 0), // inferius -> 1461387182840479927
    channel46: getAt('channels', catalog.entries.channels[45]?.name, 0), // ship -> 1469685688814407726
    channel47: getAt('channels', catalog.entries.channels[46]?.name, 0), // suggestions -> 1442569147559973094
    channel48: getAt('channels', catalog.entries.channels[47]?.name, 0), // AFK -> 1442569145995759756
    channel49: getAt('channels', catalog.entries.channels[48]?.name, 0), // quotes -> 1468540884537573479
    channel50: getAt('channels', catalog.entries.channels[49]?.name, 0), // Lounge3 -> 1470168983507435631
    channel51: getAt('channels', catalog.entries.channels[50]?.name, 0), // staff pagato -> 1442579412280410194
    channel52: getAt('channels', catalog.entries.channels[51]?.name, 0), // click me -> 1442569058406109216
    channel53: getAt('channels', catalog.entries.channels[52]?.name, 0), // staff list -> 1442569235426705653
    channel54: getAt('channels', catalog.entries.channels[53]?.name, 0), // valutazioni -> 1442569249649459340
    channel55: getAt('channels', catalog.entries.channels[54]?.name, 0), // punti tolti -> 1442569257375367320
    channel56: getAt('channels', catalog.entries.channels[55]?.name, 0), // polls -> 1442569128706838528
    channel57: getAt('channels', catalog.entries.channels[56]?.name, 0), // resoconti -> 1442569270784692306
    channel58: getAt('channels', catalog.entries.channels[57]?.name, 0), // guida middle -> 1442569266066096309
    channel59: getAt('channels', catalog.entries.channels[58]?.name, 0), // regolamento -> 1442569199229730836
    channel60: getAt('channels', catalog.entries.channels[59]?.name, 0), // guida staff -> 1442569237142044773
    channel61: getAt('channels', catalog.entries.channels[60]?.name, 0), // description -> 1442569194905534494
    channel62: getAt('channels', catalog.entries.channels[61]?.name, 0), // candidature -> 1442569232507473951
    channel63: getAt('channels', catalog.entries.channels[62]?.name, 0), // visione moduli -> 1442569278049095913
    channel64: getAt('channels', catalog.entries.channels[63]?.name, 0), // news -> 1442569115972669541
    channel65: getAt('channels', catalog.entries.channels[64]?.name, 0), // staff news -> 1442569239063167139
    channel66: getAt('channels', catalog.entries.channels[65]?.name, 0), // media -> 1442569136067575809
    channel67: getAt('channels', catalog.entries.channels[66]?.name, 0), // selfie verificati -> 1470029899740873029
    channel68: getAt('channels', catalog.entries.channels[67]?.name, 0), // forum -> 1442569141717438495
    channel69: getAt('channels', catalog.entries.channels[68]?.name, 0), // no mic -> 1442569187376763010
    channel70: getAt('channels', catalog.entries.channels[69]?.name, 0), // verify -> 1442569059983163403
    channel71: getAt('channels', catalog.entries.channels[70]?.name, 0), // counting -> 1442569179743125554
    channel72: getAt('channels', catalog.entries.channels[71]?.name, 0), // Riunione Staff -> 1443958044802420798
    channel73: getAt('channels', catalog.entries.channels[72]?.name, 0), // commands -> 1442569138114662490
    channel74: getAt('channels', catalog.entries.channels[73]?.name, 0), // server bot logs -> 1442577274783142039
    channel75: getAt('channels', catalog.entries.channels[74]?.name, 0), // high cmds -> 1442569288161558528
    channel76: getAt('channels', catalog.entries.channels[75]?.name, 0), // staff cmds -> 1442569262689554444
    channel77: getAt('channels', catalog.entries.channels[76]?.name, 0), // partnerships -> 1442569193470824448
    channel78: getAt('channels', catalog.entries.channels[77]?.name, 0), // partner logs -> 1467533670129729680
    channel79: getAt('channels', catalog.entries.channels[78]?.name, 0), // Trio2 -> 1442569125753913498
    channel80: getAt('channels', catalog.entries.channels[79]?.name, 0), // Poetry Room -> 1442569152614367262
    channel81: getAt('channels', catalog.entries.channels[80]?.name, 0), // info sponsor -> 1442569211611185323
    channel82: getAt('channels', catalog.entries.channels[81]?.name, 0), // Lounge1 -> 1442569101225496819
    channel83: getAt('channels', catalog.entries.channels[82]?.name, 0), // veyronmc -> 1461369145860816947
    channel84: getAt('channels', catalog.entries.channels[83]?.name, 0), // middle -> 1442569268666568897
    channel85: getAt('channels', catalog.entries.channels[84]?.name, 0), // Trio1 -> 1442569121350025306
    channel86: getAt('channels', catalog.entries.channels[85]?.name, 0), // supporters -> 1442569123426074736
    channel87: getAt('channels', catalog.entries.channels[86]?.name, 0), // moderazione -> 1442569243626307634
    channel88: getAt('channels', catalog.entries.channels[87]?.name, 0), // mod logs -> 1442569294796820541
    channel89: getAt('channels', catalog.entries.channels[88]?.name, 0), // activity logs -> 1442569299725385851
    channel90: getAt('channels', catalog.entries.channels[89]?.name, 0), // join leave logs -> 1442569306608111776
    channel91: getAt('channels', catalog.entries.channels[90]?.name, 0), // pex depex -> 1442569234004709391
    channel92: getAt('channels', catalog.entries.channels[91]?.name, 0), // ai -> 1471108621629784104
    channel93: getAt('channels', catalog.entries.channels[92]?.name, 0), // Animali -> 1461423795246989478
    channel94: getAt('channels', catalog.entries.channels[93]?.name, 0), // Buoni propositi 2026 -> 1456349072473587936
    channel95: getAt('channels', catalog.entries.channels[94]?.name, 0), // Spotify Wrapped/Apple Music Replay '25 -> 1445792081271587000
    antiRaidLog: getAt('channels', catalog.entries.channels[87]?.name, 0), // mod logs -> 1442569294796820541
    commandError: getAt('channels', catalog.entries.channels[73]?.name, 0), // server bot logs -> 1442577274783142039
    counting: getAt('channels', catalog.entries.channels[70]?.name, 0), // counting -> 1442569179743125554
    forceDeleteAllMessages: getAt('channels', catalog.entries.channels[6]?.name, 6), // channels -> 1470775925426618468
    infoPanelCandidature: getAt('channels', catalog.entries.channels[61]?.name, 0), // candidature -> 1442569232507473951
    infoPanelSponsor: getAt('channels', catalog.entries.channels[80]?.name, 0), // info sponsor -> 1442569211611185323
    infoPerks: getAt('channels', catalog.entries.channels[39]?.name, 0), // info -> 1442569111119990887
    inviteLog: getAt('channels', catalog.entries.channels[89]?.name, 0), // join leave logs -> 1442569306608111776
    levelUp: getAt('channels', catalog.entries.channels[72]?.name, 0), // commands -> 1442569138114662490
    mediaExemptChannel: getAt('channels', catalog.entries.channels[65]?.name, 0), // media -> 1442569136067575809
    partnerManagerLeaveLog: getAt('channels', catalog.entries.channels[77]?.name, 0), // partner logs -> 1467533670129729680
    partnerOnboarding: getAt('channels', catalog.entries.channels[21]?.name, 0), // partners -> 1442569209849843823
    partnerPointsLog: getAt('channels', catalog.entries.channels[54]?.name, 0), // punti tolti -> 1442569257375367320
    partnershipPosts: getAt('channels', catalog.entries.channels[76]?.name, 0), // partnerships -> 1442569193470824448
    pauseAcceptedLog: getAt('channels', catalog.entries.channels[10]?.name, 0), // pause -> 1442569255315832945
    pauseRequestLog: getAt('channels', catalog.entries.channels[10]?.name, 0), // pause -> 1442569255315832945
    polls: getAt('channels', catalog.entries.channels[55]?.name, 0), // polls -> 1442569128706838528
    resignLog: getAt('channels', catalog.entries.channels[90]?.name, 0), // pex depex -> 1442569234004709391
    rolePanel: getAt('channels', catalog.entries.channels[28]?.name, 0), // roles -> 1469429150669602961
    skullboard: getAt('channels', catalog.entries.channels[48]?.name, 0), // quotes -> 1468540884537573479
    staffBest: getAt('channels', catalog.entries.channels[37]?.name, 0), // best staff -> 1442569253281730653
    staffGuide: getAt('channels', catalog.entries.channels[59]?.name, 0), // guida staff -> 1442569237142044773
    staffListChannel: getAt('channels', catalog.entries.channels[52]?.name, 0), // staff list -> 1442569235426705653
    staffModeration: getAt('channels', catalog.entries.channels[86]?.name, 0), // moderazione -> 1442569243626307634
    staffOnboarding: getAt('channels', catalog.entries.channels[16]?.name, 0), // staffers -> 1442569260059725844
    staffPaid: getAt('channels', catalog.entries.channels[50]?.name, 0), // staff pagato -> 1442579412280410194
    staffReportLog: getAt('channels', catalog.entries.channels[56]?.name, 0), // resoconti -> 1442569270784692306
    staffValutazioniLog: getAt('channels', catalog.entries.channels[53]?.name, 0), // valutazioni -> 1442569249649459340
    staffWarnLog: getAt('channels', catalog.entries.channels[43]?.name, 0), // warn staff -> 1443250635108646943
    stickyHelpA: getAt('channels', catalog.entries.channels[25]?.name, 0), // mudae -> 1442569182825681077
    stickyHelpB: getAt('channels', catalog.entries.channels[14]?.name, 0), // poketwo -> 1442569184281362552
    stickyHelpC: getAt('channels', catalog.entries.channels[45]?.name, 0), // ship -> 1469685688814407726
    suggestions: getAt('channels', catalog.entries.channels[46]?.name, 0), // suggestions -> 1442569147559973094
    thanks: getAt('channels', catalog.entries.channels[85]?.name, 0), // supporters -> 1442569123426074736
    ticketCloseLogAlt: getAt('channels', catalog.entries.channels[31]?.name, 0), // ticket logs -> 1442569290682208296
    ticketOpenPanelChannel: getAt('channels', catalog.entries.channels[30]?.name, 0), // tickets -> 1442569095068254219
    ticketPanel: getAt('channels', catalog.entries.channels[30]?.name, 0), // tickets -> 1442569095068254219
    totalVoiceCounter: getAt('channels', catalog.entries.channels[11]?.name, 0), // User: 324 -> 1442569096700104754
    verifyPanel: getAt('channels', catalog.entries.channels[69]?.name, 0), // verify -> 1442569059983163403
    verifyPing: getAt('channels', catalog.entries.channels[63]?.name, 0), // news -> 1442569115972669541
    weeklyWinners: getAt('channels', catalog.entries.channels[38]?.name, 0), // top weekly -> 1470183921236049940
  },

  roles: {
    role1: getAt('roles', catalog.entries.roles[0]?.name, 0), // Wick Premium -> 1443565454260965471
    role2: getAt('roles', catalog.entries.roles[1]?.name, 0), // Dyno -> 1329483828326174723
    role3: getAt('roles', catalog.entries.roles[2]?.name, 0), // Xenon -> 1329507234002108500
    role4: getAt('roles', catalog.entries.roles[3]?.name, 0), // Statbot -> 1442946432238882961
    role5: getAt('roles', catalog.entries.roles[4]?.name, 0), // ActivityRank -> 1458422199957586065
    role6: getAt('roles', catalog.entries.roles[5]?.name, 0), // Mudae -> 1442929251103014923
    role7: getAt('roles', catalog.entries.roles[6]?.name, 0), // Vote Manager -> 1468279483038437521
    role8: getAt('roles', catalog.entries.roles[7]?.name, 0), // DISBOARD.org -> 1442940553087025244
    role9: getAt('roles', catalog.entries.roles[8]?.name, 0), // Poketwo -> 1442929519705980998
    role10: getAt('roles', catalog.entries.roles[9]?.name, 0), // Jockie Music -> 1442946823340691552
    role11: getAt('roles', catalog.entries.roles[10]?.name, 0), // .fmbot -> 1468978359605395691
    role12: getAt('roles', catalog.entries.roles[11]?.name, 0), // Discadia -> 1468236145753067739
    role13: getAt('roles', catalog.entries.roles[12]?.name, 0), // Poke Name -> 1468978249152594135
    role14: getAt('roles', catalog.entries.roles[13]?.name, 0), // . . -> 1442568885869215975
    role15: getAt('roles', catalog.entries.roles[14]?.name, 0), // roles -> 1442568888096391260
    role16: getAt('roles', catalog.entries.roles[15]?.name, 0), // Founder -> 1442568886988963923
    role17: getAt('roles', catalog.entries.roles[16]?.name, 0), // Bot Ufficiale -> 1329119091348213854
    role18: getAt('roles', catalog.entries.roles[17]?.name, 0), // roles -> 1442568890075971724
    role19: getAt('roles', catalog.entries.roles[18]?.name, 0), // Staffer del mese -> 1442568895251611924
    role20: getAt('roles', catalog.entries.roles[19]?.name, 0), // Co Founder -> 1442568889052430609
    role21: getAt('roles', catalog.entries.roles[20]?.name, 0), // Manager -> 1442568891875201066
    role22: getAt('roles', catalog.entries.roles[21]?.name, 0), // Admin -> 1442568893435478097
    role23: getAt('roles', catalog.entries.roles[22]?.name, 0), // High Staff -> 1442568894349840435
    role24: getAt('roles', catalog.entries.roles[23]?.name, 0), // Supervisor -> 1442568896237277295
    role25: getAt('roles', catalog.entries.roles[24]?.name, 0), // Coordinator -> 1442568897902678038
    role26: getAt('roles', catalog.entries.roles[25]?.name, 0), // Mod -> 1442568901887000618
    role27: getAt('roles', catalog.entries.roles[26]?.name, 0), // Helper -> 1442568904311570555
    role28: getAt('roles', catalog.entries.roles[27]?.name, 0), // Partner Manager -> 1442568905582317740
    role29: getAt('roles', catalog.entries.roles[28]?.name, 0), // Staff -> 1442568910070349985
    role30: getAt('roles', catalog.entries.roles[29]?.name, 1), // . . -> 1469759519159615620
    role31: getAt('roles', catalog.entries.roles[30]?.name, 0), // Red Gradientplus -> 1469759694930182284
    role32: getAt('roles', catalog.entries.roles[31]?.name, 0), // Orange Gradientplus -> 1469759700944814231
    role33: getAt('roles', catalog.entries.roles[32]?.name, 0), // Yellow Gradientplus -> 1469759704380084384
    role34: getAt('roles', catalog.entries.roles[33]?.name, 0), // Green Gradientplus -> 1469759708742160537
    role35: getAt('roles', catalog.entries.roles[34]?.name, 0), // Blue Gradientplus -> 1469759714094088327
    role36: getAt('roles', catalog.entries.roles[35]?.name, 0), // Purple Gradientplus -> 1469759719194230906
    role37: getAt('roles', catalog.entries.roles[36]?.name, 0), // Pink Gradientplus -> 1469759723418026233
    role38: getAt('roles', catalog.entries.roles[37]?.name, 0), // Black Gradientplus -> 1469759731945177182
    role39: getAt('roles', catalog.entries.roles[38]?.name, 0), // Gray Gradientplus -> 1469760931113336864
    role40: getAt('roles', catalog.entries.roles[39]?.name, 0), // White Gradientplus -> 1469761030417809675
    role41: getAt('roles', catalog.entries.roles[40]?.name, 0), // Yin & Yangplus -> 1469761114140315831
    role42: getAt('roles', catalog.entries.roles[41]?.name, 2), // . . -> 1469452818351001772
    role43: getAt('roles', catalog.entries.roles[42]?.name, 0), // Cherry -> 1442568958656905318
    role44: getAt('roles', catalog.entries.roles[43]?.name, 0), // Blood -> 1442568956832645212
    role45: getAt('roles', catalog.entries.roles[44]?.name, 0), // Scarlet -> 1442568961077153994
    role46: getAt('roles', catalog.entries.roles[45]?.name, 0), // Coral -> 1442568960016121998
    role47: getAt('roles', catalog.entries.roles[46]?.name, 0), // Carrot -> 1442568963836874886
    role48: getAt('roles', catalog.entries.roles[47]?.name, 0), // Pumpkin -> 1442568965040636019
    role49: getAt('roles', catalog.entries.roles[48]?.name, 0), // Orange -> 1442568967045648412
    role50: getAt('roles', catalog.entries.roles[49]?.name, 0), // Peach -> 1442568962167541760
    role51: getAt('roles', catalog.entries.roles[50]?.name, 0), // Mais -> 1442568968371048449
    role52: getAt('roles', catalog.entries.roles[51]?.name, 0), // Gold -> 1442568969528541225
    role53: getAt('roles', catalog.entries.roles[52]?.name, 0), // Amber -> 1442568970497687717
    role54: getAt('roles', catalog.entries.roles[53]?.name, 0), // Lime -> 1442568971357388912
    role55: getAt('roles', catalog.entries.roles[54]?.name, 0), // Pear -> 1442568972745838667
    role56: getAt('roles', catalog.entries.roles[55]?.name, 0), // Moss -> 1442568975966797926
    role57: getAt('roles', catalog.entries.roles[56]?.name, 0), // Green -> 1442568976944201828
    role58: getAt('roles', catalog.entries.roles[57]?.name, 0), // Olive -> 1442568974486208634
    role59: getAt('roles', catalog.entries.roles[58]?.name, 0), // Aqua -> 1442568977896439960
    role60: getAt('roles', catalog.entries.roles[59]?.name, 0), // Blue -> 1442568979473371258
    role61: getAt('roles', catalog.entries.roles[60]?.name, 0), // Electric Blue -> 1442568980626673685
    role62: getAt('roles', catalog.entries.roles[61]?.name, 0), // Midnight Blue -> 1442568981792948304
    role63: getAt('roles', catalog.entries.roles[62]?.name, 0), // Eggplant -> 1442568982769959002
    role64: getAt('roles', catalog.entries.roles[63]?.name, 0), // Purple -> 1442568983898357954
    role65: getAt('roles', catalog.entries.roles[64]?.name, 0), // Lilac -> 1442568985278156971
    role66: getAt('roles', catalog.entries.roles[65]?.name, 0), // Sangria -> 1442568986720993350
    role67: getAt('roles', catalog.entries.roles[66]?.name, 0), // Black Cat -> 1442568987887276133
    role68: getAt('roles', catalog.entries.roles[67]?.name, 0), // Grey Smoke -> 1442568988961013821
    role69: getAt('roles', catalog.entries.roles[68]?.name, 0), // Grey -> 1442568989866725468
    role70: getAt('roles', catalog.entries.roles[69]?.name, 0), // White -> 1442568991150309578
    role71: getAt('roles', catalog.entries.roles[70]?.name, 3), // . . -> 1469452890761596981
    role72: getAt('roles', catalog.entries.roles[71]?.name, 0), // The Moon Is Beautiful, Isn't It? -> 1442568940579459102
    role73: getAt('roles', catalog.entries.roles[72]?.name, 0), // Poetry Crew -> 1442568942194393211
    role74: getAt('roles', catalog.entries.roles[73]?.name, 0), // Jolly -> 1442568943834234890
    role75: getAt('roles', catalog.entries.roles[74]?.name, 0), // Muted -> 1442568884833095832
    role76: getAt('roles', catalog.entries.roles[75]?.name, 0), // No Partner -> 1443252279477272647
    role77: getAt('roles', catalog.entries.roles[76]?.name, 0), // No Ticket -> 1463248847768785038
    role78: getAt('roles', catalog.entries.roles[77]?.name, 0), // No Moduli -> 1463248874725576879
    role79: getAt('roles', catalog.entries.roles[78]?.name, 0), // Incense -> 1442568951912726628
    role80: getAt('roles', catalog.entries.roles[79]?.name, 0), // BADGEs -> 1468674171213971568
    role81: getAt('roles', catalog.entries.roles[80]?.name, 0), // VIP -> 1442568950805430312
    role82: getAt('roles', catalog.entries.roles[81]?.name, 0), // Donator -> 1442568916114346096
    role83: getAt('roles', catalog.entries.roles[82]?.name, 0), // Server Booster -> 1329497467481493607
    role84: getAt('roles', catalog.entries.roles[83]?.name, 0), // Promoter -> 1469758545263198442
    role85: getAt('roles', catalog.entries.roles[84]?.name, 0), // Voter -> 1468266342682722679
    role86: getAt('roles', catalog.entries.roles[85]?.name, 0), // Supporter -> 1442568948271943721
    role87: getAt('roles', catalog.entries.roles[86]?.name, 0), // Top Weekly Voc -> 1468674787399172208
    role88: getAt('roles', catalog.entries.roles[87]?.name, 0), // Top Weekly Text -> 1468674837957574757
    role89: getAt('roles', catalog.entries.roles[88]?.name, 0), // Verificato -> 1469040179799920801
    role90: getAt('roles', catalog.entries.roles[89]?.name, 0), // Verificata -> 1469040190730408018
    role91: getAt('roles', catalog.entries.roles[90]?.name, 0), // OG -> 1469041493401534644
    role92: getAt('roles', catalog.entries.roles[91]?.name, 0), // Veterano -> 1469073503025103113
    role93: getAt('roles', catalog.entries.roles[92]?.name, 0), // Nuovo Utente -> 1469041461294268489
    role94: getAt('roles', catalog.entries.roles[93]?.name, 0), // Member -> 1442568949605597264
    role95: getAt('roles', catalog.entries.roles[94]?.name, 0), // Bots -> 1442568954181713982
    role96: getAt('roles', catalog.entries.roles[95]?.name, 0), // SPECIALI -> 1442568938457399299
    role97: getAt('roles', catalog.entries.roles[96]?.name, 0), // PicPerms -> 1468938195348754515
    role98: getAt('roles', catalog.entries.roles[97]?.name, 0), // Strategist+100000 -> 1468675595058811075
    role99: getAt('roles', catalog.entries.roles[98]?.name, 0), // Mentor+50000 -> 1468675590747062355
    role100: getAt('roles', catalog.entries.roles[99]?.name, 0), // Vanguard+10000 -> 1468675587747877028
    role101: getAt('roles', catalog.entries.roles[100]?.name, 0), // Achivier+5000 -> 1468675584094769427
    role102: getAt('roles', catalog.entries.roles[101]?.name, 0), // Tracker+2500 -> 1468675580609429536
    role103: getAt('roles', catalog.entries.roles[102]?.name, 0), // Explorer+1500 -> 1468675576326918302
    role104: getAt('roles', catalog.entries.roles[103]?.name, 0), // Scout+1000 -> 1468675570865803407
    role105: getAt('roles', catalog.entries.roles[104]?.name, 0), // Rookie+500 -> 1468675567015428239
    role106: getAt('roles', catalog.entries.roles[105]?.name, 0), // Initiate+100 -> 1468675561948971058
    role107: getAt('roles', catalog.entries.roles[106]?.name, 0), // LIVELLI -> 1442568928667631738
    role108: getAt('roles', catalog.entries.roles[107]?.name, 0), // Level 100+ -> 1442568929930379285
    role109: getAt('roles', catalog.entries.roles[108]?.name, 0), // Level 70+ -> 1442568931326824488
    role110: getAt('roles', catalog.entries.roles[109]?.name, 0), // Level 50+ -> 1442568932136587297
    role111: getAt('roles', catalog.entries.roles[110]?.name, 0), // Level 30+ -> 1442568933591748688
    role112: getAt('roles', catalog.entries.roles[111]?.name, 0), // Level 20+ -> 1442568934510297226
    role113: getAt('roles', catalog.entries.roles[112]?.name, 0), // Level 10+ -> 1442568936423034940
    role114: getAt('roles', catalog.entries.roles[113]?.name, 0), // SELF ROLES -> 1442568992459067423
    role115: getAt('roles', catalog.entries.roles[114]?.name, 0), // 13-14 -> 1442568993197265021
    role116: getAt('roles', catalog.entries.roles[115]?.name, 0), // 15-16 -> 1442568994581381170
    role117: getAt('roles', catalog.entries.roles[116]?.name, 0), // 17-18 -> 1442568995348807691
    role118: getAt('roles', catalog.entries.roles[117]?.name, 0), // 19+ -> 1442568996774871194
    role119: getAt('roles', catalog.entries.roles[118]?.name, 0), // He/Him -> 1442568997848743997
    role120: getAt('roles', catalog.entries.roles[119]?.name, 0), // She/Her -> 1442568999043989565
    role121: getAt('roles', catalog.entries.roles[120]?.name, 0), // They/Them -> 1442569000063074498
    role122: getAt('roles', catalog.entries.roles[121]?.name, 0), // Ask Me -> 1442569001367769210
    role123: getAt('roles', catalog.entries.roles[122]?.name, 0), // DMs Opened -> 1442569004215697438
    role124: getAt('roles', catalog.entries.roles[123]?.name, 0), // DMs Closed -> 1442569005071077417
    role125: getAt('roles', catalog.entries.roles[124]?.name, 0), // Ask to DM -> 1442569006543274126
    role126: getAt('roles', catalog.entries.roles[125]?.name, 0), // Revive Chat -> 1442569009567629375
    role127: getAt('roles', catalog.entries.roles[126]?.name, 0), // Events -> 1442569012063109151
    role128: getAt('roles', catalog.entries.roles[127]?.name, 0), // News -> 1442569010943365342
    role129: getAt('roles', catalog.entries.roles[128]?.name, 0), // Polls -> 1442569014474965033
    role130: getAt('roles', catalog.entries.roles[129]?.name, 0), // Bump -> 1442569013074071644
    role131: getAt('roles', catalog.entries.roles[130]?.name, 0), // Minigames -> 1443955529352478830
    role132: getAt('roles', catalog.entries.roles[131]?.name, 0), // Forum -> 1447597930944008376
    role133: getAt('roles', catalog.entries.roles[132]?.name, 0), // Nord -> 1442569021861007443
    role134: getAt('roles', catalog.entries.roles[133]?.name, 0), // Centro -> 1442569023303974922
    role135: getAt('roles', catalog.entries.roles[134]?.name, 0), // Sud -> 1442569024486506498
    role136: getAt('roles', catalog.entries.roles[135]?.name, 0), // Estero -> 1442569025790939167
    role137: getAt('roles', catalog.entries.roles[136]?.name, 0), // Fidanzato -> 1442569028173299732
    role138: getAt('roles', catalog.entries.roles[137]?.name, 0), // Single -> 1442569029263818906
    admin: getAt('roles', catalog.entries.roles[21]?.name, 0), // Admin -> 1442568893435478097
    autoAssignBotRole: getAt('roles', catalog.entries.roles[94]?.name, 0), // Bots -> 1442568954181713982
    bestStaff: getAt('roles', catalog.entries.roles[18]?.name, 0), // Staffer del mese -> 1442568895251611924
    coordinator: getAt('roles', catalog.entries.roles[24]?.name, 0), // Coordinator -> 1442568897902678038
    coOwner: getAt('roles', catalog.entries.roles[19]?.name, 0), // Co Founder -> 1442568889052430609
    customRoleAccessA: getAt('roles', catalog.entries.roles[80]?.name, 0), // VIP -> 1442568950805430312
    customRoleAccessB: getAt('roles', catalog.entries.roles[81]?.name, 0), // Donator -> 1442568916114346096
    customRoleAccessC: getAt('roles', catalog.entries.roles[82]?.name, 0), // Server Booster -> 1329497467481493607
    customRoleAccessD: getAt('roles', catalog.entries.roles[108]?.name, 0), // Level 70+ -> 1442568931326824488
    customRoleAnchor: getAt('roles', catalog.entries.roles[13]?.name, 0), // . . -> 1442568885869215975
    forumNotify: getAt('roles', catalog.entries.roles[131]?.name, 0), // Forum -> 1447597930944008376
    helper: getAt('roles', catalog.entries.roles[26]?.name, 0), // Helper -> 1442568904311570555
    highStaff: getAt('roles', catalog.entries.roles[22]?.name, 0), // High Staff -> 1442568894349840435
    inviteReward: getAt('roles', catalog.entries.roles[83]?.name, 0), // Promoter -> 1469758545263198442
    level10: getAt('roles', catalog.entries.roles[112]?.name, 0), // Level 10+ -> 1442568936423034940
    level20: getAt('roles', catalog.entries.roles[111]?.name, 0), // Level 20+ -> 1442568934510297226
    level30: getAt('roles', catalog.entries.roles[110]?.name, 0), // Level 30+ -> 1442568933591748688
    level50: getAt('roles', catalog.entries.roles[109]?.name, 0), // Level 50+ -> 1442568932136587297
    level70: getAt('roles', catalog.entries.roles[108]?.name, 0), // Level 70+ -> 1442568931326824488
    level100: getAt('roles', catalog.entries.roles[107]?.name, 0), // Level 100+ -> 1442568929930379285
    manager: getAt('roles', catalog.entries.roles[20]?.name, 0), // Manager -> 1442568891875201066
    mediaBypass: getAt('roles', catalog.entries.roles[96]?.name, 0), // PicPerms -> 1468938195348754515
    mentionBump: getAt('roles', catalog.entries.roles[129]?.name, 0), // Bump -> 1442569013074071644
    mentionEvents: getAt('roles', catalog.entries.roles[126]?.name, 0), // Events -> 1442569012063109151
    mentionNews: getAt('roles', catalog.entries.roles[127]?.name, 0), // News -> 1442569010943365342
    mentionPolls: getAt('roles', catalog.entries.roles[128]?.name, 0), // Polls -> 1442569014474965033
    mentionReviveChat: getAt('roles', catalog.entries.roles[125]?.name, 0), // Revive Chat -> 1442569009567629375
    minigameReward100: getAt('roles', catalog.entries.roles[105]?.name, 0), // Initiate+100 -> 1468675561948971058
    minigameReward500: getAt('roles', catalog.entries.roles[104]?.name, 0), // Rookie+500 -> 1468675567015428239
    minigameReward1000: getAt('roles', catalog.entries.roles[103]?.name, 0), // Scout+1000 -> 1468675570865803407
    minigameReward1500: getAt('roles', catalog.entries.roles[102]?.name, 0), // Explorer+1500 -> 1468675576326918302
    minigameReward2500: getAt('roles', catalog.entries.roles[101]?.name, 0), // Tracker+2500 -> 1468675580609429536
    minigameReward5000: getAt('roles', catalog.entries.roles[100]?.name, 0), // Achivier+5000 -> 1468675584094769427
    minigameReward10000: getAt('roles', catalog.entries.roles[99]?.name, 0), // Vanguard+10000 -> 1468675587747877028
    minigameReward50000: getAt('roles', catalog.entries.roles[98]?.name, 0), // Mentor+50000 -> 1468675590747062355
    minigameReward100000: getAt('roles', catalog.entries.roles[97]?.name, 0), // Strategist+100000 -> 1468675595058811075
    minigamesNotify: getAt('roles', catalog.entries.roles[130]?.name, 0), // Minigames -> 1443955529352478830
    moderator: getAt('roles', catalog.entries.roles[25]?.name, 0), // Mod -> 1442568901887000618
    owner: getAt('roles', catalog.entries.roles[15]?.name, 0), // Founder -> 1442568886988963923
    partnerManager: getAt('roles', catalog.entries.roles[27]?.name, 0), // Partner Manager -> 1442568905582317740
    plusColorAllowedA: getAt('roles', catalog.entries.roles[30]?.name, 0), // Red Gradientplus -> 1469759694930182284
    plusColorAllowedB: getAt('roles', catalog.entries.roles[31]?.name, 0), // Orange Gradientplus -> 1469759700944814231
    plusColorAllowedC: getAt('roles', catalog.entries.roles[32]?.name, 0), // Yellow Gradientplus -> 1469759704380084384
    plusColorAllowedD: getAt('roles', catalog.entries.roles[33]?.name, 0), // Green Gradientplus -> 1469759708742160537
    plusColorAllowedE: getAt('roles', catalog.entries.roles[34]?.name, 0), // Blue Gradientplus -> 1469759714094088327
    plusColorAllowedF: getAt('roles', catalog.entries.roles[35]?.name, 0), // Purple Gradientplus -> 1469759719194230906
    plusColorAllowedG: getAt('roles', catalog.entries.roles[36]?.name, 0), // Pink Gradientplus -> 1469759723418026233
    plusColorAllowedH: getAt('roles', catalog.entries.roles[37]?.name, 0), // Black Gradientplus -> 1469759731945177182
    plusColorAllowedI: getAt('roles', catalog.entries.roles[38]?.name, 0), // Gray Gradientplus -> 1469760931113336864
    plusColorAllowedJ: getAt('roles', catalog.entries.roles[39]?.name, 0), // White Gradientplus -> 1469761030417809675
    plusColorAllowedK: getAt('roles', catalog.entries.roles[40]?.name, 0), // Yin & Yangplus -> 1469761114140315831
    plusColorBooster: getAt('roles', catalog.entries.roles[82]?.name, 0), // Server Booster -> 1329497467481493607
    staff: getAt('roles', catalog.entries.roles[28]?.name, 0), // Staff -> 1442568910070349985
    supervisor: getAt('roles', catalog.entries.roles[23]?.name, 0), // Supervisor -> 1442568896237277295
    supporterLink: getAt('roles', catalog.entries.roles[85]?.name, 0), // Supporter -> 1442568948271943721
    ticketBlacklist: getAt('roles', catalog.entries.roles[76]?.name, 0), // No Ticket -> 1463248847768785038
    ticketPartnerBlacklist: getAt('roles', catalog.entries.roles[75]?.name, 0), // No Partner -> 1443252279477272647
    user: getAt('roles', catalog.entries.roles[93]?.name, 0), // Member -> 1442568949605597264
    verifiedUser: getAt('roles', catalog.entries.roles[88]?.name, 0), // Verificato -> 1469040179799920801
    verifyExtraA: getAt('roles', catalog.entries.roles[95]?.name, 0), // SPECIALI -> 1442568938457399299
    verifyExtraB: getAt('roles', catalog.entries.roles[113]?.name, 0), // SELF ROLES -> 1442568992459067423
    verifyExtraC: getAt('roles', catalog.entries.roles[79]?.name, 0), // BADGEs -> 1468674171213971568
    verifyExtraD: getAt('roles', catalog.entries.roles[106]?.name, 0), // LIVELLI -> 1442568928667631738
    verifyStage1: getAt('roles', catalog.entries.roles[92]?.name, 0), // Nuovo Utente -> 1469041461294268489
    verifyStage2: getAt('roles', catalog.entries.roles[91]?.name, 0), // Veterano -> 1469073503025103113
    verifyStage3: getAt('roles', catalog.entries.roles[90]?.name, 0), // OG -> 1469041493401534644
    voteReward: getAt('roles', catalog.entries.roles[84]?.name, 0), // Voter -> 1468266342682722679
    weeklyMessageWinner: getAt('roles', catalog.entries.roles[87]?.name, 0), // Top Weekly Text -> 1468674837957574757
    weeklyVoiceWinner: getAt('roles', catalog.entries.roles[86]?.name, 0), // Top Weekly Voc -> 1468674787399172208
  },

  bots: {
    bot1: getAt('bots', catalog.entries.bots[0]?.name, 0), // Xenon -> 416358583220043796
    bot2: getAt('bots', catalog.entries.bots[1]?.name, 0), // .fmbot -> 356268235697553409
    bot3: getAt('bots', catalog.entries.bots[2]?.name, 0), // Statbot -> 491769129318088714
    bot4: getAt('bots', catalog.entries.bots[3]?.name, 0), // Poketwo -> 716390085896962058
    bot5: getAt('bots', catalog.entries.bots[4]?.name, 0), // Vinili&CaffeBot -> 1329118940110127204
    bot6: getAt('bots', catalog.entries.bots[5]?.name, 0), // Discadia -> 1222548162741538938
    bot7: getAt('bots', catalog.entries.bots[6]?.name, 0), // Mudae -> 432610292342587392
    bot8: getAt('bots', catalog.entries.bots[7]?.name, 0), // Dyno -> 155149108183695360
    bot9: getAt('bots', catalog.entries.bots[8]?.name, 0), // Vote Manager -> 959699003010871307
    bot10: getAt('bots', catalog.entries.bots[9]?.name, 0), // Poke-Name -> 874910942490677270
    bot11: getAt('bots', catalog.entries.bots[10]?.name, 0), // Jockie Music -> 411916947773587456
    bot12: getAt('bots', catalog.entries.bots[11]?.name, 0), // Wick -> 548410451818708993
    bot13: getAt('bots', catalog.entries.bots[12]?.name, 0), // DISBOARD -> 302050872383242240
    bot14: getAt('bots', catalog.entries.bots[13]?.name, 0), // ActivityRank -> 534589798267224065
    voteManager: getAt('bots', catalog.entries.bots[8]?.name, 0), // Vote Manager -> 959699003010871307
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

// Alias lists (complete and categorized)
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
