const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { TTS_LANGUAGE_OPTIONS } = require("../../Services/TTS/ttsLanguages");
const { getUserTtsLang } = require("../../Services/TTS/ttsService");

const DISPLAY_LANGUAGE_CODES = [
  "af", "am", "ar", "az", "be", "bg", "bn", "bs", "ca", "ceb", "co", "cs", "cy", "da", "de", "el",
  "en", "en-gb", "eo", "es", "es-mx", "et", "eu", "fa",
  "fi", "fil", "fr-ca", "ga", "gd", "gl", "gu", "haw", "he", "hi", "hr", "hu", "hy", "id", "ig",
  "is", "it", "ja", "jw", "ka", "kk", "km", "kn",
  "ko", "ku", "ky", "la", "lb", "lo", "lt", "lv", "mg", "mk", "ml", "mn", "mr", "ms", "mt", "my",
  "ne", "nl", "no", "pa", "pl", "ps", "pt", "pt-br",
  "ro", "ru", "sd", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te",
  "tg", "th", "tr", "uk", "ur", "uz", "vi",
  "xh", "yo", "zh", "zh-tw", "zu",
];

module.exports = {
  name: "voices",
  allowEmptyArgs: true,
  async execute(message, _args, client) {
    const supportedCodes = new Set(TTS_LANGUAGE_OPTIONS.map((x) => x.code));
    const codes = DISPLAY_LANGUAGE_CODES.filter((code) => supportedCodes.has(code));
    const current =
      getUserTtsLang(message.author?.id) || client?.config?.tts?.lang || "it";
    const chunks = [];
    for (let i = 0; i < codes.length; i += 24) {
      chunks.push(codes.slice(i, i + 24).map((code) => `\`${code}\``).join(", "));
    }

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setAuthor({
        name: message.author?.username || "Utente",
        iconURL: message.author?.displayAvatarURL?.() || null,
      })
      .setTitle("TTS Bot Voices | Mode: `gTTS`")
      .setDescription(
        [
          "**Currently supported voices**",
          chunks.join("\n"),
          "",
          "**Current voice used**",
          `\`${current}\``,
        ].join("\n"),
      );

    await safeMessageReply(message, { embeds: [embed] });
  },
};
