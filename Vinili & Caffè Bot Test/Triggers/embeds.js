const fs = require("fs");
const path = require("path");
const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const {
  PersonalityPanel: Panel,
} = require("../Schemas/Community/communitySchemas");
const {
  upsertPanelMessage,
  shouldEditMessage,
} = require("../Utils/Embeds/panelUpsert");

const TAG_IMAGE_NAME = "guildtag.gif";
const TAG_IMAGE_PATH = path.join(__dirname, "..", "Photos", TAG_IMAGE_NAME);
const TICKET_IMAGE_NAME = "ticket.gif";
const TICKET_IMAGE_PATH = path.join(
  __dirname,
  "..",
  "Photos",
  TICKET_IMAGE_NAME,
);
const PANEL_COLOR = "#6f4e37";

const GUILD_TAG_CONFIG = {
  "1471511676019933354": {
    channelId: "1471522979706835018",
    tagName: "Luna",
    emoji: "🌙",
    boosterRoleId: "1471512868494118975",
  },
  "1471511928739201047": {
    channelId: "1471522798315901019",
    tagName: "Cash",
    emoji: "💸",
    boosterRoleId: "1471512411306459348",
  },
  "1471512183547498579": {
    channelId: "1471522526931714170",
    tagName: "Porn",
    emoji: "🔞",
    boosterRoleId: "1471513685976420443",
  },
  "1471512555762483330": {
    channelId: "1471522161192730695",
    tagName: "69",
    emoji: "😈",
    boosterRoleId: "1471514106598260892",
  },
  "1471512797140484230": {
    channelId: "1471521963125112942",
    tagName: "Weed",
    emoji: "🍃",
    boosterRoleId: "1471514709420413111",
  },
  "1471512808448458958": {
    channelId: "1471521322785050676",
    tagName: "Figa",
    emoji: "🍑",
    boosterRoleId: "1471515516291121213",
  },
};

const TICKET_CONFIG = {
  "1471511676019933354": {
    ticketChannelId: "1471974302109667410",
    guildedRoleId: "1471627231637012572",
    tagName: "Luna",
    emoji: "🌙",
  },
  "1471511928739201047": {
    ticketChannelId: "1471974355964657765",
    guildedRoleId: "1471628245404483762",
    tagName: "Cash",
    emoji: "💸",
  },
  "1471512183547498579": {
    ticketChannelId: "1471974536357347570",
    guildedRoleId: "1471628136172097638",
    tagName: "Porn",
    emoji: "🔞",
  },
  "1471512555762483330": {
    ticketChannelId: "1471974622777049098",
    guildedRoleId: "1471628002050838790",
    tagName: "69",
    emoji: "😈",
  },
  "1471512797140484230": {
    ticketChannelId: "1471974712958648412",
    guildedRoleId: "1471627880575275008",
    tagName: "Weed",
    emoji: "🍃",
  },
  "1471512808448458958": {
    ticketChannelId: "1471974799453720740",
    guildedRoleId: "1471627711901470781",
    tagName: "Figa",
    emoji: "🍑",
  },
};

function dividerLine() {
  return "<a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531><a:xdivisore:1471892113426874531>";
}

function buildTagEmbed(config, boosterRoleMention) {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setDescription(
      [
        `## <:LC_wNew:1471891729471770819> ── .✦ <a:VC_RightWing:1448672889845973214> ₊⋆˚｡ ${config.tagName}'s Guild-TAG`,
        dividerLine(),
        "",
        "",
        "**<a:VC_Arrow:1448672967721615452> Come mantenere la Guild-TAG <:PinkQuestionMark:1471892611026391306>**",
        "────────୨ৎ────────",
        "<a:VC_Exclamation:1448687427836444854> Ti basta essere parte di https://discord.gg/viniliecaffe oppure",
        `boostare questo server (<a:flyingnitroboost:1472995328956567754> ${boosterRoleMention})`,
        "",
        "",
        "**<a:VC_Arrow:1448672967721615452> How to keep the Guild-TAG <:PinkQuestionMark:1471892611026391306>**",
        "────────୨ৎ────────",
        "<a:VC_Exclamation:1448687427836444854> You just need to be in https://discord.gg/viniliecaffe or boost",
        `this server (<a:flyingnitroboost:1472995328956567754> ${boosterRoleMention})`,
        "",
        "",
        "<:VC_PepeComfy:1331591439599272004> Keep up! Nuovi aggiornamenti in arrivo...",
      ].join("\n"),
    )
    .setFooter({
      text: `.gg/viniliecaffe • ${new Date().toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    });
}

function buildTicketEmbed(config, guildedRoleMention) {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`༄${config.emoji}︲${config.tagName}'s Ticket`)
    .setDescription(
      `Clicca sul menù per aprire un ticket e claimare il tuo ruolo ${guildedRoleMention} su questo server e su quello principale.`,
    );
}

function buildTicketMenuRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_open_menu")
    .setPlaceholder("🎫 Seleziona una categoria...")
    .addOptions({
      label: "Prima categoria",
      description: "Riscatto Ruolo",
      value: "ticket_supporto",
      emoji: { id: "1443651872258003005", name: "discordstaff" },
    });

  return new ActionRowBuilder().addComponents(menu);
}

async function fetchGuild(client, guildId) {
  return (
    client.guilds.cache.get(guildId) ||
    client.guilds.fetch(guildId).catch(() => null)
  );
}

async function ensureGuildChannelsFetched(guild) {
  if (!guild?.channels?.fetch) return;
  await guild.channels.fetch().catch(() => {});
}

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    channel = await guild.channels.fetch(channelId).catch(() => null);
  }
  return channel?.isTextBased?.() ? channel : null;
}

