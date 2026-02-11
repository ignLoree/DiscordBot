function parseNameIdText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf('->');
      if (idx === -1) return null;
      const name = line.slice(0, idx).trim();
      const id = line.slice(idx + 2).trim();
      if (!name || !/^\d{16,20}$/.test(id)) return null;
      return { name, id };
    })
    .filter(Boolean);
}

function toLastValueMap(entries) {
  const map = {};
  for (const entry of entries) map[entry.name] = entry.id;
  return map;
}

function toMultiValueMap(entries) {
  const map = {};
  for (const entry of entries) {
    if (!map[entry.name]) map[entry.name] = [];
    if (!map[entry.name].includes(entry.id)) map[entry.name].push(entry.id);
  }
  return map;
}

const categoriesRaw = `
⁰¹・ 　　　  　  　    START 　　    　　    ・ -> 1442847153474109500
⁰²・　　　　 　　INFO　　　　　・ -> 1442569064793903356
⁰³・ 　　　 　      COMMUNITY 　　   　    ・ -> 1442569067473928243
⁰⁴・ 　　　　    　    PERKS　　    　   　　 ・ -> 1442569069613289595
⁰⁵・ 　　　　　GAMES 　　　　　・ -> 1442569074310643845
⁰⁶・　　　　　PUBLICS　　　　　・ -> 1442569076902989844
⁰⁷・ 　　　　　     PRIVATE 　   　  　　  ・ -> 1442569078379118755
⁰⁸・　　　　　SPONSOR　　　　　・ -> 1442569081214599223
⁰⁹・ 　　　    　    PARTNER 　　    　    　・ -> 1442569079931146240
¹⁰・　　　　　　STAFF　　　　　・ -> 1442569084414853232
¹¹・ 　　    　   　　 BENCH 　　   　  　  ・ -> 1442569086717530142
¹²・ 　　　    　    REPORT　　 　　    　    ・ -> 1443250372482306150
¹³・ 　　　　    　    CHAT 　　    　　　    ・ -> 1442569090219773993
¹⁴・ 　　    　  　  　SYSTEM 　　    　  　  ・ -> 1442569088705630410
¹⁵・ 　　　　　   MID/HIGH　　　　・ -> 1442569091301773312
¹⁶・ 　    　　    　　LOGS 　　    　    　　・ -> 1442569092761391178
`;

