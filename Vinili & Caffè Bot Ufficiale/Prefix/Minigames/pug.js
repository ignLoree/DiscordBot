const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "pug",
  allowEmptyArgs: true,
  async execute(message) {
    try {
      const data = await fetchJson("https://dog.ceo/api/breed/pug/images/random");
      const url = String(data?.message || "");
      if (!url) return replyError(message, "Immagine non disponibile.");
      return safeMessageReply(message, {
        embeds: [{ color: 0x2ecc71, title: "Carlino", image: { url } }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare un'immagine di carlino.");
    }
  },
};

