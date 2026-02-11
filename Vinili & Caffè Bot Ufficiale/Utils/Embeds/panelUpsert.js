const toComparableJson = (items = []) => JSON.stringify(
  items.map((item) => (typeof item?.toJSON === 'function' ? item.toJSON() : item))
);

function shouldEditMessage(message, { embeds = [], components = [] }) {
  const currentEmbeds = toComparableJson(message?.embeds || []);
  const nextEmbeds = toComparableJson(embeds);
  if (currentEmbeds !== nextEmbeds) return true;

  const currentComponents = toComparableJson(message?.components || []);
  const nextComponents = toComparableJson(components);
  return currentComponents !== nextComponents;
}

async function upsertPanelMessage(channel, client, payload) {
  const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  const existing = messages?.find((msg) => msg.author?.id === client.user?.id && msg.embeds?.length);
  if (!existing) {
    await channel.send(payload).catch(() => {});
    return;
  }
  if (shouldEditMessage(existing, payload)) {
    await existing.edit(payload).catch(() => {});
  }
}

module.exports = { shouldEditMessage, upsertPanelMessage };
