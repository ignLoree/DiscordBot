const axios = require("axios");
const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { replyError } = require("../../Utils/Minigames/dynoFunUtils");

async function probe(url, timeoutMs = 6000) {
  const startedAt = Date.now();
  try {
    const response = await axios.get(url, {
      timeout: timeoutMs,
      validateStatus: () => true,
      maxRedirects: 2,
      headers: { "User-Agent": "ViniliCafeBot/1.0" },
    });
    const ms = Date.now() - startedAt;
    const ok = response.status >= 200 && response.status < 500;
    return { ok, ms, status: response.status };
  } catch {
    return { ok: false, ms: null, status: null };
  }
}

function formatProbe(result) {
  if (!result?.ok) return "Non disponibile";
  return `Online (${result.ms} ms)`;
}

module.exports = {

  allowEmptyArgs: true,
  aliases: ["steam"],
  async execute(message) {
    try {
      const [community, store, webapi] = await Promise.all([
        probe("https://steamcommunity.com"),
        probe("https://store.steampowered.com"),
        probe("https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/"),
      ]);

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0x171a21,
            title: "Stato Servizi Steam",
            fields: [
              { name: "Community", value: formatProbe(community), inline: false },
              { name: "Store", value: formatProbe(store), inline: false },
              { name: "Web API", value: formatProbe(webapi), inline: false },
            ],
          },
        ],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Non sono riuscito a recuperare lo stato di Steam.");
    }
  },
};

