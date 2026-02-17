const { ChannelType } = require("discord.js");
const IDs = require("../Utils/Config/ids");

module.exports = {
  name: "threadCreate",
  async execute(thread) {
    try {
      if (!thread?.parent || thread.parent.type !== ChannelType.GuildForum)
        return;
      await thread.send({ content: `<@&${IDs.roles.Forum}>` });
    } catch (error) {
      global.logger.error(error);
    }
  },
};
