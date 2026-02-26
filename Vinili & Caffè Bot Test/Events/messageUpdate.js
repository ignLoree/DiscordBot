const IDs = require("../Utils/Config/ids");

const ALLOWED_GUILD_ID = IDs.guilds?.test || null;

module.exports = {
  name: "messageUpdate",
  async execute(oldMessage, newMessage, client) {
    let previous = oldMessage;
    let updated = newMessage;

    if (previous?.partial) {
      previous = await previous.fetch().catch(() => previous);
    }
    if (updated?.partial) {
      updated = await updated.fetch().catch(() => updated);
    }

    if (!updated?.guild || !updated?.author) return;
    if (ALLOWED_GUILD_ID && String(updated.guild.id) !== String(ALLOWED_GUILD_ID)) return;
    if (updated.author.bot || updated.system || updated.webhookId) return;

    const before = String(previous?.content || "");
    const after = String(updated?.content || "");
    if (!after || before === after) return;

    const looksLikePrefix = after.startsWith("-") || after.startsWith("?");
    if (!looksLikePrefix) return;

    updated.__fromMessageUpdatePrefix = true;
    client.emit("messageCreate", updated);
  },
};