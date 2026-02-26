const { safeChannelSend } = require("../../Utils/Moderation/reply");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { BannerPrivacy } = require("../../Schemas/Community/communitySchemas");

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}

async function resolveMember(message, query) {
  const mention = message.mentions?.members?.first();
  if (mention) return mention;
  const id = String(query || "").replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    const cached = message.guild.members.cache.get(id);
    if (cached) return cached;
    try {
      return await message.guild.members.fetch(id);
    } catch {
      return null;
    }
  }
  if (!query) return null;
  const target = normalize(query);
  return (
    message.guild.members.cache.find((member) => {
      const username = normalize(member.user?.username);
      const displayName = normalize(member.displayName);
      const tag = normalize(member.user?.tag);
      return username === target || displayName === target || tag === target;
    }) || null
  );
}

module.exports = {
  skipPrefix: false,
  name: "banner",
  aliases: ["bn"],
  allowEmptyArgs: true,
  subcommands: ["user", "server", "guild"],

  async execute(message, args) {
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.",
            ),
        ],
      });
    }

    const subRaw = args[0] ? String(args[0]).toLowerCase() : "";
    const sub = ["user", "server", "guild"].includes(subRaw) ? subRaw : null;
    const query = sub ? args.slice(1).join(" ") : args.join(" ");

    if (sub === "server" || sub === "guild") {
      const bannerUrl = message.guild.bannerURL({ size: 4096 });
      if (!bannerUrl) {
        return safeChannelSend(message.channel, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Questo server non ha un banner impostato.",
              ),
          ],
        });
      }
      const embed = new EmbedBuilder()
        .setTitle("Banner del server")
        .setImage(bannerUrl)
        .setAuthor({
          name: message.guild.name,
          iconURL: message.guild.iconURL(),
        })
        .setColor("#6f4e37");
      return safeChannelSend(message.channel, { embeds: [embed] });
    }

    const member = (await resolveMember(message, query)) || message.member;
    const user = member?.user || message.author;

    let privacyDoc = null;
    try {
      privacyDoc = await BannerPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        { $setOnInsert: { guildId: message.guild.id, userId: user.id } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch {}

    if (Boolean(privacyDoc?.blocked)) {
      const blockedEmbed = new EmbedBuilder()
        .setColor("#e74c3c")
        .setTitle("<:vegax:1443934876440068179> Banner Bloccato")
        .setThumbnail(
          "https://images-ext-1.discordapp.net/external/qZp8C7dthauZs3SMmWIVqoxSjwXkKvmCXhZpro2lLzI/%3Fformat%3Dwebp%26quality%3Dlossless%26width%3D640%26height%3D640/https/images-ext-1.discordapp.net/external/fRgXgmNV39-c_gorTdDdWPSyx2fFy_i4t01cYEF-DKY/https/i.imgur.com/7OnTq5S.png?format=webp&quality=lossless&width=640&height=640",
        )
        .setDescription(
          "Questo utente ha bloccato la visualizzazione del proprio banner.",
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`banner_unblock:${user.id}`)
          .setLabel("Sblocca")
          .setEmoji("<a:VC_Unlock:1470011538432852108>")
          .setStyle(ButtonStyle.Secondary),
      );

      return safeChannelSend(message.channel, {
        embeds: [blockedEmbed],
        components: [row],
      });
    }

    let fetchedUser = user;
    try {
      fetchedUser = await user.fetch();
    } catch {}

    const bannerUrl = fetchedUser.bannerURL({ size: 4096 });
    if (!bannerUrl) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Questo utente non ha un banner.",
            ),
        ],
      });
    }

    let privacyCount = null;
    try {
      privacyCount = await BannerPrivacy.findOneAndUpdate(
        { guildId: message.guild.id, userId: user.id },
        { $inc: { views: 1 } },
        { new: true },
      );
    } catch {}

    const totalViews = Number(privacyCount?.views || 0);
    const authorLabel =
      member?.displayName || member?.user?.username || user.tag;

    const embed = new EmbedBuilder()
      .setTitle("User Banner")
      .setImage(bannerUrl)
      .setAuthor({ name: authorLabel, iconURL: user.displayAvatarURL() })
      .setColor("#6f4e37")
      .setFooter({
        text: `Puoi disabilitare la visualizzazione del tuo banner tramite il comando ?blockbn.\n${totalViews} Views 👁️`,
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("banner_views")
        .setLabel("Classifica Views")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary),
    );

    return safeChannelSend(message.channel, {
      embeds: [embed],
      components: [row],
    });
  },
};