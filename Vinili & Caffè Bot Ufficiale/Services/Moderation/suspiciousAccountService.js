const mongoose = require("mongoose");
const SuspiciousAccount = require("../../Schemas/Moderation/suspiciousAccountSchema");

const CACHE = new Map();
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60_000;

function nowMs() {
  return Date.now();
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function toGuildId(guildId) {
  return String(guildId || "").trim();
}

function toUserId(userId) {
  return String(userId || "").trim();
}

function makeKey(guildId, userId) {
  return `${toGuildId(guildId)}:${toUserId(userId)}`;
}

function setCache(guildId, userId, payload, ttlMs = 60_000) {
  const key = makeKey(guildId, userId);
  if (!key || key === ":") return;
  CACHE.set(key, {
    value: payload,
    expiresAt: nowMs() + Math.max(5_000, Number(ttlMs || 60_000)),
  });
}

function getCache(guildId, userId) {
  const key = makeKey(guildId, userId);
  const hit = CACHE.get(key);
  if (!hit) return undefined;
  if (Number(hit.expiresAt || 0) <= nowMs()) {
    CACHE.delete(key);
    return undefined;
  }
  return hit.value;
}

async function markJoinGateSuspiciousAccount(
  guildId,
  userId,
  options = {},
) {
  const gid = toGuildId(guildId);
  const uid = toUserId(userId);
  if (!gid || !uid) return { ok: false, reason: "missing_identifiers" };

  const ttlMs = Math.max(60_000, Number(options?.ttlMs || DEFAULT_TTL_MS));
  const markedAt = new Date();
  const expiresAt = new Date(markedAt.getTime() + ttlMs);
  const reason = String(options?.reason || "").slice(0, 500);
  const source = String(options?.source || "joingate").trim() || "joingate";

  setCache(gid, uid, { suspicious: true, source, reason, expiresAt }, ttlMs);
  if (!isDbReady()) return { ok: true, persisted: false };

  try {
    await SuspiciousAccount.updateOne(
      { guildId: gid, userId: uid },
      {
        $set: {
          source,
          reason,
          markedAt,
          expiresAt,
        },
      },
      { upsert: true },
    );
    return { ok: true, persisted: true };
  } catch {
    return { ok: false, reason: "db_write_failed" };
  }
}

async function isJoinGateSuspiciousAccount(guildId, userId) {
  const gid = toGuildId(guildId);
  const uid = toUserId(userId);
  if (!gid || !uid) return false;
  const cached = getCache(gid, uid);
  if (cached !== undefined) return Boolean(cached?.suspicious);
  if (!isDbReady()) return false;

  try {
    const now = new Date();
    const row = await SuspiciousAccount.findOne(
      {
        guildId: gid,
        userId: uid,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      { _id: 0, source: 1, reason: 1, expiresAt: 1 },
    )
      .lean()
      .catch(() => null);
    if (!row) {
      setCache(gid, uid, { suspicious: false }, 30_000);
      return false;
    }
    const expiresTs = row?.expiresAt ? new Date(row.expiresAt).getTime() : nowMs() + 60_000;
    const remaining = Math.max(30_000, expiresTs - nowMs());
    setCache(
      gid,
      uid,
      {
        suspicious: true,
        source: String(row.source || "joingate"),
        reason: String(row.reason || ""),
        expiresAt: row.expiresAt || null,
      },
      remaining,
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  markJoinGateSuspiciousAccount,
  isJoinGateSuspiciousAccount,
};

