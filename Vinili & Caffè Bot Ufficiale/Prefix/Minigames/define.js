const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "define",
  aliases: ["def", "dictionary"],
  async execute(message, args) {
    const query = String((args || []).join(" ") || "").trim();
    if (!query) return replyError(message, "Uso: +define <parola>");
    try {
      const data = await fetchJson("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(query));
      const row = Array.isArray(data) ? data[0] : null;
      const meanings = Array.isArray(row?.meanings) ? row.meanings : [];
      const firstMeaning = meanings[0];
      const firstDef = firstMeaning?.definitions?.[0]?.definition || "Definizione non disponibile.";
      const phonetic = row?.phonetic || row?.phonetics?.find((p) => p?.text)?.text || "N/D";
      return safeMessageReply(message, {
        embeds: [{
          color: 0x9b59b6,
          title: "Define: " + String(row?.word || query),
          description: clamp(firstDef, 1500),
          fields: [
            { name: "Fonetic", value: String(phonetic), inline: true },
            { name: "Part of speech", value: String(firstMeaning?.partOfSpeech || "N/D"), inline: true },
          ],
        }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Parola non trovata nel dizionario.");
    }
  },
};
