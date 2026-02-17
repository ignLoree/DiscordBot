const { ChannelSnapshot } = require("../../Schemas/Community/communitySchemas");

function normalizeId(value) {
  const raw = String(value || "").trim();
  return raw || "";
}

function normalizeName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSnapshotDoc(channel, { deletedAt = null } = {}) {
  const guildId = normalizeId(channel?.guildId || channel?.guild?.id);
  const channelId = normalizeId(channel?.id);
  if (!guildId || !channelId) return null;

  return {
    guildId,
    channelId,
    name: normalizeName(channel?.name || ""),
    type: Number.isInteger(channel?.type) ? Number(channel.type) : null,
    parentId: normalizeId(channel?.parentId) || null,
    deletedAt,
  };
}

async function upsertChannelSnapshot(channel, options = {}) {
  const payload = toSnapshotDoc(channel, options);
  if (!payload) return false;

  await ChannelSnapshot.updateOne(
    { guildId: payload.guildId, channelId: payload.channelId },
    {
      $set: {
        name: payload.name,
        type: payload.type,
        parentId: payload.parentId,
        deletedAt: payload.deletedAt,
      },
    },
    { upsert: true },
  ).catch(() => {});

  return true;
}

async function markDeletedChannelSnapshot(channel) {
  const deletedAt = new Date();
  return upsertChannelSnapshot(channel, { deletedAt });
}

async function syncGuildChannelSnapshots(guild) {
  if (!guild?.id || !guild?.channels?.cache) return 0;

  const operations = [];
  for (const channel of guild.channels.cache.values()) {
    const payload = toSnapshotDoc(channel, { deletedAt: null });
    if (!payload) continue;
    operations.push({
      updateOne: {
        filter: { guildId: payload.guildId, channelId: payload.channelId },
        update: {
          $set: {
            name: payload.name,
            type: payload.type,
            parentId: payload.parentId,
            deletedAt: null,
          },
        },
        upsert: true,
      },
    });
  }

  if (!operations.length) return 0;
  await ChannelSnapshot.bulkWrite(operations, { ordered: false }).catch(() => {});
  return operations.length;
}

async function getChannelSnapshotMap(guildId, channelIds = []) {
  const safeGuildId = normalizeId(guildId);
  if (!safeGuildId) return new Map();

  const ids = Array.from(
    new Set(
      (Array.isArray(channelIds) ? channelIds : [])
        .map((value) => normalizeId(value))
        .filter(Boolean),
    ),
  );
  if (!ids.length) return new Map();

  const rows = await ChannelSnapshot.find({
    guildId: safeGuildId,
    channelId: { $in: ids },
  })
    .select("channelId name")
    .lean()
    .catch(() => []);

  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const channelId = normalizeId(row?.channelId);
    const name = normalizeName(row?.name || "");
    if (!channelId || !name) continue;
    out.set(channelId, name);
  }
  return out;
}

module.exports = {
  upsertChannelSnapshot,
  markDeletedChannelSnapshot,
  syncGuildChannelSnapshots,
  getChannelSnapshotMap,
};
