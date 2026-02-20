const { safeMessageReply } = require("../../Utils/Moderation/reply");
const { fetchJson, replyError, translateToItalian } = require("../../Utils/Minigames/dynoFunUtils");

module.exports = {
  name: "pokemon",
  aliases: ["poke"],
  async execute(message, args) {
    const query = String(args?.[0] || "pikachu").trim().toLowerCase();
    try {
      const data = await fetchJson(
        "https://pokeapi.co/api/v2/pokemon/" + encodeURIComponent(query),
      );
      const rawTypes = Array.isArray(data?.types)
        ? data.types.map((t) => t?.type?.name).filter(Boolean).join(", ")
        : "N/D";
      const rawAbilities = Array.isArray(data?.abilities)
        ? data.abilities
            .map((a) => a?.ability?.name)
            .filter(Boolean)
            .slice(0, 4)
            .join(", ")
        : "N/D";

      const types = await translateToItalian(rawTypes);
      const abilities = await translateToItalian(rawAbilities);

      return safeMessageReply(message, {
        embeds: [
          {
            color: 0xf1c40f,
            title: "Pokemon: " + String(data?.name || query).toUpperCase(),
            thumbnail: data?.sprites?.other?.["official-artwork"]?.front_default
              ? { url: data.sprites.other["official-artwork"].front_default }
              : undefined,
            fields: [
              { name: "Tipo", value: String(types || "N/D"), inline: true },
              { name: "Altezza", value: String(data?.height ?? "N/D"), inline: true },
              { name: "Peso", value: String(data?.weight ?? "N/D"), inline: true },
              { name: "Abilita", value: String(abilities || "N/D"), inline: false },
            ],
          },
        ],
        allowedMentions: { repliedUser: false },
      });
    } catch {
      return replyError(message, "Pokemon non trovato.");
    }
  },
};
