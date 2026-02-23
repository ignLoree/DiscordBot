const { replyError, replyInfo } = require("../../Utils/Minigames/dynoFunUtils");

const MAP = {
  rock: "sasso",
  paper: "carta",
  scissors: "forbici",
  sasso: "sasso",
  carta: "carta",
  forbici: "forbici",
};

const BEATS = {
  sasso: "forbici",
  carta: "sasso",
  forbici: "carta",
};

module.exports = {
  name: "rps",
  allowEmptyArgs: true,
  async execute(message, args) {
    const choice = MAP[String(args?.[0] || "").toLowerCase()];
    if (!choice) return replyError(message, "Uso: +rps <sasso|carta|forbici>");

    const options = ["sasso", "carta", "forbici"];
    const bot = options[Math.floor(Math.random() * options.length)];

    let result = "Pareggio";
    if (choice !== bot) result = BEATS[choice] === bot ? "Hai vinto" : "Hai perso";

    return replyInfo(
      message,
      "Tu: **" + choice + "**\nBot: **" + bot + "**\nEsito: **" + result + "**",
      "Sasso Carta Forbici",
    );
  },
};

