const { EmbedBuilder } = require("discord.js");
const axios = require("axios");
const Staff = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

function extractInviteCode(text) {
  if (!text) return null;
  const patterns = [/discord\.gg\/([a-zA-Z0-9-]+)/i, /discord\.com\/invite\/([a-zA-Z0-9-]+)/i, /discordapp\.com\/invite\/([a-zA-Z0-9-]+)/i,];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match && match[1]) return match[1];
  }
  const fallback = String(text).match(/\b([a-zA-Z0-9-]{6,32})\b/);
  return fallback ? fallback[1] : null;
}

function isValidServerName(name) {
  if (!name) return false;
  const trimmed = String(name).replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

function stripLinksFromDescription(text) {
  const str = String(text || "");
  const withoutNonInviteUrls = str
    .replace(
      /\bhttps?:\/\/(?!discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.com\/invite\/)\S+/gi,
      " ",
    )
    .replace(/\bwww\.[^\s<>()]+\.[a-z]{2,}(?:\/\S*)?/gi, " ")
    .replace(
      /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi,
      (match) =>
        /^(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.com\/invite\/)/i.test(
          String(match || "").trim(),
        )
          ? match
          : " ",
    );
  // Collapse only horizontal space (preserve newlines), then normalize line breaks
  return withoutNonInviteUrls
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

async function getOrCreateStaffPartnerDoc(guildId, userId) {
  let staffDoc = await Staff.findOne({ guildId, userId });
  if (!staffDoc) {
    staffDoc = new Staff({
      guildId,
      userId,
      partnerCount: 0,
      partnerActions: [],
    });
  }
  if (!Array.isArray(staffDoc.partnerActions)) staffDoc.partnerActions = [];
  if (typeof staffDoc.partnerCount !== "number") staffDoc.partnerCount = 0;
  return staffDoc;
}

async function handlePartnerModal(interaction) {
  if (
    !interaction.isModalSubmit() ||
    !interaction.customId.startsWith("partnershipModal_")
  )
    return false;
  const { openerId, managerId } = parsePartnershipModalId(interaction.customId);
  if (openerId && String(openerId) !== String(interaction.user?.id || "")) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Alert:1448670089670037675> Non puoi usare questo modulo.",
          ),
      ],
      flags: 1 << 6,
    }).catch(() => { });
    return true;
  }
  await interaction
    .deferReply()
    .catch(() => { })
    .catch(() => { });
  if (!interaction.member.roles.cache.has(IDs.roles.PartnerManager)) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            "<a:VC_Alert:1448670089670037675> Non hai i permessi per fare partnership.",
          )
          .setColor("Red"),
      ],
    });
    return true;
  }
  const rawDescription = interaction.fields.getTextInputValue("serverDescription");
  const description = stripOuterCodeBlock(String(rawDescription || "").trim());
  const PARTNER_BLACKLIST_ROLE = IDs.roles.blackilistPartner;
  if (!managerId) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Alert:1448670089670037675> Errore interno: manager non trovato.",
          ),
      ],
    });
    return true;
  }
  let managerMember = null;
  managerMember = await getGuildMemberCached(interaction.guild, managerId);
  if (!managerMember) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Alert:1448670089670037675> Manager non trovato nel server.",
          ),
      ],
    });
    return true;
  }
  const isVerifiedMember = Boolean(managerMember.roles?.cache?.has(IDs.roles.Member) || managerMember.roles?.cache?.has(IDs.roles.Verificato),);
  if (!isVerifiedMember) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Alert:1448670089670037675> Questo utente non è verificato, fagli effettuare prima la verifica e poi riprova!",
          ),
      ],
    });
    return true;
  }
  if (
    managerMember &&
    managerMember.roles?.cache?.has(PARTNER_BLACKLIST_ROLE)
  ) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            "<a:VC_Alert:1448670089670037675> Non puoi fare partner con questo manager poiché blacklistato!",
          ),
      ],
    });
    return true;
  }
  const inviteCode = extractInviteCode(description);
  if (!inviteCode) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Alert:1448670089670037675> Devi inserire un link di invito Discord valido.",
          ),
      ],
    });
    return true;
  }
  let serverName = "Server Sconosciuto";
  let serverIcon = null;
  const inviteUrl = `https://discord.gg/${inviteCode}`;
  try {
    const res = await axios.get(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`,
      {
        timeout: 15000,
        headers: { Accept: "application/json" },
      },
    );
    const data = res?.data || {};
    if (!data.guild) throw new Error("Invite invalid");
    serverName = data.guild.name;
    serverIcon = data.guild.icon
      ? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png`
      : null;
  } catch {
    serverName = "Server Sconosciuto";
  }
  if (!isValidServerName(serverName)) {
    serverName = "Server Sconosciuto";
  }
  if (inviteCode.toLowerCase().includes("viniliecaffe")) {
    const embed = new EmbedBuilder()
    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setTitle(`**<:partneredserverowner:1443651871125409812> Partnership con ${serverName} da ${interaction.user.username}**`)
    .setDescription(`<a:VC_Alert:1448670089670037675> Non puoi fare partner con il tuo server`)
    .setFooter({ text: serverName, iconURL: serverIcon })
    .setColor("Red")
    .setTimestamp()
    .setThumbnail(interaction.guild.iconURL());
    await interaction.editReply({ embeds: [embed] });
    return true;
  }

  const filteredDescription = description.replace(/<@!?\d+>/g, "").replace(/<@&\d+>/g, "").replace(/<#\d+>/g, "").replace(/@everyone/g, "").replace(/@here/g, "").trim();
  const sanitizedDescription = stripLinksFromDescription(filteredDescription);
  if (!sanitizedDescription) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<a:VC_Alert:1448670089670037675> La descrizione è vuota.",
          ),
      ],
    });
    return true;
  }

  try {
    const guildId = interaction.guild.id;
    const partnershipChannel = interaction.guild.channels.cache.get(IDs.channels.partnerships,);
    if (!partnershipChannel?.isTextBased?.()) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<a:VC_Alert:1448670089670037675> Canale partnership non configurato correttamente.",
            ),
        ],
      });
      return true;
    }
    const staffDoc = await getOrCreateStaffPartnerDoc(guildId, interaction.user.id,);

    staffDoc.partnerCount++;
    staffDoc.managerId = managerId;
    const actionEntry = { action: "create", partner: serverName, invite: inviteUrl, managerId, partnershipChannelId: IDs.channels.partnerships, partnerMessageIds: [], };
    staffDoc.partnerActions.push(actionEntry);
    const actionIndex = Math.max(0, staffDoc.partnerActions.length - 1);

    await staffDoc.save();
    const totalPartners = staffDoc.partnerCount;

    const embed = new EmbedBuilder()
    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
    .setTitle(`**<:partneredserverowner:1443651871125409812> __PARTNER EFFETTUATA__**`,)
    .setDescription(`<a:ThankYou:1329504268369002507> Grazie per aver _effettuato_ una **partner** con \`${interaction.guild.name}\`
    <:mariolevelup:1443679595084910634> Ora sei a **\`${totalPartners}\`** partner!
    <:Money:1330544713463500970> Continua ad __effettuare__ partner per riscattare i **premi** in <#1442569232507473951>`,)
    .setFooter({ text: serverName, iconURL: serverIcon })
    .setColor("#6f4e37")
    .setTimestamp()
    .setThumbnail(interaction.guild.iconURL());

    const sentMessageIds = [];
    const contentWithManager = normalizeManagerLine(sanitizedDescription, managerId,);
    const parts = splitMessage(contentWithManager);
    for (const part of parts) {
      const sent = await partnershipChannel.send({ content: part }).catch(() => null);
      if (sent?.id) sentMessageIds.push(sent.id);
    }
    const thankYouMessage = await partnershipChannel.send({ embeds: [embed] }).catch(() => null);
    if (thankYouMessage?.id) sentMessageIds.push(thankYouMessage.id);
    if (sentMessageIds.length === 0) {
      if (Array.isArray(staffDoc.partnerActions) && staffDoc.partnerActions.length > actionIndex) {
        staffDoc.partnerActions.splice(actionIndex, 1);
      }
      staffDoc.partnerCount = Math.max(0, Number(staffDoc.partnerCount || 1) - 1);
      if (staffDoc.managerId === managerId) {
        const lastAction = Array.isArray(staffDoc.partnerActions) ? staffDoc.partnerActions[staffDoc.partnerActions.length - 1] : null;
        staffDoc.managerId = lastAction?.managerId || null;
      }
      await staffDoc.save().catch(() => { });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<a:VC_Alert:1448670089670037675> Non sono riuscito a pubblicare la partner nel canale configurato.",
            ),
        ],
      });
      return true;
    }

    if (staffDoc.partnerActions?.[actionIndex]) {
      staffDoc.partnerActions[actionIndex].partnershipChannelId =
        partnershipChannel.id;
      staffDoc.partnerActions[actionIndex].partnerMessageIds = sentMessageIds;
      await staffDoc.save().catch(() => { });
    }

    const doneEmbed = new EmbedBuilder()
    .setDescription(`<:success:1461731530333229226> Partner inviata in ${partnershipChannel}`,)
    .setColor("#6f4e37");

    await interaction.editReply({ embeds: [doneEmbed] });
  } catch (err) {
    global.logger.error(err);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor("#e74c3c")
          .setDescription(
            `<a:VC_Alert:1448670089670037675> C'è stato un errore nell'esecuzione del comando.`,
          ),
      ],
    });
  }
  return true;
}

