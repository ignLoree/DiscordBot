const { ChannelType } = require("discord.js");

const TICKETS_CATEGORY_NAME =
  "⁰⁰・ 　　　　    　    TICKETS 　　　    　    ・";
const TICKETS_OVERFLOW_SEPARATOR = " ・ ";

function buildOverflowTicketCategoryName(index) {
  return `${TICKETS_CATEGORY_NAME}${TICKETS_OVERFLOW_SEPARATOR}${index}`;
}

function isChannelInTicketCategory(channel) {
  if (!channel?.guild?.channels?.cache) return false;
  const cache = channel.guild.channels.cache;
  const first =
    channel.parent ? (channel.parentId ? cache.get(channel.parentId) : null);
  if (!first) return false;
  const category =
    first.type === ChannelType.GuildCategory
      ? first
      : first.parentId
        ? cache.get(first.parentId)
        : null;
  if (!category || !category.name) return false;
  const name = category.name;
  if (name === TICKETS_CATEGORY_NAME) return true;
  if (name.startsWith(TICKETS_CATEGORY_NAME + TICKETS_OVERFLOW_SEPARATOR))
    return true;
  return false;
}

module.exports = {
  TICKETS_CATEGORY_NAME,
  TICKETS_OVERFLOW_SEPARATOR,
  buildOverflowTicketCategoryName,
  isChannelInTicketCategory,
};
