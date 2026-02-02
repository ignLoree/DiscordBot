const { PermissionFlagsBits } = require("discord.js");
const boostEvent = require("../../Events/guildMemberUpdate");

function makeFakeGuild(guild, premiumCount) {
  const fakeGuild = Object.create(guild);
  Object.defineProperty(fakeGuild, "premiumSubscriptionCount", {
    value: premiumCount,
    configurable: true
  });
  return fakeGuild;
}

function makeFakeMember(member, guild, premiumSinceTimestamp) {
  const fakeMember = Object.create(member);
  fakeMember.guild = guild;
  fakeMember.user = member.user;
  fakeMember.id = member.id;
  fakeMember.premiumSinceTimestamp = premiumSinceTimestamp;
  return fakeMember;
}

async function simulateBoost(member, countBefore, countAfter) {
  const guildBefore = makeFakeGuild(member.guild, countBefore);
  const guildAfter = makeFakeGuild(member.guild, countAfter);
  const oldMember = makeFakeMember(member, guildBefore, 0);
  const newMember = makeFakeMember(member, guildAfter, Date.now());
  await boostEvent.execute(oldMember, newMember);
}

module.exports = {
  skipPrefix: false,
  name: "boosttest",
  aliases: ["testboost", "boostsimulate"],
  async execute(message, args) {
    if (!message.guild || !message.member) return;
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "<:vegax:1443934876440068179> Non hai i permessi per usare questo comando." });
    }
    const mode = (args[0] || "single").toLowerCase();
    const baseCount = Number(message.guild.premiumSubscriptionCount || 0);

    if (mode !== "single" && mode !== "double") {
      return message.reply({ content: "Usa: `boosttest single` oppure `boosttest double`." });
    }

    if (mode === "single") {
      await simulateBoost(message.member, baseCount, baseCount + 1);
      return message.reply({ content: "Test boost singolo inviato." });
    }

    await simulateBoost(message.member, baseCount, baseCount + 2);
    return message.reply({ content: "Test doppio boost inviato." });
  }
};
