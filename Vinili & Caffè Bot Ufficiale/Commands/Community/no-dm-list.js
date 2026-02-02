const { SlashCommandBuilder } = require("discord.js");
const { getNoDmSet } = require("../../Utils/noDmList");

function chunkLines(lines, maxLen = 1900) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("no-dm-list")
    .setDescription("Mostra la lista utenti esclusi dai DM broadcast")
    .setDMPermission(false),

  async execute(interaction, client) {
    const devIds = String(client.config?.developers || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!devIds.includes(interaction.user.id)) {
      return interaction.reply({
        content: "<:vegax:1443934876440068179> Questo comando è disponibile solo al developer del bot.",
        flags: 1 << 6
      });
    }
    const set = await getNoDmSet(interaction.guild.id);
    const ids = Array.from(set);
    if (!ids.length) {
      return interaction.reply({ content: "Nessun utente in lista /no-dm.", flags: 1 << 6 });
    }
    const lines = ids.map((id) => `<@${id}>`);
    const chunks = chunkLines(lines);
    await interaction.reply({ content: `Utenti in /no-dm: \n${chunks[0]}`, flags: 1 << 6 });
    for (let i = 1; i < chunks.length; i += 1) {
      await interaction.followUp({ content: chunks[i], flags: 1 << 6 });
    }
  }
};
