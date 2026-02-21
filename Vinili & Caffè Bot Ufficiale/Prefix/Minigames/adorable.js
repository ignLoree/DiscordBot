const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { replyError } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {

  allowEmptyArgs: true,
  aliases: ["avatarfun"],
  async execute(message, args) {
    const seed = String((args || []).join(" ") || message.author?.id || "user").trim().slice(0, 80);
    if (!seed) return replyError(message, "Seed non valido.");
    const image = "https://api.dicebear.com/9.x/fun-emoji/png?seed=" + encodeURIComponent(seed);
    return safeMessageReply(message, {
      embeds: [{ color: 0x3498db, title: "Avatar Adorabile", image: { url: image } }],
      allowedMentions: { repliedUser: false },
    });
  },
};

