const { replyInfo } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "flip",
  aliases: ["coinflip"],
  async execute(message) {
    const side = Math.random() < 0.5 ? "Testa" : "Croce";
    return replyInfo(message, "🪙 Risultato: **" + side + "**", "Lancio Moneta");
  },
};
