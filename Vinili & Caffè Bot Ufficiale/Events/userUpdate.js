const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");

module.exports = {
  name: "userUpdate",
  async execute(oldUser, newUser, client) {
    if (!newUser?.bot) return;

    const usernameChanged = oldUser?.username !== newUser?.username;
    const globalNameChanged = oldUser?.globalName !== newUser?.globalName;
    if (!usernameChanged && !globalNameChanged) return;

    for (const guild of client.guilds.cache.values()) {
      const member =
        guild.members.cache.get(newUser.id) ||
        (await guild.members.fetch(newUser.id).catch(() => null));
      if (!member) continue;
      queueIdsCatalogSync(client, guild.id, "botUserUpdate");
    }
  },
};
