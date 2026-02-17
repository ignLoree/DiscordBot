const { PermissionsBitField } = require('discord.js');

let appConfig = {};
try {
  appConfig = require('../../config.json');
} catch (e) {
  
}

let IDs = {};
try {
  IDs = require('../Config/ids');
} catch (e) {
  
}

const SPONSOR_GUILD_IDS = new Set(
  (appConfig.sponsorGuildIds || IDs.guilds?.sponsorGuildIds || [
    '1471511676019933354', '1471511928739201047', '1471512183547498579',
    '1471512555762483330', '1471512797140484230', '1471512808448458958'
  ]).map(String)
);

function isSponsorGuild(guildId) {
  return SPONSOR_GUILD_IDS.has(String(guildId || ''));
}

const TICKET_BUTTON_IDS = new Set([
  'ticket_open_desc_modal',
  'claim_ticket', 'unclaim', 'close_ticket', 'close_ticket_motivo'
]);

function hasSponsorStaffRole(member, guildId) {
  if (!member || !guildId) return false;
  const staffRoleId = (IDs.roles?.sponsorStaffRoleIds || {})[guildId];
  if (!staffRoleId) return false;
  return member.roles?.cache?.has(staffRoleId) === true;
}

function hasVerificatoRole(member, guildId) {
  if (!member || !guildId) return false;
  const roleId = (IDs.verificatoRoleIds || {})[guildId];
  if (!roleId) return false;
  return member.roles?.cache?.has(roleId) === true;
}

function hasSponsorStaffPerms(member) {
  if (!member) return false;
  const guildId = member.guild?.id;
  if (guildId && hasSponsorStaffRole(member, guildId)) return true;
  return member.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member.permissions?.has(PermissionsBitField.Flags.ManageChannels)
    || member.permissions?.has(PermissionsBitField.Flags.ManageGuild);
}

async function checkButtonPermission(interaction) {
  const customId = String(interaction?.customId || '');
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (!TICKET_BUTTON_IDS.has(customId)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  if (isSponsorGuild(guildId)) {
    if (hasSponsorStaffRole(interaction.member, guildId)) {
      return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
    return { allowed: false, reason: 'missing_role', requiredRoles: ['Staff'], ownerId: null };
  }
  return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
}

async function checkStringSelectPermission(interaction) {
  const customId = String(interaction?.customId || '');
  const guildId = interaction?.guildId || interaction?.guild?.id;
  if (customId !== 'ticket_open_menu') {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  if (isSponsorGuild(guildId)) {
    if (hasVerificatoRole(interaction.member, guildId)) {
      return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
    return { allowed: false, reason: 'missing_role', requiredRoles: ['Verificato'], ownerId: null };
  }
  return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
}

async function checkModalPermission(interaction) {
  return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
}

function buildGlobalPermissionDeniedEmbed(requiredRoleIds = [], entityLabel = 'bottone', customDescription = null) {
  const { EmbedBuilder } = require('discord.js');
  return new EmbedBuilder()
    .setColor('Red')
    .setTitle('<:VC_Lock:1468544444113617063> **Non hai i permessi**')
    .setDescription(customDescription || `Questo ${entityLabel} è riservato.`);
}

module.exports = {
  checkButtonPermission,
  checkStringSelectPermission,
  checkModalPermission,
  buildGlobalPermissionDeniedEmbed,
  isSponsorGuild,
  hasSponsorStaffPerms
};
