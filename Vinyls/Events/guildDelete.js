const { clearGuildState } = require("../Services/Moderation/joinRaidService");

module.exports = {
  name: "guildDelete",
  async execute(guild, client) {
    try {
      if (!guild?.id) return;
      clearGuildState(guild.id);
    } catch (err) {
      global.logger?.error?.("[guildDelete] clear Join Raid state failed:", err);
    }
  },
};