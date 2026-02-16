const { PermissionsBitField } = require('discord.js');
const appConfig = require('../../config.json');

const SPONSOR_GUILD_IDS = new Set(
  (appConfig.sponsorGuildIds || [
    '1471511676019933354', '1471511928739201047', '1471512183547498579',
    '1471512555762483330', '1471512797140484230', '1471512808448458958'
  ]).map(String)
);

function isSponsorGuild(guildId) {
  return SPONSOR_GUILD_IDS.has(String(guildId || ''));
}

function hasSponsorStaffPerms(member) {
  if (!member) return false;
  return member.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}

const TICKET_BUTTON_IDS = new Set([
  'ticket_partnership', 'ticket_highstaff', 'ticket_supporto', 'ticket_open_desc_modal',
  'claim_ticket', 'unclaim', 'close_ticket', 'close_ticket_motivo'
]);

async function checkButtonPermission(interaction) {
  const customId = String(interaction?.customId || '');
  if (TICKET_BUTTON_IDS.has(customId) && interaction?.member && hasSponsorStaffPerms(interaction.member)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  if (isSponsorGuild(interaction?.guildId)) {
    const staffTicketButtons = new Set(['claim_ticket', 'unclaim', 'close_ticket', 'close_ticket_motivo']);
    if (staffTicketButtons.has(customId)) {
      if (hasSponsorStaffPerms(interaction.member)) {
        return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
      }
      return { allowed: false, reason: 'missing_role', requiredRoles: ['Admin/ManageChannels'], ownerId: null };
    }
  }
  if (!customId) return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
}

async function checkStringSelectPermission(interaction) {
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
