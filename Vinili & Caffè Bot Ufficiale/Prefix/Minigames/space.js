const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["iss"],
  async execute(message) {
    try {
      const [iss, astronauts] = await Promise.all([
        fetchJson("https://api.wheretheiss.at/v1/satellites/25544"),
        fetchJson("https://ll.thespacedevs.com/2.2.0/astronaut/?in_space=true&limit=20"),
      ]);

      const lat = Number(iss?.latitude || 0).toFixed(4);
      const lon = Number(iss?.longitude || 0).toFixed(4);
      const alt = Number(iss?.altitude || 0).toFixed(1);
      const vel = Number(iss?.velocity || 0).toFixed(0);

      const astroRows = Array.isArray(astronauts?.results) ? astronauts.results : [];
      const people = Number(astronauts?.count || astroRows.length || 0);
      const names = astroRows
        .map((p) => p?.name)
        .filter(Boolean)
        .slice(0, 10)
        .join(", ");
      const translatedCrew = names ? await translateToItalian(names, { maxLength: 900 }) : "N/D";

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0x1f8bff,
            title: "Spazio / ISS",
            fields: [
              { name: "Latitudine ISS", value: String(lat), inline: true },
              { name: "Longitudine ISS", value: String(lon), inline: true },
              { name: "Altitudine ISS", value: String(alt + " km"), inline: true },
              { name: "Velocita ISS", value: String(vel + " km/h"), inline: true },
              { name: "Persone nello spazio", value: String(people), inline: true },
              { name: "Equipaggio", value: clamp(String(translatedCrew || "N/D"), 1000), inline: false },
            ],
          },
        ],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Dati sullo spazio non disponibili al momento.");
    }
  },
};

