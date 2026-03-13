const IDs = require("../../Utils/Config/ids");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { buildPauseListPayload } = require("../../Utils/Pause/pauseListRuntime");

async function resolveTargetUser(message, rawValue) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;
  const raw = String(rawValue || "").trim();
  if (!raw) return message.author;
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return message.client.users.fetch(id).catch(() => null);
  }
  const wanted = raw.toLowerCase();
  let member = message.guild.members.cache.find((item) => {
    const username = String(item.user?.username || "").toLowerCase();
    const displayName = String(item.displayName || "").toLowerCase();
    const tag = String(item.user?.tag || "").toLowerCase();
    return username === wanted || displayName === wanted || tag === wanted;
  });
  if (!member && typeof message.guild.members.fetch === "function") {
    try {
      const fetched = await message.guild.members.fetch({ query: raw.slice(0, 32), limit: 10 });
      member = fetched.find((m) => {
        const u = String(m.user?.username || "").toLowerCase();
        const d = String(m.displayName || "").toLowerCase();
        return u === wanted || d === wanted;
      }) || fetched.first();
    } catch (_) {}
  }
  return member?.user || null;
}

module.exports = {
  name: "pause",
  aliases: ["pausa"],
  description: "Gestione pause staffer.",
  subcommands: ["list"],
  subcommandDescriptions: {
    list: "Mostra la lista pause dell'anno corrente per te stesso.",
  },
  subcommandAliases: {
    list: "list",
  },
  usage: "+pause list [@staffer | id | username]",
  subcommandUsages: {
    list: "+pause list [@staffer | id | username]",
  },
  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    const subcommand = String(args[0] || "").trim().toLowerCase();
    if (subcommand !== "list") {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Uso corretto: `+pause list [@staffer | id | username]`",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const targetUser = await resolveTargetUser(message, args.slice(1).join(" "));
    if (!targetUser) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Staffer non trovato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const payload = await buildPauseListPayload({
      guildId: message.guild.id,
      requesterId: message.author.id,
      targetUser,
      isHighStaff: message.member.roles?.cache?.has(IDs.roles.HighStaff),
    });
    if (!payload.ok) {
      await safeMessageReply(message, {
        content: payload.error,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await safeMessageReply(message, {
      embeds: payload.embeds,
      allowedMentions: { repliedUser: false },
    });
  },
};