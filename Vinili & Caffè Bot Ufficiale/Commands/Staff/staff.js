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

async function refreshMemberRoles(member) {
  const guild = member?.guild;
  const memberId = member?.id;
  if (!guild || !memberId) return member;
  return guild.members.fetch(memberId).catch(() => member);
}

async function ensureRoleState(member, roleId, shouldHaveRole) {
  const refreshedMember = await refreshMemberRoles(member);
  const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
  return { member: refreshedMember || member, ok: shouldHaveRole ? hasRole : !hasRole };
}

async function ensureMultipleRoleStates(member, checks) {
  const refreshedMember = await refreshMemberRoles(member);
  const ok = (Array.isArray(checks) ? checks : []).every(({ roleId, shouldHaveRole }) => {
    const hasRole = Boolean(refreshedMember?.roles?.cache?.has(roleId));
    return shouldHaveRole ? hasRole : !hasRole;
  });
  return { member: refreshedMember || member, ok };
}

async function fetchMember(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members.cache.get(userId) ||
    guild.members.fetch(userId).catch(() => null);
}

function createMemberResolver(guild) {
  const pendingMembers = new Map();

  return async (userId) => {
    const key = String(userId || "");
    if (!key) return null;

    const cachedMember = guild?.members?.cache?.get(key);
    if (cachedMember) return cachedMember;

    if (pendingMembers.has(key)) {
      return pendingMembers.get(key);
    }

    const fetchPromise = fetchMember(guild, key).finally(() => { pendingMembers.delete(key); });
    pendingMembers.set(key, fetchPromise);
    return fetchPromise;
  };
}

async function ensureMember(interaction, user, resolveMember) {
  const member = await resolveMember(user.id);
  if (!member) {
    await replyError(
      interaction,
      "<:attentionfromvega:1443651874032062505> Utente non trovato nel server.",
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
    "<:attentionfromvega:1443651874032062505> Non puoi usare questo comando su te stesso.",
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
    content: `${user}
# Benvenutx nei Partner Manager <:partnermanager:1443651916838998099>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_Reply:1468262952934314131> <#1442569199229730836>

__Per qualsiasi cosa l'High Staff è disponibile__ <:staff:1443651912179388548>`,
  }).catch(() => null);
}

