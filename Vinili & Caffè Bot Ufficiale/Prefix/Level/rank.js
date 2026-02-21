const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { getUserRanks, getGlobalMultiplier, } = require("../../Services/Community/expService");
const renderRankCanvas = require("../../Utils/Render/rankCanvas");

module.exports = {
  name: "rank",
  aliases: ["r"],
  allowEmptyArgs: true, 
  async execute(message, args = []) {
    await message.channel.sendTyping();

    const tokens = Array.isArray(args)
      ? args.map((arg) => String(arg || "").trim()).filter(Boolean)
      : [];
    const wantsEmbed = tokens.some((token) => token.toLowerCase() === "embed");
    const cleanArgs = tokens.filter((token) => token.toLowerCase() !== "embed");

    const targetFromMention = message.mentions?.users?.first() || null;
    const raw = cleanArgs[0] ? String(cleanArgs[0]) : "";
    const id = raw.replace(/[<@!>]/g, "");
    const targetFromId = /^\d{16,20}$/.test(id)
      ? await message.client.users.fetch(id).catch(() => null)
      : null;
    const targetUser = targetFromMention || targetFromId || message.author;

    const { stats, weeklyRank, allTimeRank } = await getUserRanks(
      message.guild.id,
      targetUser.id,
    );
    const multiplier = await getGlobalMultiplier(message.guild.id);
    const weeklyText =
      stats.level === 0 ? "Fuori dalla classifica" : `#${weeklyRank}`;
    const allTimeText =
      stats.level === 0 ? "Fuori dalla classifica" : `#${allTimeRank}`;

    const card = await renderRankCanvas({
      username: targetUser.username,
      avatarUrl: targetUser.displayAvatarURL({ extension: "png", size: 256 }),
      level: stats.level,
      totalExp: stats.totalExp,
      currentLevelExp: stats.currentLevelExp,
      nextLevelExp: stats.nextLevelExp,
      progressPercent: stats.progressPercent,
      weeklyRank,
      allTimeRank,
    });
    const file = new AttachmentBuilder(card, {
      name: `rank-${targetUser.id}.png`,
    });

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`Le statistiche di ${targetUser.tag} .ᐟ ✧`)
      .setImage(`attachment://rank-${targetUser.id}.png`)
      .setDescription(
        [
          `<:VC_EXP:1468714279673925883> Hai accumulato un totale di **${stats.totalExp} EXP**.`,
          `<a:VC_Rocket:1468544312475123753> **Moltiplicatore:** ${multiplier}x`,
        ].join("\n"),
      )
      .addFields(
        {
          name: "<a:VC_StarPink:1330194976440848500> **Livello:**",
          value: `**${stats.level}**`,
          inline: true,
        },
        {
          name: "<a:VC_StarBlue:1330194918043418674> **Weekly Top:**",
          value: `${weeklyText}`,
          inline: true,
        },
        {
          name: "<a:VC_StarPurple:1330195026688344156> **General Top:**",
          value: `${allTimeText}`,
          inline: true,
        },
      )
      .setFooter({
        text: `𓂃 Ti mancano ${stats.remainingToNext} exp per il prossimo livello`,
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("r_multiplier_info")
        .setLabel("Info Moltiplicatori")
        .setEmoji("<a:VC_HeartsPink:1468685897389052008>")
        .setStyle(ButtonStyle.Secondary),
    );

    if (!wantsEmbed) {
      await safeMessageReply(message, {
        files: [file],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await safeMessageReply(message, {
      embeds: [embed],
      files: [file],
      components: [row],
      allowedMentions: { repliedUser: false },
    });
  },
};
