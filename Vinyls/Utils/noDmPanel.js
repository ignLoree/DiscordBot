const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getNoDmPreferences, setNoDmCategories, DM_CATEGORIES, DM_CATEGORY_ALL, DM_CATEGORY_LABELS } = require("./noDmList");

function _stripRef(p) {
  if (!p || typeof p !== "object") return p;
  const o = { ...p }; delete o.reply; delete o.messageReference; delete o.failIfNotExists;
  if (o.allowedMentions && typeof o.allowedMentions === "object") o.allowedMentions = { ...o.allowedMentions, repliedUser: false };
  return o;
}
async function _reply(message, payload) {
  if (!message || typeof message.reply !== "function") {
    return (message.channel && message.channel.send) ? message.channel.send(_stripRef(payload)).catch(() => null) : null;
  }
  try { return await message.reply(payload); } catch (e) {
    if (e && e.code === 10008) return null;
    if (e && e.code === 50035 && e.rawError && e.rawError.errors && e.rawError.errors.message_reference) {
      return message.channel.send(_stripRef(payload)).catch(() => null);
    }
    return null;
  }
}
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
      ? "<:VC_PinkQuestionMark:1471892611026391306> Scegli **quali DM** attivare. Clicca un pulsante per attivare/disattivare quella categoria."
      : "<:VC_PinkQuestionMark:1471892611026391306>Scegli **quali DM** disattivare. Clicca un pulsante per attivare/disattivare quella categoria.";
  const footerText =
    mode === "enable"
      ? "<:VC_Info:1460670816214585481> Usa +dm-disable per disattivare categorie."
      : "<:VC_Info:1460670816214585481> Usa +dm-enable per riattivare tutto.";
  const desc = [
    `<:VC_Ticket:1448694637106692156> ${intro}`,
    "",
    ...lines,
    "",
    isAll
      ? "<:attentionfromvega:1443651874032062505> **Tutti i DM sono attualmente disattivati.** Clicca una categoria per ricevere solo quella, o **Attiva tutto**."
      : "<a:VC_Alert:1448670089670037675> Usa **Disattiva tutto** per bloccare tutti i DM, o **Attiva tutto** per riceverli tutti.",
    "",
    "<a:VC_Exclamation:1448687427836444854> Ticket, moderazione e messaggi importanti restano sempre inviati.",
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Announce:1448687280381235443> Preferenze DM")
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
      .setEmoji("<:cancel:1461730653677551691>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}none_${uniqueKey}`)
      .setLabel("Attiva tutto")
      .setStyle(!isAll && prefs.disabled.size === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji("<:success:1461731530333229226>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}done_${uniqueKey}`)
      .setLabel("Fine")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("<:vegacheckmark:1443666279058772028>"),
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

  const promptMessage = await _reply(message, {
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
      if (!DM_CATEGORIES.includes(cat)) return interaction.deferUpdate().catch(() => { });
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
        .catch(() => { });
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
        .catch(() => { });
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
        .catch(() => { });
      return;
    }
    if (id.includes("_done_")) {
      collector.stop("done");
      await interaction
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("<:VC_Success:1468685897389052008> Preferenze DM salvate")
              .setDescription(
                "<:VC_Info:1460670816214585481> Le tue preferenze sono state aggiornate. Usa `+dm-disable` o `+dm-enable` per modificarle.",
              ),
          ],
          components: [],
        })
        .catch(() => { });
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
      await promptMessage.edit({ components: disabledRows }).catch(() => { });
    } catch (err) {
      global.logger?.warn?.("[noDmPanel] edit components:", err?.message || err);
    }
  });
}

module.exports = { runNoDmPanel, buildPanelEmbed, buildRows, DM_CATEGORY_LABELS };