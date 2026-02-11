const cron = require('node-cron');
const axios = require('axios');
const Staff = require('../../Schemas/Staff/staffSchema');
const IDs = require('../../Utils/Config/ids');

let dailyPartnerAuditTask = null;

function getRomeDateKey(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(date);
}

function getPreviousRomeDateKey(baseDate = new Date()) {
  const romeNow = new Date(baseDate.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  romeNow.setDate(romeNow.getDate() - 1);
  return getRomeDateKey(romeNow);
}

function extractInviteCode(text) {
  if (!text) return null;
  const patterns = [
    /discord\.gg\/([a-zA-Z0-9-]+)/i,
    /discord\.com\/invite\/([a-zA-Z0-9-]+)/i,
    /discordapp\.com\/invite\/([a-zA-Z0-9-]+)/i
  ];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function buildDescriptionFingerprint(rawText) {
  const text = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n*Manager:\s*<@!?\d+>\s*$/i, '')
    .replace(/\n*Partner effettuata con\s*\*\*<@!?\d+>\*\*\s*$/i, '')
    .trim();
  return text;
}

function containsExternalLinks(text) {
  const source = String(text || '');
  const urls = source.match(/(?:https?:\/\/|www\.)\S+/gi) || [];
  const rawDiscord = source.match(/\b(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi) || [];
  const all = [...urls, ...rawDiscord];
  if (!all.length) return false;
  return all.some((u) => !/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(u));
}

async function fetchInviteInfo(inviteCode) {
  if (!inviteCode) return null;
  try {
    const res = await axios.get(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`, {
      timeout: 15000,
      headers: { Accept: 'application/json' }
    });
    return { ok: true, data: res?.data || null, expired: false, transient: false };
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    if (status === 404 || status === 400) {
      return { ok: false, data: null, expired: true, transient: false };
    }
    return { ok: false, data: null, expired: false, transient: true };
  }
}

async function fetchPartnerActionText(guild, action) {
  const channelId = action?.partnershipChannelId || IDs.channels.partnerships;
  if (!channelId) return '';
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return '';
  const ids = Array.isArray(action?.partnerMessageIds) ? action.partnerMessageIds : [];
  const chunks = [];
  for (const messageId of ids) {
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) continue;
    const content = String(msg.content || '').trim();
    if (content) chunks.push(content);
  }
  return chunks.join('\n');
}

async function deletePartnerActionMessages(guild, action) {
  const channelId = action?.partnershipChannelId || IDs.channels.partnerships;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const ids = Array.isArray(action?.partnerMessageIds) ? action.partnerMessageIds : [];
  for (const messageId of ids) {
    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) continue;
    await msg.delete().catch(() => {});
  }
}

async function logPointRemoval(guild, staffUserId, reason, action) {
  const puntiToltiId = IDs.channels.puntiTolti;
  if (!puntiToltiId) return;
  const channel = guild.channels.cache.get(puntiToltiId) || await guild.channels.fetch(puntiToltiId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const msgRef = Array.isArray(action?.partnerMessageIds) && action.partnerMessageIds.length
    ? `https://discord.com/channels/${guild.id}/${action.partnershipChannelId || IDs.channels.partnerships}/${action.partnerMessageIds[0]}`
    : (action?.invite || 'N/D');
  await channel.send({
    content:
`<:Discord_Mention:1329524304790028328> <@${staffUserId}>
<:discordchannelwhite:1443308552536985810> ${reason}
<:partneredserverowner:1443651871125409812> ${msgRef}`
  }).catch(() => {});
}

async function runDailyPartnerAudit(client, opts = {}) {
  const guildId = IDs.guilds.main || client.guilds.cache.first()?.id;
  if (!guildId) return;
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const targetDateKey = opts.dateKey || getPreviousRomeDateKey(new Date());
  const docs = await Staff.find({
    guildId: guild.id,
    partnerActions: { $exists: true, $ne: [] }
  }).catch(() => []);

  for (const doc of docs) {
    const actions = Array.isArray(doc.partnerActions) ? doc.partnerActions : [];
    const dayCreates = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => String(action?.action || 'create') === 'create')
      .filter(({ action }) => getRomeDateKey(new Date(action?.date || Date.now())) === targetDateKey)
      .sort((a, b) => new Date(a.action?.date || 0) - new Date(b.action?.date || 0));

    if (!dayCreates.length) continue;

    const seenDescriptionFingerprints = new Set();
    const managerDailyCounter = new Map();
    const invalidIndices = new Set();
    const invalidReasonsByIndex = new Map();

    for (const item of dayCreates) {
      const { action, index } = item;
      const reasons = [];

      const managerId = String(action?.managerId || '').trim();
      if (managerId) {
        const used = Number(managerDailyCounter.get(managerId) || 0) + 1;
        managerDailyCounter.set(managerId, used);
        if (used > 5) {
          reasons.push('Più di 5 partner con lo stesso manager nello stesso giorno');
        }
      } else {
        reasons.push('Manager mancante');
      }

      const actionText = await fetchPartnerActionText(guild, action);
      const descriptionFingerprint = buildDescriptionFingerprint(actionText);
      if (descriptionFingerprint) {
        if (seenDescriptionFingerprints.has(descriptionFingerprint)) {
          reasons.push('Stessa descrizione partnership fatta più di una volta nello stesso giorno');
        } else {
          seenDescriptionFingerprints.add(descriptionFingerprint);
        }
      }
      if (!managerId || !new RegExp(`<@!?${managerId}>`).test(actionText)) {
        reasons.push('Partner senza menzione del manager');
      }

      if (containsExternalLinks(actionText)) {
        reasons.push('Contiene link esterni/immagini/gif non consentiti');
      }

      const inviteCode = extractInviteCode(action?.invite || actionText);
      if (!inviteCode) {
        reasons.push('Link invito Discord assente');
      } else {
        const inviteData = await fetchInviteInfo(inviteCode);
        if (inviteData?.expired) {
          reasons.push('Link invito Discord scaduto/non valido');
        } else if (inviteData?.ok && inviteData?.data) {
          const nsfwLevel = Number(inviteData.data?.guild?.nsfw_level || 0);
          if (nsfwLevel > 0) {
            reasons.push('Server NSFW non consentito');
          }
        }
      }

      if (reasons.length) {
        invalidIndices.add(index);
        invalidReasonsByIndex.set(index, reasons.join(' | '));
      }
    }

    if (!invalidIndices.size) continue;

    let removed = 0;
    for (const index of invalidIndices) {
      const action = actions[index];
      if (!action) continue;
      await deletePartnerActionMessages(guild, action);
      await logPointRemoval(guild, doc.userId, invalidReasonsByIndex.get(index), action);
      removed += 1;
    }

    if (removed > 0) {
      doc.partnerCount = Math.max(0, Number(doc.partnerCount || 0) - removed);
      doc.partnerActions = actions.filter((_, idx) => !invalidIndices.has(idx));
      await doc.save().catch(() => {});
    }
  }
}

function startDailyPartnerAuditLoop(client) {
  if (dailyPartnerAuditTask) return dailyPartnerAuditTask;
  dailyPartnerAuditTask = cron.schedule('0 0 * * *', async () => {
    try {
      await runDailyPartnerAudit(client);
    } catch (err) {
      global.logger.error('[PARTNER AUDIT] Daily audit failed', err);
    }
  }, { timezone: 'Europe/Rome' });
  return dailyPartnerAuditTask;
}

module.exports = {
  startDailyPartnerAuditLoop,
  runDailyPartnerAudit
};
