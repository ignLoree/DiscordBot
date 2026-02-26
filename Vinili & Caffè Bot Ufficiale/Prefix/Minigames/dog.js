const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "dog",
  allowEmptyArgs: true,
  async execute(message) {
    try {
      const data = await fetchJson("https://dog.ceo/api/breeds/image/random");
      const url = String(data?.message || "");
      if (!url) return replyError(message, "Immagine non disponibile.");
      return safeMessageReply(message, {
        embeds: [{ color: 0x2ecc71, title: "Cane", image: { url } }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare un'immagine di cane.");
    }
  },
};