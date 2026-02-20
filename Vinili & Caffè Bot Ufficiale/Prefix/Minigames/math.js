const math = require("mathjs");
const { replyError, replyInfo, fetchJson } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "math",
  aliases: ["calc", "numbers"],
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) {
      const n = Math.floor(Math.random() * 1000) + 1;
      try {
        const data = await fetchJson("http://numbersapi.com/" + n + "?json");
        return replyInfo(message, String(n + ": " + (data?.text || "Nessun dato.")), "Numbers API");
      } catch {
        return replyInfo(message, "Numero casuale: **" + String(n) + "**", "Math");
      }
    }

    try {
      const result = math.evaluate(query);
      return replyInfo(message, "`" + query + "` = **" + String(result) + "**", "Math");
    } catch {
      return replyError(message, "Espressione matematica non valida.");
    }
  },
};