const channelsRaw = `
〝 -> 1442569132406083748
〝 -> 1442569197019463780
〝 -> 1442569107923795998
〝 -> 1442569098121711818
〝 -> 1446492233002909848
〝 -> 1442569280326602964
〝 -> 1470775925426618468
〝 -> 1442569143948804198
〝 -> 1442569117717626930
〝 -> 1442938093165613118
༄⏸️︲pause -> 1442569255315832945
༄☕︲ User: 324 -> 1442569096700104754
༄☕︲caffè᲼borbone -> 1461432266457878548
༄⛔︲sanzioni -> 1442569245878648924
༄⛩️︲pokétwo -> 1442569184281362552
༄✨︲Trio³ -> 1470170531830693989
༄🌁︲staffers -> 1442569260059725844
༄🌃︲chat -> 1442569130573303898
༄🌐︲channel᲼roles᲼logs -> 1442569302422192209
༄🌙︲The Moon Is Beautiful, Isn't It -> 1442569150575935781
༄🌬️︲𝖫𝗈𝗎𝗇𝗀𝖾² -> 1442569106514645042
༄🌵︲partners -> 1442569209849843823
༄🍀︲Squad³ -> 1470170601154150686
༄🎂︲birthday -> 1468233267458084884
༄🎆︲events -> 1442569164488442129
༄🎎︲mudae -> 1442569182825681077
༄🎏︲Duo¹ -> 1442569113108218058
༄🎡︲Squad¹ -> 1442569134532726855
༄🎨︲roles -> 1469429150669602961
༄🎪︲Circo di Diunk -> 1442569156695294078
༄🎫︲tickets -> 1442569095068254219
༄🎫︲ticket᲼logs -> 1442569290682208296
༄🎭︲Duo² -> 1442569114785943713
༄🎯︲Squad² -> 1442569140077461613
༄🎲︲gradi -> 1460407013925327033
༄🎹︲music -> 1442569189486497905
༄🏅︲poll᲼best᲼staff -> 1446104429181927434
༄🏆︲best᲼staff -> 1442569253281730653
༄🏆︲top᲼weekly -> 1470183921236049940
༄🏡︲info -> 1442569111119990887
༄🐭︲hamster᲼house -> 1448693699432153218
༄👔︲high -> 1442569285909217301
༄👥︲Duo³ -> 1470170379078078656
༄👮︲warn᲼staff -> 1443250635108646943
༄👺︲inferius -> 1461387182840479927
༄💞︲ship -> 1469685688814407726
༄💡︲suggestions -> 1442569147559973094
༄💤︲𝖠𝖥𝖪 -> 1442569145995759756
༄💭︲quotes -> 1468540884537573479
༄💰︲𝖫𝗈𝗎𝗇𝗀𝖾³ -> 1470168983507435631
༄💸︲staff᲼pagato -> 1442579412280410194
༄📀︲click᲼me -> 1442569058406109216
༄📄︲staff᲼list -> 1442569235426705653
༄📈︲valutazioni -> 1442569249649459340
༄📉︲punti᲼tolti -> 1442569257375367320
༄📊︲polls -> 1442569128706838528
༄📊︲resoconti -> 1442569270784692306
༄📒︲guida᲼middle -> 1442569266066096309
༄📖︲regolamento -> 1442569199229730836
༄📚︲guida᲼staff -> 1442569237142044773
༄📜︲description -> 1442569194905534494
༄📝︲candidature -> 1442569232507473951
༄📬︲visione᲼moduli -> 1442569278049095913
༄📰︲news -> 1442569115972669541
༄📰︲staff᲼news -> 1442569239063167139
༄📲︲media -> 1442569136067575809
༄📸︲selfie᲼verificati -> 1470029899740873029
༄📺︲forum -> 1442569141717438495
༄🔇︲no᲼mic -> 1442569187376763010
༄🔍︲verify -> 1442569059983163403
༄🔢︲counting -> 1442569179743125554
༄🔬︲Riunione Staff -> 1443958044802420798
༄🕹️︲commands -> 1442569138114662490
༄🖥️︲server᲼bot᲼logs -> 1442577274783142039
༄🤖︲high᲼cmds -> 1442569288161558528
༄🤖︲staff᲼cmds -> 1442569262689554444
༄🤝︲partnerships -> 1442569193470824448
༄🤝︲partner᲼logs -> 1467533670129729680
༄🧆︲Trio² -> 1442569125753913498
༄🪅︲Poetry Room -> 1442569152614367262
༄🪇︲info᲼sponsor -> 1442569211611185323
༄🪤︲𝖫𝗈𝗎𝗇𝗀𝖾¹ -> 1442569101225496819
༄🪽︲veyronmc -> 1461369145860816947
༄🫀︲middle -> 1442569268666568897
༄🫘︲Trio¹ -> 1442569121350025306
༄🫦︲supporters -> 1442569123426074736
༄🚨︲moderazione -> 1442569243626307634
༄🚨︲mod᲼logs -> 1442569294796820541
༄🚩︲activity᲼logs -> 1442569299725385851
༄🛃︲join᲼leave᲼logs -> 1442569306608111776
༄🆙︲pex᲼depex -> 1442569234004709391
Animali -> 1461423795246989478
Buoni propositi 2026 -> 1456349072473587936
Spotify Wrapped/Apple Music Replay '25 -> 1445792081271587000
`;

