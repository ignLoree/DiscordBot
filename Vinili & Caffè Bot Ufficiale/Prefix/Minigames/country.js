const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "country",
  aliases: ["nazione"],
  async execute(message, args) {
    const code = String(args?.[0] || "").trim();
    if (!code) return replyError(message, "Uso: +country <codice paese (es. ITA, IT)>");
    try {
      const data = await fetchJson("https://restcountries.com/v3.1/alpha/" + encodeURIComponent(code) + "?fields=name,capital,population,region,subregion,currencies,flags,cca2,cca3");
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return replyError(message, "Paese non trovato.");
      const currencies = row.currencies ? Object.values(row.currencies).map((c) => c?.name).filter(Boolean).join(", ") : "N/D";
      const capital = Array.isArray(row.capital) ? row.capital.join(", ") : "N/D";
      return safeMessageReply(message, {
        embeds: [{
          color: 0x3498db,
          title: String((row.name?.common || "Country") + " (" + (row.cca3 || row.cca2 || code.toUpperCase()) + ")"),
          thumbnail: row.flags?.png ? { url: row.flags.png } : undefined,
          fields: [
            { name: "Capitale", value: String(capital), inline: true },
            { name: "Regione", value: String((row.region || "N/D") + (row.subregion ? " / " + row.subregion : "")), inline: true },
            { name: "Popolazione", value: Number(row.population || 0).toLocaleString("it-IT"), inline: true },
            { name: "Valuta", value: String(currencies || "N/D"), inline: false },
          ],
        }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare i dati del paese.");
    }
  },
};
