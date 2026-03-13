const { EmbedBuilder } = require("discord.js");
const { shouldBlockDm } = require("../../Utils/noDmList");
const IDs = require("../../Utils/Config/ids");
const { getUserCached } = require("../../Utils/Interaction/interactionEntityCache");
const { splitMessage, chunkLines } = require("../../Utils/Message/messageChunkUtils");

const getStaffRoleIds = (client) => { void client; return [IDs.roles.Staff, IDs.roles.PartnerManager, IDs.roles.HighStaff].map((id) => String(id || "").trim()).filter(Boolean); };

function collectOpenDmRecipientIds(client) {
  const ids = new Set();
  if (!client?.channels?.cache) return ids;
  for (const channel of client.channels.cache.values()) {
    if (!channel?.isDMBased?.()) continue;
    const recipientId = String(channel?.recipientId || channel?.recipient?.id || "",);
    if (recipientId) ids.add(recipientId);
  }
  return ids;
}

async function handleDmBroadcastModal(interaction, client) {
  if (
    !interaction.isModalSubmit() ||
    !interaction.customId.startsWith("dm_broadcast:")
  )
    return false;
  if (!interaction.guild) {
    await interaction.reply({
      content:
        "<:vegax:1443934876440068179> Questo modulo può essere usato solo in un server.",
      flags: 1 << 6,
    }).catch(() => { });
    return true;
  }
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

  await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });

  const staffRoleIds = getStaffRoleIds(client);
  const guildId = interaction.guild.id;
  if (!targetId) {
    await interaction.guild.members.fetch().catch(() => { });
  }

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
    if (await shouldBlockDm(guildId, id, "broadcast").catch(() => false)) {
      skippedNoDm.push(id);
      continue;
    }

    const member = guildMembers.get(id) || null;
    let user = member?.user || null;
    if (!user) {
      user = await getUserCached(client, id);
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
  const footerText = "Se non vuoi ricevere più questi avvisi tramite DM fai il comando +dm-disable nel server";

  let sent = 0;
  let failed = 0;
  const failedIds = [];
  let processed = 0;
  const total = targets.length;

  const progressEmbed = (text) => new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(text);

  await interaction.editReply({
    embeds: [
      progressEmbed(`<a:VC_pixeltime:1470796283320209600> Invio DM in corso...\n<:VC_Mention:1443994358201323681> Utenti target: **${total}**`),
    ],
  }).catch(() => { });

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
            `<a:VC_pixeltime:1470796283320209600> Invio DM in corso...\n<:VC_Mention:1443994358201323681> Utenti target: **${total}**\n<a:VC_pixeltime:1470796283320209600> Inviati: **${sent}**\n<:cancel:1461730653677551691> Falliti: **${failed}**`,
          ),
        ],
      }).catch(() => { });
    }
    await new Promise((r) => setTimeout(r, 750));
  }

  await interaction.editReply({
    embeds: [
      progressEmbed(
        `<:thumbsup:1471292172145004768> Invio completato.\n<:VC_Mention:1443994358201323681> Utenti target: **${total}**\n<a:VC_pixeltime:1470796283320209600> Inviati: **${sent}**\n<:cancel:1461730653677551691> Falliti: **${failed}**`,
      ),
    ],
  }).catch(() => { });

  if (failedIds.length || skippedNoDm.length) {
    const lines = [];
    if (failedIds.length) {
      lines.push("<:vegax:1443934876440068179> **Non recapitati:**");
      for (const id of failedIds) {
        lines.push(`<@${id}>`);
      }
    }
    if (skippedNoDm.length) {
      lines.push("\n<:vegax:1443934876440068179> **Esclusi (no-dm):**");
      for (const id of skippedNoDm) {
        lines.push(`<@${id}> (no-dm)`);
      }
    }
    const chunks = chunkLines(lines);
    for (const chunk of chunks) {
      await interaction.followUp({ content: chunk, flags: 1 << 6 }).catch(() => { });
    }
  }
  return true;
}

module.exports = { handleDmBroadcastModal };