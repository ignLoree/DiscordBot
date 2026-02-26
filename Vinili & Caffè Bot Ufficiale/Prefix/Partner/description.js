const { safeMessageReply } = require("../../Utils/Moderation/reply");
const Ticket = require("../../Schemas/Ticket/ticketSchema");

async function resolveTargetUser(message, rawArg) {
  if (!rawArg) return null;

  const value = String(rawArg).trim();
  const id =
    value.match(/^<@!?(\d+)>$/)?.[1] ||
    (/^\d{17,20}$/.test(value) ? value : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}

module.exports = {
  name: "description",
  aliases: ["desc"],
  allowEmptyArgs: true,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const descriptionText = [
      "_ _",
      "_ _`` ☕ ``        𓂃        **[Vinili & Caffè](<https://discord.gg/viniliecaffe>)**      ⟢          `` 📀 ``",
      "_ _     𓎢      **social**       ⊹       **italia** **chill**       ୧ ",
      "_ _                            **gaming**",
      "_ _"
    ].join("\n");
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const ticketDoc = await Ticket.findOne({
      channelId: message.channel.id,
      open: true,
    })
      .lean()
      .catch(() => null);
    if (!ticketDoc) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Questo comando può essere usato **solo in un canale ticket aperto**.",
      );
    }

    let target = null;
    const mode = String(args[0] || "").toLowerCase();
    if (mode === "user" || mode === "utente" || mode === "id") {
      target = await resolveTargetUser(message, args[1]);
      if (!target) {
        await safeMessageReply(message, {
          content:
            "<:vegax:1443934876440068179> Usa: `+desc user <@utente|id>`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
    } else if (args[0]) {
      target = await resolveTargetUser(message, args[0]);
    }

    if (!target) {
      await safeMessageReply(message, {
        content: descriptionText,
        allowedMentions: { parse: [], repliedUser: false },
      });
      return;
    }

    const delivered = await target
      .send({
        content: descriptionText,
        allowedMentions: { parse: [] },
      })
      .then(() => true)
      .catch(() => false);
    if (!delivered) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Non riesco a inviare DM a ${target}.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await safeMessageReply(message, {
      content: `<:vegacheckmark:1443666279058772028> Description inviata in DM a ${target}.`,
      allowedMentions: { repliedUser: false },
    });
  },
};