function parsePartnershipModalId(customId) {
  const raw = String(customId || "");
  const newFormat = raw.match(/^partnershipModal_(cmd|ctx)_(\d{16,20})_(\d{16,20})$/,);
  if (newFormat) {
    return {
      source: newFormat[1],
      openerId: newFormat[2],
      managerId: newFormat[3],
    };
  }

  const legacy = raw.match(/^partnershipModal_(\d{16,20})_(\d{16,20})$/);
  if (legacy) {
    return { source: "legacy", openerId: legacy[1], managerId: legacy[2] };
  }

  const legacyShort = raw.match(/^partnershipModal_(\d{16,20})$/);
  if (legacyShort) {
    return { source: "legacy", openerId: null, managerId: legacyShort[1] };
  }
  return { source: null, openerId: null, managerId: null };
}
function splitMessage(message, maxLength = 2000) {
  if (!message) return [""];
  const parts = [];
  let current = "";
  for (const line of message.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) {
        parts.push(current);
        current = "";
      }
      if (line.length > maxLength) {
        for (let i = 0; i < line.length; i += maxLength) {
          parts.push(line.slice(i, i + maxLength));
        }
      } else {
        current = line;
      }
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function normalizeManagerLine(text, managerId) {
  const content = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().replace(/\n*Manager:\s*(<@!?\d+>)?\s*$/gi, "").replace(/\n*Partner effettuata con\s*\*\*<@!?\d+>\*\*\s*$/gi, "").trim();
  return `${content}\n\n<:VC_Mention:1443994358201323681> Manager: <@${managerId}>`;
}

function stripOuterCodeBlock(text) {
  if (!text) return "";
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```$/);
  if (match?.[1]) return match[1].trim();
  return trimmed.replace(/^```/, "").replace(/```$/, "").trim();
}

module.exports = { handlePartnerModal };