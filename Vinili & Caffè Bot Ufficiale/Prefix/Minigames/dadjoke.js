const { replyError, replyInfo, fetchJson, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "dadjoke",
  allowEmptyArgs: true,
  aliases: ["dad"],
  async execute(message) {
    try {
      const data = await fetchJson("https://icanhazdadjoke.com/", {
        headers: { Accept: "application/json" },
      });
      const joke = clamp(data?.joke || "");
      if (!joke) return replyError(message, "Battuta non disponibile.");
      const translated = clamp(await translateToItalian(joke));
      return replyInfo(message, translated, "Battuta del giorno");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una battuta.");
    }
  },
};