const rolesRaw = `
༄ Wick Premium -> 1443565454260965471
༄ Dyno -> 1329483828326174723
༄ Xenon -> 1329507234002108500
༄ Statbot -> 1442946432238882961
༄ ActivityRank -> 1458422199957586065
༄ Mudae -> 1442929251103014923
༄ Vote Manager -> 1468279483038437521
༄ DISBOARD.org -> 1442940553087025244
༄ Pokétwo -> 1442929519705980998
༄ Jockie Music -> 1442946823340691552
༄ .fmbot -> 1468978359605395691
༄ Discadia -> 1468236145753067739
༄ Poke Name -> 1468978249152594135
。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。 -> 1442568885869215975
༄ 🔗 -> 1442568888096391260
༄ Founder -> 1442568886988963923
༄ Bot Ufficiale -> 1329119091348213854
༄ 🔑 -> 1442568890075971724
༄ Staffer del mese -> 1442568895251611924
༄ Co Founder -> 1442568889052430609
༄ Manager -> 1442568891875201066
༄ Admin -> 1442568893435478097
༄ High Staff -> 1442568894349840435
༄ Supervisor -> 1442568896237277295
༄ Coordinator -> 1442568897902678038
༄ Mod -> 1442568901887000618
༄ Helper -> 1442568904311570555
༄ Partner Manager -> 1442568905582317740
༄ Staff -> 1442568910070349985
。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。 -> 1469759519159615620
༄ Red Gradientᵖˡᵘˢ -> 1469759694930182284
༄ Orange Gradientᵖˡᵘˢ -> 1469759700944814231
༄ Yellow Gradientᵖˡᵘˢ -> 1469759704380084384
༄ Green Gradientᵖˡᵘˢ -> 1469759708742160537
༄ Blue Gradientᵖˡᵘˢ -> 1469759714094088327
༄ Purple Gradientᵖˡᵘˢ -> 1469759719194230906
༄ Pink Gradientᵖˡᵘˢ -> 1469759723418026233
༄ Black Gradientᵖˡᵘˢ -> 1469759731945177182
༄ Gray Gradientᵖˡᵘˢ -> 1469760931113336864
༄ White Gradientᵖˡᵘˢ -> 1469761030417809675
༄ Yin & Yangᵖˡᵘˢ -> 1469761114140315831
。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。 -> 1469452818351001772
༄ Cherry -> 1442568958656905318
༄ Blood -> 1442568956832645212
༄ Scarlet -> 1442568961077153994
༄ Coral -> 1442568960016121998
༄ Carrot -> 1442568963836874886
༄ Pumpkin -> 1442568965040636019
༄ Orange -> 1442568967045648412
༄ Peach -> 1442568962167541760
༄ Mais -> 1442568968371048449
༄ Gold -> 1442568969528541225
༄ Amber -> 1442568970497687717
༄ Lime -> 1442568971357388912
༄ Pear -> 1442568972745838667
༄ Moss -> 1442568975966797926
༄ Green -> 1442568976944201828
༄ Olive -> 1442568974486208634
༄ Aqua -> 1442568977896439960
༄ Blue -> 1442568979473371258
༄ Electric Blue -> 1442568980626673685
༄ Midnight Blue -> 1442568981792948304
༄ Eggplant -> 1442568982769959002
༄ Purple -> 1442568983898357954
༄ Lilac -> 1442568985278156971
༄ Sangria -> 1442568986720993350
༄ Black Cat -> 1442568987887276133
༄ Grey Smoke -> 1442568988961013821
༄ Grey -> 1442568989866725468
༄ White -> 1442568991150309578
。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。 -> 1469452890761596981
༄ The Moon Is Beautiful, Isn't It? -> 1442568940579459102
༄ Poetry Crew -> 1442568942194393211
༄ Jolly -> 1442568943834234890
༄ Muted -> 1442568884833095832
༄ No Partner -> 1443252279477272647
༄ No Ticket -> 1463248847768785038
༄ No Moduli -> 1463248874725576879
༄ Incense -> 1442568951912726628
ㅤㅤㅤㅤ       ㅤ・BADGEs・ㅤ    ㅤㅤㅤ -> 1468674171213971568
༄ VIP -> 1442568950805430312
༄ Donator -> 1442568916114346096
༄ Server Booster -> 1329497467481493607
༄ Promoter -> 1469758545263198442
༄ Voter -> 1468266342682722679
༄ Supporter -> 1442568948271943721
༄ Top Weekly Voc -> 1468674787399172208
༄ Top Weekly Text -> 1468674837957574757
༄ Verificato -> 1469040179799920801
༄ Verificata -> 1469040190730408018
༄ OG -> 1469041493401534644
༄ Veterano -> 1469073503025103113
༄ Nuovo Utente -> 1469041461294268489
༄ Member -> 1442568949605597264
༄ Bots -> 1442568954181713982
ㅤ ㅤㅤ   ㅤ       ㅤ・SPECIALI・ㅤㅤㅤㅤ -> 1442568938457399299
༄ PicPerms -> 1468938195348754515
༄ Strategist⁺¹⁰⁰⁰⁰⁰ -> 1468675595058811075
༄ Mentor⁺⁵⁰⁰⁰⁰ -> 1468675590747062355
༄ Vanguard⁺¹⁰⁰⁰⁰ -> 1468675587747877028
༄ Achivier⁺⁵⁰⁰⁰ -> 1468675584094769427
༄ Tracker⁺²⁵⁰⁰ -> 1468675580609429536
༄ Explorer⁺¹⁵⁰⁰ -> 1468675576326918302
༄ Scout⁺¹⁰⁰⁰ -> 1468675570865803407
༄ Rookie⁺⁵⁰⁰ -> 1468675567015428239
༄ Initiate⁺¹⁰⁰ -> 1468675561948971058
ㅤㅤㅤㅤㅤㅤㅤ・LIVELLI・ㅤ       ㅤㅤㅤ -> 1442568928667631738
༄ Level 100+ -> 1442568929930379285
༄ Level 70+ -> 1442568931326824488
༄ Level 50+ -> 1442568932136587297
༄ Level 30+ -> 1442568933591748688
༄ Level 20+ -> 1442568934510297226
༄ Level 10+ -> 1442568936423034940
ㅤ    ㅤㅤㅤㅤㅤ・SELF ROLES・ㅤ    ㅤ ㅤ -> 1442568992459067423
༄ 13-14 -> 1442568993197265021
༄ 15-16 -> 1442568994581381170
༄ 17-18 -> 1442568995348807691
༄ 19+ -> 1442568996774871194
༄ He/Him -> 1442568997848743997
༄ She/Her -> 1442568999043989565
༄ They/Them -> 1442569000063074498
༄ Ask Me -> 1442569001367769210
༄ DMs Opened -> 1442569004215697438
༄ DMs Closed -> 1442569005071077417
༄ Ask to DM -> 1442569006543274126
༄ Revive Chat -> 1442569009567629375
༄ Events -> 1442569012063109151
༄ News -> 1442569010943365342
༄ Polls -> 1442569014474965033
༄ Bump -> 1442569013074071644
༄ Minigames -> 1443955529352478830
༄ Forum -> 1447597930944008376
༄ Nord -> 1442569021861007443
༄ Centro -> 1442569023303974922
༄ Sud -> 1442569024486506498
༄ Estero -> 1442569025790939167
༄ Fidanzato -> 1442569028173299732
༄ Single -> 1442569029263818906
`;

