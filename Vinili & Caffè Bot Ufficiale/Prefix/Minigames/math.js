const math = require("mathjs");
const { replyError, replyInfo, fetchJson, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["calc", "numbers"],
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) {
      const n = Math.floor(Math.random() * 1000) + 1;
      try {
        const data = await fetchJson("https://numbersapi.com/" + n + "?json");
        const fact = await translateToItalian(data?.text || "Nessun dato.");
        return replyInfo(message, String(n + ": " + fact), "Curiosita sui Numeri");
      } catch {
        return replyInfo(message, "Numero casuale: **" + String(n) + "**", "Matematica");
      }
    }

    try {
      const result = math.evaluate(query);
      return replyInfo(message, "`" + query + "` = **" + String(result) + "**", "Matematica");
    } catch {
      return replyError(message, "Espressione matematica non valida.");
    }
  },
};

