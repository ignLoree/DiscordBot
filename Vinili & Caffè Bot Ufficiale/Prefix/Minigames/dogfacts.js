const { replyError, replyInfo, fetchJson, clamp } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "dogfacts",
  aliases: ["dogfact"],
  async execute(message) {
    try {
      const data = await fetchJson("https://dogapi.dog/api/v2/facts");
      const fact = clamp(data?.data?.[0]?.attributes?.body || "");
      if (!fact) return replyError(message, "Fact non disponibile.");
      return replyInfo(message, fact, "Dog Fact");
    } catch {
      return replyError(message, "Non sono riuscito a recuperare un dog fact.");
    }
  },
};
