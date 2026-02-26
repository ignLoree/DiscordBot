const { EmbedBuilder } = require("discord.js");
const { getNoDmSet } = require("../../Utils/noDmList");
const IDs = require("../../Utils/Config/ids");

const getStaffRoleIds = (client) => {
  void client;
  return [IDs.roles.Staff, IDs.roles.PartnerManager, IDs.roles.HighStaff]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
};

function collectOpenDmRecipientIds(client) {
  const ids = new Set();
  if (!client?.channels?.cache) return ids;
  for (const channel of client.channels.cache.values()) {
    if (!channel?.isDMBased?.()) continue;
    const recipientId = String(
      channel?.recipientId || channel?.recipient?.id || "",
    );
    if (recipientId) ids.add(recipientId);
  }
  return ids;
}

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
  if (
    !interaction.isModalSubmit() ||
    !interaction.customId.startsWith("dm_broadcast:")
  )
    return false;
  const partsId = String(interaction.customId || "").split(":");
  if (partsId.length < 4) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Dati modal non validi.",
      flags: 1 << 6,
    });
    return true;
  }
  const userId = partsId[1];
  const rawTargetId = partsId[2];
  const allConfirmed = partsId[3] === "1";
  const targetId = rawTargetId && rawTargetId !== "all" ? rawTargetId : null;
  if (!targetId && !allConfirmed) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Invio globale non confermato.",
      flags: 1 << 6,
    });
    return true;
  }
  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Non puoi usare questo modal.",
      flags: 1 << 6,
    });
    return true;
  }

  const title = interaction.fields.getTextInputValue("title")?.trim();
  const message = interaction.fields.getTextInputValue("message")?.trim();
  if (!message) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Messaggio vuoto.",
      flags: 1 << 6,
    });
    return true;
  }

  await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});

  const staffRoleIds = getStaffRoleIds(client);
  const noDmSet = await getNoDmSet(interaction.guild.id);
  await interaction.guild.members.fetch().catch(() => {});

  const skippedNoDm = [];
  const targetIds = new Set();
  const guildMembers = interaction.guild.members.cache;
  if (targetId) {
    targetIds.add(String(targetId));
  } else {
    for (const member of guildMembers.values()) {
      if (!member || member.user?.bot) continue;
      if (
        staffRoleIds.length &&
        staffRoleIds.some((roleId) => member.roles.cache.has(roleId))
      ) {
        continue;
      }
      targetIds.add(String(member.id));
    }
    for (const userId of collectOpenDmRecipientIds(client)) {
      if (!userId) continue;
      if (guildMembers.has(userId)) continue;
      targetIds.add(String(userId));
    }
  }

  const targets = [];
  for (const id of targetIds) {
    if (noDmSet.has(id)) {
      skippedNoDm.push(id);
      continue;
    }

    const member = guildMembers.get(id) || null;
    let user = member?.user || null;
    if (!user) {
      user =
        client?.users?.cache?.get(id) ||
        (await client?.users?.fetch?.(id).catch(() => null));
    }
    if (!user || user.bot) continue;
    if (
      member &&
      staffRoleIds.length &&
      staffRoleIds.some((roleId) => member.roles.cache.has(roleId))
    ) {
      continue;
    }
    targets.push({ id, user, member });
  }

  const content = message.replace(/@everyone|@here/g, "@​everyone");
  const parts = splitMessage(content);
  const footerText =
    "Se non vuoi ricevere più questi avvisi tramite DM fai il comando +dm-disable nel server";

  let sent = 0;
  let failed = 0;
  const failedIds = [];
  let processed = 0;
  const total = targets.length;

  const progressEmbed = (text) =>
    new EmbedBuilder().setColor("#6f4e37").setDescription(text);

  await interaction.editReply({
    embeds: [
      progressEmbed(`Invio DM in corso...\nUtenti target: **${total}**`),
    ],
  });

  for (const target of targets) {
    processed += 1;
    try {
      for (const part of parts) {
        const embed = new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(part)
          .setFooter({ text: footerText })
          .setTimestamp();
        if (title) embed.setTitle(title);
        await target.user.send({
          embeds: [embed],
          allowedMentions: { parse: [] },
        });
      }
      sent += 1;
    } catch {
      failed += 1;
      failedIds.push(target.id);
    }
    if (processed % 25 === 0 || processed === total) {
      await interaction.editReply({
        embeds: [
          progressEmbed(
            `Invio DM in corso...\nUtenti target: **${total}**\nInviati: **${sent}**\nFalliti: **${failed}**`,
          ),
        ],
      });
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  await interaction.editReply({
    embeds: [
      progressEmbed(
        `Invio completato.\nUtenti target: **${total}**\nInviati: **${sent}**\nFalliti: **${failed}**`,
      ),
    ],
  });

  if (failedIds.length || skippedNoDm.length) {
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