const cron = require("node-cron");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");

let dailyPartnerAuditTask = null;
const DUPLICATE_PARTNERSHIP_WINDOW_MS = 12 * 60 * 60 * 1000;

function getRomeDateKey(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function getPreviousRomeDateKey(baseDate = new Date()) {
  const romeNow = new Date(
    baseDate.toLocaleString("en-US", { timeZone: "Europe/Rome" }),
  );
  romeNow.setDate(romeNow.getDate() - 1);
  return getRomeDateKey(romeNow);
}

function extractInviteCode(text) {
  if (!text) return null;
  const patterns = [
    /discord\.gg\/([a-zA-Z0-9_-]+)/i,
    /discord\.com\/invite\/([a-zA-Z0-9_-]+)/i,
    /discordapp\.com\/invite\/([a-zA-Z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractInviteCodes(text) {
  if (!text) return [];
  const source = String(text || "");
  const patterns = [
    /discord\.gg\/([a-zA-Z0-9_-]+)/gi,
    /discord\.com\/invite\/([a-zA-Z0-9_-]+)/gi,
    /discordapp\.com\/invite\/([a-zA-Z0-9_-]+)/gi,
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
  const text = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n*Manager:\s*<@!?\d+>\s*$/i, "")
    .replace(/\n*Partner effettuata con\s*\*\*<@!?\d+>\*\*\s*$/i, "")
    .trim();
  return text;
}

function extractManagerMentions(sourceText) {
  const text = String(sourceText || "");
  const managerLineMatches = Array.from(
    text.matchAll(/Manager:\s*<@!?(\d+)>/gi),
  );
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
  const source = String(text || "");
  const urls = source.match(/(?:https?:\/\/|www\.)\S+/gi) || [];
  const rawDiscord =
    source.match(/\b(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi) || [];
  const all = [...urls, ...rawDiscord];
  if (!all.length) return false;
  return all.some(
    (u) => !/(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(u),
  );
}

function findLatestPreviousInviteOccurrence(
  allCreates,
  inviteCode,
  dateMs,
  currentIndex,
) {
  const safeCode = String(inviteCode || "").toLowerCase();
  if (!safeCode || !Number.isFinite(dateMs)) return null;
  let best = null;
  for (const row of allCreates) {
    if (!Array.isArray(row.inviteCodes) || !row.inviteCodes.includes(safeCode))
      continue;
    if (!Number.isFinite(row.dateMs) || row.dateMs <= 0) continue;
    if (row.index === currentIndex) continue;
    if (row.dateMs >= dateMs) continue;
    if (!best || row.dateMs > best.dateMs) {
      best = { dateMs: row.dateMs, index: row.index };
    }
  }
  return best;
}

async function fetchPartnerActionText(guild, action) {
  const channelId = action?.partnershipChannelId || IDs.channels.partnerships;
  if (!channelId) {
    global.logger?.warn?.("[PARTNER AUDIT] No channel ID for action");
    return "";
  }

  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.(
      "[PARTNER AUDIT] Channel not found or not text-based:",
      channelId,
    );
    return "";
  }

  const ids = Array.isArray(action?.partnerMessageIds)
    ? action.partnerMessageIds
    : [];
  const chunks = [];

  for (const messageId of ids) {
    const msg = await channel.messages.fetch(messageId).catch((err) => {
      global.logger?.warn?.(
        `[PARTNER AUDIT] Failed to fetch message ${messageId}:`,
        err.message,
      );
      return null;
    });
    if (!msg) continue;

    const plain = String(msg.content || "").trim();
    if (plain) chunks.push(plain);

    const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
    for (const e of embeds) {
      const title = String(e?.title || "").trim();
      const desc = String(e?.description || "").trim();
      const url = String(e?.url || "").trim();
      const fields = Array.isArray(e?.fields)
        ? e.fields
            .map((f) => {
              const n = String(f?.name || "").trim();
              const v = String(f?.value || "").trim();
              return [n, v].filter(Boolean).join("\n");
            })
            .filter(Boolean)
            .join("\n")
        : "";

      const embedText = [title, desc, fields, url]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (embedText) chunks.push(embedText);
    }
  }

  return chunks.join("\n");
}

async function logPointRemoval(guild, staffUserId, reason, action) {
  const puntiToltiId = IDs.channels.puntiTolti;
  if (!puntiToltiId) return;

  const channel =
    guild.channels.cache.get(puntiToltiId) ||
    (await guild.channels.fetch(puntiToltiId).catch(() => null));
  if (!channel?.isTextBased?.()) return;

  const msgRef =
    Array.isArray(action?.partnerMessageIds) && action.partnerMessageIds.length
      ? `https://discord.com/channels/${guild.id}/${action.partnershipChannelId || IDs.channels.partnerships}/${action.partnerMessageIds[0]}`
      : "N/D";

  const inviteDb = action?.invite ? String(action.invite).slice(0, 300) : "N/D";

  await channel
    .send({
      content: `<:Discord_Mention:1329524304790028328> <@${staffUserId}>
<:discordchannelwhite:1443308552536985810> ${reason}
<:partneredserverowner:1443651871125409812> Messaggio: ${msgRef}
🔗 Invite (DB): ${inviteDb}`,
    })
    .catch(() => {});
}

async function runDailyPartnerAudit(client, opts = {}) {
  const guildId = IDs.guilds.main || client.guilds.cache.first()?.id;
  if (!guildId) return;
  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;

  const targetDateKey = opts.dateKey || getPreviousRomeDateKey(new Date());
  const docs = await Staff.find({
    guildId: guild.id,
    partnerActions: { $exists: true, $ne: [] },
  }).catch(() => []);

  let totalChecked = 0;
  let totalRemoved = 0;

  for (const doc of docs) {
    const actions = Array.isArray(doc.partnerActions) ? doc.partnerActions : [];
    const allCreates = actions
      .map((action, index) => ({ action, index }))
      .filter(({ action }) => String(action?.action || "create") === "create")
      .map(({ action, index }) => {
        const dateMs = new Date(action?.date || 0).getTime();
        return { action, index, dateMs, inviteCodes: [] };
      })
      .sort((a, b) => a.dateMs - b.dateMs);

    const dayCreates = allCreates
      .filter(
        ({ action }) =>
          getRomeDateKey(new Date(action?.date || Date.now())) ===
          targetDateKey,
      )
      .sort((a, b) => a.dateMs - b.dateMs);

    if (!dayCreates.length) continue;
    totalChecked += dayCreates.length;

    const previousDayKey = getPreviousRomeDateKey(
      new Date(`${targetDateKey}T12:00:00.000Z`),
    );
    const rowsFor12hCheck = allCreates
      .filter((row) => {
        const rowKey = getRomeDateKey(
          new Date(row?.action?.date || Date.now()),
        );
        return rowKey === targetDateKey || rowKey === previousDayKey;
      })
      .sort((a, b) => a.dateMs - b.dateMs);

    const actionTextCache = new Map();
    // Invite API validation removed on purpose:
    // it generated false positives at midnight and caused unjust penalties.
    const getActionTextCached = async (row) => {
      if (!row?.action) return "";
      if (actionTextCache.has(row.index)) return actionTextCache.get(row.index);
      const text = await fetchPartnerActionText(guild, row.action);
      actionTextCache.set(row.index, text || "");
      return actionTextCache.get(row.index);
    };
    const enrichInviteCodes = async (row) => {
      if (!row?.action) {
        row.inviteCodes = [];
        return row.inviteCodes;
      }
      const fromInviteField = extractInviteCodes(row.action?.invite || "");
      const actionText = await getActionTextCached(row);
      const fromText = extractInviteCodes(actionText);
      const combined = Array.from(new Set([...fromInviteField, ...fromText]));

      if (!combined.length && row.action?.invite) {
        const singleCode = extractInviteCode(row.action.invite);
        if (singleCode) combined.push(singleCode);
      }

      row.inviteCodes = combined;
      return row.inviteCodes;
    };

    await Promise.all(rowsFor12hCheck.map((row) => enrichInviteCodes(row)));

    const seenInviteCodesSameDay = new Set();
    const managerDailyCounter = new Map();
    const invalidIndices = new Set();
    const invalidReasonsByIndex = new Map();

    for (const item of dayCreates) {
      const { index } = item;
      const reasons = [];
      const actionText = await getActionTextCached(item);
      const descriptionFingerprint = buildDescriptionFingerprint(actionText);
      let managerMentions = extractManagerMentions(descriptionFingerprint);

      if (!managerMentions.length && item.action?.managerId) {
        managerMentions = [String(item.action.managerId)];
      }

      const inviteCodes = await enrichInviteCodes(item);

      if (!managerMentions.length) {
        reasons.push("Manager mancante");
      }
      for (const managerId of managerMentions) {
        const used = Number(managerDailyCounter.get(managerId) || 0) + 1;
        managerDailyCounter.set(managerId, used);
        if (used > 5) {
          reasons.push(
            "più di 5 partner con lo stesso manager nello stesso giorno",
          );
        }
      }
      if (!managerMentions.length) {
        reasons.push("Partner senza menzione del manager");
      }

      if (containsExternalLinks(descriptionFingerprint)) {
        reasons.push("Contiene link esterni/immagini/gif non consentiti");
      }

      if (!inviteCodes.length) {
        reasons.push("Link invito Discord assente");
      } else {
        for (const inviteCode of inviteCodes) {
          if (seenInviteCodesSameDay.has(inviteCode)) {
            reasons.push(
              "Stessa partnership fatta più di una volta nello stesso giorno",
            );
            break;
          }
        }
        for (const inviteCode of inviteCodes) {
          seenInviteCodesSameDay.add(inviteCode);
        }

        for (const inviteCode of inviteCodes) {
          const previous = findLatestPreviousInviteOccurrence(
            rowsFor12hCheck,
            inviteCode,
            item.dateMs,
            index,
          );
          if (previous?.dateMs) {
            const delta = Number(item.dateMs - previous.dateMs);
            if (
              Number.isFinite(delta) &&
              delta >= 0 &&
              delta < DUPLICATE_PARTNERSHIP_WINDOW_MS
            ) {
              reasons.push("Stessa partnership ripetuta prima di 12 ore");
              break;
            }
          }
        }

        // Deliberately skip remote invite validity checks.
        // We keep deterministic checks only (presence, duplicate/day, duplicate/12h, external links, manager rules).
      }

      if (reasons.length) {
        invalidIndices.add(index);
        invalidReasonsByIndex.set(index, reasons.join(" | "));
      }
    }

    if (!invalidIndices.size) continue;

    let flagged = 0;
    for (const index of invalidIndices) {
      const action = actions[index];
      if (!action) continue;
      const alreadyPenalized =
        Array.isArray(action.auditPenaltyDates) &&
        action.auditPenaltyDates.includes(targetDateKey);
      if (alreadyPenalized) continue;

      await logPointRemoval(
        guild,
        doc.userId,
        `${invalidReasonsByIndex.get(index)}`,
        action,
      );
      action.auditPenaltyDates = Array.isArray(action.auditPenaltyDates)
        ? action.auditPenaltyDates
        : [];
      action.auditPenaltyDates.push(targetDateKey);
      flagged += 1;
    }

    if (flagged > 0) {
      const currentCount = Number(doc.partnerCount || 0);
      doc.partnerCount = Math.max(0, currentCount - flagged);
      try {
        await doc.save();
        totalRemoved += flagged;
        global.logger?.warn?.(
          `[PARTNER AUDIT] User ${doc.userId}: penalized ${flagged} invalid partnerships (messages preserved)`,
        );
      } catch (saveErr) {
        global.logger?.error?.(
          `[PARTNER AUDIT] User ${doc.userId}: failed to persist penalties`,
          saveErr,
        );
      }
    }
  }

  global.logger?.info?.(
    `[PARTNER AUDIT] checked=${totalChecked} removed=${totalRemoved} date=${targetDateKey}`,
  );
}

function startDailyPartnerAuditLoop(client) {
  if (dailyPartnerAuditTask) return dailyPartnerAuditTask;

  dailyPartnerAuditTask = cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await runDailyPartnerAudit(client);
      } catch (err) {
        global.logger?.error?.("[PARTNER AUDIT] Daily audit failed", err);
      }
    },
    { timezone: "Europe/Rome" },
  );

  return dailyPartnerAuditTask;
}

module.exports = { startDailyPartnerAuditLoop, runDailyPartnerAudit };
