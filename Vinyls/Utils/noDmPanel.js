const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { safeMessageReply } = require("../../shared/discord/replyRuntime");
const {
  getNoDmPreferences,
  setNoDmCategories,
  DM_CATEGORIES,
  DM_CATEGORY_ALL,
  DM_CATEGORY_LABELS,
} = require("./noDmList");

const PREFIX = "nodm_panel_";
const EMOJI_OFF = "<:VC_OfflineStatus:1472011150081130751>";
const EMOJI_ON = "<:VC_OnlineStatus:1472011187569950751>";

function buildPanelEmbed(prefs, mode = "disable") {
  const isAll = prefs.blockAll || prefs.disabled.has(DM_CATEGORY_ALL);
  const lines = DM_CATEGORIES.map((key) => {
    const off = isAll || prefs.disabled.has(key);
    return `• **${DM_CATEGORY_LABELS[key]}**: ${off ? `${EMOJI_OFF} Disattivato` : `${EMOJI_ON} Attivo`}`;
  });
  const intro =
    mode === "enable"
      ? "Scegli **quali DM** attivare. Clicca un pulsante per attivare/disattivare quella categoria."
      : "Scegli **quali DM** disattivare. Clicca un pulsante per attivare/disattivare quella categoria.";
  const footerText =
    mode === "enable"
      ? "Usa +dm-disable per disattivare categorie."
      : "Usa +dm-enable per riattivare tutto.";
  const desc = [
    `<:VC_Ticket:1448694637106692156> ${intro}`,
    "",
    ...lines,
    "",
    isAll
      ? "⚠️ **Tutti i DM sono attualmente disattivati.** Clicca una categoria per ricevere solo quella, o **Attiva tutto**."
      : "Usa **Disattiva tutto** per bloccare tutti i DM, o **Attiva tutto** per riceverli tutti.",
    "",
    "Ticket, moderazione e messaggi importanti restano sempre inviati.",
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Preferenze DM")
    .setDescription(desc)
    .setFooter({ text: footerText });
}

function buildRows(prefs, uniqueKey) {
  const isAll = prefs.blockAll || prefs.disabled.has(DM_CATEGORY_ALL);
  const row1 = new ActionRowBuilder();
  for (const key of DM_CATEGORIES) {
    const off = isAll || prefs.disabled.has(key);
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}toggle_${key}_${uniqueKey}`)
        .setLabel(String(DM_CATEGORY_LABELS[key]).slice(0, 80))
        .setStyle(off ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji(off ? "1472011150081130751" : "1472011187569950751"),
    );
  }
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}all_${uniqueKey}`)
      .setLabel("Disattiva tutto")
      .setStyle(isAll ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setEmoji("🚫"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}none_${uniqueKey}`)
      .setLabel("Attiva tutto")
      .setStyle(!isAll && prefs.disabled.size === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}done_${uniqueKey}`)
      .setLabel("Fine")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("✔️"),
  );
  return [row1, row2];
}

/**
 * Mostra il pannello interattivo preferenze DM e gestisce i click.
 * @param {import("discord.js").Message} message - Messaggio del comando
 * @param {{ mode?: 'enable' | 'disable' }} options - mode: 'enable' per +dm-enable (testo footer diverso)
 */
async function runNoDmPanel(message, options = {}) {
  const mode = options.mode === "enable" ? "enable" : "disable";
  const guildId = message.guild.id;
  const userId = message.author.id;
  const prefs = await getNoDmPreferences(guildId, userId);
  const uniqueKey = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

  const embed = buildPanelEmbed(prefs, mode);
  const components = buildRows(prefs, uniqueKey);

  const promptMessage = await safeMessageReply(message, {
    embeds: [embed],
    components,
    allowedMentions: { repliedUser: false },
  });
  if (!promptMessage) return;

  const collector = promptMessage.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) =>
      i.customId.startsWith(PREFIX) &&
      i.customId.endsWith(uniqueKey) &&
      i.user.id === userId,
  });

  collector.on("collect", async (interaction) => {
    const id = interaction.customId;
    if (id.includes("_toggle_")) {
      const afterToggle = id.slice((PREFIX + "toggle_").length);
      const cat = afterToggle.slice(0, afterToggle.indexOf("_"));
      if (!DM_CATEGORIES.includes(cat)) return interaction.deferUpdate().catch(() => {});
      const prefs2 = await getNoDmPreferences(guildId, userId);
      const isAll = prefs2.blockAll || prefs2.disabled.has(DM_CATEGORY_ALL);
      let next;
      if (isAll) {
        next = DM_CATEGORIES.filter((k) => k !== cat);
      } else {
        const disabled = new Set(prefs2.disabled);
        if (disabled.has(cat)) disabled.delete(cat);
        else disabled.add(cat);
        next = [...disabled];
      }
      if (next.length === 0) {
        await setNoDmCategories(guildId, userId, []);
      } else {
        await setNoDmCategories(guildId, userId, next);
      }
      const prefs3 = await getNoDmPreferences(guildId, userId);
      await interaction
        .update({
          embeds: [buildPanelEmbed(prefs3, mode)],
          components: buildRows(prefs3, uniqueKey),
        })
        .catch(() => {});
      return;
    }
    if (id.includes("_all_")) {
      await setNoDmCategories(guildId, userId, [DM_CATEGORY_ALL]);
      const prefs2 = await getNoDmPreferences(guildId, userId);
      await interaction
        .update({
          embeds: [buildPanelEmbed(prefs2, mode)],
          components: buildRows(prefs2, uniqueKey),
        })
        .catch(() => {});
      return;
    }
    if (id.includes("_none_")) {
      await setNoDmCategories(guildId, userId, []);
      const prefs2 = await getNoDmPreferences(guildId, userId);
      await interaction
        .update({
          embeds: [buildPanelEmbed(prefs2, mode)],
          components: buildRows(prefs2, uniqueKey),
        })
        .catch(() => {});
      return;
    }
    if (id.includes("_done_")) {
      collector.stop("done");
      await interaction
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Preferenze DM salvate")
              .setDescription(
                "Le tue preferenze sono state aggiornate. Usa `+dm-disable` o `+dm-enable` per modificarle.",
              ),
          ],
          components: [],
        })
        .catch(() => {});
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "done") return;
    try {
      const rows = buildRows(await getNoDmPreferences(guildId, userId), uniqueKey);
      const disabledRows = rows.map((row) =>
        new ActionRowBuilder().addComponents(
          ...row.components.map((c) => ButtonBuilder.from(c).setDisabled(true)),
        ),
      );
      await promptMessage.edit({ components: disabledRows }).catch(() => {});
    } catch (err) {
      global.logger?.warn?.("[noDmPanel] edit components:", err?.message || err);
    }
  });
}

module.exports = { runNoDmPanel, buildPanelEmbed, buildRows, DM_CATEGORY_LABELS };
