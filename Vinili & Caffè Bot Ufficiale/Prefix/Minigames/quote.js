const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "quotefun",
  aliases: ["citazionefun", "randquote"],
  async execute(message) {
    try {
      let data = null;
      let content = "";
      let author = "Sconosciuto";

      try {
        data = await fetchJson("https://api.quotable.io/random");
        content = clamp(data?.content || "");
        author = String(data?.author || "Sconosciuto");
      } catch {
      }

      if (!content) {
        const alt = await fetchJson("https://zenquotes.io/api/random");
        const row = Array.isArray(alt) ? alt[0] : null;
        content = clamp(row?.q || "");
        author = String(row?.a || "Sconosciuto");
      }

      if (!content) return replyError(message, "Citazione non disponibile.");
      const translated = clamp(await translateToItalian(content));

      return safeMessageReply(message, {
        embeds: [{ color: 0x95a5a6, description: "_" + translated + "_\n\n**- " + author + "**" }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una citazione.");
    }
  },
};
