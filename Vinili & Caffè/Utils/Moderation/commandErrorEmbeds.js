const { EmbedBuilder } = require('discord.js');
const IDs = require('../Config/ids');

function buildBaseErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle(title)
    .setDescription(description);
}

function buildCooldownErrorEmbed(remainingSeconds) {
  const remaining = Math.max(1, Number(remainingSeconds || 1));
  return buildBaseErrorEmbed(
    '<:attentionfromvega:1443651874032062505> Cooldown attivo',
    [
      `Aspetta **${remaining}s** prima di usare un altro comando.`,
      '',
      'Il cooldown si riduce con i ruoli:',
      `- <@&${IDs.roles.Level30}> -> **15s**`,
      `- <@&${IDs.roles.Level50}> -> **5s**`
    ].join('\n')
  );
}

function buildBusyCommandErrorEmbed() {
  return buildBaseErrorEmbed(
    '<:attentionfromvega:1443651874032062505> Comando in esecuzione',
    'Hai già un comando in esecuzione, attendi un attimo.'
  );
}

function buildMissingArgumentsErrorEmbed() {
  return buildBaseErrorEmbed(
    '<:vegax:1443934876440068179> Argomenti mancanti',
    'Non hai aggiunto nessun argomento.'
  );
}

function buildCommandTimeoutErrorEmbed() {
  return buildBaseErrorEmbed(
    '<:attentionfromvega:1443651874032062505> Comando scaduto',
    'Il comando è scaduto dopo 60 secondi. Riprova.'
  );
}

function buildInternalCommandErrorEmbed(rawError) {
  const raw = String(rawError || 'Errore sconosciuto');
  const compact = raw.length > 900 ? `${raw.slice(0, 900)}...` : raw;
  return buildBaseErrorEmbed(
    '<:vegax:1443934876440068179> Errore comando',
    `C'è stato un errore nell'esecuzione del comando.\n\`\`\`${compact}\`\`\``
  );
}

module.exports = {
  buildCooldownErrorEmbed,
  buildBusyCommandErrorEmbed,
  buildMissingArgumentsErrorEmbed,
  buildCommandTimeoutErrorEmbed,
  buildInternalCommandErrorEmbed
};
