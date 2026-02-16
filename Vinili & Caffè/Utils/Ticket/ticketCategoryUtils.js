const { ChannelType } = require('discord.js');

/** Nome della categoria ticket (usato per creazione e riconoscimento). */
const TICKETS_CATEGORY_NAME = '⁰⁰・ 　　　　    　    TICKETS 　　　    　    ・';

/** Suffisso per le categorie overflow (evita # che può dare problemi in Discord). */
const TICKETS_OVERFLOW_SEPARATOR = ' ・ ';

function buildOverflowTicketCategoryName(index) {
    return `${TICKETS_CATEGORY_NAME}${TICKETS_OVERFLOW_SEPARATOR}${index}`;
}

/**
 * Restituisce true se il canale è in una categoria ticket (esatta o overflow creata dal bot).
 * @param {import('discord.js').GuildChannel|import('discord.js').ThreadChannel} channel
 * @returns {boolean}
 */
function isChannelInTicketCategory(channel) {
    if (!channel?.guild?.channels?.cache) return false;
    const cache = channel.guild.channels.cache;
    const first = channel.parent ?? (channel.parentId ? cache.get(channel.parentId) : null);
    if (!first) return false;
    const category = first.type === ChannelType.GuildCategory ? first : (first.parentId ? cache.get(first.parentId) : null);
    if (!category || !category.name) return false;
    const name = category.name;
    if (name === TICKETS_CATEGORY_NAME) return true;
    if (name.startsWith(TICKETS_CATEGORY_NAME + TICKETS_OVERFLOW_SEPARATOR)) return true;
    return false;
}

module.exports = {
    TICKETS_CATEGORY_NAME,
    TICKETS_OVERFLOW_SEPARATOR,
    buildOverflowTicketCategoryName,
    isChannelInTicketCategory
};
