const { replyError, replyInfo, fetchJson, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["catfact"],
  async execute(message) {
    try {
      const data = await fetchJson("https://catfact.ninja/fact");
      const fact = clamp(data?.fact || "");
      if (!fact) return replyError(message, "Curiosita non disponibile.");
      const translated = clamp(await translateToItalian(fact));
      return replyInfo(message, translated, "Curiosita sui Gatti");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una curiosita sui gatti.");
    }
  },
};

