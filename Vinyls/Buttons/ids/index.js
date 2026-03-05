/**
 * Re-export di tutti i customId dei bottoni/select per modulo.
 * Uso: require("../../Buttons/ids") oppure require("../../Buttons/ids/stats") per un solo modulo.
 */
const backup = require("./backup");
const stats = require("./stats");
const ticket = require("./ticket");
const candidature = require("./candidature");
const embedBuilder = require("./embedBuilder");
const resoconto = require("./resoconto");
const customRole = require("./customRole");
const pause = require("./pause");
const verify = require("./verify");
const suggestion = require("./suggestion");
const minigame = require("./minigame");
const prefixMisc = require("./prefixMisc");

module.exports = {
  ...backup,
  ...stats,
  ...ticket,
  ...candidature,
  ...embedBuilder,
  ...resoconto,
  ...customRole,
  ...pause,
  ...verify,
  ...suggestion,
  ...minigame,
  ...prefixMisc,
};