async function resolveRoleMention(guild, roleId, fallback = "`Role`") {
  if (!guild || !roleId) return fallback;
  const role =
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null));
  return role ? `<@&${role.id}>` : fallback;
}

async function findFallbackTicketChannel(guild) {
  const channel = guild.channels.cache.find((ch) => {
    if (!ch?.isTextBased?.()) return false;
    const name = String(ch.name || "").toLowerCase();
    return (
      name.includes("ticket") ||
      name.includes("assistenza") ||
      name.includes("support")
    );
  });
  return channel || null;
}

async function getOrCreatePanelDoc(guildId, channelId) {
  return Panel.findOneAndUpdate(
    { guildId, channelId },
    { $setOnInsert: { guildId, channelId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function maybeBuildAttachment(filePath, fileName, logLabel) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return new AttachmentBuilder(filePath, { name: fileName });
  } catch {
    global.logger.warn(`[${logLabel}] Image not found, sending without image`);
    return null;
  }
}

async function runSponsorGuildTagPanels(client) {
  for (const [guildId, config] of Object.entries(GUILD_TAG_CONFIG)) {
    try {
      const guild = await fetchGuild(client, guildId);
      if (!guild) {
        global.logger.warn("[GUILD TAG] Guild not found:", guildId);
        continue;
      }

      const channel = await fetchTextChannel(guild, config.channelId);
      if (!channel) {
        global.logger.warn(
          "[GUILD TAG] Channel not found in guild:",
          guildId,
          config.channelId,
        );
        continue;
      }

      let boosterRoleMention = "`Server Booster`";
      if (config.boosterRoleId) {
        const role = await guild.roles
          .fetch(config.boosterRoleId)
          .catch(() => null);
        if (role) boosterRoleMention = `<@&${role.id}>`;
      }

      const embed = buildTagEmbed(config, boosterRoleMention);
      const attachment = maybeBuildAttachment(
        TAG_IMAGE_PATH,
        TAG_IMAGE_NAME,
        "GUILD TAG",
      );
      if (attachment) {
        embed.setImage(`attachment://${TAG_IMAGE_NAME}`);
      }

      const panelDoc = await getOrCreatePanelDoc(
        guildId,
        config.channelId,
      ).catch((err) => {
        global.logger.error(
          "[GUILD TAG] Failed to create/fetch panel doc:",
          err,
        );
        return null;
      });
      if (!panelDoc) continue;

      const messagePayload = {
        messageId: panelDoc.infoMessageId1 || null,
        embeds: [embed],
        components: [],
        ...(attachment ? { files: [attachment] } : {}),
      };

      const sentMessage = await upsertPanelMessage(
        channel,
        client,
        messagePayload,
      );
      if (sentMessage?.id) {
        await Panel.updateOne(
          { guildId, channelId: config.channelId },
          { $set: { infoMessageId1: sentMessage.id } },
        ).catch((err) => {
          global.logger.error("[GUILD TAG] Failed to update panel doc:", err);
        });
      }
    } catch (err) {
      global.logger.error("[GUILD TAG] Error processing guild:", guildId, err);
    }
  }
}

async function runSponsorPanel(client) {
  try {
    await runSponsorGuildTagPanels(client);
    return 1;
  } catch (err) {
    global.logger.error(
      "[Bot Test] runSponsorPanel (Guild-TAG):",
      err?.message || err,
    );
    return 0;
  }
}

async function runSponsorVerifyPanels(client) {
  let sponsorGuildIds = Array.isArray(client.config?.sponsorGuildIds)
    ? [...client.config.sponsorGuildIds]
    : [];
  const verifyChannelIds = client.config?.sponsorVerifyChannelIds || {};

  if (sponsorGuildIds.length === 0) {
    sponsorGuildIds = Object.keys(verifyChannelIds);
  }

  if (sponsorGuildIds.length === 0) {
    global.logger.warn(
      "[Bot Test] runSponsorVerifyPanels: nessuna guild in config (sponsorGuildIds o sponsorVerifyChannelIds). Controlla config.json.",
    );
    return 0;
  }

  let sent = 0;
  for (const guildId of sponsorGuildIds) {
    try {
      const guild = await fetchGuild(client, guildId);
      if (!guild) {
        global.logger.warn(
          "[Bot Test] Verify panel: guild non trovata (bot non nel server?): " +
            guildId,
        );
        continue;
      }

      await ensureGuildChannelsFetched(guild);

      let channel = await fetchTextChannel(guild, verifyChannelIds[guildId]);
      if (!channel) {
        channel =
          guild.channels.cache.find((ch) =>
            ch.name?.toLowerCase().includes("start"),
          ) || null;
      }

      if (!channel?.isTextBased?.()) {
        global.logger.warn(
          "[Bot Test] Verify panel: canale non trovato o non testuale in guild " +
            guild.name +
            " (" +
            guildId +
            "). sponsorVerifyChannelIds corretti in config.json?",
        );
        continue;
      }

      const verifyEmbed = new EmbedBuilder()
        .setColor(client.config?.embedVerify || PANEL_COLOR)
        .setTitle(
          "<:verification:1472989484059459758> **`Verification Required!`**",
        )
        .setDescription(
          "<:space:1472990350795866265> <:alarm:1472990352968253511> **Per accedere a `" +
            (guild.name || "this server") +
            "` devi prima verificarti.**\n" +
            "<:space:1472990350795866265><:space:1472990350795866265> <:rightSort:1472990348086087791> Clicca il pulsante **Verify** qui sotto per iniziare.",
        );

      const verifyRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_start")
          .setLabel("Verify")
          .setStyle(ButtonStyle.Success),
      );

      const panelDoc = await getOrCreatePanelDoc(guildId, channel.id).catch(
        (err) => {
          global.logger.error(
            "[Bot Test] Verify panel: errore MongoDB per guild " +
              guildId +
              ":",
            err?.message || err,
          );
          return null;
        },
      );
      if (!panelDoc) continue;

      const panelMessage = await upsertPanelMessage(channel, client, {
        messageId: panelDoc.verifyPanelMessageId || null,
        embeds: [verifyEmbed],
        components: [verifyRow],
      });

      if (!panelMessage?.id) {
        global.logger.warn(
          "[Bot Test] Verify panel: upsertPanelMessage non ha restituito messaggio in " +
            guild.name,
        );
        continue;
      }

      await Panel.updateOne(
        { guildId, channelId: channel.id },
        { $set: { verifyPanelMessageId: panelMessage.id } },
      ).catch(() => {});
      sent++;
    } catch (err) {
      global.logger.error(
        "[Bot Test] runSponsorVerifyPanels guild " + guildId + ":",
        err?.message || err,
      );
    }
  }

  return sent;
}

async function runSponsorTicketPanels(client) {
  for (const [guildId, config] of Object.entries(TICKET_CONFIG)) {
    try {
      const guild = await fetchGuild(client, guildId);
      if (!guild) continue;

      await ensureGuildChannelsFetched(guild);
      const guildedRoleMention = await resolveRoleMention(
        guild,
        config.guildedRoleId,
        "`Guilded`",
      );

      let channel = await fetchTextChannel(guild, config.ticketChannelId);
      if (!channel) {
        channel = await findFallbackTicketChannel(guild);
      }
      if (!channel?.isTextBased?.()) continue;

      const attachment = maybeBuildAttachment(
        TICKET_IMAGE_PATH,
        TICKET_IMAGE_NAME,
        "SPONSOR TICKET",
      );
      const embed = buildTicketEmbed(config, guildedRoleMention);
      const ticketRow = buildTicketMenuRow();

      let panelDoc = await getOrCreatePanelDoc(guildId, channel.id).catch(
        () => null,
      );
      if (!panelDoc) panelDoc = null;

      const payload = {
        embeds: [embed],
        components: [ticketRow],
        ...(attachment
          ? { files: [attachment], attachmentName: TICKET_IMAGE_NAME }
          : {}),
      };

      let message = null;
      if (panelDoc?.sponsorTicketPanelMessageId) {
        message = await channel.messages
          .fetch(panelDoc.sponsorTicketPanelMessageId)
          .catch(() => null);
      }

      if (message) {
        const needsEdit = await shouldEditMessage(message, payload);
        if (needsEdit) {
          await message
            .edit({
              embeds: [embed],
              components: [ticketRow],
              ...(attachment ? { files: [attachment] } : {}),
            })
            .catch(() => {});
        }
      } else {
        message = await channel
          .send({
            embeds: [embed],
            components: [ticketRow],
            ...(attachment ? { files: [attachment] } : {}),
          })
          .catch(() => null);
      }

      if (message?.id) {
        await Panel.updateOne(
          { guildId, channelId: channel.id },
          { $set: { sponsorTicketPanelMessageId: message.id } },
        ).catch(() => {});
      }
    } catch (err) {
      global.logger?.error?.(
        "[SPONSOR TICKET] Error processing guild:",
        guildId,
        err,
      );
    }
  }
}

module.exports = {
  runSponsorPanel,
  runSponsorGuildTagPanels,
  runSponsorVerifyPanels,
  runSponsorTicketPanels,
};
