const { safeEditReply } = require("../../Utils/Moderation/reply");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const StaffModel = require("../../Schemas/Staff/staffSchema");
const IDs = require("../../Utils/Config/ids");

const ROLE_PARTNER_MANAGER = IDs.roles.PartnerManager;
const ROLE_STAFF = IDs.roles.Staff;
const ROLE_HIGH_STAFF = IDs.roles.HighStaff;
const ROLE_HELPER = IDs.roles.Helper;
const ROLE_MODERATOR = IDs.roles.Mod;
const ROLE_COORDINATOR = IDs.roles.Coordinator;
const ROLE_SUPERVISOR = IDs.roles.Supervisor;
const ROLE_ADMIN = IDs.roles.Admin;
const ROLE_MANAGER = IDs.roles.Manager;
const ROLE_CO_OWNER = IDs.roles.CoFounder;
const ROLE_OWNER = IDs.roles.Founder;

const ERROR_COLOR = "#E74C3C";
const SUCCESS_COLOR = "#6f4e37";
const PRIVATE_FLAG = 1 << 6;

function statusEmbed(description, color) {
  return new EmbedBuilder().setDescription(description).setColor(color);
}

async function replyError(interaction, description) {
  return safeEditReply(interaction, {
    embeds: [statusEmbed(description, ERROR_COLOR)],
    flags: PRIVATE_FLAG,
  });
}

async function replyCommandError(interaction) {
  return replyError(
    interaction,
    "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
  );
}

async function replySuccess(interaction) {
  return safeEditReply(interaction, {
    embeds: [
      statusEmbed(
        `<:vegacheckmark:1443666279058772028> Azione eseguita con successo da ${interaction.user.username}.`,
        SUCCESS_COLOR,
      ),
    ],
  });
}

async function fetchMember(guild, userId) {
  return guild.members.fetch(userId).catch(() => null);
}

async function ensureMember(interaction, user) {
  const member = await fetchMember(interaction.guild, user.id);
  if (!member) {
    await replyError(
      interaction,
      "<:vegax:1443934876440068179> Utente non trovato nel server.",
    );
    return null;
  }

  return member;
}

async function ensureNotSelf(interaction, targetUser) {
  if (interaction.user.id !== targetUser.id) {
    return true;
  }

  await replyError(
    interaction,
    "<:vegax:1443934876440068179> Non puoi usare questo comando su te stesso!",
  );
  return false;
}

async function getOrCreateStaffDoc(guildId, userId) {
  let staffDoc = await StaffModel.findOne({ guildId, userId });
  if (!staffDoc) {
    staffDoc = new StaffModel({ guildId, userId });
  }
  return staffDoc;
}

async function sendPartnerManagerWelcome(pmChannel, user) {
  await pmChannel.send({
    content: `
${user}
# Benvenutx nei Partner Manager <:partneredserverowner:1443651871125409812>
> **Per iniziare al meglio controlla:** <:discordchannelwhite:1443308552536985810>
<:dot:1443660294596329582> <#1442569199229730836>
__Per qualsiasi cosa l'High Staff è disponibile__ <a:BL_crown_yellow:1330194103564238930>`,
  });
}

async function sendHelperWelcome(staffChannel, user) {
  await staffChannel.send({
    content: `
${user}
# Benvenutx nello staff <:discordstaff:1443651872258003005>
> **Per iniziare al meglio controlla:** <:discordchannelwhite:1443308552536985810>
<:dot:1443660294596329582> <#1442569237142044773>
<:dot:1443660294596329582> <#1442569239063167139>
<:dot:1443660294596329582> <#1442569243626307634>
__Per qualsiasi cosa l'High Staff è disponibile__ <a:BL_crown_yellow:1330194103564238930>`,
  });
}

async function applyPexSideEffects(
  member,
  roleId,
  pmChannel,
  staffChannel,
  user,
) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    await sendPartnerManagerWelcome(pmChannel, user);
  }

  if (roleId === ROLE_HELPER) {
    await member.roles.add(ROLE_STAFF);
    await sendHelperWelcome(staffChannel, user);
  }

  if (roleId === ROLE_MODERATOR) {
    await member.roles.remove(ROLE_HELPER);
  }

  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(ROLE_MODERATOR);
  }

  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(ROLE_COORDINATOR);
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_SUPERVISOR);
    await member.roles.add(ROLE_HIGH_STAFF);
  }

  if (roleId === ROLE_MANAGER) {
    await member.roles.remove(ROLE_ADMIN);
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(ROLE_MANAGER);
  }

  if (roleId === ROLE_OWNER) {
    await member.roles.remove(ROLE_CO_OWNER);
  }
}

