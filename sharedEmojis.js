/**
 * Emoji condivise tra Bot Ufficiale e Bot Test.
 * Le emoji custom sono del server (guild), non del bot: se entrambi i bot sono
 * nello stesso server, queste stringhe funzionano in entrambi.
 *
 * Uso dal Bot Ufficiale:  const E = require('../sharedEmojis');
 * Uso dal Bot Test:       const E = require('../sharedEmojis');
 * Poi in un messaggio:    E.VC_Arrow, E.xdivisore, ecc.
 */
module.exports = {
  VC_Arrow: '<a:VC_Arrow:1448672967721615452>',
  VC_RightWing: '<a:VC_RightWing:1448672889845973214>',
  VC_Exclamation: '<a:VC_Exclamation:1448687427836444854>',
  flyingnitroboost: '<a:flyingnitroboost:1443652205705170986>',
  xdivisore: '<a:xdivisore:1471892113426874531>',
  LC_wNew: '<:LC_wNew:1471891729471770819>',
  PinkQuestionMark: '<:PinkQuestionMark:1471892611026391306>',
  VC_PepeComfy: '<:VC_PepeComfy:1331591439599272004>',
  dot: '<:dot:1443660294596329582>',
  reportmessage: '<:reportmessage:1443670575376765130>',
  discordstaff: '<:discordstaff:1443651872258003005>',
  attentionfromvega: '<:attentionfromvega:1443651874032062505>',
  vegax: '<:vegax:1443934876440068179>',
  vegacheckmark: '<:vegacheckmark:1443666279058772028>'
};
