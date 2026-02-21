const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["meteo"],
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) return replyError(message, "Uso: +weather <citta>");

    try {
      const data = await fetchJson(
        "https://wttr.in/" + encodeURIComponent(query) + "?format=j1",
      );
      const current = data?.current_condition?.[0];
      if (!current) {
        return replyError(message, "Meteo non disponibile per questa localita.");
      }

      const conditionRaw = String(current.weatherDesc?.[0]?.value || "N/D");
      const condition = await translateToItalian(conditionRaw);

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0x5dade2,
            title: "Meteo: " + query,
            fields: [
              { name: "Temperatura", value: String(current.temp_C + "°C"), inline: true },
              { name: "Percepita", value: String(current.FeelsLikeC + "°C"), inline: true },
              { name: "Umidita", value: String(current.humidity + "%"), inline: true },
              { name: "Vento", value: String(current.windspeedKmph + " km/h"), inline: true },
              { name: "Condizione", value: String(condition || "N/D"), inline: true },
            ],
          },
        ],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Errore durante il recupero del meteo.");
    }
  },
};

