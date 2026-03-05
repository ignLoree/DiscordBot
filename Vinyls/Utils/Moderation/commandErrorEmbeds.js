const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");

function buildBaseErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle(title)
    .setDescription(description);
}

function buildCooldownErrorEmbed(remainingSeconds) {
  const remaining = Math.max(1, Number(remainingSeconds || 1));
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Cooldown attivo",
    [
      `<:attentionfromvega:1443651874032062505> Aspetta **${remaining}s** prima di usare un altro comando.`,
      "",
      "<a:VC_Timer:1462779065625739344> Il cooldown si riduce con i ruoli:",
      `<:VC_Dot:1443932948599668746> <@&${IDs.roles.Level30}> <a:VC_Arrow:1448672967721615452> **15s**`,
      `<:VC_Dot:1443932948599668746> <@&${IDs.roles.Level50}> <a:VC_Arrow:1448672967721615452> **5s**`,
    ].join("\n"),
  );
}

function buildBusyCommandErrorEmbed() {
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Comando in esecuzione",
    "<:attentionfromvega:1443651874032062505> Hai già un comando in esecuzione, attendi un attimo.",
  );
}

function buildMissingArgumentsErrorEmbed() {
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Argomenti mancanti",
    "<:attentionfromvega:1443651874032062505> Non hai aggiunto nessun argomento.",
  );
}

function buildCommandTimeoutErrorEmbed() {
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Comando scaduto",
    "<:attentionfromvega:1443651874032062505> Il comando è scaduto dopo 60 secondi. Riprova.",
  );
}

function buildInternalCommandErrorEmbed(rawError) {
  const raw = String(rawError || "Errore sconosciuto");
  const compact = raw.length > 900 ? `${raw.slice(0, 900)}...` : raw;
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Errore comando",
    `<:attentionfromvega:1443651874032062505> C'è stato un errore nell'esecuzione del comando.\n\`\`\`${compact}\`\`\``,
  );
}

module.exports = { buildCooldownErrorEmbed, buildBusyCommandErrorEmbed, buildMissingArgumentsErrorEmbed, buildCommandTimeoutErrorEmbed, buildInternalCommandErrorEmbed };