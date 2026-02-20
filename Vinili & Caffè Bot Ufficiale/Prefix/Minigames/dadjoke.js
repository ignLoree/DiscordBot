const { replyError, replyInfo, fetchJson, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "dadjoke",
  aliases: ["dad"],
  async execute(message) {
    try {
      const data = await fetchJson("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } });
      const joke = clamp(data?.joke || "");
      if (!joke) return replyError(message, "Dad joke non disponibile.");
      return replyInfo(message, joke, "Dad Joke");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una dad joke.");
    }
  },
};
