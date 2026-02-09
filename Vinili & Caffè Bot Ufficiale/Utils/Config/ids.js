const config = require('../../config.json');

const pick = (value, fallback) => (value ? String(value) : fallback);

const roles = {
  staff: pick(config.staff, '1442568910070349985'),
  highStaff: pick(config.adminRoleIds, '1442568894349840435'),
  partnerManager: pick(config.partnerManager, '1442568905582317740'),
  owner: '1442568886988963923',
  coOwner: '1442568889052430609',
  manager: '1442568891875201066',
  admin: '1442568893435478097',
  supervisor: '1442568896237277295',
  coordinator: '1442568897902678038',
  moderator: '1442568901887000618',
  helper: '1442568904311570555',
  user: '1442568949605597264',
  ticketPartnerBlacklist: '1443252279477272647',
  ticketBlacklist: '1463248847768785038',
  voteReward: '1468266342682722679',
  inviteReward: '1469758545263198442',
  mediaBypass: '1468938195348754515',
  autoAssignBotRole: '1442568954181713982',
  supporterLink: '1442568948271943721',
  level10: '1442568936423034940',
  level20: '1442568934510297226',
  level30: '1442568933591748688',
  level50: '1442568932136587297',
  level70: '1442568931326824488',
  level100: '1442568929930379285',
  plusColorBooster: '1329497467481493607',
  plusColorAllowedA: '1469759694930182284',
  plusColorAllowedB: '1469759700944814231',
  plusColorAllowedC: '1469759704380084384',
  plusColorAllowedD: '1469759708742160537',
  plusColorAllowedE: '1469759714094088327',
  plusColorAllowedF: '1469759719194230906',
  plusColorAllowedG: '1469759723418026233',
  plusColorAllowedH: '1469759731945177182',
  plusColorAllowedI: '1469760931113336864',
  plusColorAllowedJ: '1469761030417809675',
  plusColorAllowedK: '1469761114140315831',
  verifyStage1: '1469041461294268489',
  verifyStage2: '1469073503025103113',
  verifyStage3: '1469041493401534644',
  verifyExtraA: '1442568938457399299',
  verifyExtraB: '1442568992459067423',
  verifyExtraC: '1468674171213971568',
  verifyExtraD: '1442568928667631738',
  customRoleAccessA: '1442568950805430312',
  customRoleAccessB: '1442568916114346096',
  customRoleAccessD: '1442568931326824488',
  customRoleAnchor: '1469452890761596981',
  weeklyMessageWinner: '1468674837957574757',
  weeklyVoiceWinner: '1468674787399172208',
  forumNotify: '1447597930944008376',
  minigameReward100: '1468675561948971058',
  minigameReward500: '1468675567015428239',
  minigameReward1000: '1468675570865803407',
  minigameReward1500: '1468675576326918302',
  minigameReward2500: '1468675580609429536',
  minigameReward5000: '1468675584094769427',
  minigameReward10000: '1468675587747877028',
  minigameReward50000: '1468675590747062355',
  minigameReward100000: '1468675595058811075'
};

const channels = {
  commandError: pick(config.commandErrorChannel, '1442577274783142039'),
  inviteLog: pick(config.morningReminder?.channelId, '1442569130573303898'),
  thanks: pick(config.boostChannelId, '1442569123426074736'),
  infoPerks: '1442569111119990887',
  counting: pick(config.counting?.channelId, '1442569179743125554'),
  mediaExemptCategory: '1442569056795230279',
  mediaExemptChannel: '1442569136067575809',
  totalVoiceCounter: '1442569096700104754',
  resignLog: '1442569234004709391',
  partnerManagerLeaveLog: '1467533670129729680',
  antiRaidLog: '1442569294796820541',
  ticketCloseLogAlt: '1442570210784591912',
  ticketPanel: '1442569095068254219',
  partnerOnboarding: '1442569209849843823',
  staffOnboarding: '1442569260059725844',
  staffWarnLog: '1443250635108646943',
  staffReportLog: '1442569270784692306',
  staffValutazioniLog: '1442569249649459340',
  partnerPointsLog: '1442569257375367320',
  pauseRequestLog: '1442569285909217301',
  pauseAcceptedLog: '1442569255315832945',
  polls: '1442569128706838528',
  partnershipPosts: '1442569193470824448',
  verifyPing: '1442569115972669541',
  levelUp: '1442569138114662490',
  customVoiceCategory: '1442569078379118755',
  weeklyWinners: '1470183921236049940',
  skullboard: '1468540884537573479',
  suggestions: '1442569147559973094',
  infoPanelPrivate: '1442569190971015239',
  infoPanelSponsor: '1442569211611185323',
  infoPanelSocial: '1442569225930805320',
  infoPanelCandidature: '1442569232507473951',
  verifyPanel: '1442569059983163403',
  staffModeration: '1442569243626307634',
  staffBest: '1442569253281730653',
  staffGuide: '1442569237142044773',
  staffPaid: '1442579412280410194',
  rolePanel: '1469429150669602961',
  chatGeneralA: '1442569187376763010',
  chatGeneralB: '1444295396619976817',
  staffOnboardingExtra: '1442569268666568897',
  stickyHelpA: '1442569182825681077',
  stickyHelpB: '1442569184281362552',
  stickyHelpC: '1469685688814407726',
  staffListChannel: '1442569235426705653'
};

const ids = {
  guilds: {
    main: pick(config.guildid, '1329080093599076474')
  },
  roles,
  channels,
  bots: {
    voteManager: '959699003010871307'
  },
  emojis: {
    loadingAnimatedId: '1443934440614264924',
    loadingFallbackId: '1462504528774430962'
  },
  links: {
    vote: 'https://discadia.com/server/viniliecaffe/',
    invite: pick(config.botServerInvite, 'https://discord.gg/viniliecaffe')
  },
  users: {
    owner: '295500038401163264'
  }
};

ids.roles.verifiedUser = ids.roles.user;
ids.roles.customRoleAccessC = ids.roles.plusColorBooster;
ids.channels.ticketOpenPanelChannel = ids.channels.ticketPanel;

module.exports = ids;
