const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { runNoDmPanel } = require("../../Utils/noDmPanel");

module.exports = {
  name: "dm-disable",
  aliases: ["no-dm"],
  allowEmptyArgs: true,
  async execute(message) {
    if (!message.guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa il comando in un server.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await runNoDmPanel(message, { mode: "disable" });
  },
};
