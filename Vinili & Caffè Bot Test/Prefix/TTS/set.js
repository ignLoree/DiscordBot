const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { setUserTtsLang } = require("../../Services/TTS/ttsService");
const { normalizeTtsLanguageInput } = require("../../Services/TTS/ttsLanguages");

module.exports = {
  name: "set",
  allowEmptyArgs: false,
  usage: "-set <voice|autojoin> <valore>",
  subcommands: ["voice", "autojoin"],
  subcommandDescriptions: {
    voice: "Imposta la lingua/voce TTS personale (o resetta).",
    autojoin: "Attiva o disattiva l'autojoin TTS del bot.",
  },
  subcommandUsages: {
    voice: "-set voice <codice|reset>",
    autojoin: "-set autojoin <on|off>",
  },
  async execute(message, args = []) {
    const sub = String(args[0] || "").toLowerCase();
    if (!sub || !["voice", "autojoin"].includes(sub)) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Uso: `-set voice <codice|reset>` oppure `-set autojoin <on|off>`.",
      );
    }

    if (sub === "autojoin") {
      const raw = String(args[1] || "").trim().toLowerCase();
      if (!raw) {
        return safeMessageReply(
          message,
          "<:vegax:1443934876440068179> Specifica `on` oppure `off`.",
        );
      }
      const onValues = new Set(["on", "true", "1", "yes", "si", "enable", "enabled"]);
      const offValues = new Set(["off", "false", "0", "no", "disable", "disabled"]);
      if (!onValues.has(raw) && !offValues.has(raw)) {
        return safeMessageReply(
          message,
          "<:vegax:1443934876440068179> Valore non valido. Usa `on` oppure `off`.",
        );
      }
      message.client.config = message.client.config || {};
      message.client.config.tts = message.client.config.tts || {};
      message.client.config.tts.autojoin = onValues.has(raw);
      return safeMessageReply(
        message,
        `<:vegacheckmark:1443666279058772028> Autojoin TTS impostato su \`${onValues.has(raw) ? "attivo" : "disattivato"}\`.`,
      );
    }

    const input = String(args.slice(1).join(" ") || "").trim();
    if (!input) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Specifica una lingua (es: `it`) oppure `reset`.",
      );
    }
    if (["reset", "default", "off", "none"].includes(input.toLowerCase())) {
      setUserTtsLang(message.author.id, null);
      return safeMessageReply(
        message,
        "<:vegacheckmark:1443666279058772028> Voce TTS personale resettata.",
      );
    }

    const language = normalizeTtsLanguageInput(input);
    if (!language) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Voce non valida. Usa `-langs`.",
      );
    }

    setUserTtsLang(message.author.id, language);
    return safeMessageReply(
      message,
      `<:vegacheckmark:1443666279058772028> Voce TTS impostata su \`${language}\`.`,
    );
  },
};
