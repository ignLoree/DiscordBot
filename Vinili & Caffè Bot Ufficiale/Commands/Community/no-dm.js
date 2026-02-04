const { safeReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder } = require("discord.js");
const { getNoDmSet, addNoDm, removeNoDm } = require("../../Utils/noDmList");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("no-dm")
    .setDescription("Gestisci le preferenze per i DM broadcast")
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.guild) {
      return safeReply(interaction, { content: "<:vegax:1443934876440068179> Usa il comando in un server.", flags: 1 << 6 });
    }
    const set = await getNoDmSet(interaction.guild.id);
    if (set.has(interaction.user.id)) {
      await removeNoDm(interaction.guild.id, interaction.user.id);
      return safeReply(interaction, {
        content: "Ok! Ora **riceverai** nuovamente i DM broadcast.",
        flags: 1 << 6
      });
    }
    await addNoDm(interaction.guild.id, interaction.user.id);
    return safeReply(interaction, {
      content: "Ok! **Non riceverai piÃ¹** i DM broadcast. Puoi riattivarli rifacendo /no-dm.",
      flags: 1 << 6
    });
  }
};


