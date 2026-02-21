const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { TTS_LANGUAGE_LOCALES } = require("../../Services/TTS/ttsLanguages");

module.exports = {
  name: "languages",
  aliases: ["langs", "ttslanguages"],
  allowEmptyArgs: true,
  async execute(message) {
    const formatted = TTS_LANGUAGE_LOCALES.map(
      (locale) => `\`${locale}\``,
    ).join(", ");
    return safeMessageReply(message, {
      content: `<:infoglowingdot:1443660296823767110> Lingue TTS disponibili: ${formatted}`,
      allowedMentions: { repliedUser: false },
    });
  },
};
