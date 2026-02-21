const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["def", "dictionary"],
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) return replyError(message, "Uso: +define <parola>");

    try {
      const data = await fetchJson(
        "https://api.dictionaryapi.dev/api/v2/entries/en/" +
          encodeURIComponent(query),
      );
      const row = Array.isArray(data) ? data[0] : null;
      const meanings = Array.isArray(row?.meanings) ? row.meanings : [];
      const firstMeaning = meanings[0];
      const firstDef = String(
        firstMeaning?.definitions?.[0]?.definition ||
          "Definizione non disponibile.",
      );
      const translatedDef = clamp(await translateToItalian(firstDef), 1500);
      const phonetic =
        row?.phonetic || row?.phonetics?.find((p) => p?.text)?.text || "N/D";

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0x9b59b6,
            title: "Definizione: " + String(row?.word || query),
            description: translatedDef,
            fields: [
              { name: "Fonetica", value: String(phonetic), inline: true },
              {

  allowEmptyArgs: true,
                value: String(firstMeaning?.partOfSpeech || "N/D"),
                inline: true,
              },
            ],
          },
        ],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Parola non trovata nel dizionario.");
    }
  },
};

