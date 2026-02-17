const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const SponsorMainLeave = require("../Schemas/Tags/tagsSchema");
const IDs = require("../Utils/Config/ids");
const MAIN_GUILD_ID = IDs.guilds?.main || "1329080093599076474";
const SPONSOR_GUILD_IDS = IDs.guilds?.sponsorGuildIds || [];
const OFFICIAL_INVITE_URL = "https://discord.gg/viniliecaffe";
const REJOIN_DEADLINE_MS = 24 * 60 * 60 * 1000;

function makeRejoinEmbed() {
  return new EmbedBuilder()
    .setColor("#ffb020")
    .setTitle("Rientra nel server principale")
    .setDescription(
      "Hai lasciato il server principale **Vinili & Caffè**.\n\n" +
        "Per mantenere l'accesso ai server TAGS devi rientrare entro **24 ore**.\n\n" +
        "Clicca il bottone qui sotto per rientrare.",
    )
    .setFooter({
      text: "Se non rientri entro 24h sarai rimosso dal server e perderai la TAG.",
    });
}

function makeRejoinRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Rientra nel server principale")
      .setURL(OFFICIAL_INVITE_URL),
  );
}

async function isUserInAnySponsorGuild(client, userId) {
  for (const guildId of SPONSOR_GUILD_IDS) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) return true;
  }

  return false;
}

async function upsertLeaveRecord(userId, leftAt, kickAt) {
  await SponsorMainLeave.updateOne(
    { userId },
    { $set: { userId, leftAt, kickAt, dmSent: false, dmFailed: false } },
    { upsert: true },
  ).catch(() => {});
}

async function markDmResult(userId, dmOk) {
  await SponsorMainLeave.updateOne(
    { userId },
    { $set: dmOk ? { dmSent: true } : { dmFailed: true } },
  ).catch(() => {});
}

module.exports = {
  name: "guildMemberRemove",
  async execute(member) {
    try {
      if (member?.user?.bot) return;
      if (member?.guild?.id !== MAIN_GUILD_ID) return;

      const userId = member.id;
      const inSponsorGuild = await isUserInAnySponsorGuild(
        member.client,
        userId,
      );
      if (!inSponsorGuild) return;

      const leftAt = new Date();
      const kickAt = new Date(Date.now() + REJOIN_DEADLINE_MS);
      await upsertLeaveRecord(userId, leftAt, kickAt);

      const dmOk = await member.user
        .send({ embeds: [makeRejoinEmbed()], components: [makeRejoinRow()] })
        .then(() => true)
        .catch(() => false);

      await markDmResult(userId, dmOk);
    } catch (err) {
      global.logger.error("[Bot Test] guildMemberRemove", err);
    }
  },
};