async function applyDepexSideEffects(member, roleId) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    await member.roles.remove(roleId);
  }

  if (roleId === ROLE_HELPER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
  }

  if (roleId === ROLE_MODERATOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
  }

  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
  }

  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
  }

  if (roleId === ROLE_MANAGER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
  }
}

async function ensureStaffRole(interaction, member) {
  if (member?.roles?.cache?.has(ROLE_STAFF)) {
    return true;
  }

  await replyError(
    interaction,
    "<:vegax:1443934876440068179> Puoi selezionare solo uno staffer con il ruolo specificato.",
  );
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Gestisci lo staff di Vinili & Caffè ")
    .addSubcommand((command) =>
      command
        .setName("pex")
        .setDescription("Pexa un utente.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Specifica l'utente da pexare.")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("ruolo_precedente")
            .setDescription("Specifica il ruolo precedente.")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("ruolo_successivo")
            .setDescription("Specifca il ruolo da dare.")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("motivo")
            .setDescription("Specifica il motivo del pex.")
            .setRequired(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("depex")
        .setDescription("Depexa uno staffer.")
        .addUserOption((option) =>
          option
            .setName("staffer")
            .setDescription("Specifica l'utente da depexare.")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("ruolo_precedente")
            .setDescription("Specifica il ruolo da togliere.")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("ruolo_successivo")
            .setDescription("Specifica il ruolo da dare.")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("motivo")
            .setDescription("Specifica il motivo del depex.")
            .setRequired(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("warn")
        .setDescription("Warna uno staffer.")
        .addUserOption((option) =>
          option
            .setName("staffer")
            .setDescription("Specifica l'utente da warnare.")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("motivo")
            .setDescription("Specifica il motivo del warn.")
            .setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("resoconto")
        .setDescription("Invia un resoconto")
        .addSubcommand((command) =>
          command
            .setName("staffer")
            .setDescription("Invia un resoconto di uno staffer.")
            .addUserOption((option) =>
              option
                .setName("staffer")
                .setDescription(
                  "Seleziona lo staffer di cui fare il resoconto.",
                )
                .setRequired(true),
            )
            .addRoleOption((option) =>
              option
                .setName("ruolo")
                .setDescription("Seleziona il ruolo dello staffer.")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("messaggi")
                .setDescription("Messaggi inviati in una settimana.")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("ore")
                .setDescription("Ore trascorse in vocale in una settimana.")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("grado_attivita")
                .setDescription(
                  "Seleziona l'attività avuta durante la settimana.",
                )
                .setRequired(true)
                .addChoices(
                  { name: "Non classificato", value: "Limiti non rispettati" },
                  {
                    name: "Insufficiente",
                    value: "Limiti non raggiunti di massimo 100msg e 1h",
                  },
                  { name: "Sufficiente", value: "Limiti rispettati" },
                  {
                    name: "Discreto",
                    value: "Limiti superati di 150msg e 1h e 30min",
                  },
                  { name: "Buono", value: "Limiti superati del doppio" },
                  {
                    name: "Ottimo",
                    value: "Doppio dei limiti superati di 300msg e 2h",
                  },
                  { name: "Eccellente", value: "Limiti superati del triplo" },
                ),
            )
            .addStringOption((option) =>
              option
                .setName("grado_condotta")
                .setDescription(
                  "Seleziona il comportamento avuto durante la settimana.",
                )
                .setRequired(true)
                .addChoices(
                  {
                    name: "Non classificato",
                    value: "Solo valutazioni negative e 0 positive",
                  },
                  {
                    name: "Insufficiente",
                    value: "Più valutazioni negative che positive",
                  },
                  {
                    name: "Sufficiente",
                    value: "Valutazioni equivalenti/Nessuna valutazione",
                  },
                  {
                    name: "Discreto",
                    value: "Più valutazioni positive che negative",
                  },
                  {
                    name: "Ottimo",
                    value: "Minimo 3 valutazioni positive e 0 negative",
                  },
                ),
            )
            .addStringOption((option) =>
              option
                .setName("azione")
                .setDescription("Seleziona l'azione da applicare allo staffer.")
                .setRequired(true)
                .addChoices(
                  { name: "Pex", value: "Pex" },
                  { name: "Depex", value: "Depex" },
                  {
                    name: "Valutazione Positiva",
                    value: "Valutazione Positiva",
                  },
                  {
                    name: "Valutazione Negativa",
                    value: "Valutazione Negativa",
                  },
                  { name: "Nulla", value: "Nulla" },
                ),
            ),
        )
        .addSubcommand((command) =>
          command
            .setName("pm")
            .setDescription("Invia il resoconti di un Partner Manager")
            .addUserOption((option) =>
              option
                .setName("staffer")
                .setDescription(
                  "Seleziona lo staffer di cui fare il resoconto.",
                )
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("partner")
                .setDescription("Partner fatte in una settimana.")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("azione")
                .setDescription("Seleziona l'azione da applicare allo staffer.")
                .setRequired(true)
                .addChoices(
                  { name: "Depex", value: "Depex" },
                  { name: "Richiamo", value: "Richiamo" },
                  { name: "Nulla", value: "Nulla" },
                ),
            ),
        ),
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});

    const pexDepexChannel = interaction.guild.channels.cache.get(
      IDs.channels.pexDepex,
    );
    const pmChannel = interaction.guild.channels.cache.get(
      IDs.channels.partnersChat,
    );
    const staffChat = interaction.guild.channels.cache.get(
      IDs.channels.staffChat,
    );

    if (sub === "pex") {
      try {
        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("motivo");
        const roleBefore = interaction.options.getRole("ruolo_precedente");
        const roleAfter = interaction.options.getRole("ruolo_successivo");

        const member = await ensureMember(interaction, targetUser);
        if (!member) return;

        const staffDoc = await getOrCreateStaffDoc(
          interaction.guild.id,
          targetUser.id,
        );

        if (!(await ensureNotSelf(interaction, targetUser))) return;

        if (member.roles.cache.has(roleAfter.id)) {
          return replyError(
            interaction,
            `<:attentionfromvega:1443651874032062505> L'utente ${targetUser} ha già il ruolo che gli vuoi aggiungere.`,
          );
        }

        await member.roles.add(roleAfter.id);
        await applyPexSideEffects(
          member,
          roleAfter.id,
          pmChannel,
          staffChat,
          targetUser,
        );

        await replySuccess(interaction);

        await pexDepexChannel.send({
          content: `**<a:everythingisstable:1444006799643508778> PEX** ${targetUser}
<:member_role_icon:1330530086792728618> \`${roleBefore.name}\` <a:vegarightarrow:1443673039156936837> \`${roleAfter.name}\`
<:discordstaff:1443651872258003005> __${reason}__`,
        });

        staffDoc.rolesHistory.push({
          oldRole: roleBefore.id,
          newRole: roleAfter.id,
          reason,
        });
        await staffDoc.save();
        return;
      } catch (err) {
        global.logger.error(err);
        return replyCommandError(interaction);
      }
    }

    if (sub === "depex") {
      try {
        const targetUser = interaction.options.getUser("staffer");
        const oldRole = interaction.options.getRole("ruolo_precedente");
        const newRole = interaction.options.getRole("ruolo_successivo");
        const reason = interaction.options.getString("motivo");

        const member = await ensureMember(interaction, targetUser);
        if (!member) return;

        await getOrCreateStaffDoc(interaction.guild.id, targetUser.id);

        if (!(await ensureNotSelf(interaction, targetUser))) return;

        if (!member.roles.cache.has(oldRole.id)) {
          return replyError(
            interaction,
            `<:vegax:1443934876440068179> L'utente ${targetUser} non ha il ruolo che gli vuoi togliere.`,
          );
        }

        await member.roles.remove(oldRole.id);
        await applyDepexSideEffects(member, oldRole.id);

        await StaffModel.deleteOne({
          guildId: interaction.guild.id,
          userId: targetUser.id,
        });

        await replySuccess(interaction);

        await pexDepexChannel.send({
          content: `**<a:laydowntorest:1444006796661358673> DEPEX** ${targetUser}
<:member_role_icon:1330530086792728618> \`${oldRole.name}\` <a:vegarightarrow:1443673039156936837> \`${newRole.name}\`
<:discordstaff:1443651872258003005> __${reason}__`,
        });
        return;
      } catch (err) {
        global.logger.error(err);
        return replyCommandError(interaction);
      }
    }

    if (sub === "warn") {
      try {
        const targetUser = interaction.options.getUser("staffer");
        const reason = interaction.options.getString("motivo");
        const warnChannel = interaction.guild.channels.cache.get(
          IDs.channels.warnStaff,
        );

        const staffDoc = await getOrCreateStaffDoc(
          interaction.guild.id,
          targetUser.id,
        );
        if (!staffDoc.idCount) staffDoc.idCount = 0;
        if (!staffDoc.warnCount) staffDoc.warnCount = 0;
        if (!staffDoc.warnReasons) staffDoc.warnReasons = [];

        staffDoc.idCount++;
        staffDoc.warnCount++;
        staffDoc.warnReasons.push(reason);
        await staffDoc.save();

        const warnEmbed = new EmbedBuilder()
          .setAuthor({
            name: `Warn eseguito da ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setTitle(
            `<a:laydowntorest:1444006796661358673> • **__WARN STAFF__** \`#${staffDoc.warnCount}\``,
          )
          .setThumbnail(targetUser.displayAvatarURL())
          .setDescription(
            `<:discordstaff:1443651872258003005> <a:vegarightarrow:1443673039156936837> ${targetUser}
                        <:pinnednew:1443670849990430750> __${reason}__
                        <a:loading:1443934440614264924> **ID Valutazione** __\`${staffDoc.idCount}\`__`,
          )
          .setColor(SUCCESS_COLOR);

        if (warnChannel) {
          await warnChannel.send({
            content: `${targetUser}`,
            embeds: [warnEmbed],
          });
        }

        return replySuccess(interaction);
      } catch (err) {
        global.logger.error(err);
        return replyCommandError(interaction);
      }
    }

    if (group === "resoconto" && sub === "staffer") {
      try {
        const resocontoChannel = interaction.guild.channels.cache.get(
          IDs.channels.resocontiStaff,
        );
        const staffer = interaction.options.getUser("staffer");
        const role = interaction.options.getRole("ruolo");
        const action = interaction.options.getString("azione");
        const messages = interaction.options.getString("messaggi");
        const voiceHours = interaction.options.getString("ore");
        const activityGrade = interaction.options.getString("grado_attivita");
        const behaviorGrade = interaction.options.getString("grado_condotta");
        const stafferMember = await fetchMember(interaction.guild, staffer.id);

        if (!(await ensureStaffRole(interaction, stafferMember))) return;
        if (!(await ensureNotSelf(interaction, staffer))) return;

        await resocontoChannel.send({
          content: `
<:discordstaff:1443651872258003005> **Staffer:** __**<@${staffer.id}>**__
<:dot:1443660294596329582> **Ruolo:** __${role}__
<:dot:1443660294596329582> **Messaggi in una settimana:** __${messages}__
<:dot:1443660294596329582> **Ore in una settimana:** __${voiceHours}__
<:dot:1443660294596329582> **Attività:** __${activityGrade}__
<:dot:1443660294596329582> **Condotta:** __${behaviorGrade}__
<:dot:1443660294596329582> **Azione:** __${action}__
<:staff:1443651912179388548> **Resoconto fatto da** __<@${interaction.user.id}>__`,
        });

        return replySuccess(interaction);
      } catch (err) {
        global.logger.error(err);
        return replyCommandError(interaction);
      }
    }

    if (group === "resoconto" && sub === "pm") {
      try {
        const resocontoChannel = interaction.guild.channels.cache.get(
          IDs.channels.resocontiStaff,
        );
        const staffer = interaction.options.getUser("staffer");
        const action = interaction.options.getString("azione");
        const partners = interaction.options.getString("partner");
        const stafferMember = await fetchMember(interaction.guild, staffer.id);

        if (!(await ensureStaffRole(interaction, stafferMember))) return;
        if (!(await ensureNotSelf(interaction, staffer))) return;

        await resocontoChannel.send({
          content: `<:partneredserverowner:1443651871125409812> **Partner Manager:** __<@${staffer.id}>__
<:dot:1443660294596329582> **Partner:** __${partners}__
<:dot:1443660294596329582> **Azione:** __${action}__
<:staff:1443651912179388548> **Resoconto fatto da** __<@${interaction.user.id}>__`,
        });

        return replySuccess(interaction);
      } catch (err) {
        global.logger.error(err);
        return replyCommandError(interaction);
      }
    }
  },
};
