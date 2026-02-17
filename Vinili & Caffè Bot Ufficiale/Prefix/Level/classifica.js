const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { ExpUser } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { getCurrentWeekKey } = require("../../Services/Community/expService");

const TOP_LIMIT = 10;
const LEADERBOARD_CHANNEL_ID = IDs.channels.commands;

function getInvokedCommand(message) {
  const content = String(message?.content || "").trim();
  if (!content.startsWith("+")) return "";
  return content.slice(1).split(/\s+/)[0].toLowerCase();
}

function rankLabel(index) {
  if (index === 0) return "<:VC_Podio1:1469659449974329598>";
  if (index === 1) return "<:VC_Podio2:1469659512863592500>";
  if (index === 2) return "<:VC_Podio3:1469659557696504024>";
  return `${index + 1}°`;
}

function formatUserLabel(member, userId) {
  if (member) {
    const username =
      member.user?.username ||
      member.user?.tag ||
      member.displayName ||
      "utente";
    return `${member} (${username})`;
  }
  return `<@${userId}>`;
}

async function fetchMembers(guild, userIds) {
  const unique = Array.from(new Set(userIds));
  const out = new Map();
  if (!guild || unique.length === 0) return out;
  for (const id of unique) {
    const cached = guild.members.cache.get(id);
    if (cached) {
      out.set(id, cached);
      continue;
    }
    const fetched = await guild.members.fetch(id).catch(() => null);
    if (fetched) out.set(id, fetched);
  }
  return out;
}

async function buildWeeklyEmbed(message) {
  const weekKey = getCurrentWeekKey();
  const rows = await ExpUser.find({
    guildId: message.guild.id,
    weeklyKey: weekKey,
  })
    .sort({ weeklyExp: -1 })
    .limit(TOP_LIMIT)
    .lean();

  const members = await fetchMembers(
    message.guild,
    rows.map((r) => r.userId),
  );
  const lines = [];
  rows.forEach((row, index) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const exp = Number(row.weeklyExp || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1468262952934314131> Weekly <:VC_EXP:1468714279673925883> __${exp}__ EXP`,
    );
  });

  if (lines.length === 0) {
    lines.push("Nessun dato disponibile per questa settimana.");
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: message.guild.name,
      iconURL: message.guild.iconURL({ size: 128 }),
    })
    .setTitle("Classifica settimanale [Weekly]")
    .setThumbnail(message.guild.iconURL({ size: 128 }))
    .setDescription(
      [
        "<a:VC_Sparkles:1468546911936974889> I 10 utenti con più exp guadagnati in settimana (aggiornata ogni Lunedi)",
        "",
        lines.join("\n"),
      ].join("\n"),
    );
}

async function buildAllTimeEmbed(message) {
  const rows = await ExpUser.find({ guildId: message.guild.id })
    .sort({ totalExp: -1 })
    .limit(TOP_LIMIT)
    .lean();

  const members = await fetchMembers(
    message.guild,
    rows.map((r) => r.userId),
  );
  const lines = [];
  rows.forEach((row, index) => {
    const member = members.get(row.userId);
    const label = formatUserLabel(member, row.userId);
    const exp = Number(row.totalExp || 0);
    const level = Number(row.level || 0);
    lines.push(`${rankLabel(index)} ${label}`);
    lines.push(
      `<:VC_Reply:1468262952934314131> Exp: <:VC_EXP:1468714279673925883> __${exp}__ <a:VC_Arrow:1448672967721615452> Livello: ${level}`,
    );
  });

  if (lines.length === 0) {
    lines.push("Nessun dato disponibile.");
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: message.guild.name,
      iconURL: message.guild.iconURL({ size: 128 }),
    })
    .setTitle("Classifica generale [AllTime]")
    .setThumbnail(message.guild.iconURL({ size: 128 }))
    .setDescription(
      [
        "<a:VC_Sparkles:1468546911936974889> I 10 utenti con il livello più alto nel server.",
        "",
        lines.join("\n"),
      ].join("\n"),
    );
}

module.exports = {
  name: "classifica",
  aliases: ["c", "cs", "classificasettimanale"],
  subcommands: ["alltime", "weekly"],
  subcommandAliases: {
    cs: "weekly",
    classificasettimanale: "weekly",
  },

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const invoked = getInvokedCommand(message);
    const rawMode = String(args[0] || "").toLowerCase();
    const normalizedMode = ["weekly", "settimanale", "week", "w"].includes(
      rawMode,
    )
      ? "weekly"
      : ["alltime", "all", "totale", "general", "generale", "a"].includes(
            rawMode,
          )
        ? "alltime"
        : null;
    const mode =
      normalizedMode ||
      (invoked === "cs" || invoked === "classificasettimanale"
        ? "weekly"
        : "alltime");
    const isWeekly = mode === "weekly";

    if (rawMode && !normalizedMode) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Usa: `+classifica alltime` oppure `+classifica weekly`.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const embed = isWeekly
      ? await buildWeeklyEmbed(message)
      : await buildAllTimeEmbed(message);

    const shouldRedirect = message.channel.id !== LEADERBOARD_CHANNEL_ID;
    if (!shouldRedirect) {
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const leaderboardChannel =
      message.guild.channels.cache.get(LEADERBOARD_CHANNEL_ID) ||
      (await message.guild.channels
        .fetch(LEADERBOARD_CHANNEL_ID)
        .catch(() => null));

    if (!leaderboardChannel || !leaderboardChannel.isTextBased()) {
      await safeMessageReply(message, {
        content: `Non riesco a trovare il canale <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const sent = await leaderboardChannel
      .send({ embeds: [embed] })
      .catch(() => null);
    if (!sent) {
      await safeMessageReply(message, {
        content: `Non sono riuscito a inviare la classifica in <#${LEADERBOARD_CHANNEL_ID}>.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const label = isWeekly
      ? "Vai alla classifica settimanale"
      : "Vai alla classifica generale";
    const redirectEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(
        `Per evitare di intasare la chat, la classifica ${isWeekly ? "settimanale" : "generale"} ` +
          `e stata generata nel canale <#${LEADERBOARD_CHANNEL_ID}>. ` +
          `[Clicca qui per vederla](${sent.url}) o utilizza il bottone sottostante.`,
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(label)
        .setURL(sent.url),
    );

    await safeMessageReply(message, {
      embeds: [redirectEmbed],
      components: [row],
      allowedMentions: { repliedUser: false },
    });
  },
};
