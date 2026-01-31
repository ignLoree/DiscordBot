async function sendPassDm(userId, content) {
  const client = global.botClient;
  if (!client) return;
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return;
  await user.send({ content }).catch(() => null);
}
module.exports = { sendPassDm };