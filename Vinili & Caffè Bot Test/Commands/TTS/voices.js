const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { safeReply } = require("../../Utils/Moderation/reply");
const { TTS_LANGUAGE_OPTIONS } = require("../../Services/TTS/ttsLanguages");
const { getUserTtsLang } = require("../../Services/TTS/ttsService");

const EPHEMERAL_FLAG = 1 << 6;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voices")
    .setDescription("Mostra tutte le voci TTS supportate."),

  async execute(interaction, client) {
    const codes = TTS_LANGUAGE_OPTIONS.map((x) => x.code);
    const current =
      getUserTtsLang(interaction.user?.id) || client?.config?.tts?.lang || "it";
    const chunks = [];
    for (let i = 0; i < codes.length; i += 24) {
      chunks.push(codes.slice(i, i + 24).join(", "));
    }

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setAuthor({
        name: interaction.user?.username || "Utente",
        iconURL: interaction.user?.displayAvatarURL?.() || null,
      })
      .setTitle("TTS Bot Voices | Mode: \`gTTS\`")
      .setDescription(
        [
          "**Currently supported voices**",
          chunks.join("\n"),
          "",
          "**Current voice used**",
          `\`${current}\``,
        ].join("\n"),
      );

    await safeReply(interaction, { embeds: [embed], flags: EPHEMERAL_FLAG });
  },
};