async function sendHelperWelcome(staffChannel, user) {
  await staffChannel.send({
    content: `${user}
# Benvenutx nello staff <:staff:1443651912179388548>

> **Per iniziare al meglio controlla:** <:VC_id:1478517313618575419>
<:VC_DoubleReply:1468713981152727120> <#1442569237142044773>
<:VC_DoubleReply:1468713981152727120> <#1442569239063167139>
<:VC_Reply:1468262952934314131> <#1442569243626307634>

__Per qualsiasi cosa l'High Staff è disponibile__ <:staff:1443651912179388548>`,
  }).catch(() => null);
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
    const verification = await ensureRoleState(member, ROLE_STAFF, true);
    if (!verification.ok) throw new Error("Pex side effect failed: staff role missing after helper promotion.");
    await sendHelperWelcome(staffChannel, user);
    member = verification.member;
  }

  if (roleId === ROLE_MODERATOR) {
    await member.roles.remove(ROLE_HELPER);
    const verification = await ensureRoleState(member, ROLE_HELPER, false);
    if (!verification.ok) throw new Error("Pex side effect failed: helper role still present after moderator promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(ROLE_MODERATOR);
    const verification = await ensureRoleState(member, ROLE_MODERATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: moderator role still present after coordinator promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(ROLE_COORDINATOR);
    const verification = await ensureRoleState(member, ROLE_COORDINATOR, false);
    if (!verification.ok) throw new Error("Pex side effect failed: coordinator role still present after supervisor promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(ROLE_SUPERVISOR);
    await member.roles.add(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId: ROLE_SUPERVISOR, shouldHaveRole: false }, { roleId: ROLE_HIGH_STAFF, shouldHaveRole: true }]);
    if (!verification.ok) throw new Error("Pex side effect failed: admin side effects not applied.");
    member = verification.member;
  }

  if (roleId === ROLE_MANAGER) {
    await member.roles.remove(ROLE_ADMIN);
    const verification = await ensureRoleState(member, ROLE_ADMIN, false);
    if (!verification.ok) throw new Error("Pex side effect failed: admin role still present after manager promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(ROLE_MANAGER);
    const verification = await ensureRoleState(member, ROLE_MANAGER, false);
    if (!verification.ok) throw new Error("Pex side effect failed: manager role still present after co-owner promotion.");
    member = verification.member;
  }

  if (roleId === ROLE_OWNER) {
    await member.roles.remove(ROLE_CO_OWNER);
    const verification = await ensureRoleState(member, ROLE_CO_OWNER, false);
    if (!verification.ok) throw new Error("Pex side effect failed: co-owner role still present after owner promotion.");
  }
}

async function applyDepexSideEffects(member, roleId) {
  if (roleId === ROLE_PARTNER_MANAGER) {
    await member.roles.remove(roleId);
    const verification = await ensureRoleState(member, roleId, false);
    if (!verification.ok) throw new Error("Depex side effect failed: partner manager role still present.");
    member = verification.member;
  }

  if (roleId === ROLE_HELPER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: helper/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_MODERATOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: moderator/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_COORDINATOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: coordinator/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_SUPERVISOR) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: supervisor/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_ADMIN) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }, { roleId: ROLE_HIGH_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: admin/high staff/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_MANAGER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }, { roleId: ROLE_HIGH_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: manager/high staff/staff roles still present.");
    member = verification.member;
  }

  if (roleId === ROLE_CO_OWNER) {
    await member.roles.remove(roleId);
    await member.roles.remove(ROLE_STAFF);
    await member.roles.remove(ROLE_HIGH_STAFF);
    const verification = await ensureMultipleRoleStates(member, [{ roleId, shouldHaveRole: false }, { roleId: ROLE_STAFF, shouldHaveRole: false }, { roleId: ROLE_HIGH_STAFF, shouldHaveRole: false }]);
    if (!verification.ok) throw new Error("Depex side effect failed: co-owner/high staff/staff roles still present.");
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Gestisci lo staff di Vinili & Caffè")
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
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => { });
    const pexDepexChannel = interaction.guild.channels.cache.get(IDs.channels?.pexDepex,);
    const pmChannel = interaction.guild.channels.cache.get(IDs.channels?.partnersChat,);
    const staffChat = interaction.guild.channels.cache.get(IDs.channels?.staffChat,);
    const resolveMember = createMemberResolver(interaction.guild);

    if (sub === "pex") {
      try {
        const targetUser = interaction.options.getUser("user");
        const reason = interaction.options.getString("motivo");
        const roleBefore = interaction.options.getRole("ruolo_precedente");
        const roleAfter = interaction.options.getRole("ruolo_successivo");

        const member = await ensureMember(interaction, targetUser, resolveMember);
        if (!member) return;

        if (!(await ensureNotSelf(interaction, targetUser))) return;

        const staffDoc = await getOrCreateStaffDoc(interaction.guild.id, targetUser.id,);

        if (member.roles.cache.has(roleAfter.id)) {
          return replyError(
            interaction,
            `<:attentionfromvega:1443651874032062505> L'utente ${targetUser} ha già il ruolo che gli vuoi aggiungere.`,
          );
        }

        await member.roles.add(roleAfter.id);
        const baseRoleVerification = await ensureRoleState(member, roleAfter.id, true);
        if (!baseRoleVerification.ok) {
          throw new Error(`Pex failed: role ${roleAfter.id} not applied.`);
        }
        await applyPexSideEffects(
          baseRoleVerification.member,
          roleAfter.id,
          pmChannel,
          staffChat,
          targetUser,
        );

        await replySuccess(interaction);

        await pexDepexChannel.send({
          content: `**<:success:1461731530333229226> PEX** ${targetUser}
<:staff:1443651912179388548> \`${roleBefore.name}\` <a:VC_Arrow:1448672967721615452> \`${roleAfter.name}\`
<:VC_reason:1478517122929004544> __${reason}__`,
        }).catch(() => null);

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

        const member = await ensureMember(interaction, targetUser, resolveMember);
        if (!member) return;

        if (!(await ensureNotSelf(interaction, targetUser))) return;

        if (!member.roles.cache.has(oldRole.id)) {
          return replyError(
            interaction,
            `<:attentionfromvega:1443651874032062505> L'utente ${targetUser} non ha il ruolo che gli vuoi togliere.`,
          );
        }

        await member.roles.remove(oldRole.id);
        const baseRoleVerification = await ensureRoleState(member, oldRole.id, false);
        if (!baseRoleVerification.ok) {
          throw new Error(`Depex failed: role ${oldRole.id} still present.`);
        }
        await applyDepexSideEffects(baseRoleVerification.member, oldRole.id);

        await StaffModel.deleteOne({
          guildId: interaction.guild.id,
          userId: targetUser.id,
        });

        await replySuccess(interaction);

        await pexDepexChannel.send({
          content: `**<:cancel:1461730653677551691> DEPEX** ${targetUser}
<:staff:1443651912179388548> \`${oldRole.name}\` <a:VC_Arrow:1448672967721615452> \`${newRole.name}\`
<:VC_reason:1478517122929004544> __${reason}__`,
        }).catch(() => null);
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
        const warnChannel = interaction.guild.channels.cache.get(IDs.channels?.warnStaff,);

        const staffDoc = await getOrCreateStaffDoc(interaction.guild.id, targetUser.id,);
        if (!staffDoc.idCount) staffDoc.idCount = 0;
        if (!staffDoc.warnCount) staffDoc.warnCount = 0;
        if (!staffDoc.warnReasons) staffDoc.warnReasons = [];

        staffDoc.idCount++;
        staffDoc.warnCount++;
        staffDoc.warnReasons.push(reason);
        await staffDoc.save();

        const warnEmbed = new EmbedBuilder().setAuthor({
          name: `<:success:1461731530333229226> Warn eseguito da ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        })
          .setTitle(`<a:VC_Alert:1448670089670037675> • **__WARN STAFF__**\`#${staffDoc.warnCount}\``,)
          .setThumbnail(targetUser.displayAvatarURL())
          .setDescription(`<:staff:1443651912179388548> <a:VC_Arrow:1448672967721615452> ${targetUser} 
            <:VC_reason:1478517122929004544> __${reason}__ 
            <:VC_id:1478517313618575419> **ID Valutazione:**__\`${staffDoc.idCount}\`__`,)
          .setColor(SUCCESS_COLOR);

        if (warnChannel) {
          await warnChannel.send({
            content: `${targetUser}`,
            embeds: [warnEmbed],
          }).catch(() => null);
        }

        return replySuccess(interaction);
      } catch (err) {
        global.logger.error(err);
        return replyCommandError(interaction);
      }
    }

  },
};