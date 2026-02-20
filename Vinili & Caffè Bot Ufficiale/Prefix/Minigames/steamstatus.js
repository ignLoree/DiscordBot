const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "steamstatus",
  aliases: ["steam"],
  async execute(message) {
    try {
      const data = await fetchJson("https://steamgaug.es/api/v2");
      const steam = data?.SteamCommunity || {};
      const store = data?.SteamStore || {};
      const web = data?.ISteamUser || {};

      return safeMessageReply(message, {
        embeds: [{
          color: 0x171a21,
          title: "Steam Status",
          fields: [
            { name: "Community", value: String((steam?.online ? "Online" : "Offline") + " (" + (steam?.time || "N/D") + ")"), inline: false },
            { name: "Store", value: String((store?.online ? "Online" : "Offline") + " (" + (store?.time || "N/D") + ")"), inline: false },
            { name: "Web API", value: String((web?.online ? "Online" : "Offline") + " (" + (web?.time || "N/D") + ")"), inline: false },
          ],
        }],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare lo stato di Steam.");
    }
  },
};
