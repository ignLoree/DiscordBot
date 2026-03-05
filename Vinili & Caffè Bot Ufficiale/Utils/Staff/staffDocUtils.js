const StaffModel = require("../../Schemas/Staff/staffSchema");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

async function getOrCreateStaffDoc(guildId, userId) {
  let doc = await StaffModel.findOne({ guildId, userId });
  if (!doc) doc = new StaffModel({ guildId, userId });
  return doc;
}

async function deleteThreadForMessage(guild, messageIdOrMessage) {
  const id = typeof messageIdOrMessage === "object" && messageIdOrMessage != null
    ? String(messageIdOrMessage?.id || "")
    : String(messageIdOrMessage || "");
  if (!/^\d{16,20}$/.test(id)) return;
  const thread = guild.channels.cache.get(id) || (await getGuildChannelCached(guild, id));
  if (thread?.isThread?.()) {
    await thread.delete().catch(() => null);
  }
}

module.exports = {
  getOrCreateStaffDoc,
  deleteThreadForMessage,
};
