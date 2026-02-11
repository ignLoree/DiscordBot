const catalog = require('./idsCatalog');

const maps = catalog.maps || {};
const multi = catalog.multi || {};
const meta = catalog.meta || {};

function getLast(group, name) {
  const value = maps?.[group]?.[name];
  return value ? String(value) : null;
}

function getAt(group, name, index) {
  const list = multi?.[group]?.[name];
  if (!Array.isArray(list)) return null;
  const value = list[index];
  return value ? String(value) : null;
}

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
  const rest = words
    .slice(1)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  return `${first}${rest}`;
}

function buildAllKeys(entries, fallbackPrefix) {
  const out = {};
  const seen = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
    const rawName = String(entry?.name || '').trim();
    const id = String(entry?.id || '').trim();
    if (!rawName || !id) return;

    let key = normalizeNameToKey(rawName);
    if (!key) key = `${fallbackPrefix}${index + 1}`;
    if (/^\d/.test(key)) key = `${fallbackPrefix}${key}`;

    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    const finalKey = count > 1 ? `${key}_${count}` : key;
    out[finalKey] = id;
  });
  return out;
}

const allCategoryKeys = buildAllKeys(catalog?.entries?.categories, 'category');
const allChannelKeys = buildAllKeys(catalog?.entries?.channels, 'channel');
const allRoleKeys = buildAllKeys(catalog?.entries?.roles, 'role');

