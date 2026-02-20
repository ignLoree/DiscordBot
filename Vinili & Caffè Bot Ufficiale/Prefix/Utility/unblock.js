const { safeChannelSend } = require("../../Utils/Moderation/reply");
const { EmbedBuilder } = require("discord.js");
const { AvatarPrivacy, BannerPrivacy, QuotePrivacy, } = require("../../Schemas/Community/communitySchemas");

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      "Usa: `?unblock avatar` | `?unblock banner` | `?unblock quotes`",
    );
}

module.exports = {
  name: "unblock",
  aliases: ["unblockav", "unblockbn", "unblockquotes"],
  subcommands: ["avatar", "banner", "quotes"],
  subcommandAliases: {
    unblockav: "avatar",
    unblockbn: "banner",
    unblockquotes: "quotes",
  },

  async execute(message, args = []) {
    if (!message.guild) return;
    const userId = message.author.id;
    const sub = String(args[0] || "").toLowerCase();

    if (sub === "avatar" || sub === "av") {
      try {
        await AvatarPrivacy.findOneAndUpdate(
          { guildId: message.guild.id, userId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: message.guild.id, userId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch {}

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Comando sbloccato")
        .setDescription(
          "Hai sbloccato con successo la visualizzazione del tuo avatar.",
        );
      return safeChannelSend(message.channel, { embeds: [embed] });
    }

    if (sub === "banner" || sub === "bn") {
      try {
        await BannerPrivacy.findOneAndUpdate(
          { guildId: message.guild.id, userId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: message.guild.id, userId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch {}

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Comando sbloccato")
        .setDescription(
          "Hai sbloccato con successo la visualizzazione del tuo banner.",
        );
      return safeChannelSend(message.channel, { embeds: [embed] });
    }

    if (sub === "quotes" || sub === "quote" || sub === "q") {
      try {
        await QuotePrivacy.findOneAndUpdate(
          { guildId: message.guild.id, userId },
          {
            $set: { blocked: false },
            $setOnInsert: { guildId: message.guild.id, userId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch {}

      const now = new Date();
      const date = now.toLocaleDateString("it-IT");
      const time = now.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("<a:VC_Unlock:1470011538432852108> Quote sbloccate")
        .setDescription(
          [
            "Le quote dei tuoi messaggi sono state sbloccate con successo!",
            "",
            "**Cosa significa?**",
            "Gli altri utenti possono ora creare quote dei tuoi messaggi.",
            "",
            "**Per bloccare nuovamente**",
            "Usa il comando `?block quotes` quando vuoi bloccare di nuovo le quote.",
          ].join("\n"),
        )
        .setFooter({
          text: `Sbloccate il ${date} - Oggi alle ${time}`,
          iconURL: message.author.displayAvatarURL(),
        });

      return safeChannelSend(message.channel, { embeds: [embed] });
    }

    return safeChannelSend(message.channel, { embeds: [buildUsageEmbed()] });
  },
};
