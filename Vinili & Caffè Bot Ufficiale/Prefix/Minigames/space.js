const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "space",
  aliases: ["iss"],
  async execute(message) {
    try {
      const pair = await Promise.all([
        fetchJson("http://api.open-notify.org/iss-now.json"),
        fetchJson("http://api.open-notify.org/astros.json"),
      ]);
      const iss = pair[0];
      const astros = pair[1];
      const lat = Number(iss?.iss_position?.latitude || 0).toFixed(4);
      const lon = Number(iss?.iss_position?.longitude || 0).toFixed(4);
      const people = Number(astros?.number || 0);
      const list = Array.isArray(astros?.people) ? astros.people.slice(0, 10).map((p) => p?.name).filter(Boolean).join(", ") : "N/D";

      return safeMessageReply(message, {
        embeds: [{
          color: 0x1f8bff,
          title: "Space / ISS",
          fields: [
            { name: "ISS Lat", value: String(lat), inline: true },
            { name: "ISS Lon", value: String(lon), inline: true },
            { name: "Persone nello spazio", value: String(people), inline: true },
            { name: "Crew", value: String(list || "N/D"), inline: false },
          ],
        }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Dati spazio non disponibili al momento.");
    }
  },
};
