'use strict';

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
⁰¹ discord.gg/VINILIECAFFE -> 1471512556207341568
`;
const channelsRaw = `
༄🎫︲tickets -> 1471974622777049098
moderator-only -> 1471524769965932771
༄📀︲gg∕viniliecaffe -> 1471522161192730695
༄☕︲start -> 1471521125484986470
`;
const rolesRaw = `
༄ Server Booster -> 1471514106598260892
༄ Verificato -> 1471522093484081300
༄ Bot Ufficiale -> 1472914212157263964
༄ Guilded -> 1471628002050838790
༄ Vinili & Caffè Bot -> 1475812266069721120
. -> 1471987639291871336
`;
const botsRaw = `
Vinili -> 1329118940110127204
`;
const emojisRaw = `

`;

const categories = parseNameIdText(categoriesRaw);
const channels = parseNameIdText(channelsRaw);
const roles = parseNameIdText(rolesRaw);
const bots = parseNameIdText(botsRaw);
const emojis = parseNameIdText(emojisRaw);

module.exports = {
  raw: { categories: categoriesRaw, channels: channelsRaw, roles: rolesRaw, bots: botsRaw, emojis: emojisRaw },
  entries: { categories, channels, roles, bots, emojis },
  maps: { categories: toLastValueMap(categories), channels: toLastValueMap(channels), roles: toLastValueMap(roles), bots: toLastValueMap(bots), emojis: toLastValueMap(emojis) },
  multi: { categories: toMultiValueMap(categories), channels: toMultiValueMap(channels), roles: toMultiValueMap(roles), bots: toMultiValueMap(bots), emojis: toMultiValueMap(emojis) },
  meta: { guildMain: "1471512555762483330", emojis: { loadingAnimatedId: "1448687876018540695", loadingFallbackId: "1462504528774430962" }, links: { vote: "https://discadia.com/server/viniliecaffe/", invite: "https://discord.gg/viniliecaffe" } }
};