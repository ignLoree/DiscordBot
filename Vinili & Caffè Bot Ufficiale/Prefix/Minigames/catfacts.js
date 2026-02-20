const { replyError, replyInfo, fetchJson, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "catfacts",
  aliases: ["catfact"],
  async execute(message) {
    try {
      const data = await fetchJson("https://catfact.ninja/fact");
      const fact = clamp(data?.fact || "");
      if (!fact) return replyError(message, "Fact non disponibile.");
      return replyInfo(message, fact, "Cat Fact");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare un cat fact.");
    }
  },
};
