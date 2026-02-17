const {
  queueCategoryRenumber,
} = require("../Services/Community/communityOpsService");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  upsertChannelSnapshot,
} = require("../Utils/Community/channelSnapshotUtils");

module.exports = {
  name: "channelUpdate",
  async execute(oldChannel, newChannel, client) {
    const guildId = newChannel?.guildId || oldChannel?.guildId;
    if (!guildId) return;

    const parentChanged = oldChannel?.parentId !== newChannel?.parentId;
    const positionChanged = oldChannel?.rawPosition !== newChannel?.rawPosition;
    const nameChanged = oldChannel?.name !== newChannel?.name;
    if (!parentChanged && !positionChanged && !nameChanged) return;

    await upsertChannelSnapshot(newChannel || oldChannel).catch(() => {});
    queueCategoryRenumber(client, guildId);
    queueIdsCatalogSync(client, guildId, "channelUpdate");
  },
};
