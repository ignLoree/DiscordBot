const cron = require('node-cron');
const axios = require('axios');
const Staff = require('../../Schemas/Staff/staffSchema');
const IDs = require('../../Utils/Config/ids');

let dailyPartnerAuditTask = null;
const DUPLICATE_PARTNERSHIP_WINDOW_MS = 12 * 60 * 60 * 1000;

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

function extractInviteCodes(text) {
  if (!text) return [];
  const source = String(text || '');
  const patterns = [
    /discord\.gg\/([a-zA-Z0-9-]+)/gi,
    /discord\.com\/invite\/([a-zA-Z0-9-]+)/gi,
    /discordapp\.com\/invite\/([a-zA-Z0-9-]+)/gi
  ];
  const out = new Set();
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(source)) !== null) {
      if (match?.[1]) out.add(String(match[1]).toLowerCase());
    }
  }
  return Array.from(out);
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

function extractManagerMentions(sourceText) {
  const text = String(sourceText || '');
  const managerLineMatches = Array.from(text.matchAll(/Manager:\s*<@!?(\d+)>/gi));
  const ids = managerLineMatches
    .map((m) => m?.[1])
    .filter(Boolean)
    .map((id) => String(id));
  if (ids.length) return Array.from(new Set(ids));

  const genericMentions = Array.from(text.matchAll(/<@!?(\d+)>/g))
    .map((m) => m?.[1])
    .filter(Boolean)
    .map((id) => String(id));
  return Array.from(new Set(genericMentions));
}

function containsExternalLinks(text) {
  const source = String(text || '');
  const urls = source.match(/(?:https?:\/\/|www\.)\S+/gi) || [];
  const rawDiscord = source.match(/\b(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi) || [];
  const all = [...urls, ...rawDiscord];
  if (!all.length) return false;
  return all.some((u) => !/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(u));
}

function findLatestPreviousInviteOccurrence(allCreates, inviteCode, dateMs, currentIndex) {
  const safeCode = String(inviteCode || '').toLowerCase();
  if (!safeCode || !Number.isFinite(dateMs)) return null;
  let best = null;
  for (const row of allCreates) {
    if (!Array.isArray(row.inviteCodes) || !row.inviteCodes.includes(safeCode)) continue;
    if (!Number.isFinite(row.dateMs) || row.dateMs <= 0) continue;
    if (row.index === currentIndex) continue;
    if (row.dateMs >= dateMs) continue;
    if (!best || row.dateMs > best.dateMs) {
      best = { dateMs: row.dateMs, index: row.index };
    }
  }
  return best;
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
  if (!channelId) {
    global.logger?.warn?.('[PARTNER AUDIT] No channel ID for action');
    return '';
  }

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.('[PARTNER AUDIT] Channel not found or not text-based:', channelId);
    return '';
  }

  const ids = Array.isArray(action?.partnerMessageIds) ? action.partnerMessageIds : [];
  const chunks = [];

  for (const messageId of ids) {
    const msg = await channel.messages.fetch(messageId).catch((err) => {
      global.logger?.warn?.(`[PARTNER AUDIT] Failed to fetch message ${messageId}:`, err.message);
      return null;
    });
    if (!msg) continue;

    const plain = String(msg.content || '').trim();
    if (plain) chunks.push(plain);

    const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
    for (const e of embeds) {
      const title = String(e?.title || '').trim();
      const desc = String(e?.description || '').trim();
      const url = String(e?.url || '').trim();
      const fields = Array.isArray(e?.fields)
        ? e.fields
          .map((f) => {
            const n = String(f?.name || '').trim();
            const v = String(f?.value || '').trim();
            return [n, v].filter(Boolean).join('\n');
          })
          .filter(Boolean)
          .join('\n')
        : '';

      const embedText = [title, desc, fields, url].filter(Boolean).join('\n').trim();
      if (embedText) chunks.push(embedText);
    }
  }

  return chunks.join('\n');
}

async function logPointRemoval(guild, staffUserId, reason, action) {
  const puntiToltiId = IDs.channels.puntiTolti;
  if (!puntiToltiId) return;

  const channel = guild.channels.cache.get(puntiToltiId) || await guild.channels.fetch(puntiToltiId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const msgRef = Array.isArray(action?.partnerMessageIds) && action.partnerMessageIds.length
    ? `https://discord.com/channels/${guild.id}/${action.partnershipChannelId || IDs.channels.partnerships}/${action.partnerMessageIds[0]}`
    : 'N/D';

  const previewFull = await fetchPartnerActionText(guild, action).catch(() => '');
  const preview = String(previewFull || '').slice(0, 1500) || '*[nessun testo trovato]*';

  const inviteDb = action?.invite ? String(action.invite).slice(0, 300) : 'N/D';

  await channel.send({
    content:
      `<:Discord_Mention:1329524304790028328> <@${staffUserId}>
<:discordchannelwhite:1443308552536985810> ${reason}
<:partneredserverowner:1443651871125409812> Messaggio: ${msgRef}
🔗 Invite (DB): ${inviteDb}

📌 Anteprima:
${preview}`
  }).catch(() => { });
}


function startDailyPartnerAuditLoop(client) {
  if (dailyPartnerAuditTask) return dailyPartnerAuditTask;
  dailyPartnerAuditTask = cron.schedule('0 0 * * *', async () => {
    try {
      await dailyPartnerAuditTask(client);
    } catch (err) {
      global.logger.error('[PARTNER AUDIT] Daily audit failed', err);
    }
  }, { timezone: 'Europe/Rome' });
  return dailyPartnerAuditTask;
}

module.exports = { startDailyPartnerAuditLoop };