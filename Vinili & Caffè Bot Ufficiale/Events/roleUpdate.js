const { queueIdsCatalogSync } = require("../Utils/Config/idsAutoSync");

module.exports = {
  name: "roleUpdate",
  async execute(oldRole, newRole, client) {
    const guildId =
      newRole?.guild?.id ||
      oldRole?.guild?.id ||
      newRole?.guildId ||
      oldRole?.guildId;
    if (!guildId) return;

    const nameChanged = oldRole?.name !== newRole?.name;
    const positionChanged = oldRole?.position !== newRole?.position;
    if (!nameChanged && !positionChanged) return;

    queueIdsCatalogSync(client, guildId, "roleUpdate");
  },
};
