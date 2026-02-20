const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "movie",
  aliases: ["film"],
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) return replyError(message, "Uso: +movie <titolo>");

    try {
      const data = await fetchJson(
        "https://www.omdbapi.com/?apikey=thewdb&t=" + encodeURIComponent(query),
      );
      if (!data || data.Response === "False") {
        return replyError(message, "Film non trovato.");
      }

      const translatedPlot = clamp(
        await translateToItalian(data.Plot || "Trama non disponibile."),
      );

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0x8e44ad,
            title: String((data.Title || query) + " (" + (data.Year || "N/D") + ")"),
            description: translatedPlot,
            thumbnail:
              data.Poster && data.Poster !== "N/A"
                ? { url: data.Poster }
                : undefined,
            fields: [
              { name: "Valutazione", value: String(data.imdbRating || "N/D"), inline: true },
              { name: "Durata", value: String(data.Runtime || "N/D"), inline: true },
              { name: "Genere", value: String(data.Genre || "N/D"), inline: true },
            ],
          },
        ],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Errore durante la ricerca del film.");
    }
  },
};
