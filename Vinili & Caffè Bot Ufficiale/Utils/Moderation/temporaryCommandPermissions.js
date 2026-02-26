const TemporaryCommandPermission = require("../../Schemas/Moderation/temporaryCommandPermissionSchema");

const VALID_TYPES = new Set(["prefix", "slash", "any"]);

function normalizeToken(raw) {
  const input = String(raw || "")
    .trim()
    .toLowerCase();
  if (!input) return null;

  const typed = input.match(/^(prefix|slash|any):(.+)$/);
  if (typed) {
    const type = typed[1];
    const key = String(typed[2] || "")
      .trim()
      .replace(/\s+/g, "");
    if (!key) return null;
    return `${type}:${key}`;
  }

  const withoutPrefix = input.replace(/^[+/?-]+/, "").trim();
  if (!withoutPrefix) return null;
  return `any:${withoutPrefix}`;
}

function parseCommandTokenList(rawText) {
  const parts = String(rawText || "")
    .split(/[,\s]+/g)
    .map((chunk) => normalizeToken(chunk))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function expandRevokeToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) return [];
  const [type, key] = normalized.split(":");
  if (!type || !key) return [];
  if (VALID_TYPES.has(type) && type !== "any") return [normalized];
  return [`any:${key}`, `prefix:${key}`, `slash:${key}`];
}

function parseRevokeTokenList(rawText) {
  const chunks = String(rawText || "")
    .split(/[,\s]+/g)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const keys = chunks.flatMap((token) => expandRevokeToken(token));
  return Array.from(new Set(keys));
}

function buildPrefixLookupKeys(commandName, subcommandName = null) {
  const command = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!command) return [];
  const sub = String(subcommandName || "")
    .trim()
    .toLowerCase();
  const keys = [];
  if (sub) {
    keys.push(`prefix:${command}.${sub}`, `any:${command}.${sub}`);
  }
  keys.push(`prefix:${command}`, `any:${command}`);
  return Array.from(new Set(keys));
}

function buildSlashLookupKeys(
  commandName,
  groupName = null,
  subcommandName = null,
) {
  const command = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!command) return [];
  const group = String(groupName || "")
    .trim()
    .toLowerCase();
  const sub = String(subcommandName || "")
    .trim()
    .toLowerCase();
  const keys = [];

  if (group && sub) {
    keys.push(
      `slash:${command}.${group}.${sub}`,
      `any:${command}.${group}.${sub}`,
    );
    keys.push(`slash:${command}.${sub}`, `any:${command}.${sub}`);
  } else if (sub) {
    keys.push(`slash:${command}.${sub}`, `any:${command}.${sub}`);
  }

  keys.push(`slash:${command}`, `any:${command}`);
  return Array.from(new Set(keys));
}

async function hasTemporaryCommandPermission({ guildId, userId, keys }) {
  if (!guildId || !userId || !Array.isArray(keys) || !keys.length) return false;
  const now = new Date();
  try {
    const row = await TemporaryCommandPermission.findOne({
      guildId: String(guildId),
      userId: String(userId),
      commandKey: { $in: keys.map((key) => String(key).toLowerCase()) },
      expiresAt: { $gt: now },
    })
      .select("_id")
      .lean();
    return Boolean(row?._id);
  } catch {
    return false;
  }
}

const PERMANENT_EXPIRY_MS = 100 * 365.25 * 24 * 60 * 60 * 1000;

async function grantTemporaryCommandPermissions({
  guildId,
  userId,
  grantedBy = null,
  commandKeys = [],
  durationMs,
  permanent = false,
}) {
  const permanentGrant = permanent || durationMs == null || durationMs === "";
  const safeDuration = permanentGrant ? 0 : Number(durationMs || 0);
  if (
    !guildId ||
    !userId ||
    !Array.isArray(commandKeys) ||
    !commandKeys.length ||
    (!permanentGrant && (!Number.isFinite(safeDuration) || safeDuration <= 0))
  ) {
    return { upserted: 0, modified: 0, expiresAt: null };
  }

  const expiresAt = permanentGrant
    ? new Date(Date.now() + PERMANENT_EXPIRY_MS)
    : new Date(Date.now() + safeDuration);
  const ops = commandKeys.map((rawKey) => ({
    updateOne: {
      filter: {
        guildId: String(guildId),
        userId: String(userId),
        commandKey: String(rawKey).toLowerCase(),
      },
      update: {
        $set: {
          grantedBy: grantedBy ? String(grantedBy) : null,
          expiresAt,
        },
        $setOnInsert: {
          guildId: String(guildId),
          userId: String(userId),
          commandKey: String(rawKey).toLowerCase(),
        },
      },
      upsert: true,
    },
  }));

  try {
    const result = await TemporaryCommandPermission.bulkWrite(ops, {
      ordered: false,
    });
    return {
      upserted: Number(result?.upsertedCount || 0),
      modified: Number(result?.modifiedCount || 0),
      expiresAt,
    };
  } catch {
    return { upserted: 0, modified: 0, expiresAt };
  }
}

async function revokeTemporaryCommandPermissions({
  guildId,
  userId,
  commandKeys = [],
}) {
  if (!guildId || !userId || !Array.isArray(commandKeys) || !commandKeys.length)
    return 0;
  try {
    const result = await TemporaryCommandPermission.deleteMany({
      guildId: String(guildId),
      userId: String(userId),
      commandKey: { $in: commandKeys.map((key) => String(key).toLowerCase()) },
    });
    return Number(result?.deletedCount || 0);
  } catch {
    return 0;
  }
}

async function clearTemporaryCommandPermissionsForUser({ guildId, userId }) {
  if (!guildId || !userId) return 0;
  try {
    const result = await TemporaryCommandPermission.deleteMany({
      guildId: String(guildId),
      userId: String(userId),
    });
    return Number(result?.deletedCount || 0);
  } catch {
    return 0;
  }
}

async function listTemporaryCommandPermissionsForUser({ guildId, userId }) {
  if (!guildId || !userId) return [];
  const now = new Date();
  try {
    return TemporaryCommandPermission.find({
      guildId: String(guildId),
      userId: String(userId),
      expiresAt: { $gt: now },
    })
      .sort({ expiresAt: 1, commandKey: 1 })
      .lean();
  } catch {
    return [];
  }
}

module.exports = {
  parseCommandTokenList,
  parseRevokeTokenList,
  buildPrefixLookupKeys,
  buildSlashLookupKeys,
  hasTemporaryCommandPermission,
  grantTemporaryCommandPermissions,
  revokeTemporaryCommandPermissions,
  clearTemporaryCommandPermissionsForUser,
  listTemporaryCommandPermissionsForUser,
};