const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "itunes",
  allowEmptyArgs: true,
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) return replyError(message, "Uso: +itunes <titolo o artista>");

    try {
      const data = await fetchJson(
        "https://itunes.apple.com/search?media=music&limit=1&term=" +
          encodeURIComponent(query),
      );
      const track = Array.isArray(data?.results) ? data.results[0] : null;
      if (!track) return replyError(message, "Nessun risultato trovato su iTunes.");

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0xe74c3c,
            title: String(
              (track.trackName || "Sconosciuto") +
                " - " +
                (track.artistName || "Sconosciuto"),
            ),
            url: track.trackViewUrl || track.collectionViewUrl || undefined,
            description: clamp(track.collectionName || "N/D"),
            thumbnail: track.artworkUrl100
              ? { url: track.artworkUrl100.replace("100x100", "600x600") }
              : undefined,
            fields: [
              { name: "Album", value: String(track.collectionName || "N/D"), inline: true },
              {
                name: "Genere",
                value: String(await translateToItalian(track.primaryGenreName || "N/D")),
                inline: true,
              },
              {
                name: "Durata",
                value: String(Math.round(Number(track.trackTimeMillis || 0) / 1000) + " s"),
                inline: true,
              },
            ],
          },
        ],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Errore durante la ricerca su iTunes.");
    }
  },
};