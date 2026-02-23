const { replyError, replyInfo, fetchJson, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "catfacts",
  allowEmptyArgs: true,
  async execute(message) {
    try {
      const data = await fetchJson("https://catfact.ninja/fact");
      const fact = clamp(data?.fact || "");
      if (!fact) return replyError(message, "Curiosità non disponibile.");
      const translated = clamp(await translateToItalian(fact));
      return replyInfo(message, translated, "Curiosità sui gatti");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una curiosità sui gatti.");
    }
  },
};

