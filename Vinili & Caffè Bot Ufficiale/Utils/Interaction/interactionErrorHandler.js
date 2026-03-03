const IDs = require("../Config/ids");
const { buildErrorLogEmbed } = require("../Logging/errorLogEmbed");
const { getCentralChannel } = require("../Logging/commandUsageLogger");
const{isAckError,isTransientDiscordError,sendPrivateInteractionResponse,}=require("./interactionRuntimeGuards");

const PRIVATE_FLAG = 1 << 6;

async function logInteractionError(interaction, client, err) {
  try {
    const resolvedClient = client || interaction?.client || null;
    const errorChannelId=IDs.channels.errorLogChannel||IDs.channels.serverBotLogs;
    const errorChannel=errorChannelId&&resolvedClient?await getCentralChannel(resolvedClient,errorChannelId):null;

    if (errorChannel?.isTextBased?.()) {
      const contextValue=interaction?.commandName||interaction?.customId||"unknown";
      const staffEmbed=buildErrorLogEmbed({contextLabel:"Contesto",contextValue,userTag:interaction?.user?.tag||"unknown",error:err,serverName:interaction?.guild?`${interaction.guild.name}[${interaction.guild.id}]`
          : null,
      });
      await errorChannel.send({ embeds: [staffEmbed] }).catch(() => null);
    }

    await sendPrivateInteractionResponse(interaction, {
      content:
        "<:vegax:1443934876440068179>  C'è stato un errore nell'esecuzione del comando.",
      flags: PRIVATE_FLAG,
    });
  } catch (nestedErr) {
    if (isAckError(nestedErr)) return;
    if (isTransientDiscordError(nestedErr)) {
      global.logger?.warn?.(
        "[interactionCreate] Impossibile inviare risposta errore all'utente (Discord API non disponibile, es. 503).",
      );
      return;
    }
    global.logger?.error?.(
      "[interactionCreate] nested error handling failed",
      nestedErr,
    );
  }
}

module.exports = { logInteractionError };