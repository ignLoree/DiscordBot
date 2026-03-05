const math = require("mathjs");
const { replyError, replyInfo, fetchJson, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "math",
  allowEmptyArgs: true,
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) {
      const n = Math.floor(Math.random() * 1000) + 1;
      try {
        const data = await fetchJson("https://numbersapi.com/" + n + "?json");
        const fact = await translateToItalian(data?.text || "Nessun dato.");
        return replyInfo(message, String(n + ": " + fact), "Curiosità sui numeri");
      } catch {
        return replyInfo(message, "Numero casuale: **" + String(n) + "**", "Numero casuale");
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