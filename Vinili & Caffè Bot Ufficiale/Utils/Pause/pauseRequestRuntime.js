const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../Config/ids");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const IT_MONTHS = { gennaio: 1, feb: 2, febbraio: 2, mar: 3, marzo: 3, apr: 4, aprile: 4, mag: 5, maggio: 5, giu: 6, giugno: 6, lug: 7, luglio: 7, ago: 8, agosto: 8, set: 9, sett: 9, settembre: 9, ott: 10, ottobre: 10, nov: 11, novembre: 11, dic: 12, dicembre: 12 };
const PAUSE_REQUEST_ROLE_IDS = [IDs.roles.PartnerManager, IDs.roles.Staff, IDs.roles.HighStaff].filter(Boolean);

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseUserDateInput(raw) {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "oggi" || value === "today") {
    const today = getTodayUtc();
    return { day: today.getUTCDate(), month: today.getUTCMonth() + 1, year: today.getUTCFullYear(), hasYear: true };
  }
  if (value === "domani" || value === "tomorrow") {
    const today = getTodayUtc();
    const tomorrow = new Date(today.getTime() + MS_PER_DAY);
    return { day: tomorrow.getUTCDate(), month: tomorrow.getUTCMonth() + 1, year: tomorrow.getUTCFullYear(), hasYear: true };
  }
  const slash = value.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : null;
    if (year !== null && year < 100) year += 2000;
    return { day, month, year, hasYear: year !== null };
  }
  const words = value.match(/^(\d{1,2})\s+([a-zàèéìòù]+)(?:\s+(\d{2,4}))?$/i);
  if (!words) return null;
  const day = Number(words[1]);
  const monthName = words[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const month = IT_MONTHS[monthName];
  if (!month) return null;
  let year = words[3] ? Number(words[3]) : null;
  if (year !== null && year < 100) year += 2000;
  return { day, month, year, hasYear: year !== null };
}

function buildUtcDate(day, month, year) {
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function formatDateDDMMYYYY(date) {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function normalizePauseDates(startRaw, endRaw) {
  const startParsed = parseUserDateInput(startRaw);
  const endParsed = parseUserDateInput(endRaw);
  if (!startParsed || !endParsed) return null;
  const currentYear = getTodayUtc().getUTCFullYear();
  let startYear = startParsed.hasYear ? startParsed.year : currentYear;
  let endYear;
  if (endParsed.hasYear) {
    endYear = endParsed.year;
  } else if (startParsed.hasYear) {
    endYear = startYear;
  } else {
    endYear = currentYear;
  }
  let startDate = buildUtcDate(startParsed.day, startParsed.month, startYear);
  let endDate = buildUtcDate(endParsed.day, endParsed.month, endYear);
  if (!startDate || !endDate) return null;
  if (!endParsed.hasYear && endDate < startDate) {
    endYear += 1;
    endDate = buildUtcDate(endParsed.day, endParsed.month, endYear);
    if (!endDate) return null;
  }
  if (!startParsed.hasYear && endParsed.hasYear && startDate > endDate) {
    startYear = endYear - 1;
    startDate = buildUtcDate(startParsed.day, startParsed.month, startYear);
    if (!startDate) return null;
  }
  if (endDate < startDate) return null;
  return { dataRichiesta: formatDateDDMMYYYY(startDate), dataRitorno: formatDateDDMMYYYY(endDate) };
}

function buildPauseRequestButtonsRow(userId, pauseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pause_accept:${userId}:${pauseId}`).setLabel("Accetta").setEmoji("<:vegacheckmark:1443666279058772028>").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pause_reject:${userId}:${pauseId}`).setLabel("Rifiuta").setEmoji("<:vegax:1443934876440068179>").setStyle(ButtonStyle.Danger),
  );
}

async function getOrCreateStaffDoc(guildId, userId) {
  let stafferDoc = await Staff.findOne({ guildId, userId });
  if (!stafferDoc) stafferDoc = new Staff({ guildId, userId });
  if (!Array.isArray(stafferDoc.pauses)) stafferDoc.pauses = [];
  return stafferDoc;
}

async function createPauseRequest({ guild, userId, requesterMention, rawStart, rawEnd, reason }) {
  const guildId = guild?.id;
  if (!guild || !guildId || !userId) return { ok: false, error: "<a:VC_Alert:1448670089670037675> Dati pausa non validi." };
  const pauseChannel = guild.channels.cache.get(IDs.channels?.pause);
  const normalized = normalizePauseDates(rawStart, rawEnd);
  if (!normalized) {
    return { ok: false, error: "<a:VC_Alert:1448670089670037675> Date non valide. Formati supportati: `oggi`, `domani`, `GG/MM`, `GG/MM/AAAA`, `1 agosto`, `1 agosto 2027`." };
  }
  if (!String(reason || "").trim()) {
    return { ok: false, error: "<a:VC_Alert:1448670089670037675> Devi specificare una motivazione valida." };
  }
  if (!pauseChannel?.isTextBased?.()) {
    return { ok: false, error: "<a:VC_Alert:1448670089670037675> Canale pause non disponibile." };
  }
  const stafferDoc = await getOrCreateStaffDoc(guildId, userId);
  stafferDoc.pauses.push({ dataRichiesta: normalized.dataRichiesta, dataRitorno: normalized.dataRitorno, motivazione: reason, status: "pending" });
  await stafferDoc.save();
  const createdPause = stafferDoc.pauses[stafferDoc.pauses.length - 1];
  const pauseId = String(createdPause?._id || "");
  const posted = await pauseChannel.send({
    content: `<:staff:1443651912179388548> <@&${IDs.roles.HighStaff}> ${requesterMention} ha richiesto una pausa.\n<a:VC_Calendar:1448670320180592724> Data richiesta: ${normalized.dataRichiesta}\n Data ritorno: ${normalized.dataRitorno}\n<:VC_reason:1478517122929004544> Motivo: ${reason}`,
    components: pauseId ? [buildPauseRequestButtonsRow(userId, pauseId)] : [],
  }).catch(() => null);
  if (!posted) {
    return { ok: false, error: "<a:VC_Alert:1448670089670037675> Non sono riuscito a inviare la richiesta all'High Staff." };
  }
  return { ok: true, pauseId };
}

module.exports = { PAUSE_REQUEST_ROLE_IDS, createPauseRequest };