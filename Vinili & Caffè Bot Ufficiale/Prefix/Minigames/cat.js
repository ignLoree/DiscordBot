const { safeMessageReply } = require("../../Utils/Moderation/reply");

module.exports = {
  name: "cat",
  aliases: ["kitty"],
  async execute(message) {
    const url = "https://cataas.com/cat?width=700&height=500&r=" + Date.now();
    return safeMessageReply(message, {
      embeds: [{ color: 0xf1c40f, title: "Gatto", image: { url } }],
      allowedMentions: { repliedUser: false },
    });
  },
};
