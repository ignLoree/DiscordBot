const { replyError, replyInfo } = require("../../Utils/Minigames/dynoFunUtils");

function parseRoll(inputA, inputB) {
  const a = String(inputA || "").trim().toLowerCase();
  const b = Number(inputB || 1);

  if (/^\d+d\d+$/.test(a)) {
    const parts = a.split("d");
    return { count: Number(parts[0]), size: Number(parts[1]) };
  }

  const size = Number(inputA || 6);
  return { count: Number.isFinite(b) ? b : 1, size };
}

module.exports = {

  allowEmptyArgs: true,
  aliases: ["dice"],
  async execute(message, args) {
    const parsed = parseRoll(args?.[0], args?.[1]);
    const count = parsed.count;
    const size = parsed.size;

    if (
      !Number.isFinite(count) ||
      !Number.isFinite(size) ||
      count < 1 ||
      count > 20 ||
      size < 2 ||
      size > 1000
    ) {
      return replyError(
        message,
        "Uso: +roll <dado> [quantita] oppure +roll <quantita>d<dado> (max 20d1000)",
      );
    }

    const out = [];
    for (let i = 0; i < count; i += 1) out.push(Math.floor(Math.random() * size) + 1);
    const total = out.reduce((a, b) => a + b, 0);
    return replyInfo(
      message,
      "Tiri: **" + out.join(", ") + "**\nTotale: **" + total + "**",
      "Lancio d" + size + " x" + count,
    );
  },
};

