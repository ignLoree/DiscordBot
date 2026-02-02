const { EmbedBuilder } = require("discord.js");
const { getNoDmSet } = require("../../Utils/noDmList");

function splitMessage(text, max = 1900) {
  const chunks = [];
  let current = "";
  for (const line of String(text || "").split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > max) {
      if (current) chunks.push(current);
      if (line.length > max) {
        for (let i = 0; i < line.length; i += max) {
          chunks.push(line.slice(i, i + max));
        }
        current = "";
      } else {
        current = line;
      }
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

function chunkLines(lines, maxLen = 1800) {
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

async function handleDmBroadcastModal(interaction, client) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith("dm_broadcast:")) return false;
  const [, userId, targetIdRaw] = interaction.customId.split(":");
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: "<:vegax:1443934876440068179> Non puoi usare questo modal.", flags: 1 << 6 });
    return true;
  }

  const devIds = String(client.config?.developers || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!devIds.includes(interaction.user.id)) {
    await interaction.reply({ content: "<:vegax:1443934876440068179> Comando riservato al developer.", flags: 1 << 6 });
    return true;
  }

  const title = interaction.fields.getTextInputValue("title")?.trim();
  const message = interaction.fields.getTextInputValue("message")?.trim();
  if (!message) {
    await interaction.reply({ content: "<:vegax:1443934876440068179> Messaggio vuoto.", flags: 1 << 6 });
    return true;
  }

  await interaction.deferReply({ flags: 1 << 6 });

  const staffRoleIds = Array.isArray(client.config?.staffRoleIds)
    ? client.config.staffRoleIds
    : [];
  const noDmSet = await getNoDmSet(interaction.guild.id);
  await interaction.guild.members.fetch().catch(() => {});

  const targetId = targetIdRaw && targetIdRaw !== "all" ? targetIdRaw : null;
  const skippedNoDm = [];
  const targets = interaction.guild.members.cache.filter((member) => {
    if (!member || member.user?.bot) return false;
    if (targetId && member.id !== targetId) return false;
    if (!targetId && noDmSet.has(member.id)) {
      skippedNoDm.push(member.id);
      return false;
    }
    if (targetId && noDmSet.has(member.id)) return false;
    if (targetId) return true;
    if (!staffRoleIds.length) return true;
    return !staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
  });

  const content = message.replace(/@everyone|@here/g, "@\u200beveryone");
  const parts = splitMessage(content);
  const footerText = "Se non vuoi ricevere più questi avvisi tramite DM fai il comando /no-dm nel server";

  const progressEmbed = (text) =>
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(text);

  let sent = 0;
  let failed = 0;
  const failedIds = [];
  let processed = 0;
  const total = targets.size;
  if (targetId && total === 0) {
    const blocked = noDmSet.has(targetId);
    return interaction.editReply({
      embeds: [
        progressEmbed(
          blocked
            ? "<:vegax:1443934876440068179> Questo utente ha disattivato i DM broadcast con /no-dm."
            : "<:vegax:1443934876440068179> Utente non trovato o non disponibile."
        )
      ]
    });
  }

  await interaction.editReply({
    embeds: [progressEmbed(`Invio DM in corso...\nUtenti target: **${total}**`)]
  });

  for (const member of targets.values()) {
    processed += 1;
    try {
      for (const part of parts) {
        const embed = new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(part)
          .setFooter({ text: footerText })
          .setTimestamp();
        if (title) embed.setTitle(title);
        await member.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
      sent += 1;
    } catch {
      failed += 1;
      failedIds.push(member.id);
    }
    if (processed % 25 === 0 || processed === total) {
      await interaction.editReply({
        embeds: [
          progressEmbed(
            `Invio DM in corso...\nUtenti target: **${total}**\nInviati: **${sent}**\nFalliti: **${failed}**`
          )
        ]
      });
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  await interaction.editReply({
    embeds: [
      progressEmbed(
        `Invio completato.\nUtenti target: **${total}**\nInviati: **${sent}**\nFalliti: **${failed}**`
      )
    ]
  });

  if (!targetId && (failedIds.length || skippedNoDm.length)) {
    const lines = [];
    if (failedIds.length) {
      lines.push("**Non recapitati:**");
      for (const id of failedIds) {
        const note = noDmSet.has(id) ? " (no-dm)" : "";
        lines.push(`<@${id}>${note}`);
      }
    }
    if (skippedNoDm.length) {
      lines.push("\n**Esclusi (no-dm):**");
      for (const id of skippedNoDm) {
        lines.push(`<@${id}> (no-dm)`);
      }
    }
    const chunks = chunkLines(lines);
    for (const chunk of chunks) {
      await interaction.followUp({ content: chunk, flags: 1 << 6 });
    }
  }
  return true;
}

module.exports = { handleDmBroadcastModal };
