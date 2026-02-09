const { safeMessageReply } = require('../../Utils/Moderation/reply');

module.exports = {
  name: 'description',
  aliases: ['desc'],

  async execute(message) {
    await message.channel.sendTyping();

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

    const descriptionText = [
      '```',
      '_ _',
      '_ _`☕`        𓂃        **[Vinili & Caffè](<https://discord.gg/viniliecaffe>)**      ⟢',
      '_ _     𓎢      **social**       ⊹       **italia** **chill**       ୧',
      '                                       **gaming**',
      '-# @everyone & @here_ _',
      '```'
    ].join('\n');

    await safeMessageReply(message, {
      content: descriptionText,
      allowedMentions: { repliedUser: false }
    });
  }
};
