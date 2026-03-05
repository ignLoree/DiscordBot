const { replyError, replyInfo, fetchJson, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "chucknorris",
  allowEmptyArgs: true,
  aliases: ["chuck"],
  async execute(message) {
    try {
      const data = await fetchJson("https://api.chucknorris.io/jokes/random");
      const joke = clamp(data?.value || "");
      if (!joke) return replyError(message, "Battuta non disponibile.");
      const translated = clamp(await translateToItalian(joke));
      return replyInfo(message, translated, "Battuta di Chuck Norris");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una battuta.");
    }
  },
};