const { replyInfo } = require("../../Utils/Minigames/dynoFunUtils");

const EMOJIS = ["🍒", "🍋", "🔔", "💎", "🍻", "⭐"];

module.exports = {
  name: "slots",
  aliases: ["slot"],
  async execute(message) {
    const spin = Array.from({ length: 3 }, () =>
      EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    );
    const allSame = spin[0] === spin[1] && spin[1] === spin[2];
    const twoSame = new Set(spin).size === 2;
    const result = allSame ? "Jackpot!" : twoSame ? "Quasi!" : "Riprova";
    return replyInfo(message, "| " + spin.join(" | ") + " |\n**" + result + "**", "Slot Machine");
  },
};
