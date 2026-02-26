const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "birb",
  allowEmptyArgs: true,
  aliases: ["bird"],
  async execute(message) {
    try {
      const data = await fetchJson("https://shibe.online/api/birds?count=1");
      const url = Array.isArray(data) ? String(data[0] || "") : "";
      if (!url) return replyError(message, "Immagine non disponibile al momento.");
      return safeMessageReply(message, {
        embeds: [{ color: 0x2ecc71, title: "Uccellino", image: { url } }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare un'immagine di uccello.");
    }
  },
};