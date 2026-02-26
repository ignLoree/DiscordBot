const { safeChannelSend } = require("../../Utils/Moderation/reply");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { AvatarPrivacy, BannerPrivacy, QuotePrivacy, } = require("../../Schemas/Community/communitySchemas");

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription("Usa: `?block avatar` | `?block banner` | `?block quotes`");
}

module.exports = {
  name: "block",
  aliases: ["blockav", "blockbn", "blockquotes"],
  allowEmptyArgs: true,
  subcommands: ["avatar", "banner", "quotes"],

  async execute(message, args = []) {
    if (!message.guild) return;
    const userId = message.author.id;
    const sub = String(args[0] || "").toLowerCase();

    if (sub === "avatar" || sub === "av") {
      try {
        await AvatarPrivacy.findOneAndUpdate(
          { guildId: message.guild.id, userId },
          {
            $set: { blocked: true },
            $setOnInsert: { guildId: message.guild.id, userId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch {}

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Avatar bloccato")
        .setThumbnail(
          "https://images-ext-1.discordapp.net/external/GrhQsfA7zwxEiX5aOQo9kfQ-EF9Z9VLS-JD0w5iJEZU/https/i.imgur.com/Qqn7J3d.png?format=webp&quality=lossless&width=640&height=640",
        )
        .setDescription(
          [
            "Gli altri membri non potranno più visualizzare il tuo avatar.",
            "",
            "Utilizza il pulsante qui sotto o il comando `?unblock avatar` se vuoi riattivare la visualizzazione.",
          ].join("\n"),
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`avatar_unblock:${userId}`)
          .setLabel("Sblocca")
          .setEmoji("<a:VC_Unlock:1470011538432852108>")
          .setStyle(ButtonStyle.Secondary),
      );

      return safeChannelSend(message.channel, {
        embeds: [embed],
        components: [row],
      });
    }

    if (sub === "banner" || sub === "bn") {
      try {
        await BannerPrivacy.findOneAndUpdate(
          { guildId: message.guild.id, userId },
          {
            $set: { blocked: true },
            $setOnInsert: { guildId: message.guild.id, userId },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch {}

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Banner bloccato")
        .setThumbnail(
          "https://images-ext-1.discordapp.net/external/GrhQsfA7zwxEiX5aOQo9kfQ-EF9Z9VLS-JD0w5iJEZU/https/i.imgur.com/Qqn7J3d.png?format=webp&quality=lossless&width=640&height=640",
        )
        .setDescription(
          [
            "Gli altri membri non potranno più visualizzare il tuo banner.",
            "",
            "Utilizza il pulsante qui sotto o il comando `?unblock banner` se vuoi riattivare la visualizzazione.",
          ].join("\n"),
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`banner_unblock:${userId}`)
          .setLabel("Sblocca")
          .setEmoji("<a:VC_Unlock:1470011538432852108>")
          .setStyle(ButtonStyle.Secondary),
      );

      return safeChannelSend(message.channel, {
        embeds: [embed],
        components: [row],
      });
    }

    if (sub === "quotes" || sub === "quote" || sub === "q") {
      try {
        await QuotePrivacy.findOneAndUpdate(
          { guildId: message.guild.id, userId },
          {
            $set: { blocked: true },
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
        .setTitle("<a:VC_Unlock:1470011538432852108> Quote bloccate")
        .setDescription(
          [
            "Le quote dei tuoi messaggi sono state bloccate con successo!",
            "",
            "**Cosa significa?**",
            "Gli altri utenti non potranno più creare quote dei tuoi messaggi.",
            "",
            "**Per sbloccare**",
            "Usa il comando `?unblock quotes` quando vuoi riattivare le quote.",
          ].join("\n"),
        )
        .setFooter({
          text: `Bloccate il ${date} - Oggi alle ${time}`,
          iconURL: message.author.displayAvatarURL(),
        });

      return safeChannelSend(message.channel, { embeds: [embed] });
    }

    return safeChannelSend(message.channel, { embeds: [buildUsageEmbed()] });
  },
};