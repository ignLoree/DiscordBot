const PartnershipBlacklistGuild = require("../../Schemas/Partner/partnershipBlacklistSchema");

function normalizeGuildId(id) {
  const s = String(id || "").trim();
  if (!/^\d{16,20}$/.test(s)) return null;
  return s;
}

async function isPartnershipGuildBlacklisted(guildId) {
  const g = normalizeGuildId(guildId);
  if (!g) return false;
  const doc = await PartnershipBlacklistGuild.findOne({ guildId: g })
    .lean()
    .catch(() => null);
  return Boolean(doc);
}

async function addPartnershipBlacklistGuild(guildId, addedBy, note = "") {
  const g = normalizeGuildId(guildId);
  if (!g) return { ok: false, reason: "invalid_id" };
  try {
    await PartnershipBlacklistGuild.findOneAndUpdate(
      { guildId: g },
      {
        $set: {
          guildId: g,
          addedBy: String(addedBy || ""),
          note: String(note || "").slice(0, 500),
          addedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    return { ok: true, guildId: g };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

async function removePartnershipBlacklistGuild(guildId) {
  const g = normalizeGuildId(guildId);
  if (!g) return { ok: false, reason: "invalid_id" };
  const r = await PartnershipBlacklistGuild.deleteOne({ guildId: g }).catch(
    () => null,
  );
  const deleted = Boolean(r?.deletedCount);
  return { ok: true, deleted, guildId: g };
}

async function listPartnershipBlacklistGuilds(limit = 50) {
  const safe = Math.max(1, Math.min(100, Number(limit) || 50));
  return PartnershipBlacklistGuild.find({})
    .sort({ addedAt: -1 })
    .limit(safe)
    .lean()
    .catch(() => []);
}

module.exports = {
  normalizeGuildId,
  isPartnershipGuildBlacklisted,
  addPartnershipBlacklistGuild,
  removePartnershipBlacklistGuild,
  listPartnershipBlacklistGuilds,
};