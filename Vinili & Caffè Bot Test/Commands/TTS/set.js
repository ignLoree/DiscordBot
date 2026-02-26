const { SlashCommandBuilder } = require("discord.js");
const { safeReply } = require("../../Utils/Moderation/reply");
const { setUserTtsLang } = require("../../Services/TTS/ttsService");
const {
  TTS_LANGUAGE_OPTIONS,
  normalizeTtsLanguageInput,
} = require("../../Services/TTS/ttsLanguages");

const EPHEMERAL_FLAG = 1 << 6;

function normalizeLookup(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Impostazioni personali del bot")
    .addSubcommand((sub) =>
      sub
        .setName("autojoin")
        .setDescription("Attiva o disattiva l'autojoin TTS")
        .addBooleanOption((opt) =>
          opt
            .setName("stato")
            .setDescription("true per attivare, false per disattivare")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("voice")
        .setDescription("Imposta la voce TTS personale")
        .addStringOption((opt) =>
          opt
            .setName("voice")
            .setDescription("Voce da usare. Lascia vuoto per reset")
            .setAutocomplete(true)
            .setRequired(false),
        ),
    ),

  async autocomplete(interaction) {
    const focused = normalizeLookup(interaction.options.getFocused?.() || "");
    const filtered = TTS_LANGUAGE_OPTIONS.filter((item) => {
      if (!focused) return true;
      const code = normalizeLookup(item.code);
      const locale = normalizeLookup(item.locale);
      const name = normalizeLookup(item.name);
      return code.includes(focused) || locale.includes(focused) || name.includes(focused);
    })
      .slice(0, 25)
      .map((item) => ({
        name: `${item.name} (${item.code})`,
        value: item.code,
      }));

    await interaction.respond(filtered).catch(() => {});
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(false);
    if (sub === "autojoin") {
      const state = interaction.options.getBoolean("stato", true);
      interaction.client.config = interaction.client.config || {};
      interaction.client.config.tts = interaction.client.config.tts || {};
      interaction.client.config.tts.autojoin = Boolean(state);
      await safeReply(interaction, {
        content: `<:vegacheckmark:1443666279058772028> Autojoin TTS impostato su \`${state ? "attivo" : "disattivato"}\`.`,
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    if (sub !== "voice") return;

    const inputRaw = interaction.options.getString("voice", false);
    if (!inputRaw) {
      setUserTtsLang(interaction.user.id, null);
      await safeReply(interaction, {
        content:
          "<:vegacheckmark:1443666279058772028> Voce TTS personale resettata (usa quella di default del bot).",
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    const language = normalizeTtsLanguageInput(inputRaw);
    if (!language) {
      await safeReply(interaction, {
        content:
          "<:vegax:1443934876440068179> Voce non valida. Usa l'autocomplete o `/langs`.",
        flags: EPHEMERAL_FLAG,
      });
      return;
    }

    setUserTtsLang(interaction.user.id, language);
    await safeReply(interaction, {
      content: `<:vegacheckmark:1443666279058772028> Voce TTS impostata su \`${language}\`.`,
      flags: EPHEMERAL_FLAG,
    });
  },
};