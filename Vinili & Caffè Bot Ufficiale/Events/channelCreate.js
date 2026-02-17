const {
  queueCategoryRenumber,
} = require("../Services/Community/communityOpsService");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");
const {
  upsertChannelSnapshot,
} = require("../Utils/Community/channelSnapshotUtils");

module.exports = {
  name: "channelCreate",
  async execute(channel, client) {
    if (!channel?.guildId) return;
    await upsertChannelSnapshot(channel).catch(() => {});
    queueCategoryRenumber(client, channel.guildId);
    queueIdsCatalogSync(client, channel.guildId, "channelCreate");
  },
};
