const { safeReply } = require('../../Utils/Moderation/interaction');
const { SlashCommandBuilder } = require("discord.js");
const { getNoDmSet } = require("../../Utils/noDmList");

const getDevIds = (client) => {
  const raw =
    client.config2?.developers ??
    client.config?.developers ??
    "";
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }
  return String(raw)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
};

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
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName("no-dm-list")
    .setDescription("Mostra la lista utenti esclusi dai DM broadcast")
    .setDMPermission(false),

  async execute(interaction, client) {
    const devIds = getDevIds(client);
    if (!devIds.includes(interaction.user.id)) {
      return safeReply(interaction, {
        content: "<:vegax:1443934876440068179> Questo comando è disponibile solo al developer del bot.",
        flags: 1 << 6
      });
    }
    const set = await getNoDmSet(interaction.guild.id);
    const ids = Array.from(set);
    if (!ids.length) {
      return safeReply(interaction, { content: "Nessun utente in lista +no-dm.", flags: 1 << 6 });
    }
    const lines = ids.map((id) => `<@${id}>`);
    const chunks = chunkLines(lines);
    await safeReply(interaction, { content: `Utenti in +no-dm: \n${chunks[0]}`, flags: 1 << 6 });
    for (let i = 1; i < chunks.length; i += 1) {
      await interaction.followUp({ content: chunks[i], flags: 1 << 6 });
    }
  }
};


