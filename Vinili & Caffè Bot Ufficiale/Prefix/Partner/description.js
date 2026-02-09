const { safeMessageReply } = require('../../Utils/Moderation/reply');

module.exports = {
  name: 'description',
  aliases: ['desc'],

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const descriptionText = [
      '```',
      '_ _',
      '_ _`☕`        𓂃        **[Vinili & Caffè](<https://discord.gg/viniliecaffe>)**      ⟢',
      '_ _     𓎢      **social**       ⊹       **italia** **chill**       ୧',
      '                                       **gaming**',
      '-# @everyone & @here_ _',
      '```'
    ].join('\n');
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const allowedCategoryId = '1442569056795230279';
    const partnerRoleId =
      message.client?.config?.partnerManager ||
      message.client?.config?.partnerManager ||
      '1442568905582317740';

    const partnerRole = message.guild?.roles?.cache?.get(partnerRoleId);
    const parentId = message.channel?.parentId || message.channel?.parent?.id || null;
    const parentChannel = parentId ? message.guild?.channels?.cache?.get(parentId) : null;
    const parentName = String(parentChannel?.name || '').toLowerCase();
    const isBotTicketCategory = parentChannel?.type === 4 && parentName.includes('tickets');
    const isAllowedCategory = Boolean(parentId && (parentId === allowedCategoryId || isBotTicketCategory));

    if (!isAllowedCategory) {
      return safeMessageReply(
        message,
        '<:vegax:1443934876440068179> Questo comando può essere usato **solo nella categoria autorizzata**.'
      );
    }

    if (!partnerRole) {
      return safeMessageReply(
        message,
        '<:vegax:1443934876440068179> Il ruolo **Partner Manager** non esiste nel server.'
      );
    }

    if (!message.member.roles.cache.has(partnerRole.id)) {
      return safeMessageReply(
        message,
        '<:vegax:1443934876440068179> Non hai il permesso per usare questo comando. Solo i **Partner Manager** possono farlo.'
      );
    }

    const target = await resolveTargetUser(message, args[0]);
    if (!target) {
      await safeMessageReply(message, {
        content: descriptionText,
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    const delivered = await target.send(descriptionText).then(() => true).catch(() => false);
    if (!delivered) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Non riesco a inviare DM a ${target}.`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }
    await safeMessageReply(message, {
      content: `<:vegacheckmark:1443666279058772028> Description inviata in DM a ${target}.`,
      allowedMentions: { repliedUser: false }
    });
  }
};

async function resolveTargetUser(message, rawArg) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;
  if (!rawArg) return null;

  const value = String(rawArg).trim();
  const id = value.match(/^<@!?(\d+)>$/)?.[1] || (/^\d{17,20}$/.test(value) ? value : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}
