const {
  queueCategoryRenumber,
} = require("../Services/Community/communityOpsService");
const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");

function isTicketsCategory(name) {
  return String(name || "")
    .toLowerCase()
    .includes("tickets");
}

module.exports = {
  name: "channelDelete",
  async execute(channel, client) {
    if (!channel?.guildId) return;

    try {
      const parentId = channel.parentId;
      if (parentId) {
        const guild =
          channel.guild ||
          client.guilds.cache.get(channel.guildId) ||
          (await client.guilds.fetch(channel.guildId).catch(() => null));
        const parent =
          guild?.channels?.cache?.get(parentId) ||
          (await guild?.channels?.fetch(parentId).catch(() => null));

        if (parent?.type === 4 && isTicketsCategory(parent?.name)) {
          const childrenCount = parent.children?.cache?.size ?? 0;
          if (childrenCount === 0) {
            await parent
              .delete("Auto cleanup empty tickets category")
              .catch(() => {});
          }
        }
      }
    } catch {}

    queueCategoryRenumber(client, channel.guildId);
    queueIdsCatalogSync(client, channel.guildId, "channelDelete");
  },
};