const botsRaw = `
Xenon -> 416358583220043796
.fmbot -> 356268235697553409
Statbot -> 491769129318088714
Pokétwo -> 716390085896962058
Vinili&CaffèBot -> 1329118940110127204
Discadia -> 1222548162741538938
Mudae -> 432610292342587392
Dyno -> 155149108183695360
Vote Manager -> 959699003010871307
Poké-Name -> 874910942490677270
Jockie Music -> 411916947773587456
Wick -> 548410451818708993
DISBOARD -> 302050872383242240
ActivityRank -> 534589798267224065
`;

const categories = parseNameIdText(categoriesRaw);
const channels = parseNameIdText(channelsRaw);
const roles = parseNameIdText(rolesRaw);
const bots = parseNameIdText(botsRaw);

module.exports = {
  raw: {
    categories: categoriesRaw,
    channels: channelsRaw,
    roles: rolesRaw,
    bots: botsRaw
  },
  entries: {
    categories,
    channels,
    roles,
    bots
  },
  maps: {
    categories: toLastValueMap(categories),
    channels: toLastValueMap(channels),
    roles: toLastValueMap(roles),
    bots: toLastValueMap(bots)
  },
  multi: {
    categories: toMultiValueMap(categories),
    channels: toMultiValueMap(channels),
    roles: toMultiValueMap(roles),
    bots: toMultiValueMap(bots)
  },
  meta: {
    guildMain: '1329080093599076474',
    emojis: {
      loadingAnimatedId: '1448687876018540695',
      loadingFallbackId: '1462504528774430962'
    },
    links: {
      vote: 'https://discadia.com/server/viniliecaffe/',
      invite: 'https://discord.gg/viniliecaffe'
    }
  }
};
