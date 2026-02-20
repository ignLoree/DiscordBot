const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "quotefun",
  aliases: ["citazionefun", "randquote"],
  async execute(message) {
    try {
      const data = await fetchJson("https://api.quotable.io/random");
      const content = clamp(data?.content || "");
      const author = String(data?.author || "Unknown");
      if (!content) return replyError(message, "Quote non disponibile.");
      return safeMessageReply(message, {
        embeds: [{ color: 0x95a5a6, description: "_" + content + "_\n\n**- " + author + "**" }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una quote.");
    }
  },
};
