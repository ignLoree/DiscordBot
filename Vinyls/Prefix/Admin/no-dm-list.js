const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getAllNoDmPreferences, DM_CATEGORY_LABELS } = require("../../Utils/noDmList");

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

function formatBlockedLabel(entry) {
  if (entry.blockAll) return "**Tutto disattivato**";
  if (!entry.disabled || entry.disabled.length === 0) return "—";
  const labels = entry.disabled
    .map((key) => DM_CATEGORY_LABELS[key] || key)
    .filter(Boolean);
  return labels.length ? labels.join(", ") : "—";
}

module.exports = {
  name: "no-dm-list",
  aliases: ["nodmlist"],
  allowEmptyArgs: true,
  async execute(message) {
    const guildId = message.guild.id;
    const list = await getAllNoDmPreferences(guildId);
    if (!list.length) {
      await safeMessageReply(message, {
        content: "Nessun utente con preferenze DM in lista `+dm-disable`.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const lines = list.map((entry) => {
      const label = formatBlockedLabel(entry);
      return `<@${entry.userId}> — ${label}`;
    });
    const chunks = chunkLines(lines);

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Utenti con preferenze DM")
      .setDescription(
        `Elenco utenti che hanno disattivato una o più categorie di DM.\n\n${chunks[0]}`,
      )
      .setFooter({
        text: "Legenda: «Tutto disattivato» = nessun DM; altrimenti solo le categorie elencate sono bloccate.",
      });

    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
    for (let i = 1; i < chunks.length; i += 1) {
      await message.channel.send({
        content: chunks[i],
        allowedMentions: { repliedUser: false },
      });
    }
  },
};