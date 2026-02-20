const { replyError, replyInfo, fetchJson, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "chucknorris",
  aliases: ["dynorris", "chuck"],
  async execute(message) {
    try {
      const data = await fetchJson("https://api.chucknorris.io/jokes/random");
      const joke = clamp(data?.value || "");
      if (!joke) return replyError(message, "Joke non disponibile.");
      return replyInfo(message, joke, "Chuck Norris Joke");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una battuta.");
    }
  },
};