const ids = {
  guilds: {
    main: meta.guildMain || null
  },

  categories: {
    ...allCategoryKeys
  },

  channels: {
    ...allChannelKeys,
    antiRaidLog: getLast('channels', '༄🚨︲mod᲼logs'),
    commandError: getLast('channels', '༄🖥️︲server᲼bot᲼logs'),
    counting: getLast('channels', '༄🔢︲counting'),
    customVoiceCategory: getLast('categories', '⁰⁷・ 　　　　　     PRIVATE 　   　  　　  ・'),
    expExcludedCategory: getLast('categories', '⁰⁵・ 　　　　　GAMES 　　　　　・'),
    forceDeleteAllMessages: getAt('channels', '〝', 6),
    infoPanelCandidature: getLast('channels', '༄📝︲candidature'),
    infoPanelSponsor: getLast('channels', '༄🪇︲info᲼sponsor'),
    infoPerks: getLast('channels', '༄🏡︲info'),
    inviteLog: getLast('channels', '༄🛃︲join᲼leave᲼logs'),
    levelUp: getLast('channels', '༄🕹️︲commands'),
    mediaExemptCategory: getLast('categories', '¹³・ 　　　　    　    CHAT 　　    　　　    ・'),
    mediaExemptChannel: getLast('channels', '༄📲︲media'),
    partnerManagerLeaveLog: getLast('channels', '༄🤝︲partner᲼logs'),
    partnerOnboarding: getLast('channels', '༄🌵︲partners'),
    partnerPointsLog: getLast('channels', '༄📉︲punti᲼tolti'),
    partnershipPosts: getLast('channels', '༄🤝︲partnerships'),
    pauseAcceptedLog: getLast('channels', '༄⏸️︲pause'),
    pauseRequestLog: getLast('channels', '༄⏸️︲pause'),
    polls: getLast('channels', '༄📊︲polls'),
    resignLog: getLast('channels', '༄🆙︲pex᲼depex'),
    rolePanel: getLast('channels', '༄🎨︲roles'),
    skullboard: getLast('channels', '༄💭︲quotes'),
    staffBest: getLast('channels', '༄🏆︲best᲼staff'),
    staffGuide: getLast('channels', '༄📚︲guida᲼staff'),
    staffListChannel: getLast('channels', '༄📄︲staff᲼list'),
    staffModeration: getLast('channels', '༄🚨︲moderazione'),
    staffOnboarding: getLast('channels', '༄🌁︲staffers'),
    staffPaid: getLast('channels', '༄💸︲staff᲼pagato'),
    staffReportLog: getLast('channels', '༄📊︲resoconti'),
    staffValutazioniLog: getLast('channels', '༄📈︲valutazioni'),
    staffWarnLog: getLast('channels', '༄👮︲warn᲼staff'),
    stickyHelpA: getLast('channels', '༄🎎︲mudae'),
    stickyHelpB: getLast('channels', '༄⛩️︲pokétwo'),
    stickyHelpC: getLast('channels', '༄💞︲ship'),
    suggestions: getLast('channels', '༄💡︲suggestions'),
    thanks: getLast('channels', '༄🫦︲supporters'),
    ticketCloseLogAlt: getLast('channels', '༄🎫︲ticket᲼logs'),
    ticketOpenPanelChannel: getLast('channels', '༄🎫︲tickets'),
    ticketPanel: getLast('channels', '༄🎫︲tickets'),
    totalVoiceCounter: getLast('channels', '༄☕︲ User: 324'),
    verifyPanel: getLast('channels', '༄🔍︲verify'),
    verifyPing: getLast('channels', '༄📰︲news'),
    weeklyWinners: getLast('channels', '༄🏆︲top᲼weekly')
  },

  roles: {
    ...allRoleKeys,
    admin: getLast('roles', '༄ Admin'),
    autoAssignBotRole: getLast('roles', '༄ Bots'),
    bestStaff: getLast('roles', '༄ Staffer del mese'),
    coordinator: getLast('roles', '༄ Coordinator'),
    coOwner: getLast('roles', '༄ Co Founder'),
    customRoleAccessA: getLast('roles', '༄ VIP'),
    customRoleAccessB: getLast('roles', '༄ Donator'),
    customRoleAccessC: getLast('roles', '༄ Server Booster'),
    customRoleAccessD: getLast('roles', '༄ Level 70+'),
    customRoleAnchor: getLast('roles', '。.⠀・⠀゜✭⠀・.・⠀✫⠀・⠀゜・⠀。'),
    forumNotify: getLast('roles', '༄ Forum'),
    helper: getLast('roles', '༄ Helper'),
    highStaff: getLast('roles', '༄ High Staff'),
    inviteReward: getLast('roles', '༄ Promoter'),
    level10: getLast('roles', '༄ Level 10+'),
    level20: getLast('roles', '༄ Level 20+'),
    level30: getLast('roles', '༄ Level 30+'),
    level50: getLast('roles', '༄ Level 50+'),
    level70: getLast('roles', '༄ Level 70+'),
    level100: getLast('roles', '༄ Level 100+'),
    manager: getLast('roles', '༄ Manager'),
    mediaBypass: getLast('roles', '༄ PicPerms'),
    mentionBump: getLast('roles', '༄ Bump'),
    mentionEvents: getLast('roles', '༄ Events'),
    mentionNews: getLast('roles', '༄ News'),
    mentionPolls: getLast('roles', '༄ Polls'),
    mentionReviveChat: getLast('roles', '༄ Revive Chat'),
    minigameReward100: getLast('roles', '༄ Initiate⁺¹⁰⁰'),
    minigameReward500: getLast('roles', '༄ Rookie⁺⁵⁰⁰'),
    minigameReward1000: getLast('roles', '༄ Scout⁺¹⁰⁰⁰'),
    minigameReward1500: getLast('roles', '༄ Explorer⁺¹⁵⁰⁰'),
    minigameReward2500: getLast('roles', '༄ Tracker⁺²⁵⁰⁰'),
    minigameReward5000: getLast('roles', '༄ Achivier⁺⁵⁰⁰⁰'),
    minigameReward10000: getLast('roles', '༄ Vanguard⁺¹⁰⁰⁰⁰'),
    minigameReward50000: getLast('roles', '༄ Mentor⁺⁵⁰⁰⁰⁰'),
    minigameReward100000: getLast('roles', '༄ Strategist⁺¹⁰⁰⁰⁰⁰'),
    minigamesNotify: getLast('roles', '༄ Minigames'),
    moderator: getLast('roles', '༄ Mod'),
    owner: getLast('roles', '༄ Founder'),
    partnerManager: getLast('roles', '༄ Partner Manager'),
    plusColorAllowedA: getLast('roles', '༄ Red Gradientᵖˡᵘˢ'),
    plusColorAllowedB: getLast('roles', '༄ Orange Gradientᵖˡᵘˢ'),
    plusColorAllowedC: getLast('roles', '༄ Yellow Gradientᵖˡᵘˢ'),
    plusColorAllowedD: getLast('roles', '༄ Green Gradientᵖˡᵘˢ'),
    plusColorAllowedE: getLast('roles', '༄ Blue Gradientᵖˡᵘˢ'),
    plusColorAllowedF: getLast('roles', '༄ Purple Gradientᵖˡᵘˢ'),
    plusColorAllowedG: getLast('roles', '༄ Pink Gradientᵖˡᵘˢ'),
    plusColorAllowedH: getLast('roles', '༄ Black Gradientᵖˡᵘˢ'),
    plusColorAllowedI: getLast('roles', '༄ Gray Gradientᵖˡᵘˢ'),
    plusColorAllowedJ: getLast('roles', '༄ White Gradientᵖˡᵘˢ'),
    plusColorAllowedK: getLast('roles', '༄ Yin & Yangᵖˡᵘˢ'),
    plusColorBooster: getLast('roles', '༄ Server Booster'),
    staff: getLast('roles', '༄ Staff'),
    supervisor: getLast('roles', '༄ Supervisor'),
    supporterLink: getLast('roles', '༄ Supporter'),
    ticketBlacklist: getLast('roles', '༄ No Ticket'),
    ticketPartnerBlacklist: getLast('roles', '༄ No Partner'),
    user: getLast('roles', '༄ Member'),
    verifiedUser: getLast('roles', '༄ Verificato'),
    verifyExtraA: getLast('roles', 'ㅤ ㅤㅤ   ㅤ       ㅤ・SPECIALI・ㅤㅤㅤㅤ'),
    verifyExtraB: getLast('roles', 'ㅤ    ㅤㅤㅤㅤㅤ・SELF ROLES・ㅤ    ㅤ ㅤ'),
    verifyExtraC: getLast('roles', 'ㅤㅤㅤㅤ       ㅤ・BADGEs・ㅤ    ㅤㅤㅤ'),
    verifyExtraD: getLast('roles', 'ㅤㅤㅤㅤㅤㅤㅤ・LIVELLI・ㅤ       ㅤㅤㅤ'),
    verifyStage1: getLast('roles', '༄ Nuovo Utente'),
    verifyStage2: getLast('roles', '༄ Veterano'),
    verifyStage3: getLast('roles', '༄ OG'),
    voteReward: getLast('roles', '༄ Voter'),
    weeklyMessageWinner: getLast('roles', '༄ Top Weekly Text'),
    weeklyVoiceWinner: getLast('roles', '༄ Top Weekly Voc')
  },

  bots: {
    voteManager: getLast('bots', 'Vote Manager')
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

module.exports = ids;
