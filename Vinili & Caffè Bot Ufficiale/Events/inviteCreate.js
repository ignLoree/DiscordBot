module.exports = {
  name: "inviteCreate",
  async execute(invite) {
    try {
      const client = invite.client;
      if (!client.inviteCache) client.inviteCache = new Map();
      if (!client.inviteCache.has(invite.guild.id)) {
        client.inviteCache.set(invite.guild.id, new Map());
      }
      client.inviteCache.get(invite.guild.id).set(invite.code, {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
      });
    } catch (error) {
      global.logger.error("[INVITE CREATE] Failed:", error);
    }
  },
};
