const { replyError, replyInfo, fetchJson, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["dogfact"],
  async execute(message) {
    try {
      const data = await fetchJson("https://dogapi.dog/api/v2/facts");
      const fact = clamp(data?.data?.[0]?.attributes?.body || "");
      if (!fact) return replyError(message, "Curiosita non disponibile.");
      const translated = clamp(await translateToItalian(fact));
      return replyInfo(message, translated, "Curiosita sui Cani");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una curiosita sui cani.");
    }
  },
};

