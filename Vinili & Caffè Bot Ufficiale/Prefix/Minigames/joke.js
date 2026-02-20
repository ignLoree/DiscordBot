const { replyError, replyInfo, fetchJson, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "joke",
  aliases: ["randomjoke"],
  async execute(message) {
    try {
      const data = await fetchJson("https://official-joke-api.appspot.com/random_joke");
      const joke = clamp(String(data?.setup || "") + "\n" + String(data?.punchline || ""));
      if (!joke.trim()) return replyError(message, "Joke non disponibile.");
      return replyInfo(message, joke, "Joke");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare una battuta.");
    }
  },
};
