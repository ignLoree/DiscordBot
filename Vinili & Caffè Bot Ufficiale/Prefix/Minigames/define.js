const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, clamp, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

const PART_OF_SPEECH_IT = {
  noun: "sostantivo",
  verb: "verbo",
  adjective: "aggettivo",
  adverb: "avverbio",
  pronoun: "pronome",
  preposition: "preposizione",
  conjunction: "congiunzione",
  interjection: "interiezione",
  determiner: "determinante",
  particle: "particella",
  numeral: "numerale",
  phrase: "locuzione",
  idiom: "modo di dire",
  "phrasal verb": "verbo frasale",
};

module.exports = {
  name: "define",
  allowEmptyArgs: true,
  aliases: ["definizione"],
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
      const partRaw = firstMeaning?.partOfSpeech || "N/D";
      const partIt =
        PART_OF_SPEECH_IT[String(partRaw).toLowerCase()] ||
        (await translateToItalian(partRaw));

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0x9b59b6,
            title: "Definizione: " + String(row?.word || query),
            description: translatedDef,
            fields: [
              { name: "Fonetica", value: String(phonetic), inline: true },
              {
                name: "Parte del discorso",
                value: String(partIt),
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

