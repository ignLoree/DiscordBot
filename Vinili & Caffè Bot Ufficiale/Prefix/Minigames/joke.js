const { replyError, replyInfo, fetchJson, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["randomjoke"],
  async execute(message) {
    try {
      const data = await fetchJson("https://official-joke-api.appspot.com/random_joke");
      const joke = clamp(String(data?.setup || "") + "\n" + String(data?.punchline || ""));
      if (!joke.trim()) return replyError(message, "Battuta non disponibile.");
      const translated = clamp(await translateToItalian(joke));
      return replyInfo(message, translated, "Battuta Casuale");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una battuta.");
    }
  },
};

